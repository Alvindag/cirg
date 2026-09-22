# CIRG — Cyber Incident Report Generator

> Professional cyber incident reporting system compliant with **NIST SP 800-61 Rev.2**, **ACPO Good Practice Guide**, and **Ghana CSA Guidelines**.

![Version](https://img.shields.io/badge/version-1.0-gold)
![Python](https://img.shields.io/badge/python-3.10%2B-blue)
![Framework](https://img.shields.io/badge/NIST-SP%20800--61-navy)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Overview

CIRG is a Flask-based web application that guides analysts through a structured 6-step incident reporting wizard. It integrates directly with **CFEMS** (Cyber Forensic Evidence Management System) to automatically pull digital evidence into professionally formatted PDF reports.

---

## Features

- 6-step guided incident creation wizard
- Auto-generates PDF reports with full evidence tables, response actions, and legal compliance sections
- Direct integration with CFEMS PostgreSQL database — evidence pulled automatically by case number
- SHA-256 hash verification per ISO/IEC 27037:2012
- NIST SP 800-61, ACPO, and Ghana CSA framework compliance
- Real-time online/offline status indicator
- Full incident history with versioned report archive

---

## Prerequisites

- Python 3.10+
- PostgreSQL 13+ (shared with CFEMS, database name: `cfems`)
- CFEMS running on port 5000

---

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/cirg.git
cd cirg

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env
# Edit .env: set your PostgreSQL password and a fixed SECRET_KEY
#   python -c "import secrets; print(secrets.token_hex(32))"

# 4. Set up the database (SOC module schema)
psql -U postgres -d cfems -f database/soc_schema.sql

# 5. Start the server (always from project root)
python backend/server.py
```

The API is served at **http://localhost:5001** (`/api/health` for a
liveness check). Open `frontend/SOC_Dashboard.html` in a browser (or serve
it statically) to use the Security Operations dashboard — on first run it
will prompt you to create the admin account via `/api/soc/auth/register`.

> ⚠️ **Important:** Always run from the project root folder, never from inside `backend/`.

> **Status note:** this repository currently implements the **Enterprise
> Security Operations (SOC) module** described below in full. The original
> 6-step incident-wizard UI and CFEMS PostgreSQL integration described
> elsewhere in this README are the intended next phase and are not yet
> implemented — `incidents`/`incident_timeline` in `soc_schema.sql` already
> provide the case-management data model they would build on.

---

## Project Structure

```
cirg/
├── backend/
│   ├── server.py            # Flask app factory — registers all API blueprints
│   ├── config.py             # Environment-driven configuration
│   ├── db.py                  # PostgreSQL connection pool (psycopg2)
│   ├── auth.py                 # Dashboard-user JWT auth + agent API-key auth
│   ├── pdf_builder.py           # Incident & executive-summary PDF reports (ReportLab)
│   └── soc/
│       ├── users.py                # Analyst accounts: register, login, roles
│       ├── telemetry.py             # Agent enrollment, heartbeat, event ingestion, asset inventory
│       ├── detection.py              # Detection-rule engine + rule CRUD API
│       ├── rules_seed.py              # 16 built-in MITRE ATT&CK-mapped detection rules
│       ├── response.py                 # Alert triage + incident case management (NIST SP 800-61)
│       ├── remediation.py               # Remediation action queue (isolate host, kill process, ...)
│       ├── threat_intel.py               # IOC storage, STIX/bulk import, auto-correlation
│       └── reporting.py                   # Dashboard KPIs + report generation endpoints
├── agent/
│   ├── windows_agent.py     # Windows 10/11/Server 2016+ telemetry & remediation agent
│   ├── service_wrapper.py    # Runs the agent as a native Windows Service (pywin32)
│   ├── install.ps1            # One-command enrollment + service install script
│   ├── sysmon_config.xml       # Recommended Sysmon configuration
│   ├── requirements.txt         # Agent-side Python dependencies
│   └── README.md                 # Agent deployment & troubleshooting guide
├── database/
│   └── soc_schema.sql       # PostgreSQL schema: assets, events, alerts, incidents, IOCs, reports...
├── frontend/
│   └── SOC_Dashboard.html   # Single-file SOC dashboard (HTML/CSS/vanilla JS)
├── reports/                 # Generated PDF reports (git-ignored)
├── .env.example              # Environment variable template
├── requirements.txt           # Backend Python dependencies
└── README.md
```

---

## Enterprise Security Operations (SOC) Module

A full monitoring → detection → alerting → response → remediation →
reporting loop for Windows 10, Windows 11, and Windows Server 2016+
endpoints, built to keep pace with the current threat landscape (ransomware,
credential theft, living-off-the-land tooling, C2 frameworks, insider
threats).

### Capabilities

- **Monitoring** — a lightweight Windows agent forwards Security/System/
  PowerShell event logs and (if installed) Sysmon telemetry to a central
  collector over HTTPS; live asset inventory with online/offline/isolated
  status. Deployable one endpoint at a time or fleet-wide via a Group Policy
  computer startup script (multi-use enrollment tokens, idempotent
  install/refresh, Kaspersky-compatible exclusion guidance — see
  `agent/GPO_DEPLOYMENT.md`).
- **Detection** — a Sigma-inspired rule engine evaluates every ingested
  event batch against threshold- and pattern-based rules. **16 built-in
  rules** ship out of the box, mapped to MITRE ATT&CK and NIST CSF,
  covering: RDP/brute-force logons, encoded/obfuscated PowerShell, download
  cradles, LSASS credential dumping, Mimikatz-style tooling, new scheduled
  tasks & services, PsExec/WMI lateral movement, new local admins, cleared
  audit logs, Defender tampering, shadow-copy deletion (ransomware
  precursor), Kerberoasting, account-lockout spikes, C2 port beaconing, and
  LOLBAS abuse. Custom rules can be added via the API.
- **Threat intelligence** — IOC storage (IP/domain/URL/hash) with manual,
  bulk-JSON, or STIX 2.1 `indicator` import; every ingested event is
  auto-correlated against active IOCs.
- **Alerting & response** — a triage queue with severity/status filters,
  one-click escalation to an incident case, and a NIST SP 800-61 Rev.2
  lifecycle (`open → contained → eradicated → recovering → closed`) with an
  enforced valid-transition state machine and full audit timeline.
- **Remediation** — analyst-issued actions the agent executes on the
  endpoint: isolate host (firewall lockdown), remove isolation, kill
  process, block an IP, quarantine a file, disable a local account, collect
  a forensic triage package, or trigger a Windows Defender scan.
- **Reporting & compliance** — one-click PDF incident reports (NIST SP
  800-61 formatted) and rolling executive/compliance summaries (NIST CSF
  KPIs: MTTC, alert volume, top ATT&CK techniques), generated with the same
  ReportLab pipeline as CIRG's core incident reports.
- **Dashboard** — a single-file HTML/JS SOC console: overview KPIs, asset
  inventory, alert triage, incident case management, threat-intel IOC
  management, and report downloads.

### Quickstart

```bash
# 1. Start the backend (seeds the 16 built-in detection rules automatically)
python backend/server.py

# 2. Create the admin account
curl -X POST http://localhost:5001/api/soc/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","email":"you@org.com","password":"<strong password>"}'

# 3. Open frontend/SOC_Dashboard.html, log in, and click "Enroll Endpoint"
#    to generate a one-time token, then run on the target Windows host:
#    .\agent\install.ps1 -ServerUrl "http://<this host>:5001" -EnrollToken "<token>" -InstallSysmon
```

See `agent/README.md` for full Windows agent deployment, mass-rollout, and
troubleshooting guidance.

### API overview

All SOC endpoints are under `/api/soc/`. Dashboard endpoints require a
`Authorization: Bearer <JWT>` from `/api/soc/auth/login`; agent endpoints
require `Authorization: Bearer <agent API key>` minted at enrollment.

| Area | Endpoints |
|------|-----------|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `GET/POST /auth` (admin user management) |
| Enrollment | `POST /enroll/token`, `POST /enroll` |
| Telemetry | `POST /heartbeat`, `POST /events`, `GET /assets`, `GET/PATCH /assets/<id>` |
| Detection | `GET/POST /rules`, `PATCH/DELETE /rules/<id>` |
| Alerts | `GET /alerts`, `GET/PATCH /alerts/<id>`, `POST /alerts/<id>/escalate` |
| Incidents | `GET/POST /incidents`, `GET/PATCH /incidents/<id>`, `POST /incidents/<id>/notes` |
| Remediation | `GET/POST /remediation`, `POST /remediation/<id>/cancel`, `GET /remediation/pending`, `POST /remediation/<id>/result` |
| Threat intel | `GET/POST /threat-intel/iocs`, `POST /threat-intel/import`, `DELETE /threat-intel/iocs/<id>` |
| Reporting | `GET /dashboard`, `GET /reports`, `POST /reports/incident/<id>`, `POST /reports/executive-summary`, `GET /reports/<id>/download` |

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `cfems` | Database name (shared with CFEMS) |
| `DB_USER` | `postgres` | PostgreSQL username |
| `DB_PASSWORD` | *(empty)* | PostgreSQL password |
| `CIRG_PORT` | `5001` | Flask server port |
| `FLASK_DEBUG` | `False` | Enable debug mode |

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check + incident count |
| `GET` | `/api/dashboard` | Dashboard stats + recent incidents |
| `GET` | `/api/incidents` | List all incidents |
| `POST` | `/api/incidents` | Create new incident |
| `GET` | `/api/incidents/:id` | Get incident with all related data |
| `PUT` | `/api/incidents/:id` | Update full incident |
| `PATCH` | `/api/incidents/:id/detection` | Update detection fields |
| `PATCH` | `/api/incidents/:id/cfems-link` | Link/unlink CFEMS case |
| `POST` | `/api/incidents/:id/actions` | Add response action |
| `POST` | `/api/incidents/:id/legals` | Add legal consideration |
| `POST` | `/api/incidents/:id/recommendations` | Add recommendation |
| `POST` | `/api/incidents/:id/generate-report` | Generate + download PDF report |
| `GET` | `/api/cfems/cases` | List CFEMS cases for dropdown |

---

## Compliance Frameworks

| Framework | Application |
|-----------|-------------|
| NIST SP 800-61 Rev.2 | 6-phase incident response lifecycle |
| ACPO Good Practice Guide | Digital evidence handling principles |
| Ghana CSA Guidelines | National incident reporting obligations |
| Ghana Data Protection Act 2012 | Data breach notification requirements |
| ISO/IEC 27037:2012 | SHA-256 evidence integrity verification |

---

## Integration with CFEMS

CIRG connects to the same PostgreSQL database as CFEMS. When an incident is linked to a CFEMS case number (e.g. `FS-2026-0314`), all evidence items — including SHA-256 hashes, analyst names, and device information — are automatically retrieved and included in the PDF report.

Both systems must be running simultaneously:
- CFEMS: `http://localhost:5000`
- CIRG: `http://localhost:5001`

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

*CIRG v1.0 — Built for cyber incident response teams operating under NIST, ACPO, and Ghana CSA frameworks.*
