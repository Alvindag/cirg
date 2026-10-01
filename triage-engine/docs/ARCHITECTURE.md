# Windows Security Event Log Triage Engine: Architecture

Strictly client-side. Log data is never uploaded, stored (Local/Session storage, IndexedDB, Cache API, cookies), or sent to any third party.

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Secure scaffold, streaming ingestion (CSV / NDJSON+JSON / XML), canonical model, worker lifecycle, CSP | **Done** (gate passing) |
| 2 | Rule engine (`match`, `threshold`), Ajv standalone validation, starter rule pack, ATT&CK mapping, rule tester UI | **Done** (gate passing) |
| 3 | Correlation engine (`sequence`, key indexes, TTL windows), attack-chain builder, risk scoring, EVTX via WASM | Planned |
| 4 | Report (exec summary / deep dive / context / next steps), JSON + HTML + print-PDF export, a11y and security hardening | Planned |

## Phase 2: rule engine (as built)

- **Schema:** `schemas/rules.schema.json` (JSON Schema 2020-12) is precompiled by `npm run gen:validator` into `src/generated/validateRules.js`. The output is self-contained (no `eval`, no imports), and a test fails if it is stale.
- **Loading** (`core/rules/load.ts`): JSON or YAML (YAML core schema, alias-bomb limit, 2 MB cap), then schema validation, then semantic checks (kind matches `when` shape, duplicate ids, unknown ATT&CK tactic = error, unknown technique = warning), then per-rule compilation. One bad rule is reported and skipped; it never silently disables the pack. A later pack's rule with the same id overrides an earlier one (with a warning).
- **Compile-time safety** (`core/rules/compile.ts`): unknown fields, unknown `$lists`, bad CIDRs and invalid regexes are errors. Regexes are length-capped, linted for nested quantifiers (a heuristic, not a proof), and only ever run on the first 4096 characters of a field. A per-rule time budget (sampled 1-in-128) disables a runaway rule and shows a visible warning.
- **Engine** (`core/rules/engine.ts`): events are dispatched by Event ID. `match` rules aggregate into one finding per rule (count, first/last, earliest 25 evidence events, top accounts/hosts/IPs). `threshold` rules are order-independent: timestamps per group are collected and a sliding window runs at finalize, so newest-first SIEM exports work. Each separate burst becomes a finding. `distinct` counts distinct values (spray, Kerberoast heuristic).
- **Response templates** (`core/rules/render.ts`): `{{field}}` values are escaped per shell and capped in length. PowerShell templates must wrap each placeholder in single quotes (enforced at load); all PowerShell quote look-alikes are neutralised. Commands are displayed and copyable, and the app never executes them.
- **Starter pack** (`rules/default-pack.json`): 21 rules covering log clearing, audit tampering, brute force/spray, external logons, persistence (services, tasks, accounts, privileged groups), PowerShell/LOLBin/Office abuse, credential dumping, discovery, defense evasion and shadow-copy deletion. Each rule has ATT&CK mappings, false-positive guidance, and investigate/remediate actions. `LAT-001` is a `sequence` rule: it validates and loads, but is evaluated only once Phase 3 ships.
- **ATT&CK:** offline subset in `core/attack.ts`. Extend it together with new rules.

### Known limits (Phase 2)
- Threshold evidence is capped per group (1000 events; 100k timestamps; 50k groups per rule). Counts stay accurate until the stamp cap, and the UI says when evidence was not retained.
- Rules can only reference the canonical fields in `core/rules/compile.ts` (`FIELD_NAMES`). Fields such as Kerberos ticket encryption type are not yet normalized, so CRED-002 is a heuristic only.
- AUTH-004 evaluates IPv4 only.
- Rule packs from other people are untrusted input, but a malicious pack can still generate noise or hide detections via `suppress`. Review packs before use.

## Phase 1 deviations from the original plan, to be revisited:
- A **single ingest worker** does parse, normalize, and aggregate. The orchestrator / parser-pool / analysis-worker split arrives with Phase 2-3, when there is analysis work worth parallelising.
- UI uses plain CSS. Radix + Tailwind (build-time) and TanStack Table are introduced with the findings views in Phase 2.
- EVTX is detected (magic bytes) and rejected with `wevtutil` export instructions until the Phase 3 WASM parser.
- Normalized events are not retained (only counters and a 200-event sample); the rule engine consumes them through `ingest()`'s `onEvent` hook.

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
