# Windows Security Event Log Triage Engine

Zero-trust, browser-only triage of Windows Security logs. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```bash
npm ci
npm test            # unit tests (formats, chunk-boundary splitter, 2.4M-event memory test)
npm run e2e         # build + real-Chromium gate: strict CSP, zero network, no storage, UI stays responsive
npm run dev         # development server
npm run preview:secure   # serve ./dist at http://127.0.0.1:4173 with production security headers
```

Ingests CSV, NDJSON/JSON, Windows Event XML and binary EVTX (WASM) and applies a configurable rule engine (JSON/YAML packs) with MITRE ATT&CK mapping.
Sequence rules link events by Logon ID/SID/PID, findings are grouped into scored attack chains. Reports export as structured JSON, ECS-style SIEM NDJSON, a standalone HTML file, or PDF (print), with optional redaction.

Editing `schemas/rules.schema.json`? Run `npm run gen:validator` to regenerate `src/generated/validateRules.js` (tests fail if it is stale).
Writing rules: see `rules/default-pack.json` for examples and `docs/ARCHITECTURE.md` for semantics.

EVTX parser: `npm run build:evtx` rebuilds `evtx-wasm/` (Rust) into `src/evtx/*.generated.*` (committed). See docs/ARCHITECTURE.md.

More: [Architecture](docs/ARCHITECTURE.md) · [Threat model](docs/THREAT_MODEL.md) · [Deployment](docs/DEPLOYMENT.md)
