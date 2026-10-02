import 'dart:convert';
import 'dart:io';

import 'package:drift/drift.dart';

import '../data/database.dart';
import 'api_client.dart';
import 'sync_explain.dart';

class SyncResult {
  const SyncResult({this.pushed = 0, this.pulled = false, this.error, this.reason, this.authFailed = false, this.forbidden = false, this.wiped = false});
  final int pushed;
  final bool pulled;

  /// An administrator asked for this device to be cleared (lost phone); the local data is gone and the person must sign in again.
  final bool wiped;
  final String? error;

  /// The same failure in words a person can act on.
  final String? reason;
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
      final wiped = await _pull();
      return SyncResult(pushed: pushed, pulled: !wiped, wiped: wiped);
    } on ApiException catch (e) {
      return SyncResult(error: e.toString(), reason: explainSyncFailure(e, _api.baseUrl()), authFailed: e.isAuth, forbidden: e.statusCode == 403);
    } catch (e) {
      return SyncResult(error: e.toString(), reason: explainSyncFailure(e, _api.baseUrl())); // offline, timeout, bad payload: try again later
    } finally {
      _running = false;
    }
  }

  Future<int> _push() async {
    final visits = await (_db.select(_db.visits)..where((v) => v.dirty.equals(true))).get();
    final reports = await (_db.select(_db.callReports)..where((r) => r.dirty.equals(true))).get();
    final tasks = await (_db.select(_db.followUpTasks)..where((t) => t.dirty.equals(true))).get();
    final pings = await _db.select(_db.gpsPings).get();
    final distributions = await (_db.select(_db.sampleDistributions)..where((d) => d.status.equals('pending'))).get();
    final requests = await (_db.select(_db.sampleRequests)..where((r) => r.dirty.equals(true))).get();
    final customers = await (_db.select(_db.customers)..where((c) => c.dirty.equals(true))).get();
    final plans = await (_db.select(_db.plannedVisits)..where((p) => p.dirty.equals(true))).get();
    final readNotices = await (_db.select(_db.appNotifications)..where((n) => n.readLocally.equals(true))).get();
    final count = visits.length + reports.length + tasks.length + pings.length + distributions.length + requests.length + customers.length + plans.length;
    if (count == 0 && readNotices.isEmpty) return 0;

    final payload = <String, dynamic>{
      // Things other items refer to are listed first; the server applies them in that order.
      'customers': [
        for (final c in customers)
          {
            'id': c.id, 'type': c.type, 'name': c.name, 'specialty': c.specialty, 'segment': c.segment, 'territoryId': c.territoryId,
            'parentCustomerId': c.parentCustomerId, 'phone': c.phone, 'email': c.email, 'address': c.address, 'city': c.city,
            'latitude': c.latitude, 'longitude': c.longitude, 'targetVisitsPerMonth': c.targetVisitsPerMonth,
          },
      ],
      'plannedVisits': [
        for (final p in plans)
          {'id': p.id, 'customerId': p.customerId, 'plannedDate': p.plannedDate, 'sequence': p.sequence, 'objective': p.objective, 'cancelled': p.status == 'Cancelled'},
      ],
      'notificationReads': [for (final n in readNotices) n.id],
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
      'sampleRequests': [
        for (final r in requests) {'id': r.id, 'productId': r.productId, 'quantity': r.quantity, 'notes': r.notes},
      ],
      'sampleDistributions': [
        for (final d in distributions)
          {
            'id': d.id,
            'visitId': d.visitId,
            'customerId': d.customerId,
            'productId': d.productId,
            'batchId': d.batchId,
            'quantity': d.quantity,
            'distributedAt': d.distributedAt,
            'signatureAttachmentId': d.signatureAttachmentId,
            'notes': d.notes,
          },
      ],
      'gpsPings': [
        for (final p in pings)
          {'id': p.id, 'recordedAt': p.recordedAt, 'latitude': p.latitude, 'longitude': p.longitude, 'accuracyM': p.accuracyM},
      ],
    };

    final res = await _api.push(payload);
    // Newer servers answer item by item. An older one only says whether the whole batch was fine.
    final perItem = res.containsKey('checkIns');
    if (res['ok'] != true && !perItem) throw ApiException(422, 'Server rejected part of the batch: ${jsonEncode(res['errors'])}');
    Map<String, Map> results(String key) =>
        {for (final r in (res[key] as List? ?? const []).cast<Map>()) r['id'] as String: r};
    final customerResults = results('customers');
    final planResults = results('plannedVisits');
    final visitResults = results('checkIns');
    final reportResults = results('callReports');
    final taskResults = results('tasks');
    /// True when the server took the item (or, for an old server, took the batch); false when it refused it for good.
    /// Null when the answer has no entry for it, in which case the item stays queued.
    bool? taken(Map<String, Map> byId, String id) {
      final r = byId[id];
      if (r == null) return perItem ? null : true;
      return r['status'] != 'rejected';
    }
    String why(Map<String, Map> byId, String id) => (byId[id]?['reason'] as String?) ?? 'The server refused it.';

    await _db.transaction(() async {
      for (final c in customers) {
        final ok = taken(customerResults, c.id);
        if (ok == null) continue;
        await (_db.update(_db.customers)..where((x) => x.id.equals(c.id) & x.name.equals(c.name) & x.city.equalsNullable(c.city)))
            .write(const CustomersCompanion(dirty: Value(false)));
        if (!ok) await _db.recordProblem(c.id, 'customer', c.name, why(customerResults, c.id));
      }
      for (final p in plans) {
        final ok = taken(planResults, p.id);
        if (ok == null) continue;
        await (_db.update(_db.plannedVisits)..where((x) => x.id.equals(p.id) & x.status.equals(p.status))).write(const PlannedVisitsCompanion(dirty: Value(false)));
        if (!ok) {
          final customer = await _db.customer(p.customerId);
          await _db.recordProblem(p.id, 'plan', 'Visit to ${customer?.name ?? 'a customer'} on ${p.plannedDate}', why(planResults, p.id));
        }
      }
      for (final v in visits) {
        final ok = taken(visitResults, v.id);
        if (ok == null) continue;
        // Only clear if the row was not edited while the request was in flight (e.g. checked out meanwhile).
        await (_db.update(_db.visits)..where((x) => x.id.equals(v.id) & x.checkOutAt.equalsNullable(v.checkOutAt)))
            .write(const VisitsCompanion(dirty: Value(false)));
        if (!ok) {
          final customer = await _db.customer(v.customerId);
          await _db.recordProblem(v.id, 'visit', 'Visit to ${customer?.name ?? 'a customer'} on ${v.checkInAt.substring(0, 10)}', why(visitResults, v.id));
        }
      }
      for (final r in reports) {
        final ok = taken(reportResults, r.id);
        if (ok == null) continue;
        await (_db.update(_db.callReports)
              ..where((x) => x.id.equals(r.id) & x.notes.equalsNullable(r.notes) & x.productsJson.equals(r.productsJson)))
            .write(const CallReportsCompanion(dirty: Value(false)));
        if (!ok) await _db.recordProblem(r.id, 'report', 'Call report${r.outcome == null ? '' : ' (${r.outcome})'}', why(reportResults, r.id));
      }
      for (final t in tasks) {
        final ok = taken(taskResults, t.id);
        if (ok == null) continue;
        await (_db.update(_db.followUpTasks)..where((x) => x.id.equals(t.id) & x.status.equals(t.status)))
            .write(const FollowUpTasksCompanion(dirty: Value(false)));
        if (!ok) await _db.recordProblem(t.id, 'task', t.title, why(taskResults, t.id));
      }
      // The server knows these notices are read now; they will not come back in the next pull.
      await (_db.delete(_db.appNotifications)..where((n) => n.id.isIn(readNotices.map((n) => n.id)))).go();
      await (_db.delete(_db.gpsPings)..where((p) => p.id.isIn(pings.map((p) => p.id)))).go();

      // Samples are confirmed or refused line by line, so one rejected line never blocks the others.
      final distResults = results('sampleDistributions');
      for (final d in distributions) {
        final r = distResults[d.id];
        if (r == null) continue; // an older server that does not know samples: keep waiting
        final status = r['status'] as String?;
        if (status == 'accepted' || status == 'duplicate') {
          await (_db.update(_db.sampleDistributions)..where((x) => x.id.equals(d.id))).write(const SampleDistributionsCompanion(status: Value('accepted')));
          // Reflect the stock now; the next pull replaces it with the server's figure.
          if (status == 'accepted') {
            await _db.customStatement('UPDATE sample_stock SET quantity = MAX(quantity - ?, 0) WHERE batch_id = ?', [d.quantity, d.batchId]);
          }
        } else {
          await (_db.update(_db.sampleDistributions)..where((x) => x.id.equals(d.id)))
              .write(SampleDistributionsCompanion(status: const Value('rejected'), rejectReason: Value(r['reason'] as String?)));
        }
      }
      final reqResults = results('sampleRequests');
      for (final q in requests) {
        final r = reqResults[q.id];
        if (r == null) continue;
        final rejected = r['status'] == 'rejected';
        await (_db.update(_db.sampleRequests)..where((x) => x.id.equals(q.id))).write(SampleRequestsCompanion(
          dirty: const Value(false),
          status: rejected ? const Value('Rejected') : const Value.absent(),
          decisionNote: rejected ? Value(r['reason'] as String?) : const Value.absent(),
        ));
      }
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

  /// Returns true when the server asked for this device to be wiped (and it was).
  Future<bool> _pull() async {
    final since = int.tryParse(await _db.getState(_cursorKey) ?? '') ?? 0;
    final body = await _api.pull(since);
    if (body['wipe'] == true) {
      // Everything this person had not uploaded was pushed first. Now clear the phone and say so.
      await _db.wipe();
      await _api.confirmWiped();
      return true;
    }
    await _db.applyPull(body);
    // Server clock cursor; only advance after the data was stored.
    await _db.setState(_cursorKey, '${body['cursor']}');
    return false;
  }
}
