import 'dart:convert';

import 'package:das_engage/data/database.dart';
import 'package:das_engage/services/api_client.dart';
import 'package:das_engage/services/auth_provider.dart';
import 'package:das_engage/services/jwt.dart';
import 'package:das_engage/services/session_manager.dart';
import 'package:drift/drift.dart' hide isNull, isNotNull;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

String jwt(Map<String, dynamic> claims) {
  String enc(Object o) => base64Url.encode(utf8.encode(jsonEncode(o))).replaceAll('=', '');
  return '${enc({'alg': 'none'})}.${enc(claims)}.sig';
}

class MemoryStore implements SessionStorage {
  Session? saved;
  @override
  Future<Session?> load() async => saved;
  @override
  Future<void> save(Session s) async => saved = s;
  @override
  Future<void> clear() async => saved = null;
}

class FakeAuth implements AuthProvider {
  FakeAuth(this.clock);
  final DateTime Function() clock;
  String oid = 'user-1';
  int signIns = 0;
  int refreshes = 0;
  Object? refreshError;

  @override
  Future<AuthTokens> signIn({required String tenant}) async {
    signIns++;
    return AuthTokens(accessToken: jwt({'oid': oid, 'tid': tenant}), refreshToken: 'refresh-0', expiresAt: clock().add(const Duration(hours: 1)));
  }

  @override
  Future<AuthTokens> refresh({required String tenant, required String refreshToken}) async {
    refreshes++;
    await Future<void>.delayed(const Duration(milliseconds: 5));
    if (refreshError != null) throw refreshError!;
    return AuthTokens(accessToken: jwt({'oid': oid, 'n': refreshes}), refreshToken: 'refresh-$refreshes', expiresAt: clock().add(const Duration(hours: 1)));
  }
}

