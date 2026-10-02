import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';

/// Where the lock keeps its small secrets (the OS keychain / Keystore on a device; memory in tests).
abstract class SecretStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

class SecureSecretStore implements SecretStore {
  SecureSecretStore([FlutterSecureStorage? s]) : _s = s ?? const FlutterSecureStorage();
  final FlutterSecureStorage _s;
  @override
  Future<String?> read(String key) => _s.read(key: key);
  @override
  Future<void> write(String key, String value) => _s.write(key: key, value: value);
  @override
  Future<void> delete(String key) => _s.delete(key: key);
}

abstract class Biometrics {
  /// A fingerprint / face is enrolled and can be used.
  Future<bool> available();
  Future<bool> authenticate(String reason);
}

class DeviceBiometrics implements Biometrics {
  DeviceBiometrics([LocalAuthentication? auth]) : _auth = auth ?? LocalAuthentication();
  final LocalAuthentication _auth;

  @override
  Future<bool> available() async {
    try {
      return await _auth.isDeviceSupported() && (await _auth.getAvailableBiometrics()).isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<bool> authenticate(String reason) async {
    try {
      return await _auth.authenticate(localizedReason: reason, biometricOnly: true);
    } catch (_) {
      return false; // cancelled, locked out by the OS, or not available: the PIN is always there
    }
  }
}

enum UnlockOutcome { unlocked, wrongPin, tooManyAttempts }

class UnlockResult {
  const UnlockResult(this.outcome, {this.attemptsLeft = 0});
  final UnlockOutcome outcome;
  final int attemptsLeft;
  bool get ok => outcome == UnlockOutcome.unlocked;
}

/// How long the app may be in the background before it asks for the PIN again.
enum LockTimeout {
  immediately(Duration.zero, 'Immediately'),
  oneMinute(Duration(minutes: 1), 'After 1 minute'),
  fiveMinutes(Duration(minutes: 5), 'After 5 minutes');

  const LockTimeout(this.duration, this.label);
  final Duration duration;
  final String label;
}

class WeakPinException implements Exception {
  WeakPinException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// A PIN (and optionally fingerprint / face) that guards the app on a phone that may be lost or borrowed.
/// The PIN is never stored: only a salted, iterated hash is kept in the keychain. Five wrong PINs in a row end the session,
/// so the person must sign in with Microsoft again (the PIN is cleared, and the data stays on the device until then).
/// This protects against someone picking up an unlocked-then-locked phone; it does not encrypt the local database.
class AppLock {
  AppLock(this._store, this._bio, {Random? random}) : _random = random ?? Random.secure();

  final SecretStore _store;
  final Biometrics _bio;
  final Random _random;

  static const maxAttempts = 5;
  static const _kHash = 'lock.hash', _kSalt = 'lock.salt', _kFails = 'lock.fails', _kBio = 'lock.bio', _kTimeout = 'lock.timeout';
  static const _iterations = 12000;

  Future<bool> get isEnabled async => await _store.read(_kHash) != null;
  Future<bool> get biometricsOn async => await _store.read(_kBio) == '1';
  Future<bool> get biometricsAvailable => _bio.available();

  Future<LockTimeout> get timeout async {
    final v = await _store.read(_kTimeout);
    return LockTimeout.values.firstWhere((t) => t.name == v, orElse: () => LockTimeout.oneMinute);
  }

  Future<void> setTimeout(LockTimeout t) => _store.write(_kTimeout, t.name);

  /// 4 to 8 digits, and nothing trivially guessable.
  static void checkStrength(String pin) {
    if (!RegExp(r'^\d{4,8}$').hasMatch(pin)) throw WeakPinException('Use 4 to 8 digits.');
    if (RegExp(r'^(\d)\1+$').hasMatch(pin)) throw WeakPinException('Do not use the same digit repeated.');
    const seq = '01234567890', rev = '09876543210';
    if (seq.contains(pin) || rev.contains(pin)) throw WeakPinException('Do not use a run of digits such as 1234.');
  }

  String _hash(String pin, List<int> salt) {
    // iterated HMAC-SHA256 (PBKDF2-style): slows down guessing if the keychain entry were ever read
    final hmac = Hmac(sha256, utf8.encode(pin));
    var block = hmac.convert([...salt, 0, 0, 0, 1]).bytes;
    final out = List<int>.from(block);
    for (var i = 1; i < _iterations; i++) {
      block = hmac.convert(block).bytes;
      for (var j = 0; j < out.length; j++) {
        out[j] ^= block[j];
      }
    }
    return base64.encode(out);
  }

  static bool _same(String a, String b) {
    var diff = a.length ^ b.length;
    for (var i = 0; i < min(a.length, b.length); i++) {
      diff |= a.codeUnitAt(i) ^ b.codeUnitAt(i);
    }
    return diff == 0;
  }

  Future<void> enable(String pin, {bool biometrics = false}) async {
    checkStrength(pin);
    final salt = List<int>.generate(16, (_) => _random.nextInt(256));
    await _store.write(_kSalt, base64.encode(salt));
    await _store.write(_kHash, _hash(pin, salt));
    await _store.write(_kFails, '0');
    await _store.write(_kBio, biometrics && await _bio.available() ? '1' : '0');
  }

  /// Turning the lock off needs the current PIN, so a borrowed unlocked phone cannot just switch it off.
  Future<bool> disable(String pin) async {
    if (!(await _verify(pin))) return false;
    await clear();
    return true;
  }

  Future<void> clear() async {
    for (final k in [_kHash, _kSalt, _kFails, _kBio, _kTimeout]) {
      await _store.delete(k);
    }
  }

  Future<void> setBiometrics(bool on) async => _store.write(_kBio, on && await _bio.available() ? '1' : '0');

  Future<bool> _verify(String pin) async {
    final hash = await _store.read(_kHash);
    final salt = await _store.read(_kSalt);
    if (hash == null || salt == null) return false;
    return _same(hash, _hash(pin, base64.decode(salt)));
  }

  Future<UnlockResult> unlockWithPin(String pin) async {
    var fails = int.tryParse(await _store.read(_kFails) ?? '') ?? 0;
    if (fails >= maxAttempts) return const UnlockResult(UnlockOutcome.tooManyAttempts);
    if (await _verify(pin)) {
      await _store.write(_kFails, '0');
      return const UnlockResult(UnlockOutcome.unlocked);
    }
    fails++;
    await _store.write(_kFails, '$fails'); // counted before anything else, so closing the app does not reset it
    return fails >= maxAttempts
        ? const UnlockResult(UnlockOutcome.tooManyAttempts)
        : UnlockResult(UnlockOutcome.wrongPin, attemptsLeft: maxAttempts - fails);
  }

  /// Only when the person turned it on and the phone still has an enrolled fingerprint / face. Never resets the wrong-PIN count.
  Future<bool> unlockWithBiometrics() async {
    if (!await biometricsOn || !await _bio.available()) return false;
    return _bio.authenticate('Unlock DAS Engage 360');
  }
}
