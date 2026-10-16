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
`python -m pytest tests -q` runs 26 tests: regression of both original apps, SSO (replay, audience, tamper, role), MFA (RFC 6238 vector), lockout, CSRF, RBAC, open-redirect, CSV-injection, ledger tamper detection, scoring.

See `docs/ASSESSMENT.md` for the gap assessment, what was fixed and what you must still do.
