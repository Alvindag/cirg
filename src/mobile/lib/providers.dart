import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

import 'data/connection.dart';
import 'data/database.dart';
import 'services/api_client.dart';
import 'services/auth_provider.dart';
import 'services/location_service.dart';
import 'services/session_manager.dart';
import 'services/session_store.dart';
import 'services/sync_service.dart';
import 'services/visit_service.dart';

final databaseProvider = Provider<AppDatabase>((ref) {
  final db = AppDatabase(openDeviceDatabase());
  ref.onDispose(db.close);
  return db;
});

final locationProvider = Provider<LocationProvider>((ref) => DeviceLocationProvider());
final authProvider = Provider<AuthProvider>((ref) => AppAuthProvider());

final sessionManagerProvider = Provider<SessionManager>((ref) {
  final manager = SessionManager(auth: ref.watch(authProvider), store: SessionStore(), db: ref.watch(databaseProvider));
  manager.onChange = (s) => ref.read(sessionProvider.notifier).state = s;
  return manager;
});

/// Current sign-in; null when signed out.
class SessionNotifier extends Notifier<Session?> {
  @override
  Session? build() => null;

  // Riverpod keeps `state` protected; the session manager reports changes through this setter.
  @override
  set state(Session? value) => super.state = value;
}

final sessionProvider = NotifierProvider<SessionNotifier, Session?>(SessionNotifier.new);

/// Why the user was sent back to the sign-in screen ("account not set up", "session expired"...).
class SignInMessage extends Notifier<String?> {
  @override
  String? build() => null;
  void set(String? m) => state = m;
}

final signInMessageProvider = NotifierProvider<SignInMessage, String?>(SignInMessage.new);

final apiClientProvider = Provider((ref) {
  final client = http.Client();
  ref.onDispose(client.close);
  final manager = ref.watch(sessionManagerProvider);
  return ApiClient(client, baseUrl: () => manager.current?.baseUrl ?? '', accessToken: manager.accessToken);
});

final syncServiceProvider = Provider((ref) => SyncService(ref.watch(databaseProvider), ref.watch(apiClientProvider)));
final visitServiceProvider = Provider((ref) => VisitService(ref.watch(databaseProvider), ref.watch(locationProvider)));

class SyncStatus {
  const SyncStatus({this.syncing = false, this.lastSync, this.lastError});
  final bool syncing;
  final DateTime? lastSync;
  final String? lastError;
}

/// Runs sync on start, when connectivity returns, every few minutes, and on demand.
class SyncCoordinator extends Notifier<SyncStatus> {
  Timer? _timer;
  StreamSubscription<List<ConnectivityResult>>? _conn;

  @override
  SyncStatus build() {
    ref.onDispose(() {
      _timer?.cancel();
      _conn?.cancel();
    });
    return const SyncStatus();
  }

  void start() {
    _timer ??= Timer.periodic(const Duration(minutes: 5), (_) => syncNow());
    _conn ??= Connectivity().onConnectivityChanged.listen((r) {
      if (r.any((c) => c != ConnectivityResult.none)) syncNow();
    });
    syncNow();
  }

  Future<void> syncNow() async {
    if (state.syncing || ref.read(sessionProvider) == null) return;
    state = SyncStatus(syncing: true, lastSync: state.lastSync, lastError: state.lastError);
    final res = await ref.read(syncServiceProvider).sync();
    if (res.authFailed) {
      // The API client already tried a token refresh, so this is a real refusal.
      ref.read(signInMessageProvider.notifier).set(res.forbidden
          ? 'Your account is not set up for DAS Engage 360. Ask your administrator to add you.'
          : 'Your session has expired. Please sign in again.');
      await ref.read(sessionManagerProvider).signOut();
    }
    state = SyncStatus(lastSync: res.ok ? DateTime.now() : state.lastSync, lastError: res.error);
  }
}

final syncCoordinatorProvider = NotifierProvider<SyncCoordinator, SyncStatus>(SyncCoordinator.new);

final pendingCountProvider = StreamProvider<int>((ref) => ref.watch(databaseProvider).watchPendingCount());
