# From the RTM review memo to the platform

The IT memo on the Route-to-Market (RTM) strategy review for DAS Plc asks for four things. This table says where each one lives, and how it was checked.

| Memo need | What the platform does | Where | Checked by |
| --- | --- | --- | --- |
| **Phase 1: complete, de-duplicated data** for Cost-to-Serve and profitability | Scores customer completeness, finds likely duplicates (same phone, same or very similar name in the same city), lists missing phone, city, territory, GPS, bad emails. Merging keeps the old record, so history and seals still verify. New customers are checked for duplicates before saving. | Data quality (`/data-quality`), `lib/rtm/dq.ts` | `rtm.test.ts`, `api.test.ts` (merge keeps visit history and the hash chain) |
| **SFA / mobile CRM, offline** | Visits and calls with outcome, product and notes. Works without signal: visits wait on the device and upload on reconnect. A client ID makes retries safe. | Visits and tasks (`/activities`), `lib/das/offlineQueue.ts`, `POST /visits/sync` | `offlineQueue.test.ts`, `api.test.ts`, browser run (offline then online) |
| **GPS verification of calls** | The server compares the check-in to the customer's saved location (250 m). The device cannot mark a visit verified. | `lib/rtm/geo.ts`, `POST /visits` | `api.test.ts` ("ignores a verified flag sent by the device") |
| **Secure sync, tamper-proof visit data** | Visits and the audit trail are hash-chained. The Access page re-computes every seal. | `lib/rtm/hashchain.ts`, Access rules and record integrity (`/access`) | `api.test.ts` ("detects a changed record") |
| **Sales-force evaluation, Northern regions** | Per-rep plan attainment, coverage, verified share, late uploads. North compared with the rest. Regional hot spots with the main cause (late or short deliveries). | Field force (`/field-force`), Route to market (`/rtm`) | `api.test.ts` (worst regions include the North) |
| **Secure distributor portal with RBAC** | Partners see only their own price list, stock, orders and performance. The partner comes from the account, never from the request. Partners are refused every internal endpoint. Partners can request stock. | Distributor portal (`/portal`), `lib/server/routes/rtm.ts` | `api.test.ts` (spoofed distributor id ignored; internal endpoints return 403) |
| **TCO in financial modelling** | Devices, refresh, data plans, licences, hosting, integration, training and support, over a chosen number of years. Per year, per rep, per visit. Scenarios can be saved and compared. | Cost of ownership (`/tco`), `lib/rtm/tco.ts` | `rtm.test.ts`, `api.test.ts` |
| **GMP data integrity, track and trace** | Batch trace from receipt to reps to customers, recall impact, FEFO issue, blocked hand-over of quarantined, recalled or expired batches, per-customer sample limits, signed hand-overs, ledger reconciliation. | Batch trace (`/trace`), Samples (`/samples`) | `api.test.ts` (request, approve, issue, hand over, recall, trace) |
| **Cheat-sheet metrics** | Cost-to-Serve, Order Cycle Time, OTIF (on time **and** in full), Numerical Reach, Channel Conflict. | Route to market (`/rtm`), `lib/rtm/metrics.ts` | `rtm.test.ts` |

## ALCOA+ at a glance

| Principle | How it is met |
| --- | --- |
| Attributable | Every visit, change and approval stores who did it. |
| Contemporaneous | Visits keep the time they happened and the time the server received them. |
| Original | Records are added to, not overwritten. Merges and removals keep the old record. |
| Accurate | The server decides the GPS verdict. |
| Complete | Client IDs make a retry neither lost nor doubled. |
| Enduring and consistent | Hash-chained records and an append-only audit trail. |

## What this is not

- It is **not** a certified validated GxP system and not a substitute for Ghana FDA registration. It gives the data model and the evidence trail. Validation, electronic signatures that meet 21 CFR Part 11, and GS1 serial-number capture are separate work.
- The built-in sign-in is a **demo role picker**. Production needs real sign-in (Microsoft Entra) before real data or partners.
- The built-in data store is one JSON file. It suits a demo or a single-server pilot. For production, point `DAS_API_BASE_URL` at the DAS Engage 360 API (PR #7), which has the real database.
- The sample data is invented, and built to contain the problems the memo describes (duplicates, gaps, weaker Northern service).

## Sources

- Ghana's pharmaceutical traceability strategy (GS1): [Ministry of Health](https://www.moh.gov.gh/health-minister-has-launched-the-ghana-global-standard-for-pharmaceutical-traceability-strategy/), [GNA on the FDA guidelines](https://gna.org.gh/2023/11/fda-launches-guidelines-to-secure-pharmaceutical-supply-chain-in-ghana/)
- ALCOA+ and audit trails: [ALCOA+ guide](https://intuitionlabs.ai/articles/alcoa-plus-gxp-data-integrity), [audit trail review paper](https://scdm.org/wp-content/uploads/2024/07/2021-eCF_SCDM-ATR-Industry-Position-Paper-Version-PR1-2.pdf)
- Pharma field tools with GPS and offline sync: [example vendor description](https://myfieldheroes.com/pharma/)
