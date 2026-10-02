import 'dart:convert';
import 'dart:io';

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
  /// Created or edited on this device and not yet uploaded.
  BoolColumn get dirty => boolean().withDefault(const Constant(false))();

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
  /// Planned or cancelled on this device and not yet uploaded.
  BoolColumn get dirty => boolean().withDefault(const Constant(false))();

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

/// Photos, voice notes and signatures captured on a visit. The file is stored on the device until it is uploaded.
class Attachments extends Table {
  TextColumn get id => text()();
  TextColumn get visitId => text()();
  TextColumn get kind => text()(); // Photo | VoiceNote | Signature
  TextColumn get localPath => text()(); // empty once the local copy was purged after upload
  TextColumn get contentType => text()();
  IntColumn get sizeBytes => integer()();
  TextColumn get sha256 => text()();
  TextColumn get capturedAt => text()();
  TextColumn get fileName => text().nullable()();
  TextColumn get signerName => text().nullable()();
  TextColumn get meaning => text().nullable()();
  IntColumn get durationMs => integer().nullable()();
  TextColumn get uploadStatus => text().withDefault(const Constant('pending'))(); // pending | uploaded | failed
  TextColumn get uploadError => text().nullable()();
  IntColumn get attempts => integer().withDefault(const Constant(0))();
  TextColumn get uploadedAt => text().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

/// What this rep carries, as last reported by the server (batch, expiry and quantity).
class SampleStock extends Table {
  TextColumn get batchId => text()();
  TextColumn get productId => text()();
  TextColumn get batchNumber => text()();
  TextColumn get expiryDate => text()(); // yyyy-MM-dd
  TextColumn get status => text().withDefault(const Constant('Active'))(); // Active | Quarantined | Recalled
  IntColumn get quantity => integer()();

  @override
  Set<Column> get primaryKey => {batchId};
}

/// Samples handed to a customer. `status` is pending until the server confirms (accepted) or refuses (rejected).
class SampleDistributions extends Table {
  TextColumn get id => text()();
  TextColumn get visitId => text().nullable()();
  TextColumn get customerId => text()();
  TextColumn get productId => text()();
  TextColumn get batchId => text()();
  IntColumn get quantity => integer()();
  TextColumn get distributedAt => text()();
  TextColumn get signatureAttachmentId => text().nullable()();
  TextColumn get notes => text().nullable()();
  TextColumn get status => text().withDefault(const Constant('pending'))(); // pending | accepted | rejected
  TextColumn get rejectReason => text().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

class SampleRequests extends Table {
  TextColumn get id => text()();
  TextColumn get productId => text()();
  IntColumn get quantity => integer()();
  IntColumn get approvedQuantity => integer().nullable()();
  TextColumn get status => text().withDefault(const Constant('Pending'))(); // Pending | Approved | Rejected | Fulfilled | Cancelled
  TextColumn get notes => text().nullable()();
  TextColumn get decisionNote => text().nullable()();
  TextColumn get createdAt => text()();
  BoolColumn get dirty => boolean().withDefault(const Constant(true))();

  @override
  Set<Column> get primaryKey => {id};
}

/// Rule-based suggestions for the rep, cached so they are there offline. Replaced wholesale on every refresh.
class NextActions extends Table {
  IntColumn get position => integer()();
  TextColumn get type => text()();
  TextColumn get customerId => text().nullable()();
  TextColumn get title => text()();
  TextColumn get reason => text()();
  IntColumn get priority => integer()();
  TextColumn get dueDate => text().nullable()();

  @override
  Set<Column> get primaryKey => {position};
}

/// Something the server refused for good (for example a visit to a customer that no longer exists). It is not resent; the person decides
/// whether to retry it or remove it from this device.
class SyncProblems extends Table {
  TextColumn get id => text()(); // id of the refused item
  TextColumn get kind => text()(); // customer | plan | visit | report | task
  TextColumn get summary => text()();
  TextColumn get reason => text()();
  TextColumn get createdAt => text()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Notices from the server (for example a batch the rep holds was recalled). `readLocally` is true once read on this device and
/// waiting to be told to the server.
class AppNotifications extends Table {
  TextColumn get id => text()();
  TextColumn get kind => text()();
  TextColumn get title => text()();
  TextColumn get body => text().nullable()();
  TextColumn get createdAt => text()();
  BoolColumn get readLocally => boolean().withDefault(const Constant(false))();

