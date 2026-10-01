import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../data/database.dart';

class SampleLine {
  const SampleLine({required this.batchId, required this.productId, required this.quantity});
  final String batchId;
  final String productId;
  final int quantity;
}

class SampleException implements Exception {
  SampleException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Samples handed to customers and requests for more stock. Saved on the device first; the sync service sends them and the server
/// has the final say (it re-checks expiry, batch status and the rep's stock).
class SampleService {
  SampleService(this._db, {DateTime Function()? now, Uuid? uuid})
      : _now = now ?? DateTime.now,
        _uuid = uuid ?? const Uuid();

  final AppDatabase _db;
  final DateTime Function() _now;
  final Uuid _uuid;

  /// Records the samples given on a visit. All lines or none: if any line is not allowed nothing is saved.
  /// [signatureAttachmentId] is the signature captured for this hand-over (null if the customer did not sign; compliance reports flag it).
  Future<List<String>> giveSamples({
    required String visitId,
    required String customerId,
    required List<SampleLine> lines,
    String? signatureAttachmentId,
    String? notes,
  }) async {
    if (lines.isEmpty) throw SampleException('Add at least one product.');
    final now = _now();
    final stock = {for (final s in await _db.watchStock().first) s.batchId: s};
    final perBatch = <String, int>{};
    for (final l in lines) {
      if (l.quantity < 1) throw SampleException('Quantity must be at least 1.');
      final s = stock[l.batchId];
      if (s == null) throw SampleException('You do not carry that batch.');
      if (s.productId != l.productId) throw SampleException('Batch ${s.batchNumber} is a different product.');
      if (s.blocked) throw SampleException('Batch ${s.batchNumber} is ${s.status.toLowerCase()} and must not be given out.');
      if (s.expired(now)) throw SampleException('Batch ${s.batchNumber} has expired.');
      perBatch[l.batchId] = (perBatch[l.batchId] ?? 0) + l.quantity;
      if (perBatch[l.batchId]! > s.available) throw SampleException('Only ${s.available} of batch ${s.batchNumber} left.');
    }
    final ids = <String>[];
    await _db.transaction(() async {
      for (final l in lines) {
        final id = _uuid.v4();
        ids.add(id);
        await _db.into(_db.sampleDistributions).insert(SampleDistributionsCompanion.insert(
              id: id,
              visitId: Value(visitId),
              customerId: customerId,
              productId: l.productId,
              batchId: l.batchId,
              quantity: l.quantity,
              distributedAt: now.toUtc().toIso8601String(),
              signatureAttachmentId: Value(signatureAttachmentId),
              notes: Value(notes),
            ));
      }
    });
    return ids;
  }

  Future<String> requestSamples({required String productId, required int quantity, String? notes}) async {
    if (quantity < 1 || quantity > 1000) throw SampleException('Quantity must be between 1 and 1000.');
    final id = _uuid.v4();
    await _db.into(_db.sampleRequests).insert(SampleRequestsCompanion.insert(
          id: id,
          productId: productId,
          quantity: quantity,
          notes: Value(notes?.trim().isEmpty ?? true ? null : notes!.trim()),
          createdAt: _now().toUtc().toIso8601String(),
        ));
    return id;
  }

  /// A hand-over that has not been uploaded can be undone (for example a mistyped quantity). Once the server has it, correct it with the office.
  Future<bool> undoPending(String distributionId) async {
    final n = await (_db.delete(_db.sampleDistributions)..where((d) => d.id.equals(distributionId) & d.status.equals('pending'))).go();
    return n > 0;
  }
}
