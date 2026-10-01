import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'api_client.dart';

/// Keeps the API address and access token in the OS keychain/keystore.
/// TODO: replace the pasted dev token with Entra ID sign-in (MSAL / OIDC with PKCE) and refresh tokens.
class SessionStore {
  SessionStore([FlutterSecureStorage? storage]) : _s = storage ?? const FlutterSecureStorage();
  final FlutterSecureStorage _s;

  Future<Session?> load() async {
    final url = await _s.read(key: 'baseUrl');
    final token = await _s.read(key: 'token');
    return url == null || token == null ? null : Session(baseUrl: url, token: token);
  }

  Future<void> save(Session s) async {
    await _s.write(key: 'baseUrl', value: s.baseUrl);
    await _s.write(key: 'token', value: s.token);
  }

  Future<void> clear() async {
    await _s.delete(key: 'baseUrl');
    await _s.delete(key: 'token');
  }
}
