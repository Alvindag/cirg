import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../data/database.dart';
import '../providers.dart';
import '../services/visit_service.dart';
import 'suggestions_card.dart';
import 'theme.dart';
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
              return const EmptyState(
                icon: Icons.event_available,
                title: 'No visits planned for today',
                message: 'Open Customers to start an unplanned visit or plan one.',
              );
            }
            final done = items.where((i) => i.done).length;
            return ListView.builder(
              padding: const EdgeInsets.only(bottom: 16),
              itemCount: items.length + 2,
              itemBuilder: (context, i) {
                if (i == 0) return _DayHeader(done: done, total: items.length);
                if (i == items.length + 1) {
                  return items.length < 3
                      ? const SizedBox.shrink()
                      : Padding(
                          padding: const EdgeInsets.all(8),
                          child: TextButton.icon(onPressed: () => optimiseRouteFlow(context, ref), icon: const Icon(Icons.route), label: const Text('Optimise today\'s route')),
                        );
                }
                final it = items[i - 1];
                final scheme = Theme.of(context).colorScheme;
                return Card(
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                    leading: CircleAvatar(
                      backgroundColor: it.done ? const Color(0xFFE2F3EA) : scheme.primaryContainer,
                      foregroundColor: it.done ? Das.good : scheme.onPrimaryContainer,
                      child: it.done ? const Icon(Icons.check) : Text('$i', style: const TextStyle(fontWeight: FontWeight.w700)),
                    ),
                    title: Text(it.customer.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text([it.customer.type, if (it.customer.city != null) it.customer.city!, if (it.planned.objective != null) it.planned.objective!].join(' · ')),
                    trailing: it.done
                        ? const Icon(Icons.check_circle, color: Das.good)
                        : it.visit != null
                            ? const Icon(Icons.timer)
                            : FilledButton.tonal(
                                onPressed: () => startVisit(context, ref, customerId: it.customer.id, plannedVisitId: it.planned.id),
                                child: const Text('Check in'),
                              ),
                    onTap: it.visit == null
                        ? null
                        : () => Navigator.push(context, MaterialPageRoute(builder: (_) => VisitScreen(visitId: it.visit!.id))),
                    onLongPress: it.visit != null
                        ? null
                        : () async {
                            final cancel = await showDialog<bool>(
                              context: context,
                              builder: (d) => AlertDialog(
                                title: Text('Cancel the visit to ${it.customer.name}?'),
                                actions: [
                                  TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('Keep it')),
                                  TextButton(onPressed: () => Navigator.pop(d, true), child: const Text('Cancel visit')),
                                ],
                              ),
                            );
                            if (cancel == true) {
                              await ref.read(planServiceProvider).cancel(it.planned.id);
                              ref.read(syncCoordinatorProvider.notifier).syncNow();
                            }
                          },
                  ),
                );
              },
            );
          },
        ),
      ),
    ]);
  }
}

/// Today's date and how far through the plan the rep is.
class _DayHeader extends StatelessWidget {
  const _DayHeader({required this.done, required this.total});
  final int done;
  final int total;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 6),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        gradient: const LinearGradient(colors: [Das.charcoal, Das.blue], begin: Alignment.topLeft, end: Alignment.bottomRight),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(DateFormat('EEEE d MMMM').format(DateTime.now()), style: const TextStyle(color: Colors.white70, fontSize: 13)),
        const SizedBox(height: 4),
        Text(done == total ? 'All visits done' : '$done of $total visits done', style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w700)),
        const SizedBox(height: 12),
        ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: LinearProgressIndicator(value: total == 0 ? 0 : done / total, minHeight: 8, backgroundColor: Colors.white24, valueColor: AlwaysStoppedAnimation(scheme.brightness == Brightness.dark ? const Color(0xFF5CCF95) : Colors.white)),
        ),
      ]),
    );
  }
}
