import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

/// Opens the on-device database.
/// TODO(security): swap in SQLCipher (sqlcipher_flutter_libs) with a key held in the Keychain/Keystore.
QueryExecutor openDeviceDatabase() => LazyDatabase(() async {
      final dir = await getApplicationSupportDirectory();
      return NativeDatabase.createInBackground(File(p.join(dir.path, 'das_engage.sqlite')));
    });
