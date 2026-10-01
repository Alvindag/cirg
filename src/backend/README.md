# DAS Engage 360 – Backend (Phase 1)

.NET 8 modular monolith: `Domain` (entities), `Infrastructure` (EF Core + PostgreSQL, tenancy, audit), `Api` (minimal APIs, JWT).

## Run
```bash
# needs PostgreSQL; edit ConnectionStrings:Default in appsettings.Development.json
dotnet ef database update -p src/DasEngage.Infrastructure -s src/DasEngage.Api
dotnet run --project src/DasEngage.Api      # Swagger at /swagger
dotnet test
```
Production auth is Entra ID (`Auth:Authority`, `Auth:Audience`). `Auth:DevSigningKey` is honoured only in Development/Testing.
Tokens must carry claims `tid` (tenant), `uid` (app user id), `terr` (territory, optional) and a role claim.

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

## Not yet done (known gaps)
- PostgreSQL row-level security policies (defence in depth) – add in a migration.
- Bulk customer import.
- Deactivated users still hold valid tokens until expiry; add an active-user check (or short token lifetimes) at the gateway.
- The `terr` claim comes from the token; keep the IdP in sync with `AppUser.TerritoryId`.
- Customer search uses `ILike` (PostgreSQL only), so it is not covered by the in-memory tests; run integration tests against Postgres (Testcontainers) before go-live.
- Attachment/voice-note upload to Blob Storage, approval workflows, e-signatures, PostGIS spatial queries, Power BI reporting views.
- Sync pull is cursor-by-`UpdatedAt` (server clock); move to a monotonic version column if clock skew becomes an issue.
