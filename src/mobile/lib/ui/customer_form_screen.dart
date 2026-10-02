import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/database.dart';
import '../providers.dart';
import '../services/customer_service.dart';

/// Add a customer, or edit one (works offline; the change is sent with the next sync).
class CustomerFormScreen extends ConsumerStatefulWidget {
  const CustomerFormScreen({super.key, this.customer});
  final Customer? customer;
  @override
  ConsumerState<CustomerFormScreen> createState() => _CustomerFormScreenState();
}

class _CustomerFormScreenState extends ConsumerState<CustomerFormScreen> {
  late final _name = TextEditingController(text: widget.customer?.name);
  late final _specialty = TextEditingController(text: widget.customer?.specialty);
  late final _phone = TextEditingController(text: widget.customer?.phone);
  late final _email = TextEditingController(text: widget.customer?.email);
  late final _address = TextEditingController(text: widget.customer?.address);
  late final _city = TextEditingController(text: widget.customer?.city);
  late String _type = widget.customer?.type ?? 'Pharmacy';
  late int _visits = widget.customer?.targetVisitsPerMonth ?? 2;
  late bool _here = widget.customer == null; // a new customer is usually added on site
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    for (final c in [_name, _specialty, _phone, _email, _address, _city]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    setState(() { _busy = true; _error = null; });
    final draft = CustomerDraft(
      type: _type, name: _name.text, specialty: _specialty.text, phone: _phone.text, email: _email.text, address: _address.text,
      city: _city.text, targetVisitsPerMonth: _visits, useCurrentLocation: _here,
    );
    try {
      final service = ref.read(customerServiceProvider);
      final existing = widget.customer;
      String id;
      if (existing == null) {
        id = await service.create(draft);
      } else {
        await service.update(existing.id, draft);
        id = existing.id;
      }
      if (mounted) Navigator.pop(context, id);
      ref.read(syncCoordinatorProvider.notifier).syncNow();
    } on ValidationException catch (e) {
      setState(() { _busy = false; _error = e.message; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final editing = widget.customer != null;
    return Scaffold(
      appBar: AppBar(title: Text(editing ? 'Edit customer' : 'Add customer')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        TextField(controller: _name, decoration: const InputDecoration(labelText: 'Name', border: OutlineInputBorder()), textCapitalization: TextCapitalization.words),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: _type,
          decoration: const InputDecoration(labelText: 'Type', border: OutlineInputBorder()),
          items: [for (final t in customerTypes) DropdownMenuItem(value: t, child: Text(t))],
          onChanged: (v) => setState(() => _type = v ?? _type),
        ),
        const SizedBox(height: 12),
        TextField(controller: _specialty, decoration: const InputDecoration(labelText: 'Specialty (optional)', border: OutlineInputBorder())),
        const SizedBox(height: 12),
        TextField(controller: _city, decoration: const InputDecoration(labelText: 'City', border: OutlineInputBorder())),
        const SizedBox(height: 12),
        TextField(controller: _address, decoration: const InputDecoration(labelText: 'Address', border: OutlineInputBorder())),
        const SizedBox(height: 12),
        TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Phone', border: OutlineInputBorder())),
        const SizedBox(height: 12),
        TextField(controller: _email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder())),
        const SizedBox(height: 12),
        Row(children: [
          const Expanded(child: Text('Visits per month')),
          IconButton(tooltip: 'Fewer visits', onPressed: _visits > 0 ? () => setState(() => _visits--) : null, icon: const Icon(Icons.remove)),
          Text('$_visits'),
          IconButton(tooltip: 'More visits', onPressed: _visits < 31 ? () => setState(() => _visits++) : null, icon: const Icon(Icons.add)),
        ]),
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          value: _here,
          onChanged: (v) => setState(() => _here = v ?? false),
          title: Text(editing ? 'Set the position to where I am now' : 'Use where I am now as the position'),
          subtitle: const Text('Later visits are checked against it.'),
        ),
        if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
        const SizedBox(height: 16),
        FilledButton(onPressed: _busy ? null : _save, child: Text(editing ? 'Save' : 'Add customer')),
      ]),
    );
  }
}
