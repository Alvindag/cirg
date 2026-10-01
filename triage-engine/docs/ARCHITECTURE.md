# Windows Security Event Log Triage Engine: Architecture

Strictly client-side. Log data is never uploaded, stored (Local/Session storage, IndexedDB, Cache API, cookies), or sent to any third party.

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Secure scaffold, streaming ingestion (CSV / NDJSON+JSON / XML), canonical model, worker lifecycle, CSP | **Done** (gate passing) |
| 2 | Rule engine (`match`, `threshold`), Ajv standalone validation, starter rule pack, ATT&CK mapping, rule tester UI | **Done** (gate passing) |
| 3 | Correlation engine (`sequence` rules), attack-chain builder, explainable risk scoring, EVTX via WASM | **Done** (gate passing) |
| 4 | Report (exec summary / deep dive / context / next steps), JSON + SIEM NDJSON + HTML + print-PDF export, redaction, a11y and security hardening | **Done** (gate passing) |
| 5 | Fixes from real DC/workstation data; two-pass correlation; audit logging assessment; evidence integrity; framework control mapping | **Done** (gate passing); see `COMPLIANCE.md` |

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

## Phase 5: fixes from real data, audit and compliance support (as built)

**Fixes found by running on a real Windows Server 2016 DC and a Windows 11 workstation** (each has a regression test that was confirmed to fail against the old behaviour):
- *Chains* need a sequence match or 2+ medium-or-higher findings; one medium finding plus context noise is not a chain.
- *Low/info match rules* collapse to one finding per host (15 explicit-credential events had become 8 findings).
- *Audit-policy changes (4719)* are split by direction using `AuditPolicyChanges`: removed = **high** (AUD-003), only added = **info** (AUD-004, typically an admin enabling logging), unknown = medium (AUD-002). The executive summary no longer advises reverting a change an administrator just made: containment is recommended only for chains and high/critical findings, otherwise it says *verify first*.
- *Manual instructions* render as prose, not code blocks. 4648 evidence shows the calling process and target server.
- *AUTH-006 blind spot*: a busy account's thousands of successful logons hit a per-step memory cap, so a real brute-force success could be missed. Sequence rules may now mark a selective `guard` step. **Pass 1** collects only guard events (plus match/threshold rules); **pass 2** re-reads the file and collects the other steps only within `within` of a guard event (binary search over guard timestamps). Memory stays bounded and the result is order-independent. Pass 2 runs only when pass 1 found a candidate, so clean data is read once. All five starter sequence rules declare a guard.

**Audit logging assessment** (`core/audit/coverage.ts`): classifies each audit area as *frequent* (absence over 6+ hours means the setting is probably off: "possible gap"), *occasional* (verify) or *rare* (absence is normal: log cleared, service installed). Domain-controller-only areas (Kerberos, NTLM validation) are evaluated only when the role is known (auto-detected from Kerberos/NTLM events, or chosen by the analyst). Also reported: command-line coverage of 4688, periods with no events (4+ hours), and EventRecordID continuity (applicable only for a single computer and log). Short windows are never called gaps.

**Evidence integrity** (`core/hash/sha256.ts`, report `source`, `methodology`, `integrity`): streaming SHA-256 of the source file; SHA-256 of every rule pack; analysis passes; case ID, analyst and organisation; and a content hash of the report verifiable with `scripts/verify-report.mjs` (integrity, not authenticity).

**Control mapping** (`core/audit/controls.ts`, `controls` on rules, report 5.4): every starter rule maps to NIST 800-53, 800-171, CSF 2.0, ISO 27001:2022, PCI DSS 4.0, CIS v8, SOC 2 and HIPAA references. Mappings are indicative; see `COMPLIANCE.md` for exactly what is and is not claimed.

**Extended DC detections:** account lockout (AUTH-007) and lockout storm from one source (AUTH-008), Kerberoasting with RC4 tickets using the new `ticketEncryptionType` field (CRED-003), and DCSync via 4662 replication-right GUIDs from a non-computer account (CRED-004, new field `objectProperties`, T1003.006). Audit areas for lockouts, directory-service access and changes were added to the assessment with hints (the 4662 rule is blind without an audit entry on the domain object: see `AUDIT_SETUP.md`).

Report schema is now **1.1** (new: `case`, `source.sha256`, `loggingAssessment`, `controlMapping`, `integrity`, `methodology.passes`, rule-pack hashes, finding `controls`).

## Phase 4: reporting, export and hardening (as built)

**Report model** (`core/report/model.ts`, schema `schemas/report.schema.json`, version 1.0): one deterministic JSON-serializable object holding the five required sections: executive summary (risk score with breakdown, plain-language headline, top threats, recommended actions), technical deep dive (chains with narrative and score breakdown, findings with evidence/steps, ATT&CK coverage table), contextual analysis (why suspicious, malicious indicators, legitimate explanations, deduplicated per rule), actionable next steps (investigate = read-only, remediate = flagged "disruptive", commands filled from evidence and escaped), and an appendix (methodology, rule pack versions, limitations).

