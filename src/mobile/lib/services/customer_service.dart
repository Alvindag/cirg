import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../data/database.dart';
import 'location_service.dart';

class ValidationException implements Exception {
  ValidationException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// What the person typed on the customer form.
class CustomerDraft {
  const CustomerDraft({
    required this.type,
    required this.name,
    this.specialty,
    this.phone,
    this.email,
    this.address,
    this.city,
    this.targetVisitsPerMonth = 2,
    this.useCurrentLocation = false,
  });

  final String type;
  final String name;
  final String? specialty, phone, email, address, city;
  final int targetVisitsPerMonth;

  /// Store where the rep is standing as the customer's position (used to check that later visits happen on site).
  final bool useCurrentLocation;
}

const customerTypes = ['Doctor', 'Pharmacist', 'Hospital', 'Clinic', 'Pharmacy', 'Distributor', 'GovernmentInstitution'];

/// Adding and editing customers works offline: the row is saved on the device, marked for upload, and the next sync sends it.
/// The server decides the territory (a rep's customers always belong to the rep's territory) and may refuse the change;
/// a refusal shows up under "Problem items".
class CustomerService {
  CustomerService(this._db, this._location, {Uuid? uuid}) : _uuid = uuid ?? const Uuid();

  final AppDatabase _db;
  final LocationProvider _location;
  final Uuid _uuid;

  static String? _blank(String? s) => (s == null || s.trim().isEmpty) ? null : s.trim();

  static void validate(CustomerDraft d) {
    if (d.name.trim().isEmpty) throw ValidationException('Enter the customer\'s name.');
    if (d.name.trim().length > 200) throw ValidationException('The name is too long (200 characters at most).');
    if (!customerTypes.contains(d.type)) throw ValidationException('Choose what kind of customer this is.');
    if (d.targetVisitsPerMonth < 0 || d.targetVisitsPerMonth > 31) throw ValidationException('Visits per month must be between 0 and 31.');
    final email = _blank(d.email);
    if (email != null && !RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(email)) throw ValidationException('That email address does not look right.');
  }

  Future<String> create(CustomerDraft d) async {
    validate(d);
    final fix = d.useCurrentLocation ? await _location.current() : null;
    final id = _uuid.v4();
    await _db.into(_db.customers).insert(CustomersCompanion.insert(
          id: id,
          type: d.type,
          name: d.name.trim(),
          specialty: Value(_blank(d.specialty)),
          phone: Value(_blank(d.phone)),
          email: Value(_blank(d.email)),
          address: Value(_blank(d.address)),
          city: Value(_blank(d.city)),
          latitude: Value(fix?.latitude),
          longitude: Value(fix?.longitude),
          targetVisitsPerMonth: Value(d.targetVisitsPerMonth),
          dirty: const Value(true),
        ));
    return id;
  }

  Future<void> update(String id, CustomerDraft d) async {
    validate(d);
    final existing = await _db.customer(id);
    if (existing == null) throw ValidationException('This customer is no longer on the device.');
    final fix = d.useCurrentLocation ? await _location.current() : null;
    await (_db.update(_db.customers)..where((c) => c.id.equals(id))).write(CustomersCompanion(
      type: Value(d.type),
      name: Value(d.name.trim()),
      specialty: Value(_blank(d.specialty)),
      phone: Value(_blank(d.phone)),
      email: Value(_blank(d.email)),
      address: Value(_blank(d.address)),
      city: Value(_blank(d.city)),
      // The position only changes when the person asks for it; the territory and segment are the server's to decide
      latitude: fix == null ? const Value.absent() : Value(fix.latitude),
      longitude: fix == null ? const Value.absent() : Value(fix.longitude),
      targetVisitsPerMonth: Value(d.targetVisitsPerMonth),
      dirty: const Value(true),
    ));
  }
}
