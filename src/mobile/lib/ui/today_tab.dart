import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../data/database.dart';
import '../providers.dart';
import '../services/visit_service.dart';
import 'suggestions_card.dart';
import 'visit_screen.dart';

String todayString() => DateFormat('yyyy-MM-dd').format(DateTime.now());

Future<void> startVisit(BuildContext context, WidgetRef ref, {required String customerId, String? plannedVisitId}) async {
  try {
    final visit = await ref.read(visitServiceProvider).checkIn(customerId: customerId, plannedVisitId: plannedVisitId);
    if (context.mounted) {
      await Navigator.push(context, MaterialPageRoute(builder: (_) => VisitScreen(visitId: visit.id)));
    }
  } on VisitInProgressException catch (e) {
    if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
  }
}

class TodayTab extends ConsumerWidget {
  const TodayTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final db = ref.watch(databaseProvider);
    return Column(children: [
      StreamBuilder<Visit?>(
        stream: db.watchOpenVisit(),
        builder: (context, snap) {
          final v = snap.data;
          if (v == null) return const SizedBox.shrink();
          return Card(
            color: Theme.of(context).colorScheme.primaryContainer,
            child: ListTile(
              leading: const Icon(Icons.timer),
              title: const Text('Visit in progress'),
              subtitle: const Text('Tap to add the call report and check out'),
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => VisitScreen(visitId: v.id))),
            ),
          );
        },
      ),
      const SuggestionsCard(),
      Expanded(
        child: StreamBuilder<List<PlanItem>>(
          stream: db.watchPlan(todayString()),
          builder: (context, snap) {
            final items = snap.data ?? const [];
            if (items.isEmpty) {
              return const Center(child: Padding(padding: EdgeInsets.all(24), child: Text('No visits planned for today.\nPick a customer to start an unplanned visit.', textAlign: TextAlign.center)));
            }
            return ListView.separated(
              itemCount: items.length + 1,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, i) {
                if (i == items.length) {
                  return items.length < 3
                      ? const SizedBox.shrink()
                      : Padding(
                          padding: const EdgeInsets.all(8),
                          child: TextButton.icon(onPressed: () => optimiseRouteFlow(context, ref), icon: const Icon(Icons.route), label: const Text('Optimise today\'s route')),
                        );
                }
                final it = items[i];
                return ListTile(
                  leading: CircleAvatar(child: Text('${i + 1}')),
                  title: Text(it.customer.name),
                  subtitle: Text([it.customer.type, if (it.customer.city != null) it.customer.city!, if (it.planned.objective != null) it.planned.objective!].join(' · ')),
                  trailing: it.done
                      ? const Icon(Icons.check_circle, color: Colors.green)
                      : it.visit != null
                          ? const Icon(Icons.timer)
                          : FilledButton.tonal(
                              onPressed: () => startVisit(context, ref, customerId: it.customer.id, plannedVisitId: it.planned.id),
                              child: const Text('Check in'),
                            ),
                  onTap: it.visit == null
                      ? null
                      : () => Navigator.push(context, MaterialPageRoute(builder: (_) => VisitScreen(visitId: it.visit!.id))),
                );
              },
            );
          },
        ),
      ),
    ]);
  }
}
