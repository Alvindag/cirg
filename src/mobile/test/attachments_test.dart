import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:das_engage/data/database.dart';
import 'package:das_engage/services/api_client.dart';
import 'package:das_engage/services/attachment_service.dart';
import 'package:das_engage/services/sync_service.dart';
import 'package:das_engage/ui/signature_pad.dart';
import 'package:drift/drift.dart' hide isNull, isNotNull;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  late AppDatabase db;
  late Directory tmp;
  late AttachmentService svc;
  var now = DateTime.utc(2026, 10, 1, 9);

  setUp(() async {
    now = DateTime.utc(2026, 10, 1, 9);
    db = AppDatabase(NativeDatabase.memory());
    tmp = await Directory.systemTemp.createTemp('das_media_test');
    svc = AttachmentService(db, mediaDir: () async => Directory('${tmp.path}/media').create(recursive: true), now: () => now);
  });
  tearDown(() async {
    await db.close();
    await tmp.delete(recursive: true);
  });

  Future<String> source(String name, List<int> bytes) async {
    final f = File('${tmp.path}/$name');
    await f.writeAsBytes(bytes);
    return f.path;
  }

  SyncService syncWith(MockClient client) => SyncService(
        db,
        ApiClient(client, baseUrl: () => 'https://api.test', accessToken: ({bool force = false}) async => 't'),
      );

  MockClient server({int attachmentStatus = 201, String attachmentBody = '{}', void Function(http.Request)? onPut, Object? error}) =>
      MockClient((req) async {
        if (req.method == 'PUT') {
          if (error != null) throw error;
          onPut?.call(req);
          return http.Response(attachmentBody, attachmentStatus);
        }
        if (req.url.path.endsWith('/sync/push')) return http.Response(jsonEncode({'ok': true, 'errors': []}), 200);
        return http.Response(jsonEncode({'cursor': 1, 'customers': [], 'plannedVisits': [], 'tasks': [], 'products': []}), 200);
      });

  test('a photo is copied into app storage, hashed and queued; the camera temp file is removed', () async {
    final bytes = List<int>.generate(5000, (i) => i % 251);
    final src = await source('shot.jpg', bytes);
    final id = await svc.addPhoto('v1', src);

    final a = await (db.select(db.attachments)..where((x) => x.id.equals(id))).getSingle();
    expect(a.kind, 'Photo');
    expect(a.contentType, 'image/jpeg');
    expect(a.sizeBytes, 5000);
    expect(a.sha256, sha256.convert(bytes).toString());
    expect(a.uploadStatus, 'pending');
    expect(await File(a.localPath).readAsBytes(), bytes);
    expect(File(src).existsSync(), isFalse);
    expect(await db.watchPendingCount().first, 1);
  });

  test('voice notes and signatures are stored with their metadata; signatures need a name and meaning', () async {
    final note = await svc.addVoiceNote('v1', await source('n.m4a', [1, 2, 3, 4]), durationMs: 4200);
    expect((await (db.select(db.attachments)..where((x) => x.id.equals(note))).getSingle()).durationMs, 4200);

    final png = Uint8List.fromList([0x89, 0x50, 0x4E, 0x47, 1, 2, 3]);
    await expectLater(svc.addSignature('v1', png, signerName: ' ', meaning: 'x'), throwsArgumentError);
    await expectLater(svc.addSignature('v1', png, signerName: 'Dr Ama', meaning: ''), throwsArgumentError);
    final sig = await svc.addSignature('v1', png, signerName: ' Dr Ama ', meaning: 'Samples received');
    final row = await (db.select(db.attachments)..where((x) => x.id.equals(sig))).getSingle();
    expect(row.kind, 'Signature');
    expect(row.signerName, 'Dr Ama');
    expect(row.contentType, 'image/png');
  });

  test('sync uploads each file once, with the integrity hash and metadata the API expects', () async {
    final bytes = List<int>.generate(300, (i) => i % 200);
    final id = await svc.addPhoto('visit-1', await source('p.jpg', bytes));
    final puts = <http.Request>[];

    final sync = syncWith(server(onPut: puts.add));
    final res = await sync.sync();
    expect(res.ok, isTrue);

    expect(puts, hasLength(1));
    final put = puts.single;
    expect(put.url.path, '/api/v1/attachments/$id');
    expect(put.url.queryParameters['kind'], 'Photo');
    expect(put.url.queryParameters['visitId'], 'visit-1');
    expect(put.url.queryParameters['capturedAt'], '2026-10-01T09:00:00.000Z');
    expect(put.headers['Content-Type'], 'image/jpeg');
    expect(put.headers['X-Content-SHA256'], sha256.convert(bytes).toString());
    expect(put.headers['Authorization'], 'Bearer t');
    expect(put.bodyBytes, bytes);

    expect((await (db.select(db.attachments)..where((x) => x.id.equals(id))).getSingle()).uploadStatus, 'uploaded');
    expect(await db.watchPendingCount().first, 0);

    await sync.sync();
    expect(puts, hasLength(1)); // not uploaded again
  });

  test('signature fields travel as query parameters', () async {
    await svc.addSignature('v1', Uint8List.fromList([0x89, 0x50, 0x4E, 0x47, 9]), signerName: 'Dr Ama Boateng', meaning: 'Samples received');
    final puts = <http.Request>[];
    await syncWith(server(onPut: puts.add)).sync();
    expect(puts.single.url.queryParameters['signerName'], 'Dr Ama Boateng');
    expect(puts.single.url.queryParameters['meaning'], 'Samples received');
    expect(puts.single.url.queryParameters['kind'], 'Signature');
  });

  test('permanent rejections mark the item failed and are not retried', () async {
    final id = await svc.addPhoto('v1', await source('p.jpg', [1, 2, 3]));
    final puts = <http.Request>[];
    final sync = syncWith(server(attachmentStatus: 415, attachmentBody: 'Unsupported', onPut: puts.add));
    expect((await sync.sync()).ok, isTrue); // the rest of the sync still succeeds
    final a = await (db.select(db.attachments)..where((x) => x.id.equals(id))).getSingle();
    expect(a.uploadStatus, 'failed');
    expect(a.uploadError, 'Unsupported');
    await sync.sync();
    expect(puts, hasLength(1));
    expect(await db.watchPendingCount().first, 0);
  });

  test('a visit not yet on the server is retried later; server errors give up after five attempts', () async {
    final id = await svc.addPhoto('v1', await source('p.jpg', [1, 2, 3]));
    Future<Attachment> row() => (db.select(db.attachments)..where((x) => x.id.equals(id))).getSingle();

    await syncWith(server(attachmentStatus: 409, attachmentBody: 'Visit not found on the server yet; sync visits first.')).sync();
    expect((await row()).uploadStatus, 'pending');
    expect((await row()).attempts, 0);

    final failing = syncWith(server(attachmentStatus: 503));
    for (var i = 1; i <= 4; i++) {
      await failing.sync();
      expect((await row()).uploadStatus, 'pending');
      expect((await row()).attempts, i);
    }
    await failing.sync();
    expect((await row()).uploadStatus, 'failed');
  });

  test('going offline keeps the file queued', () async {
    final id = await svc.addPhoto('v1', await source('p.jpg', [1, 2, 3]));
    final res = await syncWith(server(error: http.ClientException('offline'))).sync();
    expect(res.ok, isFalse);
    expect((await (db.select(db.attachments)..where((x) => x.id.equals(id))).getSingle()).uploadStatus, 'pending');
  });

  test('only pending items can be deleted; uploaded files are purged after a week but the record stays', () async {
    final keep = await svc.addPhoto('v1', await source('a.jpg', [1, 2]));
    final drop = await svc.addPhoto('v1', await source('b.jpg', [3, 4]));
    await syncWith(server()).sync(); // both uploaded
    expect(await svc.deletePending(keep), isFalse);

    final pending = await svc.addPhoto('v1', await source('c.jpg', [5, 6]));
    final path = (await (db.select(db.attachments)..where((x) => x.id.equals(pending))).getSingle()).localPath;
    expect(await svc.deletePending(pending), isTrue);
    expect(File(path).existsSync(), isFalse);

    expect(await svc.purgeUploaded(), 0); // too recent
    now = now.add(const Duration(days: 8));
    final tmpNow = AttachmentService(db, mediaDir: () async => Directory('${tmp.path}/media'), now: () => DateTime.now().toUtc().add(const Duration(days: 8)));
    expect(await tmpNow.purgeUploaded(), 2);
    final rows = await db.select(db.attachments).get();
    expect(rows.map((r) => r.id), containsAll([keep, drop]));
    expect(rows.every((r) => r.localPath.isEmpty && r.uploadStatus == 'uploaded'), isTrue);
  });

  test('wiping the device removes the captured files', () async {
    final id = await svc.addPhoto('v1', await source('p.jpg', [1, 2, 3]));
    final path = (await (db.select(db.attachments)..where((x) => x.id.equals(id))).getSingle()).localPath;
    await db.wipe();
    expect(File(path).existsSync(), isFalse);
    expect(await db.select(db.attachments).get(), isEmpty);
  });

  test('an empty capture is rejected', () async {
    await expectLater(svc.addVoiceNote('v1', await source('empty.m4a', [])), throwsStateError);
  });

  testWidgets('the signature pad exports a PNG once signed and ignores a stray dot', (tester) async {
    final controller = SignatureController();
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: Center(child: SizedBox(width: 300, child: SignaturePad(controller: controller))))));

    expect(controller.isEmpty, isTrue);
    final tap = await tester.startGesture(tester.getCenter(find.byType(SignaturePad)));
    await tap.up();
    await tester.pump();
    expect(controller.hasEnoughInk, isFalse);

    final g = await tester.startGesture(tester.getTopLeft(find.byType(SignaturePad)) + const Offset(20, 90));
    for (var i = 1; i <= 12; i++) {
      await g.moveBy(const Offset(18, -6));
    }
    await g.up();
    await tester.pump();
    expect(controller.hasEnoughInk, isTrue);

    final png = await tester.runAsync(() => controller.toPng());
    expect(png, isNotNull);
    expect(png!.sublist(0, 4), [0x89, 0x50, 0x4E, 0x47]);
    expect(png.length, greaterThan(200));

    controller.clear();
    expect(controller.isEmpty, isTrue);
  });
}