  @override
  Set<Column> get primaryKey => {id};
}

class SyncState extends Table {
  TextColumn get key => text()();
  TextColumn get value => text()();

  @override
  Set<Column> get primaryKey => {key};
}

/// A batch the rep carries, with what is left after samples given but not yet confirmed by the server.
class StockItem {
  StockItem({required this.batchId, required this.productId, required this.productName, required this.batchNumber, required this.expiryDate,
      required this.status, required this.quantity, required this.available});
  final String batchId, productId, batchNumber, expiryDate, status;
  final String? productName;
  final int quantity;
  final int available;

  int daysToExpiry(DateTime now) => DateTime.parse(expiryDate).difference(DateTime(now.year, now.month, now.day)).inDays;
  bool expired(DateTime now) => daysToExpiry(now) < 0;
  bool get blocked => status != 'Active';

  /// Can be handed to a customer.
  bool usable(DateTime now) => !blocked && !expired(now) && available > 0;
}

/// A planned visit joined with its customer and (if started) the visit done for it.
class PlanItem {
  PlanItem(this.planned, this.customer, this.visit);
  final PlannedVisit planned;
  final Customer customer;
  final Visit? visit;
  bool get done => visit?.checkOutAt != null;
}

@DriftDatabase(tables: [Customers, Products, PlannedVisits, Visits, CallReports, FollowUpTasks, GpsPings, Attachments, SampleStock, SampleDistributions, SampleRequests, NextActions, SyncProblems, AppNotifications, SyncState])
class AppDatabase extends _$AppDatabase {
  AppDatabase(super.e);

  @override
  int get schemaVersion => 5;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onUpgrade: (m, from, to) async {
          if (from < 2) await m.createTable(attachments);
          if (from < 3) {
            await m.createTable(sampleStock);
            await m.createTable(sampleDistributions);
            await m.createTable(sampleRequests);
          }
          if (from < 4) await m.createTable(nextActions);
          if (from < 5) {
            await m.addColumn(customers, customers.dirty);
            await m.addColumn(plannedVisits, plannedVisits.dirty);
            await m.createTable(syncProblems);
            await m.createTable(appNotifications);
          }
        },
      );

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
        '+ (SELECT COUNT(*) FROM follow_up_tasks WHERE dirty = 1) + (SELECT COUNT(*) FROM gps_pings) '
        "+ (SELECT COUNT(*) FROM attachments WHERE upload_status = 'pending') "
        "+ (SELECT COUNT(*) FROM sample_distributions WHERE status = 'pending') + (SELECT COUNT(*) FROM sample_requests WHERE dirty = 1) "
        '+ (SELECT COUNT(*) FROM customers WHERE dirty = 1) + (SELECT COUNT(*) FROM planned_visits WHERE dirty = 1) AS n',
        readsFrom: {visits, callReports, followUpTasks, gpsPings, attachments, sampleDistributions, sampleRequests, customers, plannedVisits},
      ).watchSingle().map((r) => r.read<int>('n'));

  Future<int> pendingCount() => watchPendingCount().first;

  /// Removes every row and the captured media files (used when a different user signs in on this device).
  Future<void> wipe() async {
    for (final a in await select(attachments).get()) {
      await deleteFile(a.localPath);
    }
    await transaction(() async {
      for (final t in allTables) {
        await delete(t).go();
      }
    });
  }

  static Future<void> deleteFile(String path) async {
    if (path.isEmpty) return;
    try {
      final f = File(path);
      if (await f.exists()) await f.delete();
    } catch (_) {}
  }

  // ---- suggestions ----

  Stream<List<NextAction>> watchNextActions() => (select(nextActions)..orderBy([(a) => OrderingTerm.asc(a.position)])).watch();

  Future<void> replaceNextActions(List<Map<String, dynamic>> items) => transaction(() async {
        await delete(nextActions).go();
        var i = 0;
        for (final m in items) {
          await into(nextActions).insert(NextActionsCompanion.insert(
            position: Value(i++),
            type: m['type'] as String,
            customerId: Value(m['customerId'] as String?),
            title: m['title'] as String,
            reason: m['reason'] as String,
            priority: (m['priority'] as num).toInt(),
            dueDate: Value(m['dueDate'] as String?),
          ));
        }
      });

