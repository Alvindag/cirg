import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'providers.dart';
import 'ui/theme.dart';
import 'ui/home_screen.dart';
import 'ui/lock_screen.dart';
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
      theme: dasTheme(Brightness.light),
      darkTheme: dasTheme(Brightness.dark),
      home: FutureBuilder<void>(
        future: _restore,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Scaffold(body: Center(child: CircularProgressIndicator()));
          }
          return session == null ? const LoginScreen() : const LockGate(child: HomeScreen());
        },
      ),
    );
  }
}
