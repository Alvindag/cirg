import 'dart:convert';

import 'package:das_engage/data/database.dart';
import 'package:das_engage/services/api_client.dart';
import 'package:das_engage/services/sample_service.dart';
import 'package:das_engage/services/sync_service.dart';
import 'package:drift/drift.dart' hide isNull, isNotNull;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

String day(int offset) {
  final d = DateTime.now().add(Duration(days: offset));
  return '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
}

Map<String, dynamic> stockRow(String batch, {int qty = 20, int expiryDays = 200, String status = 'Active', String product = 'p1'}) => {
      'batchId': batch, 'productId': product, 'batchNumber': 'N-$batch', 'expiryDate': day(expiryDays), 'status': status, 'quantity': qty,
    };

void main() {
  late AppDatabase db;
  late SampleService svc;

  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    svc = SampleService(db);
  });
  tearDown(() => db.close());

  Future<void> pull({List<Map<String, dynamic>>? stock, List<Map<String, dynamic>> requests = const []}) => db.applyPull({
        'cursor': 1, 'customers': [], 'plannedVisits': [], 'tasks': [], 'products': [{'id': 'p1', 'name': 'Amoxil'}],
        'sampleStock': ?stock, 'sampleRequests': requests,
      });

  SyncService syncWith(MockClient client) =>
      SyncService(db, ApiClient(client, baseUrl: () => 'https://api.test', accessToken: ({bool force = false}) async => 't'));

  Future<StockItem> item(String batch) async => (await db.watchStock().first).firstWhere((s) => s.batchId == batch);

  test('stock is a full snapshot from the server; a server that omits it leaves it alone', () async {
    await pull(stock: [stockRow('b1'), stockRow('b2')]);
    expect((await db.watchStock().first).map((s) => s.batchId), ['b1', 'b2']);
    expect((await item('b1')).productName, 'Amoxil');

    await pull(); // no sampleStock key
    expect(await db.watchStock().first, hasLength(2));

    await pull(stock: [stockRow('b2', qty: 5)]); // b1 is gone (given out or returned)
    final left = await db.watchStock().first;
    expect(left.map((s) => s.batchId), ['b2']);
    expect(left.single.quantity, 5);
  });

  test('giving samples reduces what is available immediately, before the server confirms', () async {
    await pull(stock: [stockRow('b1', qty: 20)]);
    await svc.giveSamples(visitId: 'v1', customerId: 'c1', lines: [const SampleLine(batchId: 'b1', productId: 'p1', quantity: 8)], signatureAttachmentId: 'sig1');
    final s = await item('b1');
    expect(s.quantity, 20);
    expect(s.available, 12);
    expect(await db.watchPendingCount().first, 1);

    // cannot give more than is left, counting what is pending
    await expectLater(
        svc.giveSamples(visitId: 'v1', customerId: 'c1', lines: [const SampleLine(batchId: 'b1', productId: 'p1', quantity: 13)]),
        throwsA(isA<SampleException>()));
    expect((await db.select(db.sampleDistributions).get()), hasLength(1));
  });

  test('a hand-over is all or nothing, and expired, blocked or foreign batches are refused', () async {
    await pull(stock: [
      stockRow('good', qty: 10),
      stockRow('old', qty: 10, expiryDays: -2),
      stockRow('recalled', qty: 10, status: 'Recalled'),
      stockRow('other', qty: 10, product: 'p2'),
    ]);
    SampleLine l(String b, {String p = 'p1', int q = 1}) => SampleLine(batchId: b, productId: p, quantity: q);
    Future<void> give(List<SampleLine> lines) => svc.giveSamples(visitId: 'v', customerId: 'c', lines: lines);

    await expectLater(give([l('good'), l('old')]), throwsA(predicate((e) => '$e'.contains('expired'))));
    await expectLater(give([l('good'), l('recalled')]), throwsA(predicate((e) => '$e'.contains('recalled'))));
    await expectLater(give([l('other')]), throwsA(isA<SampleException>())); // product mismatch
    await expectLater(give([l('missing')]), throwsA(isA<SampleException>()));
    await expectLater(give([l('good', q: 0)]), throwsA(isA<SampleException>()));
    await expectLater(give([]), throwsA(isA<SampleException>()));
    await expectLater(give([l('good', q: 6), l('good', q: 6)]), throwsA(isA<SampleException>())); // lines add up
    expect(await db.select(db.sampleDistributions).get(), isEmpty); // nothing was saved by any failed attempt

    await give([l('good', q: 3), l('good', q: 2)]);
    expect((await item('good')).available, 5);
  });

  test('stock items report expiry and whether they can be given', () async {
    await pull(stock: [stockRow('soon', expiryDays: 30), stockRow('old', expiryDays: -1), stockRow('bad', status: 'Quarantined'), stockRow('ok')]);
    final now = DateTime.now();
    expect((await item('soon')).usable(now), isTrue);
    expect((await item('soon')).daysToExpiry(now), inInclusiveRange(29, 30));
    expect((await item('old')).expired(now), isTrue);
    expect((await item('old')).usable(now), isFalse);
    expect((await item('bad')).usable(now), isFalse);
    expect((await item('ok')).usable(now), isTrue);
  });

  test('an unsent hand-over can be undone; a confirmed one cannot', () async {
    await pull(stock: [stockRow('b1')]);
    final ids = await svc.giveSamples(visitId: 'v', customerId: 'c', lines: [const SampleLine(batchId: 'b1', productId: 'p1', quantity: 2)]);
    expect(await svc.undoPending(ids.single), isTrue);
    expect((await item('b1')).available, 20);

    final again = await svc.giveSamples(visitId: 'v', customerId: 'c', lines: [const SampleLine(batchId: 'b1', productId: 'p1', quantity: 2)]);
    await (db.update(db.sampleDistributions)).write(const SampleDistributionsCompanion(status: Value('accepted')));
    expect(await svc.undoPending(again.single), isFalse);
  });

  test('sync sends hand-overs and requests, then applies the server verdict line by line', () async {
    await pull(stock: [stockRow('b1', qty: 20)]);
    final given = await svc.giveSamples(
        visitId: 'v1', customerId: 'c1', signatureAttachmentId: 'sig-1',
        lines: [const SampleLine(batchId: 'b1', productId: 'p1', quantity: 5)]);
    final bad = await svc.giveSamples(visitId: 'v1', customerId: 'c1', lines: [const SampleLine(batchId: 'b1', productId: 'p1', quantity: 4)]);
    final req = await svc.requestSamples(productId: 'p1', quantity: 30, notes: 'launch week');
    final bad2 = await svc.requestSamples(productId: 'p1', quantity: 10);

    Map<String, dynamic>? sent;
    final client = MockClient((r) async {
      if (r.url.path.endsWith('/sync/push')) {
        sent = jsonDecode(r.body) as Map<String, dynamic>;
        return http.Response(
            jsonEncode({
              'ok': true, 'errors': [],
              'sampleDistributions': [
                {'id': given.single, 'status': 'accepted'},
                {'id': bad.single, 'status': 'rejected', 'reason': 'Batch N-b1 had expired.'},
              ],
              'sampleRequests': [
                {'id': req, 'status': 'accepted'},
                {'id': bad2, 'status': 'rejected', 'reason': 'Unknown product.'},
              ],
            }),
            200);
      }
      // the server's figure after the accepted 5 units
      return http.Response(
          jsonEncode({
            'cursor': 2, 'customers': [], 'plannedVisits': [], 'tasks': [], 'products': [],
            'sampleStock': [stockRow('b1', qty: 15)],
            'sampleRequests': [{'id': req, 'productId': 'p1', 'quantity': 30, 'approvedQuantity': 20, 'status': 'Approved', 'decisionNote': 'ok for 20', 'createdAt': '2026-10-01T09:00:00Z'}],
          }),
          200);
    });

    expect((await syncWith(client).sync()).ok, isTrue);

    final d = (sent!['sampleDistributions'] as List).cast<Map>().firstWhere((x) => x['id'] == given.single);
    expect(d['visitId'], 'v1');
    expect(d['customerId'], 'c1');
    expect(d['batchId'], 'b1');
    expect(d['quantity'], 5);
    expect(d['signatureAttachmentId'], 'sig-1');
    expect(DateTime.parse(d['distributedAt'] as String).isUtc, isTrue);
    expect((sent!['sampleRequests'] as List).cast<Map>().firstWhere((x) => x['id'] == req)['notes'], 'launch week');

    final rows = {for (final r in await db.select(db.sampleDistributions).get()) r.id: r};
    expect(rows[given.single]!.status, 'accepted');
    expect(rows[bad.single]!.status, 'rejected');
    expect(rows[bad.single]!.rejectReason, 'Batch N-b1 had expired.');

    final s = await item('b1');
    expect(s.quantity, 15); // server's figure
    expect(s.available, 15); // rejected line is not held back

    final requests = {for (final r in await db.select(db.sampleRequests).get()) r.id: r};
    expect(requests[req]!.status, 'Approved');
    expect(requests[req]!.approvedQuantity, 20);
    expect(requests[req]!.dirty, isFalse);
    expect(requests[bad2]!.status, 'Rejected');
    expect(requests[bad2]!.decisionNote, 'Unknown product.');
    expect(await db.watchPendingCount().first, 0);
    expect(await db.watchRejectedDistributions().first, hasLength(1));
  });

  test('a replayed hand-over (duplicate) is treated as confirmed without reducing stock twice', () async {
    await pull(stock: [stockRow('b1', qty: 20)]);
    final ids = await svc.giveSamples(visitId: 'v', customerId: 'c', lines: [const SampleLine(batchId: 'b1', productId: 'p1', quantity: 5)]);
    final client = MockClient((r) async => r.url.path.endsWith('/sync/push')
        ? http.Response(jsonEncode({'ok': true, 'errors': [], 'sampleDistributions': [{'id': ids.single, 'status': 'duplicate'}]}), 200)
        : http.Response(jsonEncode({'cursor': 1}), 200)); // pull without stock keeps the local figure
    await syncWith(client).sync();
    expect((await db.select(db.sampleDistributions).get()).single.status, 'accepted');
    expect((await item('b1')).quantity, 20);
  });

  test('server-side changes never overwrite a request the rep has not sent yet', () async {
    await db.into(db.sampleRequests).insert(SampleRequestsCompanion.insert(id: 'r1', productId: 'p1', quantity: 5, createdAt: '2026-10-01T08:00:00Z'));
    await pull(requests: [{'id': 'r1', 'productId': 'p1', 'quantity': 99, 'status': 'Approved', 'createdAt': '2026-10-01T08:00:00Z'}]);
    final r = await (db.select(db.sampleRequests)..where((x) => x.id.equals('r1'))).getSingle();
    expect(r.quantity, 5);
    expect(r.status, 'Pending');
  });

  test('requests are validated before they are saved', () async {
    await expectLater(svc.requestSamples(productId: 'p1', quantity: 0), throwsA(isA<SampleException>()));
    await expectLater(svc.requestSamples(productId: 'p1', quantity: 5000), throwsA(isA<SampleException>()));
    final id = await svc.requestSamples(productId: 'p1', quantity: 5, notes: '   ');
    expect((await (db.select(db.sampleRequests)..where((x) => x.id.equals(id))).getSingle()).notes, isNull);
  });
}
