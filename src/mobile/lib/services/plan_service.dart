import 'package:drift/drift.dart';
import 'package:intl/intl.dart';
import 'package:uuid/uuid.dart';

import '../data/database.dart';
import 'customer_service.dart' show ValidationException;

/// Planning visits on the device. Works offline; the next sync uploads the plan (after any new customer it refers to).
class PlanService {
  PlanService(this._db, {DateTime Function()? now, Uuid? uuid})
      : _now = now ?? DateTime.now,
        _uuid = uuid ?? const Uuid();

  final AppDatabase _db;
  final DateTime Function() _now;
  final Uuid _uuid;

  static String dayString(DateTime d) => DateFormat('yyyy-MM-dd').format(d);

  Future<String> plan({required String customerId, required DateTime date, String? objective}) async {
    final today = DateTime(_now().year, _now().month, _now().day);
    final day = DateTime(date.year, date.month, date.day);
    if (day.isBefore(today)) throw ValidationException('Pick today or a later day.');
    if (day.isAfter(today.add(const Duration(days: 365)))) throw ValidationException('That is too far ahead (one year at most).');
    if (await _db.customer(customerId) == null) throw ValidationException('This customer is no longer on the device.');

    final d = dayString(day);
    final sameDay = await (_db.select(_db.plannedVisits)..where((p) => p.plannedDate.equals(d) & p.status.isNotValue('Cancelled'))).get();
    if (sameDay.any((p) => p.customerId == customerId)) throw ValidationException('This customer is already planned for that day.');

    final id = _uuid.v4();
    final text = objective?.trim();
    await _db.into(_db.plannedVisits).insert(PlannedVisitsCompanion.insert(
          id: id,
          customerId: customerId,
          plannedDate: d,
          sequence: Value(sameDay.fold<int>(0, (m, p) => p.sequence > m ? p.sequence : m) + 1),
          objective: Value(text == null || text.isEmpty ? null : text),
          dirty: const Value(true),
        ));
    return id;
  }

  /// Only a visit that has not been started can be cancelled.
  Future<void> cancel(String plannedVisitId) async {
    final visit = await (_db.select(_db.visits)..where((v) => v.plannedVisitId.equals(plannedVisitId))).getSingleOrNull();
    if (visit != null) throw ValidationException('This visit has already been started.');
    await (_db.update(_db.plannedVisits)..where((p) => p.id.equals(plannedVisitId) & p.status.equals('Planned')))
        .write(const PlannedVisitsCompanion(status: Value('Cancelled'), dirty: Value(true)));
  }

  /// Upcoming plans for the customer's detail screen.
  Stream<List<PlannedVisit>> watchUpcoming(String customerId) {
    final today = dayString(_now());
    return (_db.select(_db.plannedVisits)
          ..where((p) => p.customerId.equals(customerId) & p.plannedDate.isBiggerOrEqualValue(today) & p.status.isNotValue('Cancelled'))
          ..orderBy([(p) => OrderingTerm.asc(p.plannedDate)]))
        .watch();
  }
}
