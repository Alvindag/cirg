import 'dart:convert';

/// Reads the (unverified) payload of a JWT. Only for display and local bookkeeping such as "which user owns this device's data";
/// the server always validates the token itself.
Map<String, dynamic> jwtClaims(String token) {
  final parts = token.split('.');
  if (parts.length != 3) return {};
  try {
    final payload = utf8.decode(base64Url.decode(base64Url.normalize(parts[1])));
    return jsonDecode(payload) as Map<String, dynamic>;
  } catch (_) {
    return {};
  }
}
