# DAS Trust Hub

One platform over two existing systems, with **nothing in them removed or reworked**:

| Component | Port | What it is | Changes made |
|---|---|---|---|
| `itam/` | 5057 | IT Asset Management (assets, repairs, software, onboarding) | additive hardening only |
| `cybershield/` | 5076 | Security-awareness training and compliance tracking | additive hardening only |
| `hub/` | 5080 | **New.** Single sign-on, unified people/asset/training view, tamper-evident audit ledger, framework compliance engine | new |

## What the Hub adds

- **Single sign-on.** Sign in once (password plus optional TOTP MFA); `Open ITAM` / `Open CyberShield` hand over a 60-second, single-use, audience-bound HMAC ticket. Hub roles map to ITAM roles; CyberShield admin is limited to `admin`, `it_manager` and `hr`.
- **People × assets × training.** Joins ITAM custody with CyberShield results, so you can see who holds company devices without current security training (control AC-09). No system could answer this alone.
- **Tamper-evident audit ledger.** ITAM's `audit_log`, CyberShield's `compliance_log` and the Hub's own events are sealed into a SHA-256 hash chain. Editing or deleting a row later, in the ledger or in either source database, is detected by *Verify*.
- **Compliance engine.** 26 controls (14 computed from live data, 12 attested with evidence) mapped to ISO/IEC 27001:2022 Annex A, NIST CSF 2.0, CIS Controls v8 and Ghana Acts 843/1038. Unattested controls score zero; expired reviews downgrade. Printable report, CSV export, score history, remediation backlog ranked by impact.
- **Joiners and leavers.** New starters in ITAM onboarding are **auto-enrolled in CyberShield**; when they pass and receive their certificate, the Hub **ticks the matching ITAM onboarding checklist item** (certificate number and score recorded). Leavers get a case with an HR, manager and IT checklist: asset return is **verified from ITAM and cannot be ticked by hand**, then account/mailbox/system access removal and device wipe. HR and line managers can start a case; a manager sees only the cases they raised; each step can only be completed by its owner role. Overdue leavers who still hold assets show as at-risk and fail control AC-16.
- **Onboarding and offboarding (joiners and leavers), end to end.** Leaver cases also **cancel unfinished CyberShield training on the last day** and can **disable the leaver's on-premise Active Directory account** (LDAPS, dry-run by default, IT confirms the exact account, protected accounts refused, read back to verify; see `docs/ACTIVE_DIRECTORY.md`). If AD or the integration is not configured, those steps stay normal manual steps.
- **Reliable identity.** People are matched by **employee ID** first, then AD username, and only last by name. ITAM now captures an employee ID at onboarding and asset assignment. Names shared by different employees are never auto-matched; the **Identity** page lets HR/IT confirm legacy records.
- **Safe to pilot.** `python -m hub.cli preflight` reports on a *copy* of your real data and what automation would do, changing nothing; *Preview (no changes)* buttons do the same in the UI. See `docs/PILOT.md`.
- **Controlled integration.** The Hub reads both application databases read-only (SQLite `mode=ro`). The only writes into the apps are two token-protected, idempotent endpoints (`/api/hub/enrol` in CyberShield, `/api/hub/onboarding/training-complete` in ITAM, and `/api/hub/cancel` in CyberShield), disabled unless `INTEGRATION_TOKEN` is set. Every automated action is sealed in the audit ledger.

## Run it on your LAN (Windows or Linux)

1. Install Python 3.10+ and unzip this folder on the server PC.
2. Double-click **`run.bat`** (or `python run_all.py --data data --lan <SERVER_IP>`) and enter the server's LAN IP.
3. Copy the one-time Hub admin password printed in the window. Sign in at `http://<SERVER_IP>:5080`, then change it (you are forced to).
4. Allow inbound TCP **5080, 5057, 5076** through Windows Firewall for your LAN only.
5. Staff open `http://<SERVER_IP>:5076` for training; IT uses the Hub (5080) and ITAM (5057).

To bring over your existing data, stop the apps and copy `itam.db` and `cybershield.db` into `data\`. Back up `data\` regularly. This is plain HTTP, fine for a trusted LAN; for anything wider put a TLS proxy in front and set `COOKIE_SECURE=true`.

## Try it with demo data

```bash
pip install -r requirements.txt
python scripts/seed_demo.py demo-data          # synthetic demo data only
HUB_ADMIN_PASSWORD='Choose-A-Strong-One-1!' python run_all.py --data demo-data
# Hub http://127.0.0.1:5080   ITAM :5057   CyberShield :5076
```
Production: `cp .env.example .env`, fill it in, `docker compose up -d --build`, and terminate TLS in front (set `COOKIE_SECURE=true`). Without `SSO_SECRET` everything still works; the apps use their own logins as before.

Operations: `python -m hub.cli sync | verify | score | create-user <name> <password> <role>`; set `HUB_AUTO_SYNC_SECONDS` to seal logs automatically; `GET /api/v1/summary` (bearer `HUB_API_TOKEN`) for monitoring.

## Tests
`python -m pytest tests -q` runs 56 tests: regression of both original apps, SSO (replay, audience, tamper, role), MFA (RFC 6238 vector), lockout, CSRF, RBAC, open-redirect, CSV-injection, ledger tamper detection, scoring.

See `docs/ASSESSMENT.md` for the gap assessment, what was fixed and what you must still do.
