/// Build-time configuration, supplied with `--dart-define`, for example:
///   `flutter run --dart-define=ENTRA_TENANT=DIRECTORY_ID --dart-define=ENTRA_CLIENT_ID=MOBILE_APP_CLIENT_ID`
///   `--dart-define=API_BASE_URL=https://api.example.com`
class AppConfig {
  const AppConfig._();

  /// Directory (tenant) id or domain. Leave as `organizations` to let the user type their organisation at sign-in.
  static const entraTenant = String.fromEnvironment('ENTRA_TENANT', defaultValue: 'organizations');

  /// Client id of the *mobile* app registration (public client, redirect URI below).
  static const entraClientId = String.fromEnvironment('ENTRA_CLIENT_ID');

  /// Delegated scope exposed by the API app registration.
  static const apiScope = String.fromEnvironment('API_SCOPE', defaultValue: 'api://das-engage-360/access_as_user');

  static const apiBaseUrl = String.fromEnvironment('API_BASE_URL');

  /// Must be registered under "Mobile and desktop applications" and match the Android/iOS URL scheme.
  static const redirectUrl = 'gh.com.das.engage://oauth/redirect';

  /// Shows the paste-a-token sign-in. Development builds only.
  static const devLogin = bool.fromEnvironment('DEV_LOGIN');

  static bool get entraConfigured => entraClientId.isNotEmpty;
  static bool get tenantIsFixed => entraTenant != 'organizations' && entraTenant != 'common';
}
