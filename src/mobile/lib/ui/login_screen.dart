import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers.dart';
import '../services/api_client.dart';

/// Development sign-in: API address + bearer token. Production uses Entra ID SSO with MFA.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _url = TextEditingController(text: 'https://');
  final _token = TextEditingController();

  @override
  void dispose() {
    _url.dispose();
    _token.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('DAS Engage 360')),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          const Text('Sign in', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w600)),
          const SizedBox(height: 16),
          TextField(controller: _url, keyboardType: TextInputType.url, decoration: const InputDecoration(labelText: 'Server address')),
          const SizedBox(height: 12),
          TextField(controller: _token, obscureText: true, decoration: const InputDecoration(labelText: 'Access token')),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: () => ref.read(sessionProvider.notifier).signIn(Session(baseUrl: _url.text.trim(), token: _token.text.trim())),
            child: const Text('Sign in'),
          ),
        ]),
      );
}
