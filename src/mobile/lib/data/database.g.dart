// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'database.dart';

// ignore_for_file: type=lint
class $CustomersTable extends Customers
    with TableInfo<$CustomersTable, Customer> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CustomersTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _typeMeta = const VerificationMeta('type');
  @override
  late final GeneratedColumn<String> type = GeneratedColumn<String>(
    'type',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
    'name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _specialtyMeta = const VerificationMeta(
    'specialty',
  );
  @override
  late final GeneratedColumn<String> specialty = GeneratedColumn<String>(
    'specialty',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _segmentMeta = const VerificationMeta(
    'segment',
  );
  @override
  late final GeneratedColumn<String> segment = GeneratedColumn<String>(
    'segment',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('Unclassified'),
  );
  static const VerificationMeta _territoryIdMeta = const VerificationMeta(
    'territoryId',
  );
  @override
  late final GeneratedColumn<String> territoryId = GeneratedColumn<String>(
    'territory_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _parentCustomerIdMeta = const VerificationMeta(
    'parentCustomerId',
  );
  @override
  late final GeneratedColumn<String> parentCustomerId = GeneratedColumn<String>(
    'parent_customer_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _phoneMeta = const VerificationMeta('phone');
  @override
  late final GeneratedColumn<String> phone = GeneratedColumn<String>(
    'phone',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _emailMeta = const VerificationMeta('email');
  @override
  late final GeneratedColumn<String> email = GeneratedColumn<String>(
    'email',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _addressMeta = const VerificationMeta(
    'address',
  );
  @override
  late final GeneratedColumn<String> address = GeneratedColumn<String>(
    'address',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _cityMeta = const VerificationMeta('city');
  @override
  late final GeneratedColumn<String> city = GeneratedColumn<String>(
    'city',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _latitudeMeta = const VerificationMeta(
    'latitude',
  );
  @override
  late final GeneratedColumn<double> latitude = GeneratedColumn<double>(
    'latitude',
    aliasedName,
    true,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _longitudeMeta = const VerificationMeta(
    'longitude',
  );
  @override
  late final GeneratedColumn<double> longitude = GeneratedColumn<double>(
    'longitude',
    aliasedName,
    true,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _targetVisitsPerMonthMeta =
      const VerificationMeta('targetVisitsPerMonth');
  @override
  late final GeneratedColumn<int> targetVisitsPerMonth = GeneratedColumn<int>(
    'target_visits_per_month',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _dirtyMeta = const VerificationMeta('dirty');
  @override
  late final GeneratedColumn<bool> dirty = GeneratedColumn<bool>(
    'dirty',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("dirty" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    type,
    name,
    specialty,
    segment,
    territoryId,
    parentCustomerId,
    phone,
    email,
    address,
    city,
    latitude,
    longitude,
    targetVisitsPerMonth,
    dirty,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'customers';
  @override
  VerificationContext validateIntegrity(
    Insertable<Customer> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('type')) {
      context.handle(
        _typeMeta,
        type.isAcceptableOrUnknown(data['type']!, _typeMeta),
      );
    } else if (isInserting) {
      context.missing(_typeMeta);
    }
    if (data.containsKey('name')) {
      context.handle(
        _nameMeta,
        name.isAcceptableOrUnknown(data['name']!, _nameMeta),
      );
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('specialty')) {
      context.handle(
        _specialtyMeta,
        specialty.isAcceptableOrUnknown(data['specialty']!, _specialtyMeta),
      );
    }
    if (data.containsKey('segment')) {
      context.handle(
        _segmentMeta,
        segment.isAcceptableOrUnknown(data['segment']!, _segmentMeta),
      );
    }
    if (data.containsKey('territory_id')) {
      context.handle(
        _territoryIdMeta,
        territoryId.isAcceptableOrUnknown(
          data['territory_id']!,
          _territoryIdMeta,
        ),
      );
    }
    if (data.containsKey('parent_customer_id')) {
      context.handle(
        _parentCustomerIdMeta,
        parentCustomerId.isAcceptableOrUnknown(
          data['parent_customer_id']!,
          _parentCustomerIdMeta,
        ),
      );
    }
    if (data.containsKey('phone')) {
      context.handle(
        _phoneMeta,
        phone.isAcceptableOrUnknown(data['phone']!, _phoneMeta),
      );
    }
    if (data.containsKey('email')) {
      context.handle(
        _emailMeta,
        email.isAcceptableOrUnknown(data['email']!, _emailMeta),
      );
    }
    if (data.containsKey('address')) {
      context.handle(
        _addressMeta,
        address.isAcceptableOrUnknown(data['address']!, _addressMeta),
      );
    }
    if (data.containsKey('city')) {
      context.handle(
        _cityMeta,
        city.isAcceptableOrUnknown(data['city']!, _cityMeta),
      );
    }
    if (data.containsKey('latitude')) {
      context.handle(
        _latitudeMeta,
        latitude.isAcceptableOrUnknown(data['latitude']!, _latitudeMeta),
      );
    }
    if (data.containsKey('longitude')) {
      context.handle(
        _longitudeMeta,
        longitude.isAcceptableOrUnknown(data['longitude']!, _longitudeMeta),
      );
    }
    if (data.containsKey('target_visits_per_month')) {
      context.handle(
        _targetVisitsPerMonthMeta,
        targetVisitsPerMonth.isAcceptableOrUnknown(
          data['target_visits_per_month']!,
          _targetVisitsPerMonthMeta,
        ),
      );
    }
    if (data.containsKey('dirty')) {
      context.handle(
        _dirtyMeta,
        dirty.isAcceptableOrUnknown(data['dirty']!, _dirtyMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  Customer map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return Customer(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      type: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}type'],
      )!,
      name: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name'],
      )!,
      specialty: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}specialty'],
      ),
      segment: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}segment'],
      )!,
      territoryId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}territory_id'],
      ),
      parentCustomerId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}parent_customer_id'],
      ),
      phone: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}phone'],
      ),
      email: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}email'],
      ),
      address: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}address'],
      ),
      city: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}city'],
      ),
      latitude: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}latitude'],
      ),
      longitude: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}longitude'],
      ),
      targetVisitsPerMonth: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}target_visits_per_month'],
      )!,
      dirty: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}dirty'],
      )!,
    );
  }

  @override
  $CustomersTable createAlias(String alias) {
    return $CustomersTable(attachedDatabase, alias);
  }
}

class Customer extends DataClass implements Insertable<Customer> {
  final String id;
  final String type;
  final String name;
  final String? specialty;
  final String segment;
  final String? territoryId;
  final String? parentCustomerId;
  final String? phone;
  final String? email;
  final String? address;
  final String? city;
  final double? latitude;
  final double? longitude;
  final int targetVisitsPerMonth;

