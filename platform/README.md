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
- **Read-only integration.** The Hub opens both application databases with SQLite `mode=ro`; it cannot alter source records.

## Run it

```bash
pip install -r requirements.txt
python scripts/seed_demo.py demo-data          # synthetic demo data only
HUB_ADMIN_PASSWORD='Choose-A-Strong-One-1!' python run_all.py --data demo-data
# Hub http://127.0.0.1:5080   ITAM :5057   CyberShield :5076
```
Production: `cp .env.example .env`, fill it in, `docker compose up -d --build`, and terminate TLS in front (set `COOKIE_SECURE=true`). Without `SSO_SECRET` everything still works; the apps use their own logins as before.

Operations: `python -m hub.cli sync | verify | score | create-user <name> <password> <role>`; set `HUB_AUTO_SYNC_SECONDS` to seal logs automatically; `GET /api/v1/summary` (bearer `HUB_API_TOKEN`) for monitoring.

## Tests
`python -m pytest tests -q` runs 26 tests: regression of both original apps, SSO (replay, audience, tamper, role), MFA (RFC 6238 vector), lockout, CSRF, RBAC, open-redirect, CSV-injection, ledger tamper detection, scoring.

See `docs/ASSESSMENT.md` for the gap assessment, what was fixed and what you must still do.
