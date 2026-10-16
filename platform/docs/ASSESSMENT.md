# Assessment of ITAM v2 and CyberShield v3, and what changed

Scope: source review of `app.py` in each product plus the bundled databases. This is a developer-led readiness review against the named frameworks, **not** an independent audit or certification.

## Findings and status

| # | Finding | Product | Severity | Status |
|---|---|---|---|---|
| 1 | Flask `secret_key` hard-coded in source | ITAM | High | **Fixed**: `ITAM_SECRET_KEY` or a generated, persisted key |
| 2 | Shipped default accounts (`admin/admin123` etc.) printed at start-up and in `run.bat`; seeded on every fresh DB | ITAM | High | **Detected** by Hub control AC-12. *You must change these passwords*; the code still seeds them to avoid breaking installs |
| 3 | Default admin `Admin@DAS2026!` hard-coded (forces change at first login) | CyberShield | Medium | Detected by AC-12; first-login change already enforced |
| 4 | Both apps shared the cookie name `session` on one host, so running them together logs one out | CyberShield | Medium | **Fixed**: `cybershield_session` (ITAM already used `itam_session`) |
| 5 | `SESSION_COOKIE_SECURE=False`, no `SameSite` on ITAM | Both | Medium | **Fixed**: configurable `COOKIE_SECURE`, `SameSite=Lax` |
| 6 | No security headers | Both | Low | **Fixed**: nosniff, frame, referrer headers |
| 7 | `.env` with live SMTP credentials and the databases (people, emails) shipped inside the zip | Both | High | **Not committed**; `.gitignore` blocks them. *Rotate the SMTP password and session key* because they have been shared |
| 8 | ITAM `init_db()` only ran under `__main__`, so it failed under a WSGI server | ITAM | Medium | Handled by the launcher and compose files, no change to the app |
| 9 | ITAM binds `0.0.0.0` with the Flask dev server | ITAM | Medium | Configurable `ITAM_HOST`; production uses waitress |
| 10 | ITAM password minimum is 8 characters; no lockout or MFA | ITAM | Medium | **Open** in ITAM itself; mitigated by Hub SSO (12+ chars, lockout, MFA). Follow-up: make ITAM SSO-only |
| 11 | `/api/onboarding/complete` in CyberShield is an unauthenticated stub that echoes input | CyberShield | Low | Open; remove or protect when the onboarding handshake is built |
| 12 | Separate, mutable audit logs; no integrity protection | Both | Medium | **Fixed** through the Hub ledger |
| 13 | No link between "holds a laptop" and "completed security training" | Both | Gap | **Fixed**: AC-09 and the exposure view |

## Integration design
Hub is the front door and read-only integrator. ITAM and CyberShield keep their own databases and logins; the Hub reaches them by a signed SSO ticket and read-only SQL. Shared identity is by Hub username with role mapping; people are matched by normalised name (ITAM has no employee-ID join key). **Recommended next step:** add `employee_id` to ITAM assets and onboarding so matching is exact.

## What is automated vs what needs people
Automated controls (14) are computed from live data. Manual controls (12) need an owner and evidence: incident response plan (link your CIRG reports), risk register, backup restore test, data-protection registration and breach notification, disposal records, patching, management review. They score **zero until attested**, by design.

## Before go-live
1. Change all default passwords; rotate the SMTP password and any key that was in the shared `.env`.
2. Set `SSO_SECRET`, secret keys and `COOKIE_SECURE=true`; put TLS in front.
3. Enrol all privileged Hub users in MFA.
4. Schedule backups of the three databases and test a restore (control MC-04).
5. Have counsel confirm obligations under Ghana's Data Protection Act 2012 (Act 843) and Cybersecurity Act 2020 (Act 1038); the control mapping is a guide, not legal advice.
