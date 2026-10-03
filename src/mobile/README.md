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
  The server answers item by item: an item it takes is cleared; one it refuses for good (a visit to a customer that no longer exists, a customer outside the rep's territory) is not resent
  but listed under **Problem items**, so it never blocks the rest. A failure of the whole request leaves everything queued. Pull never overwrites unsent local edits.
  Customers and planned visits go first, then visits, reports and tasks, so a customer added offline, a visit planned for it and the visit itself can arrive in one sync.
- `lib/providers.dart`: syncs at start, when connectivity returns, every 5 minutes and on demand. The sync icon shows the number of unsent items.

## Samples
**Samples tab:** what the rep carries (product, batch, quantity left, expiry; warnings for expiring, expired, quarantined and recalled stock), requests for more stock with their status,
and any hand-over the server refused ("Needs attention"). **On a visit:** *Give samples* → pick batches and quantities → the customer signs once for the lot. Everything is saved offline;
the available quantity drops straight away (counting hand-overs not yet uploaded), and sync sends them after the visit data. The server re-checks expiry, batch status and stock and answers line by line;
a rejected line shows its reason and no longer holds stock back. Giving without a signature is allowed after a warning and is flagged in compliance reports.

## Customers and planning
**Customers tab:** tap a customer for their details, upcoming plans and recent visits, and to check in, plan a visit (date and objective) or edit. **Add customer** works offline (name, type, address, phone,
position taken from where the rep stands); the server sets the territory and may refuse a change, which then shows under Problem items. A planned visit that has not started can be cancelled
(from the customer, or by long-pressing it on the Today tab).

## Notices and problem items
The **⋮ menu** has **Notices** (for example "Recall: Amoxil batch B-1, you hold 10 units": created when a batch the rep holds is recalled or quarantined; reading a notice is reported at the next sync) and
**Problem items** (retry one after the cause is fixed, or remove it from the phone). Notices arrive with sync, not as a push to a locked phone.

## Security
- **PIN lock** (⋮ > Security): 4 to 8 digits, no repeated or sequential digits, stored only as a salted, iterated hash in the keychain; optional fingerprint / face (`local_auth`); locks when the app was in the
  background longer than the chosen time. Five wrong PINs in a row sign the person out (the PIN is cleared with the session; the data stays until they sign in again). It stops someone using a lost phone; it does **not** encrypt the local database.
- **Remote wipe:** an administrator calls `POST /admin/users/{id}/wipe-device` (before deactivating the account). At its next sync the phone first uploads anything waiting, then deletes all local data and captured files, tells the server, and returns to sign-in.

## AI
**Today tab:** "Suggested for you" (next best actions, cached for offline) and *Optimise today's route*. **On a visit:** *Transcribe voice note* and *Draft summary with AI* (online; hidden unless
the organisation has opted in). Drafts open in an editable dialog; accepted text is added to the call notes and follow-ups become tasks on the device. See `docs/ai.md`.

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

## Tests
`flutter test` runs unit and widget tests (sync results, schema upgrade from v4, app lock, screens). **Live-backend tests** (`test/integration`) run the real sync code against a running API and are skipped unless `DAS_API` is set:
`DAS_API=http://localhost:5111 flutter test test/integration --tags integration` (the API in Development with `Auth__DevSigningKey`, as in `docker-compose.yml`). CI runs them against a freshly built API.

## Not yet done
- Sign-in has only been unit-tested with a fake provider (the native browser flow needs a device and a real tenant); the fingerprint / face prompt and the Android/iOS builds were not run (no Android SDK or Xcode here).
- Database encryption (SQLCipher with a Keychain/Keystore key): needs native libraries that could not be built here. Until then the PIN lock and remote wipe are the protection for a lost phone.
- Push notifications to a locked phone (needs Firebase / Apple push credentials); notices arrive with sync.
- Video, gallery picks, attachments viewable for other users' visits; periodic background GPS pings (needs a foreground service on Android / background modes on iOS, plus a rep consent screen).
- E-detailing content download.
- Stock controller and approver screens on the phone (the web dashboard has them).
- Schema upgrades from v1, v2 and v3 are written but only v4 to v5 is covered by a test.

## Sync status
The pill under the title bar says whether the phone is up to date. When a sync fails it says why in plain words (wrong address, server not reachable, firewall, server error) and tapping it shows the details with a **Try again** button. Changes stay safe on the phone until they upload.

## Look
Colours come from the DAS logo (red for identity, charcoal for structure, blue for actions) and follow the phone's light or dark setting. The theme is in `lib/ui/theme.dart`.

## Trying it on a phone against your own PC
Run `scripts/dev-api-lan.ps1` on the PC: it starts the API on every network address (the normal launch profile listens on localhost only, which no phone can reach), opens the firewall port, and prints the addresses to type into the phone. On the sign-in screen enter the address with its port (for example `http://192.168.1.148:5111`), tap **Test connection**, and only then paste the token.

## Why the server sends a scope with every pull
A phone asks for what changed since its last sync. That is only enough while the person's scope (who they are, their role and territory) stays the same. When a rep moves to another territory, the customers there changed long ago, so the server would never send them. The server therefore includes a `scope` fingerprint in each pull and the phone sends back the last one it saw; when they differ (or the phone has none yet) the server sends everything again once. If a phone ever looks stuck on old data, Android Settings, Apps, DAS Engage, Storage, Clear data, then sign in again, forces a full download.

