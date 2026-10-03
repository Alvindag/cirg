import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers.dart';

/// Items the server refused for good. They are not resent. Retry puts one back in the queue (after the cause was fixed);
/// Remove deletes it from this phone.
class ProblemsScreen extends ConsumerWidget {
  const ProblemsScreen({super.key});

  static const _icons = {
    'customer': Icons.person_add,
    'plan': Icons.event,
    'visit': Icons.place,
    'report': Icons.description,
    'task': Icons.checklist,
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(problemsProvider).value ?? const [];
    final db = ref.watch(databaseProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Problem items')),
      body: items.isEmpty
          ? const Center(child: Padding(padding: EdgeInsets.all(24), child: Text('Nothing was refused. Everything you did is on the server.', textAlign: TextAlign.center)))
          : ListView.separated(
              itemCount: items.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, i) {
                final p = items[i];
                return ListTile(
                  leading: Icon(_icons[p.kind] ?? Icons.error_outline),
                  title: Text(p.summary),
                  subtitle: Text(p.reason),
                  isThreeLine: p.reason.length > 60,
                  trailing: Wrap(spacing: 4, children: [
                    IconButton(
                      tooltip: 'Retry',
                      icon: const Icon(Icons.refresh),
                      onPressed: () async {
                        await db.retryProblem(p);
                        await ref.read(syncCoordinatorProvider.notifier).syncNow();
                      },
                    ),
                    IconButton(
                      tooltip: 'Remove from this phone',
                      icon: const Icon(Icons.delete_outline),
                      onPressed: () async {
                        final ok = await showDialog<bool>(
                          context: context,
                          builder: (d) => AlertDialog(
                            title: const Text('Remove from this phone?'),
                            content: Text(p.kind == 'visit'
                                ? 'The visit, its call report and its photos will be deleted from this phone. They were never accepted by the server.'
                                : 'This cannot be undone.'),
                            actions: [
                              TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('Cancel')),
                              TextButton(onPressed: () => Navigator.pop(d, true), child: const Text('Remove')),
                            ],
                          ),
                        );
                        if (ok == true) await db.discardProblem(p);
                      },
                    ),
                  ]),
                );
              },
            ),
    );
  }
}
