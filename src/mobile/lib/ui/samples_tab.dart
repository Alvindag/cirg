import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/database.dart';
import '../providers.dart';
import '../services/sample_service.dart';

/// What the rep carries (with expiry warnings), requests for more stock, and hand-overs the server refused.
class SamplesTab extends ConsumerWidget {
  const SamplesTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final db = ref.watch(databaseProvider);
    return ListView(padding: const EdgeInsets.all(12), children: [
      FilledButton.icon(onPressed: () => _request(context, ref), icon: const Icon(Icons.add), label: const Text('Request samples')),
      const SizedBox(height: 16),
      const _Heading('My stock'),
      StreamBuilder<List<StockItem>>(
        stream: db.watchStock(),
        builder: (context, snap) {
          final items = snap.data ?? const <StockItem>[];
          if (items.isEmpty) return const _Empty('You are not carrying any samples. Request some, then sync once stock is issued.');
          return Column(children: [for (final s in items) _StockTile(s)]);
        },
      ),
      StreamBuilder<List<SampleDistribution>>(
        stream: db.watchRejectedDistributions(),
        builder: (context, snap) {
          final rejected = snap.data ?? const <SampleDistribution>[];
          if (rejected.isEmpty) return const SizedBox.shrink();
          return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const SizedBox(height: 16),
            const _Heading('Needs attention'),
            for (final d in rejected)
              Card(
                color: Theme.of(context).colorScheme.errorContainer,
                child: ListTile(
                  leading: const Icon(Icons.error_outline),
                  title: Text('${d.quantity} unit(s) were not accepted'),
                  subtitle: Text(d.rejectReason ?? 'Rejected by the server. Contact your manager.'),
                ),
              ),
          ]);
        },
      ),
      const SizedBox(height: 16),
      const _Heading('My requests'),
      StreamBuilder<List<SampleRequest>>(
        stream: db.watchRequests(),
        builder: (context, snap) {
          final items = snap.data ?? const <SampleRequest>[];
          if (items.isEmpty) return const _Empty('No requests yet.');
          return StreamBuilder<List<Product>>(
            stream: db.watchProducts(),
            builder: (context, ps) {
              final names = {for (final p in ps.data ?? const <Product>[]) p.id: p.name};
              return Column(children: [for (final r in items) _RequestTile(r, names[r.productId] ?? 'Product')]);
            },
          );
        },
      ),
    ]);
  }

  Future<void> _request(BuildContext context, WidgetRef ref) async {
    final products = await ref.read(databaseProvider).watchProducts().first;
    if (!context.mounted) return;
    if (products.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No products on this device yet. Sync first.')));
      return;
    }
    final messenger = ScaffoldMessenger.of(context);
    final result = await showDialog<({String productId, int qty, String notes})>(context: context, builder: (_) => _RequestDialog(products: products));
    if (result == null) return;
    try {
      await ref.read(sampleServiceProvider).requestSamples(productId: result.productId, quantity: result.qty, notes: result.notes);
      ref.read(syncCoordinatorProvider.notifier).syncNow();
      messenger.showSnackBar(const SnackBar(content: Text('Request saved. It is sent when you are online.')));
    } on SampleException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('$e')));
    }
  }
}

class _Heading extends StatelessWidget {
  const _Heading(this.text);
  final String text;
  @override
  Widget build(BuildContext context) =>
      Padding(padding: const EdgeInsets.only(bottom: 4), child: Text(text, style: Theme.of(context).textTheme.titleMedium));
}

class _Empty extends StatelessWidget {
  const _Empty(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: Text(text));
}

class _StockTile extends StatelessWidget {
  const _StockTile(this.s);
  final StockItem s;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final days = s.daysToExpiry(now);
    final scheme = Theme.of(context).colorScheme;
    final (String? flag, Color? color) = s.blocked
        ? (s.status, scheme.error)
        : s.expired(now)
            ? ('Expired', scheme.error)
            : days <= 90
                ? ('Expires in $days days', Colors.orange.shade800)
                : (null, null);
    return Card(
      child: ListTile(
        title: Text('${s.productName ?? 'Product'} · batch ${s.batchNumber}'),
        subtitle: Text('${s.available} available · expires ${s.expiryDate}${flag != null && (s.blocked || s.expired(now)) ? '\nReturn this stock to the warehouse; do not give it out.' : ''}'),
        isThreeLine: s.blocked || s.expired(now),
        trailing: flag == null ? null : Chip(label: Text(flag), labelStyle: TextStyle(color: color), side: BorderSide(color: color!)),
      ),
    );
  }
}

class _RequestTile extends StatelessWidget {
  const _RequestTile(this.r, this.product);
  final SampleRequest r;
  final String product;

  @override
  Widget build(BuildContext context) {
    final qty = r.approvedQuantity != null && r.approvedQuantity != r.quantity ? '${r.approvedQuantity} of ${r.quantity}' : '${r.quantity}';
    final status = r.dirty ? 'Waiting to send' : r.status;
    return ListTile(
      contentPadding: EdgeInsets.zero,
      title: Text('$qty × $product'),
      subtitle: Text([status, if (r.decisionNote != null && r.decisionNote!.isNotEmpty) r.decisionNote!].join(' · ')),
    );
  }
}

class _RequestDialog extends StatefulWidget {
  const _RequestDialog({required this.products});
  final List<Product> products;
  @override
  State<_RequestDialog> createState() => _RequestDialogState();
}

class _RequestDialogState extends State<_RequestDialog> {
  late String _product = widget.products.first.id;
  final _qty = TextEditingController(text: '10');
  final _notes = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _qty.dispose();
    _notes.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Request samples'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          DropdownButtonFormField<String>(
            initialValue: _product,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Product'),
            items: [for (final p in widget.products) DropdownMenuItem(value: p.id, child: Text(p.name))],
            onChanged: (v) => setState(() => _product = v ?? _product),
          ),
          TextField(controller: _qty, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Quantity')),
          TextField(controller: _notes, decoration: const InputDecoration(labelText: 'Why do you need them? (optional)')),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              final q = int.tryParse(_qty.text.trim());
              if (q == null || q < 1 || q > 1000) return setState(() => _error = 'Enter a quantity from 1 to 1000.');
              Navigator.pop(context, (productId: _product, qty: q, notes: _notes.text));
            },
            child: const Text('Send request'),
          ),
        ],
      );
}