  /// Created or edited on this device and not yet uploaded.
  final bool dirty;
  const Customer({
    required this.id,
    required this.type,
    required this.name,
    this.specialty,
    required this.segment,
    this.territoryId,
    this.parentCustomerId,
    this.phone,
    this.email,
    this.address,
    this.city,
    this.latitude,
    this.longitude,
    required this.targetVisitsPerMonth,
    required this.dirty,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['type'] = Variable<String>(type);
    map['name'] = Variable<String>(name);
    if (!nullToAbsent || specialty != null) {
      map['specialty'] = Variable<String>(specialty);
    }
    map['segment'] = Variable<String>(segment);
    if (!nullToAbsent || territoryId != null) {
      map['territory_id'] = Variable<String>(territoryId);
    }
    if (!nullToAbsent || parentCustomerId != null) {
      map['parent_customer_id'] = Variable<String>(parentCustomerId);
    }
    if (!nullToAbsent || phone != null) {
      map['phone'] = Variable<String>(phone);
    }
    if (!nullToAbsent || email != null) {
      map['email'] = Variable<String>(email);
    }
    if (!nullToAbsent || address != null) {
      map['address'] = Variable<String>(address);
    }
    if (!nullToAbsent || city != null) {
      map['city'] = Variable<String>(city);
    }
    if (!nullToAbsent || latitude != null) {
      map['latitude'] = Variable<double>(latitude);
    }
    if (!nullToAbsent || longitude != null) {
      map['longitude'] = Variable<double>(longitude);
    }
    map['target_visits_per_month'] = Variable<int>(targetVisitsPerMonth);
    map['dirty'] = Variable<bool>(dirty);
    return map;
  }

  CustomersCompanion toCompanion(bool nullToAbsent) {
    return CustomersCompanion(
      id: Value(id),
      type: Value(type),
      name: Value(name),
      specialty: specialty == null && nullToAbsent
          ? const Value.absent()
          : Value(specialty),
      segment: Value(segment),
      territoryId: territoryId == null && nullToAbsent
          ? const Value.absent()
          : Value(territoryId),
      parentCustomerId: parentCustomerId == null && nullToAbsent
          ? const Value.absent()
          : Value(parentCustomerId),
      phone: phone == null && nullToAbsent
          ? const Value.absent()
          : Value(phone),
      email: email == null && nullToAbsent
          ? const Value.absent()
          : Value(email),
      address: address == null && nullToAbsent
          ? const Value.absent()
          : Value(address),
      city: city == null && nullToAbsent ? const Value.absent() : Value(city),
      latitude: latitude == null && nullToAbsent
          ? const Value.absent()
          : Value(latitude),
      longitude: longitude == null && nullToAbsent
          ? const Value.absent()
          : Value(longitude),
      targetVisitsPerMonth: Value(targetVisitsPerMonth),
      dirty: Value(dirty),
    );
  }

  factory Customer.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return Customer(
      id: serializer.fromJson<String>(json['id']),
      type: serializer.fromJson<String>(json['type']),
      name: serializer.fromJson<String>(json['name']),
      specialty: serializer.fromJson<String?>(json['specialty']),
      segment: serializer.fromJson<String>(json['segment']),
      territoryId: serializer.fromJson<String?>(json['territoryId']),
      parentCustomerId: serializer.fromJson<String?>(json['parentCustomerId']),
      phone: serializer.fromJson<String?>(json['phone']),
      email: serializer.fromJson<String?>(json['email']),
      address: serializer.fromJson<String?>(json['address']),
      city: serializer.fromJson<String?>(json['city']),
      latitude: serializer.fromJson<double?>(json['latitude']),
      longitude: serializer.fromJson<double?>(json['longitude']),
      targetVisitsPerMonth: serializer.fromJson<int>(
        json['targetVisitsPerMonth'],
      ),
      dirty: serializer.fromJson<bool>(json['dirty']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'type': serializer.toJson<String>(type),
      'name': serializer.toJson<String>(name),
      'specialty': serializer.toJson<String?>(specialty),
      'segment': serializer.toJson<String>(segment),
      'territoryId': serializer.toJson<String?>(territoryId),
      'parentCustomerId': serializer.toJson<String?>(parentCustomerId),
      'phone': serializer.toJson<String?>(phone),
      'email': serializer.toJson<String?>(email),
      'address': serializer.toJson<String?>(address),
      'city': serializer.toJson<String?>(city),
      'latitude': serializer.toJson<double?>(latitude),
      'longitude': serializer.toJson<double?>(longitude),
      'targetVisitsPerMonth': serializer.toJson<int>(targetVisitsPerMonth),
      'dirty': serializer.toJson<bool>(dirty),
    };
  }

  Customer copyWith({
    String? id,
    String? type,
    String? name,
    Value<String?> specialty = const Value.absent(),
    String? segment,
    Value<String?> territoryId = const Value.absent(),
    Value<String?> parentCustomerId = const Value.absent(),
    Value<String?> phone = const Value.absent(),
    Value<String?> email = const Value.absent(),
    Value<String?> address = const Value.absent(),
    Value<String?> city = const Value.absent(),
    Value<double?> latitude = const Value.absent(),
    Value<double?> longitude = const Value.absent(),
    int? targetVisitsPerMonth,
    bool? dirty,
  }) => Customer(
    id: id ?? this.id,
    type: type ?? this.type,
    name: name ?? this.name,
    specialty: specialty.present ? specialty.value : this.specialty,
    segment: segment ?? this.segment,
    territoryId: territoryId.present ? territoryId.value : this.territoryId,
    parentCustomerId: parentCustomerId.present
        ? parentCustomerId.value
        : this.parentCustomerId,
    phone: phone.present ? phone.value : this.phone,
    email: email.present ? email.value : this.email,
    address: address.present ? address.value : this.address,
    city: city.present ? city.value : this.city,
    latitude: latitude.present ? latitude.value : this.latitude,
    longitude: longitude.present ? longitude.value : this.longitude,
    targetVisitsPerMonth: targetVisitsPerMonth ?? this.targetVisitsPerMonth,
    dirty: dirty ?? this.dirty,
  );
  Customer copyWithCompanion(CustomersCompanion data) {
    return Customer(
      id: data.id.present ? data.id.value : this.id,
      type: data.type.present ? data.type.value : this.type,
      name: data.name.present ? data.name.value : this.name,
      specialty: data.specialty.present ? data.specialty.value : this.specialty,
      segment: data.segment.present ? data.segment.value : this.segment,
      territoryId: data.territoryId.present
          ? data.territoryId.value
          : this.territoryId,
      parentCustomerId: data.parentCustomerId.present
          ? data.parentCustomerId.value
          : this.parentCustomerId,
      phone: data.phone.present ? data.phone.value : this.phone,
      email: data.email.present ? data.email.value : this.email,
      address: data.address.present ? data.address.value : this.address,
      city: data.city.present ? data.city.value : this.city,
      latitude: data.latitude.present ? data.latitude.value : this.latitude,
      longitude: data.longitude.present ? data.longitude.value : this.longitude,
      targetVisitsPerMonth: data.targetVisitsPerMonth.present
          ? data.targetVisitsPerMonth.value
          : this.targetVisitsPerMonth,
      dirty: data.dirty.present ? data.dirty.value : this.dirty,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Customer(')
          ..write('id: $id, ')
          ..write('type: $type, ')
          ..write('name: $name, ')
          ..write('specialty: $specialty, ')
          ..write('segment: $segment, ')
          ..write('territoryId: $territoryId, ')
          ..write('parentCustomerId: $parentCustomerId, ')
          ..write('phone: $phone, ')
          ..write('email: $email, ')
          ..write('address: $address, ')
          ..write('city: $city, ')
          ..write('latitude: $latitude, ')
          ..write('longitude: $longitude, ')
          ..write('targetVisitsPerMonth: $targetVisitsPerMonth, ')
          ..write('dirty: $dirty')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    type,
    name,
    specialty,
    segment,
    territoryId,
    parentCustomerId,
    phone,
    email,
    address,
    city,
    latitude,
    longitude,
    targetVisitsPerMonth,
    dirty,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Customer &&
          other.id == this.id &&
          other.type == this.type &&
          other.name == this.name &&
          other.specialty == this.specialty &&
          other.segment == this.segment &&
          other.territoryId == this.territoryId &&
          other.parentCustomerId == this.parentCustomerId &&
          other.phone == this.phone &&
          other.email == this.email &&
          other.address == this.address &&
          other.city == this.city &&
          other.latitude == this.latitude &&
          other.longitude == this.longitude &&
          other.targetVisitsPerMonth == this.targetVisitsPerMonth &&
          other.dirty == this.dirty);
}

class CustomersCompanion extends UpdateCompanion<Customer> {
  final Value<String> id;
  final Value<String> type;
  final Value<String> name;
  final Value<String?> specialty;
  final Value<String> segment;
  final Value<String?> territoryId;
  final Value<String?> parentCustomerId;
  final Value<String?> phone;
  final Value<String?> email;
  final Value<String?> address;
  final Value<String?> city;
  final Value<double?> latitude;
  final Value<double?> longitude;
  final Value<int> targetVisitsPerMonth;
  final Value<bool> dirty;
  final Value<int> rowid;
  const CustomersCompanion({
    this.id = const Value.absent(),
    this.type = const Value.absent(),
    this.name = const Value.absent(),
    this.specialty = const Value.absent(),
    this.segment = const Value.absent(),
    this.territoryId = const Value.absent(),
    this.parentCustomerId = const Value.absent(),
    this.phone = const Value.absent(),
    this.email = const Value.absent(),
    this.address = const Value.absent(),
    this.city = const Value.absent(),
    this.latitude = const Value.absent(),
    this.longitude = const Value.absent(),
    this.targetVisitsPerMonth = const Value.absent(),
    this.dirty = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CustomersCompanion.insert({
    required String id,
    required String type,
    required String name,
    this.specialty = const Value.absent(),
    this.segment = const Value.absent(),
    this.territoryId = const Value.absent(),
    this.parentCustomerId = const Value.absent(),
    this.phone = const Value.absent(),
    this.email = const Value.absent(),
    this.address = const Value.absent(),
    this.city = const Value.absent(),
    this.latitude = const Value.absent(),
    this.longitude = const Value.absent(),
    this.targetVisitsPerMonth = const Value.absent(),
    this.dirty = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       type = Value(type),
       name = Value(name);
  static Insertable<Customer> custom({
    Expression<String>? id,
    Expression<String>? type,
    Expression<String>? name,
    Expression<String>? specialty,
    Expression<String>? segment,
    Expression<String>? territoryId,
    Expression<String>? parentCustomerId,
    Expression<String>? phone,
    Expression<String>? email,
    Expression<String>? address,
    Expression<String>? city,
    Expression<double>? latitude,
    Expression<double>? longitude,
    Expression<int>? targetVisitsPerMonth,
    Expression<bool>? dirty,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (type != null) 'type': type,
      if (name != null) 'name': name,
      if (specialty != null) 'specialty': specialty,
      if (segment != null) 'segment': segment,
      if (territoryId != null) 'territory_id': territoryId,
      if (parentCustomerId != null) 'parent_customer_id': parentCustomerId,
      if (phone != null) 'phone': phone,
      if (email != null) 'email': email,
      if (address != null) 'address': address,
      if (city != null) 'city': city,
      if (latitude != null) 'latitude': latitude,
      if (longitude != null) 'longitude': longitude,
      if (targetVisitsPerMonth != null)
        'target_visits_per_month': targetVisitsPerMonth,
      if (dirty != null) 'dirty': dirty,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CustomersCompanion copyWith({
    Value<String>? id,
    Value<String>? type,
    Value<String>? name,
    Value<String?>? specialty,
    Value<String>? segment,
    Value<String?>? territoryId,
    Value<String?>? parentCustomerId,
    Value<String?>? phone,
    Value<String?>? email,
    Value<String?>? address,
    Value<String?>? city,
    Value<double?>? latitude,
    Value<double?>? longitude,
    Value<int>? targetVisitsPerMonth,
    Value<bool>? dirty,
    Value<int>? rowid,
  }) {
    return CustomersCompanion(
      id: id ?? this.id,
      type: type ?? this.type,
      name: name ?? this.name,
      specialty: specialty ?? this.specialty,
      segment: segment ?? this.segment,
      territoryId: territoryId ?? this.territoryId,
      parentCustomerId: parentCustomerId ?? this.parentCustomerId,
      phone: phone ?? this.phone,
      email: email ?? this.email,
      address: address ?? this.address,
      city: city ?? this.city,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      targetVisitsPerMonth: targetVisitsPerMonth ?? this.targetVisitsPerMonth,
      dirty: dirty ?? this.dirty,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (type.present) {
      map['type'] = Variable<String>(type.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (specialty.present) {
      map['specialty'] = Variable<String>(specialty.value);
    }
    if (segment.present) {
      map['segment'] = Variable<String>(segment.value);
    }
    if (territoryId.present) {
      map['territory_id'] = Variable<String>(territoryId.value);
    }
    if (parentCustomerId.present) {
      map['parent_customer_id'] = Variable<String>(parentCustomerId.value);
    }
    if (phone.present) {
      map['phone'] = Variable<String>(phone.value);
    }
    if (email.present) {
      map['email'] = Variable<String>(email.value);
    }
    if (address.present) {
      map['address'] = Variable<String>(address.value);
    }
    if (city.present) {
      map['city'] = Variable<String>(city.value);
    }
    if (latitude.present) {
      map['latitude'] = Variable<double>(latitude.value);
    }
    if (longitude.present) {
      map['longitude'] = Variable<double>(longitude.value);
    }
    if (targetVisitsPerMonth.present) {
      map['target_visits_per_month'] = Variable<int>(
        targetVisitsPerMonth.value,
      );
    }
    if (dirty.present) {
      map['dirty'] = Variable<bool>(dirty.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CustomersCompanion(')
          ..write('id: $id, ')
          ..write('type: $type, ')
          ..write('name: $name, ')
          ..write('specialty: $specialty, ')
          ..write('segment: $segment, ')
          ..write('territoryId: $territoryId, ')
          ..write('parentCustomerId: $parentCustomerId, ')
          ..write('phone: $phone, ')
          ..write('email: $email, ')
          ..write('address: $address, ')
          ..write('city: $city, ')
          ..write('latitude: $latitude, ')
          ..write('longitude: $longitude, ')
          ..write('targetVisitsPerMonth: $targetVisitsPerMonth, ')
          ..write('dirty: $dirty, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $ProductsTable extends Products with TableInfo<$ProductsTable, Product> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ProductsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
    'name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _codeMeta = const VerificationMeta('code');
  @override
  late final GeneratedColumn<String> code = GeneratedColumn<String>(
    'code',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _listPriceMeta = const VerificationMeta(
    'listPrice',
  );
  @override
  late final GeneratedColumn<double> listPrice = GeneratedColumn<double>(
    'list_price',
    aliasedName,
    true,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
  );
  @override
  List<GeneratedColumn> get $columns => [id, name, code, listPrice];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'products';
  @override
  VerificationContext validateIntegrity(
    Insertable<Product> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('name')) {
      context.handle(
        _nameMeta,
        name.isAcceptableOrUnknown(data['name']!, _nameMeta),
      );
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('code')) {
      context.handle(
        _codeMeta,
        code.isAcceptableOrUnknown(data['code']!, _codeMeta),
      );
    }
    if (data.containsKey('list_price')) {
      context.handle(
        _listPriceMeta,
        listPrice.isAcceptableOrUnknown(data['list_price']!, _listPriceMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  Product map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return Product(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      name: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name'],
      )!,
      code: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}code'],
      ),
      listPrice: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}list_price'],
      ),
    );
  }

  @override
  $ProductsTable createAlias(String alias) {
    return $ProductsTable(attachedDatabase, alias);
  }
}

class Product extends DataClass implements Insertable<Product> {
  final String id;
  final String name;
  final String? code;

  /// Selling price in GHS; null = not for sale yet. Used for the estimate only: the server prices the order.
  final double? listPrice;
  const Product({
    required this.id,
    required this.name,
    this.code,
    this.listPrice,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['name'] = Variable<String>(name);
    if (!nullToAbsent || code != null) {
      map['code'] = Variable<String>(code);
    }
    if (!nullToAbsent || listPrice != null) {
      map['list_price'] = Variable<double>(listPrice);
    }
    return map;
  }

  ProductsCompanion toCompanion(bool nullToAbsent) {
    return ProductsCompanion(
      id: Value(id),
      name: Value(name),
      code: code == null && nullToAbsent ? const Value.absent() : Value(code),
      listPrice: listPrice == null && nullToAbsent
          ? const Value.absent()
          : Value(listPrice),
    );
  }

  factory Product.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return Product(
      id: serializer.fromJson<String>(json['id']),
      name: serializer.fromJson<String>(json['name']),
      code: serializer.fromJson<String?>(json['code']),
      listPrice: serializer.fromJson<double?>(json['listPrice']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'name': serializer.toJson<String>(name),
      'code': serializer.toJson<String?>(code),
      'listPrice': serializer.toJson<double?>(listPrice),
    };
  }

  Product copyWith({
    String? id,
    String? name,
    Value<String?> code = const Value.absent(),
    Value<double?> listPrice = const Value.absent(),
  }) => Product(
    id: id ?? this.id,
    name: name ?? this.name,
    code: code.present ? code.value : this.code,
    listPrice: listPrice.present ? listPrice.value : this.listPrice,
  );
  Product copyWithCompanion(ProductsCompanion data) {
    return Product(
      id: data.id.present ? data.id.value : this.id,
      name: data.name.present ? data.name.value : this.name,
      code: data.code.present ? data.code.value : this.code,
      listPrice: data.listPrice.present ? data.listPrice.value : this.listPrice,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Product(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('code: $code, ')
          ..write('listPrice: $listPrice')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, name, code, listPrice);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Product &&
          other.id == this.id &&
          other.name == this.name &&
          other.code == this.code &&
          other.listPrice == this.listPrice);
}

class ProductsCompanion extends UpdateCompanion<Product> {
  final Value<String> id;
  final Value<String> name;
  final Value<String?> code;
  final Value<double?> listPrice;
  final Value<int> rowid;
  const ProductsCompanion({
    this.id = const Value.absent(),
    this.name = const Value.absent(),
    this.code = const Value.absent(),
    this.listPrice = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ProductsCompanion.insert({
    required String id,
    required String name,
    this.code = const Value.absent(),
    this.listPrice = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       name = Value(name);
  static Insertable<Product> custom({
    Expression<String>? id,
    Expression<String>? name,
    Expression<String>? code,
    Expression<double>? listPrice,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (name != null) 'name': name,
      if (code != null) 'code': code,
      if (listPrice != null) 'list_price': listPrice,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ProductsCompanion copyWith({
    Value<String>? id,
    Value<String>? name,
    Value<String?>? code,
    Value<double?>? listPrice,
    Value<int>? rowid,
  }) {
    return ProductsCompanion(
      id: id ?? this.id,
      name: name ?? this.name,
      code: code ?? this.code,
      listPrice: listPrice ?? this.listPrice,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (code.present) {
      map['code'] = Variable<String>(code.value);
    }
    if (listPrice.present) {
      map['list_price'] = Variable<double>(listPrice.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ProductsCompanion(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('code: $code, ')
          ..write('listPrice: $listPrice, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $PlannedVisitsTable extends PlannedVisits
    with TableInfo<$PlannedVisitsTable, PlannedVisit> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $PlannedVisitsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _customerIdMeta = const VerificationMeta(
    'customerId',
  );
  @override
  late final GeneratedColumn<String> customerId = GeneratedColumn<String>(
    'customer_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _plannedDateMeta = const VerificationMeta(
    'plannedDate',
  );
  @override
  late final GeneratedColumn<String> plannedDate = GeneratedColumn<String>(
    'planned_date',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _sequenceMeta = const VerificationMeta(
    'sequence',
  );
  @override
  late final GeneratedColumn<int> sequence = GeneratedColumn<int>(
    'sequence',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
    'status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('Planned'),
  );
  static const VerificationMeta _objectiveMeta = const VerificationMeta(
    'objective',
  );
  @override
  late final GeneratedColumn<String> objective = GeneratedColumn<String>(
    'objective',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _dirtyMeta = const VerificationMeta('dirty');
  @override
  late final GeneratedColumn<bool> dirty = GeneratedColumn<bool>(
    'dirty',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("dirty" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    customerId,
    plannedDate,
    sequence,
    status,
    objective,
    dirty,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'planned_visits';
  @override
  VerificationContext validateIntegrity(
    Insertable<PlannedVisit> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('customer_id')) {
      context.handle(
        _customerIdMeta,
        customerId.isAcceptableOrUnknown(data['customer_id']!, _customerIdMeta),
      );
    } else if (isInserting) {
      context.missing(_customerIdMeta);
    }
    if (data.containsKey('planned_date')) {
      context.handle(
        _plannedDateMeta,
        plannedDate.isAcceptableOrUnknown(
          data['planned_date']!,
          _plannedDateMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_plannedDateMeta);
    }
    if (data.containsKey('sequence')) {
      context.handle(
        _sequenceMeta,
        sequence.isAcceptableOrUnknown(data['sequence']!, _sequenceMeta),
      );
    }
    if (data.containsKey('status')) {
      context.handle(
        _statusMeta,
        status.isAcceptableOrUnknown(data['status']!, _statusMeta),
      );
    }
    if (data.containsKey('objective')) {
      context.handle(
        _objectiveMeta,
        objective.isAcceptableOrUnknown(data['objective']!, _objectiveMeta),
      );
    }
    if (data.containsKey('dirty')) {
      context.handle(
        _dirtyMeta,
        dirty.isAcceptableOrUnknown(data['dirty']!, _dirtyMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  PlannedVisit map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return PlannedVisit(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      customerId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}customer_id'],
      )!,
      plannedDate: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}planned_date'],
      )!,
      sequence: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}sequence'],
      )!,
      status: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}status'],
      )!,
      objective: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}objective'],
      ),
      dirty: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}dirty'],
      )!,
    );
  }

  @override
  $PlannedVisitsTable createAlias(String alias) {
    return $PlannedVisitsTable(attachedDatabase, alias);
  }
}

class PlannedVisit extends DataClass implements Insertable<PlannedVisit> {
  final String id;
  final String customerId;
  final String plannedDate;
  final int sequence;
  final String status;
  final String? objective;

  /// Planned or cancelled on this device and not yet uploaded.
  final bool dirty;
  const PlannedVisit({
    required this.id,
    required this.customerId,
    required this.plannedDate,
    required this.sequence,
    required this.status,
    this.objective,
    required this.dirty,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['customer_id'] = Variable<String>(customerId);
    map['planned_date'] = Variable<String>(plannedDate);
    map['sequence'] = Variable<int>(sequence);
    map['status'] = Variable<String>(status);
    if (!nullToAbsent || objective != null) {
      map['objective'] = Variable<String>(objective);
    }
    map['dirty'] = Variable<bool>(dirty);
    return map;
  }

  PlannedVisitsCompanion toCompanion(bool nullToAbsent) {
    return PlannedVisitsCompanion(
      id: Value(id),
      customerId: Value(customerId),
      plannedDate: Value(plannedDate),
      sequence: Value(sequence),
      status: Value(status),
      objective: objective == null && nullToAbsent
          ? const Value.absent()
          : Value(objective),
      dirty: Value(dirty),
    );
  }

  factory PlannedVisit.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return PlannedVisit(
      id: serializer.fromJson<String>(json['id']),
      customerId: serializer.fromJson<String>(json['customerId']),
      plannedDate: serializer.fromJson<String>(json['plannedDate']),
      sequence: serializer.fromJson<int>(json['sequence']),
      status: serializer.fromJson<String>(json['status']),
      objective: serializer.fromJson<String?>(json['objective']),
      dirty: serializer.fromJson<bool>(json['dirty']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'customerId': serializer.toJson<String>(customerId),
      'plannedDate': serializer.toJson<String>(plannedDate),
      'sequence': serializer.toJson<int>(sequence),
      'status': serializer.toJson<String>(status),
      'objective': serializer.toJson<String?>(objective),
      'dirty': serializer.toJson<bool>(dirty),
    };
  }

  PlannedVisit copyWith({
    String? id,
    String? customerId,
    String? plannedDate,
    int? sequence,
    String? status,
    Value<String?> objective = const Value.absent(),
    bool? dirty,
  }) => PlannedVisit(
    id: id ?? this.id,
    customerId: customerId ?? this.customerId,
    plannedDate: plannedDate ?? this.plannedDate,
    sequence: sequence ?? this.sequence,
    status: status ?? this.status,
    objective: objective.present ? objective.value : this.objective,
    dirty: dirty ?? this.dirty,
  );
  PlannedVisit copyWithCompanion(PlannedVisitsCompanion data) {
    return PlannedVisit(
      id: data.id.present ? data.id.value : this.id,
      customerId: data.customerId.present
          ? data.customerId.value
          : this.customerId,
      plannedDate: data.plannedDate.present
          ? data.plannedDate.value
          : this.plannedDate,
      sequence: data.sequence.present ? data.sequence.value : this.sequence,
      status: data.status.present ? data.status.value : this.status,
      objective: data.objective.present ? data.objective.value : this.objective,
      dirty: data.dirty.present ? data.dirty.value : this.dirty,
    );
  }

  @override
  String toString() {
    return (StringBuffer('PlannedVisit(')
          ..write('id: $id, ')
          ..write('customerId: $customerId, ')
          ..write('plannedDate: $plannedDate, ')
          ..write('sequence: $sequence, ')
          ..write('status: $status, ')
          ..write('objective: $objective, ')
          ..write('dirty: $dirty')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    customerId,
    plannedDate,
    sequence,
    status,
    objective,
    dirty,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is PlannedVisit &&
          other.id == this.id &&
          other.customerId == this.customerId &&
          other.plannedDate == this.plannedDate &&
          other.sequence == this.sequence &&
          other.status == this.status &&
          other.objective == this.objective &&
          other.dirty == this.dirty);
}

class PlannedVisitsCompanion extends UpdateCompanion<PlannedVisit> {
  final Value<String> id;
  final Value<String> customerId;
  final Value<String> plannedDate;
  final Value<int> sequence;
  final Value<String> status;
  final Value<String?> objective;
  final Value<bool> dirty;
  final Value<int> rowid;
  const PlannedVisitsCompanion({
    this.id = const Value.absent(),
    this.customerId = const Value.absent(),
    this.plannedDate = const Value.absent(),
    this.sequence = const Value.absent(),
    this.status = const Value.absent(),
    this.objective = const Value.absent(),
    this.dirty = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  PlannedVisitsCompanion.insert({
    required String id,
    required String customerId,
    required String plannedDate,
    this.sequence = const Value.absent(),
    this.status = const Value.absent(),
    this.objective = const Value.absent(),
    this.dirty = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       customerId = Value(customerId),
       plannedDate = Value(plannedDate);
  static Insertable<PlannedVisit> custom({
    Expression<String>? id,
    Expression<String>? customerId,
    Expression<String>? plannedDate,
    Expression<int>? sequence,
    Expression<String>? status,
    Expression<String>? objective,
    Expression<bool>? dirty,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (customerId != null) 'customer_id': customerId,
      if (plannedDate != null) 'planned_date': plannedDate,
      if (sequence != null) 'sequence': sequence,
      if (status != null) 'status': status,
      if (objective != null) 'objective': objective,
      if (dirty != null) 'dirty': dirty,
      if (rowid != null) 'rowid': rowid,
    });
  }

  PlannedVisitsCompanion copyWith({
    Value<String>? id,
    Value<String>? customerId,
    Value<String>? plannedDate,
    Value<int>? sequence,
    Value<String>? status,
    Value<String?>? objective,
    Value<bool>? dirty,
    Value<int>? rowid,
  }) {
    return PlannedVisitsCompanion(
      id: id ?? this.id,
      customerId: customerId ?? this.customerId,
      plannedDate: plannedDate ?? this.plannedDate,
      sequence: sequence ?? this.sequence,
      status: status ?? this.status,
      objective: objective ?? this.objective,
      dirty: dirty ?? this.dirty,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (customerId.present) {
      map['customer_id'] = Variable<String>(customerId.value);
    }
    if (plannedDate.present) {
      map['planned_date'] = Variable<String>(plannedDate.value);
    }
    if (sequence.present) {
      map['sequence'] = Variable<int>(sequence.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (objective.present) {
      map['objective'] = Variable<String>(objective.value);
    }
    if (dirty.present) {
      map['dirty'] = Variable<bool>(dirty.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('PlannedVisitsCompanion(')
          ..write('id: $id, ')
          ..write('customerId: $customerId, ')
          ..write('plannedDate: $plannedDate, ')
          ..write('sequence: $sequence, ')
          ..write('status: $status, ')
          ..write('objective: $objective, ')
          ..write('dirty: $dirty, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $VisitsTable extends Visits with TableInfo<$VisitsTable, Visit> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $VisitsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _customerIdMeta = const VerificationMeta(
    'customerId',
  );
  @override
  late final GeneratedColumn<String> customerId = GeneratedColumn<String>(
    'customer_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _plannedVisitIdMeta = const VerificationMeta(
    'plannedVisitId',
  );
  @override
  late final GeneratedColumn<String> plannedVisitId = GeneratedColumn<String>(
    'planned_visit_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _checkInAtMeta = const VerificationMeta(
    'checkInAt',
  );
  @override
  late final GeneratedColumn<String> checkInAt = GeneratedColumn<String>(
    'check_in_at',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _checkInLatMeta = const VerificationMeta(
    'checkInLat',
  );
  @override
  late final GeneratedColumn<double> checkInLat = GeneratedColumn<double>(
    'check_in_lat',
    aliasedName,
    true,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _checkInLngMeta = const VerificationMeta(
    'checkInLng',
  );
  @override
  late final GeneratedColumn<double> checkInLng = GeneratedColumn<double>(
    'check_in_lng',
    aliasedName,
    true,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _checkInAccuracyMMeta = const VerificationMeta(
    'checkInAccuracyM',
  );
  @override
  late final GeneratedColumn<double> checkInAccuracyM = GeneratedColumn<double>(
    'check_in_accuracy_m',
    aliasedName,
    true,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _checkOutAtMeta = const VerificationMeta(
    'checkOutAt',
  );
  @override
  late final GeneratedColumn<String> checkOutAt = GeneratedColumn<String>(
    'check_out_at',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _checkOutLatMeta = const VerificationMeta(
    'checkOutLat',
  );
  @override
  late final GeneratedColumn<double> checkOutLat = GeneratedColumn<double>(
    'check_out_lat',
    aliasedName,
    true,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _checkOutLngMeta = const VerificationMeta(
    'checkOutLng',
  );
  @override
  late final GeneratedColumn<double> checkOutLng = GeneratedColumn<double>(
    'check_out_lng',
    aliasedName,
    true,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _dirtyMeta = const VerificationMeta('dirty');
  @override
  late final GeneratedColumn<bool> dirty = GeneratedColumn<bool>(
    'dirty',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("dirty" IN (0, 1))',
    ),
    defaultValue: const Constant(true),
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    customerId,
    plannedVisitId,
    checkInAt,
    checkInLat,
    checkInLng,
    checkInAccuracyM,
    checkOutAt,
    checkOutLat,
    checkOutLng,
    dirty,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'visits';
  @override
  VerificationContext validateIntegrity(
    Insertable<Visit> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('customer_id')) {
      context.handle(
        _customerIdMeta,
        customerId.isAcceptableOrUnknown(data['customer_id']!, _customerIdMeta),
      );
    } else if (isInserting) {
      context.missing(_customerIdMeta);
    }
    if (data.containsKey('planned_visit_id')) {
      context.handle(
        _plannedVisitIdMeta,
        plannedVisitId.isAcceptableOrUnknown(
          data['planned_visit_id']!,
          _plannedVisitIdMeta,
        ),
      );
    }
    if (data.containsKey('check_in_at')) {
      context.handle(
        _checkInAtMeta,
        checkInAt.isAcceptableOrUnknown(data['check_in_at']!, _checkInAtMeta),
      );
    } else if (isInserting) {
      context.missing(_checkInAtMeta);
    }
    if (data.containsKey('check_in_lat')) {
      context.handle(
        _checkInLatMeta,
        checkInLat.isAcceptableOrUnknown(
          data['check_in_lat']!,
          _checkInLatMeta,
        ),
      );
    }
    if (data.containsKey('check_in_lng')) {
      context.handle(
        _checkInLngMeta,
        checkInLng.isAcceptableOrUnknown(
          data['check_in_lng']!,
          _checkInLngMeta,
        ),
      );
    }
    if (data.containsKey('check_in_accuracy_m')) {
      context.handle(
        _checkInAccuracyMMeta,
        checkInAccuracyM.isAcceptableOrUnknown(
          data['check_in_accuracy_m']!,
          _checkInAccuracyMMeta,
        ),
      );
    }
    if (data.containsKey('check_out_at')) {
      context.handle(
        _checkOutAtMeta,
        checkOutAt.isAcceptableOrUnknown(
          data['check_out_at']!,
          _checkOutAtMeta,
        ),
      );
    }
    if (data.containsKey('check_out_lat')) {
      context.handle(
        _checkOutLatMeta,
        checkOutLat.isAcceptableOrUnknown(
          data['check_out_lat']!,
          _checkOutLatMeta,
        ),
      );
    }
    if (data.containsKey('check_out_lng')) {
      context.handle(
        _checkOutLngMeta,
        checkOutLng.isAcceptableOrUnknown(
          data['check_out_lng']!,
          _checkOutLngMeta,
        ),
      );
    }
    if (data.containsKey('dirty')) {
      context.handle(
        _dirtyMeta,
        dirty.isAcceptableOrUnknown(data['dirty']!, _dirtyMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  Visit map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return Visit(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      customerId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}customer_id'],
      )!,
      plannedVisitId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}planned_visit_id'],
      ),
      checkInAt: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}check_in_at'],
      )!,
      checkInLat: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}check_in_lat'],
      ),
      checkInLng: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}check_in_lng'],
      ),
      checkInAccuracyM: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}check_in_accuracy_m'],
      ),
      checkOutAt: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}check_out_at'],
      ),
      checkOutLat: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}check_out_lat'],
      ),
      checkOutLng: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}check_out_lng'],
      ),
      dirty: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}dirty'],
      )!,
    );
  }

  @override
  $VisitsTable createAlias(String alias) {
    return $VisitsTable(attachedDatabase, alias);
  }
}

class Visit extends DataClass implements Insertable<Visit> {
  final String id;
  final String customerId;
  final String? plannedVisitId;
  final String checkInAt;
  final double? checkInLat;
  final double? checkInLng;
  final double? checkInAccuracyM;
  final String? checkOutAt;
  final double? checkOutLat;
  final double? checkOutLng;
  final bool dirty;
  const Visit({
    required this.id,
    required this.customerId,
    this.plannedVisitId,
    required this.checkInAt,
    this.checkInLat,
    this.checkInLng,
    this.checkInAccuracyM,
    this.checkOutAt,
    this.checkOutLat,
    this.checkOutLng,
    required this.dirty,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['customer_id'] = Variable<String>(customerId);
    if (!nullToAbsent || plannedVisitId != null) {
      map['planned_visit_id'] = Variable<String>(plannedVisitId);
    }
    map['check_in_at'] = Variable<String>(checkInAt);
    if (!nullToAbsent || checkInLat != null) {
      map['check_in_lat'] = Variable<double>(checkInLat);
    }
    if (!nullToAbsent || checkInLng != null) {
      map['check_in_lng'] = Variable<double>(checkInLng);
    }
    if (!nullToAbsent || checkInAccuracyM != null) {
      map['check_in_accuracy_m'] = Variable<double>(checkInAccuracyM);
    }
    if (!nullToAbsent || checkOutAt != null) {
      map['check_out_at'] = Variable<String>(checkOutAt);
    }
    if (!nullToAbsent || checkOutLat != null) {
      map['check_out_lat'] = Variable<double>(checkOutLat);
    }
    if (!nullToAbsent || checkOutLng != null) {
      map['check_out_lng'] = Variable<double>(checkOutLng);
    }
    map['dirty'] = Variable<bool>(dirty);
    return map;
  }

  VisitsCompanion toCompanion(bool nullToAbsent) {
    return VisitsCompanion(
      id: Value(id),
      customerId: Value(customerId),
      plannedVisitId: plannedVisitId == null && nullToAbsent
          ? const Value.absent()
          : Value(plannedVisitId),
      checkInAt: Value(checkInAt),
      checkInLat: checkInLat == null && nullToAbsent
          ? const Value.absent()
          : Value(checkInLat),
      checkInLng: checkInLng == null && nullToAbsent
          ? const Value.absent()
          : Value(checkInLng),
      checkInAccuracyM: checkInAccuracyM == null && nullToAbsent
          ? const Value.absent()
          : Value(checkInAccuracyM),
      checkOutAt: checkOutAt == null && nullToAbsent
          ? const Value.absent()
          : Value(checkOutAt),
      checkOutLat: checkOutLat == null && nullToAbsent
          ? const Value.absent()
          : Value(checkOutLat),
      checkOutLng: checkOutLng == null && nullToAbsent
          ? const Value.absent()
          : Value(checkOutLng),
      dirty: Value(dirty),
    );
  }

  factory Visit.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return Visit(
      id: serializer.fromJson<String>(json['id']),
      customerId: serializer.fromJson<String>(json['customerId']),
      plannedVisitId: serializer.fromJson<String?>(json['plannedVisitId']),
      checkInAt: serializer.fromJson<String>(json['checkInAt']),
      checkInLat: serializer.fromJson<double?>(json['checkInLat']),
      checkInLng: serializer.fromJson<double?>(json['checkInLng']),
      checkInAccuracyM: serializer.fromJson<double?>(json['checkInAccuracyM']),
      checkOutAt: serializer.fromJson<String?>(json['checkOutAt']),
      checkOutLat: serializer.fromJson<double?>(json['checkOutLat']),
      checkOutLng: serializer.fromJson<double?>(json['checkOutLng']),
      dirty: serializer.fromJson<bool>(json['dirty']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'customerId': serializer.toJson<String>(customerId),
      'plannedVisitId': serializer.toJson<String?>(plannedVisitId),
      'checkInAt': serializer.toJson<String>(checkInAt),
      'checkInLat': serializer.toJson<double?>(checkInLat),
      'checkInLng': serializer.toJson<double?>(checkInLng),
      'checkInAccuracyM': serializer.toJson<double?>(checkInAccuracyM),
      'checkOutAt': serializer.toJson<String?>(checkOutAt),
      'checkOutLat': serializer.toJson<double?>(checkOutLat),
      'checkOutLng': serializer.toJson<double?>(checkOutLng),
      'dirty': serializer.toJson<bool>(dirty),
    };
  }

  Visit copyWith({
    String? id,
    String? customerId,
    Value<String?> plannedVisitId = const Value.absent(),
    String? checkInAt,
    Value<double?> checkInLat = const Value.absent(),
    Value<double?> checkInLng = const Value.absent(),
    Value<double?> checkInAccuracyM = const Value.absent(),
    Value<String?> checkOutAt = const Value.absent(),
    Value<double?> checkOutLat = const Value.absent(),
    Value<double?> checkOutLng = const Value.absent(),
    bool? dirty,
  }) => Visit(
    id: id ?? this.id,
    customerId: customerId ?? this.customerId,
    plannedVisitId: plannedVisitId.present
        ? plannedVisitId.value
        : this.plannedVisitId,
    checkInAt: checkInAt ?? this.checkInAt,
    checkInLat: checkInLat.present ? checkInLat.value : this.checkInLat,
    checkInLng: checkInLng.present ? checkInLng.value : this.checkInLng,
    checkInAccuracyM: checkInAccuracyM.present
        ? checkInAccuracyM.value
        : this.checkInAccuracyM,
    checkOutAt: checkOutAt.present ? checkOutAt.value : this.checkOutAt,
    checkOutLat: checkOutLat.present ? checkOutLat.value : this.checkOutLat,
    checkOutLng: checkOutLng.present ? checkOutLng.value : this.checkOutLng,
    dirty: dirty ?? this.dirty,
  );
  Visit copyWithCompanion(VisitsCompanion data) {
    return Visit(
      id: data.id.present ? data.id.value : this.id,
      customerId: data.customerId.present
          ? data.customerId.value
          : this.customerId,
      plannedVisitId: data.plannedVisitId.present
          ? data.plannedVisitId.value
          : this.plannedVisitId,
      checkInAt: data.checkInAt.present ? data.checkInAt.value : this.checkInAt,
      checkInLat: data.checkInLat.present
          ? data.checkInLat.value
          : this.checkInLat,
      checkInLng: data.checkInLng.present
          ? data.checkInLng.value
          : this.checkInLng,
      checkInAccuracyM: data.checkInAccuracyM.present
          ? data.checkInAccuracyM.value
          : this.checkInAccuracyM,
      checkOutAt: data.checkOutAt.present
          ? data.checkOutAt.value
          : this.checkOutAt,
      checkOutLat: data.checkOutLat.present
          ? data.checkOutLat.value
          : this.checkOutLat,
      checkOutLng: data.checkOutLng.present
          ? data.checkOutLng.value
          : this.checkOutLng,
      dirty: data.dirty.present ? data.dirty.value : this.dirty,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Visit(')
          ..write('id: $id, ')
          ..write('customerId: $customerId, ')
          ..write('plannedVisitId: $plannedVisitId, ')
          ..write('checkInAt: $checkInAt, ')
          ..write('checkInLat: $checkInLat, ')
          ..write('checkInLng: $checkInLng, ')
          ..write('checkInAccuracyM: $checkInAccuracyM, ')
          ..write('checkOutAt: $checkOutAt, ')
          ..write('checkOutLat: $checkOutLat, ')
          ..write('checkOutLng: $checkOutLng, ')
          ..write('dirty: $dirty')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    customerId,
    plannedVisitId,
    checkInAt,
    checkInLat,
    checkInLng,
    checkInAccuracyM,
    checkOutAt,
    checkOutLat,
    checkOutLng,
    dirty,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Visit &&
          other.id == this.id &&
          other.customerId == this.customerId &&
          other.plannedVisitId == this.plannedVisitId &&
          other.checkInAt == this.checkInAt &&
          other.checkInLat == this.checkInLat &&
          other.checkInLng == this.checkInLng &&
          other.checkInAccuracyM == this.checkInAccuracyM &&
          other.checkOutAt == this.checkOutAt &&
          other.checkOutLat == this.checkOutLat &&
          other.checkOutLng == this.checkOutLng &&
          other.dirty == this.dirty);
}

class VisitsCompanion extends UpdateCompanion<Visit> {
  final Value<String> id;
  final Value<String> customerId;
  final Value<String?> plannedVisitId;
  final Value<String> checkInAt;
  final Value<double?> checkInLat;
  final Value<double?> checkInLng;
  final Value<double?> checkInAccuracyM;
  final Value<String?> checkOutAt;
  final Value<double?> checkOutLat;
  final Value<double?> checkOutLng;
  final Value<bool> dirty;
  final Value<int> rowid;
  const VisitsCompanion({
    this.id = const Value.absent(),
    this.customerId = const Value.absent(),
    this.plannedVisitId = const Value.absent(),
    this.checkInAt = const Value.absent(),
    this.checkInLat = const Value.absent(),
    this.checkInLng = const Value.absent(),
    this.checkInAccuracyM = const Value.absent(),
    this.checkOutAt = const Value.absent(),
    this.checkOutLat = const Value.absent(),
    this.checkOutLng = const Value.absent(),
    this.dirty = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  VisitsCompanion.insert({
    required String id,
    required String customerId,
    this.plannedVisitId = const Value.absent(),
    required String checkInAt,
    this.checkInLat = const Value.absent(),
    this.checkInLng = const Value.absent(),
    this.checkInAccuracyM = const Value.absent(),
    this.checkOutAt = const Value.absent(),
    this.checkOutLat = const Value.absent(),
    this.checkOutLng = const Value.absent(),
    this.dirty = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       customerId = Value(customerId),
       checkInAt = Value(checkInAt);
  static Insertable<Visit> custom({
    Expression<String>? id,
    Expression<String>? customerId,
    Expression<String>? plannedVisitId,
    Expression<String>? checkInAt,
    Expression<double>? checkInLat,
    Expression<double>? checkInLng,
    Expression<double>? checkInAccuracyM,
    Expression<String>? checkOutAt,
    Expression<double>? checkOutLat,
    Expression<double>? checkOutLng,
    Expression<bool>? dirty,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (customerId != null) 'customer_id': customerId,
      if (plannedVisitId != null) 'planned_visit_id': plannedVisitId,
      if (checkInAt != null) 'check_in_at': checkInAt,
      if (checkInLat != null) 'check_in_lat': checkInLat,
      if (checkInLng != null) 'check_in_lng': checkInLng,
      if (checkInAccuracyM != null) 'check_in_accuracy_m': checkInAccuracyM,
      if (checkOutAt != null) 'check_out_at': checkOutAt,
      if (checkOutLat != null) 'check_out_lat': checkOutLat,
      if (checkOutLng != null) 'check_out_lng': checkOutLng,
      if (dirty != null) 'dirty': dirty,
      if (rowid != null) 'rowid': rowid,
    });
  }

  VisitsCompanion copyWith({
    Value<String>? id,
    Value<String>? customerId,
    Value<String?>? plannedVisitId,
    Value<String>? checkInAt,
    Value<double?>? checkInLat,
    Value<double?>? checkInLng,
    Value<double?>? checkInAccuracyM,
    Value<String?>? checkOutAt,
    Value<double?>? checkOutLat,
    Value<double?>? checkOutLng,
    Value<bool>? dirty,
    Value<int>? rowid,
  }) {
    return VisitsCompanion(
      id: id ?? this.id,
      customerId: customerId ?? this.customerId,
      plannedVisitId: plannedVisitId ?? this.plannedVisitId,
      checkInAt: checkInAt ?? this.checkInAt,
      checkInLat: checkInLat ?? this.checkInLat,
      checkInLng: checkInLng ?? this.checkInLng,
      checkInAccuracyM: checkInAccuracyM ?? this.checkInAccuracyM,
      checkOutAt: checkOutAt ?? this.checkOutAt,
      checkOutLat: checkOutLat ?? this.checkOutLat,
      checkOutLng: checkOutLng ?? this.checkOutLng,
      dirty: dirty ?? this.dirty,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (customerId.present) {
      map['customer_id'] = Variable<String>(customerId.value);
    }
    if (plannedVisitId.present) {
      map['planned_visit_id'] = Variable<String>(plannedVisitId.value);
    }
    if (checkInAt.present) {
      map['check_in_at'] = Variable<String>(checkInAt.value);
    }
    if (checkInLat.present) {
      map['check_in_lat'] = Variable<double>(checkInLat.value);
    }
    if (checkInLng.present) {
      map['check_in_lng'] = Variable<double>(checkInLng.value);
    }
    if (checkInAccuracyM.present) {
      map['check_in_accuracy_m'] = Variable<double>(checkInAccuracyM.value);
    }
    if (checkOutAt.present) {
      map['check_out_at'] = Variable<String>(checkOutAt.value);
    }
    if (checkOutLat.present) {
      map['check_out_lat'] = Variable<double>(checkOutLat.value);
    }
    if (checkOutLng.present) {
      map['check_out_lng'] = Variable<double>(checkOutLng.value);
    }
    if (dirty.present) {
      map['dirty'] = Variable<bool>(dirty.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('VisitsCompanion(')
          ..write('id: $id, ')
          ..write('customerId: $customerId, ')
          ..write('plannedVisitId: $plannedVisitId, ')
          ..write('checkInAt: $checkInAt, ')
          ..write('checkInLat: $checkInLat, ')
          ..write('checkInLng: $checkInLng, ')
          ..write('checkInAccuracyM: $checkInAccuracyM, ')
          ..write('checkOutAt: $checkOutAt, ')
          ..write('checkOutLat: $checkOutLat, ')
          ..write('checkOutLng: $checkOutLng, ')
          ..write('dirty: $dirty, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $CallReportsTable extends CallReports
    with TableInfo<$CallReportsTable, CallReport> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CallReportsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _visitIdMeta = const VerificationMeta(
    'visitId',
  );
  @override
  late final GeneratedColumn<String> visitId = GeneratedColumn<String>(
    'visit_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _notesMeta = const VerificationMeta('notes');
  @override
  late final GeneratedColumn<String> notes = GeneratedColumn<String>(
    'notes',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _outcomeMeta = const VerificationMeta(
    'outcome',
  );
  @override
  late final GeneratedColumn<String> outcome = GeneratedColumn<String>(
    'outcome',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _nextStepMeta = const VerificationMeta(
    'nextStep',
  );
  @override
  late final GeneratedColumn<String> nextStep = GeneratedColumn<String>(
    'next_step',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _voiceNoteUrlMeta = const VerificationMeta(
    'voiceNoteUrl',
  );
  @override
  late final GeneratedColumn<String> voiceNoteUrl = GeneratedColumn<String>(
    'voice_note_url',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _productsJsonMeta = const VerificationMeta(
    'productsJson',
  );
  @override
  late final GeneratedColumn<String> productsJson = GeneratedColumn<String>(
    'products_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('[]'),
  );
  static const VerificationMeta _dirtyMeta = const VerificationMeta('dirty');
  @override
  late final GeneratedColumn<bool> dirty = GeneratedColumn<bool>(
    'dirty',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("dirty" IN (0, 1))',
    ),
    defaultValue: const Constant(true),
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    visitId,
    notes,
    outcome,
    nextStep,
    voiceNoteUrl,
    productsJson,
    dirty,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'call_reports';
  @override
  VerificationContext validateIntegrity(
    Insertable<CallReport> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('visit_id')) {
      context.handle(
        _visitIdMeta,
        visitId.isAcceptableOrUnknown(data['visit_id']!, _visitIdMeta),
      );
    } else if (isInserting) {
      context.missing(_visitIdMeta);
    }
    if (data.containsKey('notes')) {
      context.handle(
        _notesMeta,
        notes.isAcceptableOrUnknown(data['notes']!, _notesMeta),
      );
    }
    if (data.containsKey('outcome')) {
      context.handle(
        _outcomeMeta,
        outcome.isAcceptableOrUnknown(data['outcome']!, _outcomeMeta),
      );
    }
    if (data.containsKey('next_step')) {
      context.handle(
        _nextStepMeta,
        nextStep.isAcceptableOrUnknown(data['next_step']!, _nextStepMeta),
      );
    }
    if (data.containsKey('voice_note_url')) {
      context.handle(
        _voiceNoteUrlMeta,
        voiceNoteUrl.isAcceptableOrUnknown(
          data['voice_note_url']!,
          _voiceNoteUrlMeta,
        ),
      );
    }
    if (data.containsKey('products_json')) {
      context.handle(
        _productsJsonMeta,
        productsJson.isAcceptableOrUnknown(
          data['products_json']!,
          _productsJsonMeta,
        ),
      );
    }
    if (data.containsKey('dirty')) {
      context.handle(
        _dirtyMeta,
        dirty.isAcceptableOrUnknown(data['dirty']!, _dirtyMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  CallReport map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return CallReport(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      visitId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}visit_id'],
      )!,
      notes: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}notes'],
      ),
      outcome: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}outcome'],
      ),
      nextStep: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}next_step'],
      ),
      voiceNoteUrl: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}voice_note_url'],
      ),
      productsJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}products_json'],
      )!,
      dirty: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}dirty'],
      )!,
    );
  }

  @override
  $CallReportsTable createAlias(String alias) {
    return $CallReportsTable(attachedDatabase, alias);
  }
}

class CallReport extends DataClass implements Insertable<CallReport> {
  final String id;
  final String visitId;
  final String? notes;
  final String? outcome;
  final String? nextStep;
  final String? voiceNoteUrl;
  final String productsJson;
  final bool dirty;
  const CallReport({
    required this.id,
    required this.visitId,
    this.notes,
    this.outcome,
    this.nextStep,
    this.voiceNoteUrl,
    required this.productsJson,
    required this.dirty,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['visit_id'] = Variable<String>(visitId);
    if (!nullToAbsent || notes != null) {
      map['notes'] = Variable<String>(notes);
    }
    if (!nullToAbsent || outcome != null) {
      map['outcome'] = Variable<String>(outcome);
    }
    if (!nullToAbsent || nextStep != null) {
      map['next_step'] = Variable<String>(nextStep);
    }
    if (!nullToAbsent || voiceNoteUrl != null) {
      map['voice_note_url'] = Variable<String>(voiceNoteUrl);
    }
    map['products_json'] = Variable<String>(productsJson);
    map['dirty'] = Variable<bool>(dirty);
    return map;
  }

  CallReportsCompanion toCompanion(bool nullToAbsent) {
    return CallReportsCompanion(
      id: Value(id),
      visitId: Value(visitId),
      notes: notes == null && nullToAbsent
          ? const Value.absent()
          : Value(notes),
      outcome: outcome == null && nullToAbsent
          ? const Value.absent()
          : Value(outcome),
      nextStep: nextStep == null && nullToAbsent
          ? const Value.absent()
          : Value(nextStep),
      voiceNoteUrl: voiceNoteUrl == null && nullToAbsent
          ? const Value.absent()
          : Value(voiceNoteUrl),
      productsJson: Value(productsJson),
      dirty: Value(dirty),
    );
  }

  factory CallReport.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return CallReport(
      id: serializer.fromJson<String>(json['id']),
      visitId: serializer.fromJson<String>(json['visitId']),
      notes: serializer.fromJson<String?>(json['notes']),
      outcome: serializer.fromJson<String?>(json['outcome']),
      nextStep: serializer.fromJson<String?>(json['nextStep']),
      voiceNoteUrl: serializer.fromJson<String?>(json['voiceNoteUrl']),
      productsJson: serializer.fromJson<String>(json['productsJson']),
      dirty: serializer.fromJson<bool>(json['dirty']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'visitId': serializer.toJson<String>(visitId),
      'notes': serializer.toJson<String?>(notes),
      'outcome': serializer.toJson<String?>(outcome),
      'nextStep': serializer.toJson<String?>(nextStep),
      'voiceNoteUrl': serializer.toJson<String?>(voiceNoteUrl),
      'productsJson': serializer.toJson<String>(productsJson),
      'dirty': serializer.toJson<bool>(dirty),
    };
  }

  CallReport copyWith({
    String? id,
    String? visitId,
    Value<String?> notes = const Value.absent(),
    Value<String?> outcome = const Value.absent(),
    Value<String?> nextStep = const Value.absent(),
    Value<String?> voiceNoteUrl = const Value.absent(),
    String? productsJson,
    bool? dirty,
  }) => CallReport(
    id: id ?? this.id,
    visitId: visitId ?? this.visitId,
    notes: notes.present ? notes.value : this.notes,
    outcome: outcome.present ? outcome.value : this.outcome,
    nextStep: nextStep.present ? nextStep.value : this.nextStep,
    voiceNoteUrl: voiceNoteUrl.present ? voiceNoteUrl.value : this.voiceNoteUrl,
    productsJson: productsJson ?? this.productsJson,
    dirty: dirty ?? this.dirty,
  );
  CallReport copyWithCompanion(CallReportsCompanion data) {
    return CallReport(
      id: data.id.present ? data.id.value : this.id,
      visitId: data.visitId.present ? data.visitId.value : this.visitId,
      notes: data.notes.present ? data.notes.value : this.notes,
      outcome: data.outcome.present ? data.outcome.value : this.outcome,
      nextStep: data.nextStep.present ? data.nextStep.value : this.nextStep,
      voiceNoteUrl: data.voiceNoteUrl.present
          ? data.voiceNoteUrl.value
          : this.voiceNoteUrl,
      productsJson: data.productsJson.present
          ? data.productsJson.value
          : this.productsJson,
      dirty: data.dirty.present ? data.dirty.value : this.dirty,
    );
  }

  @override
  String toString() {
    return (StringBuffer('CallReport(')
          ..write('id: $id, ')
          ..write('visitId: $visitId, ')
          ..write('notes: $notes, ')
          ..write('outcome: $outcome, ')
          ..write('nextStep: $nextStep, ')
          ..write('voiceNoteUrl: $voiceNoteUrl, ')
          ..write('productsJson: $productsJson, ')
          ..write('dirty: $dirty')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    visitId,
    notes,
    outcome,
    nextStep,
    voiceNoteUrl,
    productsJson,
    dirty,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CallReport &&
          other.id == this.id &&
          other.visitId == this.visitId &&
          other.notes == this.notes &&
          other.outcome == this.outcome &&
          other.nextStep == this.nextStep &&
          other.voiceNoteUrl == this.voiceNoteUrl &&
          other.productsJson == this.productsJson &&
          other.dirty == this.dirty);
}

class CallReportsCompanion extends UpdateCompanion<CallReport> {
  final Value<String> id;
  final Value<String> visitId;
  final Value<String?> notes;
  final Value<String?> outcome;
  final Value<String?> nextStep;
  final Value<String?> voiceNoteUrl;
  final Value<String> productsJson;
  final Value<bool> dirty;
  final Value<int> rowid;
  const CallReportsCompanion({
    this.id = const Value.absent(),
    this.visitId = const Value.absent(),
    this.notes = const Value.absent(),
    this.outcome = const Value.absent(),
    this.nextStep = const Value.absent(),
    this.voiceNoteUrl = const Value.absent(),
    this.productsJson = const Value.absent(),
    this.dirty = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CallReportsCompanion.insert({
    required String id,
    required String visitId,
    this.notes = const Value.absent(),
    this.outcome = const Value.absent(),
    this.nextStep = const Value.absent(),
    this.voiceNoteUrl = const Value.absent(),
    this.productsJson = const Value.absent(),
    this.dirty = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       visitId = Value(visitId);
  static Insertable<CallReport> custom({
    Expression<String>? id,
    Expression<String>? visitId,
    Expression<String>? notes,
    Expression<String>? outcome,
    Expression<String>? nextStep,
    Expression<String>? voiceNoteUrl,
    Expression<String>? productsJson,
    Expression<bool>? dirty,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (visitId != null) 'visit_id': visitId,
      if (notes != null) 'notes': notes,
      if (outcome != null) 'outcome': outcome,
      if (nextStep != null) 'next_step': nextStep,
      if (voiceNoteUrl != null) 'voice_note_url': voiceNoteUrl,
      if (productsJson != null) 'products_json': productsJson,
      if (dirty != null) 'dirty': dirty,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CallReportsCompanion copyWith({
    Value<String>? id,
    Value<String>? visitId,
    Value<String?>? notes,
    Value<String?>? outcome,
    Value<String?>? nextStep,
    Value<String?>? voiceNoteUrl,
    Value<String>? productsJson,
    Value<bool>? dirty,
    Value<int>? rowid,
  }) {
    return CallReportsCompanion(
      id: id ?? this.id,
      visitId: visitId ?? this.visitId,
      notes: notes ?? this.notes,
      outcome: outcome ?? this.outcome,
      nextStep: nextStep ?? this.nextStep,
      voiceNoteUrl: voiceNoteUrl ?? this.voiceNoteUrl,
      productsJson: productsJson ?? this.productsJson,
      dirty: dirty ?? this.dirty,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (visitId.present) {
      map['visit_id'] = Variable<String>(visitId.value);
    }
    if (notes.present) {
      map['notes'] = Variable<String>(notes.value);
    }
    if (outcome.present) {
      map['outcome'] = Variable<String>(outcome.value);
    }
    if (nextStep.present) {
      map['next_step'] = Variable<String>(nextStep.value);
    }
    if (voiceNoteUrl.present) {
      map['voice_note_url'] = Variable<String>(voiceNoteUrl.value);
    }
    if (productsJson.present) {
      map['products_json'] = Variable<String>(productsJson.value);
    }
    if (dirty.present) {
      map['dirty'] = Variable<bool>(dirty.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CallReportsCompanion(')
          ..write('id: $id, ')
          ..write('visitId: $visitId, ')
          ..write('notes: $notes, ')
          ..write('outcome: $outcome, ')
          ..write('nextStep: $nextStep, ')
          ..write('voiceNoteUrl: $voiceNoteUrl, ')
          ..write('productsJson: $productsJson, ')
          ..write('dirty: $dirty, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $FollowUpTasksTable extends FollowUpTasks
    with TableInfo<$FollowUpTasksTable, FollowUpTask> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $FollowUpTasksTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _customerIdMeta = const VerificationMeta(
    'customerId',
  );
  @override
  late final GeneratedColumn<String> customerId = GeneratedColumn<String>(
    'customer_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _callReportIdMeta = const VerificationMeta(
    'callReportId',
  );
  @override
  late final GeneratedColumn<String> callReportId = GeneratedColumn<String>(
    'call_report_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _titleMeta = const VerificationMeta('title');
  @override
  late final GeneratedColumn<String> title = GeneratedColumn<String>(
    'title',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _dueDateMeta = const VerificationMeta(
    'dueDate',
  );
  @override
  late final GeneratedColumn<String> dueDate = GeneratedColumn<String>(
    'due_date',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
    'status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('Open'),
  );
  static const VerificationMeta _dirtyMeta = const VerificationMeta('dirty');
  @override
  late final GeneratedColumn<bool> dirty = GeneratedColumn<bool>(
    'dirty',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("dirty" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    customerId,
    callReportId,
    title,
    dueDate,
    status,
    dirty,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'follow_up_tasks';
  @override
  VerificationContext validateIntegrity(
    Insertable<FollowUpTask> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('customer_id')) {
      context.handle(
        _customerIdMeta,
        customerId.isAcceptableOrUnknown(data['customer_id']!, _customerIdMeta),
      );
    }
    if (data.containsKey('call_report_id')) {
      context.handle(
        _callReportIdMeta,
        callReportId.isAcceptableOrUnknown(
          data['call_report_id']!,
          _callReportIdMeta,
        ),
      );
    }
    if (data.containsKey('title')) {
      context.handle(
        _titleMeta,
        title.isAcceptableOrUnknown(data['title']!, _titleMeta),
      );
    } else if (isInserting) {
      context.missing(_titleMeta);
    }
    if (data.containsKey('due_date')) {
      context.handle(
        _dueDateMeta,
        dueDate.isAcceptableOrUnknown(data['due_date']!, _dueDateMeta),
      );
    }
    if (data.containsKey('status')) {
      context.handle(
        _statusMeta,
        status.isAcceptableOrUnknown(data['status']!, _statusMeta),
      );
    }
    if (data.containsKey('dirty')) {
      context.handle(
        _dirtyMeta,
        dirty.isAcceptableOrUnknown(data['dirty']!, _dirtyMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  FollowUpTask map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return FollowUpTask(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      customerId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}customer_id'],
      ),
      callReportId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}call_report_id'],
      ),
      title: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}title'],
      )!,
      dueDate: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}due_date'],
      ),
      status: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}status'],
      )!,
      dirty: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}dirty'],
      )!,
    );
  }

  @override
  $FollowUpTasksTable createAlias(String alias) {
    return $FollowUpTasksTable(attachedDatabase, alias);
  }
}

class FollowUpTask extends DataClass implements Insertable<FollowUpTask> {
  final String id;
  final String? customerId;
  final String? callReportId;
  final String title;
  final String? dueDate;
  final String status;
  final bool dirty;
  const FollowUpTask({
    required this.id,
    this.customerId,
    this.callReportId,
    required this.title,
    this.dueDate,
    required this.status,
    required this.dirty,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    if (!nullToAbsent || customerId != null) {
      map['customer_id'] = Variable<String>(customerId);
    }
    if (!nullToAbsent || callReportId != null) {
      map['call_report_id'] = Variable<String>(callReportId);
    }
    map['title'] = Variable<String>(title);
    if (!nullToAbsent || dueDate != null) {
      map['due_date'] = Variable<String>(dueDate);
    }
    map['status'] = Variable<String>(status);
    map['dirty'] = Variable<bool>(dirty);
    return map;
  }

  FollowUpTasksCompanion toCompanion(bool nullToAbsent) {
    return FollowUpTasksCompanion(
      id: Value(id),
      customerId: customerId == null && nullToAbsent
          ? const Value.absent()
          : Value(customerId),
      callReportId: callReportId == null && nullToAbsent
          ? const Value.absent()
          : Value(callReportId),
      title: Value(title),
      dueDate: dueDate == null && nullToAbsent
          ? const Value.absent()
          : Value(dueDate),
      status: Value(status),
      dirty: Value(dirty),
    );
  }

  factory FollowUpTask.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return FollowUpTask(
      id: serializer.fromJson<String>(json['id']),
      customerId: serializer.fromJson<String?>(json['customerId']),
      callReportId: serializer.fromJson<String?>(json['callReportId']),
      title: serializer.fromJson<String>(json['title']),
      dueDate: serializer.fromJson<String?>(json['dueDate']),
      status: serializer.fromJson<String>(json['status']),
      dirty: serializer.fromJson<bool>(json['dirty']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'customerId': serializer.toJson<String?>(customerId),
      'callReportId': serializer.toJson<String?>(callReportId),
      'title': serializer.toJson<String>(title),
      'dueDate': serializer.toJson<String?>(dueDate),
      'status': serializer.toJson<String>(status),
      'dirty': serializer.toJson<bool>(dirty),
    };
  }

  FollowUpTask copyWith({
    String? id,
    Value<String?> customerId = const Value.absent(),
    Value<String?> callReportId = const Value.absent(),
    String? title,
    Value<String?> dueDate = const Value.absent(),
    String? status,
    bool? dirty,
  }) => FollowUpTask(
    id: id ?? this.id,
    customerId: customerId.present ? customerId.value : this.customerId,
    callReportId: callReportId.present ? callReportId.value : this.callReportId,
    title: title ?? this.title,
    dueDate: dueDate.present ? dueDate.value : this.dueDate,
    status: status ?? this.status,
    dirty: dirty ?? this.dirty,
  );
  FollowUpTask copyWithCompanion(FollowUpTasksCompanion data) {
    return FollowUpTask(
      id: data.id.present ? data.id.value : this.id,
      customerId: data.customerId.present
          ? data.customerId.value
          : this.customerId,
      callReportId: data.callReportId.present
          ? data.callReportId.value
          : this.callReportId,
      title: data.title.present ? data.title.value : this.title,
      dueDate: data.dueDate.present ? data.dueDate.value : this.dueDate,
      status: data.status.present ? data.status.value : this.status,
      dirty: data.dirty.present ? data.dirty.value : this.dirty,
    );
  }

  @override
  String toString() {
    return (StringBuffer('FollowUpTask(')
          ..write('id: $id, ')
          ..write('customerId: $customerId, ')
          ..write('callReportId: $callReportId, ')
          ..write('title: $title, ')
          ..write('dueDate: $dueDate, ')
          ..write('status: $status, ')
          ..write('dirty: $dirty')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(id, customerId, callReportId, title, dueDate, status, dirty);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is FollowUpTask &&
          other.id == this.id &&
          other.customerId == this.customerId &&
          other.callReportId == this.callReportId &&
          other.title == this.title &&
          other.dueDate == this.dueDate &&
          other.status == this.status &&
          other.dirty == this.dirty);
}

class FollowUpTasksCompanion extends UpdateCompanion<FollowUpTask> {
  final Value<String> id;
  final Value<String?> customerId;
  final Value<String?> callReportId;
  final Value<String> title;
  final Value<String?> dueDate;
  final Value<String> status;
  final Value<bool> dirty;
  final Value<int> rowid;
  const FollowUpTasksCompanion({
    this.id = const Value.absent(),
    this.customerId = const Value.absent(),
    this.callReportId = const Value.absent(),
    this.title = const Value.absent(),
    this.dueDate = const Value.absent(),
    this.status = const Value.absent(),
    this.dirty = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  FollowUpTasksCompanion.insert({
    required String id,
    this.customerId = const Value.absent(),
    this.callReportId = const Value.absent(),
    required String title,
    this.dueDate = const Value.absent(),
    this.status = const Value.absent(),
    this.dirty = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       title = Value(title);
  static Insertable<FollowUpTask> custom({
    Expression<String>? id,
    Expression<String>? customerId,
    Expression<String>? callReportId,
    Expression<String>? title,
    Expression<String>? dueDate,
    Expression<String>? status,
    Expression<bool>? dirty,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (customerId != null) 'customer_id': customerId,
      if (callReportId != null) 'call_report_id': callReportId,
      if (title != null) 'title': title,
      if (dueDate != null) 'due_date': dueDate,
      if (status != null) 'status': status,
      if (dirty != null) 'dirty': dirty,
      if (rowid != null) 'rowid': rowid,
    });
  }

  FollowUpTasksCompanion copyWith({
    Value<String>? id,
    Value<String?>? customerId,
    Value<String?>? callReportId,
    Value<String>? title,
    Value<String?>? dueDate,
    Value<String>? status,
    Value<bool>? dirty,
    Value<int>? rowid,
  }) {
    return FollowUpTasksCompanion(
      id: id ?? this.id,
      customerId: customerId ?? this.customerId,
      callReportId: callReportId ?? this.callReportId,
      title: title ?? this.title,
      dueDate: dueDate ?? this.dueDate,
      status: status ?? this.status,
      dirty: dirty ?? this.dirty,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (customerId.present) {
      map['customer_id'] = Variable<String>(customerId.value);
    }
    if (callReportId.present) {
      map['call_report_id'] = Variable<String>(callReportId.value);
    }
    if (title.present) {
      map['title'] = Variable<String>(title.value);
    }
    if (dueDate.present) {
      map['due_date'] = Variable<String>(dueDate.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (dirty.present) {
      map['dirty'] = Variable<bool>(dirty.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('FollowUpTasksCompanion(')
          ..write('id: $id, ')
          ..write('customerId: $customerId, ')
          ..write('callReportId: $callReportId, ')
          ..write('title: $title, ')
          ..write('dueDate: $dueDate, ')
          ..write('status: $status, ')
          ..write('dirty: $dirty, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $GpsPingsTable extends GpsPings with TableInfo<$GpsPingsTable, GpsPing> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $GpsPingsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _recordedAtMeta = const VerificationMeta(
    'recordedAt',
  );
  @override
  late final GeneratedColumn<String> recordedAt = GeneratedColumn<String>(
    'recorded_at',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _latitudeMeta = const VerificationMeta(
    'latitude',
  );
  @override
  late final GeneratedColumn<double> latitude = GeneratedColumn<double>(
    'latitude',
    aliasedName,
    false,
    type: DriftSqlType.double,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _longitudeMeta = const VerificationMeta(
    'longitude',
  );
  @override
  late final GeneratedColumn<double> longitude = GeneratedColumn<double>(
    'longitude',
    aliasedName,
    false,
    type: DriftSqlType.double,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _accuracyMMeta = const VerificationMeta(
    'accuracyM',
  );
  @override
  late final GeneratedColumn<double> accuracyM = GeneratedColumn<double>(
    'accuracy_m',
    aliasedName,
    true,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    recordedAt,
    latitude,
    longitude,
    accuracyM,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'gps_pings';
  @override
  VerificationContext validateIntegrity(
    Insertable<GpsPing> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('recorded_at')) {
      context.handle(
        _recordedAtMeta,
        recordedAt.isAcceptableOrUnknown(data['recorded_at']!, _recordedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_recordedAtMeta);
    }
    if (data.containsKey('latitude')) {
      context.handle(
        _latitudeMeta,
        latitude.isAcceptableOrUnknown(data['latitude']!, _latitudeMeta),
      );
    } else if (isInserting) {
      context.missing(_latitudeMeta);
    }
    if (data.containsKey('longitude')) {
      context.handle(
        _longitudeMeta,
        longitude.isAcceptableOrUnknown(data['longitude']!, _longitudeMeta),
      );
    } else if (isInserting) {
      context.missing(_longitudeMeta);
    }
    if (data.containsKey('accuracy_m')) {
      context.handle(
        _accuracyMMeta,
        accuracyM.isAcceptableOrUnknown(data['accuracy_m']!, _accuracyMMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  GpsPing map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return GpsPing(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      recordedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}recorded_at'],
      )!,
      latitude: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}latitude'],
      )!,
      longitude: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}longitude'],
      )!,
      accuracyM: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}accuracy_m'],
      ),
    );
  }

  @override
  $GpsPingsTable createAlias(String alias) {
    return $GpsPingsTable(attachedDatabase, alias);
  }
}

class GpsPing extends DataClass implements Insertable<GpsPing> {
  final String id;
  final String recordedAt;
  final double latitude;
  final double longitude;
  final double? accuracyM;
  const GpsPing({
    required this.id,
    required this.recordedAt,
    required this.latitude,
    required this.longitude,
    this.accuracyM,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['recorded_at'] = Variable<String>(recordedAt);
    map['latitude'] = Variable<double>(latitude);
    map['longitude'] = Variable<double>(longitude);
    if (!nullToAbsent || accuracyM != null) {
      map['accuracy_m'] = Variable<double>(accuracyM);
    }
    return map;
  }

  GpsPingsCompanion toCompanion(bool nullToAbsent) {
    return GpsPingsCompanion(
      id: Value(id),
      recordedAt: Value(recordedAt),
      latitude: Value(latitude),
      longitude: Value(longitude),
      accuracyM: accuracyM == null && nullToAbsent
          ? const Value.absent()
          : Value(accuracyM),
    );
  }

  factory GpsPing.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return GpsPing(
      id: serializer.fromJson<String>(json['id']),
      recordedAt: serializer.fromJson<String>(json['recordedAt']),
      latitude: serializer.fromJson<double>(json['latitude']),
      longitude: serializer.fromJson<double>(json['longitude']),
      accuracyM: serializer.fromJson<double?>(json['accuracyM']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'recordedAt': serializer.toJson<String>(recordedAt),
      'latitude': serializer.toJson<double>(latitude),
      'longitude': serializer.toJson<double>(longitude),
      'accuracyM': serializer.toJson<double?>(accuracyM),
    };
  }

  GpsPing copyWith({
    String? id,
    String? recordedAt,
    double? latitude,
    double? longitude,
    Value<double?> accuracyM = const Value.absent(),
  }) => GpsPing(
    id: id ?? this.id,
    recordedAt: recordedAt ?? this.recordedAt,
    latitude: latitude ?? this.latitude,
    longitude: longitude ?? this.longitude,
    accuracyM: accuracyM.present ? accuracyM.value : this.accuracyM,
  );
  GpsPing copyWithCompanion(GpsPingsCompanion data) {
    return GpsPing(
      id: data.id.present ? data.id.value : this.id,
      recordedAt: data.recordedAt.present
          ? data.recordedAt.value
          : this.recordedAt,
      latitude: data.latitude.present ? data.latitude.value : this.latitude,
      longitude: data.longitude.present ? data.longitude.value : this.longitude,
      accuracyM: data.accuracyM.present ? data.accuracyM.value : this.accuracyM,
    );
  }

  @override
  String toString() {
    return (StringBuffer('GpsPing(')
          ..write('id: $id, ')
          ..write('recordedAt: $recordedAt, ')
          ..write('latitude: $latitude, ')
          ..write('longitude: $longitude, ')
          ..write('accuracyM: $accuracyM')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(id, recordedAt, latitude, longitude, accuracyM);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is GpsPing &&
          other.id == this.id &&
          other.recordedAt == this.recordedAt &&
          other.latitude == this.latitude &&
          other.longitude == this.longitude &&
          other.accuracyM == this.accuracyM);
}

class GpsPingsCompanion extends UpdateCompanion<GpsPing> {
  final Value<String> id;
  final Value<String> recordedAt;
  final Value<double> latitude;
  final Value<double> longitude;
  final Value<double?> accuracyM;
  final Value<int> rowid;
  const GpsPingsCompanion({
    this.id = const Value.absent(),
    this.recordedAt = const Value.absent(),
    this.latitude = const Value.absent(),
    this.longitude = const Value.absent(),
    this.accuracyM = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  GpsPingsCompanion.insert({
    required String id,
    required String recordedAt,
    required double latitude,
    required double longitude,
    this.accuracyM = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       recordedAt = Value(recordedAt),
       latitude = Value(latitude),
       longitude = Value(longitude);
  static Insertable<GpsPing> custom({
    Expression<String>? id,
    Expression<String>? recordedAt,
    Expression<double>? latitude,
    Expression<double>? longitude,
    Expression<double>? accuracyM,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (recordedAt != null) 'recorded_at': recordedAt,
      if (latitude != null) 'latitude': latitude,
      if (longitude != null) 'longitude': longitude,
      if (accuracyM != null) 'accuracy_m': accuracyM,
      if (rowid != null) 'rowid': rowid,
    });
  }

  GpsPingsCompanion copyWith({
    Value<String>? id,
    Value<String>? recordedAt,
    Value<double>? latitude,
    Value<double>? longitude,
    Value<double?>? accuracyM,
    Value<int>? rowid,
  }) {
    return GpsPingsCompanion(
      id: id ?? this.id,
      recordedAt: recordedAt ?? this.recordedAt,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      accuracyM: accuracyM ?? this.accuracyM,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (recordedAt.present) {
      map['recorded_at'] = Variable<String>(recordedAt.value);
    }
    if (latitude.present) {
      map['latitude'] = Variable<double>(latitude.value);
    }
    if (longitude.present) {
      map['longitude'] = Variable<double>(longitude.value);
    }
    if (accuracyM.present) {
      map['accuracy_m'] = Variable<double>(accuracyM.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('GpsPingsCompanion(')
          ..write('id: $id, ')
          ..write('recordedAt: $recordedAt, ')
          ..write('latitude: $latitude, ')
          ..write('longitude: $longitude, ')
          ..write('accuracyM: $accuracyM, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $AttachmentsTable extends Attachments
    with TableInfo<$AttachmentsTable, Attachment> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $AttachmentsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _visitIdMeta = const VerificationMeta(
    'visitId',
  );
  @override
  late final GeneratedColumn<String> visitId = GeneratedColumn<String>(
    'visit_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _kindMeta = const VerificationMeta('kind');
  @override
  late final GeneratedColumn<String> kind = GeneratedColumn<String>(
    'kind',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _localPathMeta = const VerificationMeta(
    'localPath',
  );
  @override
  late final GeneratedColumn<String> localPath = GeneratedColumn<String>(
    'local_path',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _contentTypeMeta = const VerificationMeta(
    'contentType',
  );
  @override
  late final GeneratedColumn<String> contentType = GeneratedColumn<String>(
    'content_type',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _sizeBytesMeta = const VerificationMeta(
    'sizeBytes',
  );
  @override
  late final GeneratedColumn<int> sizeBytes = GeneratedColumn<int>(
    'size_bytes',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _sha256Meta = const VerificationMeta('sha256');
  @override
  late final GeneratedColumn<String> sha256 = GeneratedColumn<String>(
    'sha256',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _capturedAtMeta = const VerificationMeta(
    'capturedAt',
  );
  @override
  late final GeneratedColumn<String> capturedAt = GeneratedColumn<String>(
    'captured_at',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _fileNameMeta = const VerificationMeta(
    'fileName',
  );
  @override
  late final GeneratedColumn<String> fileName = GeneratedColumn<String>(
    'file_name',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _signerNameMeta = const VerificationMeta(
    'signerName',
  );
  @override
  late final GeneratedColumn<String> signerName = GeneratedColumn<String>(
    'signer_name',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _meaningMeta = const VerificationMeta(
    'meaning',
  );
  @override
  late final GeneratedColumn<String> meaning = GeneratedColumn<String>(
    'meaning',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _durationMsMeta = const VerificationMeta(
    'durationMs',
  );
  @override
  late final GeneratedColumn<int> durationMs = GeneratedColumn<int>(
    'duration_ms',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _uploadStatusMeta = const VerificationMeta(
    'uploadStatus',
  );
  @override
  late final GeneratedColumn<String> uploadStatus = GeneratedColumn<String>(
    'upload_status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('pending'),
  );
  static const VerificationMeta _uploadErrorMeta = const VerificationMeta(
    'uploadError',
  );
  @override
  late final GeneratedColumn<String> uploadError = GeneratedColumn<String>(
    'upload_error',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _attemptsMeta = const VerificationMeta(
    'attempts',
  );
  @override
  late final GeneratedColumn<int> attempts = GeneratedColumn<int>(
    'attempts',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _uploadedAtMeta = const VerificationMeta(
    'uploadedAt',
  );
  @override
  late final GeneratedColumn<String> uploadedAt = GeneratedColumn<String>(
    'uploaded_at',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    visitId,
    kind,
    localPath,
    contentType,
    sizeBytes,
    sha256,
    capturedAt,
    fileName,
    signerName,
    meaning,
    durationMs,
    uploadStatus,
    uploadError,
    attempts,
    uploadedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'attachments';
  @override
  VerificationContext validateIntegrity(
    Insertable<Attachment> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('visit_id')) {
      context.handle(
        _visitIdMeta,
        visitId.isAcceptableOrUnknown(data['visit_id']!, _visitIdMeta),
      );
    } else if (isInserting) {
      context.missing(_visitIdMeta);
    }
    if (data.containsKey('kind')) {
      context.handle(
        _kindMeta,
        kind.isAcceptableOrUnknown(data['kind']!, _kindMeta),
      );
    } else if (isInserting) {
      context.missing(_kindMeta);
    }
    if (data.containsKey('local_path')) {
      context.handle(
        _localPathMeta,
        localPath.isAcceptableOrUnknown(data['local_path']!, _localPathMeta),
      );
    } else if (isInserting) {
      context.missing(_localPathMeta);
    }
    if (data.containsKey('content_type')) {
      context.handle(
        _contentTypeMeta,
        contentType.isAcceptableOrUnknown(
          data['content_type']!,
          _contentTypeMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_contentTypeMeta);
    }
    if (data.containsKey('size_bytes')) {
      context.handle(
        _sizeBytesMeta,
        sizeBytes.isAcceptableOrUnknown(data['size_bytes']!, _sizeBytesMeta),
      );
    } else if (isInserting) {
      context.missing(_sizeBytesMeta);
    }
    if (data.containsKey('sha256')) {
      context.handle(
        _sha256Meta,
        sha256.isAcceptableOrUnknown(data['sha256']!, _sha256Meta),
      );
    } else if (isInserting) {
      context.missing(_sha256Meta);
    }
    if (data.containsKey('captured_at')) {
      context.handle(
        _capturedAtMeta,
        capturedAt.isAcceptableOrUnknown(data['captured_at']!, _capturedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_capturedAtMeta);
    }
    if (data.containsKey('file_name')) {
      context.handle(
        _fileNameMeta,
        fileName.isAcceptableOrUnknown(data['file_name']!, _fileNameMeta),
      );
    }
    if (data.containsKey('signer_name')) {
      context.handle(
        _signerNameMeta,
        signerName.isAcceptableOrUnknown(data['signer_name']!, _signerNameMeta),
      );
    }
    if (data.containsKey('meaning')) {
      context.handle(
        _meaningMeta,
        meaning.isAcceptableOrUnknown(data['meaning']!, _meaningMeta),
      );
    }
    if (data.containsKey('duration_ms')) {
      context.handle(
        _durationMsMeta,
        durationMs.isAcceptableOrUnknown(data['duration_ms']!, _durationMsMeta),
      );
    }
    if (data.containsKey('upload_status')) {
      context.handle(
        _uploadStatusMeta,
        uploadStatus.isAcceptableOrUnknown(
          data['upload_status']!,
          _uploadStatusMeta,
        ),
      );
    }
    if (data.containsKey('upload_error')) {
      context.handle(
        _uploadErrorMeta,
        uploadError.isAcceptableOrUnknown(
          data['upload_error']!,
          _uploadErrorMeta,
        ),
      );
    }
    if (data.containsKey('attempts')) {
      context.handle(
        _attemptsMeta,
        attempts.isAcceptableOrUnknown(data['attempts']!, _attemptsMeta),
      );
    }
    if (data.containsKey('uploaded_at')) {
      context.handle(
        _uploadedAtMeta,
        uploadedAt.isAcceptableOrUnknown(data['uploaded_at']!, _uploadedAtMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  Attachment map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return Attachment(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      visitId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}visit_id'],
      )!,
      kind: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}kind'],
      )!,
      localPath: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}local_path'],
      )!,
      contentType: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}content_type'],
      )!,
      sizeBytes: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}size_bytes'],
      )!,
      sha256: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}sha256'],
      )!,
      capturedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}captured_at'],
      )!,
      fileName: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}file_name'],
      ),
      signerName: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}signer_name'],
      ),
      meaning: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}meaning'],
      ),
      durationMs: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}duration_ms'],
      ),
      uploadStatus: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}upload_status'],
      )!,
      uploadError: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}upload_error'],
      ),
      attempts: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}attempts'],
      )!,
      uploadedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}uploaded_at'],
      ),
    );
  }

  @override
  $AttachmentsTable createAlias(String alias) {
    return $AttachmentsTable(attachedDatabase, alias);
  }
}

class Attachment extends DataClass implements Insertable<Attachment> {
  final String id;
  final String visitId;
  final String kind;
  final String localPath;
  final String contentType;
  final int sizeBytes;
  final String sha256;
  final String capturedAt;
  final String? fileName;
  final String? signerName;
  final String? meaning;
  final int? durationMs;
  final String uploadStatus;
  final String? uploadError;
  final int attempts;
  final String? uploadedAt;
  const Attachment({
    required this.id,
    required this.visitId,
    required this.kind,
    required this.localPath,
    required this.contentType,
    required this.sizeBytes,
    required this.sha256,
    required this.capturedAt,
    this.fileName,
    this.signerName,
    this.meaning,
    this.durationMs,
    required this.uploadStatus,
    this.uploadError,
    required this.attempts,
    this.uploadedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['visit_id'] = Variable<String>(visitId);
    map['kind'] = Variable<String>(kind);
    map['local_path'] = Variable<String>(localPath);
    map['content_type'] = Variable<String>(contentType);
    map['size_bytes'] = Variable<int>(sizeBytes);
    map['sha256'] = Variable<String>(sha256);
    map['captured_at'] = Variable<String>(capturedAt);
    if (!nullToAbsent || fileName != null) {
      map['file_name'] = Variable<String>(fileName);
    }
    if (!nullToAbsent || signerName != null) {
      map['signer_name'] = Variable<String>(signerName);
    }
    if (!nullToAbsent || meaning != null) {
      map['meaning'] = Variable<String>(meaning);
    }
    if (!nullToAbsent || durationMs != null) {
      map['duration_ms'] = Variable<int>(durationMs);
    }
    map['upload_status'] = Variable<String>(uploadStatus);
    if (!nullToAbsent || uploadError != null) {
      map['upload_error'] = Variable<String>(uploadError);
    }
    map['attempts'] = Variable<int>(attempts);
    if (!nullToAbsent || uploadedAt != null) {
      map['uploaded_at'] = Variable<String>(uploadedAt);
    }
    return map;
  }

  AttachmentsCompanion toCompanion(bool nullToAbsent) {
    return AttachmentsCompanion(
      id: Value(id),
      visitId: Value(visitId),
      kind: Value(kind),
      localPath: Value(localPath),
      contentType: Value(contentType),
      sizeBytes: Value(sizeBytes),
      sha256: Value(sha256),
      capturedAt: Value(capturedAt),
      fileName: fileName == null && nullToAbsent
          ? const Value.absent()
          : Value(fileName),
      signerName: signerName == null && nullToAbsent
          ? const Value.absent()
          : Value(signerName),
      meaning: meaning == null && nullToAbsent
          ? const Value.absent()
          : Value(meaning),
      durationMs: durationMs == null && nullToAbsent
          ? const Value.absent()
          : Value(durationMs),
      uploadStatus: Value(uploadStatus),
      uploadError: uploadError == null && nullToAbsent
          ? const Value.absent()
          : Value(uploadError),
      attempts: Value(attempts),
      uploadedAt: uploadedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(uploadedAt),
    );
  }

  factory Attachment.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return Attachment(
      id: serializer.fromJson<String>(json['id']),
      visitId: serializer.fromJson<String>(json['visitId']),
      kind: serializer.fromJson<String>(json['kind']),
      localPath: serializer.fromJson<String>(json['localPath']),
      contentType: serializer.fromJson<String>(json['contentType']),
      sizeBytes: serializer.fromJson<int>(json['sizeBytes']),
      sha256: serializer.fromJson<String>(json['sha256']),
      capturedAt: serializer.fromJson<String>(json['capturedAt']),
      fileName: serializer.fromJson<String?>(json['fileName']),
      signerName: serializer.fromJson<String?>(json['signerName']),
      meaning: serializer.fromJson<String?>(json['meaning']),
      durationMs: serializer.fromJson<int?>(json['durationMs']),
      uploadStatus: serializer.fromJson<String>(json['uploadStatus']),
      uploadError: serializer.fromJson<String?>(json['uploadError']),
      attempts: serializer.fromJson<int>(json['attempts']),
      uploadedAt: serializer.fromJson<String?>(json['uploadedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'visitId': serializer.toJson<String>(visitId),
      'kind': serializer.toJson<String>(kind),
      'localPath': serializer.toJson<String>(localPath),
      'contentType': serializer.toJson<String>(contentType),
      'sizeBytes': serializer.toJson<int>(sizeBytes),
      'sha256': serializer.toJson<String>(sha256),
      'capturedAt': serializer.toJson<String>(capturedAt),
      'fileName': serializer.toJson<String?>(fileName),
      'signerName': serializer.toJson<String?>(signerName),
      'meaning': serializer.toJson<String?>(meaning),
      'durationMs': serializer.toJson<int?>(durationMs),
      'uploadStatus': serializer.toJson<String>(uploadStatus),
      'uploadError': serializer.toJson<String?>(uploadError),
      'attempts': serializer.toJson<int>(attempts),
      'uploadedAt': serializer.toJson<String?>(uploadedAt),
    };
  }

  Attachment copyWith({
    String? id,
    String? visitId,
    String? kind,
    String? localPath,
    String? contentType,
    int? sizeBytes,
    String? sha256,
    String? capturedAt,
    Value<String?> fileName = const Value.absent(),
    Value<String?> signerName = const Value.absent(),
    Value<String?> meaning = const Value.absent(),
    Value<int?> durationMs = const Value.absent(),
    String? uploadStatus,
    Value<String?> uploadError = const Value.absent(),
    int? attempts,
    Value<String?> uploadedAt = const Value.absent(),
  }) => Attachment(
    id: id ?? this.id,
    visitId: visitId ?? this.visitId,
    kind: kind ?? this.kind,
    localPath: localPath ?? this.localPath,
    contentType: contentType ?? this.contentType,
    sizeBytes: sizeBytes ?? this.sizeBytes,
    sha256: sha256 ?? this.sha256,
    capturedAt: capturedAt ?? this.capturedAt,
    fileName: fileName.present ? fileName.value : this.fileName,
    signerName: signerName.present ? signerName.value : this.signerName,
    meaning: meaning.present ? meaning.value : this.meaning,
    durationMs: durationMs.present ? durationMs.value : this.durationMs,
    uploadStatus: uploadStatus ?? this.uploadStatus,
    uploadError: uploadError.present ? uploadError.value : this.uploadError,
    attempts: attempts ?? this.attempts,
    uploadedAt: uploadedAt.present ? uploadedAt.value : this.uploadedAt,
  );
  Attachment copyWithCompanion(AttachmentsCompanion data) {
    return Attachment(
      id: data.id.present ? data.id.value : this.id,
      visitId: data.visitId.present ? data.visitId.value : this.visitId,
      kind: data.kind.present ? data.kind.value : this.kind,
      localPath: data.localPath.present ? data.localPath.value : this.localPath,
      contentType: data.contentType.present
          ? data.contentType.value
          : this.contentType,
      sizeBytes: data.sizeBytes.present ? data.sizeBytes.value : this.sizeBytes,
      sha256: data.sha256.present ? data.sha256.value : this.sha256,
      capturedAt: data.capturedAt.present
          ? data.capturedAt.value
          : this.capturedAt,
      fileName: data.fileName.present ? data.fileName.value : this.fileName,
      signerName: data.signerName.present
          ? data.signerName.value
          : this.signerName,
      meaning: data.meaning.present ? data.meaning.value : this.meaning,
      durationMs: data.durationMs.present
          ? data.durationMs.value
          : this.durationMs,
      uploadStatus: data.uploadStatus.present
          ? data.uploadStatus.value
          : this.uploadStatus,
      uploadError: data.uploadError.present
          ? data.uploadError.value
          : this.uploadError,
      attempts: data.attempts.present ? data.attempts.value : this.attempts,
      uploadedAt: data.uploadedAt.present
          ? data.uploadedAt.value
          : this.uploadedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Attachment(')
          ..write('id: $id, ')
          ..write('visitId: $visitId, ')
          ..write('kind: $kind, ')
          ..write('localPath: $localPath, ')
          ..write('contentType: $contentType, ')
          ..write('sizeBytes: $sizeBytes, ')
          ..write('sha256: $sha256, ')
          ..write('capturedAt: $capturedAt, ')
          ..write('fileName: $fileName, ')
          ..write('signerName: $signerName, ')
          ..write('meaning: $meaning, ')
          ..write('durationMs: $durationMs, ')
          ..write('uploadStatus: $uploadStatus, ')
          ..write('uploadError: $uploadError, ')
          ..write('attempts: $attempts, ')
          ..write('uploadedAt: $uploadedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    visitId,
    kind,
    localPath,
    contentType,
    sizeBytes,
    sha256,
    capturedAt,
    fileName,
    signerName,
    meaning,
    durationMs,
    uploadStatus,
    uploadError,
    attempts,
    uploadedAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Attachment &&
          other.id == this.id &&
          other.visitId == this.visitId &&
          other.kind == this.kind &&
          other.localPath == this.localPath &&
          other.contentType == this.contentType &&
          other.sizeBytes == this.sizeBytes &&
          other.sha256 == this.sha256 &&
          other.capturedAt == this.capturedAt &&
          other.fileName == this.fileName &&
          other.signerName == this.signerName &&
          other.meaning == this.meaning &&
          other.durationMs == this.durationMs &&
          other.uploadStatus == this.uploadStatus &&
          other.uploadError == this.uploadError &&
          other.attempts == this.attempts &&
          other.uploadedAt == this.uploadedAt);
}

class AttachmentsCompanion extends UpdateCompanion<Attachment> {
  final Value<String> id;
  final Value<String> visitId;
  final Value<String> kind;
  final Value<String> localPath;
  final Value<String> contentType;
  final Value<int> sizeBytes;
  final Value<String> sha256;
  final Value<String> capturedAt;
  final Value<String?> fileName;
  final Value<String?> signerName;
  final Value<String?> meaning;
  final Value<int?> durationMs;
  final Value<String> uploadStatus;
  final Value<String?> uploadError;
  final Value<int> attempts;
  final Value<String?> uploadedAt;
  final Value<int> rowid;
  const AttachmentsCompanion({
    this.id = const Value.absent(),
    this.visitId = const Value.absent(),
    this.kind = const Value.absent(),
    this.localPath = const Value.absent(),
    this.contentType = const Value.absent(),
    this.sizeBytes = const Value.absent(),
    this.sha256 = const Value.absent(),
    this.capturedAt = const Value.absent(),
    this.fileName = const Value.absent(),
    this.signerName = const Value.absent(),
    this.meaning = const Value.absent(),
    this.durationMs = const Value.absent(),
    this.uploadStatus = const Value.absent(),
    this.uploadError = const Value.absent(),
    this.attempts = const Value.absent(),
    this.uploadedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  AttachmentsCompanion.insert({
    required String id,
    required String visitId,
    required String kind,
    required String localPath,
    required String contentType,
    required int sizeBytes,
    required String sha256,
    required String capturedAt,
    this.fileName = const Value.absent(),
    this.signerName = const Value.absent(),
    this.meaning = const Value.absent(),
    this.durationMs = const Value.absent(),
    this.uploadStatus = const Value.absent(),
    this.uploadError = const Value.absent(),
    this.attempts = const Value.absent(),
    this.uploadedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       visitId = Value(visitId),
       kind = Value(kind),
       localPath = Value(localPath),
       contentType = Value(contentType),
       sizeBytes = Value(sizeBytes),
       sha256 = Value(sha256),
       capturedAt = Value(capturedAt);
  static Insertable<Attachment> custom({
    Expression<String>? id,
    Expression<String>? visitId,
    Expression<String>? kind,
    Expression<String>? localPath,
    Expression<String>? contentType,
    Expression<int>? sizeBytes,
    Expression<String>? sha256,
    Expression<String>? capturedAt,
    Expression<String>? fileName,
    Expression<String>? signerName,
    Expression<String>? meaning,
    Expression<int>? durationMs,
    Expression<String>? uploadStatus,
    Expression<String>? uploadError,
    Expression<int>? attempts,
    Expression<String>? uploadedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (visitId != null) 'visit_id': visitId,
      if (kind != null) 'kind': kind,
      if (localPath != null) 'local_path': localPath,
      if (contentType != null) 'content_type': contentType,
      if (sizeBytes != null) 'size_bytes': sizeBytes,
      if (sha256 != null) 'sha256': sha256,
      if (capturedAt != null) 'captured_at': capturedAt,
      if (fileName != null) 'file_name': fileName,
      if (signerName != null) 'signer_name': signerName,
      if (meaning != null) 'meaning': meaning,
      if (durationMs != null) 'duration_ms': durationMs,
      if (uploadStatus != null) 'upload_status': uploadStatus,
      if (uploadError != null) 'upload_error': uploadError,
      if (attempts != null) 'attempts': attempts,
      if (uploadedAt != null) 'uploaded_at': uploadedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  AttachmentsCompanion copyWith({
    Value<String>? id,
    Value<String>? visitId,
    Value<String>? kind,
    Value<String>? localPath,
    Value<String>? contentType,
    Value<int>? sizeBytes,
    Value<String>? sha256,
    Value<String>? capturedAt,
    Value<String?>? fileName,
    Value<String?>? signerName,
    Value<String?>? meaning,
    Value<int?>? durationMs,
    Value<String>? uploadStatus,
    Value<String?>? uploadError,
    Value<int>? attempts,
    Value<String?>? uploadedAt,
    Value<int>? rowid,
  }) {
    return AttachmentsCompanion(
      id: id ?? this.id,
      visitId: visitId ?? this.visitId,
      kind: kind ?? this.kind,
      localPath: localPath ?? this.localPath,
      contentType: contentType ?? this.contentType,
      sizeBytes: sizeBytes ?? this.sizeBytes,
      sha256: sha256 ?? this.sha256,
      capturedAt: capturedAt ?? this.capturedAt,
      fileName: fileName ?? this.fileName,
      signerName: signerName ?? this.signerName,
      meaning: meaning ?? this.meaning,
      durationMs: durationMs ?? this.durationMs,
      uploadStatus: uploadStatus ?? this.uploadStatus,
      uploadError: uploadError ?? this.uploadError,
      attempts: attempts ?? this.attempts,
      uploadedAt: uploadedAt ?? this.uploadedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (visitId.present) {
      map['visit_id'] = Variable<String>(visitId.value);
    }
    if (kind.present) {
      map['kind'] = Variable<String>(kind.value);
    }
    if (localPath.present) {
      map['local_path'] = Variable<String>(localPath.value);
    }
    if (contentType.present) {
      map['content_type'] = Variable<String>(contentType.value);
    }
    if (sizeBytes.present) {
      map['size_bytes'] = Variable<int>(sizeBytes.value);
    }
    if (sha256.present) {
      map['sha256'] = Variable<String>(sha256.value);
    }
    if (capturedAt.present) {
      map['captured_at'] = Variable<String>(capturedAt.value);
    }
    if (fileName.present) {
      map['file_name'] = Variable<String>(fileName.value);
    }
    if (signerName.present) {
      map['signer_name'] = Variable<String>(signerName.value);
    }
    if (meaning.present) {
      map['meaning'] = Variable<String>(meaning.value);
    }
    if (durationMs.present) {
      map['duration_ms'] = Variable<int>(durationMs.value);
    }
    if (uploadStatus.present) {
      map['upload_status'] = Variable<String>(uploadStatus.value);
    }
    if (uploadError.present) {
      map['upload_error'] = Variable<String>(uploadError.value);
    }
    if (attempts.present) {
      map['attempts'] = Variable<int>(attempts.value);
    }
    if (uploadedAt.present) {
      map['uploaded_at'] = Variable<String>(uploadedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('AttachmentsCompanion(')
          ..write('id: $id, ')
          ..write('visitId: $visitId, ')
          ..write('kind: $kind, ')
          ..write('localPath: $localPath, ')
          ..write('contentType: $contentType, ')
          ..write('sizeBytes: $sizeBytes, ')
          ..write('sha256: $sha256, ')
          ..write('capturedAt: $capturedAt, ')
          ..write('fileName: $fileName, ')
          ..write('signerName: $signerName, ')
          ..write('meaning: $meaning, ')
          ..write('durationMs: $durationMs, ')
          ..write('uploadStatus: $uploadStatus, ')
          ..write('uploadError: $uploadError, ')
          ..write('attempts: $attempts, ')
          ..write('uploadedAt: $uploadedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $SampleStockTable extends SampleStock
    with TableInfo<$SampleStockTable, SampleStockData> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SampleStockTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _batchIdMeta = const VerificationMeta(
    'batchId',
  );
  @override
  late final GeneratedColumn<String> batchId = GeneratedColumn<String>(
    'batch_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _productIdMeta = const VerificationMeta(
    'productId',
  );
  @override
  late final GeneratedColumn<String> productId = GeneratedColumn<String>(
    'product_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _batchNumberMeta = const VerificationMeta(
    'batchNumber',
  );
  @override
  late final GeneratedColumn<String> batchNumber = GeneratedColumn<String>(
    'batch_number',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _expiryDateMeta = const VerificationMeta(
    'expiryDate',
  );
  @override
  late final GeneratedColumn<String> expiryDate = GeneratedColumn<String>(
    'expiry_date',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
    'status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('Active'),
  );
  static const VerificationMeta _quantityMeta = const VerificationMeta(
    'quantity',
  );
  @override
  late final GeneratedColumn<int> quantity = GeneratedColumn<int>(
    'quantity',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    batchId,
    productId,
    batchNumber,
    expiryDate,
    status,
    quantity,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'sample_stock';
  @override
  VerificationContext validateIntegrity(
    Insertable<SampleStockData> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('batch_id')) {
      context.handle(
        _batchIdMeta,
        batchId.isAcceptableOrUnknown(data['batch_id']!, _batchIdMeta),
      );
    } else if (isInserting) {
      context.missing(_batchIdMeta);
    }
    if (data.containsKey('product_id')) {
      context.handle(
        _productIdMeta,
        productId.isAcceptableOrUnknown(data['product_id']!, _productIdMeta),
      );
    } else if (isInserting) {
      context.missing(_productIdMeta);
    }
    if (data.containsKey('batch_number')) {
      context.handle(
        _batchNumberMeta,
        batchNumber.isAcceptableOrUnknown(
          data['batch_number']!,
          _batchNumberMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_batchNumberMeta);
    }
    if (data.containsKey('expiry_date')) {
      context.handle(
        _expiryDateMeta,
        expiryDate.isAcceptableOrUnknown(data['expiry_date']!, _expiryDateMeta),
      );
    } else if (isInserting) {
      context.missing(_expiryDateMeta);
    }
    if (data.containsKey('status')) {
      context.handle(
        _statusMeta,
        status.isAcceptableOrUnknown(data['status']!, _statusMeta),
      );
    }
    if (data.containsKey('quantity')) {
      context.handle(
        _quantityMeta,
        quantity.isAcceptableOrUnknown(data['quantity']!, _quantityMeta),
      );
    } else if (isInserting) {
      context.missing(_quantityMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {batchId};
  @override
  SampleStockData map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return SampleStockData(
      batchId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}batch_id'],
      )!,
      productId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}product_id'],
      )!,
      batchNumber: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}batch_number'],
      )!,
      expiryDate: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}expiry_date'],
      )!,
      status: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}status'],
      )!,
      quantity: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}quantity'],
      )!,
    );
  }

  @override
  $SampleStockTable createAlias(String alias) {
    return $SampleStockTable(attachedDatabase, alias);
  }
}

class SampleStockData extends DataClass implements Insertable<SampleStockData> {
  final String batchId;
  final String productId;
  final String batchNumber;
  final String expiryDate;
  final String status;
  final int quantity;
  const SampleStockData({
    required this.batchId,
    required this.productId,
    required this.batchNumber,
    required this.expiryDate,
    required this.status,
    required this.quantity,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['batch_id'] = Variable<String>(batchId);
    map['product_id'] = Variable<String>(productId);
    map['batch_number'] = Variable<String>(batchNumber);
    map['expiry_date'] = Variable<String>(expiryDate);
    map['status'] = Variable<String>(status);
    map['quantity'] = Variable<int>(quantity);
    return map;
  }

  SampleStockCompanion toCompanion(bool nullToAbsent) {
    return SampleStockCompanion(
      batchId: Value(batchId),
      productId: Value(productId),
      batchNumber: Value(batchNumber),
      expiryDate: Value(expiryDate),
      status: Value(status),
      quantity: Value(quantity),
    );
  }

  factory SampleStockData.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return SampleStockData(
      batchId: serializer.fromJson<String>(json['batchId']),
      productId: serializer.fromJson<String>(json['productId']),
      batchNumber: serializer.fromJson<String>(json['batchNumber']),
      expiryDate: serializer.fromJson<String>(json['expiryDate']),
      status: serializer.fromJson<String>(json['status']),
      quantity: serializer.fromJson<int>(json['quantity']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'batchId': serializer.toJson<String>(batchId),
      'productId': serializer.toJson<String>(productId),
      'batchNumber': serializer.toJson<String>(batchNumber),
      'expiryDate': serializer.toJson<String>(expiryDate),
      'status': serializer.toJson<String>(status),
      'quantity': serializer.toJson<int>(quantity),
    };
  }

  SampleStockData copyWith({
    String? batchId,
    String? productId,
    String? batchNumber,
    String? expiryDate,
    String? status,
    int? quantity,
  }) => SampleStockData(
    batchId: batchId ?? this.batchId,
    productId: productId ?? this.productId,
    batchNumber: batchNumber ?? this.batchNumber,
    expiryDate: expiryDate ?? this.expiryDate,
    status: status ?? this.status,
    quantity: quantity ?? this.quantity,
  );
  SampleStockData copyWithCompanion(SampleStockCompanion data) {
    return SampleStockData(
      batchId: data.batchId.present ? data.batchId.value : this.batchId,
      productId: data.productId.present ? data.productId.value : this.productId,
      batchNumber: data.batchNumber.present
          ? data.batchNumber.value
          : this.batchNumber,
      expiryDate: data.expiryDate.present
          ? data.expiryDate.value
          : this.expiryDate,
      status: data.status.present ? data.status.value : this.status,
      quantity: data.quantity.present ? data.quantity.value : this.quantity,
    );
  }

  @override
  String toString() {
    return (StringBuffer('SampleStockData(')
          ..write('batchId: $batchId, ')
          ..write('productId: $productId, ')
          ..write('batchNumber: $batchNumber, ')
          ..write('expiryDate: $expiryDate, ')
          ..write('status: $status, ')
          ..write('quantity: $quantity')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    batchId,
    productId,
    batchNumber,
    expiryDate,
    status,
    quantity,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is SampleStockData &&
          other.batchId == this.batchId &&
          other.productId == this.productId &&
          other.batchNumber == this.batchNumber &&
          other.expiryDate == this.expiryDate &&
          other.status == this.status &&
          other.quantity == this.quantity);
}

class SampleStockCompanion extends UpdateCompanion<SampleStockData> {
  final Value<String> batchId;
  final Value<String> productId;
  final Value<String> batchNumber;
  final Value<String> expiryDate;
  final Value<String> status;
  final Value<int> quantity;
  final Value<int> rowid;
  const SampleStockCompanion({
    this.batchId = const Value.absent(),
    this.productId = const Value.absent(),
    this.batchNumber = const Value.absent(),
    this.expiryDate = const Value.absent(),
    this.status = const Value.absent(),
    this.quantity = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  SampleStockCompanion.insert({
    required String batchId,
    required String productId,
    required String batchNumber,
    required String expiryDate,
    this.status = const Value.absent(),
    required int quantity,
    this.rowid = const Value.absent(),
  }) : batchId = Value(batchId),
       productId = Value(productId),
       batchNumber = Value(batchNumber),
       expiryDate = Value(expiryDate),
       quantity = Value(quantity);
  static Insertable<SampleStockData> custom({
    Expression<String>? batchId,
    Expression<String>? productId,
    Expression<String>? batchNumber,
    Expression<String>? expiryDate,
    Expression<String>? status,
    Expression<int>? quantity,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (batchId != null) 'batch_id': batchId,
      if (productId != null) 'product_id': productId,
      if (batchNumber != null) 'batch_number': batchNumber,
      if (expiryDate != null) 'expiry_date': expiryDate,
      if (status != null) 'status': status,
      if (quantity != null) 'quantity': quantity,
      if (rowid != null) 'rowid': rowid,
    });
  }

  SampleStockCompanion copyWith({
    Value<String>? batchId,
    Value<String>? productId,
    Value<String>? batchNumber,
    Value<String>? expiryDate,
    Value<String>? status,
    Value<int>? quantity,
    Value<int>? rowid,
  }) {
    return SampleStockCompanion(
      batchId: batchId ?? this.batchId,
      productId: productId ?? this.productId,
      batchNumber: batchNumber ?? this.batchNumber,
      expiryDate: expiryDate ?? this.expiryDate,
      status: status ?? this.status,
      quantity: quantity ?? this.quantity,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (batchId.present) {
      map['batch_id'] = Variable<String>(batchId.value);
    }
    if (productId.present) {
      map['product_id'] = Variable<String>(productId.value);
    }
    if (batchNumber.present) {
      map['batch_number'] = Variable<String>(batchNumber.value);
    }
    if (expiryDate.present) {
      map['expiry_date'] = Variable<String>(expiryDate.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (quantity.present) {
      map['quantity'] = Variable<int>(quantity.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('SampleStockCompanion(')
          ..write('batchId: $batchId, ')
          ..write('productId: $productId, ')
          ..write('batchNumber: $batchNumber, ')
          ..write('expiryDate: $expiryDate, ')
          ..write('status: $status, ')
          ..write('quantity: $quantity, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $SampleDistributionsTable extends SampleDistributions
    with TableInfo<$SampleDistributionsTable, SampleDistribution> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SampleDistributionsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _visitIdMeta = const VerificationMeta(
    'visitId',
  );
  @override
  late final GeneratedColumn<String> visitId = GeneratedColumn<String>(
    'visit_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _customerIdMeta = const VerificationMeta(
    'customerId',
  );
  @override
  late final GeneratedColumn<String> customerId = GeneratedColumn<String>(
    'customer_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _productIdMeta = const VerificationMeta(
    'productId',
  );
  @override
  late final GeneratedColumn<String> productId = GeneratedColumn<String>(
    'product_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _batchIdMeta = const VerificationMeta(
    'batchId',
  );
  @override
  late final GeneratedColumn<String> batchId = GeneratedColumn<String>(
    'batch_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _quantityMeta = const VerificationMeta(
    'quantity',
  );
  @override
  late final GeneratedColumn<int> quantity = GeneratedColumn<int>(
    'quantity',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _distributedAtMeta = const VerificationMeta(
    'distributedAt',
  );
  @override
  late final GeneratedColumn<String> distributedAt = GeneratedColumn<String>(
    'distributed_at',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _signatureAttachmentIdMeta =
      const VerificationMeta('signatureAttachmentId');
  @override
  late final GeneratedColumn<String> signatureAttachmentId =
      GeneratedColumn<String>(
        'signature_attachment_id',
        aliasedName,
        true,
        type: DriftSqlType.string,
        requiredDuringInsert: false,
      );
  static const VerificationMeta _notesMeta = const VerificationMeta('notes');
  @override
  late final GeneratedColumn<String> notes = GeneratedColumn<String>(
    'notes',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
    'status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('pending'),
  );
  static const VerificationMeta _rejectReasonMeta = const VerificationMeta(
    'rejectReason',
  );
  @override
  late final GeneratedColumn<String> rejectReason = GeneratedColumn<String>(
    'reject_reason',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    visitId,
    customerId,
    productId,
    batchId,
    quantity,
    distributedAt,
    signatureAttachmentId,
    notes,
    status,
    rejectReason,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'sample_distributions';
  @override
  VerificationContext validateIntegrity(
    Insertable<SampleDistribution> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('visit_id')) {
      context.handle(
        _visitIdMeta,
        visitId.isAcceptableOrUnknown(data['visit_id']!, _visitIdMeta),
      );
    }
    if (data.containsKey('customer_id')) {
      context.handle(
        _customerIdMeta,
        customerId.isAcceptableOrUnknown(data['customer_id']!, _customerIdMeta),
      );
    } else if (isInserting) {
      context.missing(_customerIdMeta);
    }
    if (data.containsKey('product_id')) {
      context.handle(
        _productIdMeta,
        productId.isAcceptableOrUnknown(data['product_id']!, _productIdMeta),
      );
    } else if (isInserting) {
      context.missing(_productIdMeta);
    }
    if (data.containsKey('batch_id')) {
      context.handle(
        _batchIdMeta,
        batchId.isAcceptableOrUnknown(data['batch_id']!, _batchIdMeta),
      );
    } else if (isInserting) {
      context.missing(_batchIdMeta);
    }
    if (data.containsKey('quantity')) {
      context.handle(
        _quantityMeta,
        quantity.isAcceptableOrUnknown(data['quantity']!, _quantityMeta),
      );
    } else if (isInserting) {
      context.missing(_quantityMeta);
    }
    if (data.containsKey('distributed_at')) {
      context.handle(
        _distributedAtMeta,
        distributedAt.isAcceptableOrUnknown(
          data['distributed_at']!,
          _distributedAtMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_distributedAtMeta);
    }
    if (data.containsKey('signature_attachment_id')) {
      context.handle(
        _signatureAttachmentIdMeta,
        signatureAttachmentId.isAcceptableOrUnknown(
          data['signature_attachment_id']!,
          _signatureAttachmentIdMeta,
        ),
      );
    }
    if (data.containsKey('notes')) {
      context.handle(
        _notesMeta,
        notes.isAcceptableOrUnknown(data['notes']!, _notesMeta),
      );
    }
    if (data.containsKey('status')) {
      context.handle(
        _statusMeta,
        status.isAcceptableOrUnknown(data['status']!, _statusMeta),
      );
    }
    if (data.containsKey('reject_reason')) {
      context.handle(
        _rejectReasonMeta,
        rejectReason.isAcceptableOrUnknown(
          data['reject_reason']!,
          _rejectReasonMeta,
        ),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  SampleDistribution map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return SampleDistribution(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      visitId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}visit_id'],
      ),
      customerId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}customer_id'],
      )!,
      productId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}product_id'],
      )!,
      batchId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}batch_id'],
      )!,
      quantity: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}quantity'],
      )!,
      distributedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}distributed_at'],
      )!,
      signatureAttachmentId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}signature_attachment_id'],
      ),
      notes: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}notes'],
      ),
      status: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}status'],
      )!,
      rejectReason: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}reject_reason'],
      ),
    );
  }

  @override
  $SampleDistributionsTable createAlias(String alias) {
    return $SampleDistributionsTable(attachedDatabase, alias);
  }
}

class SampleDistribution extends DataClass
    implements Insertable<SampleDistribution> {
  final String id;
  final String? visitId;
  final String customerId;
  final String productId;
  final String batchId;
  final int quantity;
  final String distributedAt;
  final String? signatureAttachmentId;
  final String? notes;
  final String status;
  final String? rejectReason;
  const SampleDistribution({
    required this.id,
    this.visitId,
    required this.customerId,
    required this.productId,
    required this.batchId,
    required this.quantity,
    required this.distributedAt,
    this.signatureAttachmentId,
    this.notes,
    required this.status,
    this.rejectReason,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    if (!nullToAbsent || visitId != null) {
      map['visit_id'] = Variable<String>(visitId);
    }
    map['customer_id'] = Variable<String>(customerId);
    map['product_id'] = Variable<String>(productId);
    map['batch_id'] = Variable<String>(batchId);
    map['quantity'] = Variable<int>(quantity);
    map['distributed_at'] = Variable<String>(distributedAt);
    if (!nullToAbsent || signatureAttachmentId != null) {
      map['signature_attachment_id'] = Variable<String>(signatureAttachmentId);
    }
    if (!nullToAbsent || notes != null) {
      map['notes'] = Variable<String>(notes);
    }
    map['status'] = Variable<String>(status);
    if (!nullToAbsent || rejectReason != null) {
      map['reject_reason'] = Variable<String>(rejectReason);
    }
    return map;
  }

  SampleDistributionsCompanion toCompanion(bool nullToAbsent) {
    return SampleDistributionsCompanion(
      id: Value(id),
      visitId: visitId == null && nullToAbsent
          ? const Value.absent()
          : Value(visitId),
      customerId: Value(customerId),
      productId: Value(productId),
      batchId: Value(batchId),
      quantity: Value(quantity),
      distributedAt: Value(distributedAt),
      signatureAttachmentId: signatureAttachmentId == null && nullToAbsent
          ? const Value.absent()
          : Value(signatureAttachmentId),
      notes: notes == null && nullToAbsent
          ? const Value.absent()
          : Value(notes),
      status: Value(status),
      rejectReason: rejectReason == null && nullToAbsent
          ? const Value.absent()
          : Value(rejectReason),
    );
  }

  factory SampleDistribution.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return SampleDistribution(
      id: serializer.fromJson<String>(json['id']),
      visitId: serializer.fromJson<String?>(json['visitId']),
      customerId: serializer.fromJson<String>(json['customerId']),
      productId: serializer.fromJson<String>(json['productId']),
      batchId: serializer.fromJson<String>(json['batchId']),
      quantity: serializer.fromJson<int>(json['quantity']),
      distributedAt: serializer.fromJson<String>(json['distributedAt']),
      signatureAttachmentId: serializer.fromJson<String?>(
        json['signatureAttachmentId'],
      ),
      notes: serializer.fromJson<String?>(json['notes']),
      status: serializer.fromJson<String>(json['status']),
      rejectReason: serializer.fromJson<String?>(json['rejectReason']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'visitId': serializer.toJson<String?>(visitId),
      'customerId': serializer.toJson<String>(customerId),
      'productId': serializer.toJson<String>(productId),
      'batchId': serializer.toJson<String>(batchId),
      'quantity': serializer.toJson<int>(quantity),
      'distributedAt': serializer.toJson<String>(distributedAt),
      'signatureAttachmentId': serializer.toJson<String?>(
        signatureAttachmentId,
      ),
      'notes': serializer.toJson<String?>(notes),
      'status': serializer.toJson<String>(status),
      'rejectReason': serializer.toJson<String?>(rejectReason),
    };
  }

  SampleDistribution copyWith({
    String? id,
    Value<String?> visitId = const Value.absent(),
    String? customerId,
    String? productId,
    String? batchId,
    int? quantity,
    String? distributedAt,
    Value<String?> signatureAttachmentId = const Value.absent(),
    Value<String?> notes = const Value.absent(),
    String? status,
    Value<String?> rejectReason = const Value.absent(),
  }) => SampleDistribution(
    id: id ?? this.id,
    visitId: visitId.present ? visitId.value : this.visitId,
    customerId: customerId ?? this.customerId,
    productId: productId ?? this.productId,
    batchId: batchId ?? this.batchId,
    quantity: quantity ?? this.quantity,
    distributedAt: distributedAt ?? this.distributedAt,
    signatureAttachmentId: signatureAttachmentId.present
        ? signatureAttachmentId.value
        : this.signatureAttachmentId,
    notes: notes.present ? notes.value : this.notes,
    status: status ?? this.status,
    rejectReason: rejectReason.present ? rejectReason.value : this.rejectReason,
  );
  SampleDistribution copyWithCompanion(SampleDistributionsCompanion data) {
    return SampleDistribution(
      id: data.id.present ? data.id.value : this.id,
      visitId: data.visitId.present ? data.visitId.value : this.visitId,
      customerId: data.customerId.present
          ? data.customerId.value
          : this.customerId,
      productId: data.productId.present ? data.productId.value : this.productId,
      batchId: data.batchId.present ? data.batchId.value : this.batchId,
      quantity: data.quantity.present ? data.quantity.value : this.quantity,
      distributedAt: data.distributedAt.present
          ? data.distributedAt.value
          : this.distributedAt,
      signatureAttachmentId: data.signatureAttachmentId.present
          ? data.signatureAttachmentId.value
          : this.signatureAttachmentId,
      notes: data.notes.present ? data.notes.value : this.notes,
      status: data.status.present ? data.status.value : this.status,
      rejectReason: data.rejectReason.present
          ? data.rejectReason.value
          : this.rejectReason,
    );
  }

  @override
  String toString() {
    return (StringBuffer('SampleDistribution(')
          ..write('id: $id, ')
          ..write('visitId: $visitId, ')
          ..write('customerId: $customerId, ')
          ..write('productId: $productId, ')
          ..write('batchId: $batchId, ')
          ..write('quantity: $quantity, ')
          ..write('distributedAt: $distributedAt, ')
          ..write('signatureAttachmentId: $signatureAttachmentId, ')
          ..write('notes: $notes, ')
          ..write('status: $status, ')
          ..write('rejectReason: $rejectReason')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    visitId,
    customerId,
    productId,
    batchId,
    quantity,
    distributedAt,
    signatureAttachmentId,
    notes,
    status,
    rejectReason,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is SampleDistribution &&
          other.id == this.id &&
          other.visitId == this.visitId &&
          other.customerId == this.customerId &&
          other.productId == this.productId &&
          other.batchId == this.batchId &&
          other.quantity == this.quantity &&
          other.distributedAt == this.distributedAt &&
          other.signatureAttachmentId == this.signatureAttachmentId &&
          other.notes == this.notes &&
          other.status == this.status &&
          other.rejectReason == this.rejectReason);
}

class SampleDistributionsCompanion extends UpdateCompanion<SampleDistribution> {
  final Value<String> id;
  final Value<String?> visitId;
  final Value<String> customerId;
  final Value<String> productId;
  final Value<String> batchId;
  final Value<int> quantity;
  final Value<String> distributedAt;
  final Value<String?> signatureAttachmentId;
  final Value<String?> notes;
  final Value<String> status;
  final Value<String?> rejectReason;
  final Value<int> rowid;
  const SampleDistributionsCompanion({
    this.id = const Value.absent(),
    this.visitId = const Value.absent(),
    this.customerId = const Value.absent(),
    this.productId = const Value.absent(),
    this.batchId = const Value.absent(),
    this.quantity = const Value.absent(),
    this.distributedAt = const Value.absent(),
    this.signatureAttachmentId = const Value.absent(),
    this.notes = const Value.absent(),
    this.status = const Value.absent(),
    this.rejectReason = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  SampleDistributionsCompanion.insert({
    required String id,
    this.visitId = const Value.absent(),
    required String customerId,
    required String productId,
    required String batchId,
    required int quantity,
    required String distributedAt,
    this.signatureAttachmentId = const Value.absent(),
    this.notes = const Value.absent(),
    this.status = const Value.absent(),
    this.rejectReason = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       customerId = Value(customerId),
       productId = Value(productId),
       batchId = Value(batchId),
       quantity = Value(quantity),
       distributedAt = Value(distributedAt);
  static Insertable<SampleDistribution> custom({
    Expression<String>? id,
    Expression<String>? visitId,
    Expression<String>? customerId,
    Expression<String>? productId,
    Expression<String>? batchId,
    Expression<int>? quantity,
    Expression<String>? distributedAt,
    Expression<String>? signatureAttachmentId,
    Expression<String>? notes,
    Expression<String>? status,
    Expression<String>? rejectReason,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (visitId != null) 'visit_id': visitId,
      if (customerId != null) 'customer_id': customerId,
      if (productId != null) 'product_id': productId,
      if (batchId != null) 'batch_id': batchId,
      if (quantity != null) 'quantity': quantity,
      if (distributedAt != null) 'distributed_at': distributedAt,
      if (signatureAttachmentId != null)
        'signature_attachment_id': signatureAttachmentId,
      if (notes != null) 'notes': notes,
      if (status != null) 'status': status,
      if (rejectReason != null) 'reject_reason': rejectReason,
      if (rowid != null) 'rowid': rowid,
    });
  }

  SampleDistributionsCompanion copyWith({
    Value<String>? id,
    Value<String?>? visitId,
    Value<String>? customerId,
    Value<String>? productId,
    Value<String>? batchId,
    Value<int>? quantity,
    Value<String>? distributedAt,
    Value<String?>? signatureAttachmentId,
    Value<String?>? notes,
    Value<String>? status,
    Value<String?>? rejectReason,
    Value<int>? rowid,
  }) {
    return SampleDistributionsCompanion(
      id: id ?? this.id,
      visitId: visitId ?? this.visitId,
      customerId: customerId ?? this.customerId,
      productId: productId ?? this.productId,
      batchId: batchId ?? this.batchId,
      quantity: quantity ?? this.quantity,
      distributedAt: distributedAt ?? this.distributedAt,
      signatureAttachmentId:
          signatureAttachmentId ?? this.signatureAttachmentId,
      notes: notes ?? this.notes,
      status: status ?? this.status,
      rejectReason: rejectReason ?? this.rejectReason,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (visitId.present) {
      map['visit_id'] = Variable<String>(visitId.value);
    }
    if (customerId.present) {
      map['customer_id'] = Variable<String>(customerId.value);
    }
    if (productId.present) {
      map['product_id'] = Variable<String>(productId.value);
    }
    if (batchId.present) {
      map['batch_id'] = Variable<String>(batchId.value);
    }
    if (quantity.present) {
      map['quantity'] = Variable<int>(quantity.value);
    }
    if (distributedAt.present) {
      map['distributed_at'] = Variable<String>(distributedAt.value);
    }
    if (signatureAttachmentId.present) {
      map['signature_attachment_id'] = Variable<String>(
        signatureAttachmentId.value,
      );
    }
    if (notes.present) {
      map['notes'] = Variable<String>(notes.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (rejectReason.present) {
      map['reject_reason'] = Variable<String>(rejectReason.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('SampleDistributionsCompanion(')
          ..write('id: $id, ')
          ..write('visitId: $visitId, ')
          ..write('customerId: $customerId, ')
          ..write('productId: $productId, ')
          ..write('batchId: $batchId, ')
          ..write('quantity: $quantity, ')
          ..write('distributedAt: $distributedAt, ')
          ..write('signatureAttachmentId: $signatureAttachmentId, ')
          ..write('notes: $notes, ')
          ..write('status: $status, ')
          ..write('rejectReason: $rejectReason, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $SampleRequestsTable extends SampleRequests
    with TableInfo<$SampleRequestsTable, SampleRequest> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SampleRequestsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _productIdMeta = const VerificationMeta(
    'productId',
  );
  @override
  late final GeneratedColumn<String> productId = GeneratedColumn<String>(
    'product_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _quantityMeta = const VerificationMeta(
    'quantity',
  );
  @override
  late final GeneratedColumn<int> quantity = GeneratedColumn<int>(
    'quantity',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _approvedQuantityMeta = const VerificationMeta(
    'approvedQuantity',
  );
  @override
  late final GeneratedColumn<int> approvedQuantity = GeneratedColumn<int>(
    'approved_quantity',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
    'status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('Pending'),
  );
  static const VerificationMeta _notesMeta = const VerificationMeta('notes');
  @override
  late final GeneratedColumn<String> notes = GeneratedColumn<String>(
    'notes',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _decisionNoteMeta = const VerificationMeta(
    'decisionNote',
  );
  @override
  late final GeneratedColumn<String> decisionNote = GeneratedColumn<String>(
    'decision_note',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<String> createdAt = GeneratedColumn<String>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _dirtyMeta = const VerificationMeta('dirty');
  @override
  late final GeneratedColumn<bool> dirty = GeneratedColumn<bool>(
    'dirty',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("dirty" IN (0, 1))',
    ),
    defaultValue: const Constant(true),
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    productId,
    quantity,
    approvedQuantity,
    status,
    notes,
    decisionNote,
    createdAt,
    dirty,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'sample_requests';
  @override
  VerificationContext validateIntegrity(
    Insertable<SampleRequest> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('product_id')) {
      context.handle(
        _productIdMeta,
        productId.isAcceptableOrUnknown(data['product_id']!, _productIdMeta),
      );
    } else if (isInserting) {
      context.missing(_productIdMeta);
    }
    if (data.containsKey('quantity')) {
      context.handle(
        _quantityMeta,
        quantity.isAcceptableOrUnknown(data['quantity']!, _quantityMeta),
      );
    } else if (isInserting) {
      context.missing(_quantityMeta);
    }
    if (data.containsKey('approved_quantity')) {
      context.handle(
        _approvedQuantityMeta,
        approvedQuantity.isAcceptableOrUnknown(
          data['approved_quantity']!,
          _approvedQuantityMeta,
        ),
      );
    }
    if (data.containsKey('status')) {
      context.handle(
        _statusMeta,
        status.isAcceptableOrUnknown(data['status']!, _statusMeta),
      );
    }
    if (data.containsKey('notes')) {
      context.handle(
        _notesMeta,
        notes.isAcceptableOrUnknown(data['notes']!, _notesMeta),
      );
    }
    if (data.containsKey('decision_note')) {
      context.handle(
        _decisionNoteMeta,
        decisionNote.isAcceptableOrUnknown(
          data['decision_note']!,
          _decisionNoteMeta,
        ),
      );
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    if (data.containsKey('dirty')) {
      context.handle(
        _dirtyMeta,
        dirty.isAcceptableOrUnknown(data['dirty']!, _dirtyMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  SampleRequest map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return SampleRequest(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      productId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}product_id'],
      )!,
      quantity: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}quantity'],
      )!,
      approvedQuantity: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}approved_quantity'],
      ),
      status: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}status'],
      )!,
      notes: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}notes'],
      ),
      decisionNote: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}decision_note'],
      ),
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}created_at'],
      )!,
      dirty: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}dirty'],
      )!,
    );
  }

  @override
  $SampleRequestsTable createAlias(String alias) {
    return $SampleRequestsTable(attachedDatabase, alias);
  }
}

class SampleRequest extends DataClass implements Insertable<SampleRequest> {
  final String id;
  final String productId;
  final int quantity;
  final int? approvedQuantity;
  final String status;
  final String? notes;
  final String? decisionNote;
  final String createdAt;
  final bool dirty;
  const SampleRequest({
    required this.id,
    required this.productId,
    required this.quantity,
    this.approvedQuantity,
    required this.status,
    this.notes,
    this.decisionNote,
    required this.createdAt,
    required this.dirty,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['product_id'] = Variable<String>(productId);
    map['quantity'] = Variable<int>(quantity);
    if (!nullToAbsent || approvedQuantity != null) {
      map['approved_quantity'] = Variable<int>(approvedQuantity);
    }
    map['status'] = Variable<String>(status);
    if (!nullToAbsent || notes != null) {
      map['notes'] = Variable<String>(notes);
    }
    if (!nullToAbsent || decisionNote != null) {
      map['decision_note'] = Variable<String>(decisionNote);
    }
    map['created_at'] = Variable<String>(createdAt);
    map['dirty'] = Variable<bool>(dirty);
    return map;
  }

  SampleRequestsCompanion toCompanion(bool nullToAbsent) {
    return SampleRequestsCompanion(
      id: Value(id),
      productId: Value(productId),
      quantity: Value(quantity),
      approvedQuantity: approvedQuantity == null && nullToAbsent
          ? const Value.absent()
          : Value(approvedQuantity),
      status: Value(status),
      notes: notes == null && nullToAbsent
          ? const Value.absent()
          : Value(notes),
      decisionNote: decisionNote == null && nullToAbsent
          ? const Value.absent()
          : Value(decisionNote),
      createdAt: Value(createdAt),
      dirty: Value(dirty),
    );
  }

  factory SampleRequest.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return SampleRequest(
      id: serializer.fromJson<String>(json['id']),
      productId: serializer.fromJson<String>(json['productId']),
      quantity: serializer.fromJson<int>(json['quantity']),
      approvedQuantity: serializer.fromJson<int?>(json['approvedQuantity']),
      status: serializer.fromJson<String>(json['status']),
      notes: serializer.fromJson<String?>(json['notes']),
      decisionNote: serializer.fromJson<String?>(json['decisionNote']),
      createdAt: serializer.fromJson<String>(json['createdAt']),
      dirty: serializer.fromJson<bool>(json['dirty']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'productId': serializer.toJson<String>(productId),
      'quantity': serializer.toJson<int>(quantity),
      'approvedQuantity': serializer.toJson<int?>(approvedQuantity),
      'status': serializer.toJson<String>(status),
      'notes': serializer.toJson<String?>(notes),
      'decisionNote': serializer.toJson<String?>(decisionNote),
      'createdAt': serializer.toJson<String>(createdAt),
      'dirty': serializer.toJson<bool>(dirty),
    };
  }

  SampleRequest copyWith({
    String? id,
    String? productId,
    int? quantity,
    Value<int?> approvedQuantity = const Value.absent(),
    String? status,
    Value<String?> notes = const Value.absent(),
    Value<String?> decisionNote = const Value.absent(),
    String? createdAt,
    bool? dirty,
  }) => SampleRequest(
    id: id ?? this.id,
    productId: productId ?? this.productId,
    quantity: quantity ?? this.quantity,
    approvedQuantity: approvedQuantity.present
        ? approvedQuantity.value
        : this.approvedQuantity,
    status: status ?? this.status,
    notes: notes.present ? notes.value : this.notes,
    decisionNote: decisionNote.present ? decisionNote.value : this.decisionNote,
    createdAt: createdAt ?? this.createdAt,
    dirty: dirty ?? this.dirty,
  );
  SampleRequest copyWithCompanion(SampleRequestsCompanion data) {
    return SampleRequest(
      id: data.id.present ? data.id.value : this.id,
      productId: data.productId.present ? data.productId.value : this.productId,
      quantity: data.quantity.present ? data.quantity.value : this.quantity,
      approvedQuantity: data.approvedQuantity.present
          ? data.approvedQuantity.value
          : this.approvedQuantity,
      status: data.status.present ? data.status.value : this.status,
      notes: data.notes.present ? data.notes.value : this.notes,
      decisionNote: data.decisionNote.present
          ? data.decisionNote.value
          : this.decisionNote,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      dirty: data.dirty.present ? data.dirty.value : this.dirty,
    );
  }

  @override
  String toString() {
    return (StringBuffer('SampleRequest(')
          ..write('id: $id, ')
          ..write('productId: $productId, ')
          ..write('quantity: $quantity, ')
          ..write('approvedQuantity: $approvedQuantity, ')
          ..write('status: $status, ')
          ..write('notes: $notes, ')
          ..write('decisionNote: $decisionNote, ')
          ..write('createdAt: $createdAt, ')
          ..write('dirty: $dirty')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    productId,
    quantity,
    approvedQuantity,
    status,
    notes,
    decisionNote,
    createdAt,
    dirty,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is SampleRequest &&
          other.id == this.id &&
          other.productId == this.productId &&
          other.quantity == this.quantity &&
          other.approvedQuantity == this.approvedQuantity &&
          other.status == this.status &&
          other.notes == this.notes &&
          other.decisionNote == this.decisionNote &&
          other.createdAt == this.createdAt &&
          other.dirty == this.dirty);
}

class SampleRequestsCompanion extends UpdateCompanion<SampleRequest> {
  final Value<String> id;
  final Value<String> productId;
  final Value<int> quantity;
  final Value<int?> approvedQuantity;
  final Value<String> status;
  final Value<String?> notes;
  final Value<String?> decisionNote;
  final Value<String> createdAt;
  final Value<bool> dirty;
  final Value<int> rowid;
  const SampleRequestsCompanion({
    this.id = const Value.absent(),
    this.productId = const Value.absent(),
    this.quantity = const Value.absent(),
    this.approvedQuantity = const Value.absent(),
    this.status = const Value.absent(),
    this.notes = const Value.absent(),
    this.decisionNote = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.dirty = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  SampleRequestsCompanion.insert({
    required String id,
    required String productId,
    required int quantity,
    this.approvedQuantity = const Value.absent(),
    this.status = const Value.absent(),
    this.notes = const Value.absent(),
    this.decisionNote = const Value.absent(),
    required String createdAt,
    this.dirty = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       productId = Value(productId),
       quantity = Value(quantity),
       createdAt = Value(createdAt);
  static Insertable<SampleRequest> custom({
    Expression<String>? id,
    Expression<String>? productId,
    Expression<int>? quantity,
    Expression<int>? approvedQuantity,
    Expression<String>? status,
    Expression<String>? notes,
    Expression<String>? decisionNote,
    Expression<String>? createdAt,
    Expression<bool>? dirty,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (productId != null) 'product_id': productId,
      if (quantity != null) 'quantity': quantity,
      if (approvedQuantity != null) 'approved_quantity': approvedQuantity,
      if (status != null) 'status': status,
      if (notes != null) 'notes': notes,
      if (decisionNote != null) 'decision_note': decisionNote,
      if (createdAt != null) 'created_at': createdAt,
      if (dirty != null) 'dirty': dirty,
      if (rowid != null) 'rowid': rowid,
    });
  }

  SampleRequestsCompanion copyWith({
    Value<String>? id,
    Value<String>? productId,
    Value<int>? quantity,
    Value<int?>? approvedQuantity,
    Value<String>? status,
    Value<String?>? notes,
    Value<String?>? decisionNote,
    Value<String>? createdAt,
    Value<bool>? dirty,
    Value<int>? rowid,
  }) {
    return SampleRequestsCompanion(
      id: id ?? this.id,
      productId: productId ?? this.productId,
      quantity: quantity ?? this.quantity,
      approvedQuantity: approvedQuantity ?? this.approvedQuantity,
      status: status ?? this.status,
      notes: notes ?? this.notes,
      decisionNote: decisionNote ?? this.decisionNote,
      createdAt: createdAt ?? this.createdAt,
      dirty: dirty ?? this.dirty,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (productId.present) {
      map['product_id'] = Variable<String>(productId.value);
    }
    if (quantity.present) {
      map['quantity'] = Variable<int>(quantity.value);
    }
    if (approvedQuantity.present) {
      map['approved_quantity'] = Variable<int>(approvedQuantity.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (notes.present) {
      map['notes'] = Variable<String>(notes.value);
    }
    if (decisionNote.present) {
      map['decision_note'] = Variable<String>(decisionNote.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<String>(createdAt.value);
    }
    if (dirty.present) {
      map['dirty'] = Variable<bool>(dirty.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('SampleRequestsCompanion(')
          ..write('id: $id, ')
          ..write('productId: $productId, ')
          ..write('quantity: $quantity, ')
          ..write('approvedQuantity: $approvedQuantity, ')
          ..write('status: $status, ')
          ..write('notes: $notes, ')
          ..write('decisionNote: $decisionNote, ')
          ..write('createdAt: $createdAt, ')
          ..write('dirty: $dirty, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $OrdersTable extends Orders with TableInfo<$OrdersTable, Order> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $OrdersTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _customerIdMeta = const VerificationMeta(
    'customerId',
  );
  @override
  late final GeneratedColumn<String> customerId = GeneratedColumn<String>(
    'customer_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _customerNameMeta = const VerificationMeta(
    'customerName',
  );
  @override
  late final GeneratedColumn<String> customerName = GeneratedColumn<String>(
    'customer_name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _numberMeta = const VerificationMeta('number');
  @override
  late final GeneratedColumn<String> number = GeneratedColumn<String>(
    'number',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
    'status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('Placed'),
  );
  static const VerificationMeta _totalMeta = const VerificationMeta('total');
  @override
  late final GeneratedColumn<double> total = GeneratedColumn<double>(
    'total',
    aliasedName,
    false,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _notesMeta = const VerificationMeta('notes');
  @override
  late final GeneratedColumn<String> notes = GeneratedColumn<String>(
    'notes',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _placedAtMeta = const VerificationMeta(
    'placedAt',
  );
  @override
  late final GeneratedColumn<String> placedAt = GeneratedColumn<String>(
    'placed_at',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _cancelReasonMeta = const VerificationMeta(
    'cancelReason',
  );
  @override
  late final GeneratedColumn<String> cancelReason = GeneratedColumn<String>(
    'cancel_reason',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _rejectReasonMeta = const VerificationMeta(
    'rejectReason',
  );
  @override
  late final GeneratedColumn<String> rejectReason = GeneratedColumn<String>(
    'reject_reason',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _creditHoldMeta = const VerificationMeta(
    'creditHold',
  );
  @override
  late final GeneratedColumn<bool> creditHold = GeneratedColumn<bool>(
    'credit_hold',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("credit_hold" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  static const VerificationMeta _holdReasonMeta = const VerificationMeta(
    'holdReason',
  );
  @override
  late final GeneratedColumn<String> holdReason = GeneratedColumn<String>(
    'hold_reason',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _dirtyMeta = const VerificationMeta('dirty');
  @override
  late final GeneratedColumn<bool> dirty = GeneratedColumn<bool>(
    'dirty',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("dirty" IN (0, 1))',
    ),
    defaultValue: const Constant(true),
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    customerId,
    customerName,
    number,
    status,
    total,
    notes,
    placedAt,
    cancelReason,
    rejectReason,
    creditHold,
    holdReason,
    dirty,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'orders';
  @override
  VerificationContext validateIntegrity(
    Insertable<Order> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('customer_id')) {
      context.handle(
        _customerIdMeta,
        customerId.isAcceptableOrUnknown(data['customer_id']!, _customerIdMeta),
      );
    } else if (isInserting) {
      context.missing(_customerIdMeta);
    }
    if (data.containsKey('customer_name')) {
      context.handle(
        _customerNameMeta,
        customerName.isAcceptableOrUnknown(
          data['customer_name']!,
          _customerNameMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_customerNameMeta);
    }
    if (data.containsKey('number')) {
      context.handle(
        _numberMeta,
        number.isAcceptableOrUnknown(data['number']!, _numberMeta),
      );
    }
    if (data.containsKey('status')) {
      context.handle(
        _statusMeta,
        status.isAcceptableOrUnknown(data['status']!, _statusMeta),
      );
    }
    if (data.containsKey('total')) {
      context.handle(
        _totalMeta,
        total.isAcceptableOrUnknown(data['total']!, _totalMeta),
      );
    }
    if (data.containsKey('notes')) {
      context.handle(
        _notesMeta,
        notes.isAcceptableOrUnknown(data['notes']!, _notesMeta),
      );
    }
    if (data.containsKey('placed_at')) {
      context.handle(
        _placedAtMeta,
        placedAt.isAcceptableOrUnknown(data['placed_at']!, _placedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_placedAtMeta);
    }
    if (data.containsKey('cancel_reason')) {
      context.handle(
        _cancelReasonMeta,
        cancelReason.isAcceptableOrUnknown(
          data['cancel_reason']!,
          _cancelReasonMeta,
        ),
      );
    }
    if (data.containsKey('reject_reason')) {
      context.handle(
        _rejectReasonMeta,
        rejectReason.isAcceptableOrUnknown(
          data['reject_reason']!,
          _rejectReasonMeta,
        ),
      );
    }
    if (data.containsKey('credit_hold')) {
      context.handle(
        _creditHoldMeta,
        creditHold.isAcceptableOrUnknown(data['credit_hold']!, _creditHoldMeta),
      );
    }
    if (data.containsKey('hold_reason')) {
      context.handle(
        _holdReasonMeta,
        holdReason.isAcceptableOrUnknown(data['hold_reason']!, _holdReasonMeta),
      );
    }
    if (data.containsKey('dirty')) {
      context.handle(
        _dirtyMeta,
        dirty.isAcceptableOrUnknown(data['dirty']!, _dirtyMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  Order map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return Order(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      customerId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}customer_id'],
      )!,
      customerName: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}customer_name'],
      )!,
      number: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}number'],
      ),
      status: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}status'],
      )!,
      total: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}total'],
      )!,
      notes: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}notes'],
      ),
      placedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}placed_at'],
      )!,
      cancelReason: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}cancel_reason'],
      ),
      rejectReason: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}reject_reason'],
      ),
      creditHold: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}credit_hold'],
      )!,
      holdReason: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}hold_reason'],
      ),
      dirty: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}dirty'],
      )!,
    );
  }

  @override
  $OrdersTable createAlias(String alias) {
    return $OrdersTable(attachedDatabase, alias);
  }
}

class Order extends DataClass implements Insertable<Order> {
  final String id;
  final String customerId;
  final String customerName;
  final String? number;
  final String status;
  final double total;
  final String? notes;
  final String placedAt;
  final String? cancelReason;
  final String? rejectReason;

  /// The server held the order because of the customer's credit; the office releases it.
  final bool creditHold;
  final String? holdReason;
  final bool dirty;
  const Order({
    required this.id,
    required this.customerId,
    required this.customerName,
    this.number,
    required this.status,
    required this.total,
    this.notes,
    required this.placedAt,
    this.cancelReason,
    this.rejectReason,
    required this.creditHold,
    this.holdReason,
    required this.dirty,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['customer_id'] = Variable<String>(customerId);
    map['customer_name'] = Variable<String>(customerName);
    if (!nullToAbsent || number != null) {
      map['number'] = Variable<String>(number);
    }
    map['status'] = Variable<String>(status);
    map['total'] = Variable<double>(total);
    if (!nullToAbsent || notes != null) {
      map['notes'] = Variable<String>(notes);
    }
    map['placed_at'] = Variable<String>(placedAt);
    if (!nullToAbsent || cancelReason != null) {
      map['cancel_reason'] = Variable<String>(cancelReason);
    }
    if (!nullToAbsent || rejectReason != null) {
      map['reject_reason'] = Variable<String>(rejectReason);
    }
    map['credit_hold'] = Variable<bool>(creditHold);
    if (!nullToAbsent || holdReason != null) {
      map['hold_reason'] = Variable<String>(holdReason);
    }
    map['dirty'] = Variable<bool>(dirty);
    return map;
  }

  OrdersCompanion toCompanion(bool nullToAbsent) {
    return OrdersCompanion(
      id: Value(id),
      customerId: Value(customerId),
      customerName: Value(customerName),
      number: number == null && nullToAbsent
          ? const Value.absent()
          : Value(number),
      status: Value(status),
      total: Value(total),
      notes: notes == null && nullToAbsent
          ? const Value.absent()
          : Value(notes),
      placedAt: Value(placedAt),
      cancelReason: cancelReason == null && nullToAbsent
          ? const Value.absent()
          : Value(cancelReason),
      rejectReason: rejectReason == null && nullToAbsent
          ? const Value.absent()
          : Value(rejectReason),
      creditHold: Value(creditHold),
      holdReason: holdReason == null && nullToAbsent
          ? const Value.absent()
          : Value(holdReason),
      dirty: Value(dirty),
    );
  }

  factory Order.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return Order(
      id: serializer.fromJson<String>(json['id']),
      customerId: serializer.fromJson<String>(json['customerId']),
      customerName: serializer.fromJson<String>(json['customerName']),
      number: serializer.fromJson<String?>(json['number']),
      status: serializer.fromJson<String>(json['status']),
      total: serializer.fromJson<double>(json['total']),
      notes: serializer.fromJson<String?>(json['notes']),
      placedAt: serializer.fromJson<String>(json['placedAt']),
      cancelReason: serializer.fromJson<String?>(json['cancelReason']),
      rejectReason: serializer.fromJson<String?>(json['rejectReason']),
      creditHold: serializer.fromJson<bool>(json['creditHold']),
      holdReason: serializer.fromJson<String?>(json['holdReason']),
      dirty: serializer.fromJson<bool>(json['dirty']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'customerId': serializer.toJson<String>(customerId),
      'customerName': serializer.toJson<String>(customerName),
      'number': serializer.toJson<String?>(number),
      'status': serializer.toJson<String>(status),
      'total': serializer.toJson<double>(total),
      'notes': serializer.toJson<String?>(notes),
      'placedAt': serializer.toJson<String>(placedAt),
      'cancelReason': serializer.toJson<String?>(cancelReason),
      'rejectReason': serializer.toJson<String?>(rejectReason),
      'creditHold': serializer.toJson<bool>(creditHold),
      'holdReason': serializer.toJson<String?>(holdReason),
      'dirty': serializer.toJson<bool>(dirty),
    };
  }

  Order copyWith({
    String? id,
    String? customerId,
    String? customerName,
    Value<String?> number = const Value.absent(),
    String? status,
    double? total,
    Value<String?> notes = const Value.absent(),
    String? placedAt,
    Value<String?> cancelReason = const Value.absent(),
    Value<String?> rejectReason = const Value.absent(),
    bool? creditHold,
    Value<String?> holdReason = const Value.absent(),
    bool? dirty,
  }) => Order(
    id: id ?? this.id,
    customerId: customerId ?? this.customerId,
    customerName: customerName ?? this.customerName,
    number: number.present ? number.value : this.number,
    status: status ?? this.status,
    total: total ?? this.total,
    notes: notes.present ? notes.value : this.notes,
    placedAt: placedAt ?? this.placedAt,
    cancelReason: cancelReason.present ? cancelReason.value : this.cancelReason,
    rejectReason: rejectReason.present ? rejectReason.value : this.rejectReason,
    creditHold: creditHold ?? this.creditHold,
    holdReason: holdReason.present ? holdReason.value : this.holdReason,
    dirty: dirty ?? this.dirty,
  );
  Order copyWithCompanion(OrdersCompanion data) {
    return Order(
      id: data.id.present ? data.id.value : this.id,
      customerId: data.customerId.present
          ? data.customerId.value
          : this.customerId,
      customerName: data.customerName.present
          ? data.customerName.value
          : this.customerName,
      number: data.number.present ? data.number.value : this.number,
      status: data.status.present ? data.status.value : this.status,
      total: data.total.present ? data.total.value : this.total,
      notes: data.notes.present ? data.notes.value : this.notes,
      placedAt: data.placedAt.present ? data.placedAt.value : this.placedAt,
      cancelReason: data.cancelReason.present
          ? data.cancelReason.value
          : this.cancelReason,
      rejectReason: data.rejectReason.present
          ? data.rejectReason.value
          : this.rejectReason,
      creditHold: data.creditHold.present
          ? data.creditHold.value
          : this.creditHold,
      holdReason: data.holdReason.present
          ? data.holdReason.value
          : this.holdReason,
      dirty: data.dirty.present ? data.dirty.value : this.dirty,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Order(')
          ..write('id: $id, ')
          ..write('customerId: $customerId, ')
          ..write('customerName: $customerName, ')
          ..write('number: $number, ')
          ..write('status: $status, ')
          ..write('total: $total, ')
          ..write('notes: $notes, ')
          ..write('placedAt: $placedAt, ')
          ..write('cancelReason: $cancelReason, ')
          ..write('rejectReason: $rejectReason, ')
          ..write('creditHold: $creditHold, ')
          ..write('holdReason: $holdReason, ')
          ..write('dirty: $dirty')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    customerId,
    customerName,
    number,
    status,
    total,
    notes,
    placedAt,
    cancelReason,
    rejectReason,
    creditHold,
    holdReason,
    dirty,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Order &&
          other.id == this.id &&
          other.customerId == this.customerId &&
          other.customerName == this.customerName &&
          other.number == this.number &&
          other.status == this.status &&
          other.total == this.total &&
          other.notes == this.notes &&
          other.placedAt == this.placedAt &&
          other.cancelReason == this.cancelReason &&
          other.rejectReason == this.rejectReason &&
          other.creditHold == this.creditHold &&
          other.holdReason == this.holdReason &&
          other.dirty == this.dirty);
}

class OrdersCompanion extends UpdateCompanion<Order> {
  final Value<String> id;
  final Value<String> customerId;
  final Value<String> customerName;
  final Value<String?> number;
  final Value<String> status;
  final Value<double> total;
  final Value<String?> notes;
  final Value<String> placedAt;
  final Value<String?> cancelReason;
  final Value<String?> rejectReason;
  final Value<bool> creditHold;
  final Value<String?> holdReason;
  final Value<bool> dirty;
  final Value<int> rowid;
  const OrdersCompanion({
    this.id = const Value.absent(),
    this.customerId = const Value.absent(),
    this.customerName = const Value.absent(),
    this.number = const Value.absent(),
    this.status = const Value.absent(),
    this.total = const Value.absent(),
    this.notes = const Value.absent(),
    this.placedAt = const Value.absent(),
    this.cancelReason = const Value.absent(),
    this.rejectReason = const Value.absent(),
    this.creditHold = const Value.absent(),
    this.holdReason = const Value.absent(),
    this.dirty = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  OrdersCompanion.insert({
    required String id,
    required String customerId,
    required String customerName,
    this.number = const Value.absent(),
    this.status = const Value.absent(),
    this.total = const Value.absent(),
    this.notes = const Value.absent(),
    required String placedAt,
    this.cancelReason = const Value.absent(),
    this.rejectReason = const Value.absent(),
    this.creditHold = const Value.absent(),
    this.holdReason = const Value.absent(),
    this.dirty = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       customerId = Value(customerId),
       customerName = Value(customerName),
       placedAt = Value(placedAt);
  static Insertable<Order> custom({
    Expression<String>? id,
    Expression<String>? customerId,
    Expression<String>? customerName,
    Expression<String>? number,
    Expression<String>? status,
    Expression<double>? total,
    Expression<String>? notes,
    Expression<String>? placedAt,
    Expression<String>? cancelReason,
    Expression<String>? rejectReason,
    Expression<bool>? creditHold,
    Expression<String>? holdReason,
    Expression<bool>? dirty,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (customerId != null) 'customer_id': customerId,
      if (customerName != null) 'customer_name': customerName,
      if (number != null) 'number': number,
      if (status != null) 'status': status,
      if (total != null) 'total': total,
      if (notes != null) 'notes': notes,
      if (placedAt != null) 'placed_at': placedAt,
      if (cancelReason != null) 'cancel_reason': cancelReason,
      if (rejectReason != null) 'reject_reason': rejectReason,
      if (creditHold != null) 'credit_hold': creditHold,
      if (holdReason != null) 'hold_reason': holdReason,
      if (dirty != null) 'dirty': dirty,
      if (rowid != null) 'rowid': rowid,
    });
  }

  OrdersCompanion copyWith({
    Value<String>? id,
    Value<String>? customerId,
    Value<String>? customerName,
    Value<String?>? number,
    Value<String>? status,
    Value<double>? total,
    Value<String?>? notes,
    Value<String>? placedAt,
    Value<String?>? cancelReason,
    Value<String?>? rejectReason,
    Value<bool>? creditHold,
    Value<String?>? holdReason,
    Value<bool>? dirty,
    Value<int>? rowid,
  }) {
    return OrdersCompanion(
      id: id ?? this.id,
      customerId: customerId ?? this.customerId,
      customerName: customerName ?? this.customerName,
      number: number ?? this.number,
      status: status ?? this.status,
      total: total ?? this.total,
      notes: notes ?? this.notes,
      placedAt: placedAt ?? this.placedAt,
      cancelReason: cancelReason ?? this.cancelReason,
      rejectReason: rejectReason ?? this.rejectReason,
      creditHold: creditHold ?? this.creditHold,
      holdReason: holdReason ?? this.holdReason,
      dirty: dirty ?? this.dirty,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (customerId.present) {
      map['customer_id'] = Variable<String>(customerId.value);
    }
    if (customerName.present) {
      map['customer_name'] = Variable<String>(customerName.value);
    }
    if (number.present) {
      map['number'] = Variable<String>(number.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (total.present) {
      map['total'] = Variable<double>(total.value);
    }
    if (notes.present) {
      map['notes'] = Variable<String>(notes.value);
    }
    if (placedAt.present) {
      map['placed_at'] = Variable<String>(placedAt.value);
    }
    if (cancelReason.present) {
      map['cancel_reason'] = Variable<String>(cancelReason.value);
    }
    if (rejectReason.present) {
      map['reject_reason'] = Variable<String>(rejectReason.value);
    }
    if (creditHold.present) {
      map['credit_hold'] = Variable<bool>(creditHold.value);
    }
    if (holdReason.present) {
      map['hold_reason'] = Variable<String>(holdReason.value);
    }
    if (dirty.present) {
      map['dirty'] = Variable<bool>(dirty.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('OrdersCompanion(')
          ..write('id: $id, ')
          ..write('customerId: $customerId, ')
          ..write('customerName: $customerName, ')
          ..write('number: $number, ')
          ..write('status: $status, ')
          ..write('total: $total, ')
          ..write('notes: $notes, ')
          ..write('placedAt: $placedAt, ')
          ..write('cancelReason: $cancelReason, ')
          ..write('rejectReason: $rejectReason, ')
          ..write('creditHold: $creditHold, ')
          ..write('holdReason: $holdReason, ')
          ..write('dirty: $dirty, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $OrderLinesTable extends OrderLines
    with TableInfo<$OrderLinesTable, OrderLine> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $OrderLinesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _orderIdMeta = const VerificationMeta(
    'orderId',
  );
  @override
  late final GeneratedColumn<String> orderId = GeneratedColumn<String>(
    'order_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _productIdMeta = const VerificationMeta(
    'productId',
  );
  @override
  late final GeneratedColumn<String> productId = GeneratedColumn<String>(
    'product_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _productNameMeta = const VerificationMeta(
    'productName',
  );
  @override
  late final GeneratedColumn<String> productName = GeneratedColumn<String>(
    'product_name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _quantityMeta = const VerificationMeta(
    'quantity',
  );
  @override
  late final GeneratedColumn<int> quantity = GeneratedColumn<int>(
    'quantity',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _unitPriceMeta = const VerificationMeta(
    'unitPrice',
  );
  @override
  late final GeneratedColumn<double> unitPrice = GeneratedColumn<double>(
    'unit_price',
    aliasedName,
    false,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _lineTotalMeta = const VerificationMeta(
    'lineTotal',
  );
  @override
  late final GeneratedColumn<double> lineTotal = GeneratedColumn<double>(
    'line_total',
    aliasedName,
    false,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    orderId,
    productId,
    productName,
    quantity,
    unitPrice,
    lineTotal,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'order_lines';
  @override
  VerificationContext validateIntegrity(
    Insertable<OrderLine> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('order_id')) {
      context.handle(
        _orderIdMeta,
        orderId.isAcceptableOrUnknown(data['order_id']!, _orderIdMeta),
      );
    } else if (isInserting) {
      context.missing(_orderIdMeta);
    }
    if (data.containsKey('product_id')) {
      context.handle(
        _productIdMeta,
        productId.isAcceptableOrUnknown(data['product_id']!, _productIdMeta),
      );
    } else if (isInserting) {
      context.missing(_productIdMeta);
    }
    if (data.containsKey('product_name')) {
      context.handle(
        _productNameMeta,
        productName.isAcceptableOrUnknown(
          data['product_name']!,
          _productNameMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_productNameMeta);
    }
    if (data.containsKey('quantity')) {
      context.handle(
        _quantityMeta,
        quantity.isAcceptableOrUnknown(data['quantity']!, _quantityMeta),
      );
    } else if (isInserting) {
      context.missing(_quantityMeta);
    }
    if (data.containsKey('unit_price')) {
      context.handle(
        _unitPriceMeta,
        unitPrice.isAcceptableOrUnknown(data['unit_price']!, _unitPriceMeta),
      );
    }
    if (data.containsKey('line_total')) {
      context.handle(
        _lineTotalMeta,
        lineTotal.isAcceptableOrUnknown(data['line_total']!, _lineTotalMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  OrderLine map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return OrderLine(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      orderId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}order_id'],
      )!,
      productId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}product_id'],
      )!,
      productName: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}product_name'],
      )!,
      quantity: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}quantity'],
      )!,
      unitPrice: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}unit_price'],
      )!,
      lineTotal: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}line_total'],
      )!,
    );
  }

  @override
  $OrderLinesTable createAlias(String alias) {
    return $OrderLinesTable(attachedDatabase, alias);
  }
}

class OrderLine extends DataClass implements Insertable<OrderLine> {
  final String id;
  final String orderId;
  final String productId;
  final String productName;
  final int quantity;
  final double unitPrice;
  final double lineTotal;
  const OrderLine({
    required this.id,
    required this.orderId,
    required this.productId,
    required this.productName,
    required this.quantity,
    required this.unitPrice,
    required this.lineTotal,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['order_id'] = Variable<String>(orderId);
    map['product_id'] = Variable<String>(productId);
    map['product_name'] = Variable<String>(productName);
    map['quantity'] = Variable<int>(quantity);
    map['unit_price'] = Variable<double>(unitPrice);
    map['line_total'] = Variable<double>(lineTotal);
    return map;
  }

  OrderLinesCompanion toCompanion(bool nullToAbsent) {
    return OrderLinesCompanion(
      id: Value(id),
      orderId: Value(orderId),
      productId: Value(productId),
      productName: Value(productName),
      quantity: Value(quantity),
      unitPrice: Value(unitPrice),
      lineTotal: Value(lineTotal),
    );
  }

  factory OrderLine.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return OrderLine(
      id: serializer.fromJson<String>(json['id']),
      orderId: serializer.fromJson<String>(json['orderId']),
      productId: serializer.fromJson<String>(json['productId']),
      productName: serializer.fromJson<String>(json['productName']),
      quantity: serializer.fromJson<int>(json['quantity']),
      unitPrice: serializer.fromJson<double>(json['unitPrice']),
      lineTotal: serializer.fromJson<double>(json['lineTotal']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'orderId': serializer.toJson<String>(orderId),
      'productId': serializer.toJson<String>(productId),
      'productName': serializer.toJson<String>(productName),
      'quantity': serializer.toJson<int>(quantity),
      'unitPrice': serializer.toJson<double>(unitPrice),
      'lineTotal': serializer.toJson<double>(lineTotal),
    };
  }

  OrderLine copyWith({
    String? id,
    String? orderId,
    String? productId,
    String? productName,
    int? quantity,
    double? unitPrice,
    double? lineTotal,
  }) => OrderLine(
    id: id ?? this.id,
    orderId: orderId ?? this.orderId,
    productId: productId ?? this.productId,
    productName: productName ?? this.productName,
    quantity: quantity ?? this.quantity,
    unitPrice: unitPrice ?? this.unitPrice,
    lineTotal: lineTotal ?? this.lineTotal,
  );
  OrderLine copyWithCompanion(OrderLinesCompanion data) {
    return OrderLine(
      id: data.id.present ? data.id.value : this.id,
      orderId: data.orderId.present ? data.orderId.value : this.orderId,
      productId: data.productId.present ? data.productId.value : this.productId,
      productName: data.productName.present
          ? data.productName.value
          : this.productName,
      quantity: data.quantity.present ? data.quantity.value : this.quantity,
      unitPrice: data.unitPrice.present ? data.unitPrice.value : this.unitPrice,
      lineTotal: data.lineTotal.present ? data.lineTotal.value : this.lineTotal,
    );
  }

  @override
  String toString() {
    return (StringBuffer('OrderLine(')
          ..write('id: $id, ')
          ..write('orderId: $orderId, ')
          ..write('productId: $productId, ')
          ..write('productName: $productName, ')
          ..write('quantity: $quantity, ')
          ..write('unitPrice: $unitPrice, ')
          ..write('lineTotal: $lineTotal')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    orderId,
    productId,
    productName,
    quantity,
    unitPrice,
    lineTotal,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is OrderLine &&
          other.id == this.id &&
          other.orderId == this.orderId &&
          other.productId == this.productId &&
          other.productName == this.productName &&
          other.quantity == this.quantity &&
          other.unitPrice == this.unitPrice &&
          other.lineTotal == this.lineTotal);
}

class OrderLinesCompanion extends UpdateCompanion<OrderLine> {
  final Value<String> id;
  final Value<String> orderId;
  final Value<String> productId;
  final Value<String> productName;
  final Value<int> quantity;
  final Value<double> unitPrice;
  final Value<double> lineTotal;
  final Value<int> rowid;
  const OrderLinesCompanion({
    this.id = const Value.absent(),
    this.orderId = const Value.absent(),
    this.productId = const Value.absent(),
    this.productName = const Value.absent(),
    this.quantity = const Value.absent(),
    this.unitPrice = const Value.absent(),
    this.lineTotal = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  OrderLinesCompanion.insert({
    required String id,
    required String orderId,
    required String productId,
    required String productName,
    required int quantity,
    this.unitPrice = const Value.absent(),
    this.lineTotal = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       orderId = Value(orderId),
       productId = Value(productId),
       productName = Value(productName),
       quantity = Value(quantity);
  static Insertable<OrderLine> custom({
    Expression<String>? id,
    Expression<String>? orderId,
    Expression<String>? productId,
    Expression<String>? productName,
    Expression<int>? quantity,
    Expression<double>? unitPrice,
    Expression<double>? lineTotal,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (orderId != null) 'order_id': orderId,
      if (productId != null) 'product_id': productId,
      if (productName != null) 'product_name': productName,
      if (quantity != null) 'quantity': quantity,
      if (unitPrice != null) 'unit_price': unitPrice,
      if (lineTotal != null) 'line_total': lineTotal,
      if (rowid != null) 'rowid': rowid,
    });
  }

  OrderLinesCompanion copyWith({
    Value<String>? id,
    Value<String>? orderId,
    Value<String>? productId,
    Value<String>? productName,
    Value<int>? quantity,
    Value<double>? unitPrice,
    Value<double>? lineTotal,
    Value<int>? rowid,
  }) {
    return OrderLinesCompanion(
      id: id ?? this.id,
      orderId: orderId ?? this.orderId,
      productId: productId ?? this.productId,
      productName: productName ?? this.productName,
      quantity: quantity ?? this.quantity,
      unitPrice: unitPrice ?? this.unitPrice,
      lineTotal: lineTotal ?? this.lineTotal,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (orderId.present) {
      map['order_id'] = Variable<String>(orderId.value);
    }
    if (productId.present) {
      map['product_id'] = Variable<String>(productId.value);
    }
    if (productName.present) {
      map['product_name'] = Variable<String>(productName.value);
    }
    if (quantity.present) {
      map['quantity'] = Variable<int>(quantity.value);
    }
    if (unitPrice.present) {
      map['unit_price'] = Variable<double>(unitPrice.value);
    }
    if (lineTotal.present) {
      map['line_total'] = Variable<double>(lineTotal.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('OrderLinesCompanion(')
          ..write('id: $id, ')
          ..write('orderId: $orderId, ')
          ..write('productId: $productId, ')
          ..write('productName: $productName, ')
          ..write('quantity: $quantity, ')
          ..write('unitPrice: $unitPrice, ')
          ..write('lineTotal: $lineTotal, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $NextActionsTable extends NextActions
    with TableInfo<$NextActionsTable, NextAction> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $NextActionsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _positionMeta = const VerificationMeta(
    'position',
  );
  @override
  late final GeneratedColumn<int> position = GeneratedColumn<int>(
    'position',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _typeMeta = const VerificationMeta('type');
  @override
  late final GeneratedColumn<String> type = GeneratedColumn<String>(
    'type',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _customerIdMeta = const VerificationMeta(
    'customerId',
  );
  @override
  late final GeneratedColumn<String> customerId = GeneratedColumn<String>(
    'customer_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _titleMeta = const VerificationMeta('title');
  @override
  late final GeneratedColumn<String> title = GeneratedColumn<String>(
    'title',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _reasonMeta = const VerificationMeta('reason');
  @override
  late final GeneratedColumn<String> reason = GeneratedColumn<String>(
    'reason',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _priorityMeta = const VerificationMeta(
    'priority',
  );
  @override
  late final GeneratedColumn<int> priority = GeneratedColumn<int>(
    'priority',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _dueDateMeta = const VerificationMeta(
    'dueDate',
  );
  @override
  late final GeneratedColumn<String> dueDate = GeneratedColumn<String>(
    'due_date',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  @override
  List<GeneratedColumn> get $columns => [
    position,
    type,
    customerId,
    title,
    reason,
    priority,
    dueDate,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'next_actions';
  @override
  VerificationContext validateIntegrity(
    Insertable<NextAction> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('position')) {
      context.handle(
        _positionMeta,
        position.isAcceptableOrUnknown(data['position']!, _positionMeta),
      );
    }
    if (data.containsKey('type')) {
      context.handle(
        _typeMeta,
        type.isAcceptableOrUnknown(data['type']!, _typeMeta),
      );
    } else if (isInserting) {
      context.missing(_typeMeta);
    }
    if (data.containsKey('customer_id')) {
      context.handle(
        _customerIdMeta,
        customerId.isAcceptableOrUnknown(data['customer_id']!, _customerIdMeta),
      );
    }
    if (data.containsKey('title')) {
      context.handle(
        _titleMeta,
        title.isAcceptableOrUnknown(data['title']!, _titleMeta),
      );
    } else if (isInserting) {
      context.missing(_titleMeta);
    }
    if (data.containsKey('reason')) {
      context.handle(
        _reasonMeta,
        reason.isAcceptableOrUnknown(data['reason']!, _reasonMeta),
      );
    } else if (isInserting) {
      context.missing(_reasonMeta);
    }
    if (data.containsKey('priority')) {
      context.handle(
        _priorityMeta,
        priority.isAcceptableOrUnknown(data['priority']!, _priorityMeta),
      );
    } else if (isInserting) {
      context.missing(_priorityMeta);
    }
    if (data.containsKey('due_date')) {
      context.handle(
        _dueDateMeta,
        dueDate.isAcceptableOrUnknown(data['due_date']!, _dueDateMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {position};
  @override
  NextAction map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return NextAction(
      position: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}position'],
      )!,
      type: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}type'],
      )!,
      customerId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}customer_id'],
      ),
      title: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}title'],
      )!,
      reason: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}reason'],
      )!,
      priority: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}priority'],
      )!,
      dueDate: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}due_date'],
      ),
    );
  }

  @override
  $NextActionsTable createAlias(String alias) {
    return $NextActionsTable(attachedDatabase, alias);
  }
}

class NextAction extends DataClass implements Insertable<NextAction> {
  final int position;
  final String type;
  final String? customerId;
  final String title;
  final String reason;
  final int priority;
  final String? dueDate;
  const NextAction({
    required this.position,
    required this.type,
    this.customerId,
    required this.title,
    required this.reason,
    required this.priority,
    this.dueDate,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['position'] = Variable<int>(position);
    map['type'] = Variable<String>(type);
    if (!nullToAbsent || customerId != null) {
      map['customer_id'] = Variable<String>(customerId);
    }
    map['title'] = Variable<String>(title);
    map['reason'] = Variable<String>(reason);
    map['priority'] = Variable<int>(priority);
    if (!nullToAbsent || dueDate != null) {
      map['due_date'] = Variable<String>(dueDate);
    }
    return map;
  }

  NextActionsCompanion toCompanion(bool nullToAbsent) {
    return NextActionsCompanion(
      position: Value(position),
      type: Value(type),
      customerId: customerId == null && nullToAbsent
          ? const Value.absent()
          : Value(customerId),
      title: Value(title),
      reason: Value(reason),
      priority: Value(priority),
      dueDate: dueDate == null && nullToAbsent
          ? const Value.absent()
          : Value(dueDate),
    );
  }

  factory NextAction.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return NextAction(
      position: serializer.fromJson<int>(json['position']),
      type: serializer.fromJson<String>(json['type']),
      customerId: serializer.fromJson<String?>(json['customerId']),
      title: serializer.fromJson<String>(json['title']),
      reason: serializer.fromJson<String>(json['reason']),
      priority: serializer.fromJson<int>(json['priority']),
      dueDate: serializer.fromJson<String?>(json['dueDate']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'position': serializer.toJson<int>(position),
      'type': serializer.toJson<String>(type),
      'customerId': serializer.toJson<String?>(customerId),
      'title': serializer.toJson<String>(title),
      'reason': serializer.toJson<String>(reason),
      'priority': serializer.toJson<int>(priority),
      'dueDate': serializer.toJson<String?>(dueDate),
    };
  }

  NextAction copyWith({
    int? position,
    String? type,
    Value<String?> customerId = const Value.absent(),
    String? title,
    String? reason,
    int? priority,
    Value<String?> dueDate = const Value.absent(),
  }) => NextAction(
    position: position ?? this.position,
    type: type ?? this.type,
    customerId: customerId.present ? customerId.value : this.customerId,
    title: title ?? this.title,
    reason: reason ?? this.reason,
    priority: priority ?? this.priority,
    dueDate: dueDate.present ? dueDate.value : this.dueDate,
  );
  NextAction copyWithCompanion(NextActionsCompanion data) {
    return NextAction(
      position: data.position.present ? data.position.value : this.position,
      type: data.type.present ? data.type.value : this.type,
      customerId: data.customerId.present
          ? data.customerId.value
          : this.customerId,
      title: data.title.present ? data.title.value : this.title,
      reason: data.reason.present ? data.reason.value : this.reason,
      priority: data.priority.present ? data.priority.value : this.priority,
      dueDate: data.dueDate.present ? data.dueDate.value : this.dueDate,
    );
  }

  @override
  String toString() {
    return (StringBuffer('NextAction(')
          ..write('position: $position, ')
          ..write('type: $type, ')
          ..write('customerId: $customerId, ')
          ..write('title: $title, ')
          ..write('reason: $reason, ')
          ..write('priority: $priority, ')
          ..write('dueDate: $dueDate')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(position, type, customerId, title, reason, priority, dueDate);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is NextAction &&
          other.position == this.position &&
          other.type == this.type &&
          other.customerId == this.customerId &&
          other.title == this.title &&
          other.reason == this.reason &&
          other.priority == this.priority &&
          other.dueDate == this.dueDate);
}

class NextActionsCompanion extends UpdateCompanion<NextAction> {
  final Value<int> position;
  final Value<String> type;
  final Value<String?> customerId;
  final Value<String> title;
  final Value<String> reason;
  final Value<int> priority;
  final Value<String?> dueDate;
  const NextActionsCompanion({
    this.position = const Value.absent(),
    this.type = const Value.absent(),
    this.customerId = const Value.absent(),
    this.title = const Value.absent(),
    this.reason = const Value.absent(),
    this.priority = const Value.absent(),
    this.dueDate = const Value.absent(),
  });
  NextActionsCompanion.insert({
    this.position = const Value.absent(),
    required String type,
    this.customerId = const Value.absent(),
    required String title,
    required String reason,
    required int priority,
    this.dueDate = const Value.absent(),
  }) : type = Value(type),
       title = Value(title),
       reason = Value(reason),
       priority = Value(priority);
  static Insertable<NextAction> custom({
    Expression<int>? position,
    Expression<String>? type,
    Expression<String>? customerId,
    Expression<String>? title,
    Expression<String>? reason,
    Expression<int>? priority,
    Expression<String>? dueDate,
  }) {
    return RawValuesInsertable({
      if (position != null) 'position': position,
      if (type != null) 'type': type,
      if (customerId != null) 'customer_id': customerId,
      if (title != null) 'title': title,
      if (reason != null) 'reason': reason,
      if (priority != null) 'priority': priority,
      if (dueDate != null) 'due_date': dueDate,
    });
  }

  NextActionsCompanion copyWith({
    Value<int>? position,
    Value<String>? type,
    Value<String?>? customerId,
    Value<String>? title,
    Value<String>? reason,
    Value<int>? priority,
    Value<String?>? dueDate,
  }) {
    return NextActionsCompanion(
      position: position ?? this.position,
      type: type ?? this.type,
      customerId: customerId ?? this.customerId,
      title: title ?? this.title,
      reason: reason ?? this.reason,
      priority: priority ?? this.priority,
      dueDate: dueDate ?? this.dueDate,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (position.present) {
      map['position'] = Variable<int>(position.value);
    }
    if (type.present) {
      map['type'] = Variable<String>(type.value);
    }
    if (customerId.present) {
      map['customer_id'] = Variable<String>(customerId.value);
    }
    if (title.present) {
      map['title'] = Variable<String>(title.value);
    }
    if (reason.present) {
      map['reason'] = Variable<String>(reason.value);
    }
    if (priority.present) {
      map['priority'] = Variable<int>(priority.value);
    }
    if (dueDate.present) {
      map['due_date'] = Variable<String>(dueDate.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('NextActionsCompanion(')
          ..write('position: $position, ')
          ..write('type: $type, ')
          ..write('customerId: $customerId, ')
          ..write('title: $title, ')
          ..write('reason: $reason, ')
          ..write('priority: $priority, ')
          ..write('dueDate: $dueDate')
          ..write(')'))
        .toString();
  }
}

class $SyncProblemsTable extends SyncProblems
    with TableInfo<$SyncProblemsTable, SyncProblem> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SyncProblemsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _kindMeta = const VerificationMeta('kind');
  @override
  late final GeneratedColumn<String> kind = GeneratedColumn<String>(
    'kind',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _summaryMeta = const VerificationMeta(
    'summary',
  );
  @override
  late final GeneratedColumn<String> summary = GeneratedColumn<String>(
    'summary',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _reasonMeta = const VerificationMeta('reason');
  @override
  late final GeneratedColumn<String> reason = GeneratedColumn<String>(
    'reason',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<String> createdAt = GeneratedColumn<String>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [id, kind, summary, reason, createdAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'sync_problems';
  @override
  VerificationContext validateIntegrity(
    Insertable<SyncProblem> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('kind')) {
      context.handle(
        _kindMeta,
        kind.isAcceptableOrUnknown(data['kind']!, _kindMeta),
      );
    } else if (isInserting) {
      context.missing(_kindMeta);
    }
    if (data.containsKey('summary')) {
      context.handle(
        _summaryMeta,
        summary.isAcceptableOrUnknown(data['summary']!, _summaryMeta),
      );
    } else if (isInserting) {
      context.missing(_summaryMeta);
    }
    if (data.containsKey('reason')) {
      context.handle(
        _reasonMeta,
        reason.isAcceptableOrUnknown(data['reason']!, _reasonMeta),
      );
    } else if (isInserting) {
      context.missing(_reasonMeta);
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  SyncProblem map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return SyncProblem(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      kind: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}kind'],
      )!,
      summary: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}summary'],
      )!,
      reason: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}reason'],
      )!,
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}created_at'],
      )!,
    );
  }

  @override
  $SyncProblemsTable createAlias(String alias) {
    return $SyncProblemsTable(attachedDatabase, alias);
  }
}

class SyncProblem extends DataClass implements Insertable<SyncProblem> {
  final String id;
  final String kind;
  final String summary;
  final String reason;
  final String createdAt;
  const SyncProblem({
    required this.id,
    required this.kind,
    required this.summary,
    required this.reason,
    required this.createdAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['kind'] = Variable<String>(kind);
    map['summary'] = Variable<String>(summary);
    map['reason'] = Variable<String>(reason);
    map['created_at'] = Variable<String>(createdAt);
    return map;
  }

  SyncProblemsCompanion toCompanion(bool nullToAbsent) {
    return SyncProblemsCompanion(
      id: Value(id),
      kind: Value(kind),
      summary: Value(summary),
      reason: Value(reason),
      createdAt: Value(createdAt),
    );
  }

  factory SyncProblem.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return SyncProblem(
      id: serializer.fromJson<String>(json['id']),
      kind: serializer.fromJson<String>(json['kind']),
      summary: serializer.fromJson<String>(json['summary']),
      reason: serializer.fromJson<String>(json['reason']),
      createdAt: serializer.fromJson<String>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'kind': serializer.toJson<String>(kind),
      'summary': serializer.toJson<String>(summary),
      'reason': serializer.toJson<String>(reason),
      'createdAt': serializer.toJson<String>(createdAt),
    };
  }

  SyncProblem copyWith({
    String? id,
    String? kind,
    String? summary,
    String? reason,
    String? createdAt,
  }) => SyncProblem(
    id: id ?? this.id,
    kind: kind ?? this.kind,
    summary: summary ?? this.summary,
    reason: reason ?? this.reason,
    createdAt: createdAt ?? this.createdAt,
  );
  SyncProblem copyWithCompanion(SyncProblemsCompanion data) {
    return SyncProblem(
      id: data.id.present ? data.id.value : this.id,
      kind: data.kind.present ? data.kind.value : this.kind,
      summary: data.summary.present ? data.summary.value : this.summary,
      reason: data.reason.present ? data.reason.value : this.reason,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('SyncProblem(')
          ..write('id: $id, ')
          ..write('kind: $kind, ')
          ..write('summary: $summary, ')
          ..write('reason: $reason, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, kind, summary, reason, createdAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is SyncProblem &&
          other.id == this.id &&
          other.kind == this.kind &&
          other.summary == this.summary &&
          other.reason == this.reason &&
          other.createdAt == this.createdAt);
}

class SyncProblemsCompanion extends UpdateCompanion<SyncProblem> {
  final Value<String> id;
  final Value<String> kind;
  final Value<String> summary;
  final Value<String> reason;
  final Value<String> createdAt;
  final Value<int> rowid;
  const SyncProblemsCompanion({
    this.id = const Value.absent(),
    this.kind = const Value.absent(),
    this.summary = const Value.absent(),
    this.reason = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  SyncProblemsCompanion.insert({
    required String id,
    required String kind,
    required String summary,
    required String reason,
    required String createdAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       kind = Value(kind),
       summary = Value(summary),
       reason = Value(reason),
       createdAt = Value(createdAt);
  static Insertable<SyncProblem> custom({
    Expression<String>? id,
    Expression<String>? kind,
    Expression<String>? summary,
    Expression<String>? reason,
    Expression<String>? createdAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (kind != null) 'kind': kind,
      if (summary != null) 'summary': summary,
      if (reason != null) 'reason': reason,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  SyncProblemsCompanion copyWith({
    Value<String>? id,
    Value<String>? kind,
    Value<String>? summary,
    Value<String>? reason,
    Value<String>? createdAt,
    Value<int>? rowid,
  }) {
    return SyncProblemsCompanion(
      id: id ?? this.id,
      kind: kind ?? this.kind,
      summary: summary ?? this.summary,
      reason: reason ?? this.reason,
      createdAt: createdAt ?? this.createdAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (kind.present) {
      map['kind'] = Variable<String>(kind.value);
    }
    if (summary.present) {
      map['summary'] = Variable<String>(summary.value);
    }
    if (reason.present) {
      map['reason'] = Variable<String>(reason.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<String>(createdAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('SyncProblemsCompanion(')
          ..write('id: $id, ')
          ..write('kind: $kind, ')
          ..write('summary: $summary, ')
          ..write('reason: $reason, ')
          ..write('createdAt: $createdAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $AppNotificationsTable extends AppNotifications
    with TableInfo<$AppNotificationsTable, AppNotification> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $AppNotificationsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _kindMeta = const VerificationMeta('kind');
  @override
  late final GeneratedColumn<String> kind = GeneratedColumn<String>(
    'kind',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _titleMeta = const VerificationMeta('title');
  @override
  late final GeneratedColumn<String> title = GeneratedColumn<String>(
    'title',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _bodyMeta = const VerificationMeta('body');
  @override
  late final GeneratedColumn<String> body = GeneratedColumn<String>(
    'body',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<String> createdAt = GeneratedColumn<String>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _readLocallyMeta = const VerificationMeta(
    'readLocally',
  );
  @override
  late final GeneratedColumn<bool> readLocally = GeneratedColumn<bool>(
    'read_locally',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("read_locally" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    kind,
    title,
    body,
    createdAt,
    readLocally,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'app_notifications';
  @override
  VerificationContext validateIntegrity(
    Insertable<AppNotification> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('kind')) {
      context.handle(
        _kindMeta,
        kind.isAcceptableOrUnknown(data['kind']!, _kindMeta),
      );
    } else if (isInserting) {
      context.missing(_kindMeta);
    }
    if (data.containsKey('title')) {
      context.handle(
        _titleMeta,
        title.isAcceptableOrUnknown(data['title']!, _titleMeta),
      );
    } else if (isInserting) {
      context.missing(_titleMeta);
    }
    if (data.containsKey('body')) {
      context.handle(
        _bodyMeta,
        body.isAcceptableOrUnknown(data['body']!, _bodyMeta),
      );
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    if (data.containsKey('read_locally')) {
      context.handle(
        _readLocallyMeta,
        readLocally.isAcceptableOrUnknown(
          data['read_locally']!,
          _readLocallyMeta,
        ),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  AppNotification map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return AppNotification(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      kind: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}kind'],
      )!,
      title: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}title'],
      )!,
      body: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}body'],
      ),
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}created_at'],
      )!,
      readLocally: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}read_locally'],
      )!,
    );
  }

  @override
  $AppNotificationsTable createAlias(String alias) {
    return $AppNotificationsTable(attachedDatabase, alias);
  }
}

class AppNotification extends DataClass implements Insertable<AppNotification> {
  final String id;
  final String kind;
  final String title;
  final String? body;
  final String createdAt;
  final bool readLocally;
  const AppNotification({
    required this.id,
    required this.kind,
    required this.title,
    this.body,
    required this.createdAt,
    required this.readLocally,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['kind'] = Variable<String>(kind);
    map['title'] = Variable<String>(title);
    if (!nullToAbsent || body != null) {
      map['body'] = Variable<String>(body);
    }
    map['created_at'] = Variable<String>(createdAt);
    map['read_locally'] = Variable<bool>(readLocally);
    return map;
  }

  AppNotificationsCompanion toCompanion(bool nullToAbsent) {
    return AppNotificationsCompanion(
      id: Value(id),
      kind: Value(kind),
      title: Value(title),
      body: body == null && nullToAbsent ? const Value.absent() : Value(body),
      createdAt: Value(createdAt),
      readLocally: Value(readLocally),
    );
  }

  factory AppNotification.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return AppNotification(
      id: serializer.fromJson<String>(json['id']),
      kind: serializer.fromJson<String>(json['kind']),
      title: serializer.fromJson<String>(json['title']),
      body: serializer.fromJson<String?>(json['body']),
      createdAt: serializer.fromJson<String>(json['createdAt']),
      readLocally: serializer.fromJson<bool>(json['readLocally']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'kind': serializer.toJson<String>(kind),
      'title': serializer.toJson<String>(title),
      'body': serializer.toJson<String?>(body),
      'createdAt': serializer.toJson<String>(createdAt),
      'readLocally': serializer.toJson<bool>(readLocally),
    };
  }

  AppNotification copyWith({
    String? id,
    String? kind,
    String? title,
    Value<String?> body = const Value.absent(),
    String? createdAt,
    bool? readLocally,
  }) => AppNotification(
    id: id ?? this.id,
    kind: kind ?? this.kind,
    title: title ?? this.title,
    body: body.present ? body.value : this.body,
    createdAt: createdAt ?? this.createdAt,
    readLocally: readLocally ?? this.readLocally,
  );
  AppNotification copyWithCompanion(AppNotificationsCompanion data) {
    return AppNotification(
      id: data.id.present ? data.id.value : this.id,
      kind: data.kind.present ? data.kind.value : this.kind,
      title: data.title.present ? data.title.value : this.title,
      body: data.body.present ? data.body.value : this.body,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      readLocally: data.readLocally.present
          ? data.readLocally.value
          : this.readLocally,
    );
  }

  @override
  String toString() {
    return (StringBuffer('AppNotification(')
          ..write('id: $id, ')
          ..write('kind: $kind, ')
          ..write('title: $title, ')
          ..write('body: $body, ')
          ..write('createdAt: $createdAt, ')
          ..write('readLocally: $readLocally')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(id, kind, title, body, createdAt, readLocally);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is AppNotification &&
          other.id == this.id &&
          other.kind == this.kind &&
          other.title == this.title &&
          other.body == this.body &&
          other.createdAt == this.createdAt &&
          other.readLocally == this.readLocally);
}

class AppNotificationsCompanion extends UpdateCompanion<AppNotification> {
  final Value<String> id;
  final Value<String> kind;
  final Value<String> title;
  final Value<String?> body;
  final Value<String> createdAt;
  final Value<bool> readLocally;
  final Value<int> rowid;
  const AppNotificationsCompanion({
    this.id = const Value.absent(),
    this.kind = const Value.absent(),
    this.title = const Value.absent(),
    this.body = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.readLocally = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  AppNotificationsCompanion.insert({
    required String id,
    required String kind,
    required String title,
    this.body = const Value.absent(),
    required String createdAt,
    this.readLocally = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       kind = Value(kind),
       title = Value(title),
       createdAt = Value(createdAt);
  static Insertable<AppNotification> custom({
    Expression<String>? id,
    Expression<String>? kind,
    Expression<String>? title,
    Expression<String>? body,
    Expression<String>? createdAt,
    Expression<bool>? readLocally,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (kind != null) 'kind': kind,
      if (title != null) 'title': title,
      if (body != null) 'body': body,
      if (createdAt != null) 'created_at': createdAt,
      if (readLocally != null) 'read_locally': readLocally,
      if (rowid != null) 'rowid': rowid,
    });
  }

  AppNotificationsCompanion copyWith({
    Value<String>? id,
    Value<String>? kind,
    Value<String>? title,
    Value<String?>? body,
    Value<String>? createdAt,
    Value<bool>? readLocally,
    Value<int>? rowid,
  }) {
    return AppNotificationsCompanion(
      id: id ?? this.id,
      kind: kind ?? this.kind,
      title: title ?? this.title,
      body: body ?? this.body,
      createdAt: createdAt ?? this.createdAt,
      readLocally: readLocally ?? this.readLocally,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (kind.present) {
      map['kind'] = Variable<String>(kind.value);
    }
    if (title.present) {
      map['title'] = Variable<String>(title.value);
    }
    if (body.present) {
      map['body'] = Variable<String>(body.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<String>(createdAt.value);
    }
    if (readLocally.present) {
      map['read_locally'] = Variable<bool>(readLocally.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('AppNotificationsCompanion(')
          ..write('id: $id, ')
          ..write('kind: $kind, ')
          ..write('title: $title, ')
          ..write('body: $body, ')
          ..write('createdAt: $createdAt, ')
          ..write('readLocally: $readLocally, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $SyncStateTable extends SyncState
    with TableInfo<$SyncStateTable, SyncStateData> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SyncStateTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _keyMeta = const VerificationMeta('key');
  @override
  late final GeneratedColumn<String> key = GeneratedColumn<String>(
    'key',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _valueMeta = const VerificationMeta('value');
  @override
  late final GeneratedColumn<String> value = GeneratedColumn<String>(
    'value',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [key, value];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'sync_state';
  @override
  VerificationContext validateIntegrity(
    Insertable<SyncStateData> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('key')) {
      context.handle(
        _keyMeta,
        key.isAcceptableOrUnknown(data['key']!, _keyMeta),
      );
    } else if (isInserting) {
      context.missing(_keyMeta);
    }
    if (data.containsKey('value')) {
      context.handle(
        _valueMeta,
        value.isAcceptableOrUnknown(data['value']!, _valueMeta),
      );
    } else if (isInserting) {
      context.missing(_valueMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {key};
  @override
  SyncStateData map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return SyncStateData(
      key: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}key'],
      )!,
      value: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}value'],
      )!,
    );
  }

  @override
  $SyncStateTable createAlias(String alias) {
    return $SyncStateTable(attachedDatabase, alias);
  }
}

class SyncStateData extends DataClass implements Insertable<SyncStateData> {
  final String key;
  final String value;
  const SyncStateData({required this.key, required this.value});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['key'] = Variable<String>(key);
    map['value'] = Variable<String>(value);
    return map;
  }

  SyncStateCompanion toCompanion(bool nullToAbsent) {
    return SyncStateCompanion(key: Value(key), value: Value(value));
  }

  factory SyncStateData.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return SyncStateData(
      key: serializer.fromJson<String>(json['key']),
      value: serializer.fromJson<String>(json['value']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'key': serializer.toJson<String>(key),
      'value': serializer.toJson<String>(value),
    };
  }

  SyncStateData copyWith({String? key, String? value}) =>
      SyncStateData(key: key ?? this.key, value: value ?? this.value);
  SyncStateData copyWithCompanion(SyncStateCompanion data) {
    return SyncStateData(
      key: data.key.present ? data.key.value : this.key,
      value: data.value.present ? data.value.value : this.value,
    );
  }

  @override
  String toString() {
    return (StringBuffer('SyncStateData(')
          ..write('key: $key, ')
          ..write('value: $value')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(key, value);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is SyncStateData &&
          other.key == this.key &&
          other.value == this.value);
}

class SyncStateCompanion extends UpdateCompanion<SyncStateData> {
  final Value<String> key;
  final Value<String> value;
  final Value<int> rowid;
  const SyncStateCompanion({
    this.key = const Value.absent(),
    this.value = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  SyncStateCompanion.insert({
    required String key,
    required String value,
    this.rowid = const Value.absent(),
  }) : key = Value(key),
       value = Value(value);
  static Insertable<SyncStateData> custom({
    Expression<String>? key,
    Expression<String>? value,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (key != null) 'key': key,
      if (value != null) 'value': value,
      if (rowid != null) 'rowid': rowid,
    });
  }

  SyncStateCompanion copyWith({
    Value<String>? key,
    Value<String>? value,
    Value<int>? rowid,
  }) {
    return SyncStateCompanion(
      key: key ?? this.key,
      value: value ?? this.value,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (key.present) {
      map['key'] = Variable<String>(key.value);
    }
    if (value.present) {
      map['value'] = Variable<String>(value.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('SyncStateCompanion(')
          ..write('key: $key, ')
          ..write('value: $value, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final $CustomersTable customers = $CustomersTable(this);
  late final $ProductsTable products = $ProductsTable(this);
  late final $PlannedVisitsTable plannedVisits = $PlannedVisitsTable(this);
  late final $VisitsTable visits = $VisitsTable(this);
  late final $CallReportsTable callReports = $CallReportsTable(this);
  late final $FollowUpTasksTable followUpTasks = $FollowUpTasksTable(this);
  late final $GpsPingsTable gpsPings = $GpsPingsTable(this);
  late final $AttachmentsTable attachments = $AttachmentsTable(this);
  late final $SampleStockTable sampleStock = $SampleStockTable(this);
  late final $SampleDistributionsTable sampleDistributions =
      $SampleDistributionsTable(this);
  late final $SampleRequestsTable sampleRequests = $SampleRequestsTable(this);
  late final $OrdersTable orders = $OrdersTable(this);
  late final $OrderLinesTable orderLines = $OrderLinesTable(this);
  late final $NextActionsTable nextActions = $NextActionsTable(this);
  late final $SyncProblemsTable syncProblems = $SyncProblemsTable(this);
  late final $AppNotificationsTable appNotifications = $AppNotificationsTable(
    this,
  );
  late final $SyncStateTable syncState = $SyncStateTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
    customers,
    products,
    plannedVisits,
    visits,
    callReports,
    followUpTasks,
    gpsPings,
    attachments,
    sampleStock,
    sampleDistributions,
    sampleRequests,
    orders,
    orderLines,
    nextActions,
    syncProblems,
    appNotifications,
    syncState,
  ];
}

typedef $$CustomersTableCreateCompanionBuilder = CustomersCompanion Function({
  required String id,
  required String type,
  required String name,
  Value<String?> specialty,
  Value<String> segment,
  Value<String?> territoryId,
  Value<String?> parentCustomerId,
  Value<String?> phone,
  Value<String?> email,
  Value<String?> address,
  Value<String?> city,
  Value<double?> latitude,
  Value<double?> longitude,
  Value<int> targetVisitsPerMonth,
  Value<bool> dirty,
  Value<int> rowid,
});
typedef $$CustomersTableUpdateCompanionBuilder = CustomersCompanion Function({
  Value<String> id,
  Value<String> type,
  Value<String> name,
  Value<String?> specialty,
  Value<String> segment,
  Value<String?> territoryId,
  Value<String?> parentCustomerId,
  Value<String?> phone,
  Value<String?> email,
  Value<String?> address,
  Value<String?> city,
  Value<double?> latitude,
  Value<double?> longitude,
  Value<int> targetVisitsPerMonth,
  Value<bool> dirty,
  Value<int> rowid,
});

class $$CustomersTableFilterComposer
    extends Composer<_$AppDatabase, $CustomersTable> {
  $$CustomersTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get type => $composableBuilder(
    column: $table.type,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get specialty => $composableBuilder(
    column: $table.specialty,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get segment => $composableBuilder(
    column: $table.segment,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get territoryId => $composableBuilder(
    column: $table.territoryId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get parentCustomerId => $composableBuilder(
    column: $table.parentCustomerId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get phone => $composableBuilder(
    column: $table.phone,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get email => $composableBuilder(
    column: $table.email,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get address => $composableBuilder(
    column: $table.address,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get city => $composableBuilder(
    column: $table.city,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get latitude => $composableBuilder(
    column: $table.latitude,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get longitude => $composableBuilder(
    column: $table.longitude,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get targetVisitsPerMonth => $composableBuilder(
    column: $table.targetVisitsPerMonth,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get dirty => $composableBuilder(
    column: $table.dirty,
    builder: (column) => ColumnFilters(column),
  );
}

class $$CustomersTableOrderingComposer
    extends Composer<_$AppDatabase, $CustomersTable> {
  $$CustomersTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get type => $composableBuilder(
    column: $table.type,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get specialty => $composableBuilder(
    column: $table.specialty,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get segment => $composableBuilder(
    column: $table.segment,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get territoryId => $composableBuilder(
    column: $table.territoryId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get parentCustomerId => $composableBuilder(
    column: $table.parentCustomerId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get phone => $composableBuilder(
    column: $table.phone,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get email => $composableBuilder(
    column: $table.email,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get address => $composableBuilder(
    column: $table.address,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get city => $composableBuilder(
    column: $table.city,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get latitude => $composableBuilder(
    column: $table.latitude,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get longitude => $composableBuilder(
    column: $table.longitude,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get targetVisitsPerMonth => $composableBuilder(
    column: $table.targetVisitsPerMonth,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get dirty => $composableBuilder(
    column: $table.dirty,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$CustomersTableAnnotationComposer
    extends Composer<_$AppDatabase, $CustomersTable> {
  $$CustomersTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get type =>
      $composableBuilder(column: $table.type, builder: (column) => column);

  GeneratedColumn<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<String> get specialty =>
      $composableBuilder(column: $table.specialty, builder: (column) => column);

  GeneratedColumn<String> get segment =>
      $composableBuilder(column: $table.segment, builder: (column) => column);

  GeneratedColumn<String> get territoryId => $composableBuilder(
    column: $table.territoryId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get parentCustomerId => $composableBuilder(
    column: $table.parentCustomerId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get phone =>
      $composableBuilder(column: $table.phone, builder: (column) => column);

  GeneratedColumn<String> get email =>
      $composableBuilder(column: $table.email, builder: (column) => column);

  GeneratedColumn<String> get address =>
      $composableBuilder(column: $table.address, builder: (column) => column);

  GeneratedColumn<String> get city =>
      $composableBuilder(column: $table.city, builder: (column) => column);

  GeneratedColumn<double> get latitude =>
      $composableBuilder(column: $table.latitude, builder: (column) => column);

  GeneratedColumn<double> get longitude =>
      $composableBuilder(column: $table.longitude, builder: (column) => column);

  GeneratedColumn<int> get targetVisitsPerMonth => $composableBuilder(
    column: $table.targetVisitsPerMonth,
    builder: (column) => column,
  );

  GeneratedColumn<bool> get dirty =>
      $composableBuilder(column: $table.dirty, builder: (column) => column);
}

class $$CustomersTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $CustomersTable,
          Customer,
          $$CustomersTableFilterComposer,
          $$CustomersTableOrderingComposer,
          $$CustomersTableAnnotationComposer,
          $$CustomersTableCreateCompanionBuilder,
          $$CustomersTableUpdateCompanionBuilder,
          (Customer, BaseReferences<_$AppDatabase, $CustomersTable, Customer>),
          Customer,
          PrefetchHooks Function()
        > {
  $$CustomersTableTableManager(_$AppDatabase db, $CustomersTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$CustomersTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$CustomersTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$CustomersTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> type = const Value.absent(),
                Value<String> name = const Value.absent(),
                Value<String?> specialty = const Value.absent(),
                Value<String> segment = const Value.absent(),
                Value<String?> territoryId = const Value.absent(),
                Value<String?> parentCustomerId = const Value.absent(),
                Value<String?> phone = const Value.absent(),
                Value<String?> email = const Value.absent(),
                Value<String?> address = const Value.absent(),
                Value<String?> city = const Value.absent(),
                Value<double?> latitude = const Value.absent(),
                Value<double?> longitude = const Value.absent(),
                Value<int> targetVisitsPerMonth = const Value.absent(),
                Value<bool> dirty = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CustomersCompanion(
                id: id,
                type: type,
                name: name,
                specialty: specialty,
                segment: segment,
                territoryId: territoryId,
                parentCustomerId: parentCustomerId,
                phone: phone,
                email: email,
                address: address,
                city: city,
                latitude: latitude,
                longitude: longitude,
                targetVisitsPerMonth: targetVisitsPerMonth,
                dirty: dirty,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String type,
                required String name,
                Value<String?> specialty = const Value.absent(),
                Value<String> segment = const Value.absent(),
                Value<String?> territoryId = const Value.absent(),
                Value<String?> parentCustomerId = const Value.absent(),
                Value<String?> phone = const Value.absent(),
                Value<String?> email = const Value.absent(),
                Value<String?> address = const Value.absent(),
                Value<String?> city = const Value.absent(),
                Value<double?> latitude = const Value.absent(),
                Value<double?> longitude = const Value.absent(),
                Value<int> targetVisitsPerMonth = const Value.absent(),
                Value<bool> dirty = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CustomersCompanion.insert(
                id: id,
                type: type,
                name: name,
                specialty: specialty,
                segment: segment,
                territoryId: territoryId,
                parentCustomerId: parentCustomerId,
                phone: phone,
                email: email,
                address: address,
                city: city,
                latitude: latitude,
                longitude: longitude,
                targetVisitsPerMonth: targetVisitsPerMonth,
                dirty: dirty,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$CustomersTable, Customer>(table),
                  BaseReferences<_$AppDatabase, $CustomersTable, Customer>(
                    db,
                    table,
                    e,
                  ),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$CustomersTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $CustomersTable,
      Customer,
      $$CustomersTableFilterComposer,
      $$CustomersTableOrderingComposer,
      $$CustomersTableAnnotationComposer,
      $$CustomersTableCreateCompanionBuilder,
      $$CustomersTableUpdateCompanionBuilder,
      (Customer, BaseReferences<_$AppDatabase, $CustomersTable, Customer>),
      Customer,
      PrefetchHooks Function()
    >;
typedef $$ProductsTableCreateCompanionBuilder = ProductsCompanion Function({
  required String id,
  required String name,
  Value<String?> code,
  Value<double?> listPrice,
  Value<int> rowid,
});
typedef $$ProductsTableUpdateCompanionBuilder = ProductsCompanion Function({
  Value<String> id,
  Value<String> name,
  Value<String?> code,
  Value<double?> listPrice,
  Value<int> rowid,
});

class $$ProductsTableFilterComposer
    extends Composer<_$AppDatabase, $ProductsTable> {
  $$ProductsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get code => $composableBuilder(
    column: $table.code,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get listPrice => $composableBuilder(
    column: $table.listPrice,
    builder: (column) => ColumnFilters(column),
  );
}

class $$ProductsTableOrderingComposer
    extends Composer<_$AppDatabase, $ProductsTable> {
  $$ProductsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get code => $composableBuilder(
    column: $table.code,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get listPrice => $composableBuilder(
    column: $table.listPrice,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$ProductsTableAnnotationComposer
    extends Composer<_$AppDatabase, $ProductsTable> {
  $$ProductsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<String> get code =>
      $composableBuilder(column: $table.code, builder: (column) => column);

  GeneratedColumn<double> get listPrice =>
      $composableBuilder(column: $table.listPrice, builder: (column) => column);
}

class $$ProductsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $ProductsTable,
          Product,
          $$ProductsTableFilterComposer,
          $$ProductsTableOrderingComposer,
          $$ProductsTableAnnotationComposer,
          $$ProductsTableCreateCompanionBuilder,
          $$ProductsTableUpdateCompanionBuilder,
          (Product, BaseReferences<_$AppDatabase, $ProductsTable, Product>),
          Product,
          PrefetchHooks Function()
        > {
  $$ProductsTableTableManager(_$AppDatabase db, $ProductsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ProductsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ProductsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ProductsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> name = const Value.absent(),
                Value<String?> code = const Value.absent(),
                Value<double?> listPrice = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ProductsCompanion(
                id: id,
                name: name,
                code: code,
                listPrice: listPrice,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String name,
                Value<String?> code = const Value.absent(),
                Value<double?> listPrice = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ProductsCompanion.insert(
                id: id,
                name: name,
                code: code,
                listPrice: listPrice,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$ProductsTable, Product>(table),
                  BaseReferences<_$AppDatabase, $ProductsTable, Product>(
                    db,
                    table,
                    e,
                  ),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$ProductsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $ProductsTable,
      Product,
      $$ProductsTableFilterComposer,
      $$ProductsTableOrderingComposer,
      $$ProductsTableAnnotationComposer,
      $$ProductsTableCreateCompanionBuilder,
      $$ProductsTableUpdateCompanionBuilder,
      (Product, BaseReferences<_$AppDatabase, $ProductsTable, Product>),
      Product,
      PrefetchHooks Function()
    >;
typedef $$PlannedVisitsTableCreateCompanionBuilder =
    PlannedVisitsCompanion Function({
      required String id,
      required String customerId,
      required String plannedDate,
      Value<int> sequence,
      Value<String> status,
      Value<String?> objective,
      Value<bool> dirty,
      Value<int> rowid,
    });
typedef $$PlannedVisitsTableUpdateCompanionBuilder =
    PlannedVisitsCompanion Function({
      Value<String> id,
      Value<String> customerId,
      Value<String> plannedDate,
      Value<int> sequence,
      Value<String> status,
      Value<String?> objective,
      Value<bool> dirty,
      Value<int> rowid,
    });

class $$PlannedVisitsTableFilterComposer
    extends Composer<_$AppDatabase, $PlannedVisitsTable> {
  $$PlannedVisitsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get customerId => $composableBuilder(
    column: $table.customerId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get plannedDate => $composableBuilder(
    column: $table.plannedDate,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get sequence => $composableBuilder(
    column: $table.sequence,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get objective => $composableBuilder(
    column: $table.objective,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get dirty => $composableBuilder(
    column: $table.dirty,
    builder: (column) => ColumnFilters(column),
  );
}

class $$PlannedVisitsTableOrderingComposer
    extends Composer<_$AppDatabase, $PlannedVisitsTable> {
  $$PlannedVisitsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get customerId => $composableBuilder(
    column: $table.customerId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get plannedDate => $composableBuilder(
    column: $table.plannedDate,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get sequence => $composableBuilder(
    column: $table.sequence,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get objective => $composableBuilder(
    column: $table.objective,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get dirty => $composableBuilder(
    column: $table.dirty,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$PlannedVisitsTableAnnotationComposer
    extends Composer<_$AppDatabase, $PlannedVisitsTable> {
  $$PlannedVisitsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get customerId => $composableBuilder(
    column: $table.customerId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get plannedDate => $composableBuilder(
    column: $table.plannedDate,
    builder: (column) => column,
  );

  GeneratedColumn<int> get sequence =>
      $composableBuilder(column: $table.sequence, builder: (column) => column);

  GeneratedColumn<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<String> get objective =>
      $composableBuilder(column: $table.objective, builder: (column) => column);

  GeneratedColumn<bool> get dirty =>
      $composableBuilder(column: $table.dirty, builder: (column) => column);
}

class $$PlannedVisitsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $PlannedVisitsTable,
          PlannedVisit,
          $$PlannedVisitsTableFilterComposer,
          $$PlannedVisitsTableOrderingComposer,
          $$PlannedVisitsTableAnnotationComposer,
          $$PlannedVisitsTableCreateCompanionBuilder,
          $$PlannedVisitsTableUpdateCompanionBuilder,
          (
            PlannedVisit,
            BaseReferences<_$AppDatabase, $PlannedVisitsTable, PlannedVisit>,
          ),
          PlannedVisit,
          PrefetchHooks Function()
        > {
  $$PlannedVisitsTableTableManager(_$AppDatabase db, $PlannedVisitsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$PlannedVisitsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$PlannedVisitsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$PlannedVisitsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> customerId = const Value.absent(),
                Value<String> plannedDate = const Value.absent(),
                Value<int> sequence = const Value.absent(),
                Value<String> status = const Value.absent(),
                Value<String?> objective = const Value.absent(),
                Value<bool> dirty = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => PlannedVisitsCompanion(
                id: id,
                customerId: customerId,
                plannedDate: plannedDate,
                sequence: sequence,
                status: status,
                objective: objective,
                dirty: dirty,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String customerId,
                required String plannedDate,
                Value<int> sequence = const Value.absent(),
                Value<String> status = const Value.absent(),
                Value<String?> objective = const Value.absent(),
                Value<bool> dirty = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => PlannedVisitsCompanion.insert(
                id: id,
                customerId: customerId,
                plannedDate: plannedDate,
                sequence: sequence,
                status: status,
                objective: objective,
                dirty: dirty,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$PlannedVisitsTable, PlannedVisit>(table),
                  BaseReferences<
                    _$AppDatabase,
                    $PlannedVisitsTable,
                    PlannedVisit
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$PlannedVisitsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $PlannedVisitsTable,
      PlannedVisit,
      $$PlannedVisitsTableFilterComposer,
      $$PlannedVisitsTableOrderingComposer,
      $$PlannedVisitsTableAnnotationComposer,
      $$PlannedVisitsTableCreateCompanionBuilder,
      $$PlannedVisitsTableUpdateCompanionBuilder,
      (
        PlannedVisit,
        BaseReferences<_$AppDatabase, $PlannedVisitsTable, PlannedVisit>,
      ),
      PlannedVisit,
      PrefetchHooks Function()
    >;
typedef $$VisitsTableCreateCompanionBuilder = VisitsCompanion Function({
  required String id,
  required String customerId,
  Value<String?> plannedVisitId,
  required String checkInAt,
  Value<double?> checkInLat,
  Value<double?> checkInLng,
  Value<double?> checkInAccuracyM,
  Value<String?> checkOutAt,
  Value<double?> checkOutLat,
  Value<double?> checkOutLng,
  Value<bool> dirty,
  Value<int> rowid,
});
typedef $$VisitsTableUpdateCompanionBuilder = VisitsCompanion Function({
  Value<String> id,
  Value<String> customerId,
  Value<String?> plannedVisitId,
  Value<String> checkInAt,
  Value<double?> checkInLat,
  Value<double?> checkInLng,
  Value<double?> checkInAccuracyM,
  Value<String?> checkOutAt,
  Value<double?> checkOutLat,
  Value<double?> checkOutLng,
  Value<bool> dirty,
  Value<int> rowid,
});

class $$VisitsTableFilterComposer
    extends Composer<_$AppDatabase, $VisitsTable> {
  $$VisitsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get customerId => $composableBuilder(
    column: $table.customerId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get plannedVisitId => $composableBuilder(
    column: $table.plannedVisitId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get checkInAt => $composableBuilder(
    column: $table.checkInAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get checkInLat => $composableBuilder(
    column: $table.checkInLat,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get checkInLng => $composableBuilder(
    column: $table.checkInLng,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get checkInAccuracyM => $composableBuilder(
    column: $table.checkInAccuracyM,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get checkOutAt => $composableBuilder(
    column: $table.checkOutAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get checkOutLat => $composableBuilder(
    column: $table.checkOutLat,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get checkOutLng => $composableBuilder(
    column: $table.checkOutLng,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get dirty => $composableBuilder(
    column: $table.dirty,
    builder: (column) => ColumnFilters(column),
  );
}

class $$VisitsTableOrderingComposer
    extends Composer<_$AppDatabase, $VisitsTable> {
  $$VisitsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get customerId => $composableBuilder(
    column: $table.customerId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get plannedVisitId => $composableBuilder(
    column: $table.plannedVisitId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get checkInAt => $composableBuilder(
    column: $table.checkInAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get checkInLat => $composableBuilder(
    column: $table.checkInLat,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get checkInLng => $composableBuilder(
    column: $table.checkInLng,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get checkInAccuracyM => $composableBuilder(
    column: $table.checkInAccuracyM,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get checkOutAt => $composableBuilder(
    column: $table.checkOutAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get checkOutLat => $composableBuilder(
    column: $table.checkOutLat,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get checkOutLng => $composableBuilder(
    column: $table.checkOutLng,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get dirty => $composableBuilder(
    column: $table.dirty,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$VisitsTableAnnotationComposer
    extends Composer<_$AppDatabase, $VisitsTable> {
  $$VisitsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get customerId => $composableBuilder(
    column: $table.customerId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get plannedVisitId => $composableBuilder(
    column: $table.plannedVisitId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get checkInAt =>
      $composableBuilder(column: $table.checkInAt, builder: (column) => column);

  GeneratedColumn<double> get checkInLat => $composableBuilder(
    column: $table.checkInLat,
    builder: (column) => column,
  );

  GeneratedColumn<double> get checkInLng => $composableBuilder(
    column: $table.checkInLng,
    builder: (column) => column,
  );

  GeneratedColumn<double> get checkInAccuracyM => $composableBuilder(
    column: $table.checkInAccuracyM,
    builder: (column) => column,
  );

  GeneratedColumn<String> get checkOutAt => $composableBuilder(
    column: $table.checkOutAt,
    builder: (column) => column,
  );

  GeneratedColumn<double> get checkOutLat => $composableBuilder(
    column: $table.checkOutLat,
    builder: (column) => column,
  );

  GeneratedColumn<double> get checkOutLng => $composableBuilder(
    column: $table.checkOutLng,
    builder: (column) => column,
  );

  GeneratedColumn<bool> get dirty =>
      $composableBuilder(column: $table.dirty, builder: (column) => column);
}

class $$VisitsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $VisitsTable,
          Visit,
          $$VisitsTableFilterComposer,
          $$VisitsTableOrderingComposer,
          $$VisitsTableAnnotationComposer,
          $$VisitsTableCreateCompanionBuilder,
          $$VisitsTableUpdateCompanionBuilder,
          (Visit, BaseReferences<_$AppDatabase, $VisitsTable, Visit>),
          Visit,
          PrefetchHooks Function()
        > {
  $$VisitsTableTableManager(_$AppDatabase db, $VisitsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$VisitsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$VisitsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$VisitsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> customerId = const Value.absent(),
                Value<String?> plannedVisitId = const Value.absent(),
                Value<String> checkInAt = const Value.absent(),
                Value<double?> checkInLat = const Value.absent(),
                Value<double?> checkInLng = const Value.absent(),
                Value<double?> checkInAccuracyM = const Value.absent(),
                Value<String?> checkOutAt = const Value.absent(),
                Value<double?> checkOutLat = const Value.absent(),
                Value<double?> checkOutLng = const Value.absent(),
                Value<bool> dirty = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => VisitsCompanion(
                id: id,
                customerId: customerId,
                plannedVisitId: plannedVisitId,
                checkInAt: checkInAt,
                checkInLat: checkInLat,
                checkInLng: checkInLng,
                checkInAccuracyM: checkInAccuracyM,
                checkOutAt: checkOutAt,
                checkOutLat: checkOutLat,
                checkOutLng: checkOutLng,
                dirty: dirty,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String customerId,
                Value<String?> plannedVisitId = const Value.absent(),
                required String checkInAt,
                Value<double?> checkInLat = const Value.absent(),
                Value<double?> checkInLng = const Value.absent(),
                Value<double?> checkInAccuracyM = const Value.absent(),
                Value<String?> checkOutAt = const Value.absent(),
                Value<double?> checkOutLat = const Value.absent(),
                Value<double?> checkOutLng = const Value.absent(),
                Value<bool> dirty = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => VisitsCompanion.insert(
                id: id,
                customerId: customerId,
                plannedVisitId: plannedVisitId,
                checkInAt: checkInAt,
                checkInLat: checkInLat,
                checkInLng: checkInLng,
                checkInAccuracyM: checkInAccuracyM,
                checkOutAt: checkOutAt,
                checkOutLat: checkOutLat,
                checkOutLng: checkOutLng,
                dirty: dirty,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$VisitsTable, Visit>(table),
                  BaseReferences<_$AppDatabase, $VisitsTable, Visit>(
                    db,
                    table,
                    e,
                  ),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$VisitsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $VisitsTable,
      Visit,
      $$VisitsTableFilterComposer,
      $$VisitsTableOrderingComposer,
      $$VisitsTableAnnotationComposer,
      $$VisitsTableCreateCompanionBuilder,
      $$VisitsTableUpdateCompanionBuilder,
      (Visit, BaseReferences<_$AppDatabase, $VisitsTable, Visit>),
      Visit,
      PrefetchHooks Function()
    >;
typedef $$CallReportsTableCreateCompanionBuilder =
    CallReportsCompanion Function({
      required String id,
      required String visitId,
      Value<String?> notes,
      Value<String?> outcome,
      Value<String?> nextStep,
      Value<String?> voiceNoteUrl,
      Value<String> productsJson,
      Value<bool> dirty,
      Value<int> rowid,
    });
typedef $$CallReportsTableUpdateCompanionBuilder =
    CallReportsCompanion Function({
      Value<String> id,
      Value<String> visitId,
      Value<String?> notes,
      Value<String?> outcome,
      Value<String?> nextStep,
      Value<String?> voiceNoteUrl,
      Value<String> productsJson,
      Value<bool> dirty,
      Value<int> rowid,
    });

class $$CallReportsTableFilterComposer
    extends Composer<_$AppDatabase, $CallReportsTable> {
  $$CallReportsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get visitId => $composableBuilder(
    column: $table.visitId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get notes => $composableBuilder(
    column: $table.notes,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get outcome => $composableBuilder(
    column: $table.outcome,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get nextStep => $composableBuilder(
    column: $table.nextStep,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get voiceNoteUrl => $composableBuilder(
    column: $table.voiceNoteUrl,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get productsJson => $composableBuilder(
    column: $table.productsJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get dirty => $composableBuilder(
    column: $table.dirty,
    builder: (column) => ColumnFilters(column),
  );
}

class $$CallReportsTableOrderingComposer
    extends Composer<_$AppDatabase, $CallReportsTable> {
  $$CallReportsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get visitId => $composableBuilder(
    column: $table.visitId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get notes => $composableBuilder(
    column: $table.notes,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get outcome => $composableBuilder(
    column: $table.outcome,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get nextStep => $composableBuilder(
    column: $table.nextStep,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get voiceNoteUrl => $composableBuilder(
    column: $table.voiceNoteUrl,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get productsJson => $composableBuilder(
    column: $table.productsJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get dirty => $composableBuilder(
    column: $table.dirty,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$CallReportsTableAnnotationComposer
    extends Composer<_$AppDatabase, $CallReportsTable> {
  $$CallReportsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get visitId =>
      $composableBuilder(column: $table.visitId, builder: (column) => column);

  GeneratedColumn<String> get notes =>
      $composableBuilder(column: $table.notes, builder: (column) => column);

  GeneratedColumn<String> get outcome =>
      $composableBuilder(column: $table.outcome, builder: (column) => column);

  GeneratedColumn<String> get nextStep =>
      $composableBuilder(column: $table.nextStep, builder: (column) => column);

  GeneratedColumn<String> get voiceNoteUrl => $composableBuilder(
    column: $table.voiceNoteUrl,
    builder: (column) => column,
  );

  GeneratedColumn<String> get productsJson => $composableBuilder(
    column: $table.productsJson,
    builder: (column) => column,
  );

  GeneratedColumn<bool> get dirty =>
      $composableBuilder(column: $table.dirty, builder: (column) => column);
}

class $$CallReportsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $CallReportsTable,
          CallReport,
          $$CallReportsTableFilterComposer,
          $$CallReportsTableOrderingComposer,
          $$CallReportsTableAnnotationComposer,
          $$CallReportsTableCreateCompanionBuilder,
          $$CallReportsTableUpdateCompanionBuilder,
          (
            CallReport,
            BaseReferences<_$AppDatabase, $CallReportsTable, CallReport>,
          ),
          CallReport,
          PrefetchHooks Function()
        > {
  $$CallReportsTableTableManager(_$AppDatabase db, $CallReportsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$CallReportsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$CallReportsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$CallReportsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> visitId = const Value.absent(),
                Value<String?> notes = const Value.absent(),
                Value<String?> outcome = const Value.absent(),
                Value<String?> nextStep = const Value.absent(),
                Value<String?> voiceNoteUrl = const Value.absent(),
                Value<String> productsJson = const Value.absent(),
                Value<bool> dirty = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CallReportsCompanion(
                id: id,
                visitId: visitId,
                notes: notes,
                outcome: outcome,
                nextStep: nextStep,
                voiceNoteUrl: voiceNoteUrl,
                productsJson: productsJson,
                dirty: dirty,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String visitId,
                Value<String?> notes = const Value.absent(),
                Value<String?> outcome = const Value.absent(),
                Value<String?> nextStep = const Value.absent(),
                Value<String?> voiceNoteUrl = const Value.absent(),
                Value<String> productsJson = const Value.absent(),
                Value<bool> dirty = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CallReportsCompanion.insert(
                id: id,
                visitId: visitId,
                notes: notes,
                outcome: outcome,
                nextStep: nextStep,
                voiceNoteUrl: voiceNoteUrl,
                productsJson: productsJson,
                dirty: dirty,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$CallReportsTable, CallReport>(table),
                  BaseReferences<_$AppDatabase, $CallReportsTable, CallReport>(
                    db,
                    table,
                    e,
                  ),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$CallReportsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $CallReportsTable,
      CallReport,
      $$CallReportsTableFilterComposer,
      $$CallReportsTableOrderingComposer,
      $$CallReportsTableAnnotationComposer,
      $$CallReportsTableCreateCompanionBuilder,
      $$CallReportsTableUpdateCompanionBuilder,
      (
        CallReport,
        BaseReferences<_$AppDatabase, $CallReportsTable, CallReport>,
      ),
      CallReport,
      PrefetchHooks Function()
    >;
typedef $$FollowUpTasksTableCreateCompanionBuilder =
    FollowUpTasksCompanion Function({
      required String id,
      Value<String?> customerId,
      Value<String?> callReportId,
      required String title,
      Value<String?> dueDate,
      Value<String> status,
      Value<bool> dirty,
      Value<int> rowid,
    });
typedef $$FollowUpTasksTableUpdateCompanionBuilder =
    FollowUpTasksCompanion Function({
      Value<String> id,
      Value<String?> customerId,
      Value<String?> callReportId,
      Value<String> title,
      Value<String?> dueDate,
      Value<String> status,
      Value<bool> dirty,
      Value<int> rowid,
    });

class $$FollowUpTasksTableFilterComposer
    extends Composer<_$AppDatabase, $FollowUpTasksTable> {
  $$FollowUpTasksTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get customerId => $composableBuilder(
    column: $table.customerId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get callReportId => $composableBuilder(
    column: $table.callReportId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get title => $composableBuilder(
    column: $table.title,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get dueDate => $composableBuilder(
    column: $table.dueDate,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get dirty => $composableBuilder(
    column: $table.dirty,
    builder: (column) => ColumnFilters(column),
  );
}

class $$FollowUpTasksTableOrderingComposer
    extends Composer<_$AppDatabase, $FollowUpTasksTable> {
  $$FollowUpTasksTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get customerId => $composableBuilder(
    column: $table.customerId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get callReportId => $composableBuilder(
    column: $table.callReportId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get title => $composableBuilder(
    column: $table.title,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get dueDate => $composableBuilder(
    column: $table.dueDate,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get dirty => $composableBuilder(
    column: $table.dirty,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$FollowUpTasksTableAnnotationComposer
    extends Composer<_$AppDatabase, $FollowUpTasksTable> {
  $$FollowUpTasksTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get customerId => $composableBuilder(
    column: $table.customerId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get callReportId => $composableBuilder(
    column: $table.callReportId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get title =>
      $composableBuilder(column: $table.title, builder: (column) => column);

  GeneratedColumn<String> get dueDate =>
      $composableBuilder(column: $table.dueDate, builder: (column) => column);

  GeneratedColumn<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<bool> get dirty =>
      $composableBuilder(column: $table.dirty, builder: (column) => column);
}

class $$FollowUpTasksTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $FollowUpTasksTable,
          FollowUpTask,
          $$FollowUpTasksTableFilterComposer,
          $$FollowUpTasksTableOrderingComposer,
          $$FollowUpTasksTableAnnotationComposer,
          $$FollowUpTasksTableCreateCompanionBuilder,
          $$FollowUpTasksTableUpdateCompanionBuilder,
          (
            FollowUpTask,
            BaseReferences<_$AppDatabase, $FollowUpTasksTable, FollowUpTask>,
          ),
          FollowUpTask,
          PrefetchHooks Function()
        > {
  $$FollowUpTasksTableTableManager(_$AppDatabase db, $FollowUpTasksTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$FollowUpTasksTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$FollowUpTasksTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$FollowUpTasksTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String?> customerId = const Value.absent(),
                Value<String?> callReportId = const Value.absent(),
                Value<String> title = const Value.absent(),
                Value<String?> dueDate = const Value.absent(),
                Value<String> status = const Value.absent(),
                Value<bool> dirty = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => FollowUpTasksCompanion(
                id: id,
                customerId: customerId,
                callReportId: callReportId,
                title: title,
                dueDate: dueDate,
                status: status,
                dirty: dirty,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                Value<String?> customerId = const Value.absent(),
                Value<String?> callReportId = const Value.absent(),
                required String title,
                Value<String?> dueDate = const Value.absent(),
                Value<String> status = const Value.absent(),
                Value<bool> dirty = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => FollowUpTasksCompanion.insert(
                id: id,
                customerId: customerId,
                callReportId: callReportId,
                title: title,
                dueDate: dueDate,
                status: status,
                dirty: dirty,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$FollowUpTasksTable, FollowUpTask>(table),
                  BaseReferences<
                    _$AppDatabase,
                    $FollowUpTasksTable,
                    FollowUpTask
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$FollowUpTasksTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $FollowUpTasksTable,
      FollowUpTask,
      $$FollowUpTasksTableFilterComposer,
      $$FollowUpTasksTableOrderingComposer,
      $$FollowUpTasksTableAnnotationComposer,
      $$FollowUpTasksTableCreateCompanionBuilder,
      $$FollowUpTasksTableUpdateCompanionBuilder,
      (
        FollowUpTask,
        BaseReferences<_$AppDatabase, $FollowUpTasksTable, FollowUpTask>,
      ),
      FollowUpTask,
      PrefetchHooks Function()
    >;
typedef $$GpsPingsTableCreateCompanionBuilder = GpsPingsCompanion Function({
  required String id,
  required String recordedAt,
  required double latitude,
  required double longitude,
  Value<double?> accuracyM,
  Value<int> rowid,
});
typedef $$GpsPingsTableUpdateCompanionBuilder = GpsPingsCompanion Function({
  Value<String> id,
  Value<String> recordedAt,
  Value<double> latitude,
  Value<double> longitude,
  Value<double?> accuracyM,
  Value<int> rowid,
});

class $$GpsPingsTableFilterComposer
    extends Composer<_$AppDatabase, $GpsPingsTable> {
  $$GpsPingsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get recordedAt => $composableBuilder(
    column: $table.recordedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get latitude => $composableBuilder(
    column: $table.latitude,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get longitude => $composableBuilder(
    column: $table.longitude,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get accuracyM => $composableBuilder(
    column: $table.accuracyM,
    builder: (column) => ColumnFilters(column),
  );
}

class $$GpsPingsTableOrderingComposer
    extends Composer<_$AppDatabase, $GpsPingsTable> {
  $$GpsPingsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get recordedAt => $composableBuilder(
    column: $table.recordedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get latitude => $composableBuilder(
    column: $table.latitude,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get longitude => $composableBuilder(
    column: $table.longitude,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get accuracyM => $composableBuilder(
    column: $table.accuracyM,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$GpsPingsTableAnnotationComposer
    extends Composer<_$AppDatabase, $GpsPingsTable> {
  $$GpsPingsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get recordedAt => $composableBuilder(
    column: $table.recordedAt,
    builder: (column) => column,
  );

  GeneratedColumn<double> get latitude =>
      $composableBuilder(column: $table.latitude, builder: (column) => column);

  GeneratedColumn<double> get longitude =>
      $composableBuilder(column: $table.longitude, builder: (column) => column);

  GeneratedColumn<double> get accuracyM =>
      $composableBuilder(column: $table.accuracyM, builder: (column) => column);
}

class $$GpsPingsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $GpsPingsTable,
          GpsPing,
          $$GpsPingsTableFilterComposer,
          $$GpsPingsTableOrderingComposer,
          $$GpsPingsTableAnnotationComposer,
          $$GpsPingsTableCreateCompanionBuilder,
          $$GpsPingsTableUpdateCompanionBuilder,
          (GpsPing, BaseReferences<_$AppDatabase, $GpsPingsTable, GpsPing>),
          GpsPing,
          PrefetchHooks Function()
        > {
  $$GpsPingsTableTableManager(_$AppDatabase db, $GpsPingsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$GpsPingsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$GpsPingsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$GpsPingsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> recordedAt = const Value.absent(),
                Value<double> latitude = const Value.absent(),
                Value<double> longitude = const Value.absent(),
                Value<double?> accuracyM = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => GpsPingsCompanion(
                id: id,
                recordedAt: recordedAt,
                latitude: latitude,
                longitude: longitude,
                accuracyM: accuracyM,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String recordedAt,
                required double latitude,
                required double longitude,
                Value<double?> accuracyM = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => GpsPingsCompanion.insert(
                id: id,
                recordedAt: recordedAt,
                latitude: latitude,
                longitude: longitude,
                accuracyM: accuracyM,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$GpsPingsTable, GpsPing>(table),
                  BaseReferences<_$AppDatabase, $GpsPingsTable, GpsPing>(
                    db,
                    table,
                    e,
                  ),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$GpsPingsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $GpsPingsTable,
      GpsPing,
      $$GpsPingsTableFilterComposer,
      $$GpsPingsTableOrderingComposer,
      $$GpsPingsTableAnnotationComposer,
      $$GpsPingsTableCreateCompanionBuilder,
      $$GpsPingsTableUpdateCompanionBuilder,
      (GpsPing, BaseReferences<_$AppDatabase, $GpsPingsTable, GpsPing>),
      GpsPing,
      PrefetchHooks Function()
    >;
typedef $$AttachmentsTableCreateCompanionBuilder =
    AttachmentsCompanion Function({
      required String id,
      required String visitId,
      required String kind,
      required String localPath,
      required String contentType,
      required int sizeBytes,
      required String sha256,
      required String capturedAt,
      Value<String?> fileName,
      Value<String?> signerName,
      Value<String?> meaning,
      Value<int?> durationMs,
      Value<String> uploadStatus,
      Value<String?> uploadError,
      Value<int> attempts,
      Value<String?> uploadedAt,
      Value<int> rowid,
    });
typedef $$AttachmentsTableUpdateCompanionBuilder =
    AttachmentsCompanion Function({
      Value<String> id,
      Value<String> visitId,
      Value<String> kind,
      Value<String> localPath,
      Value<String> contentType,
      Value<int> sizeBytes,
      Value<String> sha256,
      Value<String> capturedAt,
      Value<String?> fileName,
      Value<String?> signerName,
      Value<String?> meaning,
      Value<int?> durationMs,
      Value<String> uploadStatus,
      Value<String?> uploadError,
      Value<int> attempts,
      Value<String?> uploadedAt,
      Value<int> rowid,
    });

class $$AttachmentsTableFilterComposer
    extends Composer<_$AppDatabase, $AttachmentsTable> {
  $$AttachmentsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get visitId => $composableBuilder(
    column: $table.visitId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get kind => $composableBuilder(
    column: $table.kind,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get localPath => $composableBuilder(
    column: $table.localPath,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get contentType => $composableBuilder(
    column: $table.contentType,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get sizeBytes => $composableBuilder(
    column: $table.sizeBytes,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get sha256 => $composableBuilder(
    column: $table.sha256,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get capturedAt => $composableBuilder(
    column: $table.capturedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get fileName => $composableBuilder(
    column: $table.fileName,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get signerName => $composableBuilder(
    column: $table.signerName,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get meaning => $composableBuilder(
    column: $table.meaning,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get durationMs => $composableBuilder(
    column: $table.durationMs,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get uploadStatus => $composableBuilder(
    column: $table.uploadStatus,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get uploadError => $composableBuilder(
    column: $table.uploadError,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get attempts => $composableBuilder(
    column: $table.attempts,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get uploadedAt => $composableBuilder(
    column: $table.uploadedAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$AttachmentsTableOrderingComposer
    extends Composer<_$AppDatabase, $AttachmentsTable> {
  $$AttachmentsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get visitId => $composableBuilder(
    column: $table.visitId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get kind => $composableBuilder(
    column: $table.kind,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get localPath => $composableBuilder(
    column: $table.localPath,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get contentType => $composableBuilder(
    column: $table.contentType,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get sizeBytes => $composableBuilder(
    column: $table.sizeBytes,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get sha256 => $composableBuilder(
    column: $table.sha256,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get capturedAt => $composableBuilder(
    column: $table.capturedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get fileName => $composableBuilder(
    column: $table.fileName,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get signerName => $composableBuilder(
    column: $table.signerName,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get meaning => $composableBuilder(
    column: $table.meaning,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get durationMs => $composableBuilder(
    column: $table.durationMs,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get uploadStatus => $composableBuilder(
    column: $table.uploadStatus,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get uploadError => $composableBuilder(
    column: $table.uploadError,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get attempts => $composableBuilder(
    column: $table.attempts,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get uploadedAt => $composableBuilder(
    column: $table.uploadedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$AttachmentsTableAnnotationComposer
    extends Composer<_$AppDatabase, $AttachmentsTable> {
  $$AttachmentsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get visitId =>
      $composableBuilder(column: $table.visitId, builder: (column) => column);

  GeneratedColumn<String> get kind =>
      $composableBuilder(column: $table.kind, builder: (column) => column);

  GeneratedColumn<String> get localPath =>
      $composableBuilder(column: $table.localPath, builder: (column) => column);

  GeneratedColumn<String> get contentType => $composableBuilder(
    column: $table.contentType,
    builder: (column) => column,
  );

  GeneratedColumn<int> get sizeBytes =>
      $composableBuilder(column: $table.sizeBytes, builder: (column) => column);

  GeneratedColumn<String> get sha256 =>
      $composableBuilder(column: $table.sha256, builder: (column) => column);

  GeneratedColumn<String> get capturedAt => $composableBuilder(
    column: $table.capturedAt,
    builder: (column) => column,
  );

  GeneratedColumn<String> get fileName =>
      $composableBuilder(column: $table.fileName, builder: (column) => column);

  GeneratedColumn<String> get signerName => $composableBuilder(
    column: $table.signerName,
    builder: (column) => column,
  );

  GeneratedColumn<String> get meaning =>
      $composableBuilder(column: $table.meaning, builder: (column) => column);

  GeneratedColumn<int> get durationMs => $composableBuilder(
    column: $table.durationMs,
    builder: (column) => column,
  );

  GeneratedColumn<String> get uploadStatus => $composableBuilder(
    column: $table.uploadStatus,
    builder: (column) => column,
  );

  GeneratedColumn<String> get uploadError => $composableBuilder(
    column: $table.uploadError,
    builder: (column) => column,
  );

  GeneratedColumn<int> get attempts =>
      $composableBuilder(column: $table.attempts, builder: (column) => column);

  GeneratedColumn<String> get uploadedAt => $composableBuilder(
    column: $table.uploadedAt,
    builder: (column) => column,
  );
}

class $$AttachmentsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $AttachmentsTable,
          Attachment,
          $$AttachmentsTableFilterComposer,
          $$AttachmentsTableOrderingComposer,
          $$AttachmentsTableAnnotationComposer,
          $$AttachmentsTableCreateCompanionBuilder,
          $$AttachmentsTableUpdateCompanionBuilder,
          (
            Attachment,
            BaseReferences<_$AppDatabase, $AttachmentsTable, Attachment>,
          ),
          Attachment,
          PrefetchHooks Function()
        > {
  $$AttachmentsTableTableManager(_$AppDatabase db, $AttachmentsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$AttachmentsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$AttachmentsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$AttachmentsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> visitId = const Value.absent(),
                Value<String> kind = const Value.absent(),
                Value<String> localPath = const Value.absent(),
                Value<String> contentType = const Value.absent(),
                Value<int> sizeBytes = const Value.absent(),
                Value<String> sha256 = const Value.absent(),
                Value<String> capturedAt = const Value.absent(),
                Value<String?> fileName = const Value.absent(),
                Value<String?> signerName = const Value.absent(),
                Value<String?> meaning = const Value.absent(),
                Value<int?> durationMs = const Value.absent(),
                Value<String> uploadStatus = const Value.absent(),
                Value<String?> uploadError = const Value.absent(),
                Value<int> attempts = const Value.absent(),
                Value<String?> uploadedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => AttachmentsCompanion(
                id: id,
                visitId: visitId,
                kind: kind,
                localPath: localPath,
                contentType: contentType,
                sizeBytes: sizeBytes,
                sha256: sha256,
                capturedAt: capturedAt,
                fileName: fileName,
                signerName: signerName,
                meaning: meaning,
                durationMs: durationMs,
                uploadStatus: uploadStatus,
                uploadError: uploadError,
                attempts: attempts,
                uploadedAt: uploadedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String visitId,
                required String kind,
                required String localPath,
                required String contentType,
                required int sizeBytes,
                required String sha256,
                required String capturedAt,
                Value<String?> fileName = const Value.absent(),
                Value<String?> signerName = const Value.absent(),
                Value<String?> meaning = const Value.absent(),
                Value<int?> durationMs = const Value.absent(),
                Value<String> uploadStatus = const Value.absent(),
                Value<String?> uploadError = const Value.absent(),
                Value<int> attempts = const Value.absent(),
                Value<String?> uploadedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => AttachmentsCompanion.insert(
                id: id,
                visitId: visitId,
                kind: kind,
                localPath: localPath,
                contentType: contentType,
                sizeBytes: sizeBytes,
                sha256: sha256,
                capturedAt: capturedAt,
                fileName: fileName,
                signerName: signerName,
                meaning: meaning,
                durationMs: durationMs,
                uploadStatus: uploadStatus,
                uploadError: uploadError,
                attempts: attempts,
                uploadedAt: uploadedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$AttachmentsTable, Attachment>(table),
                  BaseReferences<_$AppDatabase, $AttachmentsTable, Attachment>(
                    db,
                    table,
                    e,
                  ),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$AttachmentsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $AttachmentsTable,
      Attachment,
      $$AttachmentsTableFilterComposer,
      $$AttachmentsTableOrderingComposer,
      $$AttachmentsTableAnnotationComposer,
      $$AttachmentsTableCreateCompanionBuilder,
      $$AttachmentsTableUpdateCompanionBuilder,
      (
        Attachment,
        BaseReferences<_$AppDatabase, $AttachmentsTable, Attachment>,
      ),
      Attachment,
      PrefetchHooks Function()
    >;
typedef $$SampleStockTableCreateCompanionBuilder =
    SampleStockCompanion Function({
      required String batchId,
      required String productId,
      required String batchNumber,
      required String expiryDate,
      Value<String> status,
      required int quantity,
      Value<int> rowid,
    });
typedef $$SampleStockTableUpdateCompanionBuilder =
    SampleStockCompanion Function({
      Value<String> batchId,
      Value<String> productId,
      Value<String> batchNumber,
      Value<String> expiryDate,
      Value<String> status,
      Value<int> quantity,
      Value<int> rowid,
    });

class $$SampleStockTableFilterComposer
    extends Composer<_$AppDatabase, $SampleStockTable> {
  $$SampleStockTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get batchId => $composableBuilder(
    column: $table.batchId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get productId => $composableBuilder(
    column: $table.productId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get batchNumber => $composableBuilder(
    column: $table.batchNumber,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get expiryDate => $composableBuilder(
    column: $table.expiryDate,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get quantity => $composableBuilder(
    column: $table.quantity,
    builder: (column) => ColumnFilters(column),
  );
}

class $$SampleStockTableOrderingComposer
    extends Composer<_$AppDatabase, $SampleStockTable> {
  $$SampleStockTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get batchId => $composableBuilder(
    column: $table.batchId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get productId => $composableBuilder(
    column: $table.productId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get batchNumber => $composableBuilder(
    column: $table.batchNumber,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get expiryDate => $composableBuilder(
    column: $table.expiryDate,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get quantity => $composableBuilder(
    column: $table.quantity,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$SampleStockTableAnnotationComposer
    extends Composer<_$AppDatabase, $SampleStockTable> {
  $$SampleStockTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get batchId =>
      $composableBuilder(column: $table.batchId, builder: (column) => column);

  GeneratedColumn<String> get productId =>
      $composableBuilder(column: $table.productId, builder: (column) => column);

  GeneratedColumn<String> get batchNumber => $composableBuilder(
    column: $table.batchNumber,
    builder: (column) => column,
  );

  GeneratedColumn<String> get expiryDate => $composableBuilder(
    column: $table.expiryDate,
    builder: (column) => column,
  );

  GeneratedColumn<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<int> get quantity =>
      $composableBuilder(column: $table.quantity, builder: (column) => column);
}

class $$SampleStockTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $SampleStockTable,
          SampleStockData,
          $$SampleStockTableFilterComposer,
          $$SampleStockTableOrderingComposer,
          $$SampleStockTableAnnotationComposer,
          $$SampleStockTableCreateCompanionBuilder,
          $$SampleStockTableUpdateCompanionBuilder,
          (
            SampleStockData,
            BaseReferences<_$AppDatabase, $SampleStockTable, SampleStockData>,
          ),
          SampleStockData,
          PrefetchHooks Function()
        > {
  $$SampleStockTableTableManager(_$AppDatabase db, $SampleStockTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$SampleStockTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$SampleStockTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$SampleStockTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> batchId = const Value.absent(),
                Value<String> productId = const Value.absent(),
                Value<String> batchNumber = const Value.absent(),
                Value<String> expiryDate = const Value.absent(),
                Value<String> status = const Value.absent(),
                Value<int> quantity = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => SampleStockCompanion(
                batchId: batchId,
                productId: productId,
                batchNumber: batchNumber,
                expiryDate: expiryDate,
                status: status,
                quantity: quantity,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String batchId,
                required String productId,
                required String batchNumber,
                required String expiryDate,
                Value<String> status = const Value.absent(),
                required int quantity,
                Value<int> rowid = const Value.absent(),
              }) => SampleStockCompanion.insert(
                batchId: batchId,
                productId: productId,
                batchNumber: batchNumber,
                expiryDate: expiryDate,
                status: status,
                quantity: quantity,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$SampleStockTable, SampleStockData>(table),
                  BaseReferences<
                    _$AppDatabase,
                    $SampleStockTable,
                    SampleStockData
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$SampleStockTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $SampleStockTable,
      SampleStockData,
      $$SampleStockTableFilterComposer,
      $$SampleStockTableOrderingComposer,
      $$SampleStockTableAnnotationComposer,
      $$SampleStockTableCreateCompanionBuilder,
      $$SampleStockTableUpdateCompanionBuilder,
      (
        SampleStockData,
        BaseReferences<_$AppDatabase, $SampleStockTable, SampleStockData>,
      ),
      SampleStockData,
      PrefetchHooks Function()
    >;
typedef $$SampleDistributionsTableCreateCompanionBuilder =
    SampleDistributionsCompanion Function({
      required String id,
      Value<String?> visitId,
      required String customerId,
      required String productId,
      required String batchId,
      required int quantity,
      required String distributedAt,
      Value<String?> signatureAttachmentId,
      Value<String?> notes,
      Value<String> status,
      Value<String?> rejectReason,
      Value<int> rowid,
    });
typedef $$SampleDistributionsTableUpdateCompanionBuilder =
    SampleDistributionsCompanion Function({
      Value<String> id,
      Value<String?> visitId,
      Value<String> customerId,
      Value<String> productId,
      Value<String> batchId,
      Value<int> quantity,
      Value<String> distributedAt,
      Value<String?> signatureAttachmentId,
      Value<String?> notes,
      Value<String> status,
      Value<String?> rejectReason,
      Value<int> rowid,
    });

class $$SampleDistributionsTableFilterComposer
    extends Composer<_$AppDatabase, $SampleDistributionsTable> {
  $$SampleDistributionsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get visitId => $composableBuilder(
    column: $table.visitId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get customerId => $composableBuilder(
    column: $table.customerId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get productId => $composableBuilder(
    column: $table.productId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get batchId => $composableBuilder(
    column: $table.batchId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get quantity => $composableBuilder(
    column: $table.quantity,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get distributedAt => $composableBuilder(
    column: $table.distributedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get signatureAttachmentId => $composableBuilder(
    column: $table.signatureAttachmentId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get notes => $composableBuilder(
    column: $table.notes,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get rejectReason => $composableBuilder(
    column: $table.rejectReason,
    builder: (column) => ColumnFilters(column),
  );
}

class $$SampleDistributionsTableOrderingComposer
    extends Composer<_$AppDatabase, $SampleDistributionsTable> {
  $$SampleDistributionsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get visitId => $composableBuilder(
    column: $table.visitId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get customerId => $composableBuilder(
    column: $table.customerId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get productId => $composableBuilder(
    column: $table.productId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get batchId => $composableBuilder(
    column: $table.batchId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get quantity => $composableBuilder(
    column: $table.quantity,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get distributedAt => $composableBuilder(
    column: $table.distributedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get signatureAttachmentId => $composableBuilder(
    column: $table.signatureAttachmentId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get notes => $composableBuilder(
    column: $table.notes,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get rejectReason => $composableBuilder(
    column: $table.rejectReason,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$SampleDistributionsTableAnnotationComposer
    extends Composer<_$AppDatabase, $SampleDistributionsTable> {
  $$SampleDistributionsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get visitId =>
      $composableBuilder(column: $table.visitId, builder: (column) => column);

  GeneratedColumn<String> get customerId => $composableBuilder(
    column: $table.customerId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get productId =>
      $composableBuilder(column: $table.productId, builder: (column) => column);

  GeneratedColumn<String> get batchId =>
      $composableBuilder(column: $table.batchId, builder: (column) => column);

  GeneratedColumn<int> get quantity =>
      $composableBuilder(column: $table.quantity, builder: (column) => column);

  GeneratedColumn<String> get distributedAt => $composableBuilder(
    column: $table.distributedAt,
    builder: (column) => column,
  );

  GeneratedColumn<String> get signatureAttachmentId => $composableBuilder(
    column: $table.signatureAttachmentId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get notes =>
      $composableBuilder(column: $table.notes, builder: (column) => column);

  GeneratedColumn<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<String> get rejectReason => $composableBuilder(
    column: $table.rejectReason,
    builder: (column) => column,
  );
}

class $$SampleDistributionsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $SampleDistributionsTable,
          SampleDistribution,
          $$SampleDistributionsTableFilterComposer,
          $$SampleDistributionsTableOrderingComposer,
          $$SampleDistributionsTableAnnotationComposer,
          $$SampleDistributionsTableCreateCompanionBuilder,
          $$SampleDistributionsTableUpdateCompanionBuilder,
          (
            SampleDistribution,
            BaseReferences<
              _$AppDatabase,
              $SampleDistributionsTable,
              SampleDistribution
            >,
          ),
          SampleDistribution,
          PrefetchHooks Function()
        > {
  $$SampleDistributionsTableTableManager(
    _$AppDatabase db,
    $SampleDistributionsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$SampleDistributionsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$SampleDistributionsTableOrderingComposer(
                $db: db,
                $table: table,
              ),
          createComputedFieldComposer: () =>
              $$SampleDistributionsTableAnnotationComposer(
                $db: db,
                $table: table,
              ),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String?> visitId = const Value.absent(),
                Value<String> customerId = const Value.absent(),
                Value<String> productId = const Value.absent(),
                Value<String> batchId = const Value.absent(),
                Value<int> quantity = const Value.absent(),
                Value<String> distributedAt = const Value.absent(),
                Value<String?> signatureAttachmentId = const Value.absent(),
                Value<String?> notes = const Value.absent(),
                Value<String> status = const Value.absent(),
                Value<String?> rejectReason = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => SampleDistributionsCompanion(
                id: id,
                visitId: visitId,
                customerId: customerId,
                productId: productId,
                batchId: batchId,
                quantity: quantity,
                distributedAt: distributedAt,
                signatureAttachmentId: signatureAttachmentId,
                notes: notes,
                status: status,
                rejectReason: rejectReason,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                Value<String?> visitId = const Value.absent(),
                required String customerId,
                required String productId,
                required String batchId,
                required int quantity,
                required String distributedAt,
                Value<String?> signatureAttachmentId = const Value.absent(),
                Value<String?> notes = const Value.absent(),
                Value<String> status = const Value.absent(),
                Value<String?> rejectReason = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => SampleDistributionsCompanion.insert(
                id: id,
                visitId: visitId,
                customerId: customerId,
                productId: productId,
                batchId: batchId,
                quantity: quantity,
                distributedAt: distributedAt,
                signatureAttachmentId: signatureAttachmentId,
                notes: notes,
                status: status,
                rejectReason: rejectReason,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$SampleDistributionsTable, SampleDistribution>(
                    table,
                  ),
                  BaseReferences<
                    _$AppDatabase,
                    $SampleDistributionsTable,
                    SampleDistribution
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$SampleDistributionsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $SampleDistributionsTable,
      SampleDistribution,
      $$SampleDistributionsTableFilterComposer,
      $$SampleDistributionsTableOrderingComposer,
      $$SampleDistributionsTableAnnotationComposer,
      $$SampleDistributionsTableCreateCompanionBuilder,
      $$SampleDistributionsTableUpdateCompanionBuilder,
      (
        SampleDistribution,
        BaseReferences<
          _$AppDatabase,
          $SampleDistributionsTable,
          SampleDistribution
        >,
      ),
      SampleDistribution,
      PrefetchHooks Function()
    >;
typedef $$SampleRequestsTableCreateCompanionBuilder =
    SampleRequestsCompanion Function({
      required String id,
      required String productId,
      required int quantity,
      Value<int?> approvedQuantity,
      Value<String> status,
      Value<String?> notes,
      Value<String?> decisionNote,
      required String createdAt,
      Value<bool> dirty,
      Value<int> rowid,
    });
typedef $$SampleRequestsTableUpdateCompanionBuilder =
    SampleRequestsCompanion Function({
      Value<String> id,
      Value<String> productId,
      Value<int> quantity,
      Value<int?> approvedQuantity,
      Value<String> status,
      Value<String?> notes,
      Value<String?> decisionNote,
      Value<String> createdAt,
      Value<bool> dirty,
      Value<int> rowid,
    });

class $$SampleRequestsTableFilterComposer
    extends Composer<_$AppDatabase, $SampleRequestsTable> {
  $$SampleRequestsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get productId => $composableBuilder(
    column: $table.productId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get quantity => $composableBuilder(
    column: $table.quantity,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get approvedQuantity => $composableBuilder(
    column: $table.approvedQuantity,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get notes => $composableBuilder(
    column: $table.notes,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get decisionNote => $composableBuilder(
    column: $table.decisionNote,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get dirty => $composableBuilder(
    column: $table.dirty,
    builder: (column) => ColumnFilters(column),
  );
}

class $$SampleRequestsTableOrderingComposer
    extends Composer<_$AppDatabase, $SampleRequestsTable> {
  $$SampleRequestsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get productId => $composableBuilder(
    column: $table.productId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get quantity => $composableBuilder(
    column: $table.quantity,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get approvedQuantity => $composableBuilder(
    column: $table.approvedQuantity,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get notes => $composableBuilder(
    column: $table.notes,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get decisionNote => $composableBuilder(
    column: $table.decisionNote,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get dirty => $composableBuilder(
    column: $table.dirty,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$SampleRequestsTableAnnotationComposer
    extends Composer<_$AppDatabase, $SampleRequestsTable> {
  $$SampleRequestsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get productId =>
      $composableBuilder(column: $table.productId, builder: (column) => column);

  GeneratedColumn<int> get quantity =>
      $composableBuilder(column: $table.quantity, builder: (column) => column);

  GeneratedColumn<int> get approvedQuantity => $composableBuilder(
    column: $table.approvedQuantity,
    builder: (column) => column,
  );

  GeneratedColumn<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<String> get notes =>
      $composableBuilder(column: $table.notes, builder: (column) => column);

  GeneratedColumn<String> get decisionNote => $composableBuilder(
    column: $table.decisionNote,
    builder: (column) => column,
  );

  GeneratedColumn<String> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<bool> get dirty =>
      $composableBuilder(column: $table.dirty, builder: (column) => column);
}

class $$SampleRequestsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $SampleRequestsTable,
          SampleRequest,
          $$SampleRequestsTableFilterComposer,
          $$SampleRequestsTableOrderingComposer,
          $$SampleRequestsTableAnnotationComposer,
          $$SampleRequestsTableCreateCompanionBuilder,
          $$SampleRequestsTableUpdateCompanionBuilder,
          (
            SampleRequest,
            BaseReferences<_$AppDatabase, $SampleRequestsTable, SampleRequest>,
          ),
          SampleRequest,
          PrefetchHooks Function()
        > {
  $$SampleRequestsTableTableManager(
    _$AppDatabase db,
    $SampleRequestsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$SampleRequestsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$SampleRequestsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$SampleRequestsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> productId = const Value.absent(),
                Value<int> quantity = const Value.absent(),
                Value<int?> approvedQuantity = const Value.absent(),
                Value<String> status = const Value.absent(),
                Value<String?> notes = const Value.absent(),
                Value<String?> decisionNote = const Value.absent(),
                Value<String> createdAt = const Value.absent(),
                Value<bool> dirty = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => SampleRequestsCompanion(
                id: id,
                productId: productId,
                quantity: quantity,
                approvedQuantity: approvedQuantity,
                status: status,
                notes: notes,
                decisionNote: decisionNote,
                createdAt: createdAt,
                dirty: dirty,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String productId,
                required int quantity,
                Value<int?> approvedQuantity = const Value.absent(),
                Value<String> status = const Value.absent(),
                Value<String?> notes = const Value.absent(),
                Value<String?> decisionNote = const Value.absent(),
                required String createdAt,
                Value<bool> dirty = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => SampleRequestsCompanion.insert(
                id: id,
                productId: productId,
                quantity: quantity,
                approvedQuantity: approvedQuantity,
                status: status,
                notes: notes,
                decisionNote: decisionNote,
                createdAt: createdAt,
                dirty: dirty,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$SampleRequestsTable, SampleRequest>(table),
                  BaseReferences<
                    _$AppDatabase,
                    $SampleRequestsTable,
                    SampleRequest
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$SampleRequestsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $SampleRequestsTable,
      SampleRequest,
      $$SampleRequestsTableFilterComposer,
      $$SampleRequestsTableOrderingComposer,
      $$SampleRequestsTableAnnotationComposer,
      $$SampleRequestsTableCreateCompanionBuilder,
      $$SampleRequestsTableUpdateCompanionBuilder,
      (
        SampleRequest,
        BaseReferences<_$AppDatabase, $SampleRequestsTable, SampleRequest>,
      ),
      SampleRequest,
      PrefetchHooks Function()
    >;
typedef $$OrdersTableCreateCompanionBuilder = OrdersCompanion Function({
  required String id,
  required String customerId,
  required String customerName,
  Value<String?> number,
  Value<String> status,
  Value<double> total,
  Value<String?> notes,
  required String placedAt,
  Value<String?> cancelReason,
  Value<String?> rejectReason,
  Value<bool> creditHold,
  Value<String?> holdReason,
  Value<bool> dirty,
  Value<int> rowid,
});
typedef $$OrdersTableUpdateCompanionBuilder = OrdersCompanion Function({
  Value<String> id,
  Value<String> customerId,
  Value<String> customerName,
  Value<String?> number,
  Value<String> status,
  Value<double> total,
  Value<String?> notes,
  Value<String> placedAt,
  Value<String?> cancelReason,
  Value<String?> rejectReason,
  Value<bool> creditHold,
  Value<String?> holdReason,
  Value<bool> dirty,
  Value<int> rowid,
});

class $$OrdersTableFilterComposer
    extends Composer<_$AppDatabase, $OrdersTable> {
  $$OrdersTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get customerId => $composableBuilder(
    column: $table.customerId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get customerName => $composableBuilder(
    column: $table.customerName,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get number => $composableBuilder(
    column: $table.number,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get total => $composableBuilder(
    column: $table.total,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get notes => $composableBuilder(
    column: $table.notes,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get placedAt => $composableBuilder(
    column: $table.placedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get cancelReason => $composableBuilder(
    column: $table.cancelReason,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get rejectReason => $composableBuilder(
    column: $table.rejectReason,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get creditHold => $composableBuilder(
    column: $table.creditHold,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get holdReason => $composableBuilder(
    column: $table.holdReason,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get dirty => $composableBuilder(
    column: $table.dirty,
    builder: (column) => ColumnFilters(column),
  );
}

class $$OrdersTableOrderingComposer
    extends Composer<_$AppDatabase, $OrdersTable> {
  $$OrdersTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get customerId => $composableBuilder(
    column: $table.customerId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get customerName => $composableBuilder(
    column: $table.customerName,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get number => $composableBuilder(
    column: $table.number,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get total => $composableBuilder(
    column: $table.total,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get notes => $composableBuilder(
    column: $table.notes,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get placedAt => $composableBuilder(
    column: $table.placedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get cancelReason => $composableBuilder(
    column: $table.cancelReason,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get rejectReason => $composableBuilder(
    column: $table.rejectReason,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get creditHold => $composableBuilder(
    column: $table.creditHold,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get holdReason => $composableBuilder(
    column: $table.holdReason,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get dirty => $composableBuilder(
    column: $table.dirty,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$OrdersTableAnnotationComposer
    extends Composer<_$AppDatabase, $OrdersTable> {
  $$OrdersTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get customerId => $composableBuilder(
    column: $table.customerId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get customerName => $composableBuilder(
    column: $table.customerName,
    builder: (column) => column,
  );

  GeneratedColumn<String> get number =>
      $composableBuilder(column: $table.number, builder: (column) => column);

  GeneratedColumn<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<double> get total =>
      $composableBuilder(column: $table.total, builder: (column) => column);

  GeneratedColumn<String> get notes =>
      $composableBuilder(column: $table.notes, builder: (column) => column);

  GeneratedColumn<String> get placedAt =>
      $composableBuilder(column: $table.placedAt, builder: (column) => column);

  GeneratedColumn<String> get cancelReason => $composableBuilder(
    column: $table.cancelReason,
    builder: (column) => column,
  );

  GeneratedColumn<String> get rejectReason => $composableBuilder(
    column: $table.rejectReason,
    builder: (column) => column,
  );

  GeneratedColumn<bool> get creditHold => $composableBuilder(
    column: $table.creditHold,
    builder: (column) => column,
  );

  GeneratedColumn<String> get holdReason => $composableBuilder(
    column: $table.holdReason,
    builder: (column) => column,
  );

  GeneratedColumn<bool> get dirty =>
      $composableBuilder(column: $table.dirty, builder: (column) => column);
}

class $$OrdersTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $OrdersTable,
          Order,
          $$OrdersTableFilterComposer,
          $$OrdersTableOrderingComposer,
          $$OrdersTableAnnotationComposer,
          $$OrdersTableCreateCompanionBuilder,
          $$OrdersTableUpdateCompanionBuilder,
          (Order, BaseReferences<_$AppDatabase, $OrdersTable, Order>),
          Order,
          PrefetchHooks Function()
        > {
  $$OrdersTableTableManager(_$AppDatabase db, $OrdersTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$OrdersTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$OrdersTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$OrdersTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> customerId = const Value.absent(),
                Value<String> customerName = const Value.absent(),
                Value<String?> number = const Value.absent(),
                Value<String> status = const Value.absent(),
                Value<double> total = const Value.absent(),
                Value<String?> notes = const Value.absent(),
                Value<String> placedAt = const Value.absent(),
                Value<String?> cancelReason = const Value.absent(),
                Value<String?> rejectReason = const Value.absent(),
                Value<bool> creditHold = const Value.absent(),
                Value<String?> holdReason = const Value.absent(),
                Value<bool> dirty = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => OrdersCompanion(
                id: id,
                customerId: customerId,
                customerName: customerName,
                number: number,
                status: status,
                total: total,
                notes: notes,
                placedAt: placedAt,
                cancelReason: cancelReason,
                rejectReason: rejectReason,
                creditHold: creditHold,
                holdReason: holdReason,
                dirty: dirty,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String customerId,
                required String customerName,
                Value<String?> number = const Value.absent(),
                Value<String> status = const Value.absent(),
                Value<double> total = const Value.absent(),
                Value<String?> notes = const Value.absent(),
                required String placedAt,
                Value<String?> cancelReason = const Value.absent(),
                Value<String?> rejectReason = const Value.absent(),
                Value<bool> creditHold = const Value.absent(),
                Value<String?> holdReason = const Value.absent(),
                Value<bool> dirty = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => OrdersCompanion.insert(
                id: id,
                customerId: customerId,
                customerName: customerName,
                number: number,
                status: status,
                total: total,
                notes: notes,
                placedAt: placedAt,
                cancelReason: cancelReason,
                rejectReason: rejectReason,
                creditHold: creditHold,
                holdReason: holdReason,
                dirty: dirty,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$OrdersTable, Order>(table),
                  BaseReferences<_$AppDatabase, $OrdersTable, Order>(
                    db,
                    table,
                    e,
                  ),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$OrdersTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $OrdersTable,
      Order,
      $$OrdersTableFilterComposer,
      $$OrdersTableOrderingComposer,
      $$OrdersTableAnnotationComposer,
      $$OrdersTableCreateCompanionBuilder,
      $$OrdersTableUpdateCompanionBuilder,
      (Order, BaseReferences<_$AppDatabase, $OrdersTable, Order>),
      Order,
      PrefetchHooks Function()
    >;
typedef $$OrderLinesTableCreateCompanionBuilder = OrderLinesCompanion Function({
  required String id,
  required String orderId,
  required String productId,
  required String productName,
  required int quantity,
  Value<double> unitPrice,
  Value<double> lineTotal,
  Value<int> rowid,
});
typedef $$OrderLinesTableUpdateCompanionBuilder = OrderLinesCompanion Function({
  Value<String> id,
  Value<String> orderId,
  Value<String> productId,
  Value<String> productName,
  Value<int> quantity,
  Value<double> unitPrice,
  Value<double> lineTotal,
  Value<int> rowid,
});

class $$OrderLinesTableFilterComposer
    extends Composer<_$AppDatabase, $OrderLinesTable> {
  $$OrderLinesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get orderId => $composableBuilder(
    column: $table.orderId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get productId => $composableBuilder(
    column: $table.productId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get productName => $composableBuilder(
    column: $table.productName,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get quantity => $composableBuilder(
    column: $table.quantity,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get unitPrice => $composableBuilder(
    column: $table.unitPrice,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get lineTotal => $composableBuilder(
    column: $table.lineTotal,
    builder: (column) => ColumnFilters(column),
  );
}

class $$OrderLinesTableOrderingComposer
    extends Composer<_$AppDatabase, $OrderLinesTable> {
  $$OrderLinesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get orderId => $composableBuilder(
    column: $table.orderId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get productId => $composableBuilder(
    column: $table.productId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get productName => $composableBuilder(
    column: $table.productName,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get quantity => $composableBuilder(
    column: $table.quantity,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get unitPrice => $composableBuilder(
    column: $table.unitPrice,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get lineTotal => $composableBuilder(
    column: $table.lineTotal,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$OrderLinesTableAnnotationComposer
    extends Composer<_$AppDatabase, $OrderLinesTable> {
  $$OrderLinesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get orderId =>
      $composableBuilder(column: $table.orderId, builder: (column) => column);

  GeneratedColumn<String> get productId =>
      $composableBuilder(column: $table.productId, builder: (column) => column);

  GeneratedColumn<String> get productName => $composableBuilder(
    column: $table.productName,
    builder: (column) => column,
  );

  GeneratedColumn<int> get quantity =>
      $composableBuilder(column: $table.quantity, builder: (column) => column);

  GeneratedColumn<double> get unitPrice =>
      $composableBuilder(column: $table.unitPrice, builder: (column) => column);

  GeneratedColumn<double> get lineTotal =>
      $composableBuilder(column: $table.lineTotal, builder: (column) => column);
}

class $$OrderLinesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $OrderLinesTable,
          OrderLine,
          $$OrderLinesTableFilterComposer,
          $$OrderLinesTableOrderingComposer,
          $$OrderLinesTableAnnotationComposer,
          $$OrderLinesTableCreateCompanionBuilder,
          $$OrderLinesTableUpdateCompanionBuilder,
          (
            OrderLine,
            BaseReferences<_$AppDatabase, $OrderLinesTable, OrderLine>,
          ),
          OrderLine,
          PrefetchHooks Function()
        > {
  $$OrderLinesTableTableManager(_$AppDatabase db, $OrderLinesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$OrderLinesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$OrderLinesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$OrderLinesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> orderId = const Value.absent(),
                Value<String> productId = const Value.absent(),
                Value<String> productName = const Value.absent(),
                Value<int> quantity = const Value.absent(),
                Value<double> unitPrice = const Value.absent(),
                Value<double> lineTotal = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => OrderLinesCompanion(
                id: id,
                orderId: orderId,
                productId: productId,
                productName: productName,
                quantity: quantity,
                unitPrice: unitPrice,
                lineTotal: lineTotal,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String orderId,
                required String productId,
                required String productName,
                required int quantity,
                Value<double> unitPrice = const Value.absent(),
                Value<double> lineTotal = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => OrderLinesCompanion.insert(
                id: id,
                orderId: orderId,
                productId: productId,
                productName: productName,
                quantity: quantity,
                unitPrice: unitPrice,
                lineTotal: lineTotal,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$OrderLinesTable, OrderLine>(table),
                  BaseReferences<_$AppDatabase, $OrderLinesTable, OrderLine>(
                    db,
                    table,
                    e,
                  ),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$OrderLinesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $OrderLinesTable,
      OrderLine,
      $$OrderLinesTableFilterComposer,
      $$OrderLinesTableOrderingComposer,
      $$OrderLinesTableAnnotationComposer,
      $$OrderLinesTableCreateCompanionBuilder,
      $$OrderLinesTableUpdateCompanionBuilder,
      (OrderLine, BaseReferences<_$AppDatabase, $OrderLinesTable, OrderLine>),
      OrderLine,
      PrefetchHooks Function()
    >;
typedef $$NextActionsTableCreateCompanionBuilder =
    NextActionsCompanion Function({
      Value<int> position,
      required String type,
      Value<String?> customerId,
      required String title,
      required String reason,
      required int priority,
      Value<String?> dueDate,
    });
typedef $$NextActionsTableUpdateCompanionBuilder =
    NextActionsCompanion Function({
      Value<int> position,
      Value<String> type,
      Value<String?> customerId,
      Value<String> title,
      Value<String> reason,
      Value<int> priority,
      Value<String?> dueDate,
    });

class $$NextActionsTableFilterComposer
    extends Composer<_$AppDatabase, $NextActionsTable> {
  $$NextActionsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get position => $composableBuilder(
    column: $table.position,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get type => $composableBuilder(
    column: $table.type,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get customerId => $composableBuilder(
    column: $table.customerId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get title => $composableBuilder(
    column: $table.title,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get reason => $composableBuilder(
    column: $table.reason,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get priority => $composableBuilder(
    column: $table.priority,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get dueDate => $composableBuilder(
    column: $table.dueDate,
    builder: (column) => ColumnFilters(column),
  );
}

class $$NextActionsTableOrderingComposer
    extends Composer<_$AppDatabase, $NextActionsTable> {
  $$NextActionsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get position => $composableBuilder(
    column: $table.position,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get type => $composableBuilder(
    column: $table.type,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get customerId => $composableBuilder(
    column: $table.customerId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get title => $composableBuilder(
    column: $table.title,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get reason => $composableBuilder(
    column: $table.reason,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get priority => $composableBuilder(
    column: $table.priority,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get dueDate => $composableBuilder(
    column: $table.dueDate,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$NextActionsTableAnnotationComposer
    extends Composer<_$AppDatabase, $NextActionsTable> {
  $$NextActionsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get position =>
      $composableBuilder(column: $table.position, builder: (column) => column);

  GeneratedColumn<String> get type =>
      $composableBuilder(column: $table.type, builder: (column) => column);

  GeneratedColumn<String> get customerId => $composableBuilder(
    column: $table.customerId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get title =>
      $composableBuilder(column: $table.title, builder: (column) => column);

  GeneratedColumn<String> get reason =>
      $composableBuilder(column: $table.reason, builder: (column) => column);

  GeneratedColumn<int> get priority =>
      $composableBuilder(column: $table.priority, builder: (column) => column);

  GeneratedColumn<String> get dueDate =>
      $composableBuilder(column: $table.dueDate, builder: (column) => column);
}

class $$NextActionsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $NextActionsTable,
          NextAction,
          $$NextActionsTableFilterComposer,
          $$NextActionsTableOrderingComposer,
          $$NextActionsTableAnnotationComposer,
          $$NextActionsTableCreateCompanionBuilder,
          $$NextActionsTableUpdateCompanionBuilder,
          (
            NextAction,
            BaseReferences<_$AppDatabase, $NextActionsTable, NextAction>,
          ),
          NextAction,
          PrefetchHooks Function()
        > {
  $$NextActionsTableTableManager(_$AppDatabase db, $NextActionsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$NextActionsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$NextActionsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$NextActionsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> position = const Value.absent(),
                Value<String> type = const Value.absent(),
                Value<String?> customerId = const Value.absent(),
                Value<String> title = const Value.absent(),
                Value<String> reason = const Value.absent(),
                Value<int> priority = const Value.absent(),
                Value<String?> dueDate = const Value.absent(),
              }) => NextActionsCompanion(
                position: position,
                type: type,
                customerId: customerId,
                title: title,
                reason: reason,
                priority: priority,
                dueDate: dueDate,
              ),
          createCompanionCallback:
              ({
                Value<int> position = const Value.absent(),
                required String type,
                Value<String?> customerId = const Value.absent(),
                required String title,
                required String reason,
                required int priority,
                Value<String?> dueDate = const Value.absent(),
              }) => NextActionsCompanion.insert(
                position: position,
                type: type,
                customerId: customerId,
                title: title,
                reason: reason,
                priority: priority,
                dueDate: dueDate,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$NextActionsTable, NextAction>(table),
                  BaseReferences<_$AppDatabase, $NextActionsTable, NextAction>(
                    db,
                    table,
                    e,
                  ),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$NextActionsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $NextActionsTable,
      NextAction,
      $$NextActionsTableFilterComposer,
      $$NextActionsTableOrderingComposer,
      $$NextActionsTableAnnotationComposer,
      $$NextActionsTableCreateCompanionBuilder,
      $$NextActionsTableUpdateCompanionBuilder,
      (
        NextAction,
        BaseReferences<_$AppDatabase, $NextActionsTable, NextAction>,
      ),
      NextAction,
      PrefetchHooks Function()
    >;
typedef $$SyncProblemsTableCreateCompanionBuilder =
    SyncProblemsCompanion Function({
      required String id,
      required String kind,
      required String summary,
      required String reason,
      required String createdAt,
      Value<int> rowid,
    });
typedef $$SyncProblemsTableUpdateCompanionBuilder =
    SyncProblemsCompanion Function({
      Value<String> id,
      Value<String> kind,
      Value<String> summary,
      Value<String> reason,
      Value<String> createdAt,
      Value<int> rowid,
    });

class $$SyncProblemsTableFilterComposer
    extends Composer<_$AppDatabase, $SyncProblemsTable> {
  $$SyncProblemsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get kind => $composableBuilder(
    column: $table.kind,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get summary => $composableBuilder(
    column: $table.summary,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get reason => $composableBuilder(
    column: $table.reason,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$SyncProblemsTableOrderingComposer
    extends Composer<_$AppDatabase, $SyncProblemsTable> {
  $$SyncProblemsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get kind => $composableBuilder(
    column: $table.kind,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get summary => $composableBuilder(
    column: $table.summary,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get reason => $composableBuilder(
    column: $table.reason,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$SyncProblemsTableAnnotationComposer
    extends Composer<_$AppDatabase, $SyncProblemsTable> {
  $$SyncProblemsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get kind =>
      $composableBuilder(column: $table.kind, builder: (column) => column);

  GeneratedColumn<String> get summary =>
      $composableBuilder(column: $table.summary, builder: (column) => column);

  GeneratedColumn<String> get reason =>
      $composableBuilder(column: $table.reason, builder: (column) => column);

  GeneratedColumn<String> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);
}

class $$SyncProblemsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $SyncProblemsTable,
          SyncProblem,
          $$SyncProblemsTableFilterComposer,
          $$SyncProblemsTableOrderingComposer,
          $$SyncProblemsTableAnnotationComposer,
          $$SyncProblemsTableCreateCompanionBuilder,
          $$SyncProblemsTableUpdateCompanionBuilder,
          (
            SyncProblem,
            BaseReferences<_$AppDatabase, $SyncProblemsTable, SyncProblem>,
          ),
          SyncProblem,
          PrefetchHooks Function()
        > {
  $$SyncProblemsTableTableManager(_$AppDatabase db, $SyncProblemsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$SyncProblemsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$SyncProblemsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$SyncProblemsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> kind = const Value.absent(),
                Value<String> summary = const Value.absent(),
                Value<String> reason = const Value.absent(),
                Value<String> createdAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => SyncProblemsCompanion(
                id: id,
                kind: kind,
                summary: summary,
                reason: reason,
                createdAt: createdAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String kind,
                required String summary,
                required String reason,
                required String createdAt,
                Value<int> rowid = const Value.absent(),
              }) => SyncProblemsCompanion.insert(
                id: id,
                kind: kind,
                summary: summary,
                reason: reason,
                createdAt: createdAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$SyncProblemsTable, SyncProblem>(table),
                  BaseReferences<
                    _$AppDatabase,
                    $SyncProblemsTable,
                    SyncProblem
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$SyncProblemsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $SyncProblemsTable,
      SyncProblem,
      $$SyncProblemsTableFilterComposer,
      $$SyncProblemsTableOrderingComposer,
      $$SyncProblemsTableAnnotationComposer,
      $$SyncProblemsTableCreateCompanionBuilder,
      $$SyncProblemsTableUpdateCompanionBuilder,
      (
        SyncProblem,
        BaseReferences<_$AppDatabase, $SyncProblemsTable, SyncProblem>,
      ),
      SyncProblem,
      PrefetchHooks Function()
    >;
typedef $$AppNotificationsTableCreateCompanionBuilder =
    AppNotificationsCompanion Function({
      required String id,
      required String kind,
      required String title,
      Value<String?> body,
      required String createdAt,
      Value<bool> readLocally,
      Value<int> rowid,
    });
typedef $$AppNotificationsTableUpdateCompanionBuilder =
    AppNotificationsCompanion Function({
      Value<String> id,
      Value<String> kind,
      Value<String> title,
      Value<String?> body,
      Value<String> createdAt,
      Value<bool> readLocally,
      Value<int> rowid,
    });

class $$AppNotificationsTableFilterComposer
    extends Composer<_$AppDatabase, $AppNotificationsTable> {
  $$AppNotificationsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get kind => $composableBuilder(
    column: $table.kind,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get title => $composableBuilder(
    column: $table.title,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get body => $composableBuilder(
    column: $table.body,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get readLocally => $composableBuilder(
    column: $table.readLocally,
    builder: (column) => ColumnFilters(column),
  );
}

class $$AppNotificationsTableOrderingComposer
    extends Composer<_$AppDatabase, $AppNotificationsTable> {
  $$AppNotificationsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get kind => $composableBuilder(
    column: $table.kind,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get title => $composableBuilder(
    column: $table.title,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get body => $composableBuilder(
    column: $table.body,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get readLocally => $composableBuilder(
    column: $table.readLocally,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$AppNotificationsTableAnnotationComposer
    extends Composer<_$AppDatabase, $AppNotificationsTable> {
  $$AppNotificationsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get kind =>
      $composableBuilder(column: $table.kind, builder: (column) => column);

  GeneratedColumn<String> get title =>
      $composableBuilder(column: $table.title, builder: (column) => column);

  GeneratedColumn<String> get body =>
      $composableBuilder(column: $table.body, builder: (column) => column);

  GeneratedColumn<String> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<bool> get readLocally => $composableBuilder(
    column: $table.readLocally,
    builder: (column) => column,
  );
}

class $$AppNotificationsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $AppNotificationsTable,
          AppNotification,
          $$AppNotificationsTableFilterComposer,
          $$AppNotificationsTableOrderingComposer,
          $$AppNotificationsTableAnnotationComposer,
          $$AppNotificationsTableCreateCompanionBuilder,
          $$AppNotificationsTableUpdateCompanionBuilder,
          (
            AppNotification,
            BaseReferences<
              _$AppDatabase,
              $AppNotificationsTable,
              AppNotification
            >,
          ),
          AppNotification,
          PrefetchHooks Function()
        > {
  $$AppNotificationsTableTableManager(
    _$AppDatabase db,
    $AppNotificationsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$AppNotificationsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$AppNotificationsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$AppNotificationsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> kind = const Value.absent(),
                Value<String> title = const Value.absent(),
                Value<String?> body = const Value.absent(),
                Value<String> createdAt = const Value.absent(),
                Value<bool> readLocally = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => AppNotificationsCompanion(
                id: id,
                kind: kind,
                title: title,
                body: body,
                createdAt: createdAt,
                readLocally: readLocally,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String kind,
                required String title,
                Value<String?> body = const Value.absent(),
                required String createdAt,
                Value<bool> readLocally = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => AppNotificationsCompanion.insert(
                id: id,
                kind: kind,
                title: title,
                body: body,
                createdAt: createdAt,
                readLocally: readLocally,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$AppNotificationsTable, AppNotification>(table),
                  BaseReferences<
                    _$AppDatabase,
                    $AppNotificationsTable,
                    AppNotification
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$AppNotificationsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $AppNotificationsTable,
      AppNotification,
      $$AppNotificationsTableFilterComposer,
      $$AppNotificationsTableOrderingComposer,
      $$AppNotificationsTableAnnotationComposer,
      $$AppNotificationsTableCreateCompanionBuilder,
      $$AppNotificationsTableUpdateCompanionBuilder,
      (
        AppNotification,
        BaseReferences<_$AppDatabase, $AppNotificationsTable, AppNotification>,
      ),
      AppNotification,
      PrefetchHooks Function()
    >;
typedef $$SyncStateTableCreateCompanionBuilder = SyncStateCompanion Function({
  required String key,
  required String value,
  Value<int> rowid,
});
typedef $$SyncStateTableUpdateCompanionBuilder = SyncStateCompanion Function({
  Value<String> key,
  Value<String> value,
  Value<int> rowid,
});

class $$SyncStateTableFilterComposer
    extends Composer<_$AppDatabase, $SyncStateTable> {
  $$SyncStateTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get key => $composableBuilder(
    column: $table.key,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get value => $composableBuilder(
    column: $table.value,
    builder: (column) => ColumnFilters(column),
  );
}

class $$SyncStateTableOrderingComposer
    extends Composer<_$AppDatabase, $SyncStateTable> {
  $$SyncStateTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get key => $composableBuilder(
    column: $table.key,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get value => $composableBuilder(
    column: $table.value,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$SyncStateTableAnnotationComposer
    extends Composer<_$AppDatabase, $SyncStateTable> {
  $$SyncStateTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get key =>
      $composableBuilder(column: $table.key, builder: (column) => column);

  GeneratedColumn<String> get value =>
      $composableBuilder(column: $table.value, builder: (column) => column);
}

class $$SyncStateTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $SyncStateTable,
          SyncStateData,
          $$SyncStateTableFilterComposer,
          $$SyncStateTableOrderingComposer,
          $$SyncStateTableAnnotationComposer,
          $$SyncStateTableCreateCompanionBuilder,
          $$SyncStateTableUpdateCompanionBuilder,
          (
            SyncStateData,
            BaseReferences<_$AppDatabase, $SyncStateTable, SyncStateData>,
          ),
          SyncStateData,
          PrefetchHooks Function()
        > {
  $$SyncStateTableTableManager(_$AppDatabase db, $SyncStateTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$SyncStateTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$SyncStateTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$SyncStateTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> key = const Value.absent(),
            Value<String> value = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) => SyncStateCompanion(key: key, value: value, rowid: rowid),
          createCompanionCallback: ({
            required String key,
            required String value,
            Value<int> rowid = const Value.absent(),
          }) => SyncStateCompanion.insert(key: key, value: value, rowid: rowid),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$SyncStateTable, SyncStateData>(table),
                  BaseReferences<_$AppDatabase, $SyncStateTable, SyncStateData>(
                    db,
                    table,
                    e,
                  ),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$SyncStateTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $SyncStateTable,
      SyncStateData,
      $$SyncStateTableFilterComposer,
      $$SyncStateTableOrderingComposer,
      $$SyncStateTableAnnotationComposer,
      $$SyncStateTableCreateCompanionBuilder,
      $$SyncStateTableUpdateCompanionBuilder,
      (
        SyncStateData,
        BaseReferences<_$AppDatabase, $SyncStateTable, SyncStateData>,
      ),
      SyncStateData,
      PrefetchHooks Function()
    >;

class $AppDatabaseManager {
  final _$AppDatabase _db;
  $AppDatabaseManager(this._db);
  $$CustomersTableTableManager get customers =>
      $$CustomersTableTableManager(_db, _db.customers);
  $$ProductsTableTableManager get products =>
      $$ProductsTableTableManager(_db, _db.products);
  $$PlannedVisitsTableTableManager get plannedVisits =>
      $$PlannedVisitsTableTableManager(_db, _db.plannedVisits);
  $$VisitsTableTableManager get visits =>
      $$VisitsTableTableManager(_db, _db.visits);
  $$CallReportsTableTableManager get callReports =>
      $$CallReportsTableTableManager(_db, _db.callReports);
  $$FollowUpTasksTableTableManager get followUpTasks =>
      $$FollowUpTasksTableTableManager(_db, _db.followUpTasks);
  $$GpsPingsTableTableManager get gpsPings =>
      $$GpsPingsTableTableManager(_db, _db.gpsPings);
  $$AttachmentsTableTableManager get attachments =>
      $$AttachmentsTableTableManager(_db, _db.attachments);
  $$SampleStockTableTableManager get sampleStock =>
      $$SampleStockTableTableManager(_db, _db.sampleStock);
  $$SampleDistributionsTableTableManager get sampleDistributions =>
      $$SampleDistributionsTableTableManager(_db, _db.sampleDistributions);
  $$SampleRequestsTableTableManager get sampleRequests =>
      $$SampleRequestsTableTableManager(_db, _db.sampleRequests);
  $$OrdersTableTableManager get orders =>
      $$OrdersTableTableManager(_db, _db.orders);
  $$OrderLinesTableTableManager get orderLines =>
      $$OrderLinesTableTableManager(_db, _db.orderLines);
  $$NextActionsTableTableManager get nextActions =>
      $$NextActionsTableTableManager(_db, _db.nextActions);
  $$SyncProblemsTableTableManager get syncProblems =>
      $$SyncProblemsTableTableManager(_db, _db.syncProblems);
  $$AppNotificationsTableTableManager get appNotifications =>
      $$AppNotificationsTableTableManager(_db, _db.appNotifications);
  $$SyncStateTableTableManager get syncState =>
      $$SyncStateTableTableManager(_db, _db.syncState);
}
