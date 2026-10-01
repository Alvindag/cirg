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

## Samples
**Samples tab:** what the rep carries (product, batch, quantity left, expiry; warnings for expiring, expired, quarantined and recalled stock), requests for more stock with their status,
and any hand-over the server refused ("Needs attention"). **On a visit:** *Give samples* → pick batches and quantities → the customer signs once for the lot. Everything is saved offline;
the available quantity drops straight away (counting hand-overs not yet uploaded), and sync sends them after the visit data. The server re-checks expiry, batch status and stock and answers line by line;
a rejected line shows its reason and no longer holds stock back. Giving without a signature is allowed after a warning and is flagged in compliance reports.

## Photos, voice notes and signatures
On the visit screen. Capture works fully offline: files are copied into app storage, hashed (SHA-256) and queued in the `attachments` table.
Sync uploads them one at a time after the visit data (`PUT /attachments/{id}`, hash verified by the server). Permanent rejections show as "Upload failed" with the reason and
never block the queue; temporary failures are retried (a file is given up on after 5 server errors). Local copies of uploaded files are deleted after 7 days.
Photos are taken with the system camera, resized to 1600 px and re-encoded as JPEG (80%); voice notes are mono AAC (about 0.35 MB/min), up to 10 minutes.
Signatures are drawn on screen with the signer's name and what they confirm; they cannot be removed once uploaded.

## Sign-in
`flutter_appauth` (authorization code + PKCE in the system browser; MFA and conditional access are enforced by Entra). Tokens live in secure storage and
are refreshed silently; a revoked refresh token sends the user back to sign-in. If a different user signs in on the same device, the local
database is wiped first, or sign-in is refused while the previous user still has unsynced data.

## Screens
Sign in → Today (planned visits, check-in) · Customers (local search, unplanned visit) · Tasks · Visit (call report, products, follow-up, check-out).

## Not yet done
- Biometric/PIN app lock; sign-in has only been unit-tested with a fake provider (the native browser flow needs a device and a real tenant).
- Database encryption (SQLCipher with a Keychain/Keystore key) and remote wipe.
- Voice-to-text for voice notes (planned with the AI phase), video, gallery picks, attachments viewable for other users' visits.
- Schema migrations v1→v2 (attachments) and v2→v3 (samples) are written but not covered by tests; stock controller and approver screens (API only for now).
- Periodic background GPS pings (needs a foreground service on Android / background modes on iOS, plus rep consent screen).
- E-detailing content download, customer detail screen, create/edit customers on device, planning visits on device.
- Rows the server permanently rejects currently block that batch; add per-item results to `/sync/push` and a "problem items" screen.
- Integration test against a running backend; widget tests; Android/iOS build verification (not done in this environment).
