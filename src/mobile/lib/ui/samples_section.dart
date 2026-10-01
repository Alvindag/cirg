import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/database.dart';
import '../providers.dart';
import '../services/sample_service.dart';
import 'signature_pad.dart';

/// Samples handed over during a visit: choose batches and quantities, then the customer signs. Works offline.
class SamplesSection extends ConsumerWidget {
  const SamplesSection({super.key, required this.visitId, required this.customerId, required this.enabled, this.signerName});
  final String visitId;
  final String customerId;
  final bool enabled;
  final String? signerName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final db = ref.watch(databaseProvider);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('Samples given', style: TextStyle(fontWeight: FontWeight.w600)),
      const SizedBox(height: 8),
      if (enabled) OutlinedButton.icon(onPressed: () => _give(context, ref), icon: const Icon(Icons.medication), label: const Text('Give samples')),
      StreamBuilder<List<SampleDistribution>>(
        stream: db.watchDistributionsForVisit(visitId),
        builder: (context, snap) => StreamBuilder<List<Product>>(
          stream: db.watchProducts(),
          builder: (context, ps) {
            final names = {for (final p in ps.data ?? const <Product>[]) p.id: p.name};
            return Column(children: [
              for (final d in snap.data ?? const <SampleDistribution>[])
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.medication_outlined),
                  title: Text('${d.quantity} × ${names[d.productId] ?? 'Product'}'),
                  subtitle: Text([
                    switch (d.status) { 'accepted' => 'Confirmed', 'rejected' => 'Rejected: ${d.rejectReason ?? ''}', _ => 'Waiting to upload' },
                    d.signatureAttachmentId == null ? 'No signature' : 'Signed',
                  ].join(' · ')),
                  trailing: d.status == 'pending'
                      ? IconButton(tooltip: 'Undo', icon: const Icon(Icons.undo), onPressed: () => ref.read(sampleServiceProvider).undoPending(d.id))
                      : null,
                ),
            ]);
          },
        ),
      ),
    ]);
  }

  Future<void> _give(BuildContext context, WidgetRef ref) async {
    final messenger = ScaffoldMessenger.of(context);
    final stock = (await ref.read(databaseProvider).watchStock().first).where((s) => s.usable(DateTime.now())).toList();
    if (!context.mounted) return;
    if (stock.isEmpty) {
      messenger.showSnackBar(const SnackBar(content: Text('You have no usable samples. Request stock from the Samples tab.')));
      return;
    }
    final lines = await showDialog<List<SampleLine>>(context: context, builder: (_) => _GiveDialog(stock: stock));
    if (lines == null || lines.isEmpty || !context.mounted) return;

    // The customer signs once for everything handed over.
    final sig = await showSignatureDialog(context, suggestedName: signerName, initialMeaning: 'Samples received');
    if (!context.mounted) return;
    if (sig == null) {
      final goOn = await showDialog<bool>(
        context: context,
        builder: (d) => AlertDialog(
          title: const Text('Give without a signature?'),
          content: const Text('Without the customer\'s signature this hand-over will be flagged in compliance reports.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('Cancel')),
            TextButton(onPressed: () => Navigator.pop(d, true), child: const Text('Give anyway')),
          ],
        ),
      );
      if (goOn != true) return;
    }
    try {
      String? signatureId;
      if (sig != null) {
        signatureId = await ref.read(attachmentServiceProvider).addSignature(visitId, sig.png, signerName: sig.signerName, meaning: sig.meaning);
      }
      await ref.read(sampleServiceProvider).giveSamples(visitId: visitId, customerId: customerId, lines: lines, signatureAttachmentId: signatureId);
    } on SampleException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('$e')));
    }
  }
}

class _GiveDialog extends StatefulWidget {
  const _GiveDialog({required this.stock});
  final List<StockItem> stock;
  @override
  State<_GiveDialog> createState() => _GiveDialogState();
}

class _Line {
  _Line(this.batchId);
  String batchId;
  final qty = TextEditingController(text: '1');
}

class _GiveDialogState extends State<_GiveDialog> {
  late final List<_Line> _lines = [_Line(widget.stock.first.batchId)];
  String? _error;

  @override
  void dispose() {
    for (final l in _lines) {
      l.qty.dispose();
    }
    super.dispose();
  }

  StockItem _item(String batchId) => widget.stock.firstWhere((s) => s.batchId == batchId);

  void _done() {
    final lines = <SampleLine>[];
    final perBatch = <String, int>{};
    for (final l in _lines) {
      final q = int.tryParse(l.qty.text.trim());
      if (q == null || q < 1) return setState(() => _error = 'Enter a quantity of at least 1 on every line.');
      final s = _item(l.batchId);
      perBatch[l.batchId] = (perBatch[l.batchId] ?? 0) + q;
      if (perBatch[l.batchId]! > s.available) return setState(() => _error = 'Only ${s.available} of batch ${s.batchNumber} left.');
      lines.add(SampleLine(batchId: l.batchId, productId: s.productId, quantity: q));
    }
    Navigator.pop(context, lines);
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Give samples'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            for (final l in _lines)
              Row(children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: l.batchId,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Product and batch'),
                    items: [
                      for (final s in widget.stock)
                        DropdownMenuItem(value: s.batchId, child: Text('${s.productName ?? 'Product'} · ${s.batchNumber} (${s.available} left)', overflow: TextOverflow.ellipsis)),
                    ],
                    onChanged: (v) => setState(() => l.batchId = v ?? l.batchId),
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(width: 60, child: TextField(controller: l.qty, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Qty'))),
                if (_lines.length > 1)
                  IconButton(icon: const Icon(Icons.close), onPressed: () => setState(() => _lines.remove(l))),
              ]),
            Align(alignment: Alignment.centerLeft, child: TextButton.icon(onPressed: () => setState(() => _lines.add(_Line(widget.stock.first.batchId))), icon: const Icon(Icons.add), label: const Text('Add another'))),
            if (_error != null) Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(onPressed: _done, child: const Text('Next: customer signs')),
        ],
      );
}
