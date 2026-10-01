# DAS Engage 360 – Architecture

Pharmaceutical CRM / sales-force automation for DAS PLC Ghana. Cloud-native, multi-tenant-ready, API-first, offline-first mobile.

## 1. Technology decisions

| Layer | Choice | Rationale |
|---|---|---|
| Backend | .NET 8 (ASP.NET Core), C# | Best fit with Azure, Entra ID, Power BI, Azure OpenAI |
| Web | React + TypeScript (Vite) | Manager/marketing dashboards, admin |
| Mobile | Flutter (Android + iOS) | One codebase; local SQLite (Drift) for offline |
| Database | Azure Database for PostgreSQL Flexible Server + PostGIS | Geo queries, territories, routes |
| Cache/queue | Redis, Azure Service Bus | Sessions, async jobs, integration events |
| Blob | Azure Blob Storage | Detailing content, voice notes, signatures, photos |
| Identity | Microsoft Entra ID / External ID (OIDC) | SSO, MFA, conditional access |
| Analytics | Power BI Embedded over a reporting schema/read replica | Per requirements |
| AI | Azure OpenAI (behind an AI gateway service) | Summaries, NBA; governed and logged |
| Hosting | Azure (AKS or Container Apps), Front Door + WAF | HA, autoscale |
| Observability | OpenTelemetry, Azure Monitor / App Insights | Tracing, SLOs |

## 2. Service decomposition (microservices, bounded contexts)

Start as a **modular monolith deployed as few services** for the MVP, with strict module boundaries so modules split out later without rewrites. Microservices from day one for a 1,000-user system adds cost with little benefit.

| Service / module | Responsibility | Phase |
|---|---|---|
| Identity & Access | Users, roles, RBAC, tenant context, device registration | 1 |
| Customer Master | HCPs, HCOs, pharmacies, distributors, segmentation | 1 |
| Field Force | Call plans, calendar, visits, check-in/out, call reports, tasks | 1 |
| Tracking | GPS pings, geofence validation | 1 |
| Sync | Offline sync API (push/pull, conflict handling) | 1 |
| Reporting | Reporting schema, dashboard APIs, Power BI feeds | 1 |
| Audit & Compliance | Immutable audit log, e-signatures, approvals | 1 (audit), 3 (workflows) |
| Samples | Inventory, batches, expiry, requests, distribution, signatures | 2 |
| Detailing | Content library, presentations, engagement analytics | 2 |
| Territory | Regions, districts, assignment, balancing, optimization | 2 |
| AI Gateway | Prompting, PII redaction, model governance | 3 |
| ERP Integration | Adapters for inventory, distribution, finance, procurement | 2–3 |

Cross-cutting: API gateway (YARP/Azure APIM), outbox pattern + Service Bus for events, shared tenancy and audit libraries.

## 3. Multi-tenancy

- `tenant_id` on every row; EF Core global query filters plus PostgreSQL Row-Level Security as defence in depth.
- Single database, shared schema for MVP; schema-per-tenant or DB-per-tenant is a later option for large tenants.

## 4. Offline-first mobile

- Local SQLite holds the rep's working set: assigned customers, call plan (next 14 days), products, sample stock, content metadata.
- All writes go to a local **outbox** with client-generated UUIDs (UUIDv7) and are idempotent on the server.
- Sync: `POST /sync/push` (batched ops with `client_op_id`), `GET /sync/pull?since=<cursor>` per entity using server-side change cursors. Soft deletes via tombstones.
- Conflicts: server-authoritative for master data and stock; last-writer-wins with field-level merge for call reports (reps own their own visits, so conflicts are rare). Visit timestamps come from the device, flagged if clock skew is large.
- Low-bandwidth design for Ghana: delta sync, gzip/brotli, resumable content downloads over Wi-Fi, background retry with backoff.
- Local DB encrypted (SQLCipher); keys in Keychain/Keystore; remote wipe on device revoke.
- GPS: check-in captures location + accuracy; periodic pings only during working hours with user-visible consent; geofence check against customer location.

## 5. Security and governance (Module 11)

- Entra ID SSO, MFA enforced, conditional access; short-lived JWTs + refresh tokens bound to the device.
- RBAC + territory-scoped data access (rep sees own territory; managers see their hierarchy).
- Encryption: TLS 1.2+, at rest (Azure-managed keys, CMK for sensitive stores), field-level encryption for sensitive PII.
- Audit trail: append-only `audit_log` (who, what, before/after, device, IP), hash-chained for tamper evidence.
- Electronic signatures: signer identity, timestamp, meaning, record hash (21 CFR Part 11-style).
- Data privacy: Ghana Data Protection Act, 2012 (Act 843) – registration with the Data Protection Commission, consent records, retention rules, data subject requests. Confirm with legal.
- API security: OAuth2 scopes, rate limiting, WAF, input validation, secrets in Key Vault.
- Backup/DR: PITR on PostgreSQL, geo-redundant backups, defined RPO ≤ 15 min and RTO ≤ 4 h (to be agreed). Note Azure region choice (South Africa North is nearest) has data-residency implications.
- Monitoring: Defender for Cloud, Sentinel alerts.
- AI governance: no patient data in prompts, PII redaction, prompt/response logging, human review of AI output, model-use register.

## 6. Reference diagram

```
 Flutter app (offline SQLite) ──┐
 React web app ─────────────────┼─► Front Door/WAF ─► API Gateway ─► Services ─► PostgreSQL (+PostGIS)
 Power BI Embedded ◄── Reporting schema / read replica          │         ├─► Redis
                                                                 │         ├─► Blob Storage
                          Entra ID (SSO/MFA) ◄───────────────────┘         ├─► Service Bus ─► ERP adapters
                                                                            └─► AI Gateway ─► Azure OpenAI
```

## 7. Suggested repository layout

```
/src/backend/{Identity,Customers,FieldForce,Tracking,Sync,Reporting,Audit}/   .NET solution
/src/web/                      React app
/src/mobile/                   Flutter app
/infra/                        Bicep/Terraform, CI/CD
/docs/
```

## 8. Key risks / open questions

1. Data residency and Act 843 compliance for HCP data stored in Azure.
2. Existing ERP at DAS PLC (which system, APIs available?) – drives Module 10.
3. Customer master data quality: initial import of doctors, hospitals, pharmacies.
4. Device fleet: BYOD vs company devices, minimum Android version, MDM.
5. GPS tracking consent and labour-policy implications.
6. Connectivity patterns by region to size sync and content strategy.
