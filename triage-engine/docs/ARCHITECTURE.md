# Windows Security Event Log Triage Engine: Architecture

Strictly client-side. Log data is never uploaded, stored (Local/Session storage, IndexedDB, Cache API, cookies), or sent to any third party.

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Secure scaffold, streaming ingestion (CSV / NDJSON+JSON / XML), canonical model, worker lifecycle, CSP | **Done** (gate passing) |
| 2 | Rule engine (`match`, `threshold`), Ajv standalone validation, starter rule pack, ATT&CK mapping, rule tester UI | Planned |
| 3 | Correlation engine (`sequence`, key indexes, TTL windows), attack-chain builder, risk scoring, EVTX via WASM | Planned |
| 4 | Report (exec summary / deep dive / context / next steps), JSON + HTML + print-PDF export, a11y and security hardening | Planned |

Phase 1 deviations from the original plan, to be revisited:
- A **single ingest worker** does parse, normalize, and aggregate. The orchestrator / parser-pool / analysis-worker split arrives with Phase 2-3, when there is analysis work worth parallelising.
- UI uses plain CSS. Radix + Tailwind (build-time) and TanStack Table are introduced with the findings views in Phase 2.
- EVTX is detected (magic bytes) and rejected with `wevtutil` export instructions until the Phase 3 WASM parser.
- Normalized events are not retained (only counters and a 200-event sample). Phase 2 plugs rules in at `ingest()`'s `onEvent` hook.

## Stack

TypeScript (strict) · Vite · React 18 + Zustand · PapaParse (chunk mode, inside our own worker) · custom streaming JSON object splitter · `saxes` (SAX XML) · Comlink (reserved for Phase 2 RPC) · Vitest · Playwright-core (e2e gate). EVTX: Rust `evtx` crate to WASM (Phase 3). Rules: JSON (YAML accepted, converted at load), validated with Ajv standalone (no `unsafe-eval`).

## Data flow

```
MAIN THREAD (UI only; holds summaries only)
   │  File handle                          ▲ progress / summary
   ▼                                       │
INGEST WORKER ── sniff(format) ─► parser (csv | json | xml | evtx*) ─► normalize() ─► aggregate
                                                                              │ onEvent (Phase 2+)
                                                  ┌───────────────────────────┴─────────────┐
                                                  ▼                                         ▼
                                           RULE ENGINE (P2)  ───────────────►  CORRELATION ENGINE (P3)
                                                                                           ▼
                                                                          REPORT MODEL ► JSON / HTML / PDF (P4)
CLEAR / pagehide: destroy message → worker.close(); main terminate()s and drops all references.
```

## Security posture

- CSP (header in production, `<meta>` fallback): `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'` plus, via header only, `frame-ancestors 'none'; require-trusted-types-for 'script'; trusted-types triage-worker`.
- `connect-src 'none'` is the exfiltration backstop. The e2e gate asserts zero external requests, zero CSP violations, and empty storage.
- Trusted Types: the single policy `triage-worker` only mints same-origin worker URLs.
- No CDNs; all dependencies are bundled and pinned (exact versions + lockfile); `npm audit` runs in CI.
- Log content and rule files are untrusted input. There is no `eval`, no `innerHTML`, and rules are declarative data.
- Raw records are dropped immediately after normalization; only a bounded sample is held.

## Known limits (honest)

- Browser memory is the ceiling. Phase 2-3 will add configurable evidence caps and warn when a rule is too chatty.
- JSON input must be NDJSON or a top-level array of events. Wrapped exports (e.g. `{"tables":[…]}`) are not yet supported.
- Zone-less timestamps are interpreted as UTC.
- Meta-CSP cannot enforce `frame-ancestors` or Trusted Types. Deploy with the headers in `e2e/server.mjs` (`CSP` constant).

## Rule engine

See `schemas/rules.schema.json` (draft v1.0): `match`, `threshold` and `sequence` rules, suppressions, ATT&CK mapping, context (false positives / malicious indicators), and response actions (templated, escaped, displayed, never executed).
