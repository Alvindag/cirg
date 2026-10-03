# IT Risk Register

Self-hosted risk assessment and management tool for an IT department's
assets — both physical (servers, laptops, network gear) and software/logical
(applications, databases, cloud services). Identifies assets, scores their
risk (likelihood × impact, blended with real CVE data), and generates
prioritized, traceable remediation recommendations.

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the scoring model,
vulnerability-source design, and known limitations before relying on this
for anything beyond triage prioritization.

## What it does

- **Asset inventory** — track physical and software/logical assets with
  owner, department, business-criticality rating, exposure (internet-facing),
  and lifecycle (install/end-of-life dates).
- **Vulnerability assessment, two integrated paths:**
  - Automatic daily lookup against the **NVD CVE database** for software
    assets (matched by vendor/product/version), no scanner required.
  - **CSV import** for any vulnerability scanner's export (OpenVAS, Nessus,
    Qualys, or custom tooling) via the dashboard or CLI.
- **Risk scoring** — likelihood × impact (1-25), banded low/medium/high/critical,
  recomputed hourly and immediately after any asset edit or scan import.
- **Recommendations** — rule-based, prioritized, tied to the specific finding
  that triggered them (unpatched CVEs, end-of-life, unassigned ownership,
  internet exposure on a high-risk asset).

## Quick start

```bash
cp .env.example .env
# edit .env: set DB_PASSWORD, DASHBOARD_SECRET_KEY, ADMIN_PASSWORD at minimum
# optional: NVD_API_KEY (raises NVD rate limit from 5 to 50 req/30s)

docker compose up -d --build
```

Dashboard: `http://<host>:8081` (basic auth — `ADMIN_USERNAME`/`ADMIN_PASSWORD`
from `.env`).

1. Go to **+ Add asset** and enter your first physical or software asset.
   For software assets, fill in vendor/product/version — that's what NVD
   matching keys off.
2. The collector scores every asset within an hour of startup (immediately
   for a newly-added asset), and syncs NVD matches daily.
3. Check **Overview** for the highest-risk assets and **Recommendations**
   for prioritized action items.
4. Have scanner output? Go to **Import Scan** and upload a CSV — see the
   column format on that page, or `collector/scanner_import.py`'s docstring.

## Data model

`assets` → `risk_assessments` (scoring history) and `asset_vulnerabilities`
(linked CVEs/findings, from either NVD or scanner import) → `recommendations`
(generated per assessment run). See `database/schema.sql` for the full
schema and column comments.

## Repo layout

```
docker-compose.yml       # postgres, collector, dashboard
collector/                 # risk_engine.py, nvd_sync.py, scanner_import.py, scheduler
dashboard/                 # Flask app + templates (reuses collector logic via dashboard/lib/)
database/schema.sql        # Postgres schema
docs/ARCHITECTURE.md
```
