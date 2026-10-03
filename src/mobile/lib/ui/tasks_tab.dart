import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/database.dart';
import '../providers.dart';

class TasksTab extends ConsumerWidget {
  const TasksTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => StreamBuilder<List<FollowUpTask>>(
        stream: ref.watch(databaseProvider).watchOpenTasks(),
        builder: (context, snap) {
          final items = snap.data ?? const [];
          if (items.isEmpty) return const Center(child: Text('No open follow-up tasks.'));
          return ListView.separated(
            itemCount: items.length,
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (context, i) {
              final t = items[i];
              return CheckboxListTile(
                value: false,
                title: Text(t.title),
                subtitle: t.dueDate == null ? null : Text('Due ${t.dueDate}'),
                onChanged: (_) => ref.read(visitServiceProvider).completeTask(t.id),
              );
            },
          );
        },
      );
}
