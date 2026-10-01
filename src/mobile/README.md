# DAS Engage 360 – Mobile (Flutter, offline-first)

Rep app for Android and iOS. Everything a rep does in the field writes to a local SQLite database (Drift), so the app works with no
signal; the sync engine uploads and downloads when a connection is available.

## Run
```bash
flutter pub get
dart run build_runner build --delete-conflicting-outputs   # regenerates lib/data/database.g.dart after schema changes
flutter test
flutter run
```
Sign-in is Microsoft Entra ID (see `docs/entra-setup.md`); pass `--dart-define=ENTRA_CLIENT_ID=… --dart-define=API_BASE_URL=…`
(and `ENTRA_TENANT`). `--dart-define=DEV_LOGIN=true` adds a paste-a-token screen for development.

## How offline works
- `lib/data/database.dart`: local tables. Rows created on the device have client-generated UUIDs and a `dirty` flag.
- `lib/services/visit_service.dart`: check-in / check-out (with GPS when available), call report (one per visit), follow-up tasks, GPS pings.
  Never touches the network.
- `lib/services/sync_service.dart`: `POST /sync/push` (idempotent, safe to retry), then `GET /sync/pull?since=<cursor>` (deltas + tombstones).
  Dirty flags are cleared only after the server accepts the whole batch; a failure leaves everything queued. Pull never overwrites unsent local edits.
- `lib/providers.dart`: syncs at start, when connectivity returns, every 5 minutes and on demand. The sync icon shows the number of unsent items.

## Sign-in
`flutter_appauth` (authorization code + PKCE in the system browser; MFA and conditional access are enforced by Entra). Tokens live in secure storage and
are refreshed silently; a revoked refresh token sends the user back to sign-in. If a different user signs in on the same device, the local
database is wiped first, or sign-in is refused while the previous user still has unsynced data.

## Screens
Sign in → Today (planned visits, check-in) · Customers (local search, unplanned visit) · Tasks · Visit (call report, products, follow-up, check-out).

## Not yet done
- Biometric/PIN app lock; sign-in has only been unit-tested with a fake provider (the native browser flow needs a device and a real tenant).
- Database encryption (SQLCipher with a Keychain/Keystore key) and remote wipe.
- Camera capture, voice notes (record + upload to Blob Storage), digital signatures.
- Periodic background GPS pings (needs a foreground service on Android / background modes on iOS, plus rep consent screen).
- E-detailing content download, sample management, customer detail screen, create/edit customers on device, planning visits on device.
- Rows the server permanently rejects currently block that batch; add per-item results to `/sync/push` and a "problem items" screen.
- Integration test against a running backend; widget tests; Android/iOS build verification (not done in this environment).