void main() {
  late AppDatabase db;
  late MemoryStore store;
  late FakeAuth auth;
  late SessionManager mgr;
  var now = DateTime.utc(2026, 10, 1, 8);

  setUp(() {
    now = DateTime.utc(2026, 10, 1, 8);
    db = AppDatabase(NativeDatabase.memory());
    store = MemoryStore();
    auth = FakeAuth(() => now);
    mgr = SessionManager(auth: auth, store: store, db: db, now: () => now);
  });
  tearDown(() => db.close());

  test('jwt claims are read without verifying', () {
    expect(jwtClaims(jwt({'oid': 'abc'}))['oid'], 'abc');
    expect(jwtClaims('garbage'), isEmpty);
  });

  test('sign-in stores tokens and records the device owner', () async {
    await mgr.signInEntra(tenant: 'dasplc.com', baseUrl: 'https://api.test');
    expect(mgr.current!.userId, 'user-1');
    expect(store.saved!.refreshToken, 'refresh-0');
    expect(await db.getState('owner'), 'user-1');
  });

  test('a fresh token is reused; one near expiry is refreshed silently and the new refresh token is saved', () async {
    await mgr.signInEntra(tenant: 't', baseUrl: 'https://api.test');
    final first = await mgr.accessToken();
    expect(auth.refreshes, 0);

    now = now.add(const Duration(minutes: 59)); // inside the 2-minute margin
    final second = await mgr.accessToken();
    expect(auth.refreshes, 1);
    expect(second, isNot(first));
    expect(store.saved!.refreshToken, 'refresh-1');
  });

  test('concurrent callers share one refresh', () async {
    await mgr.signInEntra(tenant: 't', baseUrl: 'https://api.test');
    now = now.add(const Duration(minutes: 59));
    final tokens = await Future.wait([mgr.accessToken(), mgr.accessToken(), mgr.accessToken()]);
    expect(auth.refreshes, 1);
    expect(tokens.toSet().length, 1);
  });

  test('a revoked refresh token signs the user out', () async {
    await mgr.signInEntra(tenant: 't', baseUrl: 'https://api.test');
    auth.refreshError = AuthRevoked();
    now = now.add(const Duration(minutes: 59));
    expect(await mgr.accessToken(), isNull);
    expect(mgr.current, isNull);
    expect(store.saved, isNull);
  });

  test('offline refresh keeps the session while the old token is valid, and fails once it has expired', () async {
    await mgr.signInEntra(tenant: 't', baseUrl: 'https://api.test');
    final original = mgr.current!.accessToken;
    auth.refreshError = http.ClientException('no network');

    now = now.add(const Duration(minutes: 59));
    expect(await mgr.accessToken(), original); // still valid for another minute
    expect(mgr.current, isNotNull);

    now = now.add(const Duration(minutes: 5)); // expired
    await expectLater(mgr.accessToken(), throwsA(isA<http.ClientException>()));
    expect(mgr.current, isNotNull); // still signed in; sync just fails until the network returns
  });

  test('sign-out keeps local data; the same user signing back in keeps it', () async {
    await mgr.signInEntra(tenant: 't', baseUrl: 'https://api.test');
    await db.into(db.customers).insert(CustomersCompanion.insert(id: 'c1', type: 'Doctor', name: 'Dr A'));
    await mgr.signOut();
    expect(mgr.current, isNull);
    await mgr.signInEntra(tenant: 't', baseUrl: 'https://api.test');
    expect((await db.select(db.customers).get()).length, 1);
  });

  test('a different user gets a clean device, but not while the previous user has unsynced work', () async {
    await mgr.signInEntra(tenant: 't', baseUrl: 'https://api.test');
    await db.into(db.customers).insert(CustomersCompanion.insert(id: 'c1', type: 'Doctor', name: 'Dr A'));
    await db.into(db.followUpTasks).insert(FollowUpTasksCompanion.insert(id: 't1', title: 'Unsent', dirty: const Value(true)));
    await mgr.signOut();

    auth.oid = 'user-2';
    await expectLater(mgr.signInEntra(tenant: 't', baseUrl: 'https://api.test'), throwsA(isA<DeviceOwnedByAnotherUser>()));
    expect(mgr.current, isNull);
    expect((await db.select(db.customers).get()).length, 1); // nothing was deleted

    await (db.update(db.followUpTasks)).write(const FollowUpTasksCompanion(dirty: Value(false))); // user 1 synced
    await mgr.signInEntra(tenant: 't', baseUrl: 'https://api.test');
    expect(await db.select(db.customers).get(), isEmpty);
    expect(await db.getState('owner'), 'user-2');
  });

  test('dev token sign-in has no refresh token and is rejected once expired', () async {
    final token = jwt({'das_uid': 'dev-user', 'exp': now.add(const Duration(hours: 1)).millisecondsSinceEpoch ~/ 1000});
    await mgr.signInDev(baseUrl: 'https://api.test', token: token);
    expect(await mgr.accessToken(), token);
    expect(await mgr.accessToken(force: true), isNull);
    now = now.add(const Duration(hours: 2));
    expect(await mgr.accessToken(), isNull);
  });

  test('API client retries once with a forced refresh after a 401', () async {
    final tokens = <String>[];
    final client = MockClient((req) async {
      tokens.add(req.headers['Authorization']!);
      return tokens.length == 1 ? http.Response('', 401) : http.Response(jsonEncode({'cursor': 1}), 200);
    });
    final api = ApiClient(client, baseUrl: () => 'https://api.test', accessToken: ({bool force = false}) async => force ? 'new' : 'old');
    expect((await api.pull(0))['cursor'], 1);
    expect(tokens, ['Bearer old', 'Bearer new']);

    final alwaysDenied = MockClient((req) async => http.Response('', 403));
    final denied = ApiClient(alwaysDenied, baseUrl: () => 'https://api.test', accessToken: ({bool force = false}) async => 't');
    await expectLater(denied.pull(0), throwsA(isA<ApiException>().having((e) => e.statusCode, 'status', 403)));
  });
}
