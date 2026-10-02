import 'dart:convert';

import 'package:das_engage/data/database.dart';
import 'package:das_engage/services/api_client.dart';
import 'package:das_engage/services/customer_service.dart';
import 'package:das_engage/services/location_service.dart';
import 'package:das_engage/services/plan_service.dart';
import 'package:das_engage/services/sync_service.dart';
import 'package:das_engage/services/visit_service.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class FakeLocation implements LocationProvider {
  FakeLocation(this.fix);
  Fix? fix;
  @override
  Future<Fix?> current() async => fix;
}

Map<String, dynamic> pullBody({int cursor = 100, List customers = const [], List planned = const [], List? notifications, bool wipe = false}) =>
    {'cursor': cursor, 'customers': customers, 'plannedVisits': planned, 'tasks': const [], 'products': const [], 'wipe': wipe, 'notifications': ?notifications};

Map<String, dynamic> customerJson(String id, String name) =>
    {'id': id, 'type': 'Doctor', 'name': name, 'segment': 'A', 'city': 'Accra', 'targetVisitsPerMonth': 4};

void main() {
  late AppDatabase db;
  late VisitService visits;
  late CustomerService customers;
  late PlanService plans;
  final today = DateTime(2026, 10, 1);

  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    final location = FakeLocation(const Fix(5.6037, -0.1870, 8));
    visits = VisitService(db, location);
    customers = CustomerService(db, location);
    plans = PlanService(db, now: () => today);
  });
  tearDown(() => db.close());

  /// Answers pushes with [pushAnswer(requestBody)] and pulls with [pull]; records every request path and push body.
  SyncService serviceWith({required Map<String, dynamic> Function(Map<String, dynamic> body) pushAnswer, Map<String, dynamic>? pull, List<String>? paths, List<Map<String, dynamic>>? pushes}) {
    final client = MockClient((req) async {
      paths?.add('${req.method} ${req.url.path}');
      if (req.url.path.endsWith('/sync/push')) {
        final body = jsonDecode(req.body) as Map<String, dynamic>;
        pushes?.add(body);
        return http.Response(jsonEncode(pushAnswer(body)), 200);
      }
      if (req.url.path.endsWith('/sync/wiped')) return http.Response('', 204);
      return http.Response(jsonEncode(pull ?? pullBody()), 200);
    });
    return SyncService(db, ApiClient(client, baseUrl: () => 'https://api.test', accessToken: ({bool force = false}) async => 't'));
  }

  Map<String, dynamic> ok(Map<String, dynamic> body, {Set<String> reject = const {}, String reason = 'Nope.'}) {
    List items(String key, String idKey, [String? nested]) => [
          for (final m in (body[key] as List? ?? const []).cast<Map>())
            () {
              final id = (nested == null ? m[idKey] : (m[nested] as Map)[idKey]) as String;
              return {'id': id, 'status': reject.contains(id) ? 'rejected' : 'accepted', 'reason': reject.contains(id) ? reason : null};
            }(),
        ];
    return {
      'ok': reject.isEmpty,
      'errors': [],
      'customers': items('customers', 'id'),
      'plannedVisits': items('plannedVisits', 'id'),
      'checkIns': items('checkIns', 'visitId'),
      'callReports': items('callReports', 'id', 'report'),
      'tasks': items('tasks', 'id'),
    };
  }

  test('one refused visit becomes a problem item and the rest of the batch is accepted', () async {
    await db.applyPull(pullBody(customers: [customerJson('c1', 'Dr Ama')]));
    final bad = await visits.checkIn(customerId: 'c1');
    await visits.saveCallReport(visitId: bad.id, notes: 'Notes', outcome: 'Positive');
    await visits.checkOut(bad.id);
    final good = await visits.checkIn(customerId: 'c1');
    await visits.checkOut(good.id);
    await visits.addTask(title: 'Call back', customerId: 'c1');

    final sync = serviceWith(pushAnswer: (b) => ok(b, reject: {bad.id}, reason: 'This customer is not available any more.'));
    final r = await sync.sync();
    expect(r.ok, isTrue); // the batch went through; the problem is shown to the person instead of blocking everything

    expect((await (db.select(db.visits)..where((v) => v.id.equals(good.id))).getSingle()).dirty, isFalse);
    expect((await (db.select(db.visits)..where((v) => v.id.equals(bad.id))).getSingle()).dirty, isFalse, reason: 'it must not be resent every sync');
    final problems = await db.select(db.syncProblems).get();
    expect(problems.map((p) => p.id), [bad.id]);
    expect(problems.single.kind, 'visit');
    expect(problems.single.summary, contains('Dr Ama'));
    expect(problems.single.reason, 'This customer is not available any more.');
    expect(await db.pendingCount(), 0);
  });

  test('retry puts a refused item back in the queue; remove deletes the visit with its report', () async {
    await db.applyPull(pullBody(customers: [customerJson('c1', 'Dr Ama')]));
    final v = await visits.checkIn(customerId: 'c1');
    await visits.saveCallReport(visitId: v.id, notes: 'Notes');
    await visits.checkOut(v.id);
    await serviceWith(pushAnswer: (b) => ok(b, reject: {v.id})).sync();
    final problem = (await db.select(db.syncProblems).get()).single;

    await db.retryProblem(problem);
    expect(await db.select(db.syncProblems).get(), isEmpty);
    expect((await db.select(db.visits).getSingle()).dirty, isTrue);
    expect(await db.pendingCount(), 1);

    await serviceWith(pushAnswer: (b) => ok(b, reject: {v.id})).sync();
    await db.discardProblem((await db.select(db.syncProblems).get()).single);
    expect(await db.select(db.visits).get(), isEmpty);
    expect(await db.select(db.callReports).get(), isEmpty);
    expect(await db.select(db.syncProblems).get(), isEmpty);
  });

  test('an older server that only says ok still clears everything; ok=false without item results is an error', () async {
    await db.applyPull(pullBody(customers: [customerJson('c1', 'Dr Ama')]));
    final v = await visits.checkIn(customerId: 'c1');
    await visits.checkOut(v.id);
    expect((await serviceWith(pushAnswer: (_) => {'ok': true, 'errors': []}).sync()).ok, isTrue);
    expect(await db.pendingCount(), 0);

    final v2 = await visits.checkIn(customerId: 'c1');
    await visits.checkOut(v2.id);
    final r = await serviceWith(pushAnswer: (_) => {'ok': false, 'errors': ['x']}).sync();
    expect(r.ok, isFalse);
    expect(await db.pendingCount(), 1); // still queued
  });

  test('an item the answer does not mention stays queued', () async {
    await db.applyPull(pullBody(customers: [customerJson('c1', 'Dr Ama')]));
    final v = await visits.checkIn(customerId: 'c1');
    await visits.checkOut(v.id);
    await serviceWith(pushAnswer: (_) => {'ok': true, 'errors': [], 'checkIns': []}).sync();
    expect(await db.pendingCount(), 1);
  });

  group('customers added or edited on the device', () {
    test('are validated, saved offline, and uploaded with the fields the API expects', () async {
      expect(() => customers.create(const CustomerDraft(type: 'Pharmacy', name: ' ')), throwsA(isA<ValidationException>()));
      expect(() => customers.create(const CustomerDraft(type: 'Shop', name: 'X')), throwsA(isA<ValidationException>()));
      expect(() => customers.create(const CustomerDraft(type: 'Pharmacy', name: 'X', email: 'nope')), throwsA(isA<ValidationException>()));
      expect(() => customers.create(const CustomerDraft(type: 'Pharmacy', name: 'X', targetVisitsPerMonth: 40)), throwsA(isA<ValidationException>()));

      final id = await customers.create(const CustomerDraft(type: 'Pharmacy', name: ' Ernest Chemists ', city: 'Accra', phone: '', useCurrentLocation: true));
      final row = await db.customer(id);
      expect(row!.name, 'Ernest Chemists');
      expect(row.phone, isNull); // blank means none
      expect(row.latitude, 5.6037);
      expect(row.dirty, isTrue);

      final pushes = <Map<String, dynamic>>[];
      await serviceWith(pushAnswer: ok, pushes: pushes).sync();
      final sent = (pushes.single['customers'] as List).single as Map;
      expect(sent['id'], id);
      expect(sent['name'], 'Ernest Chemists');
      expect(sent['type'], 'Pharmacy');
      expect(sent['latitude'], 5.6037);
      expect((await db.customer(id))!.dirty, isFalse);
    });

    test('an edit keeps the position unless asked, and a refused one is reported', () async {
      await db.applyPull(pullBody(customers: [{...customerJson('c1', 'Dr Ama'), 'latitude': 5.5, 'longitude': -0.2}]));
      await customers.update('c1', const CustomerDraft(type: 'Doctor', name: 'Dr Ama B', city: 'Tema'));
      var row = (await db.customer('c1'))!;
      expect(row.name, 'Dr Ama B');
      expect(row.latitude, 5.5);
      expect(row.dirty, isTrue);

      await serviceWith(pushAnswer: (b) => ok(b, reject: {'c1'}, reason: 'This customer is not in your territory.')).sync();
      final p = (await db.select(db.syncProblems).get()).single;
      expect(p.kind, 'customer');
      expect(p.summary, 'Dr Ama B');
      row = (await db.customer('c1'))!;
      expect(row.dirty, isFalse);
    });

    test('a pull never overwrites an unsent local edit', () async {
      await db.applyPull(pullBody(customers: [customerJson('c1', 'Dr Ama')]));
      await customers.update('c1', const CustomerDraft(type: 'Doctor', name: 'Edited here'));
      await db.applyPull(pullBody(customers: [customerJson('c1', 'Changed on the server')]));
      expect((await db.customer('c1'))!.name, 'Edited here');
    });
  });

  group('visits planned on the device', () {
    setUp(() async => db.applyPull(pullBody(customers: [customerJson('c1', 'Dr Ama')])));

    test('are validated, numbered per day, and uploaded before the visit that uses them', () async {
      expect(() => plans.plan(customerId: 'c1', date: DateTime(2026, 9, 30)), throwsA(isA<ValidationException>()));
      expect(() => plans.plan(customerId: 'c1', date: DateTime(2028, 1, 1)), throwsA(isA<ValidationException>()));
      expect(() => plans.plan(customerId: 'missing', date: today), throwsA(isA<ValidationException>()));

      final a = await plans.plan(customerId: 'c1', date: DateTime(2026, 10, 2), objective: '  new range ');
      expect(() => plans.plan(customerId: 'c1', date: DateTime(2026, 10, 2)), throwsA(isA<ValidationException>()), reason: 'twice on one day');
      await db.applyPull(pullBody(customers: [customerJson('c2', 'Dr Kofi')]));
      final b = await plans.plan(customerId: 'c2', date: DateTime(2026, 10, 2));
      expect((await (db.select(db.plannedVisits)..where((p) => p.id.equals(a))).getSingle()).sequence, 1);
      expect((await (db.select(db.plannedVisits)..where((p) => p.id.equals(b))).getSingle()).sequence, 2);
      expect((await (db.select(db.plannedVisits)..where((p) => p.id.equals(a))).getSingle()).objective, 'new range');

      final pushes = <Map<String, dynamic>>[];
      await serviceWith(pushAnswer: ok, pushes: pushes).sync();
      final sent = (pushes.single['plannedVisits'] as List).cast<Map>();
      expect(sent.map((p) => p['id']), unorderedEquals([a, b]));
      expect(sent.first['plannedDate'], '2026-10-02');
      expect(sent.first['cancelled'], false);
      expect(pushes.single.keys.toList().indexOf('customers'), lessThan(pushes.single.keys.toList().indexOf('plannedVisits')));
      expect(pushes.single.keys.toList().indexOf('plannedVisits'), lessThan(pushes.single.keys.toList().indexOf('checkIns')));
      expect(await db.pendingCount(), 0);
    });

    test('can be cancelled until the visit starts, and the cancellation is uploaded', () async {
      final id = await plans.plan(customerId: 'c1', date: DateTime(2026, 10, 3));
      await serviceWith(pushAnswer: ok).sync();
      await plans.cancel(id);
      expect((await db.select(db.plannedVisits).getSingle()).status, 'Cancelled');
      expect(await plans.watchUpcoming('c1').first, isEmpty);

      final pushes = <Map<String, dynamic>>[];
      await serviceWith(pushAnswer: ok, pushes: pushes).sync();
      expect(((pushes.single['plannedVisits'] as List).single as Map)['cancelled'], true);

      final started = await plans.plan(customerId: 'c1', date: DateTime(2026, 10, 4));
      await visits.checkIn(customerId: 'c1', plannedVisitId: started);
      expect(() => plans.cancel(started), throwsA(isA<ValidationException>()));
    });

    test('a plan the server refuses becomes a problem item naming the customer and day', () async {
      final id = await plans.plan(customerId: 'c1', date: DateTime(2026, 10, 3));
      await serviceWith(pushAnswer: (b) => ok(b, reject: {id}, reason: 'This customer is not available any more.')).sync();
      final p = (await db.select(db.syncProblems).get()).single;
      expect(p.kind, 'plan');
      expect(p.summary, 'Visit to Dr Ama on 2026-10-03');
    });
  });

  group('notices', () {
    Map<String, dynamic> notice(String id, {String kind = 'batch.recalled'}) =>
        {'id': id, 'kind': kind, 'title': 'Recall: Amoxil batch B-1', 'body': 'You hold 10 unit(s).', 'createdAt': '2026-10-02T08:00:00Z'};

    test('arrive with the pull, count as unread, and keep the local read mark', () async {
      await db.applyPull(pullBody(notifications: [notice('n1'), notice('n2')]));
      expect(await db.watchUnreadCount().first, 2);
      await db.markNotificationsRead('n1');
      expect(await db.watchUnreadCount().first, 1);
      await db.applyPull(pullBody(notifications: [notice('n1'), notice('n2')])); // the server has not heard about the read yet
      expect(await db.watchUnreadCount().first, 1);
      await db.applyPull(pullBody(notifications: [notice('n2')])); // read on another phone: gone here too
      expect((await db.select(db.appNotifications).get()).map((n) => n.id), ['n2']);
    });

    test('reads are reported to the server at the next sync and then forgotten', () async {
      await db.applyPull(pullBody(notifications: [notice('n1'), notice('n2')]));
      await db.markNotificationsRead('n1');
      final pushes = <Map<String, dynamic>>[];
      await serviceWith(pushAnswer: ok, pushes: pushes, pull: pullBody(notifications: [notice('n2')])).sync();
      expect(pushes.single['notificationReads'], ['n1']);
      expect((await db.select(db.appNotifications).get()).map((n) => n.id), ['n2']);
    });

    test('mark all read covers every notice', () async {
      await db.applyPull(pullBody(notifications: [notice('n1'), notice('n2')]));
      await db.markNotificationsRead();
      expect(await db.watchUnreadCount().first, 0);
    });
  });

  group('remote wipe', () {
    test('pushes what is waiting, then clears the phone and tells the server', () async {
      await db.applyPull(pullBody(customers: [customerJson('c1', 'Dr Ama')]));
      final v = await visits.checkIn(customerId: 'c1');
      await visits.checkOut(v.id);
      await db.setState('owner', 'user-1');

      final paths = <String>[];
      final pushes = <Map<String, dynamic>>[];
      final r = await serviceWith(pushAnswer: ok, pull: pullBody(wipe: true), paths: paths, pushes: pushes).sync();
      expect(r.wiped, isTrue);
      expect(r.pulled, isFalse);
      expect(pushes, hasLength(1), reason: 'the unsent visit reaches the server before the phone is emptied');
      expect(paths, ['POST /api/v1/sync/push', 'GET /api/v1/sync/pull', 'POST /api/v1/sync/wiped']);
      expect(await db.select(db.customers).get(), isEmpty);
      expect(await db.select(db.visits).get(), isEmpty);
      expect(await db.getState('owner'), isNull);
    });

    test('a normal pull does not wipe', () async {
      final r = await serviceWith(pushAnswer: ok, pull: pullBody(customers: [customerJson('c1', 'Dr Ama')])).sync();
      expect(r.wiped, isFalse);
      expect(await db.select(db.customers).get(), hasLength(1));
    });
  });

  test('a v4 database is upgraded: existing customers and plans survive and the new tables exist', () async {
    final old = NativeDatabase.memory(setup: (raw) {
      raw.execute('CREATE TABLE customers (id TEXT NOT NULL PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, specialty TEXT, segment TEXT NOT NULL DEFAULT \'Unclassified\', '
          'territory_id TEXT, parent_customer_id TEXT, phone TEXT, email TEXT, address TEXT, city TEXT, latitude REAL, longitude REAL, target_visits_per_month INTEGER NOT NULL DEFAULT 0)');
      raw.execute('CREATE TABLE planned_visits (id TEXT NOT NULL PRIMARY KEY, customer_id TEXT NOT NULL, planned_date TEXT NOT NULL, sequence INTEGER NOT NULL DEFAULT 0, '
          'status TEXT NOT NULL DEFAULT \'Planned\', objective TEXT)');
      raw.execute("INSERT INTO customers (id, type, name) VALUES ('c1', 'Doctor', 'Dr Old')");
      raw.execute("INSERT INTO planned_visits (id, customer_id, planned_date) VALUES ('p1', 'c1', '2026-10-01')");
      raw.execute('PRAGMA user_version = 4');
    });
    final upgraded = AppDatabase(old);
    addTearDown(upgraded.close);
    final c = await upgraded.customer('c1');
    expect(c!.name, 'Dr Old');
    expect(c.dirty, isFalse);
    expect((await upgraded.select(upgraded.plannedVisits).getSingle()).dirty, isFalse);
    expect(await upgraded.select(upgraded.syncProblems).get(), isEmpty);
    expect(await upgraded.select(upgraded.appNotifications).get(), isEmpty);
    await upgraded.into(upgraded.syncProblems).insert(SyncProblemsCompanion.insert(id: 'x', kind: 'task', summary: 's', reason: 'r', createdAt: 'now'));
    expect(await upgraded.select(upgraded.syncProblems).get(), hasLength(1));
  });
}
