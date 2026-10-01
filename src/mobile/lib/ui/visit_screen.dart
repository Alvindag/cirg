import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/database.dart';
import '../providers.dart';

/// Call report + check-out for the visit in progress. Everything saves locally.
class VisitScreen extends ConsumerStatefulWidget {
  const VisitScreen({super.key, required this.visitId});
  final String visitId;
  @override
  ConsumerState<VisitScreen> createState() => _VisitScreenState();
}

class _VisitScreenState extends ConsumerState<VisitScreen> {
  static const outcomes = ['Positive', 'Neutral', 'Negative', 'Follow-up needed'];
  final _notes = TextEditingController();
  final _next = TextEditingController();
  final _task = TextEditingController();
  String? _outcome;
  final _products = <String>{};
  bool _loaded = false;
  Visit? _visit;
  Customer? _customer;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final db = ref.read(databaseProvider);
    final v = await (db.select(db.visits)..where((x) => x.id.equals(widget.visitId))).getSingle();
    final r = await db.reportForVisit(v.id);
    final c = await db.customer(v.customerId);
    if (r != null) {
      _notes.text = r.notes ?? '';
      _next.text = r.nextStep ?? '';
      _outcome = r.outcome;
      _products.addAll(AppDatabase.decodeProducts(r.productsJson).map((p) => p['productId'] as String));
    }
    if (mounted) setState(() { _visit = v; _customer = c; _loaded = true; });
  }

  @override
  void dispose() {
    _notes.dispose();
    _next.dispose();
    _task.dispose();
    super.dispose();
  }

  Future<String> _save() async {
    final svc = ref.read(visitServiceProvider);
    final id = await svc.saveCallReport(
      visitId: widget.visitId,
      notes: _notes.text.trim().isEmpty ? null : _notes.text.trim(),
      outcome: _outcome,
      nextStep: _next.text.trim().isEmpty ? null : _next.text.trim(),
      productIds: _products.toList(),
    );
    if (_task.text.trim().isNotEmpty) {
      await svc.addTask(title: _task.text.trim(), customerId: _visit!.customerId, callReportId: id, due: DateTime.now().add(const Duration(days: 7)));
      _task.clear();
    }
    return id;
  }

  Future<void> _checkOut() async {
    await _save();
    await ref.read(visitServiceProvider).checkOut(widget.visitId);
    ref.read(syncCoordinatorProvider.notifier).syncNow(); // uploads now if online; otherwise stays queued
    if (mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    if (!_loaded) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final done = _visit!.checkOutAt != null;
    return Scaffold(
      appBar: AppBar(title: Text(_customer?.name ?? 'Visit')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Text(_visit!.checkInLat == null ? 'Checked in (no GPS fix)' : 'Checked in with GPS', style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 12),
        const Text('Products discussed', style: TextStyle(fontWeight: FontWeight.w600)),
        StreamBuilder<List<Product>>(
          stream: ref.watch(databaseProvider).watchProducts(),
          builder: (context, snap) => Wrap(spacing: 8, children: [
            for (final p in snap.data ?? const <Product>[])
              FilterChip(
                label: Text(p.name),
                selected: _products.contains(p.id),
                onSelected: done ? null : (s) => setState(() => s ? _products.add(p.id) : _products.remove(p.id)),
              ),
          ]),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: _outcome,
          decoration: const InputDecoration(labelText: 'Outcome'),
          items: [for (final o in outcomes) DropdownMenuItem(value: o, child: Text(o))],
          onChanged: done ? null : (v) => setState(() => _outcome = v),
        ),
        const SizedBox(height: 12),
        TextField(controller: _notes, enabled: !done, maxLines: 5, decoration: const InputDecoration(labelText: 'Call notes', border: OutlineInputBorder())),
        const SizedBox(height: 12),
        TextField(controller: _next, enabled: !done, decoration: const InputDecoration(labelText: 'Next step')),
        const SizedBox(height: 12),
        TextField(controller: _task, enabled: !done, decoration: const InputDecoration(labelText: 'Add follow-up task (due in 7 days)')),
        const SizedBox(height: 24),
        if (!done) ...[
          OutlinedButton(
            onPressed: () async {
              final messenger = ScaffoldMessenger.of(context);
              await _save();
              messenger.showSnackBar(const SnackBar(content: Text('Saved on this device')));
            },
            child: const Text('Save draft'),
          ),
          const SizedBox(height: 8),
          FilledButton(onPressed: _checkOut, child: const Text('Save and check out')),
        ],
      ]),
    );
  }
}
