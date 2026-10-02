import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

import 'data/connection.dart';
import 'data/database.dart';
import 'services/ai_service.dart';
import 'services/api_client.dart';
import 'services/app_lock.dart';
import 'services/attachment_service.dart';
import 'services/customer_service.dart';
import 'services/plan_service.dart';
import 'services/auth_provider.dart';
import 'services/location_service.dart';
import 'services/sample_service.dart';
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
final aiServiceProvider = Provider((ref) => AiService(ref.watch(apiClientProvider), ref.watch(databaseProvider)));

/// Whether generative AI can be used now (provider configured, organisation opted in, daily limit not reached). Offline counts as unavailable.
final aiStatusProvider = FutureProvider.autoDispose<AiStatus>((ref) async {
  try {
    return await ref.watch(aiServiceProvider).status();
  } catch (_) {
    return const AiStatus(available: false, reason: 'Not available offline.');
  }
});

final sampleServiceProvider = Provider((ref) => SampleService(ref.watch(databaseProvider)));
final attachmentServiceProvider = Provider((ref) => AttachmentService(ref.watch(databaseProvider)));
final customerServiceProvider = Provider((ref) => CustomerService(ref.watch(databaseProvider), ref.watch(locationProvider)));
final planServiceProvider = Provider((ref) => PlanService(ref.watch(databaseProvider)));
final visitServiceProvider = Provider((ref) => VisitService(ref.watch(databaseProvider), ref.watch(locationProvider)));

class SyncStatus {
  const SyncStatus({this.syncing = false, this.lastSync, this.lastError, this.lastReason});
  final bool syncing;
  final DateTime? lastSync;
  final String? lastError;

  /// Why the last sync failed, in plain words.
  final String? lastReason;
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
    state = SyncStatus(syncing: true, lastSync: state.lastSync, lastError: state.lastError, lastReason: state.lastReason);
    final res = await ref.read(syncServiceProvider).sync();
    if (res.wiped) {
      // The administrator cleared this phone (lost or stolen). Nothing is left on it, so go back to sign-in and say why.
      ref.read(signInMessageProvider.notifier).set('Your administrator cleared the data on this device. Sign in again to download your work.');
      await ref.read(sessionManagerProvider).signOut();
      state = const SyncStatus();
      return;
    }
    if (res.authFailed) {
      // The API client already tried a token refresh, so this is a real refusal.
      ref.read(signInMessageProvider.notifier).set(res.forbidden
          ? 'Your account is not set up for DAS Engage 360. Ask your administrator to add you.'
          : 'Your session has expired. Please sign in again.');
      await ref.read(sessionManagerProvider).signOut();
    }
    if (res.ok) {
      await ref.read(attachmentServiceProvider).purgeUploaded();
      await ref.read(aiServiceProvider).refreshActions(); // rule-based suggestions, cached for offline use
    }
    state = SyncStatus(lastSync: res.ok ? DateTime.now() : state.lastSync, lastError: res.error, lastReason: res.reason);
  }
}

final syncCoordinatorProvider = NotifierProvider<SyncCoordinator, SyncStatus>(SyncCoordinator.new);

final pendingCountProvider = StreamProvider<int>((ref) => ref.watch(databaseProvider).watchPendingCount());

final problemsProvider = StreamProvider<List<SyncProblem>>((ref) => ref.watch(databaseProvider).watchProblems());
final notificationsProvider = StreamProvider<List<AppNotification>>((ref) => ref.watch(databaseProvider).watchNotifications());
final unreadCountProvider = StreamProvider<int>((ref) => ref.watch(databaseProvider).watchUnreadCount());

// ---- app lock ----

final secretStoreProvider = Provider<SecretStore>((ref) => SecureSecretStore());
final biometricsProvider = Provider<Biometrics>((ref) => DeviceBiometrics());
final appLockProvider = Provider((ref) => AppLock(ref.watch(secretStoreProvider), ref.watch(biometricsProvider)));

class AppLockState {
  const AppLockState({this.loaded = false, this.enabled = false, this.locked = false});
  final bool loaded;
  final bool enabled;
  final bool locked;
  AppLockState copyWith({bool? loaded, bool? enabled, bool? locked}) =>
      AppLockState(loaded: loaded ?? this.loaded, enabled: enabled ?? this.enabled, locked: locked ?? this.locked);
}

/// Whether the app is showing the PIN screen. Starts locked when a PIN is set; locks again after the app was in the background
/// for longer than the chosen time; signing out removes the PIN.
class LockController extends Notifier<AppLockState> {
  DateTime? _pausedAt;

  AppLock get _lock => ref.read(appLockProvider);

  @override
  AppLockState build() {
    ref.listen(sessionProvider, (prev, next) {
      if (prev != null && next == null) {
        // Signing out also clears the keychain, so the PIN is gone with it.
        _lock.clear();
        state = const AppLockState(loaded: true);
      } else if (prev == null && next != null) {
        _load();
      }
    });
    _load();
    return const AppLockState();
  }

  Future<void> _load() async {
    final enabled = await _lock.isEnabled;
    state = AppLockState(loaded: true, enabled: enabled, locked: enabled);
  }

  void lockNow() {
    if (state.enabled) state = state.copyWith(locked: true);
  }

  void paused([DateTime? now]) => _pausedAt = now ?? DateTime.now();

  Future<void> resumed([DateTime? now]) async {
    final at = _pausedAt;
    _pausedAt = null;
    if (!state.enabled || state.locked || at == null) return;
    final away = (now ?? DateTime.now()).difference(at);
    if (away >= (await _lock.timeout).duration) state = state.copyWith(locked: true);
  }

  Future<UnlockResult> unlock(String pin) async {
    final r = await _lock.unlockWithPin(pin);
    if (r.ok) {
      state = state.copyWith(locked: false);
    } else if (r.outcome == UnlockOutcome.tooManyAttempts) {
      ref.read(signInMessageProvider.notifier).set('Too many wrong PINs. Sign in again to continue.');
      await ref.read(sessionManagerProvider).signOut();
    }
    return r;
  }

  Future<bool> unlockWithBiometrics() async {
    final ok = await _lock.unlockWithBiometrics();
    if (ok) state = state.copyWith(locked: false);
    return ok;
  }

  Future<void> enable(String pin, {bool biometrics = false}) async {
    await _lock.enable(pin, biometrics: biometrics);
    state = state.copyWith(enabled: true, locked: false);
  }

  Future<bool> disable(String pin) async {
    final ok = await _lock.disable(pin);
    if (ok) state = state.copyWith(enabled: false, locked: false);
    return ok;
  }

  /// Forgot the PIN: the only way back is to sign in with Microsoft again, which clears the PIN.
  Future<void> forgotPin() async {
    ref.read(signInMessageProvider.notifier).set('Sign in again to set a new PIN.');
    await ref.read(sessionManagerProvider).signOut();
  }
}

final lockControllerProvider = NotifierProvider<LockController, AppLockState>(LockController.new);