**Exports** (all generated in the browser and saved via a Blob download; file names are generated, never derived from log content):
- *JSON*: the full report, validated against the published schema in tests.
- *SIEM alerts (NDJSON)*: one ECS-style alert per finding (`@timestamp`, `event.*`, `rule.*`, `threat.*` ATT&CK ids/names, `host.name`, `user.name`, `source.ip`, `triage.*`). "ECS-style" means field naming only; it is not validated against a specific ECS version.
- *HTML*: a single self-contained file rendered from the **same React component** as the in-app print view (so they cannot drift), with its own CSP (`default-src 'none'; style-src 'unsafe-inline'`), no scripts, no links to the outside. `react-dom/server` is lazy-loaded.
- *PDF*: "Print / save as PDF" renders the report through a portal and opens the browser print dialog; an `@media print` stylesheet hides the app UI. (The browser's own PDF engine is used; there is no PDF library in the bundle.)

**Redaction** (opt-in, default off; `core/report/redact.ts`): accounts, hostnames, domains, SIDs and IPs become stable pseudonyms (`USER-1`, `HOST-2` ...), command lines are removed, process paths are reduced to the executable name, the source file name is dropped, and derived text (narratives, titles, link reasons) is rewritten. Well-known system accounts/SIDs are kept for readability. It is pseudonymization, not anonymization: timestamps, event IDs, counts, rule names, service names and executable names remain, so review before sharing externally.

**Logging-coverage notes:** the report tells the reader what the tool could not see: rules whose Event IDs are absent, process-creation events with no command line (a common audit misconfiguration), missing logon events, unparsed records.

**Hardening:** SRI (sha384) on the entry script and stylesheet (hashed on the files as written, because Vite rewrites chunks late); `public/_headers` for static hosts, kept equal to the policy used in tests; an automated source audit that fails the build on HTML-injection sinks, dynamic code, network/storage/navigation APIs or hard-coded URLs; exact-pinned dependencies; SBOM (`npm run sbom`) covering npm and Rust crates; unused `comlink` dependency removed; the rule engine releases all retained events after finalize. See `THREAT_MODEL.md` and `DEPLOYMENT.md`.

**Accessibility:** skip link, landmarks, native `<details>` disclosure widgets, labelled controls, table captions and `scope`, severity always shown as text (never color alone), live regions for progress/status, visible focus. An axe-core scan (WCAG 2.0/2.1/2.2 A and AA rules) runs in the browser gate against the app in light and dark mode and against the exported report. Automated scans catch roughly a third of accessibility issues: a manual screen-reader and keyboard pass is still recommended before wide rollout.

### Known limits (Phase 4)
- (Resolved in Phase 5: the source file is now hashed by a streaming SHA-256.)
- Print layout is verified by producing a PDF in Chromium, not by visual review in every browser.
- The ECS-style NDJSON has not been ingested into a live Elastic/Sentinel/Splunk instance in this repo's tests.

## Phase 3: correlation, chains, risk, EVTX (as built)

**Per-host, per-episode match findings.** Phase 2 produced one finding per match rule for the whole file, which blends hosts together.
Match rules now produce one finding per host per *episode* (hits separated by more than 1 hour start a new episode). Low/info rules collapse to one finding per host for the whole period, because splitting noisy context rules into episodes produced several findings per day on a normal workstation. This is what makes chaining meaningful. Behavior change from Phase 2: the same rule can now appear several times (once per host/episode).

**Sequence rules** (`kind: sequence`, engine in `core/rules/engine.ts`):
- Events matching any step are bucketed by the **primary correlation key** (`correlateOn[0]`); every step must bind a field to it. Example: `4624.TargetLogonId` and `4672.SubjectLogonId` and `4688.SubjectLogonId` all bind the `session` key.
- `scope: host` (default) prefixes the key with the computer name, because Logon IDs and PIDs are only unique per host/boot. Use `scope: global` for SIDs and account names that must match across hosts.
- Further `correlateOn` entries are **equality constraints** against the anchor event (e.g. same account *and* same source IP).
- Steps support `optional`, `negate` (the chain is void if the forbidden event occurs inside its span, same key) and `min` (N events, e.g. 5 failed logons). `ordered: false` allows any order inside `within`.
- Evaluation happens at finalize over collected events, so results do **not** depend on input order. Chains in a bucket do not overlap. `suppress` voids a chain if any event in it matches.
- Starter sequence rules: `LAT-001` (4624→4672→4688), `LAT-002` (remote logon then service install, PsExec pattern), `AUTH-006` (5+ failures then success), `ACC-003` (account created then added to a privileged group, by SID), `EVAS-002` (privileged session clears the log).

**Attack chains** (`core/correlate/chains.ts`): findings are linked when they share an entity and are close in time.

| Link key | Source | Max time gap |
|---|---|---|
| logon session (host + Logon ID) | Subject/TargetLogonId (system sessions 0x3e7/0x3e4/0x3e5 ignored) | none |
| host | computer | 1 h |
| account / SID | Subject/TargetUserName (machine accounts, SYSTEM etc. ignored), SIDs | 2 h |
| source IP | IpAddress (loopback ignored) | 2 h |
| process | host + NewProcessId/ProcessId (parent to child) | 1 h |

Only **medium+ findings and sequence matches** can link; low/info findings may join a chain but can never bridge two (noisy context rules cannot glue unrelated activity together). A chain needs a sequence match or 2+ medium-or-higher findings (low/info findings can decorate a chain but never create one; found on real workstation data, where a single medium finding plus context noise had been reported as an attack chain). Linking is interval-merging per key (O(n log n)); 20k findings chain in well under a second (tested).

**Risk score** (`core/correlate/risk.ts`, deterministic, shown to the analyst with a component breakdown):
severity weight (info 5, low 15, medium 35, high 60, critical 85) x (0.6 + 0.4 x rule confidence);
chain = strongest + 30% of 2nd + 15% of the next three + 5 per extra ATT&CK tactic (max 20) + 8 if 2+ hosts + 10 if a sequence rule matched, capped at 100.
Overall = highest item + 10%/5%/5% of the next three. Labels: Critical >= 80, High >= 60, Medium >= 35, Low >= 15. These weights are judgment calls, not statistics: tune them for your environment.

**EVTX** (`evtx-wasm/`, `src/parsers/evtx.ts`): the Rust `evtx` crate (0.12.3) compiled to WASM (about 237 KB). JS reads the file in 64 KiB chunks and passes each to `parse_chunk`, so memory is bounded for large logs. Under the strict CSP:
- The WASM bytes are embedded in a lazily loaded JS chunk (`wasmBytes.generated.ts`, loaded only for EVTX files) and instantiated with `initSync`. There is no `fetch`, so `connect-src 'none'` stays intact; only `'wasm-unsafe-eval'` is needed.
- `getrandom` uses `crypto.getRandomValues` (hash-map seeding inside a dependency).
- Chunk checksums are not enforced (live logs often have a stale checksum on the active chunk). Unused/zeroed chunks are skipped; a corrupt chunk counts as a malformed record instead of failing the file.
- Rebuild with `npm run build:evtx` (needs `rustup target add wasm32-unknown-unknown` and `cargo install wasm-bindgen-cli --version 0.2.100 --locked`). Generated files are committed so a Rust toolchain is not needed to build the app; `Cargo.lock` is committed and the build uses `--locked`. A test checks the embedded bytes against the recorded SHA-256.

### Known limits (Phase 3)
- **EVTX test coverage:** no real Windows-generated EVTX files were available. Tests use a synthetic EVTX writer (`e2e/evtxBuilder.mjs`: valid structure, inline names, no BinXML templates). Real files use template substitution heavily, which is handled by the upstream crate but is **not exercised by this repo's tests**. Validate against your own exports before relying on EVTX ingestion. `cargo audit` has not been run on the Rust dependency tree.
- Sequence collection is memory-capped (200 events per step per key, 500k per rule, 200k keys per rule). When a cap is hit the rule is listed in the UI as "lower bound" rather than silently truncating.
- Match evidence is capped (200 per host bucket, 200k per rule); episodes after the retained evidence show counts without evidence.
- Chains are leads, not attribution. Sharing a host or account within a window is suggestive, and busy shared servers can over-link. The link reasons are always shown so an analyst can judge.
- 4688 PID linking can be fooled by PID reuse (mitigated by the 1 h gap).
- Remaining schema/engine caveat from Phase 2: rules only see the normalized fields (`FIELD_NAMES`).

## Phase 1 deviations from the original plan, to be revisited:
- A **single ingest worker** does parse, normalize, and aggregate. The orchestrator / parser-pool / analysis-worker split arrives with Phase 2-3, when there is analysis work worth parallelising.
- UI uses plain CSS. Radix + Tailwind (build-time) and TanStack Table are introduced with the findings views in Phase 2.
- EVTX arrived in Phase 3 (see below).
- Normalized events are not retained (only counters and a 200-event sample); the rule engine consumes them through `ingest()`'s `onEvent` hook.

## Stack

Rust `evtx` to WASM (EVTX) · TypeScript (strict) · Vite · React 18 + Zustand · PapaParse (chunk mode, inside our own worker) · custom streaming JSON object splitter · `saxes` (SAX XML) · Vitest · Playwright-core (e2e gate). EVTX: Rust `evtx` crate to WASM (Phase 3). Rules: JSON (YAML accepted, converted at load), validated with Ajv standalone (no `unsafe-eval`).

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
