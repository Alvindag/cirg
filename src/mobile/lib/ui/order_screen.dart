import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/database.dart';
import '../providers.dart';
import '../services/order_rules.dart';
import '../services/order_service.dart';

/// Take an order: pick the customer (unless it comes from the customer's page) and products, set quantities, save.
/// Saved on the phone first; sent when there is a signal.
class OrderScreen extends ConsumerStatefulWidget {
  const OrderScreen({super.key, this.customerId, this.customerName});
  final String? customerId;
  final String? customerName;

  @override
  ConsumerState<OrderScreen> createState() => _OrderScreenState();
}

class _Line {
  _Line(this.product) : controller = TextEditingController(text: '1');
  final Product product;
  final TextEditingController controller;
}

class _OrderScreenState extends ConsumerState<OrderScreen> {
  String? _customerId;
  String? _customerName;
  final _lines = <_Line>[];
  final _notes = TextEditingController();
  String? _error;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _customerId = widget.customerId;
    _customerName = widget.customerName;
  }

  @override
  void dispose() {
    for (final l in _lines) {
      l.controller.dispose();
    }
    _notes.dispose();
    super.dispose();
  }

  List<OrderDraftLine>? _draft() {
    final out = <OrderDraftLine>[];
    for (final l in _lines) {
      final q = OrderRules.parseQuantity(l.controller.text);
      if (q == null) return null;
      out.add(OrderDraftLine(productId: l.product.id, productName: l.product.name, quantity: q, unitPrice: l.product.listPrice));
    }
    return out;
  }

  Future<void> _pickCustomer() async {
    final c = await showModalBottomSheet<Customer>(context: context, isScrollControlled: true, builder: (_) => const _CustomerPicker());
    if (c != null) setState(() { _customerId = c.id; _customerName = c.name; });
  }

  Future<void> _addProduct() async {
    final p = await showModalBottomSheet<Product>(context: context, isScrollControlled: true, builder: (_) => const _ProductPicker());
    if (p == null) return;
    setState(() {
      final existing = _lines.where((l) => l.product.id == p.id);
      if (existing.isNotEmpty) {
        final q = OrderRules.parseQuantity(existing.first.controller.text) ?? 0;
        existing.first.controller.text = '${(q + 1).clamp(1, OrderRules.maxQuantity)}';
      } else {
        _lines.add(_Line(p));
      }
    });
  }

  Future<void> _save() async {
    setState(() => _error = null);
    if (_customerId == null) { setState(() => _error = 'Choose the customer.'); return; }
    if (_lines.isEmpty) { setState(() => _error = 'Add at least one product.'); return; }
    final draft = _draft();
    if (draft == null) {
      setState(() => _error = 'Every quantity must be a whole number from 1 to ${OrderRules.maxQuantity}.');
      return;
    }
    // A large quantity is the usual typing mistake (100 for 10): it has to be confirmed by name before the order is saved.
    for (final l in draft) {
      if (!OrderRules.needsConfirmation(l.quantity)) continue;
      final ok = await showDialog<bool>(
        context: context,
        builder: (d) => AlertDialog(
          title: const Text('Large quantity'),
          content: Text(OrderRules.confirmationText(l.productName, l.quantity)),
          actions: [
            TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('No, change it')),
            FilledButton(onPressed: () => Navigator.pop(d, true), child: const Text('Yes, it is right')),
          ],
        ),
      );
      if (ok != true) return;
    }
    if (!mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    setState(() => _saving = true);
    try {
      await ref.read(orderServiceProvider).place(customerId: _customerId!, customerName: _customerName ?? '', lines: draft, notes: _notes.text);
      ref.read(syncCoordinatorProvider.notifier).syncNow();
      messenger.showSnackBar(const SnackBar(content: Text('Order saved. It is sent when you have a signal.')));
      navigator.pop();
    } on OrderException catch (e) {
      if (mounted) setState(() { _error = '$e'; _saving = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final draft = _draft();
    final estimate = draft == null ? null : OrderRules.estimate(draft);
    return Scaffold(
      appBar: AppBar(title: const Text('New order')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Card(
          child: ListTile(
            leading: const Icon(Icons.storefront_outlined),
            title: Text(_customerName ?? 'Choose the customer'),
            subtitle: _customerName == null ? null : const Text('Tap to change'),
            trailing: widget.customerId == null ? const Icon(Icons.chevron_right) : null,
            onTap: widget.customerId == null ? _pickCustomer : null,
          ),
        ),
        const SizedBox(height: 12),
        Text('Products', style: Theme.of(context).textTheme.titleMedium),
        for (final l in _lines)
          Card(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 4, 8),
              child: Row(children: [
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(l.product.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                  Text(l.product.listPrice == null ? 'No price' : 'GHS ${l.product.listPrice!.toStringAsFixed(2)} each', style: Theme.of(context).textTheme.bodySmall),
                ])),
                SizedBox(
                  width: 84,
                  child: TextField(
                    controller: l.controller,
                    keyboardType: TextInputType.number,
                    textAlign: TextAlign.center,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(4)],
                    decoration: const InputDecoration(labelText: 'Qty', isDense: true),
                    onChanged: (_) => setState(() {}),
                  ),
                ),
                IconButton(
                  tooltip: 'Remove',
                  icon: const Icon(Icons.close),
                  onPressed: () => setState(() { l.controller.dispose(); _lines.remove(l); }),
                ),
              ]),
            ),
          ),
        const SizedBox(height: 4),
        OutlinedButton.icon(onPressed: _addProduct, icon: const Icon(Icons.add), label: const Text('Add a product')),
        const SizedBox(height: 12),
        TextField(controller: _notes, maxLines: 2, decoration: const InputDecoration(labelText: 'Note for the office (optional)', border: OutlineInputBorder())),
        const SizedBox(height: 12),
        if (estimate != null)
          Text('Estimated total: GHS ${estimate.toStringAsFixed(2)}', style: Theme.of(context).textTheme.titleMedium)
        else if (_lines.isNotEmpty)
          const Text('The office will price this order.'),
        if (_lines.isNotEmpty && estimate != null) Text('The final price is set by the office from the price list.', style: Theme.of(context).textTheme.bodySmall),
        if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
        const SizedBox(height: 16),
        FilledButton.icon(onPressed: _saving ? null : _save, icon: const Icon(Icons.check), label: const Text('Save order')),
      ]),
    );
  }
}

