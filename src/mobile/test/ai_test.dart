import 'dart:convert';

import 'package:das_engage/data/database.dart';
import 'package:das_engage/services/ai_service.dart';
import 'package:das_engage/services/api_client.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  late AppDatabase db;
  setUp(() => db = AppDatabase(NativeDatabase.memory()));
  tearDown(() => db.close());

  AiService serviceWith(Future<http.Response> Function(http.Request r) handler, {List<http.Request>? log}) => AiService(
        ApiClient(
          MockClient((r) async {
            log?.add(r);
            return handler(r);
          }),
          baseUrl: () => 'https://api.test',
          accessToken: ({bool force = false}) async => 't',
        ),
        db,
      );

  http.Response json(Object body, [int status = 200]) => http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

  test('status tells the app whether AI can be used and why not', () async {
    final ok = serviceWith((r) async => json({'available': true, 'usedToday': 3, 'dailyLimit': 40}));
    final s = await ok.status();
    expect((s.available, s.usedToday, s.dailyLimit), (true, 3, 40));

    final off = serviceWith((r) async => json({'available': false, 'reason': 'AI features are switched off for your organisation.'}));
    final n = await off.status();
    expect(n.available, isFalse);
    expect(n.reason, contains('switched off'));
  });

  test('a transcription draft comes back for review', () async {
    final log = <http.Request>[];
    final svc = serviceWith((r) async => json({'id': 'o1', 'status': 'Draft', 'content': 'Dr liked the leaflet.'}), log: log);
    final d = await svc.transcribe('att-1', language: 'en');
    expect((d.id, d.text), ('o1', 'Dr liked the leaflet.'));
    expect(log.single.url.path, '/api/v1/ai/transcriptions');
    expect(jsonDecode(log.single.body), {'attachmentId': 'att-1', 'language': 'en'});
    expect(log.single.headers['Authorization'], 'Bearer t');
  });

  test('a summary draft is parsed from the server record', () async {
    final content = jsonEncode({
      'summary': 'Positive visit.', 'keyPoints': ['a', 'b'], 'objections': ['price'], 'productsDiscussed': ['Amoxil'],
      'followUps': [{'title': 'Send leaflet', 'dueInDays': 3}], 'sentiment': 'Positive',
    });
    final svc = serviceWith((r) async => json({'id': 'o2', 'status': 'Draft', 'content': content}));
    final d = await svc.summarise('visit-1');
    expect(d.id, 'o2');
    expect(d.summary, 'Positive visit.');
    expect(d.keyPoints, ['a', 'b']);
    expect(d.followUps.single.title, 'Send leaflet');
    expect(d.followUps.single.dueInDays, 3);
    expect(d.sentiment, 'Positive');
  });

  test('the rep\'s decision is recorded without letting the server apply anything', () async {
    final log = <http.Request>[];
    final svc = serviceWith((r) async => json({}), log: log);
    final edited = SummaryDraft(id: 'o2', summary: 'My words.', keyPoints: ['k'], objections: [], products: ['Amoxil'], followUps: [const FollowUp('Call', 5)], sentiment: 'Neutral');
    await svc.decide('o2', accept: true, editedSummary: edited, followUps: [const FollowUp('Call', 5)]);
    final body = jsonDecode(log.single.body) as Map;
    expect(log.single.url.path, '/api/v1/ai/outputs/o2/decision');
    expect(body['status'], 'Accepted');
    expect(body['applyToReport'], false); // the app applies text locally so it syncs normally
    expect((body['editedSummary'] as Map)['summary'], 'My words.');

    await svc.decide('o3', accept: false);
    expect(jsonDecode(log.last.body)['status'], 'Rejected');
    expect((jsonDecode(log.last.body) as Map).containsKey('editedSummary'), isFalse);
  });

  test('refusals and limits reach the rep in plain words', () async {
    final denied = serviceWith((r) async => json({'title': 'AI request refused', 'detail': 'You have reached the daily limit of 40 AI requests.', 'status': 429}, 429));
    await expectLater(denied.summarise('v'), throwsA(isA<AiException>().having((e) => e.message, 'message', contains('daily limit')).having((e) => e.statusCode, 'status', 429)));

    final plain = serviceWith((r) async => http.Response('"Visit not found"', 404));
    await expectLater(plain.transcribe('x'), throwsA(isA<AiException>().having((e) => e.message, 'message', 'Visit not found')));

    final empty = serviceWith((r) async => http.Response('', 502));
    await expectLater(empty.summarise('v'), throwsA(isA<AiException>().having((e) => e.message, 'message', contains('502'))));
  });

  test('suggestions are cached for offline use and replaced on each refresh; a failed refresh keeps the old list', () async {
    final first = [
      {'type': 'FollowUp', 'customerId': 'c1', 'title': 'Complete follow-up: Send brochure', 'reason': 'Overdue by 2 day(s).', 'priority': 92, 'dueDate': '2026-09-29'},
      {'type': 'ExpiringStock', 'customerId': null, 'title': 'Use or return 15 × Amoxil', 'reason': 'Expires in 20 day(s).', 'priority': 85, 'dueDate': null},
    ];
    var body = first;
    var fail = false;
    final svc = serviceWith((r) async => fail ? http.Response('', 500) : json(body));
    await svc.refreshActions();
    var rows = await db.watchNextActions().first;
    expect(rows.map((r) => r.title), first.map((m) => m['title']));
    expect(rows.first.reason, 'Overdue by 2 day(s).');
    expect(rows.last.customerId, isNull);

    fail = true;
    await svc.refreshActions(); // offline or server trouble
    expect(await db.watchNextActions().first, hasLength(2));

    fail = false;
    body = [first.first];
    await svc.refreshActions();
    expect(await db.watchNextActions().first, hasLength(1));
  });

  test('route optimisation sends the day and start point, and reads the proposal', () async {
    final log = <http.Request>[];
    final svc = serviceWith((r) async => json({
          'order': [{'name': 'Clinic A', 'sequence': 1}, {'name': 'Clinic B', 'sequence': 2}], 'originalKm': 31.4, 'optimizedKm': 18.2, 'applied': false,
        }), log: log);
    final plan = await svc.optimiseRoute(DateTime(2026, 10, 1), latitude: 5.6, longitude: -0.2);
    expect(jsonDecode(log.single.body), {'date': '2026-10-01', 'startLatitude': 5.6, 'startLongitude': -0.2, 'apply': false});
    expect(plan.stops, ['Clinic A', 'Clinic B']);
    expect(plan.improves, isTrue);
    expect(plan.applied, isFalse);

    await svc.optimiseRoute(DateTime(2026, 10, 1), apply: true);
    expect(jsonDecode(log.last.body)['apply'], true);
  });

  test('a plan that cannot be shortened is not offered as an improvement', () {
    const same = RoutePlan(originalKm: 12.0, optimizedKm: 12.0, stops: [], applied: false);
    expect(same.improves, isFalse);
  });

  test('wiping the device clears cached suggestions', () async {
    await db.replaceNextActions([{'type': 'Visit', 'customerId': 'c', 'title': 't', 'reason': 'r', 'priority': 50, 'dueDate': null}]);
    await db.wipe();
    expect(await db.watchNextActions().first, isEmpty);
  });
}
