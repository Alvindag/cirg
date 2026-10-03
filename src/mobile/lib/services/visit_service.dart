import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../data/database.dart';
import 'location_service.dart';

class VisitInProgressException implements Exception {
  @override
  String toString() => 'Finish the current visit before starting another.';
}

/// All field actions write to the local database only, so they work with no connectivity.
/// The sync service uploads them later.
class VisitService {
  VisitService(this._db, this._location, {DateTime Function()? now, Uuid? uuid})
      : _now = now ?? DateTime.now,
        _uuid = uuid ?? const Uuid();

  final AppDatabase _db;
  final LocationProvider _location;
  final DateTime Function() _now;
  final Uuid _uuid;

  String _ts() => _now().toUtc().toIso8601String();

  Future<Visit> checkIn({required String customerId, String? plannedVisitId}) async {
    if (await _db.openVisit() != null) throw VisitInProgressException();
    final fix = await _location.current();
    final id = _uuid.v4();
    await _db.into(_db.visits).insert(VisitsCompanion.insert(
          id: id,
          customerId: customerId,
          plannedVisitId: Value(plannedVisitId),
          checkInAt: _ts(),
          checkInLat: Value(fix?.latitude),
          checkInLng: Value(fix?.longitude),
          checkInAccuracyM: Value(fix?.accuracyM),
        ));
    return (_db.select(_db.visits)..where((v) => v.id.equals(id))).getSingle();
  }

  Future<void> checkOut(String visitId) async {
    final fix = await _location.current();
    await (_db.update(_db.visits)..where((v) => v.id.equals(visitId))).write(VisitsCompanion(
      checkOutAt: Value(_ts()),
      checkOutLat: Value(fix?.latitude),
      checkOutLng: Value(fix?.longitude),
      dirty: const Value(true),
    ));
  }

  /// One report per visit; saving again edits it.
  Future<String> saveCallReport({
    required String visitId,
    String? notes,
    String? outcome,
    String? nextStep,
    String? voiceNoteUrl,
    List<String> productIds = const [],
    Map<String, String> productFeedback = const {},
  }) async {
    final existing = await _db.reportForVisit(visitId);
    final id = existing?.id ?? _uuid.v4();
    final products = jsonEncode([
      for (final p in productIds) {'productId': p, 'feedback': productFeedback[p]},
    ]);
    await _db.into(_db.callReports).insertOnConflictUpdate(CallReportsCompanion.insert(
          id: id,
          visitId: visitId,
          notes: Value(notes),
          outcome: Value(outcome),
          nextStep: Value(nextStep),
          voiceNoteUrl: Value(voiceNoteUrl),
          productsJson: Value(products),
          dirty: const Value(true),
        ));
    return id;
  }

  Future<void> addTask({required String title, String? customerId, String? callReportId, DateTime? due}) =>
      _db.into(_db.followUpTasks).insert(FollowUpTasksCompanion.insert(
            id: _uuid.v4(),
            title: title,
            customerId: Value(customerId),
            callReportId: Value(callReportId),
            dueDate: Value(due == null ? null : _date(due)),
            dirty: const Value(true),
          ));

  Future<void> completeTask(String id) => (_db.update(_db.followUpTasks)..where((t) => t.id.equals(id)))
      .write(const FollowUpTasksCompanion(status: Value('Done'), dirty: Value(true)));

  /// Queue a location sample (call periodically while a rep is on duty and has consented).
  Future<void> recordPing() async {
    final fix = await _location.current();
    if (fix == null) return;
    await _db.into(_db.gpsPings).insert(GpsPingsCompanion.insert(
          id: _uuid.v4(),
          recordedAt: _ts(),
          latitude: fix.latitude,
          longitude: fix.longitude,
          accuracyM: Value(fix.accuracyM),
        ));
  }

  static String _date(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
}
