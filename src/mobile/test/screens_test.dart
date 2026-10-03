import 'package:das_engage/data/database.dart';
import 'package:das_engage/providers.dart';
import 'package:das_engage/services/location_service.dart';
import 'package:das_engage/ui/customer_detail_screen.dart';
import 'package:das_engage/ui/customer_form_screen.dart';
import 'package:das_engage/ui/notifications_screen.dart';
import 'package:das_engage/ui/problems_screen.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _Here implements LocationProvider {
  @override
  Future<Fix?> current() async => const Fix(5.6, -0.2, 5);
}

void main() {
  late AppDatabase db;

  setUp(() => db = AppDatabase(NativeDatabase.memory()));

  // Database work runs on real time; give it a moment, then draw the result.
  Future<void> settle(WidgetTester tester) async {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
    await tester.pump();
  }

  /// A widget test that, when its body is done, unmounts the screen so drift's streams stop, closes the database on real time,
  /// and lets the last timers fire; otherwise the framework reports pending timers.
  void uiTest(String name, Future<void> Function(WidgetTester tester) body) {
    testWidgets(name, (tester) async {
      tester.view.physicalSize = const Size(800, 2600); // tall, so lazily built lists show everything
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await body(tester);
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(seconds: 1)); // fires drift's stream clean-up timers
      await tester.runAsync(db.close);
    });
  }

  Future<void> show(WidgetTester tester, Widget screen) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [databaseProvider.overrideWithValue(db), locationProvider.overrideWithValue(_Here())],
      child: MaterialApp(home: screen),
    ));
    await settle(tester);
  }

  group('Problem items', () {
    uiTest('lists what the server refused, with the reason, and says so when there is nothing', (tester) async {
      await show(tester, const ProblemsScreen());
      expect(find.textContaining('Nothing was refused'), findsOneWidget);

      await tester.runAsync(() => db.recordProblem('v1', 'visit', 'Visit to Dr Ama on 2026-10-01', 'This customer is not available any more.'));
      await settle(tester);
      expect(find.text('Visit to Dr Ama on 2026-10-01'), findsOneWidget);
      expect(find.text('This customer is not available any more.'), findsOneWidget);
    });

    uiTest('remove asks first, and then deletes the visit from the phone', (tester) async {
      await tester.runAsync(() async {
        await db.applyPull({'customers': [{'id': 'c1', 'type': 'Doctor', 'name': 'Dr Ama'}]});
        await db.into(db.visits).insert(VisitsCompanion.insert(id: 'v1', customerId: 'c1', checkInAt: '2026-10-01T08:00:00Z', dirty: const Value(false)));
        await db.recordProblem('v1', 'visit', 'Visit to Dr Ama', 'Refused');
      });
      await show(tester, const ProblemsScreen());

      await tester.tap(find.byTooltip('Remove from this phone'));
      await tester.pumpAndSettle();
      expect(find.textContaining('never accepted by the server'), findsOneWidget);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(await tester.runAsync(() => db.select(db.visits).get()), hasLength(1));

      await tester.tap(find.byTooltip('Remove from this phone'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Remove'));
      await tester.pumpAndSettle();
      await settle(tester);
      expect(await tester.runAsync(() => db.select(db.visits).get()), isEmpty);
      expect(find.textContaining('Nothing was refused'), findsOneWidget);
    });
  });

  group('Notices', () {
    uiTest('shows recalls first-class and marks them read one by one or all at once', (tester) async {
      await tester.runAsync(() => db.applyPull({
            'notifications': [
              {'id': 'n1', 'kind': 'batch.recalled', 'title': 'Recall: Amoxil batch B-1', 'body': 'You hold 10 unit(s).', 'createdAt': '2026-10-02T08:00:00Z'},
              {'id': 'n2', 'kind': 'batch.quarantined', 'title': 'Quarantined: Cardiostat batch C-2', 'body': null, 'createdAt': '2026-10-02T09:00:00Z'},
            ],
          }));
      await show(tester, const NotificationsScreen());
      expect(find.text('Recall: Amoxil batch B-1'), findsOneWidget);
      expect(find.textContaining('You hold 10 unit(s).'), findsOneWidget);
      expect(find.byTooltip('Mark read'), findsNWidgets(2));

      await tester.tap(find.byTooltip('Mark read').first);
      await settle(tester);
      expect(find.byTooltip('Mark read'), findsOneWidget);
      expect(await tester.runAsync(() => db.watchUnreadCount().first), 1);

      await tester.tap(find.text('Mark all read'));
      await settle(tester);
      expect(find.byTooltip('Mark read'), findsNothing);
      expect(await tester.runAsync(() => db.watchUnreadCount().first), 0);
    });

    uiTest('says when there is nothing', (tester) async {
      await show(tester, const NotificationsScreen());
      expect(find.text('No notices.'), findsOneWidget);
    });
  });

  group('Customer form', () {
    uiTest('refuses an empty name with a clear message and adds a valid customer for upload', (tester) async {
      await show(tester, const CustomerFormScreen());
      await tester.tap(find.widgetWithText(FilledButton, 'Add customer'));
      await settle(tester);
      expect(find.text('Enter the customer\'s name.'), findsOneWidget);
      expect(await tester.runAsync(() => db.select(db.customers).get()), isEmpty);

      await tester.enterText(find.widgetWithText(TextField, 'Name'), 'Ernest Chemists');
      await tester.enterText(find.widgetWithText(TextField, 'City'), 'Accra');
      await tester.tap(find.widgetWithText(FilledButton, 'Add customer'));
      await settle(tester);
      final saved = (await tester.runAsync(() => db.select(db.customers).get()))!.single;
      expect(saved.name, 'Ernest Chemists');
      expect(saved.city, 'Accra');
      expect(saved.type, 'Pharmacy');
      expect(saved.latitude, 5.6); // "use where I am now" is on for a new customer
      expect(saved.dirty, isTrue);
    });

    uiTest('editing changes the existing customer and marks it for upload', (tester) async {
      await tester.runAsync(() => db.applyPull({'customers': [{'id': 'c1', 'type': 'Doctor', 'name': 'Dr Ama', 'city': 'Accra'}]}));
      final existing = (await tester.runAsync(() => db.customer('c1')))!;
      await show(tester, CustomerFormScreen(customer: existing));
      expect(find.text('Edit customer'), findsOneWidget);
      await tester.enterText(find.widgetWithText(TextField, 'City'), 'Tema');
      await tester.tap(find.widgetWithText(FilledButton, 'Save'));
      await settle(tester);
      final row = (await tester.runAsync(() => db.customer('c1')))!;
      expect(row.city, 'Tema');
      expect(row.dirty, isTrue);
      expect(row.latitude, isNull, reason: 'the position is only changed when asked');
    });
  });

  group('Customer detail', () {
    uiTest('shows the details, upcoming plans and recent visits, and flags a change that is not uploaded yet', (tester) async {
      await tester.runAsync(() async {
        await db.applyPull({
          'customers': [{'id': 'c1', 'type': 'Doctor', 'name': 'Dr Ama', 'specialty': 'Cardiology', 'segment': 'A', 'city': 'Accra', 'phone': '0240000000', 'targetVisitsPerMonth': 4}],
        });
        await db.into(db.visits).insert(VisitsCompanion.insert(id: 'v1', customerId: 'c1', checkInAt: '2026-09-20T08:00:00Z', checkOutAt: const Value('2026-09-20T08:30:00Z')));
        final tomorrow = DateTime.now().add(const Duration(days: 1));
        await db.into(db.plannedVisits).insert(PlannedVisitsCompanion.insert(
            id: 'p1', customerId: 'c1', plannedDate: '${tomorrow.year}-${tomorrow.month.toString().padLeft(2, '0')}-${tomorrow.day.toString().padLeft(2, '0')}', objective: const Value('Introduce range')));
      });
      await show(tester, const CustomerDetailScreen(customerId: 'c1'));
      await settle(tester); // the lists below the header start loading once the customer has arrived
      expect(find.text('Dr Ama'), findsWidgets);
      expect(find.text('Cardiology · Segment A'), findsOneWidget);
      expect(find.text('0240000000'), findsOneWidget);
      expect(find.text('4 visits a month'), findsOneWidget);
      expect(find.text('Introduce range'), findsOneWidget);
      expect(find.text('Done'), findsOneWidget);
      expect(find.text('Not uploaded yet'), findsNothing);

      await tester.runAsync(() => (db.update(db.customers)..where((c) => c.id.equals('c1'))).write(const CustomersCompanion(dirty: Value(true))));
      await settle(tester);
      expect(find.text('Not uploaded yet'), findsOneWidget);
    });

    uiTest('a customer that is gone says so instead of failing', (tester) async {
      await show(tester, const CustomerDetailScreen(customerId: 'nope'));
      expect(find.text('This customer is no longer on the device.'), findsOneWidget);
    });
  });
}
