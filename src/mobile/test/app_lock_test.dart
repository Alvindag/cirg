import 'dart:math';

import 'package:das_engage/data/database.dart';
import 'package:das_engage/providers.dart';
import 'package:das_engage/services/api_client.dart';
import 'package:das_engage/services/app_lock.dart';
import 'package:das_engage/services/auth_provider.dart';
import 'package:das_engage/services/session_manager.dart';
import 'package:das_engage/ui/lock_screen.dart';
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class MemorySecrets implements SecretStore {
  final map = <String, String>{};
  @override
  Future<String?> read(String key) async => map[key];
  @override
  Future<void> write(String key, String value) async => map[key] = value;
  @override
  Future<void> delete(String key) async => map.remove(key);
}

class FakeBiometrics implements Biometrics {
  bool isAvailable = true;
  bool passes = true;
  int prompts = 0;
  @override
  Future<bool> available() async => isAvailable;
  @override
  Future<bool> authenticate(String reason) async {
    prompts++;
    return passes;
  }
}

class _NoAuth implements AuthProvider {
  @override
  Future<AuthTokens> signIn({required String tenant}) => throw UnimplementedError();
  @override
  Future<AuthTokens> refresh({required String tenant, required String refreshToken}) => throw UnimplementedError();
}

class _MemSession implements SessionStorage {
  Session? saved;
  @override
  Future<Session?> load() async => saved;
  @override
  Future<void> save(Session s) async => saved = s;
  @override
  Future<void> clear() async => saved = null;
}

/// Records sign-outs instead of touching the keychain.
class RecordingSessions extends SessionManager {
  RecordingSessions(AppDatabase db) : super(auth: _NoAuth(), store: _MemSession(), db: db);
  int signOuts = 0;
  @override
  Future<void> signOut() async {
    signOuts++;
    _set(null);
  }

  void _set(Session? s) {
    current = s;
    onChange?.call(s);
  }

  void signedIn() => _set(Session(baseUrl: 'https://x', accessToken: 't', expiresAt: DateTime.utc(2030), tenant: 'dev'));
}

