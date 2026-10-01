# Phase 1 MVP Plan

Scope: Customer Management, Field Force Automation, Call Reporting, GPS Tracking, Mobile App, Dashboards.

## Epics and user stories

### E1 Identity, tenancy and security foundation
- As an admin I can create users, assign roles (Rep, Area Mgr, Regional Mgr, NSM, Marketing, KAM, Exec) and territories.
- SSO + MFA login on web and mobile; device registration and revoke.
- Audit log of all create/update/delete actions.

### E2 Customer master data
- CRUD for HCPs, pharmacists, hospitals, clinics, pharmacies, distributors, government institutions; HCP ↔ HCO affiliations.
- Specialty, segmentation (A/B/C tier), product interests, geo-location, contacts.
- Bulk import (CSV/Excel) with validation and de-duplication.
- Rep-proposed new customers/changes go through manager approval.
- Customer 360 view: visit and interaction history.

### E3 Field force automation
- Call plan: reps schedule visits; manager sets target frequency per segment.
- Calendar (day/week), planned vs. actual.
- Check-in / check-out with GPS and geofence flag.
- Call report: attendees, products discussed, notes, outcome, next step, attachments (photo), voice note upload.
- Follow-up tasks with due dates and reminders.
- Daily route view (map, ordered stops; simple nearest-neighbour ordering in MVP).

### E4 GPS tracking
- Location captured at check-in/out; optional periodic pings in working hours with consent.
- Manager map view of rep activity for the day; flags for out-of-geofence visits.

### E5 Mobile app (Flutter)
- Offline DB, sync engine, background sync, conflict handling, encrypted storage.
- Camera, voice notes (stored; transcription is Phase 3), GPS.

### E6 Dashboards
- Rep: calls today/week, plan adherence, tasks.
- Manager/Sales: calls completed, coverage % (customers visited vs. target), frequency compliance, by territory/rep.
- Executive: coverage and activity overview (revenue trends come once ERP data is connected; use manual/CSV sales import in MVP).
- Power BI over the reporting schema.

## Delivery plan (indicative, team of ~6)

| Sprint block | Outcome |
|---|---|
| 0 (2 wks) | Discovery workshops, data-model sign-off, Azure landing zone, CI/CD, design system |
| 1–2 | Identity, tenancy, audit, customer master + import (web) |
| 3–4 | Call plan, calendar, call report APIs; mobile skeleton + offline DB |
| 5–6 | Check-in/out + GPS, sync engine hardening, tasks |
| 7–8 | Dashboards, Power BI, manager map, UAT, security test |
| 9 | Pilot with ~20 reps in one region, then phased rollout |

## Core data model (Phase 1)

`tenant`, `user`, `role`, `user_role`, `territory`, `user_territory`, `device`,
`customer` (type: HCP/pharmacist/HCO/pharmacy/distributor/govt), `customer_affiliation`, `specialty`, `customer_segment`, `customer_product_interest`, `product`,
`call_plan`, `planned_visit`, `visit` (check-in/out time, lat/lng, accuracy, geofence_ok), `call_report`, `call_report_product`, `attachment`, `task`,
`gps_ping`, `audit_log`, `sync_cursor`.
All tables: `id uuid`, `tenant_id`, `created_at/by`, `updated_at/by`, `deleted_at`, `row_version`.

## API outline (REST, versioned `/api/v1`)

- `/customers`, `/customers/{id}/visits`, `/customers/import`
- `/call-plans`, `/planned-visits`, `/visits/{id}/check-in`, `/visits/{id}/check-out`
- `/call-reports`, `/tasks`, `/attachments`
- `/sync/push`, `/sync/pull`
- `/dashboards/{rep|sales|executive}`
- `/users`, `/roles`, `/territories`, `/audit-logs`

OpenAPI spec generated from code and published to the team; contract tests on the mobile client.

## Success metrics mapping

| Metric | How measured in MVP |
|---|---|
| 95% field activity visibility | Share of planned/actual visits with synced call reports within 24 h |
| 90% reduction in manual reports | Manual report types retired; reps submitting via app |
| Real-time sales intelligence | Dashboard data freshness < 15 min after sync |
| Market coverage | Coverage % per segment/territory |

## Out of MVP (later phases)
Samples, e-detailing, territory optimization (Phase 2); AI, predictive analytics, advanced approval workflows (Phase 3); ERP integration starts in Phase 2.
