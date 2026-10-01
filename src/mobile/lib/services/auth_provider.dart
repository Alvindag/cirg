import 'package:flutter/services.dart';
import 'package:flutter_appauth/flutter_appauth.dart';

import '../config.dart';

class AuthTokens {
  const AuthTokens({required this.accessToken, required this.expiresAt, this.refreshToken});
  final String accessToken;
  final String? refreshToken;
  final DateTime expiresAt;
}

/// The user closed the sign-in window.
class AuthCancelled implements Exception {
  @override
  String toString() => 'Sign-in cancelled.';
}

/// The refresh token was rejected (revoked, expired, password changed, access removed): the user must sign in again.
class AuthRevoked implements Exception {
  @override
  String toString() => 'Your session has expired. Please sign in again.';
}

abstract class AuthProvider {
  /// Interactive sign-in (system browser, authorization code + PKCE; MFA and conditional access are enforced by Entra).
  Future<AuthTokens> signIn({required String tenant});

  /// Silent token refresh. Throws [AuthRevoked] only when Entra refuses; network errors are rethrown unchanged.
  Future<AuthTokens> refresh({required String tenant, required String refreshToken});
}

class AppAuthProvider implements AuthProvider {
  AppAuthProvider([FlutterAppAuth? appAuth]) : _appAuth = appAuth ?? const FlutterAppAuth();
  final FlutterAppAuth _appAuth;

  static List<String> get _scopes => ['openid', 'profile', 'offline_access', AppConfig.apiScope];

  static String _discovery(String tenant) => 'https://login.microsoftonline.com/$tenant/v2.0/.well-known/openid-configuration';

  @override
  Future<AuthTokens> signIn({required String tenant}) async {
    try {
      final r = await _appAuth.authorizeAndExchangeCode(AuthorizationTokenRequest(
        AppConfig.entraClientId,
        AppConfig.redirectUrl,
        discoveryUrl: _discovery(tenant),
        scopes: _scopes,
        promptValues: const ['select_account'],
      ));
      return _tokens(r.accessToken, r.refreshToken, r.accessTokenExpirationDateTime);
    } on FlutterAppAuthUserCancelledException {
      throw AuthCancelled();
    }
  }

  @override
  Future<AuthTokens> refresh({required String tenant, required String refreshToken}) async {
    try {
      final r = await _appAuth.token(TokenRequest(
        AppConfig.entraClientId,
        AppConfig.redirectUrl,
        discoveryUrl: _discovery(tenant),
        refreshToken: refreshToken,
        scopes: _scopes,
      ));
      // Entra rotates refresh tokens; keep the old one if none is returned.
      return _tokens(r.accessToken, r.refreshToken ?? refreshToken, r.accessTokenExpirationDateTime);
    } on PlatformException catch (e) {
      // AppAuth reports an OAuth error response (invalid_grant, interaction_required...) as a token-endpoint error.
      final text = '${e.code} ${e.message} ${e.details}'.toLowerCase();
      if (text.contains('invalid_grant') || text.contains('interaction_required') || text.contains('invalid_client')) throw AuthRevoked();
      rethrow;
    }
  }

  AuthTokens _tokens(String? access, String? refresh, DateTime? expires) {
    if (access == null) throw StateError('Sign-in returned no access token.');
    return AuthTokens(
      accessToken: access,
      refreshToken: refresh,
      expiresAt: expires ?? DateTime.now().add(const Duration(minutes: 50)),
    );
  }
}
