import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers.dart';
import '../services/app_lock.dart';

/// Shown instead of the app while it is locked.
class LockScreen extends ConsumerStatefulWidget {
  const LockScreen({super.key});
  @override
  ConsumerState<LockScreen> createState() => _LockScreenState();
}

class _LockScreenState extends ConsumerState<LockScreen> {
  final _pin = TextEditingController();
  String? _error;
  bool _busy = false;
  bool _bioOn = false;

  @override
  void initState() {
    super.initState();
    _tryBiometrics();
  }

  @override
  void dispose() {
    _pin.dispose();
    super.dispose();
  }

  Future<void> _tryBiometrics() async {
    final lock = ref.read(appLockProvider);
    final on = await lock.biometricsOn && await lock.biometricsAvailable;
    if (!mounted) return;
    setState(() => _bioOn = on);
    if (on) await ref.read(lockControllerProvider.notifier).unlockWithBiometrics();
  }

  Future<void> _submit() async {
    if (_busy || _pin.text.isEmpty) return;
    setState(() { _busy = true; _error = null; });
    final r = await ref.read(lockControllerProvider.notifier).unlock(_pin.text);
    if (!mounted) return;
    _pin.clear();
    setState(() {
      _busy = false;
      _error = r.ok || r.outcome == UnlockOutcome.tooManyAttempts
          ? null
          : 'Wrong PIN. ${r.attemptsLeft} attempt${r.attemptsLeft == 1 ? '' : 's'} left before you must sign in again.';
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 360),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.lock, size: 48),
                const SizedBox(height: 12),
                Text('DAS Engage 360 is locked', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 24),
                TextField(
                  controller: _pin,
                  autofocus: true,
                  obscureText: true,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(8)],
                  textAlign: TextAlign.center,
                  decoration: InputDecoration(labelText: 'PIN', border: const OutlineInputBorder(), errorText: _error),
                  onSubmitted: (_) => _submit(),
                ),
                const SizedBox(height: 16),
                FilledButton(onPressed: _busy ? null : _submit, child: const Text('Unlock')),
                if (_bioOn)
                  TextButton.icon(
                    onPressed: () => ref.read(lockControllerProvider.notifier).unlockWithBiometrics(),
                    icon: const Icon(Icons.fingerprint),
                    label: const Text('Use fingerprint or face'),
                  ),
                TextButton(
                  onPressed: () => ref.read(lockControllerProvider.notifier).forgotPin(),
                  child: const Text('Forgot PIN? Sign in again'),
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

/// Wraps the signed-in app: shows the lock screen when needed and locks the app when it has been away too long.
class LockGate extends ConsumerStatefulWidget {
  const LockGate({super.key, required this.child});
  final Widget child;
  @override
  ConsumerState<LockGate> createState() => _LockGateState();
}

class _LockGateState extends ConsumerState<LockGate> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final c = ref.read(lockControllerProvider.notifier);
    if (state == AppLifecycleState.paused || state == AppLifecycleState.hidden) c.paused();
    if (state == AppLifecycleState.resumed) c.resumed();
  }

  @override
  Widget build(BuildContext context) {
    final lock = ref.watch(lockControllerProvider);
    if (!lock.loaded) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    return lock.locked ? const LockScreen() : widget.child;
  }
}
