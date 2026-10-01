import 'dart:convert';

import 'package:http/http.dart' as http;

class ApiException implements Exception {
  ApiException(this.statusCode, this.message);
  final int statusCode;
  final String message;
  bool get isAuth => statusCode == 401 || statusCode == 403;
  @override
  String toString() => 'ApiException($statusCode): $message';
}

/// The signed-in user's connection details.
class Session {
  const Session({
    required this.baseUrl,
    required this.accessToken,
    required this.expiresAt,
    required this.tenant,
    this.refreshToken,
    this.userId,
  });

  final String baseUrl;
  final String accessToken;
  final DateTime expiresAt;
  final String? refreshToken;

  /// Directory the user signed in to (used for silent refresh).
  final String tenant;

  /// Entra object id (oid) of the user; identifies who owns the data on this device.
  final String? userId;

  Session copyWith({String? accessToken, String? refreshToken, DateTime? expiresAt}) => Session(
        baseUrl: baseUrl,
        accessToken: accessToken ?? this.accessToken,
        refreshToken: refreshToken ?? this.refreshToken,
        expiresAt: expiresAt ?? this.expiresAt,
        tenant: tenant,
        userId: userId,
      );
}

/// Thin JSON client for the DAS Engage API. Throws [ApiException] on non-2xx.
/// A 401 triggers one forced token refresh and a retry before giving up.
class ApiClient {
  ApiClient(this._http, {required this.baseUrl, required this.accessToken});

  final http.Client _http;
  final String Function() baseUrl;

  /// Returns a valid access token (refreshing if needed), or null when signed out.
  final Future<String?> Function({bool force}) accessToken;

  Uri _uri(String path, [Map<String, String>? query]) =>
      Uri.parse('${baseUrl().replaceAll(RegExp(r'/+$'), '')}/api/v1$path').replace(queryParameters: query);

  Future<Map<String, dynamic>> pull(int sinceTicks) => _send((h) => _http.get(_uri('/sync/pull', {'since': '$sinceTicks'}), headers: h));

  Future<Map<String, dynamic>> push(Map<String, dynamic> payload) =>
      _send((h) => _http.post(_uri('/sync/push'), headers: {...h, 'Content-Type': 'application/json'}, body: jsonEncode(payload)));

  Future<Map<String, dynamic>> _send(Future<http.Response> Function(Map<String, String> headers) call) async {
    final r = await _request(call);
    if (r.statusCode < 200 || r.statusCode >= 300) throw ApiException(r.statusCode, r.body);
    return jsonDecode(r.body) as Map<String, dynamic>;
  }

  /// Sends the request; a 401 triggers one forced token refresh and a retry. Does not throw on 4xx/5xx.
  Future<http.Response> _request(Future<http.Response> Function(Map<String, String> headers) call,
      {Duration timeout = const Duration(seconds: 60)}) async {
    Future<http.Response> attempt({bool force = false}) async {
      final token = await accessToken(force: force);
      if (token == null) throw ApiException(401, 'Not signed in.');
      return call({'Authorization': 'Bearer $token'}).timeout(timeout);
    }

    final r = await attempt();
    return r.statusCode == 401 ? attempt(force: true) : r;
  }

  /// Uploads a file (photo, voice note, signature). Returns the response so the caller can tell permanent rejections (400/413/415)
  /// from temporary failures.
  Future<http.Response> putBytes(String path, List<int> bytes,
          {required String contentType, required String sha256, Map<String, String>? query}) =>
      _request(
        (h) => _http.put(_uri(path, query), headers: {...h, 'Content-Type': contentType, 'X-Content-SHA256': sha256}, body: bytes),
        timeout: const Duration(minutes: 3),
      );
}
