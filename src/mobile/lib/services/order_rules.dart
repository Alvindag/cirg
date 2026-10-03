/// Order rules that need no database: what counts as a valid quantity, when to ask "is this right?", and the estimate.
/// The server applies the same limits and does the real pricing; this keeps typing mistakes off the road.
class OrderRules {
  static const maxQuantity = 1000;

  /// Quantities above this must be confirmed by name before the order can be saved.
  static const confirmAbove = 50;

  /// A whole number from 1 to [maxQuantity], or null. Letters, decimals, signs and blanks are all refused.
  static int? parseQuantity(String text) {
    final t = text.trim();
    if (!RegExp(r'^\d{1,4}$').hasMatch(t)) return null;
    final n = int.parse(t);
    return n >= 1 && n <= maxQuantity ? n : null;
  }

  static bool needsConfirmation(int quantity) => quantity > confirmAbove;

  /// The wording of the question: "100 × Amoxil 500mg. Is this right?"
  static String confirmationText(String product, int quantity) => '$quantity × $product. Is this right?';

  /// Adds repeated products together, keeping the order they were first picked in.
  static List<OrderDraftLine> merge(List<OrderDraftLine> lines) {
    final byProduct = <String, OrderDraftLine>{};
    for (final l in lines) {
      final existing = byProduct[l.productId];
      byProduct[l.productId] = existing == null ? l : existing.withQuantity(existing.quantity + l.quantity);
    }
    return byProduct.values.toList();
  }

  /// Quantity times the price the phone knows; null when any product has no price (the office prices the order).
  static double? estimate(List<OrderDraftLine> lines) {
    var total = 0.0;
    for (final l in lines) {
      final p = l.unitPrice;
      if (p == null || p <= 0) return null;
      total += p * l.quantity;
    }
    return double.parse(total.toStringAsFixed(2));
  }
}

class OrderDraftLine {
  const OrderDraftLine({required this.productId, required this.productName, required this.quantity, this.unitPrice});
  final String productId;
  final String productName;
  final int quantity;
  final double? unitPrice;

  OrderDraftLine withQuantity(int q) => OrderDraftLine(productId: productId, productName: productName, quantity: q, unitPrice: unitPrice);
}
