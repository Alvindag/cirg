# Threat model and security review

Scope: the browser application in `triage-engine/`. Assets: the analysed log data (account names, hostnames, IPs, command lines), the analyst's endpoint, and the integrity of the findings.

## Trust boundaries and inputs
| Input | Trust | Handling |
|---|---|---|
| Log files (CSV/JSON/XML/EVTX) | **Untrusted**, may be attacker-authored (command lines, usernames, hostnames are attacker-controlled) | Streamed parsers with size/depth caps; all output rendered as text (React escaping, no HTML sinks); regexes run only on the first 4096 chars of a field |
| Rule packs (JSON/YAML) | **Untrusted** if from third parties | 2 MB cap, safe YAML core schema + alias limit, schema-validated, field/list/CIDR/regex validated at load, ReDoS lint, per-rule time budget; declarative only (no code) |
| Response command templates | Untrusted text from packs, filled with untrusted log values | PowerShell placeholders must be single-quoted (checked at load), values escaped per shell (all PowerShell quote look-alikes handled), length-capped; displayed/copied only, **never executed** |
| Exported files | Output | No script, no network, own CSP, generated file names |
| Third-party code | Supply chain | Exact-pinned deps, lockfile, `npm audit` in CI, SBOM, no CDNs, SRI on app assets, Rust crate versions locked (`--locked`), WASM bytes SHA-256 checked by a test |

## Threats and mitigations
| # | Threat | Mitigation | Verified by |
|---|---|---|---|
| 1 | Log data exfiltrated by app, dependency, or injected script | CSP `default-src 'none'; connect-src 'none'; form-action 'none'`; no network APIs in source | `security.test.ts` source audit; gate: 0 external requests, 0 CSP violations |
| 2 | XSS via hostile log fields / rule text / file names | No `innerHTML`-class sinks; Trusted Types enforced (`require-trusted-types-for 'script'`, single `triage-worker` policy); exported HTML escaped by React and shipped with a no-script CSP | `exportHtml.test.ts` (hostile data + hostile pack), gate (XSS payload inert) |
| 3 | Data persisted after the tab closes | No Local/Session storage, IndexedDB, cookies, Cache API, service worker; blobs revoked; worker terminated on Clear/pagehide; engine maps cleared after finalize | `security.test.ts` (forbidden APIs), gate (storage empty) |
| 4 | Tampered/compromised hosting alters the app | SRI (sha384) on the entry script and stylesheet, enforced by the browser; same-origin only. **Limits:** SRI protects against modified assets, not a modified `index.html` (an attacker who controls the server controls the hashes). Host from a trusted origin and pin the release hash out of band | gate: untouched bundle runs, tampered bundle blocked |
| 5 | ReDoS / CPU exhaustion from malicious rules or logs | Regex length cap, nested-quantifier lint, input cap, 1-in-128 sampled time budget that disables a rule visibly; all work is in a worker so the UI stays responsive | `engine.test.ts`, gate (responsive UI) |
| 6 | Memory exhaustion | Streaming parse, bounded evidence/correlation caps, capped rules reported as "lower bound" | scale tests (2.4M events, heap growth bounded) |
| 7 | Command injection via copied remediation commands | Escaping + quoting lint; commands are labelled, disruptive ones flagged; never auto-run | `engine.test.ts` (escaping suite) |
| 8 | Sensitive data leaking through shared reports | Opt-in pseudonymization of accounts/hosts/domains/SIDs/IPs, command lines removed, source file name removed. **Limits:** pseudonymization, not anonymization; timestamps, event IDs, process names, rule names and counts remain | `report.test.ts` / `exportHtml.test.ts` leak checks, gate (downloaded files) |
| 9 | Malicious EVTX exploiting the parser | Parsing is inside a WASM sandbox in a worker, chunk by chunk, Rust memory-safe code; corrupt chunks become "malformed" counts. **Limits:** untested against real-world malformed corpora; `cargo audit` has not been run | `evtx.test.ts` (corrupt chunk) |
| 11 | Exported report altered after the fact | SHA-256 content hash in the report, `scripts/verify-report.mjs`, source-file SHA-256 for chain of custody. **Limits:** integrity only, not authenticity: sign the file separately | `audit.test.ts` (tamper detection), gate (verifier on a downloaded report) |
| 12 | Overstated compliance claims | Control references are labelled indicative everywhere they appear; `docs/COMPLIANCE.md` lists what is not covered | `audit.test.ts`, report limitations |
| 10 | Misleading results (false confidence) | Coverage notes (e.g. no command lines in 4688), "lower bound" flags, limitations section, explicit statement that absence of findings is not proof | `report.test.ts` |

## Reviewed and accepted
- `'wasm-unsafe-eval'` is required to instantiate WebAssembly; it does not enable JavaScript `eval`.
- Meta-CSP cannot carry `frame-ancestors` or Trusted Types: production must send headers (see DEPLOYMENT.md).
- The clipboard API is used for the Copy buttons (user-initiated only).
- Detection logic is only as good as its rules: the starter pack is a baseline, not a substitute for a SIEM.
