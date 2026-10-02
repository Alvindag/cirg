import 'dart:async';

import '../data/database.dart';
import 'api_client.dart';
import 'auth_provider.dart';
import 'jwt.dart';
import 'server_address.dart';

abstract class SessionStorage {
  Future<Session?> load();
  Future<void> save(Session s);
  Future<void> clear();
}

/// A different user last used this device and still has changes that were never uploaded.
class DeviceOwnedByAnotherUser implements Exception {
  @override
  String toString() => 'This device holds unsynced data from another user. They must sign in and sync before you can use it.';
}

/// Owns the sign-in state: interactive Entra sign-in, silent token refresh, sign-out, and the "whose data is on this device" check.
class SessionManager {
  SessionManager({required this.auth, required this.store, required this.db, DateTime Function()? now}) : _now = now ?? DateTime.now;

  final AuthProvider auth;
  final SessionStorage store;
  final AppDatabase db;
  final DateTime Function() _now;

  static const _refreshMargin = Duration(minutes: 2);

  Session? current;
  void Function(Session?)? onChange;
  Future<String?>? _refreshing;

  void _set(Session? s) {
    current = s;
    onChange?.call(s);
  }

  Future<void> restore() async => _set(await store.load());

  Future<void> signInEntra({required String tenant, required String baseUrl}) async {
    baseUrl = normalizeServerAddress(baseUrl); // before opening the browser, so a typing mistake is reported straight away
    final t = await auth.signIn(tenant: tenant);
    await _adopt(Session(
      baseUrl: baseUrl,
      accessToken: t.accessToken,
      expiresAt: t.expiresAt,
      refreshToken: t.refreshToken,
      tenant: tenant,
      userId: _userId(t.accessToken),
    ));
  }

  /// Development only: paste a token minted for the API's dev signing key.
  Future<void> signInDev({required String baseUrl, required String token}) => _adopt(Session(
        baseUrl: normalizeServerAddress(baseUrl),
        accessToken: token,
        expiresAt: DateTime.fromMillisecondsSinceEpoch(((jwtClaims(token)['exp'] as num?)?.toInt() ?? 0) * 1000, isUtc: true),
        tenant: 'dev',
        userId: _userId(token),
      ));

  static String? _userId(String token) {
    final c = jwtClaims(token);
    return (c['oid'] ?? c['das_uid'] ?? c['sub']) as String?;
  }

  Future<void> _adopt(Session s) async {
    final user = s.userId;
    if (user != null) {
      final owner = await db.getState('owner');
      if (owner != null && owner != user) {
        if (await db.pendingCount() > 0) throw DeviceOwnedByAnotherUser();
        await db.wipe(); // never show one rep's customers or call reports to another
      }
      await db.setState('owner', user);
    }
    await store.save(s);
    _set(s);
  }

  /// Local data stays on the device (the same user may sign back in offline); only the tokens are removed.
  Future<void> signOut() async {
    await store.clear();
    _set(null);
  }

  /// A valid access token, refreshing silently when it is about to expire (or when [force] says the server rejected it).
  Future<String?> accessToken({bool force = false}) async {
    final s = current;
    if (s == null) return null;
    final fresh = s.expiresAt.isAfter(_now().add(_refreshMargin));
    if (!force && fresh) return s.accessToken;
    if (s.refreshToken == null) return !force && s.expiresAt.isAfter(_now()) ? s.accessToken : null;
    return _refreshing ??= _refresh(s).whenComplete(() => _refreshing = null);
  }

  Future<String?> _refresh(Session s) async {
    try {
      final t = await auth.refresh(tenant: s.tenant, refreshToken: s.refreshToken!);
      final next = s.copyWith(accessToken: t.accessToken, refreshToken: t.refreshToken ?? s.refreshToken, expiresAt: t.expiresAt);
      await store.save(next);
      _set(next);
      return next.accessToken;
    } on AuthRevoked {
      await signOut();
      return null;
    } catch (_) {
      // Offline or Entra unreachable: keep the session; use the old token while it is still valid.
      if (s.expiresAt.isAfter(_now())) return s.accessToken;
      rethrow;
    }
  }
}