class _CustomerPicker extends ConsumerStatefulWidget {
  const _CustomerPicker();
  @override
  ConsumerState<_CustomerPicker> createState() => _CustomerPickerState();
}

class _CustomerPickerState extends ConsumerState<_CustomerPicker> {
  String _q = '';
  @override
  Widget build(BuildContext context) {
    final db = ref.watch(databaseProvider);
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: SizedBox(
          height: MediaQuery.of(context).size.height * 0.7,
          child: Column(children: [
            Padding(padding: const EdgeInsets.all(12), child: TextField(autofocus: true, decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search customers'), onChanged: (v) => setState(() => _q = v))),
            Expanded(
              child: StreamBuilder<List<Customer>>(
                stream: db.watchCustomers(_q),
                builder: (context, snap) {
                  final items = snap.data ?? const <Customer>[];
                  if (items.isEmpty) return const Center(child: Text('No customers found.'));
                  return ListView(children: [for (final c in items) ListTile(title: Text(c.name), subtitle: Text(c.city ?? c.type), onTap: () => Navigator.pop(context, c))]);
                },
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

class _ProductPicker extends ConsumerStatefulWidget {
  const _ProductPicker();
  @override
  ConsumerState<_ProductPicker> createState() => _ProductPickerState();
}

class _ProductPickerState extends ConsumerState<_ProductPicker> {
  String _q = '';
  @override
  Widget build(BuildContext context) {
    final db = ref.watch(databaseProvider);
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: SizedBox(
          height: MediaQuery.of(context).size.height * 0.7,
          child: Column(children: [
            Padding(padding: const EdgeInsets.all(12), child: TextField(autofocus: true, decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search products'), onChanged: (v) => setState(() => _q = v.trim().toLowerCase()))),
            Expanded(
              child: StreamBuilder<List<Product>>(
                stream: db.watchProducts(),
                builder: (context, snap) {
                  final items = [for (final p in snap.data ?? const <Product>[]) if (_q.isEmpty || p.name.toLowerCase().contains(_q) || (p.code ?? '').toLowerCase().contains(_q)) p];
                  if (items.isEmpty) return const Center(child: Text('No products found. Sync to get the latest list.'));
                  return ListView(children: [
                    for (final p in items)
                      ListTile(
                        enabled: p.listPrice != null,
                        title: Text(p.name),
                        subtitle: Text(p.listPrice == null ? 'No price yet, cannot be ordered' : 'GHS ${p.listPrice!.toStringAsFixed(2)}'),
                        onTap: () => Navigator.pop(context, p),
                      ),
                  ]);
                },
              ),
            ),
          ]),
        ),
      ),
    );
  }
}
