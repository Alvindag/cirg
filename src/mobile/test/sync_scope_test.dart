import 'dart:convert';

import 'package:das_engage/data/database.dart';
import 'package:das_engage/services/api_client.dart';
import 'package:das_engage/services/sync_service.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// The phone tells the server which scope it last synced for, so the server can send everything again when it changed
/// (for example after a move to another territory, whose customers changed long before the phone's sync cursor).
void main() {
  late AppDatabase db;
  setUp(() => db = AppDatabase(NativeDatabase.memory()));
  tearDown(() => db.close());

  test('sends the scope it was last given (empty the first time) and remembers the new one with the cursor', () async {
    final asked = <Map<String, String>>[];
    var round = 0;
    final client = MockClient((r) async {
      if (r.url.path.endsWith('/sync/pull')) {
        asked.add(r.url.queryParameters);
        round++;
        return http.Response(jsonEncode({'cursor': 100 * round, 'scope': 'scope-$round', 'full': false, 'customers': [], 'plannedVisits': [], 'tasks': [], 'products': []}), 200);
      }
      return http.Response('{}', 200);
    });
    final sync = SyncService(db, ApiClient(client, baseUrl: () => 'https://api.test', accessToken: ({bool force = false}) async => 't'));

    expect((await sync.sync()).ok, isTrue);
    expect(asked[0], {'since': '0', 'scope': ''});
    expect(await db.getState('pull_scope'), 'scope-1');
    expect(await db.getState('pull_cursor'), '100');

    expect((await sync.sync()).ok, isTrue);
    expect(asked[1], {'since': '100', 'scope': 'scope-1'});
    expect(await db.getState('pull_scope'), 'scope-2');
  });

  test('stores the customers of a full re-send even though the cursor is ahead, and keeps working with a server that sends no scope', () async {
    final customer = {'id': 'c9', 'type': 'Pharmacy', 'name': 'Quiet Pharmacy', 'segment': 'C', 'targetVisitsPerMonth': 1, 'deletedAt': null};
    var withScope = true;
    final client = MockClient((r) async {
      if (!r.url.path.endsWith('/sync/pull')) return http.Response('{}', 200);
      final body = {'cursor': 500, if (withScope) 'scope': 'new', if (withScope) 'full': true, 'customers': withScope ? [customer] : [], 'plannedVisits': [], 'tasks': [], 'products': []};
      return http.Response(jsonEncode(body), 200);
    });
    final sync = SyncService(db, ApiClient(client, baseUrl: () => 'https://api.test', accessToken: ({bool force = false}) async => 't'));
    await db.setState('pull_cursor', '999'); // the stuck phone: a cursor after every change
    await db.setState('pull_scope', 'old');

    expect((await sync.sync()).ok, isTrue);
    expect((await db.select(db.customers).get()).map((c) => c.name), ['Quiet Pharmacy']);
    expect(await db.getState('pull_scope'), 'new');

    withScope = false; // an older server that sends no scope: the stored one is left alone and nothing breaks
    expect((await sync.sync()).ok, isTrue);
    expect(await db.getState('pull_scope'), 'new');
  });
}
