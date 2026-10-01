import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/database.dart';
import '../providers.dart';
import 'today_tab.dart';

class CustomersTab extends ConsumerStatefulWidget {
  const CustomersTab({super.key});
  @override
  ConsumerState<CustomersTab> createState() => _CustomersTabState();
}

class _CustomersTabState extends ConsumerState<CustomersTab> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final db = ref.watch(databaseProvider);
    return Column(children: [
      Padding(
        padding: const EdgeInsets.all(12),
        child: TextField(
          decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search name or city', border: OutlineInputBorder()),
          onChanged: (v) => setState(() => _q = v),
        ),
      ),
      Expanded(
        child: StreamBuilder<List<Customer>>(
          stream: db.watchCustomers(_q),
          builder: (context, snap) {
            final items = snap.data ?? const [];
            if (items.isEmpty) return const Center(child: Text('No customers on this device yet. Sync to download them.'));
            return ListView.separated(
              itemCount: items.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, i) {
                final c = items[i];
                return ListTile(
                  title: Text(c.name),
                  subtitle: Text([c.type, if (c.specialty != null) c.specialty!, if (c.city != null) c.city!].join(' · ')),
                  trailing: Text(c.segment),
                  onTap: () async {
                    final go = await showDialog<bool>(
                      context: context,
                      builder: (d) => AlertDialog(
                        title: Text(c.name),
                        content: const Text('Start an unplanned visit here?'),
                        actions: [
                          TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('Cancel')),
                          FilledButton(onPressed: () => Navigator.pop(d, true), child: const Text('Check in')),
                        ],
                      ),
                    );
                    if (go == true && context.mounted) await startVisit(context, ref, customerId: c.id);
                  },
                );
              },
            );
          },
        ),
      ),
    ]);
  }
}
