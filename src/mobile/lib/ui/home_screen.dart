import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../providers.dart';
import 'customers_tab.dart';
import 'notifications_screen.dart';
import 'problems_screen.dart';
import 'security_screen.dart';
import 'orders_tab.dart';
import 'samples_tab.dart';
import 'tasks_tab.dart';
import 'theme.dart';
import 'today_tab.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});
  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final sync = ref.watch(syncCoordinatorProvider);
    final pending = ref.watch(pendingCountProvider).value ?? 0;
    final unread = ref.watch(unreadCountProvider).value ?? 0;
    final problems = (ref.watch(problemsProvider).value ?? const []).length;
    const titles = ['Today', 'Customers', 'Samples', 'Tasks'];
    return Scaffold(
      appBar: AppBar(
        title: Row(children: [const BrandMark(size: 26), const SizedBox(width: 10), Text(titles[_tab])]),
        actions: [
          if (sync.syncing)
            const Padding(padding: EdgeInsets.all(14), child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)))
          else
            IconButton(
              tooltip: 'Sync now',
              icon: Badge(isLabelVisible: pending > 0, label: Text('$pending'), child: const Icon(Icons.sync)),
              onPressed: () => ref.read(syncCoordinatorProvider.notifier).syncNow(),
            ),
          PopupMenuButton<String>(
            tooltip: 'More',
            icon: Badge(isLabelVisible: unread + problems > 0, label: Text('${unread + problems}'), child: const Icon(Icons.more_vert)),
            onSelected: (v) => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => v == 'notices' ? const NotificationsScreen() : v == 'problems' ? const ProblemsScreen() : const SecurityScreen()),
            ),
            itemBuilder: (_) => [
              PopupMenuItem(value: 'notices', child: Text(unread > 0 ? 'Notices ($unread new)' : 'Notices')),
              PopupMenuItem(value: 'problems', child: Text(problems > 0 ? 'Problem items ($problems)' : 'Problem items')),
              const PopupMenuItem(value: 'security', child: Text('Security')),
            ],
          ),
          IconButton(
            tooltip: 'Sign out',
            icon: const Icon(Icons.logout),
            onPressed: () async {
              if (pending > 0) {
                final ok = await showDialog<bool>(
                  context: context,
                  builder: (c) => AlertDialog(
                    title: const Text('Unsynced data'),
                    content: Text('$pending item(s) have not been uploaded yet. Sync before signing out.'),
                    actions: [
                      TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
                      TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Sign out anyway')),
                    ],
                  ),
                );
                if (ok != true) return;
              }
              await ref.read(sessionManagerProvider).signOut();
            },
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(44),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
            child: Align(alignment: Alignment.centerLeft, child: _SyncPill(sync: sync, pending: pending)),
          ),
        ),
      ),
      body: [const TodayTab(), const CustomersTab(), const OrdersTab(), const SamplesTab(), const TasksTab()][_tab],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.today_outlined), selectedIcon: Icon(Icons.today), label: 'Today'),
          NavigationDestination(icon: Icon(Icons.people_outline), selectedIcon: Icon(Icons.people), label: 'Customers'),
          NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long), label: 'Orders'),
          NavigationDestination(icon: Icon(Icons.medication_outlined), selectedIcon: Icon(Icons.medication), label: 'Samples'),
          NavigationDestination(icon: Icon(Icons.checklist_outlined), selectedIcon: Icon(Icons.checklist), label: 'Tasks'),
        ],
      ),
    );
  }
}

/// One line that says whether the phone is up to date, and why not when it isn't. Tap it for details.
class _SyncPill extends ConsumerWidget {
  const _SyncPill({required this.sync, required this.pending});
  final SyncStatus sync;
  final int pending;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final failed = sync.lastError != null && !sync.syncing;
    final (IconData icon, String label, Color color) = sync.syncing
        ? (Icons.sync, 'Syncing…', const Color(0xFF6CB4F0))
        : failed
            ? (Icons.cloud_off, 'Can\'t sync – tap for details', const Color(0xFFF0B84F))
            : sync.lastSync == null
                ? (Icons.cloud_queue, 'Not synced yet', Colors.white70)
                : (Icons.cloud_done, 'Synced ${DateFormat.Hm().format(sync.lastSync!)}', const Color(0xFF5CCF95));
    final waiting = pending > 0 ? ' · $pending waiting to upload' : '';
    return Material(
      color: Colors.white.withValues(alpha: .1),
      shape: const StadiumBorder(),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: failed ? () => _details(context, ref) : null,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 16, color: color),
            const SizedBox(width: 6),
            Text('$label$waiting', style: const TextStyle(fontSize: 12.5, color: Colors.white, fontWeight: FontWeight.w500)),
          ]),
        ),
      ),
    );
  }

  void _details(BuildContext context, WidgetRef ref) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (c) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Could not sync', style: Theme.of(c).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Text(sync.lastReason ?? 'Something went wrong while syncing.'),
          const SizedBox(height: 10),
          Text('Your changes are safe on this phone and upload when it works.', style: TextStyle(color: Theme.of(c).colorScheme.onSurface.withValues(alpha: .65))),
          if (sync.lastError != null) ...[
            const SizedBox(height: 12),
            ExpansionTile(
              tilePadding: EdgeInsets.zero,
              title: const Text('Technical details', style: TextStyle(fontSize: 13)),
              children: [SelectableText(sync.lastError!, style: const TextStyle(fontSize: 12, fontFamily: 'monospace'))],
            ),
          ],
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: () {
                Navigator.pop(c);
                ref.read(syncCoordinatorProvider.notifier).syncNow();
              },
              icon: const Icon(Icons.sync),
              label: const Text('Try again'),
            ),
          ),
        ]),
      ),
    );
  }
}
