import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../data/database.dart';
import '../providers.dart';
import 'order_screen.dart';
import 'theme.dart';

/// The rep's orders: new ones waiting for a signal, and what the office has done with them.
class OrdersTab extends ConsumerWidget {
  const OrdersTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final db = ref.watch(databaseProvider);
    return StreamBuilder<List<Order>>(
      stream: db.watchOrders(),
      builder: (context, snap) {
        final items = snap.data ?? const <Order>[];
        return ListView(padding: const EdgeInsets.all(12), children: [
          FilledButton.icon(
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const OrderScreen())),
            icon: const Icon(Icons.add),
            label: const Text('New order'),
          ),
          const SizedBox(height: 12),
          if (items.isEmpty)
            const EmptyState(icon: Icons.receipt_long_outlined, title: 'No orders yet', message: 'Take an order from here or from a customer. It works without a signal and is sent when you are back online.')
          else
            for (final o in items) _OrderTile(o),
        ]);
      },
    );
  }
}

String _money(double v) => 'GHS ${NumberFormat('#,##0.00').format(v)}';

class _OrderTile extends ConsumerWidget {
  const _OrderTile(this.o);
  final Order o;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final waiting = o.dirty && o.status != 'Rejected';
    final (String label, Color color) = o.status == 'Rejected'
        ? ('Not accepted', scheme.error)
        : waiting
            ? ('Waiting to send', Das.warn)
            : o.creditHold && o.status == 'Placed'
                ? ('Held for credit review', scheme.error)
                : switch (o.status) {
                'Delivered' => ('Delivered', Das.good),
                'Confirmed' => ('Confirmed', Das.blue),
                'Cancelled' => ('Cancelled', scheme.error),
                _ => ('Sent', scheme.onSurfaceVariant),
              };
    final when = DateTime.tryParse(o.placedAt)?.toLocal();
    return Card(
      color: o.status == 'Rejected' ? scheme.errorContainer : null,
      child: ListTile(
        title: Text(o.customerName),
        subtitle: Text([
          if (o.number != null) o.number!,
          if (when != null) DateFormat('d MMM, HH:mm').format(when),
          if (o.status == 'Rejected' && o.rejectReason != null) o.rejectReason!,
          if (o.creditHold && o.status == 'Placed' && o.holdReason != null) o.holdReason!,
          if (o.status == 'Cancelled' && o.cancelReason != null) 'Cancelled: ${o.cancelReason}',
        ].join(' · ')),
        trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w600)),
          if (o.total > 0) Text(waiting ? '≈ ${_money(o.total)}' : _money(o.total), style: Theme.of(context).textTheme.bodySmall),
        ]),
        onTap: () => _details(context, ref),
      ),
    );
  }

  Future<void> _details(BuildContext context, WidgetRef ref) async {
    final lines = await ref.read(databaseProvider).linesOf(o.id);
    if (!context.mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      builder: (sheet) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(o.customerName, style: Theme.of(sheet).textTheme.titleLarge),
            const SizedBox(height: 8),
            for (final l in lines)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(children: [
                  Expanded(child: Text('${l.quantity} × ${l.productName}')),
                  if (l.lineTotal > 0) Text(_money(l.lineTotal)),
                ]),
              ),
            if (o.notes != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text('Note: ${o.notes}')),
            if (o.dirty || o.status == 'Rejected')
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.delete_outline),
                  label: const Text('Remove from this phone'),
                  onPressed: () async {
                    await ref.read(orderServiceProvider).discard(o.id);
                    if (sheet.mounted) Navigator.pop(sheet);
                  },
                ),
              )
            else
              const Padding(padding: EdgeInsets.only(top: 12), child: Text('To change or cancel an order the office already has, contact your manager.')),
          ]),
        ),
      ),
    );
  }
}
