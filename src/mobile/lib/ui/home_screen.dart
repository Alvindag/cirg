import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../providers.dart';
import 'customers_tab.dart';
import 'tasks_tab.dart';
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
    const titles = ['Today', 'Customers', 'Tasks'];
    return Scaffold(
      appBar: AppBar(
        title: Text(titles[_tab]),
        actions: [
          if (sync.syncing)
            const Padding(padding: EdgeInsets.all(14), child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)))
          else
            IconButton(
              tooltip: 'Sync now',
              icon: Badge(isLabelVisible: pending > 0, label: Text('$pending'), child: const Icon(Icons.sync)),
              onPressed: () => ref.read(syncCoordinatorProvider.notifier).syncNow(),
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
          preferredSize: const Size.fromHeight(22),
          child: Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Text(
              sync.lastError != null
                  ? 'Offline or sync failed – changes are saved on this device'
                  : sync.lastSync == null
                      ? 'Not synced yet'
                      : 'Last synced ${DateFormat.Hm().format(sync.lastSync!)}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
        ),
      ),
      body: [const TodayTab(), const CustomersTab(), const TasksTab()][_tab],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.today), label: 'Today'),
          NavigationDestination(icon: Icon(Icons.people), label: 'Customers'),
          NavigationDestination(icon: Icon(Icons.checklist), label: 'Tasks'),
        ],
      ),
    );
  }
}
