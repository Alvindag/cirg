import 'dart:async';

import 'package:http/http.dart' as http;

import 'server_address.dart';
import 'sync_explain.dart';

class ServerCheck {
  const ServerCheck(this.ok, this.message, [this.address]);
  final bool ok;
  final String message;

  /// The tidied address that was tested (so the screen can put it back in the field).
  final String? address;
}

/// Asks the server whether it is up (`/health/ready` needs no sign-in), and explains in plain words when it is not.
/// Lets a person test the address before signing in, instead of finding out from a failed sync.
Future<ServerCheck> checkServer(String input, {http.Client? client, Duration timeout = const Duration(seconds: 8)}) async {
  final String address;
  try {
    address = normalizeServerAddress(input);
  } on ServerAddressException catch (e) {
    return ServerCheck(false, '$e');
  }
  final c = client ?? http.Client();
  try {
    final r = await c.get(Uri.parse('$address/health/ready')).timeout(timeout);
    if (r.statusCode == 200) return ServerCheck(true, 'Connected. The server at $address is ready.', address);
    if (r.statusCode == 404) return ServerCheck(false, 'Something answered at $address, but it does not look like the DAS Engage server. Check the address and the port.', address);
    return ServerCheck(false, 'The server at $address answered but is not ready (code ${r.statusCode}). Is its database running?', address);
  } catch (e) {
    return ServerCheck(false, explainSyncFailure(e, address), address);
  } finally {
    if (client == null) c.close();
  }
}
