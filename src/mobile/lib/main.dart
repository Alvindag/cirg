import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'providers.dart';
import 'ui/home_screen.dart';
import 'ui/login_screen.dart';

void main() {
  runApp(const ProviderScope(child: EngageApp()));
}

class EngageApp extends ConsumerStatefulWidget {
  const EngageApp({super.key});
  @override
  ConsumerState<EngageApp> createState() => _EngageAppState();
}

class _EngageAppState extends ConsumerState<EngageApp> {
  late final Future<void> _restore = ref.read(sessionManagerProvider).restore();

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);
    ref.listen(sessionProvider, (prev, next) {
      if (next != null && prev == null) ref.read(syncCoordinatorProvider.notifier).start();
    });
    return MaterialApp(
      title: 'DAS Engage 360',
      theme: ThemeData(colorSchemeSeed: const Color(0xFF0B6E4F), useMaterial3: true),
      home: FutureBuilder<void>(
        future: _restore,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Scaffold(body: Center(child: CircularProgressIndicator()));
          }
          return session == null ? const LoginScreen() : const HomeScreen();
        },
      ),
    );
  }
}
