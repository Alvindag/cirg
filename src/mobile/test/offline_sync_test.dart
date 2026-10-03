import 'dart:convert';

import 'package:das_engage/data/database.dart';
import 'package:das_engage/services/api_client.dart';
import 'package:das_engage/services/location_service.dart';
import 'package:das_engage/services/sync_service.dart';
import 'package:das_engage/services/visit_service.dart';
import 'package:drift/drift.dart' hide isNull, isNotNull;
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


Map<String, dynamic> pullBody({int cursor = 100, List customers = const [], List planned = const [], List tasks = const [], List products = const []}) =>
    {'cursor': cursor, 'customers': customers, 'plannedVisits': planned, 'tasks': tasks, 'products': products};

Map<String, dynamic> customerJson(String id, String name, {String? deletedAt}) => {
      'id': id, 'type': 'Doctor', 'name': name, 'segment': 'A', 'city': 'Accra',
      'latitude': 5.6, 'longitude': -0.2, 'targetVisitsPerMonth': 4, 'deletedAt': deletedAt,
    };

void main() {
  late AppDatabase db;
  late FakeLocation location;
  late VisitService visits;

  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    location = FakeLocation(const Fix(5.6037, -0.1870, 8));
    visits = VisitService(db, location);
  });
  tearDown(() => db.close());

  SyncService serviceWith(http.Client client) => SyncService(
        db,
        ApiClient(client, baseUrl: () => 'https://api.test', accessToken: ({bool force = false}) async => force ? 't2' : 't'),
      );

  Future<void> seedCustomer() => db.applyPull(pullBody(customers: [customerJson('c1', 'Dr Ama Boateng')]));

  test('pull stores customers, planned visits and products, and applies tombstones', () async {
    await db.applyPull(pullBody(
      customers: [customerJson('c1', 'Dr Ama'), customerJson('c2', 'Dr Kofi')],
      products: [{'id': 'p1', 'name': 'Amoxil'}],
      planned: [{'id': 'pv1', 'customerId': 'c1', 'plannedDate': '2026-10-01', 'sequence': 1, 'status': 'Planned'}],
    ));
    expect((await db.select(db.customers).get()).length, 2);
    expect((await db.watchPlan('2026-10-01').first).single.customer.name, 'Dr Ama');

    await db.applyPull(pullBody(customers: [customerJson('c2', 'Dr Kofi', deletedAt: '2026-10-01T00:00:00Z')]));
    expect((await db.select(db.customers).get()).map((c) => c.id), ['c1']);
  });

  test('a full visit works offline and sync uploads it in the format the API expects', () async {
    await seedCustomer();
    final v = await visits.checkIn(customerId: 'c1');
    expect(v.checkInLat, 5.6037);
    await visits.saveCallReport(visitId: v.id, notes: 'Discussed Amoxil', outcome: 'Positive', productIds: ['p1']);
    await visits.addTask(title: 'Send samples', customerId: 'c1', due: DateTime(2026, 10, 8));
    await visits.checkOut(v.id);
    await visits.recordPing();
    expect(await db.watchPendingCount().first, 4); // visit + report + task + ping

    Map<String, dynamic>? sent;
    final client = MockClient((req) async {
      if (req.url.path.endsWith('/sync/push')) {
        sent = jsonDecode(req.body) as Map<String, dynamic>;
        expect(req.headers['Authorization'], 'Bearer t');
        return http.Response(jsonEncode({'ok': true, 'errors': []}), 200);
      }
      return http.Response(jsonEncode(pullBody()), 200);
    });

    final res = await serviceWith(client).sync();
    expect(res.ok, isTrue);
    expect(res.pushed, 4);

    final ci = (sent!['checkIns'] as List).single as Map;
    expect(ci['visitId'], v.id);
    expect(ci['checkIn']['customerId'], 'c1');
    expect(ci['checkIn']['latitude'], 5.6037);
    expect(ci['checkOut']['at'], isNotNull);
    final report = ((sent!['callReports'] as List).single as Map)['report'] as Map;
    expect(report['visitId'], v.id);
    expect(report['products'], [{'productId': 'p1', 'feedback': null}]);
    expect(((sent!['tasks'] as List).single as Map)['dueDate'], '2026-10-08');
    expect((sent!['gpsPings'] as List).length, 1);

    expect(await db.watchPendingCount().first, 0);
    expect(await db.getState('pull_cursor'), '100');
  });

  test('a failed sync keeps every change queued, and a retry then succeeds', () async {
    await seedCustomer();
    final v = await visits.checkIn(customerId: 'c1');
    await visits.checkOut(v.id);

    var online = false;
    final client = MockClient((req) async {
      if (!online) throw http.ClientException('no connection');
      if (req.url.path.endsWith('/sync/push')) return http.Response(jsonEncode({'ok': true, 'errors': []}), 200);
      return http.Response(jsonEncode(pullBody()), 200);
    });
    final svc = serviceWith(client);

    final fail = await svc.sync();
    expect(fail.ok, isFalse);
    expect(await db.watchPendingCount().first, 1);

    online = true;
    expect((await svc.sync()).ok, isTrue);
    expect(await db.watchPendingCount().first, 0);
  });

  test('server errors in a batch keep rows dirty; auth failures are flagged', () async {
    await seedCustomer();
    await visits.checkIn(customerId: 'c1');

    final partial = MockClient((req) async => http.Response(jsonEncode({'ok': false, 'errors': ['visit x: unknown customer']}), 200));
    expect((await serviceWith(partial).sync()).ok, isFalse);
    expect(await db.watchPendingCount().first, 1);

    final unauth = MockClient((req) async => http.Response('', 401));
    final r = await serviceWith(unauth).sync();
    expect(r.authFailed, isTrue);
  });

  test('pull never overwrites unsent local task edits', () async {
    await db.into(db.followUpTasks).insert(FollowUpTasksCompanion.insert(id: 't1', title: 'Local', dirty: const Value(true), status: const Value('Done')));
    await db.applyPull(pullBody(tasks: [{'id': 't1', 'title': 'Server', 'status': 'Open'}]));
    final t = await (db.select(db.followUpTasks)..where((x) => x.id.equals('t1'))).getSingle();
    expect(t.title, 'Local');
    expect(t.status, 'Done');
  });

  test('only one visit can be open at a time, and check-in still works without GPS', () async {
    await seedCustomer();
    location.fix = null;
    final v = await visits.checkIn(customerId: 'c1');
    expect(v.checkInLat, isNull);
    expect(() => visits.checkIn(customerId: 'c1'), throwsA(isA<VisitInProgressException>()));
    await visits.checkOut(v.id);
    await visits.checkIn(customerId: 'c1'); // allowed again
  });

  test('editing the call report keeps a single report per visit', () async {
    await seedCustomer();
    final v = await visits.checkIn(customerId: 'c1');
    final a = await visits.saveCallReport(visitId: v.id, notes: 'draft');
    final b = await visits.saveCallReport(visitId: v.id, notes: 'final');
    expect(a, b);
    expect((await db.select(db.callReports).get()).single.notes, 'final');
  });
}
