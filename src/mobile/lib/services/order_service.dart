import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../data/database.dart';
import 'order_rules.dart';

class OrderException implements Exception {
  OrderException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Takes orders on the phone. They are saved here first and sent when there is a signal; every order has an id made on the phone,
/// so a retry never creates a second order on the server.
class OrderService {
  OrderService(this._db, {DateTime Function()? now}) : _now = now ?? DateTime.now;
  final AppDatabase _db;
  final DateTime Function() _now;
  static const _uuid = Uuid();

  Future<String> place({required String customerId, required String customerName, required List<OrderDraftLine> lines, String? notes}) async {
    if (lines.isEmpty) throw OrderException('Add at least one product.');
    for (final l in lines) {
      if (l.quantity < 1 || l.quantity > OrderRules.maxQuantity) {
        throw OrderException('${l.productName}: the quantity must be a whole number from 1 to ${OrderRules.maxQuantity}.');
      }
    }
    final merged = OrderRules.merge(lines);
    for (final l in merged) {
      if (l.quantity > OrderRules.maxQuantity) throw OrderException('${l.productName}: at most ${OrderRules.maxQuantity} on one order.');
    }
    final id = _uuid.v4();
    await _db.transaction(() async {
      await _db.into(_db.orders).insert(OrdersCompanion.insert(
            id: id,
            customerId: customerId,
            customerName: customerName,
            total: Value(OrderRules.estimate(merged) ?? 0),
            notes: Value(notes?.trim().isEmpty ?? true ? null : notes!.trim()),
            placedAt: _now().toUtc().toIso8601String(),
          ));
      for (final l in merged) {
        await _db.into(_db.orderLines).insert(OrderLinesCompanion.insert(
              id: _uuid.v4(),
              orderId: id,
              productId: l.productId,
              productName: l.productName,
              quantity: l.quantity,
              unitPrice: Value(l.unitPrice ?? 0),
              lineTotal: Value(l.unitPrice == null ? 0 : double.parse((l.unitPrice! * l.quantity).toStringAsFixed(2))),
            ));
      }
    });
    return id;
  }

  /// An order the server has not accepted yet (still waiting, or refused) can be removed here. One the server holds is cancelled in the office.
  Future<bool> discard(String orderId) => _db.transaction(() async {
        final n = await (_db.delete(_db.orders)..where((o) => o.id.equals(orderId) & (o.dirty.equals(true) | o.status.equals('Rejected')))).go();
        if (n > 0) await (_db.delete(_db.orderLines)..where((l) => l.orderId.equals(orderId))).go();
        return n > 0;
      });
}
