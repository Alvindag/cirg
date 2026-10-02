import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../data/database.dart';
import '../providers.dart';
import '../services/customer_service.dart' show ValidationException;
import 'customer_form_screen.dart';
import 'today_tab.dart';

/// A customer: details, recent visits, upcoming plans, and what you can do (check in, plan a visit, edit).
class CustomerDetailScreen extends ConsumerStatefulWidget {
  const CustomerDetailScreen({super.key, required this.customerId});
  final String customerId;

  @override
  ConsumerState<CustomerDetailScreen> createState() => _CustomerDetailScreenState();
}

class _CustomerDetailScreenState extends ConsumerState<CustomerDetailScreen> {
  // Streams are made once; creating them inside build would restart them on every rebuild.
  late final _customer = (ref.read(databaseProvider).select(ref.read(databaseProvider).customers)..where((c) => c.id.equals(widget.customerId))).watch();
  late final _visits = ref.read(databaseProvider).watchVisitsForCustomer(widget.customerId);

  String get customerId => widget.customerId;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<Customer>>(
      stream: _customer,
      builder: (context, snap) {
        final c = snap.data?.firstOrNull;
        if (c == null) return Scaffold(appBar: AppBar(), body: const Center(child: Text('This customer is no longer on the device.')));
        return Scaffold(
          appBar: AppBar(title: Text(c.name), actions: [
            IconButton(
              tooltip: 'Edit',
              icon: const Icon(Icons.edit),
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => CustomerFormScreen(customer: c))),
            ),
          ]),
          body: ListView(children: [
            if (c.dirty) const ListTile(leading: Icon(Icons.cloud_upload_outlined), title: Text('Not uploaded yet'), subtitle: Text('It will be sent at the next sync.')),
            ListTile(leading: const Icon(Icons.badge_outlined), title: Text(c.type), subtitle: Text([if (c.specialty != null) c.specialty!, 'Segment ${c.segment}'].join(' · '))),
            if (c.address != null || c.city != null) ListTile(leading: const Icon(Icons.place_outlined), title: Text([if (c.address != null) c.address!, if (c.city != null) c.city!].join(', '))),
            if (c.phone != null) ListTile(leading: const Icon(Icons.phone_outlined), title: Text(c.phone!)),
            if (c.email != null) ListTile(leading: const Icon(Icons.email_outlined), title: Text(c.email!)),
            ListTile(leading: const Icon(Icons.repeat), title: Text('${c.targetVisitsPerMonth} visits a month')),
            const Divider(),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Wrap(spacing: 8, children: [
                FilledButton.icon(onPressed: () => startVisit(context, ref, customerId: c.id), icon: const Icon(Icons.login), label: const Text('Check in')),
                OutlinedButton.icon(onPressed: () => _plan(context, c), icon: const Icon(Icons.event_available), label: const Text('Plan a visit')),
              ]),
            ),
            _Upcoming(customerId: c.id),
            const Divider(),
            const Padding(padding: EdgeInsets.fromLTRB(16, 8, 16, 0), child: Text('Recent visits', style: TextStyle(fontWeight: FontWeight.bold))),
            StreamBuilder<List<Visit>>(
              stream: _visits,
              builder: (context, vs) {
                final visits = vs.data ?? const [];
                if (visits.isEmpty) return const ListTile(title: Text('No visits yet.'));
                return Column(children: [
                  for (final v in visits)
                    ListTile(
                      dense: true,
                      leading: Icon(v.checkOutAt == null ? Icons.timer : Icons.check_circle_outline),
                      title: Text(DateFormat.yMMMd().add_Hm().format(DateTime.parse(v.checkInAt).toLocal())),
                      subtitle: Text(v.checkOutAt == null ? 'In progress' : 'Done'),
                    ),
                ]);
              },
            ),
          ]),
        );
      },
    );
  }

  Future<void> _plan(BuildContext context, Customer c) async {
    final now = DateTime.now();
    final date = await showDatePicker(context: context, initialDate: now, firstDate: now, lastDate: now.add(const Duration(days: 365)));
    if (date == null || !context.mounted) return;
    final controller = TextEditingController();
    final objective = await showDialog<String>(
      context: context,
      builder: (d) => AlertDialog(
        title: const Text('What is the visit for?'),
        content: TextField(controller: controller, autofocus: true, decoration: const InputDecoration(hintText: 'Optional, for example "introduce the new range"')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(d, controller.text), child: const Text('Plan it')),
        ],
      ),
    );
    if (objective == null) return;
    try {
      await ref.read(planServiceProvider).plan(customerId: c.id, date: date, objective: objective);
      ref.read(syncCoordinatorProvider.notifier).syncNow();
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Planned for ${DateFormat.yMMMd().format(date)}.')));
    } on ValidationException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}

class _Upcoming extends ConsumerStatefulWidget {
  const _Upcoming({required this.customerId});
  final String customerId;

  @override
  ConsumerState<_Upcoming> createState() => _UpcomingState();
}

class _UpcomingState extends ConsumerState<_Upcoming> {
  late final _plans = ref.read(planServiceProvider).watchUpcoming(widget.customerId);

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<PlannedVisit>>(
      stream: _plans,
      builder: (context, snap) {
        final plans = snap.data ?? const [];
        if (plans.isEmpty) return const SizedBox.shrink();
        return Column(children: [
          const Padding(padding: EdgeInsets.fromLTRB(16, 8, 16, 0), child: Align(alignment: Alignment.centerLeft, child: Text('Planned', style: TextStyle(fontWeight: FontWeight.bold)))),
          for (final p in plans)
            ListTile(
              dense: true,
              leading: const Icon(Icons.event),
              title: Text(DateFormat.yMMMd().format(DateTime.parse(p.plannedDate))),
              subtitle: p.objective == null ? null : Text(p.objective!),
              trailing: IconButton(
                tooltip: 'Cancel this plan',
                icon: const Icon(Icons.close),
                onPressed: () async {
                  try {
                    await ref.read(planServiceProvider).cancel(p.id);
                    ref.read(syncCoordinatorProvider.notifier).syncNow();
                  } on ValidationException catch (e) {
                    if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
                  }
                },
              ),
            ),
        ]);
      },
    );
  }
}
