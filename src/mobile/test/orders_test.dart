import 'dart:convert';

import 'package:das_engage/data/database.dart';
import 'package:das_engage/providers.dart';
import 'package:das_engage/services/api_client.dart';
import 'package:das_engage/services/order_rules.dart';
import 'package:das_engage/services/order_service.dart';
import 'package:das_engage/services/sync_service.dart';
import 'package:das_engage/ui/order_screen.dart';
import 'package:das_engage/ui/orders_tab.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

OrderDraftLine line(String id, int q, {double? price = 2.5, String name = 'Amoxil 500'}) =>
    OrderDraftLine(productId: id, productName: name, quantity: q, unitPrice: price);

void main() {
  group('order rules', () {
    test('a quantity is a whole number from 1 to 1000: letters, decimals, signs and blanks are refused', () {
      expect(OrderRules.parseQuantity('10'), 10);
      expect(OrderRules.parseQuantity(' 1000 '), 1000);
      for (final bad in ['', '0', '-5', '1.5', '1,5', 'ten', '1001', '10000', '+3', '1e3']) {
        expect(OrderRules.parseQuantity(bad), isNull, reason: bad);
      }
    });

    test('above 50 it must be confirmed by name', () {
      expect(OrderRules.needsConfirmation(50), isFalse);
      expect(OrderRules.needsConfirmation(51), isTrue);
      expect(OrderRules.confirmationText('Amoxil 500mg', 100), '100 × Amoxil 500mg. Is this right?');
    });

    test('repeated products are added together in the order first picked', () {
      final m = OrderRules.merge([line('a', 5), line('b', 1, name: 'B'), line('a', 7)]);
      expect(m.map((l) => (l.productId, l.quantity)), [('a', 12), ('b', 1)]);
    });

    test('the estimate needs a price for every product', () {
      expect(OrderRules.estimate([line('a', 3), line('b', 2, price: 1.1)]), 9.7);
      expect(OrderRules.estimate([line('a', 3), line('b', 2, price: null)]), isNull);
    });
  });

  group('orders on the phone', () {
    late AppDatabase db;
    late OrderService svc;
    setUp(() {
      db = AppDatabase(NativeDatabase.memory());
      svc = OrderService(db, now: () => DateTime.utc(2026, 10, 3, 9));
    });
    tearDown(() => db.close());

    SyncService syncWith(MockClient client) =>
        SyncService(db, ApiClient(client, baseUrl: () => 'https://api.test', accessToken: ({bool force = false}) async => 't'));

    test('an order is saved offline with merged lines, an estimate and the time it was taken', () async {
      final id = await svc.place(customerId: 'c1', customerName: 'Korle Pharmacy', lines: [line('a', 5), line('a', 5)], notes: ' after 2pm ');
      final o = await (db.select(db.orders)..where((x) => x.id.equals(id))).getSingle();
      expect((o.customerName, o.status, o.dirty, o.total, o.notes, o.placedAt), ('Korle Pharmacy', 'Placed', true, 25.0, 'after 2pm', '2026-10-03T09:00:00.000Z'));
      final lines = await db.linesOf(id);
      expect(lines.map((l) => l.quantity), [10]);
      expect(await db.pendingCount(), 1);
    });

    test('empty orders and bad or oversized quantities are refused', () async {
      await expectLater(svc.place(customerId: 'c', customerName: 'C', lines: []), throwsA(isA<OrderException>()));
      await expectLater(svc.place(customerId: 'c', customerName: 'C', lines: [line('a', 0)]), throwsA(isA<OrderException>()));
      await expectLater(svc.place(customerId: 'c', customerName: 'C', lines: [line('a', 600), line('a', 600)]), throwsA(isA<OrderException>()));
      expect(await db.pendingCount(), 0);
    });

    test('sync sends the order once; an accepted order is replaced by the server version on the next pull (number, real price)', () async {
      final id = await svc.place(customerId: 'c1', customerName: 'Korle Pharmacy', lines: [line('a', 6)]);
      Map<String, dynamic>? sent;
      final client = MockClient((r) async {
        if (r.url.path.endsWith('/sync/push')) {
          sent = jsonDecode(r.body) as Map<String, dynamic>;
          return http.Response(jsonEncode({'ok': true, 'errors': [], 'orders': [{'id': id, 'status': 'accepted'}]}), 200);
        }
        return http.Response(
            jsonEncode({
              'cursor': 2, 'customers': [], 'plannedVisits': [], 'tasks': [],
              'products': [{'id': 'a', 'name': 'Amoxil 500', 'listPrice': 2.75}],
              'orders': [
                {
                  'id': id, 'customerId': 'c1', 'customerName': 'Korle Pharmacy', 'number': 'ORD-20261003-AB12CD', 'status': 'Confirmed', 'total': 16.5,
                  'placedAt': '2026-10-03T09:00:00Z',
                  'lines': [{'id': 'l1', 'productId': 'a', 'productName': 'Amoxil 500', 'quantity': 6, 'unitPrice': 2.75, 'lineTotal': 16.5}],
                },
              ],
            }),
            200);
      });
      expect((await syncWith(client).sync()).ok, isTrue);

      final order = (sent!['orders'] as List).single as Map;
      expect(order['id'], id);
      expect(order['customerId'], 'c1');
      expect((order['lines'] as List).single, {'productId': 'a', 'quantity': 6}); // no price goes up: the server prices it
      expect(order['placedAt'], '2026-10-03T09:00:00.000Z');

      final o = await (db.select(db.orders)..where((x) => x.id.equals(id))).getSingle();
      expect((o.dirty, o.status, o.number, o.total), (false, 'Confirmed', 'ORD-20261003-AB12CD', 16.5));
      expect((await db.linesOf(id)).single.unitPrice, 2.75);
      expect((await (db.select(db.products)..where((p) => p.id.equals('a'))).getSingle()).listPrice, 2.75);
      expect(await db.pendingCount(), 0);
    });

    test('a refused order stays on the phone with the reason, is not sent again, and can be removed', () async {
      final id = await svc.place(customerId: 'c1', customerName: 'Korle Pharmacy', lines: [line('a', 6)]);
      var pushes = 0;
      final client = MockClient((r) async {
        if (r.url.path.endsWith('/sync/push')) {
          pushes++;
          return http.Response(jsonEncode({'ok': true, 'errors': [], 'orders': [{'id': id, 'status': 'rejected', 'reason': 'Amoxil 500 has no price yet, so it cannot be ordered.'}]}), 200);
        }
        return http.Response(jsonEncode({'cursor': 2, 'customers': [], 'plannedVisits': [], 'tasks': [], 'products': [], 'orders': []}), 200);
      });
      await syncWith(client).sync();
      var o = await (db.select(db.orders)..where((x) => x.id.equals(id))).getSingle();
      expect((o.status, o.rejectReason), ('Rejected', 'Amoxil 500 has no price yet, so it cannot be ordered.'));
      expect(await db.pendingCount(), 0);
      await syncWith(client).sync();
      expect(pushes, 1);
      expect(await svc.discard(id), isTrue);
      expect(await db.select(db.orders).get(), isEmpty);
      expect(await db.linesOf(id), isEmpty);
    });

    test('a pull never overwrites an order that is still waiting to be sent, and an order the server holds cannot be discarded', () async {
      final id = await svc.place(customerId: 'c1', customerName: 'Korle Pharmacy', lines: [line('a', 2)]);
      await db.applyPull({'cursor': 1, 'orders': [{'id': id, 'customerId': 'c1', 'customerName': 'X', 'status': 'Delivered', 'total': 1, 'placedAt': '2026-10-03T09:00:00Z', 'lines': []}]});
      expect((await (db.select(db.orders)..where((x) => x.id.equals(id))).getSingle()).status, 'Placed');
      await (db.update(db.orders)..where((x) => x.id.equals(id))).write(const OrdersCompanion(dirty: Value(false)));
      expect(await svc.discard(id), isFalse);
    });
  });

  group('order screens', () {
    late AppDatabase db;
    setUp(() => db = AppDatabase(NativeDatabase.memory()));

    Future<void> settle(WidgetTester tester) async {
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 60)));
      await tester.pump();
    }

    Future<void> run(WidgetTester tester, Widget screen, Future<void> Function() body) async {
      tester.view.physicalSize = const Size(800, 2600);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(ProviderScope(overrides: [databaseProvider.overrideWithValue(db)], child: MaterialApp(home: Scaffold(body: screen))));
      await settle(tester);
      await body();
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(seconds: 1));
      await tester.runAsync(db.close);
    }

    testWidgets('a large quantity has to be confirmed by name before the order is saved', (tester) async {
      await db.into(db.products).insert(ProductsCompanion.insert(id: 'a', name: 'Amoxil 500', listPrice: const Value(2.5)));
      await run(tester, const OrderScreen(customerId: 'c1', customerName: 'Korle Pharmacy'), () async {
        await tester.tap(find.text('Add a product'));
        await settle(tester);
        await tester.pump(const Duration(milliseconds: 500)); // the sheet slides in
        await tester.tap(find.text('Amoxil 500'));
        await settle(tester);
        await tester.pump(const Duration(milliseconds: 500));
        await tester.enterText(find.byType(TextField).first, '100');
        await tester.pump();
        await tester.tap(find.text('Save order'));
        await tester.pump();
        expect(find.text('100 × Amoxil 500. Is this right?'), findsOneWidget);
        await tester.tap(find.text('No, change it'));
        await tester.pump();
        expect(await db.select(db.orders).get(), isEmpty);

        await tester.tap(find.text('Save order'));
        await tester.pump();
        await tester.tap(find.text('Yes, it is right'));
        await settle(tester);
        final saved = await tester.runAsync(() => db.select(db.orders).get());
        expect(saved!.single.total, 250.0);
      });
    });

    testWidgets('only digits can be typed as a quantity, and a product without a price cannot be picked', (tester) async {
      await db.into(db.products).insert(ProductsCompanion.insert(id: 'a', name: 'Amoxil 500', listPrice: const Value(2.5)));
      await db.into(db.products).insert(ProductsCompanion.insert(id: 'n', name: 'New Syrup'));
      await run(tester, const OrderScreen(customerId: 'c1', customerName: 'Korle Pharmacy'), () async {
        await tester.tap(find.text('Add a product'));
        await settle(tester);
        await tester.pump(const Duration(milliseconds: 500)); // the sheet slides in
        expect(find.text('No price yet, cannot be ordered'), findsOneWidget);
        await tester.tap(find.text('New Syrup'), warnIfMissed: false);
        await tester.pump();
        expect(find.text('Qty'), findsNothing); // nothing was added
        await tester.tap(find.text('Amoxil 500'));
        await settle(tester);
        await tester.pump(const Duration(milliseconds: 500));
        await tester.enterText(find.byType(TextField).first, '1a.5-');
        await tester.pump();
        expect(tester.widget<TextField>(find.byType(TextField).first).controller!.text, '15');
      });
    });

    testWidgets('the Orders tab shows what is waiting to be sent, what was refused and why', (tester) async {
      await db.into(db.orders).insert(OrdersCompanion.insert(id: 'o1', customerId: 'c1', customerName: 'Korle Pharmacy', placedAt: '2026-10-03T09:00:00Z', total: const Value(25)));
      await db.into(db.orders).insert(OrdersCompanion.insert(
          id: 'o2', customerId: 'c2', customerName: 'Kumasi Pharmacy', placedAt: '2026-10-03T08:00:00Z', status: const Value('Rejected'), rejectReason: const Value('Unknown product.')));
      await db.into(db.orders).insert(OrdersCompanion.insert(
          id: 'o3', customerId: 'c3', customerName: 'Tema Pharmacy', placedAt: '2026-10-02T08:00:00Z', status: const Value('Delivered'), dirty: const Value(false), total: const Value(40), number: const Value('ORD-1')));
      await run(tester, const OrdersTab(), () async {
        expect(find.text('Waiting to send'), findsOneWidget);
        expect(find.textContaining('25.00'), findsOneWidget);
        expect(find.text('Not accepted'), findsOneWidget);
        expect(find.textContaining('Unknown product.'), findsOneWidget);
        expect(find.text('Delivered'), findsOneWidget);
      });
    });
  });
}
