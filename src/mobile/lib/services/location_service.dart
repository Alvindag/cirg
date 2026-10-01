import 'package:geolocator/geolocator.dart';

class Fix {
  const Fix(this.latitude, this.longitude, this.accuracyM);
  final double latitude;
  final double longitude;
  final double? accuracyM;
}

abstract class LocationProvider {
  /// Current position, or null when unavailable (permission denied, GPS off, timeout).
  /// Callers must still work offline/without GPS; the server flags visits it cannot verify.
  Future<Fix?> current();
}

class DeviceLocationProvider implements LocationProvider {
  @override
  Future<Fix?> current() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return null;
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) return null;
      final p = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 12)),
      );
      return Fix(p.latitude, p.longitude, p.accuracy);
    } catch (_) {
      return null;
    }
  }
}