  // ---- samples ----

  Stream<List<StockItem>> watchStock() => customSelect(
        'SELECT s.batch_id, s.product_id, s.batch_number, s.expiry_date, s.status, s.quantity, p.name AS product_name, '
        "s.quantity - COALESCE((SELECT SUM(d.quantity) FROM sample_distributions d WHERE d.batch_id = s.batch_id AND d.status = 'pending'), 0) AS available "
        'FROM sample_stock s LEFT JOIN products p ON p.id = s.product_id ORDER BY s.expiry_date, s.batch_number',
        readsFrom: {sampleStock, sampleDistributions, products},
      ).watch().map((rows) => rows
          .map((r) => StockItem(
                batchId: r.read<String>('batch_id'),
                productId: r.read<String>('product_id'),
                productName: r.readNullable<String>('product_name'),
                batchNumber: r.read<String>('batch_number'),
                expiryDate: r.read<String>('expiry_date'),
                status: r.read<String>('status'),
                quantity: r.read<int>('quantity'),
                available: r.read<int>('available'),
              ))
          .toList());

  Stream<List<SampleDistribution>> watchDistributionsForVisit(String visitId) =>
      (select(sampleDistributions)..where((d) => d.visitId.equals(visitId))..orderBy([(d) => OrderingTerm.asc(d.distributedAt)])).watch();

  Stream<List<SampleDistribution>> watchRejectedDistributions() =>
      (select(sampleDistributions)..where((d) => d.status.equals('rejected'))).watch();

  Stream<List<SampleRequest>> watchRequests() =>
      (select(sampleRequests)..orderBy([(r) => OrderingTerm.desc(r.createdAt)])..limit(50)).watch();

  // ---- problems and notices ----

  Stream<List<SyncProblem>> watchProblems() => (select(syncProblems)..orderBy([(p) => OrderingTerm.desc(p.createdAt)])).watch();

  Stream<List<AppNotification>> watchNotifications() =>
      (select(appNotifications)..orderBy([(n) => OrderingTerm.desc(n.createdAt)])).watch();

  Stream<int> watchUnreadCount() => (selectOnly(appNotifications)
        ..addColumns([appNotifications.id.count()])
        ..where(appNotifications.readLocally.equals(false)))
      .watchSingle()
      .map((r) => r.read(appNotifications.id.count()) ?? 0);

  /// Marks one notice (or all) as read on this device; the next sync tells the server.
  Future<void> markNotificationsRead([String? id]) => (update(appNotifications)..where((n) => id == null ? const Constant(true) : n.id.equals(id)))
      .write(const AppNotificationsCompanion(readLocally: Value(true)));

  Stream<List<Visit>> watchVisitsForCustomer(String customerId, {int limit = 10}) =>
      (select(visits)..where((v) => v.customerId.equals(customerId))..orderBy([(v) => OrderingTerm.desc(v.checkInAt)])..limit(limit)).watch();

  /// Puts a refused item back in the upload queue (after the cause was fixed, for example the customer was restored).
  Future<void> retryProblem(SyncProblem p) => transaction(() async {
        switch (p.kind) {
          case 'customer':
            await (update(customers)..where((c) => c.id.equals(p.id))).write(const CustomersCompanion(dirty: Value(true)));
          case 'plan':
            await (update(plannedVisits)..where((c) => c.id.equals(p.id))).write(const PlannedVisitsCompanion(dirty: Value(true)));
          case 'visit':
            await (update(visits)..where((c) => c.id.equals(p.id))).write(const VisitsCompanion(dirty: Value(true)));
          case 'report':
            await (update(callReports)..where((c) => c.id.equals(p.id))).write(const CallReportsCompanion(dirty: Value(true)));
          case 'task':
            await (update(followUpTasks)..where((c) => c.id.equals(p.id))).write(const FollowUpTasksCompanion(dirty: Value(true)));
        }
        await (delete(syncProblems)..where((x) => x.id.equals(p.id))).go();
      });

