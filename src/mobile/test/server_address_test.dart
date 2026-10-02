import 'package:das_engage/services/server_address.dart';
import 'package:das_engage/services/sync_explain.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('accepts real addresses and tidies them', () {
    expect(normalizeServerAddress('https://api.test'), 'https://api.test');
    expect(normalizeServerAddress('  http://192.168.1.20:5111/  '), 'http://192.168.1.20:5111');
    expect(normalizeServerAddress('192.168.1.20:5111'), 'http://192.168.1.20:5111'); // a development server: plain http
    expect(normalizeServerAddress('localhost:5111'), 'http://localhost:5111');
    expect(normalizeServerAddress('api.dasplc.com'), 'https://api.dasplc.com');
  });

  test('refuses what would fail every sync later (the bug where the field held only "https://")', () {
    for (final bad in ['', '   ', 'https://', 'http://', 'https:/', 'ftp://server']) {
      expect(() => normalizeServerAddress(bad), throwsA(isA<ServerAddressException>()), reason: '"$bad"');
    }
    expect(() => normalizeServerAddress('https://'), throwsA(predicate((e) => '$e'.contains('not complete'))));
  });

  test('an already saved bad address is explained, not just shown as an error', () {
    final e = ArgumentError('No host specified in URI https:/api/v1/sync/pull?since=0');
    expect(explainSyncFailure(e, 'https://'), allOf(contains('incomplete'), contains('Sign out')));
  });
}
