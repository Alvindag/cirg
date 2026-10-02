import 'dart:async';
import 'dart:io';

import 'package:das_engage/services/api_client.dart';
import 'package:das_engage/services/sync_explain.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

void main() {
  const addr = 'http://192.168.1.20:5111';

  test('says what is wrong in words a person can act on', () {
    expect(explainSyncFailure(TimeoutException('x'), addr), allOf(contains(addr), contains('same Wi-Fi'), contains('firewall')));
    expect(explainSyncFailure(const SocketException('Connection refused', osError: OSError('Connection refused', 111)), addr), contains('refused the connection'));
    expect(explainSyncFailure(http.ClientException('Failed host lookup: \'foo\''), 'http://foo'), contains('Cannot find http://foo'));
    expect(explainSyncFailure(const SocketException('Network is unreachable'), addr), contains('no route'));
    expect(explainSyncFailure(http.ClientException('Cleartext HTTP traffic not permitted'), 'http://x'), contains('https'));
    expect(explainSyncFailure(ApiException(404, 'nope'), addr), allOf(contains('not found'), contains('user may not exist')));
    expect(explainSyncFailure(ApiException(500, 'boom'), addr), contains('code 500'));
    expect(explainSyncFailure(http.ClientException('something odd'), addr), contains('Cannot reach'));
  });

  test('copes with an empty address and unknown errors, and always reassures that changes are safe', () {
    expect(explainSyncFailure(TimeoutException('x'), ''), contains('the server'));
    expect(explainSyncFailure(StateError('weird'), addr), contains('safe on this phone'));
  });
}
