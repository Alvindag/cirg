import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:drift/drift.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

import '../data/database.dart';

enum AttachmentKind { photo, voiceNote, signature }

extension AttachmentKindName on AttachmentKind {
  /// Name used by the API.
  String get api => switch (this) { AttachmentKind.photo => 'Photo', AttachmentKind.voiceNote => 'VoiceNote', AttachmentKind.signature => 'Signature' };
}

/// Stores captured media on the device and queues it for upload. Works with no connectivity; the sync service uploads it later.
class AttachmentService {
  AttachmentService(this._db, {Future<Directory> Function()? mediaDir, DateTime Function()? now, Uuid? uuid})
      : _mediaDir = mediaDir ?? _defaultMediaDir,
        _now = now ?? DateTime.now,
        _uuid = uuid ?? const Uuid();

  final AppDatabase _db;
  final Future<Directory> Function() _mediaDir;
  final DateTime Function() _now;
  final Uuid _uuid;

  static Future<Directory> _defaultMediaDir() async {
    final base = await getApplicationSupportDirectory();
    return Directory(p.join(base.path, 'media')).create(recursive: true);
  }

  /// [sourcePath] is the camera's temporary file; it is copied into app storage and the original removed.
  Future<String> addPhoto(String visitId, String sourcePath) async {
    final ext = p.extension(sourcePath).toLowerCase();
    final png = ext == '.png';
    return _addFile(visitId, AttachmentKind.photo, sourcePath, png ? '.png' : '.jpg', png ? 'image/png' : 'image/jpeg');
  }

  Future<String> addVoiceNote(String visitId, String sourcePath, {int? durationMs}) =>
      _addFile(visitId, AttachmentKind.voiceNote, sourcePath, '.m4a', 'audio/mp4', durationMs: durationMs);

  /// A signature is the signer's name and the meaning of signing (e.g. "Samples received"), bound to the visit and time on the server.
  Future<String> addSignature(String visitId, Uint8List png, {required String signerName, required String meaning}) async {
    if (signerName.trim().isEmpty) throw ArgumentError('Signer name is required.');
    if (meaning.trim().isEmpty) throw ArgumentError('Meaning is required.');
    final id = _uuid.v4();
    final file = File(p.join((await _mediaDir()).path, '$id.png'));
    await file.writeAsBytes(png, flush: true);
    await _insert(id, visitId, AttachmentKind.signature, file, 'image/png', signerName: signerName.trim(), meaning: meaning.trim());
    return id;
  }

  Future<String> _addFile(String visitId, AttachmentKind kind, String source, String ext, String contentType, {int? durationMs}) async {
    final id = _uuid.v4();
    final dest = File(p.join((await _mediaDir()).path, '$id$ext'));
    await File(source).copy(dest.path);
    try {
      await File(source).delete();
    } catch (_) {}
    await _insert(id, visitId, kind, dest, contentType, durationMs: durationMs);
    return id;
  }

  Future<void> _insert(String id, String visitId, AttachmentKind kind, File file, String contentType,
      {String? signerName, String? meaning, int? durationMs}) async {
    final size = await file.length();
    if (size == 0) {
      await file.delete();
      throw StateError('The captured file is empty.');
    }
    final digest = await sha256.bind(file.openRead()).first;
    await _db.into(_db.attachments).insert(AttachmentsCompanion.insert(
          id: id,
          visitId: visitId,
          kind: kind.api,
          localPath: file.path,
          contentType: contentType,
          sizeBytes: size,
          sha256: digest.toString(),
          capturedAt: _now().toUtc().toIso8601String(),
          fileName: Value(p.basename(file.path)),
          signerName: Value(signerName),
          meaning: Value(meaning),
          durationMs: Value(durationMs),
        ));
  }

  /// Only items not yet uploaded can be removed here; once uploaded they are part of the record.
  Future<bool> deletePending(String id) async {
    final a = await (_db.select(_db.attachments)..where((x) => x.id.equals(id))).getSingleOrNull();
    if (a == null || a.uploadStatus == 'uploaded') return false;
    await AppDatabase.deleteFile(a.localPath);
    await (_db.delete(_db.attachments)..where((x) => x.id.equals(id))).go();
    return true;
  }

  /// Frees storage: local copies of files uploaded more than [olderThan] ago are deleted (the server keeps them).
  Future<int> purgeUploaded({Duration olderThan = const Duration(days: 7)}) async {
    final cutoff = _now().subtract(olderThan).toUtc().toIso8601String();
    final rows = await (_db.select(_db.attachments)
          ..where((a) => a.uploadStatus.equals('uploaded') & a.localPath.equals('').not() & a.uploadedAt.isSmallerThanValue(cutoff)))
        .get();
    for (final a in rows) {
      await AppDatabase.deleteFile(a.localPath);
      await (_db.update(_db.attachments)..where((x) => x.id.equals(a.id))).write(const AttachmentsCompanion(localPath: Value('')));
    }
    return rows.length;
  }
}
