import 'dart:convert';

import 'package:drift/drift.dart';

part 'database.g.dart';

/// Local (offline) copy of server data plus rows created on the device.
/// Rows that must be uploaded carry `dirty = true`. Ids are client-generated UUIDs,
/// so uploads are idempotent and safe to retry.

class Customers extends Table {
  TextColumn get id => text()();
  TextColumn get type => text()();
  TextColumn get name => text()();
  TextColumn get specialty => text().nullable()();
  TextColumn get segment => text().withDefault(const Constant('Unclassified'))();
  TextColumn get territoryId => text().nullable()();
  TextColumn get parentCustomerId => text().nullable()();
  TextColumn get phone => text().nullable()();
  TextColumn get email => text().nullable()();
  TextColumn get address => text().nullable()();
  TextColumn get city => text().nullable()();
  RealColumn get latitude => real().nullable()();
  RealColumn get longitude => real().nullable()();
  IntColumn get targetVisitsPerMonth => integer().withDefault(const Constant(0))();

  @override
  Set<Column> get primaryKey => {id};
}

class Products extends Table {
  TextColumn get id => text()();
  TextColumn get name => text()();
  TextColumn get code => text().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

class PlannedVisits extends Table {
  TextColumn get id => text()();
  TextColumn get customerId => text()();
  TextColumn get plannedDate => text()(); // yyyy-MM-dd
  IntColumn get sequence => integer().withDefault(const Constant(0))();
  TextColumn get status => text().withDefault(const Constant('Planned'))();
  TextColumn get objective => text().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

class Visits extends Table {
  TextColumn get id => text()();
  TextColumn get customerId => text()();
  TextColumn get plannedVisitId => text().nullable()();
  TextColumn get checkInAt => text()(); // ISO-8601 UTC
  RealColumn get checkInLat => real().nullable()();
  RealColumn get checkInLng => real().nullable()();
  RealColumn get checkInAccuracyM => real().nullable()();
  TextColumn get checkOutAt => text().nullable()();
  RealColumn get checkOutLat => real().nullable()();
  RealColumn get checkOutLng => real().nullable()();
  BoolColumn get dirty => boolean().withDefault(const Constant(true))();

  @override
  Set<Column> get primaryKey => {id};
}

class CallReports extends Table {
  TextColumn get id => text()();
  TextColumn get visitId => text()();
  TextColumn get notes => text().nullable()();
  TextColumn get outcome => text().nullable()();
  TextColumn get nextStep => text().nullable()();
  TextColumn get voiceNoteUrl => text().nullable()();
  TextColumn get productsJson => text().withDefault(const Constant('[]'))(); // [{productId, feedback}]
  BoolColumn get dirty => boolean().withDefault(const Constant(true))();

  @override
  Set<Column> get primaryKey => {id};
}

class FollowUpTasks extends Table {
  TextColumn get id => text()();
  TextColumn get customerId => text().nullable()();
  TextColumn get callReportId => text().nullable()();
  TextColumn get title => text()();
  TextColumn get dueDate => text().nullable()(); // yyyy-MM-dd
  TextColumn get status => text().withDefault(const Constant('Open'))();
  BoolColumn get dirty => boolean().withDefault(const Constant(false))();

  @override
  Set<Column> get primaryKey => {id};
}

/// Pending GPS pings; deleted once uploaded.
class GpsPings extends Table {
  TextColumn get id => text()();
  TextColumn get recordedAt => text()();
  RealColumn get latitude => real()();
  RealColumn get longitude => real()();
  RealColumn get accuracyM => real().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

class SyncState extends Table {
  TextColumn get key => text()();
  TextColumn get value => text()();

  @override
  Set<Column> get primaryKey => {key};
}

/// A planned visit joined with its customer and (if started) the visit done for it.
class PlanItem {
  PlanItem(this.planned, this.customer, this.visit);
  final PlannedVisit planned;
  final Customer customer;
  final Visit? visit;
  bool get done => visit?.checkOutAt != null;
}

@DriftDatabase(tables: [Customers, Products, PlannedVisits, Visits, CallReports, FollowUpTasks, GpsPings, SyncState])
class AppDatabase extends _$AppDatabase {
  AppDatabase(super.e);

  @override
  int get schemaVersion => 1;

  // ---- reads ----

  Stream<List<Customer>> watchCustomers(String query) {
    final q = select(customers)..orderBy([(c) => OrderingTerm.asc(c.name)]);
    if (query.trim().isNotEmpty) q.where((c) => c.name.like('%${query.trim()}%') | c.city.like('%${query.trim()}%'));
    return q.watch();
  }

  Stream<List<PlanItem>> watchPlan(String date) {
    final q = select(plannedVisits).join([
      innerJoin(customers, customers.id.equalsExp(plannedVisits.customerId)),
      leftOuterJoin(visits, visits.plannedVisitId.equalsExp(plannedVisits.id)),
    ])
      ..where(plannedVisits.plannedDate.equals(date) & plannedVisits.status.isNotValue('Cancelled'))
      ..orderBy([OrderingTerm.asc(plannedVisits.sequence)]);
    return q
        .watch()
        .map((rows) => rows.map((r) => PlanItem(r.readTable(plannedVisits), r.readTable(customers), r.readTableOrNull(visits))).toList());
  }

