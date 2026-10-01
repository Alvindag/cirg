# Windows Security Event Log Triage Engine

Zero-trust, browser-only triage of Windows Security logs. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```bash
npm ci
npm test            # unit tests (formats, chunk-boundary splitter, 2.4M-event memory test)
npm run e2e         # build + real-Chromium gate: strict CSP, zero network, no storage, UI stays responsive
npm run dev         # development server
npm run preview:secure   # serve ./dist at http://127.0.0.1:4173 with production security headers
```

Phase 1 ingests CSV, NDJSON/JSON and Windows Event XML. Detection, correlation and reporting come in Phases 2-4.
