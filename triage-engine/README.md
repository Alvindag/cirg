## Quick start (to run the tool)

Requires **Node.js 20.19+ or 22.12+** (`node -v`) and git.
```
git clone --branch claude/exciting-keller-yz6yy2 https://github.com/alvindag/cirg.git
cd cirg/triage-engine
npm ci
npm start
```
Then open **http://127.0.0.1:4173** (the address is printed). Do not open `dist/index.html` by double-clicking it: browsers block the worker and security policy for `file://` pages.

# Windows Security Event Log Triage Engine

Zero-trust, browser-only triage of Windows Security logs. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```bash
npm ci
npm test            # unit tests (formats, chunk-boundary splitter, 2.4M-event memory test)
npm run e2e         # build + real-Chromium gate: strict CSP, zero network, no storage, UI stays responsive
npm start           # build + serve at http://127.0.0.1:4173 with production security headers (use this to run the tool)
npm run preview:secure   # serve an existing ./dist build (node scripts/serve.mjs [port])
npm run dev         # developer mode only (the CSP meta tag is removed in dev so hot reload works)
```

Ingests CSV, NDJSON/JSON, Windows Event XML and binary EVTX (WASM) and applies a configurable rule engine (JSON/YAML packs) with MITRE ATT&CK mapping.
Sequence rules link events by Logon ID/SID/PID, findings are grouped into scored attack chains. Reports export as structured JSON, ECS-style SIEM NDJSON, a standalone HTML file, or PDF (print), with optional redaction.

Editing `schemas/rules.schema.json`? Run `npm run gen:validator` to regenerate `src/generated/validateRules.js` (tests fail if it is stale).
Writing rules: see `rules/default-pack.json` for examples and `docs/ARCHITECTURE.md` for semantics.

EVTX parser: `npm run build:evtx` rebuilds `evtx-wasm/` (Rust) into `src/evtx/*.generated.*` (committed). See docs/ARCHITECTURE.md.

More: [Compliance and audit support](docs/COMPLIANCE.md) · [Architecture](docs/ARCHITECTURE.md) · [Threat model](docs/THREAT_MODEL.md) · [Deployment](docs/DEPLOYMENT.md)

Verify an exported report: `node scripts/verify-report.mjs report.json original-log-file`
