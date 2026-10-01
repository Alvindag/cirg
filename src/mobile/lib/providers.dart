import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

import 'data/connection.dart';
import 'data/database.dart';
import 'services/api_client.dart';
import 'services/location_service.dart';
import 'services/session_store.dart';
import 'services/sync_service.dart';
import 'services/visit_service.dart';

final databaseProvider = Provider<AppDatabase>((ref) {
  final db = AppDatabase(openDeviceDatabase());
  ref.onDispose(db.close);
  return db;
});

final sessionStoreProvider = Provider((ref) => SessionStore());
final locationProvider = Provider<LocationProvider>((ref) => DeviceLocationProvider());

/// Current login; null when signed out. Set at startup from secure storage.
class SessionNotifier extends Notifier<Session?> {
  @override
  Session? build() => null;

  Future<void> restore() async => state = await ref.read(sessionStoreProvider).load();

  Future<void> signIn(Session s) async {
    await ref.read(sessionStoreProvider).save(s);
    state = s;
  }

  Future<void> signOut() async {
    await ref.read(sessionStoreProvider).clear();
    state = null;
  }
}

final sessionProvider = NotifierProvider<SessionNotifier, Session?>(SessionNotifier.new);

final apiClientProvider = Provider((ref) {
  final client = http.Client();
  ref.onDispose(client.close);
  return ApiClient(client, () => ref.read(sessionProvider)!);
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
    if (res.authFailed) await ref.read(sessionProvider.notifier).signOut();
    state = SyncStatus(lastSync: res.ok ? DateTime.now() : state.lastSync, lastError: res.error);
  }
}

final syncCoordinatorProvider = NotifierProvider<SyncCoordinator, SyncStatus>(SyncCoordinator.new);

final pendingCountProvider = StreamProvider<int>((ref) => ref.watch(databaseProvider).watchPendingCount());
