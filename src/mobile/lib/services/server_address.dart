/// The address of the API was typed wrongly or left unfinished. The message is meant to be shown as it is.
class ServerAddressException implements Exception {
  ServerAddressException(this.message);
  final String message;
  @override
  String toString() => message;
}

const _example = 'for example http://192.168.1.20:5111 or https://api.example.com';

/// Cleans up what a person typed into "Server address" and refuses anything that cannot work,
/// so a half-typed address is caught at sign-in instead of failing every sync later.
String normalizeServerAddress(String input) {
  var s = input.trim();
  if (s.isEmpty) throw ServerAddressException('Enter the server address, $_example.');
  if (!RegExp(r'^[a-zA-Z][a-zA-Z0-9+.-]*:/').hasMatch(s)) {
    // 192.168.x.x:5111 and localhost are development servers (plain http); anything else is assumed to be https.
    s = (RegExp(r'^(\d{1,3}\.){3}\d{1,3}(:\d+)?(/|$)').hasMatch(s) || s.startsWith('localhost')) ? 'http://$s' : 'https://$s';
  }
  final uri = Uri.tryParse(s);
  if (uri == null || !(uri.scheme == 'http' || uri.scheme == 'https') || uri.host.isEmpty) {
    throw ServerAddressException('The server address is not complete, $_example.');
  }
  return s.replaceAll(RegExp(r'/+$'), '');
}
