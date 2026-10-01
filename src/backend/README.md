# DAS Engage 360 – Backend (Phase 1)

.NET 8 modular monolith: `Domain` (entities), `Infrastructure` (EF Core + PostgreSQL, tenancy, audit), `Api` (minimal APIs, JWT).

## Run
```bash
# needs PostgreSQL; edit ConnectionStrings:Default in appsettings.Development.json
dotnet ef database update -p src/DasEngage.Infrastructure -s src/DasEngage.Api
dotnet run --project src/DasEngage.Api      # Swagger at /swagger
dotnet test
```
Production auth is Microsoft Entra ID: see `docs/entra-setup.md` (app registrations, `Auth:*` settings, onboarding with
`provision-tenant`). The API maps the token's directory id to a tenant and its object id to a user, and takes role, territory and
active status from the database (role and `das_*` claims inside tokens are ignored; deactivated users are cut off within a minute).
`Auth:DevSigningKey` is honoured only in Development/Testing; dev tokens carry the claims `das_tid`, `das_uid`, optional `das_terr`, and a role.

## What's implemented
Customers (CRUD, territory scoping, segmentation, product interests), planned visits, GPS check-in/out with geofence check,
call reports, follow-up tasks, GPS pings, offline sync (`/sync/pull`, idempotent `/sync/push`), sales dashboard, hash-chained audit log,
tenant isolation (EF global filters), rate limiting, health check.

## Users, territories and hierarchy
- `/api/v1/admin/territories` and `/api/v1/admin/users` (list, get, `/{id}/team`, create, update, `deactivate?reassignTo=`, `reactivate`); `/api/v1/me`.
  Writes: Admin or National Sales Manager. Reads: managers.
- Hierarchy is `AppUser.ManagerId`: rep → area manager → regional manager → NSM. Validation blocks self-management, cycles,
  wrong seniority and reps without a manager; deactivating a manager requires handing their reports to someone senior.
- `TeamScope` limits data by role: reps see themselves and their territory; area/regional managers see their subtree's users, visits,
  call reports, GPS, dashboards and their territories' customers; NSM, executive, admin, marketing and KAM see the whole tenant.

## Bulk customer import
`POST /api/v1/customers/import?dryRun=true&onDuplicate=skip&allowPossibleDuplicates=false` with the CSV as the body (`Content-Type: text/csv`).
Roles: area/regional/national managers and admin. Sample: `samples/customers-import.csv`.
- Columns: `type,name` required; optional `specialty,segment,territory,parent,phone,email,address,city,latitude,longitude,target_visits_per_month`.
  `territory` and `parent` are matched by name; `parent` may be a row earlier in the same file. Comma or semicolon delimited, UTF-8, max 5,000 rows / 5 MB.
- Dry run is the default: it returns a per-row report (`created`, `updated`, `duplicate`, `possible_duplicate`, `error`) and saves nothing. Send `dryRun=false` to commit.
  Valid rows are imported even if other rows fail; fix the failures and re-run (already-imported rows then show as duplicates).
- De-duplication (against the database and earlier rows in the file): exact match on email, phone + type (last 9 digits, so `024…` = `+233 24…`),
  or type + name + city, where names ignore case, accents, punctuation and titles (Dr, Prof, Pharm…).
  Near matches (same type and city, names 1–2 edits apart) are reported as `possible_duplicate` and skipped unless `allowPossibleDuplicates=true`.
- `onDuplicate=update` fills the non-empty fields of an exact match that already exists; it never blanks fields.
- Area/regional managers must give a territory inside their scope for every row. A blank `target_visits_per_month` defaults from segment (A=4, B=2, C=1).
- Excel files are not read directly; export to CSV first.

## Attachments (photos, voice notes, signatures)
`PUT /api/v1/attachments/{id}?kind=Photo|VoiceNote|Signature&visitId=…` with the file as the body, its `Content-Type`, and `X-Content-SHA256` (hex).
Also `GET /attachments?visitId=`, `GET /attachments/{id}/content`, `DELETE /attachments/{id}` (not for signatures).
- Uploads are idempotent on the client-generated id; a different file under the same id is refused (409). The server re-hashes the body and rejects a
  mismatch (corrupted/truncated upload), checks type, size (photo 10 MB, voice 25 MB, signature 1 MB) and magic bytes, and only accepts uploads for
  the caller's own visit that already exists on the server (otherwise 409, the app retries after the next sync).
- Files go to `IBlobStore`: `Storage:Provider=azure` (`AccountUrl` + managed identity, or `ConnectionString`) or `local` (`LocalPath`).
  Keys are generated server-side (`tenant/yyyy/MM/id.ext`); downloads are `attachment` with `nosniff` and a locked-down CSP.
