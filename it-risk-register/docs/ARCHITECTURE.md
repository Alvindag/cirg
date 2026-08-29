# Architecture

```
                     ┌────────────────────┐
                     │      Postgres        │
                     │  assets, vulns,       │
                     │  risk_assessments,    │
                     │  recommendations      │
                     └─────────┬──────────┘
             ┌──────────────────┼──────────────────┐
             ▼                  ▼                  ▼
     collector container   dashboard container (Flask, :8081)
     ├─ risk_engine.py      ├─ CRUD for assets (physical + software)
     │  (hourly, + on save) ├─ risk register views, recommendation tracker
     ├─ nvd_sync.py          └─ CSV scan upload → scanner_import.py +
     │  (daily, NVD CVE API)    risk_engine.py (same code, imported as lib/)
     └─ nmap_scanner.py
        (opt-in, active scan of assets with an IP — vuln/vulners NSE scripts)
```

## Scoring model

`risk_score = likelihood (1-5) × impact (1-5)`, banded low(1-4) / medium(5-9)
/ high(10-15) / critical(16-25) — a standard qualitative risk-matrix shape
(NIST SP 800-30 §3.4 uses the same likelihood×impact structure).

- **Impact** is the asset's `criticality` field — a business-impact rating
  you set when adding the asset (1 = negligible if lost/compromised, 5 =
  severe). This is deliberately manual: business impact isn't something a
  scanner or CVE feed can infer.
- **Likelihood** blends a baseline (asset type + internet-facing + past
  end-of-life bumps) with CVSS: `0.4 × baseline + 0.6 × (max_CVSS / 10 × 5)`.
  Known, scored vulnerabilities dominate the likelihood estimate once
  present; before any are found, likelihood falls back to the baseline
  alone. This is a deliberate simplification, not a formal FAIR/ISO 27005
  likelihood derivation — treat the resulting score as a triage ranking
  ("fix these first"), not a defensible quantitative risk figure for audit
  purposes.

## Vulnerability sources

- **NVD CVE API** (`collector/nvd_sync.py`) — keyword search on
  vendor+product+version against NIST's CVE database, run daily (NVD's rate
  limits make more frequent full-catalog sweeps impractical: 5 req/30s
  without an API key, 50/30s with one — see `.env.example`). Keyword search
  trades precision for not requiring you to already know each asset's exact
  CPE URI; review matches on assets with generic product names, since a
  loose match can pull in an unrelated CVE.
- **Scanner CSV import** (`collector/scanner_import.py`, also reachable via
  the dashboard's Import Scan page) — a generic column format any scanner
  can export to (asset_identifier, cve_id, cvss_score, ...), matched to
  assets by IP or exact name. This is the integration point for
  OpenVAS/Nessus/Qualys/etc.; wiring a specific scanner's native API
  instead of CSV export is a follow-up, not implemented here.
- **nmap active scan** (`collector/nmap_scanner.py`, opt-in via
  `NMAP_SCAN_ENABLED=true`) — nmap does real vulnerability *scanning*
  (the other two sources are lookups/imports against pre-existing data)
  against every asset with `ip_address` set: `-sV` for service/version
  detection, then two NSE script sets —
  [`vulners`](https://github.com/vulnersCom/nmap-vulners) (matches detected
  CPEs against vulners.com, returns real CVE IDs + CVSS, needs outbound
  internet from the collector container and is installed at image build
  time) and nmap's bundled `vuln` category (offline, narrower — targeted
  checks like `smb-vuln-ms17-010`, `ssl-heartbleed`). See "Active scanning"
  in the README before enabling.

All three paths write into the same `vulnerabilities` / `asset_vulnerabilities`
tables, so risk scoring and recommendations don't care which source found
a given finding.

## Recommendations engine

Rule-based, not ML — see `collector/risk_engine.py:build_recommendations`.
Each rule fires off a concrete, checkable condition (open CVSS ≥ 7 findings,
past end-of-life, internet-facing + high/critical band, missing owner,
missing physical location) and produces a prioritized, human-readable
action. This keeps every recommendation traceable to the data that
produced it — appropriate for a tool advising humans who need to justify
remediation priorities, versus a black-box scoring model.

## Known limitations / next steps

- **User attribution / asset discovery is manual.** There's no
  auto-discovery agent — assets are entered (or bulk-imported, if you write
  a small CSV-to-INSERT script against `assets`) by hand. Pairs naturally
  with `lan-compliance-monitor`'s `network_scanner.py` device inventory as
  a future asset-discovery feed, not wired up here.
- **NVD keyword matching is approximate.** For high-confidence CVE matching
  at scale, look up each product's real CPE URI (via NVD's CPE dictionary
  API) and match on that instead — meaningfully more setup work per asset.
- **No authentication roles** — single shared basic-auth admin account, same
  tradeoff as `lan-compliance-monitor`. Put an IdP-backed reverse proxy in
  front for multi-user access control.
- **No scheduled/automatic scanner import** — CSV upload is manual (via the
  dashboard or CLI). If your scanner supports a webhook/export-to-folder
  pattern, add a watcher thread to `run_collectors.py` calling
  `scanner_import.run()` on new files.
- **nmap findings aren't deduplicated against NVD/scanner findings for the
  same underlying issue** — if NVD keyword-matching and the nmap `vulners`
  script both surface the same CVE for an asset, `asset_vulnerabilities`
  gets one row per (asset, vulnerability) pair regardless of source, so
  scoring only counts it once — but the `vulnerabilities.source` column
  will show whichever wrote the row first and won't reflect that multiple
  sources agree on it.
- **nmap scanning has no target allowlist beyond `assets.ip_address`** — it
  scans whatever IP is in that field, so a typo'd or stale IP gets scanned
  too. No CIDR/subnet safety check is enforced; that's on the operator.
- **Recommendation rules are a starting set**, not exhaustive — add rules to
  `build_recommendations()` as your organization's policy needs surface
  patterns not covered here (e.g. a specific compliance framework's
  required controls).
