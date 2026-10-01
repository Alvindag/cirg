import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/database.dart';
import '../providers.dart';
import '../services/ai_service.dart';

/// Next best actions for today, worked out on the server by explicit rules and cached here for offline use.
class SuggestionsCard extends ConsumerWidget {
  const SuggestionsCard({super.key});

  static IconData _icon(String type) => switch (type) {
        'FollowUp' => Icons.assignment_late,
        'Visit' || 'Revisit' => Icons.directions_walk,
        'OfferSamples' => Icons.medication,
        'ExpiringStock' => Icons.hourglass_bottom,
        _ => Icons.lightbulb_outline,
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) => StreamBuilder<List<NextAction>>(
        stream: ref.watch(databaseProvider).watchNextActions(),
        builder: (context, snap) {
          final items = (snap.data ?? const <NextAction>[]).take(5).toList();
          if (items.isEmpty) return const SizedBox.shrink();
          return Card(
            margin: const EdgeInsets.fromLTRB(12, 8, 12, 4),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Text('Suggested for you', style: Theme.of(context).textTheme.titleSmall),
                ),
                for (final a in items)
                  ListTile(dense: true, leading: Icon(_icon(a.type)), title: Text(a.title), subtitle: Text(a.reason)),
              ]),
            ),
          );
        },
      );
}

/// Proposes a shorter order for today's visits and lets the rep accept it.
Future<void> optimiseRouteFlow(BuildContext context, WidgetRef ref) async {
  final messenger = ScaffoldMessenger.of(context);
  final ai = ref.read(aiServiceProvider);
  try {
    final fix = await ref.read(locationProvider).current();
    final plan = await ai.optimiseRoute(DateTime.now(), latitude: fix?.latitude, longitude: fix?.longitude);
    if (!context.mounted) return;
    final use = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: const Text('Route for today'),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(plan.improves
              ? 'About ${plan.originalKm.toStringAsFixed(1)} km becomes ${plan.optimizedKm.toStringAsFixed(1)} km (straight-line distance).'
              : 'Your plan is already about as short as it can be (${plan.originalKm.toStringAsFixed(1)} km).'),
          const SizedBox(height: 8),
          for (var i = 0; i < plan.stops.length; i++) Text('${i + 1}. ${plan.stops[i]}'),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('Keep my order')),
          if (plan.improves) FilledButton(onPressed: () => Navigator.pop(d, true), child: const Text('Use this order')),
        ],
      ),
    );
    if (use == true) {
      await ai.optimiseRoute(DateTime.now(), latitude: fix?.latitude, longitude: fix?.longitude, apply: true);
      await ref.read(syncCoordinatorProvider.notifier).syncNow(); // brings the new order back to the device
    }
  } on AiException catch (e) {
    messenger.showSnackBar(SnackBar(content: Text(e.message)));
  } catch (_) {
    messenger.showSnackBar(const SnackBar(content: Text('Connect to the internet to optimise your route.')));
  }
}