  Stream<Visit?> watchOpenVisit() =>
      (select(visits)..where((v) => v.checkOutAt.isNull())..limit(1)).watchSingleOrNull();

  Future<Visit?> openVisit() => (select(visits)..where((v) => v.checkOutAt.isNull())..limit(1)).getSingleOrNull();

  Future<Customer?> customer(String id) => (select(customers)..where((c) => c.id.equals(id))).getSingleOrNull();

  Future<CallReport?> reportForVisit(String visitId) =>
      (select(callReports)..where((r) => r.visitId.equals(visitId))).getSingleOrNull();

  Stream<List<Product>> watchProducts() => (select(products)..orderBy([(p) => OrderingTerm.asc(p.name)])).watch();

  Stream<List<FollowUpTask>> watchOpenTasks() => (select(followUpTasks)
        ..where((t) => t.status.equals('Open'))
        ..orderBy([(t) => OrderingTerm.asc(t.dueDate)]))
      .watch();

  /// Number of local rows waiting to be uploaded.
  Stream<int> watchPendingCount() => customSelect(
        'SELECT (SELECT COUNT(*) FROM visits WHERE dirty = 1) + (SELECT COUNT(*) FROM call_reports WHERE dirty = 1) '
        '+ (SELECT COUNT(*) FROM follow_up_tasks WHERE dirty = 1) + (SELECT COUNT(*) FROM gps_pings) AS n',
        readsFrom: {visits, callReports, followUpTasks, gpsPings},
      ).watchSingle().map((r) => r.read<int>('n'));

  // ---- sync state ----

  Future<String?> getState(String key) async =>
      (await (select(syncState)..where((s) => s.key.equals(key))).getSingleOrNull())?.value;

  Future<void> setState(String key, String value) =>
      into(syncState).insertOnConflictUpdate(SyncStateData(key: key, value: value));

  // ---- applying server data (pull) ----

  Future<void> applyPull(Map<String, dynamic> body) => transaction(() async {
        List list(String k) => (body[k] as List?) ?? const [];
        String? s(Map m, String k) => m[k] as String?;
        double? d(Map m, String k) => (m[k] as num?)?.toDouble();

        for (final m in list('customers').cast<Map>()) {
          final id = m['id'] as String;
          if (m['deletedAt'] != null) {
            await (delete(customers)..where((c) => c.id.equals(id))).go();
            continue;
          }
          await into(customers).insertOnConflictUpdate(CustomersCompanion.insert(
            id: id,
            type: m['type'].toString(),
            name: m['name'] as String,
            specialty: Value(s(m, 'specialty')),
            segment: Value(m['segment']?.toString() ?? 'Unclassified'),
            territoryId: Value(s(m, 'territoryId')),
            parentCustomerId: Value(s(m, 'parentCustomerId')),
            phone: Value(s(m, 'phone')),
            email: Value(s(m, 'email')),
            address: Value(s(m, 'address')),
            city: Value(s(m, 'city')),
            latitude: Value(d(m, 'latitude')),
            longitude: Value(d(m, 'longitude')),
            targetVisitsPerMonth: Value((m['targetVisitsPerMonth'] as num?)?.toInt() ?? 0),
          ));
        }
        for (final m in list('products').cast<Map>()) {
          final id = m['id'] as String;
          if (m['deletedAt'] != null) {
            await (delete(products)..where((p) => p.id.equals(id))).go();
            continue;
          }
          await into(products).insertOnConflictUpdate(
              ProductsCompanion.insert(id: id, name: m['name'] as String, code: Value(s(m, 'code'))));
        }
        for (final m in list('plannedVisits').cast<Map>()) {
          final id = m['id'] as String;
          if (m['deletedAt'] != null) {
            await (delete(plannedVisits)..where((p) => p.id.equals(id))).go();
            continue;
          }
          await into(plannedVisits).insertOnConflictUpdate(PlannedVisitsCompanion.insert(
            id: id,
            customerId: m['customerId'] as String,
            plannedDate: m['plannedDate'] as String,
            sequence: Value((m['sequence'] as num?)?.toInt() ?? 0),
            status: Value(m['status']?.toString() ?? 'Planned'),
            objective: Value(s(m, 'objective')),
          ));
        }
        for (final m in list('tasks').cast<Map>()) {
          final id = m['id'] as String;
          final local = await (select(followUpTasks)..where((t) => t.id.equals(id))).getSingleOrNull();
          if (local != null && local.dirty) continue; // never overwrite unsent local edits
          if (m['deletedAt'] != null) {
            await (delete(followUpTasks)..where((t) => t.id.equals(id))).go();
            continue;
          }
          await into(followUpTasks).insertOnConflictUpdate(FollowUpTasksCompanion.insert(
            id: id,
            title: m['title'] as String,
            customerId: Value(s(m, 'customerId')),
            callReportId: Value(s(m, 'callReportId')),
            dueDate: Value(s(m, 'dueDate')),
            status: Value(m['status']?.toString() ?? 'Open'),
          ));
        }
      });

  static List<Map<String, dynamic>> decodeProducts(String json) =>
      (jsonDecode(json) as List).cast<Map<String, dynamic>>();
}