- A signature stores signer name, meaning and a `recordHash` = SHA-256 of `id|visitId|signer|meaning|capturedAt|fileSha256`, binding the image to who/what/when. It cannot be deleted.
  This is an electronic-signature *record* for accountability, not a qualified signature; confirm legal weight under the Electronic Transactions Act, 2008 (Act 772).
- Access follows the team scope (reps: own; managers: their subtree). All creates and deletes are in the audit log.
- Photos can contain patient or other personal data: set a retention policy and storage-account lifecycle rules, and cover this in the data-protection assessment (Act 843).

## Sample management (`/api/v1/samples`)
Stock is an **immutable ledger** (`StockMovement`): nothing is edited, every change is a movement, and a balance is the sum for a batch and holder
(warehouse or a rep). Movements: receipt, issue to rep, return, distribution, write-off, adjustment. Updating or deleting a movement is refused.
- **Batches** (Admin/NSM): `POST /batches` (number, expiry; unique per product), `POST /batches/{id}/status` (Quarantined/Recalled with a reason; a recalled batch cannot be reactivated),
  `POST /receipts`, `POST /adjustments` (reason mandatory, never below zero), `POST /returns` (rep → warehouse).
- **Requests:** rep `POST /requests` → manager in the rep's reporting line `POST /requests/{id}/approve` (may reduce, never raise; not your own) or `/reject` (reason) →
  Admin/NSM `POST /requests/{id}/fulfil`, which issues **oldest expiry first (FEFO)** from active batches with at least 30 days of shelf life, or from explicit allocations;
  a shortfall needs `allowPartial`. Reps can `/cancel` open requests.
- **Distribution:** `POST /distributions`, or `sampleDistributions` in `/sync/push`. Validated against batch (active, not expired on the distribution date, right product),
  customer and visit (the rep's own, same customer), and **the rep's own balance**. Idempotent on the id. Sync returns a result per line (`accepted`/`duplicate`/`rejected` + reason),
  so one refused line never blocks the rest. Stock-changing work runs in a serializable transaction on PostgreSQL (retry on SQLSTATE 40001).
- **Signatures:** a distribution may reference a signature attachment (`signatureAttachmentId`); it can arrive after the distribution (offline). Reports show `Signed`, `Awaiting upload` or `None`.
- **Reports (managers, team-scoped):** `/reports/stock` (who holds what, expired/expiring/recalled flags and `actionRequired`), `/reports/distributions` (JSON or `&format=csv`, formula-safe),
  `/reports/compliance` (unsigned hand-overs by rep, stock held past expiry or in recalled batches, write-offs, and a ledger reconciliation), `/reports/ledger?batchId=` (Admin/NSM).
- `sync/pull` now also returns the caller's `sampleStock` (full snapshot) and their `sampleRequests` from the last 90 days.
- Regulatory rules (sample limits per HCP, signature mandatory, controlled substances, record retention) vary: confirm them with the DAS regulatory team and the Ghana FDA before go-live.

## Dashboard endpoints
`GET /dashboards/sales`, `/dashboards/trend` (completed calls per day, zero-filled) and `/dashboards/products` (calls discussing each product, sample units given); all team-scoped.
Browser access needs the dashboard origin in `Cors:AllowedOrigins`.

## AI (`/api/v1/ai`)
See `docs/ai.md`. Generative: `POST /transcriptions`, `POST /visit-summaries`, `GET /outputs`, `POST /outputs/{id}/decision`, `GET /status`, `POST /settings` (Admin/NSM opt-in).
Rule-based: `GET /customers/scores`, `/customers/{id}/score`, `/next-best-actions`, `/opportunities`, `/territories/balance`, `POST /territories/moves/apply`, `POST /routes/optimize`.
Governance: `GET /governance` (Admin/NSM/Executive). Models sit behind `IChatModel`/`ITranscriber` (Azure OpenAI over REST, managed identity); tests use fakes.

## Not yet done (known gaps)
- PostgreSQL row-level security policies (defence in depth) – add in a migration.
- Entra sign-in is tested with locally signed tokens (the real Entra metadata endpoint is not reachable from the build environment); verify once against a real tenant.
- No self-service tenant sign-up or tenant admin UI; customers are onboarded with `provision-tenant`.
- Customer search uses `ILike` (PostgreSQL only), so it is not covered by the in-memory tests; run integration tests against Postgres (Testcontainers) before go-live.
- Sample management: no UI for stock controllers or approvers yet (API only); no per-HCP sample limits; no recall notification push to reps; serializable-transaction retry is not automated.
- Malware scanning of uploads, thumbnails, streaming uploads (bodies are buffered up to the size cap), approval workflows, e-signatures, PostGIS spatial queries, Power BI reporting views.
- Sync pull is cursor-by-`UpdatedAt` (server clock); move to a monotonic version column if clock skew becomes an issue.
