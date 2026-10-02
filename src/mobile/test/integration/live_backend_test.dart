@Tags(['integration'])
library;

import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
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
import 'package:uuid/uuid.dart';

/// Runs the phone's real sync code against a running backend (PostgreSQL, development signing key).
///
///   DAS_API=http://localhost:5111 flutter test test/integration --tags integration
///
/// Optional: DAS_DEV_KEY (default: the development key from docker-compose.yml). Each test creates its own organisation, so it can be re-run.
/// Skipped when DAS_API is not set.
final _api = Platform.environment['DAS_API'];
final _key = Platform.environment['DAS_DEV_KEY'] ?? 'dev-only-signing-key-change-me-0123456789abcdef';
const _uuid = Uuid();

String _b64(List<int> b) => base64Url.encode(b).replaceAll('=', '');

String token({required String tenant, required String user, required String role, String? territory}) {
  final head = _b64(utf8.encode(jsonEncode({'alg': 'HS256', 'typ': 'JWT'})));
  final body = _b64(utf8.encode(jsonEncode({
    'das_tid': tenant,
    'das_uid': user,
    'http://schemas.microsoft.com/ws/2008/06/identity/claims/role': role,
    'exp': DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/ 1000,
    'das_terr': ?territory,
  })));
  final sig = _b64(Hmac(sha256, utf8.encode(_key)).convert(utf8.encode('$head.$body')).bytes);
  return '$head.$body.$sig';
}

/// A user of the API (admin, area manager, rep) as plain HTTP calls.
class Caller {
  Caller(this.tokenValue);
  final String tokenValue;

  Future<http.Response> send(String method, String path, [Object? body]) {
    final req = http.Request(method, Uri.parse('$_api/api/v1$path'))
      ..headers['Authorization'] = 'Bearer $tokenValue'
      ..headers['Content-Type'] = 'application/json';
    if (body != null) req.body = jsonEncode(body);
    return req.send().then(http.Response.fromStream);
  }

  Future<dynamic> get(String path) async {
    final r = await send('GET', path);
    expect(r.statusCode, 200, reason: '$path: ${r.body}');
    return jsonDecode(r.body);
  }

  Future<dynamic> post(String path, [Object? body]) async {
    final r = await send('POST', path, body);
    expect(r.statusCode, inInclusiveRange(200, 299), reason: '$path: ${r.body}');
    return r.body.isEmpty ? null : jsonDecode(r.body);
  }
}

class _Here implements LocationProvider {
  @override
  Future<Fix?> current() async => const Fix(5.6037, -0.1870, 8);
}

class Org {
  Org(this.tenant, this.territory, this.repId, this.areaId, this.admin, this.area, this.rep);
  final String tenant, territory, repId, areaId;
  final Caller admin, area, rep;
}

Future<Org> newOrg() async {
  final tenant = _uuid.v4(), adminId = _uuid.v4(), areaId = _uuid.v4(), repId = _uuid.v4();
  final admin = Caller(token(tenant: tenant, user: adminId, role: 'Admin'));
  final territory = (await admin.post('/admin/territories', {'name': 'T-$tenant'}))['id'] as String;
  Future<void> user(String id, String name, String role, String? manager) => admin.post('/admin/users', {
        'id': id, 'externalId': 'e-$id', 'fullName': name, 'email': '$name@x.test', 'role': role, 'managerId': manager, 'territoryId': territory, 'isActive': true,
      });
  await user(areaId, 'Area', 'AreaManager', null);
  await user(repId, 'Rep', 'Rep', areaId);
  return Org(tenant, territory, repId, areaId, admin, Caller(token(tenant: tenant, user: areaId, role: 'AreaManager', territory: territory)),
      Caller(token(tenant: tenant, user: repId, role: 'Rep', territory: territory)));
}

