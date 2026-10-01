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
          ..write('targetVisitsPerMonth: $targetVisitsPerMonth')
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
          other.targetVisitsPerMonth == this.targetVisitsPerMonth);
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
  @override
  List<GeneratedColumn> get $columns => [id, name, code];
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
  const Product({required this.id, required this.name, this.code});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['name'] = Variable<String>(name);
    if (!nullToAbsent || code != null) {
      map['code'] = Variable<String>(code);
    }
    return map;
  }

  ProductsCompanion toCompanion(bool nullToAbsent) {
    return ProductsCompanion(
      id: Value(id),
      name: Value(name),
      code: code == null && nullToAbsent ? const Value.absent() : Value(code),
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
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'name': serializer.toJson<String>(name),
      'code': serializer.toJson<String?>(code),
    };
  }

  Product copyWith({
    String? id,
    String? name,
    Value<String?> code = const Value.absent(),
  }) => Product(
    id: id ?? this.id,
    name: name ?? this.name,
    code: code.present ? code.value : this.code,
  );
  Product copyWithCompanion(ProductsCompanion data) {
    return Product(
      id: data.id.present ? data.id.value : this.id,
      name: data.name.present ? data.name.value : this.name,
      code: data.code.present ? data.code.value : this.code,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Product(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('code: $code')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, name, code);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Product &&
          other.id == this.id &&
          other.name == this.name &&
          other.code == this.code);
}

class ProductsCompanion extends UpdateCompanion<Product> {
  final Value<String> id;
  final Value<String> name;
  final Value<String?> code;
  final Value<int> rowid;
  const ProductsCompanion({
    this.id = const Value.absent(),
    this.name = const Value.absent(),
    this.code = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ProductsCompanion.insert({
    required String id,
    required String name,
    this.code = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       name = Value(name);
  static Insertable<Product> custom({
    Expression<String>? id,
    Expression<String>? name,
    Expression<String>? code,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (name != null) 'name': name,
      if (code != null) 'code': code,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ProductsCompanion copyWith({
    Value<String>? id,
    Value<String>? name,
    Value<String?>? code,
    Value<int>? rowid,
  }) {
    return ProductsCompanion(
      id: id ?? this.id,
      name: name ?? this.name,
      code: code ?? this.code,
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
  @override
  List<GeneratedColumn> get $columns => [
    id,
    customerId,
    plannedDate,
    sequence,
    status,
    objective,
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
  const PlannedVisit({
    required this.id,
    required this.customerId,
    required this.plannedDate,
    required this.sequence,
    required this.status,
    this.objective,
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
    };
  }

  PlannedVisit copyWith({
    String? id,
    String? customerId,
    String? plannedDate,
    int? sequence,
    String? status,
    Value<String?> objective = const Value.absent(),
  }) => PlannedVisit(
    id: id ?? this.id,
    customerId: customerId ?? this.customerId,
    plannedDate: plannedDate ?? this.plannedDate,
    sequence: sequence ?? this.sequence,
    status: status ?? this.status,
    objective: objective.present ? objective.value : this.objective,
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
          ..write('objective: $objective')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(id, customerId, plannedDate, sequence, status, objective);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is PlannedVisit &&
          other.id == this.id &&
          other.customerId == this.customerId &&
          other.plannedDate == this.plannedDate &&
          other.sequence == this.sequence &&
          other.status == this.status &&
          other.objective == this.objective);
}

class PlannedVisitsCompanion extends UpdateCompanion<PlannedVisit> {
  final Value<String> id;
  final Value<String> customerId;
  final Value<String> plannedDate;
  final Value<int> sequence;
  final Value<String> status;
  final Value<String?> objective;
  final Value<int> rowid;
  const PlannedVisitsCompanion({
    this.id = const Value.absent(),
    this.customerId = const Value.absent(),
    this.plannedDate = const Value.absent(),
    this.sequence = const Value.absent(),
    this.status = const Value.absent(),
    this.objective = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  PlannedVisitsCompanion.insert({
    required String id,
    required String customerId,
    required String plannedDate,
    this.sequence = const Value.absent(),
    this.status = const Value.absent(),
    this.objective = const Value.absent(),
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
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (customerId != null) 'customer_id': customerId,
      if (plannedDate != null) 'planned_date': plannedDate,
      if (sequence != null) 'sequence': sequence,
      if (status != null) 'status': status,
      if (objective != null) 'objective': objective,
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
    Value<int>? rowid,
  }) {
    return PlannedVisitsCompanion(
      id: id ?? this.id,
      customerId: customerId ?? this.customerId,
      plannedDate: plannedDate ?? this.plannedDate,
      sequence: sequence ?? this.sequence,
      status: status ?? this.status,
      objective: objective ?? this.objective,
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
  Value<int> rowid,
});
typedef $$ProductsTableUpdateCompanionBuilder = ProductsCompanion Function({
  Value<String> id,
  Value<String> name,
  Value<String?> code,
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
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String> name = const Value.absent(),
            Value<String?> code = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) => ProductsCompanion(id: id, name: name, code: code, rowid: rowid),
          createCompanionCallback:
              ({
                required String id,
                required String name,
                Value<String?> code = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ProductsCompanion.insert(
                id: id,
                name: name,
                code: code,
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
                Value<int> rowid = const Value.absent(),
              }) => PlannedVisitsCompanion(
                id: id,
                customerId: customerId,
                plannedDate: plannedDate,
                sequence: sequence,
                status: status,
                objective: objective,
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
                Value<int> rowid = const Value.absent(),
              }) => PlannedVisitsCompanion.insert(
                id: id,
                customerId: customerId,
                plannedDate: plannedDate,
                sequence: sequence,
                status: status,
                objective: objective,
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
  $$SyncStateTableTableManager get syncState =>
      $$SyncStateTableTableManager(_db, _db.syncState);
}
