import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'api_client.dart';
import 'session_manager.dart';

/// Keeps tokens in the OS keychain (iOS) / Keystore-backed encrypted storage (Android).
class SessionStore implements SessionStorage {
  SessionStore([FlutterSecureStorage? storage]) : _s = storage ?? const FlutterSecureStorage();
  final FlutterSecureStorage _s;

  @override
  Future<Session?> load() async {
    final url = await _s.read(key: 'baseUrl');
    final token = await _s.read(key: 'accessToken');
    final tenant = await _s.read(key: 'tenant');
    final expires = DateTime.tryParse(await _s.read(key: 'expiresAt') ?? '');
    if (url == null || token == null || tenant == null || expires == null) return null;
    return Session(
      baseUrl: url,
      accessToken: token,
      expiresAt: expires,
      tenant: tenant,
      refreshToken: await _s.read(key: 'refreshToken'),
      userId: await _s.read(key: 'userId'),
    );
  }

  @override
  Future<void> save(Session s) async {
    await _s.write(key: 'baseUrl', value: s.baseUrl);
    await _s.write(key: 'accessToken', value: s.accessToken);
    await _s.write(key: 'expiresAt', value: s.expiresAt.toUtc().toIso8601String());
    await _s.write(key: 'tenant', value: s.tenant);
    if (s.refreshToken != null) {
      await _s.write(key: 'refreshToken', value: s.refreshToken);
    } else {
      await _s.delete(key: 'refreshToken');
    }
    if (s.userId != null) {
      await _s.write(key: 'userId', value: s.userId);
    } else {
      await _s.delete(key: 'userId');
    }
  }

  @override
  Future<void> clear() => _s.deleteAll();
}
