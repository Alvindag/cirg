# Windows Security Event Log Triage Engine

Zero-trust, browser-only triage of Windows Security logs. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```bash
npm ci
npm test            # unit tests (formats, chunk-boundary splitter, 2.4M-event memory test)
npm run e2e         # build + real-Chromium gate: strict CSP, zero network, no storage, UI stays responsive
npm run dev         # development server
npm run preview:secure   # serve ./dist at http://127.0.0.1:4173 with production security headers
```

Ingests CSV, NDJSON/JSON and Windows Event XML and applies a configurable rule engine (JSON/YAML packs) with MITRE ATT&CK mapping.
Correlated attack chains (Phase 3) and report export (Phase 4) are next.

Editing `schemas/rules.schema.json`? Run `npm run gen:validator` to regenerate `src/generated/validateRules.js` (tests fail if it is stale).
Writing rules: see `rules/default-pack.json` for examples and `docs/ARCHITECTURE.md` for semantics.
