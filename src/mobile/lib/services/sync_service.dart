import 'dart:convert';

import 'package:drift/drift.dart';

import '../data/database.dart';
import 'api_client.dart';

class SyncResult {
  const SyncResult({this.pushed = 0, this.pulled = false, this.error, this.authFailed = false});
  final int pushed;
  final bool pulled;
  final String? error;
  final bool authFailed;
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
      await _pull();
      return SyncResult(pushed: pushed, pulled: true);
    } on ApiException catch (e) {
      return SyncResult(error: e.toString(), authFailed: e.isAuth);
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

  Future<void> _pull() async {
    final since = int.tryParse(await _db.getState(_cursorKey) ?? '') ?? 0;
    final body = await _api.pull(since);
    await _db.applyPull(body);
    // Server clock cursor; only advance after the data was stored.
    await _db.setState(_cursorKey, '${body['cursor']}');
  }
}
