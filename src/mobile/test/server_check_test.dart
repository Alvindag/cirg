import 'dart:async';
import 'dart:io';

import 'package:das_engage/services/server_check.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('says connected when the server is ready, and returns the tidied address', () async {
    late Uri asked;
    final c = MockClient((r) async { asked = r.url; return http.Response('Healthy', 200); });
    final r = await checkServer(' 192.168.1.148:5111 ', client: c);
    expect(r.ok, isTrue);
    expect(r.address, 'http://192.168.1.148:5111');
    expect(asked.toString(), 'http://192.168.1.148:5111/health/ready');
    expect(r.message, contains('ready'));
  });

  test('refuses an unfinished address without touching the network', () async {
    var called = false;
    final c = MockClient((r) async { called = true; return http.Response('', 200); });
    final r = await checkServer('https://', client: c);
    expect(r.ok, isFalse);
    expect(r.message, contains('not complete'));
    expect(called, isFalse);
  });

  test('explains what a wrong port, a not-ready server and a timeout mean', () async {
    expect((await checkServer('http://10.0.0.5:5111', client: MockClient((r) async => http.Response('', 404)))).message, contains('does not look like the DAS Engage server'));
    expect((await checkServer('http://10.0.0.5:5111', client: MockClient((r) async => http.Response('', 503)))).message, allOf(contains('not ready'), contains('database')));
    final slow = await checkServer('http://10.0.0.5', client: MockClient((r) => Completer<http.Response>().future), timeout: const Duration(milliseconds: 50));
    expect(slow.ok, isFalse);
    expect(slow.message, contains('no port number')); // the usual cause of "no answer" on a plain-http address
    final refused = await checkServer('http://10.0.0.5:5111', client: MockClient((r) async => throw const SocketException('Connection refused')));
    expect(refused.message, contains('refused the connection'));
  });
}
