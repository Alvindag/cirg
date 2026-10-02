import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers.dart';
import '../services/app_lock.dart';

/// Turn the PIN lock on or off, and choose fingerprint / face and how long the app may stay unlocked in the background.
class SecurityScreen extends ConsumerStatefulWidget {
  const SecurityScreen({super.key});
  @override
  ConsumerState<SecurityScreen> createState() => _SecurityScreenState();
}

class _SecurityScreenState extends ConsumerState<SecurityScreen> {
  bool _bio = false, _bioAvailable = false;
  LockTimeout _timeout = LockTimeout.oneMinute;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    final lock = ref.read(appLockProvider);
    final bio = await lock.biometricsOn, avail = await lock.biometricsAvailable, t = await lock.timeout;
    if (mounted) setState(() { _bio = bio; _bioAvailable = avail; _timeout = t; });
  }

  Future<String?> _ask(String title, {String? confirmLabel}) => showDialog<String>(
        context: context,
        builder: (c) {
          final ctrl = TextEditingController();
          return AlertDialog(
            title: Text(title),
            content: TextField(
              controller: ctrl,
              autofocus: true,
              obscureText: true,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(8)],
              decoration: InputDecoration(labelText: confirmLabel ?? 'PIN'),
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(c), child: const Text('Cancel')),
              FilledButton(onPressed: () => Navigator.pop(c, ctrl.text), child: const Text('OK')),
            ],
          );
        },
      );

  void _say(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  Future<void> _turnOn() async {
    final pin = await _ask('Choose a PIN (4 to 8 digits)');
    if (pin == null || !mounted) return;
    final again = await _ask('Type it again', confirmLabel: 'Repeat the PIN');
    if (again == null) return;
    if (again != pin) { _say('The two PINs are different.'); return; }
    try {
      await ref.read(lockControllerProvider.notifier).enable(pin, biometrics: _bioAvailable);
      await _refresh();
      _say('PIN lock is on.');
    } on WeakPinException catch (e) {
      _say(e.message);
    }
  }

  Future<void> _turnOff() async {
    final pin = await _ask('Enter your PIN to turn the lock off');
    if (pin == null) return;
    final ok = await ref.read(lockControllerProvider.notifier).disable(pin);
    await _refresh();
    _say(ok ? 'PIN lock is off.' : 'That PIN is not right.');
  }

  @override
  Widget build(BuildContext context) {
    final lock = ref.watch(lockControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Security')),
      body: ListView(children: [
        SwitchListTile(
          title: const Text('Ask for a PIN to open the app'),
          subtitle: const Text('Protects your customers and call reports if the phone is lost or borrowed.'),
          value: lock.enabled,
          onChanged: (on) => on ? _turnOn() : _turnOff(),
        ),
        if (lock.enabled) ...[
          SwitchListTile(
            title: const Text('Use fingerprint or face'),
            subtitle: Text(_bioAvailable ? 'The PIN still works as a fallback.' : 'No fingerprint or face is set up on this phone.'),
            value: _bio && _bioAvailable,
            onChanged: _bioAvailable ? (v) async { await ref.read(appLockProvider).setBiometrics(v); await _refresh(); } : null,
          ),
          ListTile(
            title: const Text('Lock the app'),
            trailing: DropdownButton<LockTimeout>(
              value: _timeout,
              items: [for (final t in LockTimeout.values) DropdownMenuItem(value: t, child: Text(t.label))],
              onChanged: (t) async {
                if (t == null) return;
                await ref.read(appLockProvider).setTimeout(t);
                await _refresh();
              },
            ),
          ),
          ListTile(
            leading: const Icon(Icons.lock),
            title: const Text('Lock now'),
            onTap: () {
              ref.read(lockControllerProvider.notifier).lockNow();
              Navigator.pop(context);
            },
          ),
        ],
        const Padding(
          padding: EdgeInsets.all(16),
          child: Text('Five wrong PINs in a row sign you out, and you must sign in with Microsoft again. '
              'If your phone is lost, ask your administrator to clear it remotely: it empties itself the next time it is online.'),
        ),
      ]),
    );
  }
}
