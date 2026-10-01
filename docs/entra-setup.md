# Microsoft Entra ID sign-in – setup

Two app registrations in the Entra admin centre (in the vendor tenant that publishes the API, or in DAS PLC's own tenant for a single-company deployment).

## 1. API registration ("DAS Engage 360 API")
1. Expose an API: Application ID URI `api://das-engage-360` (or your own).
2. Add a scope `access_as_user` (admins and users can consent).
3. Manifest: `"requestedAccessTokenVersion": 2` (the API only accepts v2.0 tokens; issuer `https://login.microsoftonline.com/{tid}/v2.0`).
4. Multi-tenant SaaS: set "Supported account types" to *Accounts in any organizational directory*. Each customer's admin grants consent once.

## 2. Mobile registration ("DAS Engage 360 Mobile")
1. Platform *Mobile and desktop applications*, custom redirect URI `gh.com.das.engage://oauth/redirect`. Allow public client flows.
2. API permissions: the `access_as_user` scope of the API above (plus `openid`, `profile`, `offline_access`).
3. Conditional Access (MFA, compliant device) is enforced by Entra on the customer's side; nothing to build in the app.

## 3. API configuration (`appsettings.json` / App Service settings)
```json
"Auth": {
  "Authority": "https://login.microsoftonline.com/organizations/v2.0",
  "MultiTenant": true,
  "ValidAudiences": [ "api://das-engage-360", "<api-app-client-id>" ],
  "RequiredScope": "access_as_user"
}
```
Single customer: set `Authority` to `https://login.microsoftonline.com/<directory-id>/v2.0` and `MultiTenant` to `false`.

## 4. Onboard a customer
Create the tenant and its first administrator (needs the connection string; runs migrations first):
```bash
dotnet DasEngage.Api.dll provision-tenant "DAS PLC Ghana" <entra-directory-id> <admin-object-id> "Admin Name" admin@dasplc.com
```
`<admin-object-id>` is the Object ID of the user in Entra (Users → user → Object ID). After that the admin signs in and adds the rest of the
users with `POST /api/v1/admin/users`, using each person's Entra **object id** as `externalId`.

## 5. Mobile build
```bash
flutter run \
  --dart-define=ENTRA_TENANT=<directory-id>            # or omit to let users type their organisation
  --dart-define=ENTRA_CLIENT_ID=<mobile-app-client-id> \
  --dart-define=API_BASE_URL=https://api.example.com \
  --dart-define=API_SCOPE=api://das-engage-360/access_as_user
```
Add `--dart-define=DEV_LOGIN=true` for the paste-a-token screen (development only).

## How the pieces fit
- The app signs in with the system browser (authorization code + PKCE), keeps tokens in the Keychain/Keystore, and refreshes silently.
- The API validates the token (signature, audience, issuer for that directory, lifetime, `access_as_user` scope), maps
  *directory id → tenant* and *object id → user*, and takes the **role, territory and active flag from its own database**.
  Roles or `das_*` claims inside a token are ignored. An unknown directory or user gets 403; a deactivated user loses access within
  `Auth:UserCacheSeconds` (60 s) even though their token is still valid.
- On a shared device, a different user signing in gets a clean local database; this is refused while the previous user has unsynced work.