/// A phone: its own database and the real sync service pointed at the live API.
class Phone {
  Phone(Org o)
      : db = AppDatabase(NativeDatabase.memory()),
        _token = o.rep.tokenValue {
    sync = SyncService(db, ApiClient(http.Client(), baseUrl: () => _api!, accessToken: ({bool force = false}) async => _token));
    visits = VisitService(db, _Here());
    customers = CustomerService(db, _Here());
    plans = PlanService(db);
  }
  final AppDatabase db;
  final String _token;
  late final SyncService sync;
  late final VisitService visits;
  late final CustomerService customers;
  late final PlanService plans;
}

void main() {
  final skip = _api == null ? 'Set DAS_API to a running backend to run the live tests.' : null;

  test('a customer, a plan for it, the visit, its report and a task made offline all arrive, in the right order, in one sync', () async {
    final o = await newOrg();
    final phone = Phone(o);
    addTearDown(phone.db.close);

    final customerId = await phone.customers.create(const CustomerDraft(type: 'Pharmacy', name: 'Offline Pharmacy', city: 'Accra', useCurrentLocation: true));
    final planId = await phone.plans.plan(customerId: customerId, date: DateTime.now().add(const Duration(days: 1)), objective: 'Introduce the range');
    final visit = await phone.visits.checkIn(customerId: customerId, plannedVisitId: planId);
    await phone.visits.saveCallReport(visitId: visit.id, notes: 'Went well', outcome: 'Positive');
    await phone.visits.addTask(title: 'Send price list', customerId: customerId);
    await phone.visits.checkOut(visit.id);

    final first = await phone.sync.sync();
    expect(first.ok, isTrue, reason: first.error);
    expect(await phone.db.select(phone.db.syncProblems).get(), isEmpty);
    expect(await phone.db.pendingCount(), 0);

    final server = (await o.admin.get('/customers/$customerId'))['customer'] as Map;
    expect(server['name'], 'Offline Pharmacy');
    expect(server['territoryId'], o.territory, reason: 'the server, not the phone, decides the territory');
    final reports = await o.admin.get('/call-reports') as List;
    expect(reports.where((r) => r['visitId'] == visit.id), hasLength(1));

    // the phone now holds what the server holds, including the territory and the plan that became a visit in progress
    expect((await phone.db.customer(customerId))!.territoryId, o.territory);
    final plan = await phone.db.select(phone.db.plannedVisits).getSingle();
    expect(plan.status, 'InProgress');

    final second = await phone.sync.sync();
    expect(second.ok, isTrue);
    expect(second.pushed, 0, reason: 'nothing is sent twice');
  }, skip: skip);

  test('a visit to a customer the server does not have is refused on its own and the rest of the batch still goes through', () async {
    final o = await newOrg();
    final phone = Phone(o);
    addTearDown(phone.db.close);

    final good = await phone.customers.create(const CustomerDraft(type: 'Clinic', name: 'Real Clinic'));
    final ghost = _uuid.v4(); // never existed on the server
    await phone.db.applyPull({'customers': [{'id': ghost, 'type': 'Doctor', 'name': 'Dr Ghost'}]});
    final badVisit = await phone.visits.checkIn(customerId: ghost);
    await phone.visits.checkOut(badVisit.id);
    final goodVisit = await phone.visits.checkIn(customerId: good);
    await phone.visits.checkOut(goodVisit.id);

    final r = await phone.sync.sync();
    expect(r.ok, isTrue, reason: r.error);
    final problems = await phone.db.select(phone.db.syncProblems).get();
    expect(problems.map((p) => p.id), [badVisit.id]);
    expect(problems.single.reason, contains('not available'));
    expect(await phone.db.pendingCount(), 0);
    final visits = await o.admin.get('/visits?from=${Uri.encodeComponent(DateTime.now().subtract(const Duration(days: 1)).toUtc().toIso8601String())}&to=${Uri.encodeComponent(DateTime.now().add(const Duration(days: 1)).toUtc().toIso8601String())}') as List;
    expect(visits.map((v) => v['id']), contains(goodVisit.id));
    expect(visits.map((v) => v['id']), isNot(contains(badVisit.id)));
  }, skip: skip);

  test('a rep cannot take over a customer in another territory from the phone', () async {
    final o = await newOrg();
    final otherTerritory = (await o.admin.post('/admin/territories', {'name': 'Other-${o.tenant}'}))['id'] as String;
    final theirs = (await o.admin.post('/customers', {
      'type': 'Pharmacy', 'name': 'Not Yours', 'segment': 'A', 'territoryId': otherTerritory, 'targetVisitsPerMonth': 2,
    }))['id'] as String;
    final phone = Phone(o);
    addTearDown(phone.db.close);
    await phone.db.applyPull({'customers': [{'id': theirs, 'type': 'Pharmacy', 'name': 'Not Yours', 'targetVisitsPerMonth': 2}]});
    await phone.customers.update(theirs, const CustomerDraft(type: 'Pharmacy', name: 'Hijacked'));

    expect((await phone.sync.sync()).ok, isTrue);
    expect((await phone.db.select(phone.db.syncProblems).get()).single.reason, contains('not in your territory'));
    expect(((await o.admin.get('/customers/$theirs'))['customer'] as Map)['name'], 'Not Yours');
  }, skip: skip);

  test('a recalled batch reaches the phone as a notice, and reading it there marks it read on the server', () async {
    final o = await newOrg();
    final phone = Phone(o);
    addTearDown(phone.db.close);

    final product = (await o.admin.post('/admin/products', {'name': 'Amoxil', 'code': 'AMX'}))['id'] as String;
    final expiry = DateTime.now().add(const Duration(days: 300)).toIso8601String().substring(0, 10);
    final batch = (await o.admin.post('/samples/batches', {'productId': product, 'batchNumber': 'B-1', 'expiryDate': expiry}))['id'] as String;
    await o.admin.post('/samples/receipts', {'batchId': batch, 'quantity': 100});
    final request = _uuid.v4();
    await o.rep.post('/samples/requests', {'id': request, 'productId': product, 'quantity': 20});
    await o.area.post('/samples/requests/$request/approve', {});
    await o.admin.post('/samples/requests/$request/fulfil', {});
    final recall = await o.admin.post('/samples/batches/$batch/status', {'status': 'Recalled', 'reason': 'Defect'});
    expect(recall['notified'], 1);

    expect((await phone.sync.sync()).ok, isTrue);
    final notices = await phone.db.select(phone.db.appNotifications).get();
    expect(notices.single.title, contains('Recall'));
    expect(notices.single.body, contains('You hold 20'));
    expect(await phone.db.watchUnreadCount().first, 1);

    await phone.db.markNotificationsRead();
    expect((await phone.sync.sync()).ok, isTrue);
    expect(await o.rep.get('/notifications'), isEmpty, reason: 'the server heard that it was read');
    expect(await phone.db.select(phone.db.appNotifications).get(), isEmpty);
  }, skip: skip);

  test('a remote wipe empties the phone at its next sync, after its pending work was uploaded, and then stops', () async {
    final o = await newOrg();
    final phone = Phone(o);
    addTearDown(phone.db.close);

    final customerId = await phone.customers.create(const CustomerDraft(type: 'Pharmacy', name: 'Before The Wipe'));
    expect((await o.admin.send('POST', '/admin/users/${o.repId}/wipe-device')).statusCode, 200);

    final r = await phone.sync.sync();
    expect(r.wiped, isTrue);
    expect(await phone.db.select(phone.db.customers).get(), isEmpty);
    expect(((await o.admin.get('/customers/$customerId'))['customer'] as Map)['name'], 'Before The Wipe', reason: 'uploaded before it was cleared');

    final again = await phone.sync.sync();
    expect(again.wiped, isFalse, reason: 'the server was told and stopped asking');
    expect(again.ok, isTrue);
  }, skip: skip);
}