void main() {
  late MemorySecrets secrets;
  late FakeBiometrics bio;
  late AppLock lock;

  setUp(() {
    secrets = MemorySecrets();
    bio = FakeBiometrics();
    lock = AppLock(secrets, bio, random: Random(1));
  });

  group('AppLock', () {
    test('only strong 4 to 8 digit PINs are accepted', () async {
      for (final weak in ['123', '123456789', 'abcd', '1111', '0000', '1234', '4321', '6789', '12 34', '']) {
        await expectLater(lock.enable(weak), throwsA(isA<WeakPinException>()), reason: weak);
      }
      expect(await lock.isEnabled, isFalse);
      await lock.enable('2580');
      expect(await lock.isEnabled, isTrue);
    });

    test('the PIN itself is never stored', () async {
      await lock.enable('48291');
      expect(secrets.map.values.any((v) => v.contains('48291')), isFalse);
      expect(secrets.map['lock.hash'], isNotEmpty);
      // two phones with the same PIN do not share a hash
      final other = MemorySecrets();
      await AppLock(other, bio, random: Random(2)).enable('48291');
      expect(other.map['lock.hash'], isNot(secrets.map['lock.hash']));
    });

    test('a wrong PIN counts down, the right one resets the count, and five wrong ones in a row end it', () async {
      await lock.enable('2580');
      var r = await lock.unlockWithPin('1111');
      expect(r.outcome, UnlockOutcome.wrongPin);
      expect(r.attemptsLeft, 4);
      expect((await lock.unlockWithPin('2580')).ok, isTrue);
      expect((await lock.unlockWithPin('9999')).attemptsLeft, 4); // back to a full set of attempts

      for (var i = 0; i < 3; i++) {
        await lock.unlockWithPin('9999');
      }
      r = await lock.unlockWithPin('9999');
      expect(r.outcome, UnlockOutcome.tooManyAttempts);
      expect((await lock.unlockWithPin('2580')).outcome, UnlockOutcome.tooManyAttempts, reason: 'even the right PIN no longer works');
    });

    test('closing the app does not reset the wrong-PIN count', () async {
      await lock.enable('2580');
      await lock.unlockWithPin('9999');
      await lock.unlockWithPin('9999');
      final reopened = AppLock(secrets, bio);
      expect((await reopened.unlockWithPin('9999')).attemptsLeft, 2);
    });

    test('turning the lock off needs the PIN', () async {
      await lock.enable('2580');
      expect(await lock.disable('0001'), isFalse);
      expect(await lock.isEnabled, isTrue);
      expect(await lock.disable('2580'), isTrue);
      expect(await lock.isEnabled, isFalse);
      expect(secrets.map, isEmpty);
    });

    test('fingerprint works only when it is on, enrolled, and passes; it never resets the PIN count', () async {
      await lock.enable('2580', biometrics: true);
      expect(await lock.unlockWithBiometrics(), isTrue);
      bio.passes = false;
      expect(await lock.unlockWithBiometrics(), isFalse);
      bio.passes = true;
      bio.isAvailable = false;
      expect(await lock.unlockWithBiometrics(), isFalse, reason: 'the fingerprint was removed from the phone');
      bio.isAvailable = true;
      await lock.setBiometrics(false);
      bio.prompts = 0;
      expect(await lock.unlockWithBiometrics(), isFalse);
      expect(bio.prompts, 0);

      await lock.unlockWithPin('9999');
      await lock.setBiometrics(true);
      await lock.unlockWithBiometrics();
      expect((await lock.unlockWithPin('9999')).attemptsLeft, 3);
    });

    test('biometrics cannot be turned on when none is enrolled, and the timeout defaults to one minute', () async {
      bio.isAvailable = false;
      await lock.enable('2580', biometrics: true);
      expect(await lock.biometricsOn, isFalse);
      expect(await lock.timeout, LockTimeout.oneMinute);
      await lock.setTimeout(LockTimeout.immediately);
      expect(await lock.timeout, LockTimeout.immediately);
    });
  });

  group('lock controller', () {
    late AppDatabase db;
    late RecordingSessions sessions;
    late ProviderContainer container;

    setUp(() {
      db = AppDatabase(NativeDatabase.memory());
      sessions = RecordingSessions(db);
      container = ProviderContainer(overrides: [
        secretStoreProvider.overrideWithValue(secrets),
        biometricsProvider.overrideWithValue(bio),
        databaseProvider.overrideWithValue(db),
        sessionManagerProvider.overrideWithValue(sessions),
      ]);
      sessions.onChange = (s) => container.read(sessionProvider.notifier).state = s;
    });
    tearDown(() async {
      container.dispose();
      await db.close();
    });

    Future<AppLockState> settled() async {
      container.read(lockControllerProvider);
      await Future<void>.delayed(const Duration(milliseconds: 20));
      return container.read(lockControllerProvider);
    }

    test('starts locked when a PIN is set and unlocked when not', () async {
      expect((await settled()).locked, isFalse);
      container.dispose();

      await lock.enable('2580');
      container = ProviderContainer(overrides: [
        secretStoreProvider.overrideWithValue(secrets),
        biometricsProvider.overrideWithValue(bio),
        databaseProvider.overrideWithValue(db),
        sessionManagerProvider.overrideWithValue(sessions),
      ]);
      final s = await settled();
      expect(s.enabled, isTrue);
      expect(s.locked, isTrue);
    });

    test('locks again only when the app was away longer than the chosen time', () async {
      await lock.enable('2580');
      await settled();
      final c = container.read(lockControllerProvider.notifier);
      expect((await c.unlock('2580')).ok, isTrue);
      expect(container.read(lockControllerProvider).locked, isFalse);

      final t0 = DateTime(2026, 10, 2, 9);
      c.paused(t0);
      await c.resumed(t0.add(const Duration(seconds: 20)));
      expect(container.read(lockControllerProvider).locked, isFalse); // a quick look at another app

      c.paused(t0);
      await c.resumed(t0.add(const Duration(minutes: 2)));
      expect(container.read(lockControllerProvider).locked, isTrue);

      await c.unlock('2580');
      await lock.setTimeout(LockTimeout.immediately);
      c.paused(t0);
      await c.resumed(t0);
      expect(container.read(lockControllerProvider).locked, isTrue);
    });

    test('five wrong PINs sign the person out and explain why', () async {
      await lock.enable('2580');
      await settled();
      sessions.signedIn();
      final c = container.read(lockControllerProvider.notifier);
      for (var i = 0; i < 4; i++) {
        expect((await c.unlock('9999')).outcome, UnlockOutcome.wrongPin);
      }
      expect((await c.unlock('9999')).outcome, UnlockOutcome.tooManyAttempts);
      expect(sessions.signOuts, 1);
      expect(container.read(signInMessageProvider), contains('Too many wrong PINs'));
    });

    test('signing out removes the PIN (a new person must set their own); forgot PIN signs out', () async {
      await lock.enable('2580');
      await settled();
      sessions.signedIn();
      await Future<void>.delayed(const Duration(milliseconds: 10));
      await container.read(lockControllerProvider.notifier).forgotPin();
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(sessions.signOuts, 1);
      expect(await lock.isEnabled, isFalse);
      expect(container.read(lockControllerProvider).locked, isFalse);
      expect(container.read(signInMessageProvider), contains('set a new PIN'));
    });

    test('enable and disable update the state', () async {
      final c = container.read(lockControllerProvider.notifier);
      await settled();
      await c.enable('2580');
      expect(container.read(lockControllerProvider).enabled, isTrue);
      c.lockNow();
      expect(container.read(lockControllerProvider).locked, isTrue);
      expect(await c.disable('0001'), isFalse);
      await c.unlock('2580');
      expect(await c.disable('2580'), isTrue);
      expect(container.read(lockControllerProvider).enabled, isFalse);
    });
  });

  group('lock screen', () {
    testWidgets('unlocks with the right PIN, shows attempts left for a wrong one, and offers a way out', (tester) async {
      await tester.runAsync(() => lock.enable('2580'));
      final db = AppDatabase(NativeDatabase.memory());
      addTearDown(() => tester.runAsync(db.close));
      final sessions = RecordingSessions(db);
      await tester.pumpWidget(ProviderScope(
        overrides: [
          secretStoreProvider.overrideWithValue(secrets),
          biometricsProvider.overrideWithValue(bio..isAvailable = false),
          databaseProvider.overrideWithValue(db),
          sessionManagerProvider.overrideWithValue(sessions),
        ],
        child: const MaterialApp(home: LockGate(child: Scaffold(body: Text('the app')))),
      ));
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 30)));
      await tester.pump();
      expect(find.text('DAS Engage 360 is locked'), findsOneWidget);
      expect(find.text('the app'), findsNothing);

      await tester.enterText(find.byType(TextField), '9999');
      await tester.tap(find.text('Unlock'));
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 400)));
      await tester.pump();
      expect(find.textContaining('Wrong PIN. 4 attempts left'), findsOneWidget);

      await tester.enterText(find.byType(TextField), '2580');
      await tester.tap(find.text('Unlock'));
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 400)));
      await tester.pump();
      expect(find.text('the app'), findsOneWidget);
      expect(find.text('DAS Engage 360 is locked'), findsNothing);
    });
  });
}
