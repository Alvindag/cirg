import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config.dart';
import '../providers.dart';
import 'theme.dart';
import '../services/auth_provider.dart';

/// Sign in with Microsoft (Entra ID). Development builds (--dart-define=DEV_LOGIN=true) also offer a pasted token.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _org = TextEditingController();
  final _url = TextEditingController(text: AppConfig.apiBaseUrl);
  final _token = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _org.dispose();
    _url.dispose();
    _token.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() { _busy = true; _error = null; });
    ref.read(signInMessageProvider.notifier).set(null);
    try {
      await action();
    } on AuthCancelled {
      // user closed the browser window; nothing to report
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _microsoft() => _run(() {
        final tenant = AppConfig.tenantIsFixed ? AppConfig.entraTenant : _org.text.trim();
        if (tenant.isEmpty) throw 'Enter your organisation (for example dasplc.com).';
        return ref.read(sessionManagerProvider).signInEntra(tenant: tenant, baseUrl: _url.text.trim());
      });

  @override
  Widget build(BuildContext context) {
    final message = _error ?? ref.watch(signInMessageProvider);
    return Scaffold(
      
      body: SafeArea(child: ListView(padding: const EdgeInsets.all(16), children: [
        const SizedBox(height: 12),
        const Center(child: BrandMark(size: 64)),
        const SizedBox(height: 14),
        const Center(child: Text('DAS Engage 360', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700))),
        const SizedBox(height: 4),
        Center(child: Text('Field sales, in your pocket', style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: .65)))),
        const SizedBox(height: 24),
        const Text('Sign in', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
        const SizedBox(height: 14),
        if (message != null)
          Card(
            color: Theme.of(context).colorScheme.errorContainer,
            child: Padding(padding: const EdgeInsets.all(12), child: Text(message)),
          ),
        if (AppConfig.apiBaseUrl.isEmpty) ...[
          TextField(controller: _url, keyboardType: TextInputType.url, decoration: const InputDecoration(labelText: 'Server address', hintText: 'http://192.168.1.20:5111', helperText: 'The address of your DAS Engage server')),
          const SizedBox(height: 12),
        ],
        if (AppConfig.entraConfigured) ...[
          if (!AppConfig.tenantIsFixed) ...[
            TextField(controller: _org, decoration: const InputDecoration(labelText: 'Organisation (domain or directory ID)')),
            const SizedBox(height: 12),
          ],
          FilledButton.icon(
            onPressed: _busy ? null : _microsoft,
            icon: const Icon(Icons.login),
            label: const Text('Sign in with Microsoft'),
          ),
        ] else
          const Text('Entra ID is not configured in this build (ENTRA_CLIENT_ID).'),
        if (_busy) const Padding(padding: EdgeInsets.only(top: 16), child: LinearProgressIndicator()),
        if (AppConfig.devLogin) ...[
          const Divider(height: 40),
          const Text('Development sign-in'),
          TextField(controller: _token, obscureText: true, decoration: const InputDecoration(labelText: 'Access token')),
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: _busy ? null : () => _run(() => ref.read(sessionManagerProvider).signInDev(baseUrl: _url.text.trim(), token: _token.text.trim())),
            child: const Text('Use token'),
          ),
        ],
      ])),
    );
  }
}
