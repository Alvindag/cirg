import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../providers.dart';

/// Notices from head office, for example a sample batch you hold was recalled. Reading one marks it read; the server is told at the next sync.
class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(notificationsProvider).value ?? const [];
    final db = ref.watch(databaseProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notices'),
        actions: [
          if (items.any((n) => !n.readLocally)) TextButton(onPressed: () => db.markNotificationsRead(), child: const Text('Mark all read')),
        ],
      ),
      body: items.isEmpty
          ? const Center(child: Padding(padding: EdgeInsets.all(24), child: Text('No notices.', textAlign: TextAlign.center)))
          : ListView.separated(
              itemCount: items.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, i) {
                final n = items[i];
                final recall = n.kind == 'batch.recalled';
                return ListTile(
                  leading: Icon(recall ? Icons.warning_amber : Icons.info_outline, color: recall && !n.readLocally ? Theme.of(context).colorScheme.error : null),
                  title: Text(n.title, style: TextStyle(fontWeight: n.readLocally ? FontWeight.normal : FontWeight.bold)),
                  subtitle: Text([if (n.body != null) n.body!, DateFormat.yMMMd().add_Hm().format(DateTime.tryParse(n.createdAt)?.toLocal() ?? DateTime.now())].join('\n')),
                  isThreeLine: n.body != null,
                  trailing: n.readLocally ? null : IconButton(tooltip: 'Mark read', icon: const Icon(Icons.done), onPressed: () => db.markNotificationsRead(n.id)),
                );
              },
            ),
    );
  }
}
