import 'dart:async';
import 'dart:io';

import 'package:http/http.dart' as http;

import 'api_client.dart';

/// Turns a failed sync into a sentence a person can act on. The raw error stays available for support.
String explainSyncFailure(Object error, String serverAddress) {
  final where = serverAddress.trim().isEmpty ? 'the server' : serverAddress.trim();
  final text = '$error'.toLowerCase();

  if (error is ApiException) {
    if (error.statusCode == 404) return 'The server at $where answered "not found". The address may be wrong, or your user may not exist on the server yet.';
    if (error.statusCode >= 500) return 'The server at $where had a problem (code ${error.statusCode}). Try again in a moment, and tell your administrator if it keeps happening.';
    return 'The server at $where refused the request (code ${error.statusCode}).';
  }
  if (error is ArgumentError || text.contains('no host specified')) {
    return 'The server address saved in the app is incomplete. Sign out, then sign in again with the full address, for example http://192.168.1.20:5111.';
  }
  if (text.contains('cleartext')) return 'This build only allows secure (https) server addresses. Use an https address.';
  if (error is TimeoutException || text.contains('timed out')) {
    return 'The server at $where did not answer in time. Check the address, that this phone is on the same Wi-Fi as the server, and that the server\'s firewall allows the connection.';
  }
  if (text.contains('connection refused')) return 'The server at $where refused the connection. Is it running, and listening on the network (not only on its own localhost)?';
  if (text.contains('failed host lookup') || text.contains('nodename nor servname')) return 'Cannot find $where. Check the server address for typing mistakes.';
  if (text.contains('network is unreachable') || text.contains('no route to host')) return 'This phone has no route to $where. Check that Wi-Fi or mobile data is on.';
  if (error is SocketException || error is http.ClientException || error is HandshakeException) return 'Cannot reach $where. Check the address, your connection and that the server is running.';
  return 'Sync did not finish. Your changes are safe on this phone and will upload when it works.';
}
