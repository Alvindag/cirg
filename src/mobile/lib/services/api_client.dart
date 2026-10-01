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

class Session {
  const Session({required this.baseUrl, required this.token});
  final String baseUrl;
  final String token;
}

/// Thin JSON client for the DAS Engage API. Throws [ApiException] on non-2xx.
class ApiClient {
  ApiClient(this._http, this._session);

  final http.Client _http;
  final Session Function() _session;

  Map<String, String> get _headers =>
      {'Authorization': 'Bearer ${_session().token}', 'Content-Type': 'application/json'};

  Uri _uri(String path, [Map<String, String>? query]) =>
      Uri.parse('${_session().baseUrl.replaceAll(RegExp(r'/+$'), '')}/api/v1$path').replace(queryParameters: query);

  Future<Map<String, dynamic>> pull(int sinceTicks) async =>
      _decode(await _http.get(_uri('/sync/pull', {'since': '$sinceTicks'}), headers: _headers).timeout(const Duration(seconds: 60)));

  Future<Map<String, dynamic>> push(Map<String, dynamic> payload) async => _decode(await _http
      .post(_uri('/sync/push'), headers: _headers, body: jsonEncode(payload))
      .timeout(const Duration(seconds: 60)));

  Map<String, dynamic> _decode(http.Response r) {
    if (r.statusCode < 200 || r.statusCode >= 300) throw ApiException(r.statusCode, r.body);
    return jsonDecode(r.body) as Map<String, dynamic>;
  }
}