  /// Removes a refused item from this device for good (a visit also takes its call report and captured files with it).
  Future<void> discardProblem(SyncProblem p) async {
    if (p.kind == 'visit') {
      for (final a in await (select(attachments)..where((a) => a.visitId.equals(p.id))).get()) {
        await deleteFile(a.localPath);
      }
    }
    await transaction(() async {
      switch (p.kind) {
        case 'customer':
          await (delete(customers)..where((c) => c.id.equals(p.id))).go();
        case 'plan':
          await (delete(plannedVisits)..where((c) => c.id.equals(p.id))).go();
        case 'visit':
          await (delete(attachments)..where((a) => a.visitId.equals(p.id))).go();
          await (delete(callReports)..where((r) => r.visitId.equals(p.id))).go();
          await (delete(visits)..where((v) => v.id.equals(p.id))).go();
        case 'report':
          await (delete(callReports)..where((c) => c.id.equals(p.id))).go();
        case 'task':
          await (delete(followUpTasks)..where((c) => c.id.equals(p.id))).go();
      }
      await (delete(syncProblems)..where((x) => x.id.equals(p.id))).go();
    });
  }

  Future<void> recordProblem(String id, String kind, String summary, String reason) => into(syncProblems).insertOnConflictUpdate(
      SyncProblemsCompanion.insert(id: id, kind: kind, summary: summary, reason: reason, createdAt: DateTime.now().toUtc().toIso8601String()));

  // ---- attachments ----

  Stream<List<Attachment>> watchAttachments(String visitId) => (select(attachments)
        ..where((a) => a.visitId.equals(visitId))
        ..orderBy([(a) => OrderingTerm.asc(a.capturedAt)]))
      .watch();

  Future<List<Attachment>> pendingAttachments() =>
      (select(attachments)..where((a) => a.uploadStatus.equals('pending'))..orderBy([(a) => OrderingTerm.asc(a.capturedAt)])).get();

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
          final localCustomer = await (select(customers)..where((c) => c.id.equals(id))).getSingleOrNull();
          if (localCustomer != null && localCustomer.dirty) continue; // never overwrite unsent local edits
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
          final localPlan = await (select(plannedVisits)..where((p) => p.id.equals(id))).getSingleOrNull();
          if (localPlan != null && localPlan.dirty) continue;
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
        // Notices are the server's full unread list: keep the local read marks, drop the ones read elsewhere.
        if (body.containsKey('notifications')) {
          final ids = list('notifications').cast<Map>().map((m) => m['id'] as String).toSet();
          await (delete(appNotifications)..where((n) => n.id.isNotIn(ids))).go();
          for (final m in list('notifications').cast<Map>()) {
            final id = m['id'] as String;
            final local = await (select(appNotifications)..where((n) => n.id.equals(id))).getSingleOrNull();
            await into(appNotifications).insertOnConflictUpdate(AppNotificationsCompanion.insert(
              id: id,
              kind: m['kind'] as String,
              title: m['title'] as String,
              body: Value(s(m, 'body')),
              createdAt: (m['createdAt'] as String?) ?? DateTime.now().toUtc().toIso8601String(),
              readLocally: Value(local?.readLocally ?? false),
            ));
          }
        }
        // Stock is a full snapshot, not a delta. Older servers omit it, in which case nothing changes.
        if (body.containsKey('sampleStock')) {
          await delete(sampleStock).go();
          for (final m in list('sampleStock').cast<Map>()) {
            await into(sampleStock).insertOnConflictUpdate(SampleStockCompanion.insert(
              batchId: m['batchId'] as String,
              productId: m['productId'] as String,
              batchNumber: m['batchNumber'] as String,
              expiryDate: m['expiryDate'] as String,
              status: Value(m['status']?.toString() ?? 'Active'),
              quantity: (m['quantity'] as num).toInt(),
            ));
          }
        }
        for (final m in list('sampleRequests').cast<Map>()) {
          final id = m['id'] as String;
          final local = await (select(sampleRequests)..where((r) => r.id.equals(id))).getSingleOrNull();
          if (local != null && local.dirty) continue;
          await into(sampleRequests).insertOnConflictUpdate(SampleRequestsCompanion.insert(
            id: id,
            productId: m['productId'] as String,
            quantity: (m['quantity'] as num).toInt(),
            approvedQuantity: Value((m['approvedQuantity'] as num?)?.toInt()),
            status: Value(m['status']?.toString() ?? 'Pending'),
            notes: Value(s(m, 'notes')),
            decisionNote: Value(s(m, 'decisionNote')),
            createdAt: (m['createdAt'] as String?) ?? DateTime.now().toUtc().toIso8601String(),
            dirty: const Value(false),
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
