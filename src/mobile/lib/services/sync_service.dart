import 'dart:convert';
import 'dart:io';

import 'package:drift/drift.dart';

import '../data/database.dart';
import 'api_client.dart';

class SyncResult {
  const SyncResult({this.pushed = 0, this.pulled = false, this.error, this.authFailed = false, this.forbidden = false});
  final int pushed;
  final bool pulled;
  final String? error;
  final bool authFailed;

  /// 403: signed in with Entra, but this account is not a user of the system (or was deactivated).
  final bool forbidden;
  bool get ok => error == null;
}

/// Push local changes, then pull server changes.
///
/// Push is idempotent (client-generated ids), so a retry after a dropped connection can never duplicate data.
/// Dirty flags are cleared only after the server confirms the whole batch, so nothing is lost on failure.
/// Pull is a delta since the last cursor; deletions arrive as tombstones.
class SyncService {
  SyncService(this._db, this._api);

  final AppDatabase _db;
  final ApiClient _api;
  bool _running = false;

  static const _cursorKey = 'pull_cursor';

  Future<SyncResult> sync() async {
    if (_running) return const SyncResult(error: 'Sync already running.');
    _running = true;
    try {
      final pushed = await _push();
      await _uploadAttachments(); // after the push, so the visits they belong to exist on the server
      await _pull();
      return SyncResult(pushed: pushed, pulled: true);
    } on ApiException catch (e) {
      return SyncResult(error: e.toString(), authFailed: e.isAuth, forbidden: e.statusCode == 403);
    } catch (e) {
      return SyncResult(error: e.toString()); // offline, timeout, bad payload: try again later
    } finally {
      _running = false;
    }
  }

  Future<int> _push() async {
    final visits = await (_db.select(_db.visits)..where((v) => v.dirty.equals(true))).get();
    final reports = await (_db.select(_db.callReports)..where((r) => r.dirty.equals(true))).get();
    final tasks = await (_db.select(_db.followUpTasks)..where((t) => t.dirty.equals(true))).get();
    final pings = await _db.select(_db.gpsPings).get();
    final count = visits.length + reports.length + tasks.length + pings.length;
    if (count == 0) return 0;

    final payload = <String, dynamic>{
      'checkIns': [
        for (final v in visits)
          {
            'visitId': v.id,
            'checkIn': {
              'customerId': v.customerId,
              'plannedVisitId': v.plannedVisitId,
              'at': v.checkInAt,
              'latitude': v.checkInLat,
              'longitude': v.checkInLng,
              'accuracyM': v.checkInAccuracyM,
            },
            'checkOut': v.checkOutAt == null
                ? null
                : {'at': v.checkOutAt, 'latitude': v.checkOutLat, 'longitude': v.checkOutLng},
          },
      ],
      'callReports': [
        for (final r in reports)
          {
            'report': {
              'id': r.id,
              'visitId': r.visitId,
              'notes': r.notes,
              'outcome': r.outcome,
              'nextStep': r.nextStep,
              'voiceNoteUrl': r.voiceNoteUrl,
              'products': AppDatabase.decodeProducts(r.productsJson),
            },
          },
      ],
      'tasks': [
        for (final t in tasks)
          {
            'id': t.id,
            'customerId': t.customerId,
            'callReportId': t.callReportId,
            'title': t.title,
            'dueDate': t.dueDate,
            'status': t.status,
          },
      ],
      'gpsPings': [
        for (final p in pings)
          {'id': p.id, 'recordedAt': p.recordedAt, 'latitude': p.latitude, 'longitude': p.longitude, 'accuracyM': p.accuracyM},
      ],
    };

    final res = await _api.push(payload);
    if (res['ok'] != true) throw ApiException(422, 'Server rejected part of the batch: ${jsonEncode(res['errors'])}');

    await _db.transaction(() async {
      for (final v in visits) {
        // Only clear if the row was not edited while the request was in flight (e.g. checked out meanwhile).
        await (_db.update(_db.visits)..where((x) => x.id.equals(v.id) & x.checkOutAt.equalsNullable(v.checkOutAt)))
            .write(const VisitsCompanion(dirty: Value(false)));
      }
      for (final r in reports) {
        await (_db.update(_db.callReports)
              ..where((x) => x.id.equals(r.id) & x.notes.equalsNullable(r.notes) & x.productsJson.equals(r.productsJson)))
            .write(const CallReportsCompanion(dirty: Value(false)));
      }
      for (final t in tasks) {
        await (_db.update(_db.followUpTasks)..where((x) => x.id.equals(t.id) & x.status.equals(t.status)))
            .write(const FollowUpTasksCompanion(dirty: Value(false)));
      }
      await (_db.delete(_db.gpsPings)..where((p) => p.id.isIn(pings.map((p) => p.id)))).go();
    });
    return count;
  }

  static const _maxAttempts = 5;

  /// Uploads captured media one file at a time. Permanent rejections mark the item failed (shown to the user) so one bad file never
  /// blocks the queue; temporary problems (offline, 5xx, visit not on the server yet) leave it pending for the next sync.
  Future<void> _uploadAttachments() async {
    for (final a in await _db.pendingAttachments()) {
      final file = File(a.localPath);
      if (a.localPath.isEmpty || !await file.exists()) {
        await _mark(a.id, 'failed', 'The file is missing from this device.');
        continue;
      }
      final query = {
        'kind': a.kind,
        'visitId': a.visitId,
        'capturedAt': a.capturedAt,
        if (a.fileName != null) 'fileName': a.fileName!,
        if (a.signerName != null) 'signerName': a.signerName!,
        if (a.meaning != null) 'meaning': a.meaning!,
      };
      final r = await _api.putBytes('/attachments/${a.id}', await file.readAsBytes(),
          contentType: a.contentType, sha256: a.sha256, query: query);
      final code = r.statusCode;
      if (code == 200 || code == 201) {
        await (_db.update(_db.attachments)..where((x) => x.id.equals(a.id))).write(AttachmentsCompanion(
            uploadStatus: const Value('uploaded'), uploadError: const Value(null), uploadedAt: Value(DateTime.now().toUtc().toIso8601String())));
      } else if (code == 409 && r.body.contains('Visit not found')) {
        continue; // visit not on the server yet; try again next sync
      } else if (code == 400 || code == 403 || code == 409 || code == 413 || code == 415) {
        await _mark(a.id, 'failed', r.body.isEmpty ? 'Rejected by the server ($code).' : r.body);
      } else {
        // 5xx and anything unexpected: transient, but give up on a file that keeps failing
        final attempts = a.attempts + 1;
        await (_db.update(_db.attachments)..where((x) => x.id.equals(a.id))).write(AttachmentsCompanion(
            attempts: Value(attempts),
            uploadStatus: Value(attempts >= _maxAttempts ? 'failed' : 'pending'),
            uploadError: Value('Server error ($code).')));
      }
    }
  }

  Future<void> _mark(String id, String status, String error) => (_db.update(_db.attachments)..where((x) => x.id.equals(id)))
      .write(AttachmentsCompanion(uploadStatus: Value(status), uploadError: Value(error)));

  Future<void> _pull() async {
    final since = int.tryParse(await _db.getState(_cursorKey) ?? '') ?? 0;
    final body = await _api.pull(since);
    await _db.applyPull(body);
    // Server clock cursor; only advance after the data was stored.
    await _db.setState(_cursorKey, '${body['cursor']}');
  }
}
