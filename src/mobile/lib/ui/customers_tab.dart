import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/database.dart';
import '../providers.dart';
import 'customer_detail_screen.dart';
import 'customer_form_screen.dart';
import 'theme.dart';

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
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const CustomerFormScreen())),
        icon: const Icon(Icons.person_add),
        label: const Text('Add customer'),
      ),
      body: Column(children: [
      Padding(
        padding: const EdgeInsets.all(12),
        child: TextField(
          decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search name or city'),
          onChanged: (v) => setState(() => _q = v),
        ),
      ),
      Expanded(
        child: StreamBuilder<List<Customer>>(
          stream: db.watchCustomers(_q),
          builder: (context, snap) {
            final items = snap.data ?? const [];
            if (items.isEmpty) return const EmptyState(icon: Icons.people_outline, title: 'No customers on this phone yet', message: 'They download when the phone syncs.');
            return ListView.builder(
              padding: const EdgeInsets.only(bottom: 88),
              itemCount: items.length,
              itemBuilder: (context, i) {
                final c = items[i];
                final scheme = Theme.of(context).colorScheme;
                return Card(
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: scheme.primaryContainer,
                      foregroundColor: scheme.onPrimaryContainer,
                      child: Text(c.name.isEmpty ? '?' : c.name.characters.first.toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w700)),
                    ),
                    title: Text(c.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text([c.type, if (c.specialty != null) c.specialty!, if (c.city != null) c.city!].join(' · ')),
                    trailing: c.dirty ? const Icon(Icons.cloud_upload_outlined, size: 18) : Chip(label: Text(c.segment), visualDensity: VisualDensity.compact),
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => CustomerDetailScreen(customerId: c.id))),
                  ),
                );
              },
            );
          },
        ),
      ),
    ]),
    );
  }
}
