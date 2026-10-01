# Audit and cybersecurity framework alignment

**Read this first.** No tool "meets" or "is compliant with" a framework. SOC 2, ISO/IEC 27001, PCI DSS, HIPAA and the NIST publications assess an *organisation's* policies, processes and controls, and certification or attestation comes from an assessor. What a tool can do is (1) produce evidence that an assessor or analyst can use, (2) avoid weakening the controls around it, and (3) be built and operated securely itself. This document says which of those this tool does, and which it does not.

All control identifiers are **indicative pointers** to relevant evidence. They are not an assessment. Verify identifiers and wording against the current edition of each framework before citing them in an audit.

## 1. How the tool supports control objectives

| Capability (where) | What it gives an auditor or analyst | Relevant controls (indicative) |
|---|---|---|
| **Audit-log review and analysis**: rule-based detections, correlated attack chains, explainable risk score | Documented, repeatable review of Windows Security logs with findings, evidence and reasoning | NIST 800-53 AU-6, AU-7, SI-4 · 800-171 3.3.5, 3.3.6, 3.14.6 · CSF DE.AE-02/03, DE.CM-03/09 · ISO A.8.15, A.8.16 · PCI DSS 10.4.1 (review; the tool assists a reviewer, it does not perform the daily automated review) · CIS 8.11 · SOC 2 CC7.2, CC7.3 · HIPAA 164.308(a)(1)(ii)(D) |
| **Audit logging assessment** (report 5.3, app panel): which audit areas are active, absent-but-expected ("possible gap"), command-line coverage, periods with no events | Evidence about whether audit logging is actually generating the events a control expects, with the `auditpol` command to fix each gap | AU-2, AU-3, AU-12 · 800-171 3.3.1 · PR.PS-04 · ISO A.8.15 · PCI 10.2.1, 10.2.2 · CIS 8.2, 8.5 · HIPAA 164.312(b) |
| **Log-integrity indicators**: EventRecordID continuity, gaps in time, log-cleared and audit-policy-change detections | Indications of removed or tampered records | AU-9 · 800-171 3.3.8 · PCI 10.2.1.6, 10.3.2 · ISO A.8.15 |
| **Chain of custody**: SHA-256 of the exact source file, rule-pack hashes, tool version, case ID / analyst / organisation, report content hash, `scripts/verify-report.mjs` | Provenance and reproducibility: the same file and rule packs give the same findings, and later modification of an exported report is detectable | CSF RS.AN-03, RS.AN-07 · ISO A.5.28 · 800-61 Rev. 2 §3.2 (evidence handling) |
| **Incident documentation**: executive summary, technical deep dive, contextual analysis (false-positive guidance), next steps, limitations | A reviewable record of what was found, why, and what to do | IR-4, IR-5, IR-6 · 800-171 3.6.1 · ISO A.5.25, A.5.26 · SOC 2 CC7.3, CC7.4 |
| **Control mapping** (report 5.4; `controls` on every rule) | Which controls each detection and logging area supplies evidence for, across 8 frameworks | NIST 800-53, 800-171, CSF 2.0 · ISO 27001:2022 · PCI DSS 4.0 · CIS v8 · SOC 2 · HIPAA |
| **Local-only processing, no storage, no telemetry** | Data minimisation and no third-party transfer of log data | Supports data-protection-by-design. The operator remains responsible for lawful basis, DPIA, retention and access control of the files they handle |
| **Redaction option** | Share findings without account names, hostnames, IPs, SIDs and command lines | Privacy and need-to-know handling. Pseudonymization, not anonymization |

## 2. What the tool does NOT do (gaps to cover elsewhere)

| Control area | Why it is out of scope | What to use |
|---|---|---|
| Log generation configuration (AU-12, CIS 8.2/8.5, PCI 10.2) | The tool *reports* gaps, it does not change audit policy | Group Policy / `auditpol`; the assessment lists the exact command and `docs/AUDIT_SETUP.md` has the full baseline, DC and DCSync-auditing scripts |
| Central collection and real-time alerting (CIS 8.9, 13.1; PCI 10.4.1 automation; SI-4 continuous) | It analyses files you give it, one at a time | A SIEM (Sentinel, Splunk, Elastic). The NDJSON export is ECS-style so alerts can be forwarded |
| Retention (AU-11, CIS 8.10, PCI 10.5.1: 12 months, 3 immediately available) | The tool does not store anything. It reports only the window covered by each file | Log-retention configuration and archive process |
| Time synchronisation (AU-8, PCI 10.6, ISO A.8.17) | It uses the timestamps in the logs (UTC) and cannot verify clock accuracy | NTP/Windows Time on the sources |
| Protecting the logs themselves (AU-9, PCI 10.3) | It cannot protect logs at the source, only detect some tampering symptoms | Restricted ACLs, forwarding to a write-once store |
| Access control for the tool and the files it handles (AC-2, AC-3, ISO A.5.15) | There are no accounts: it runs in the analyst's browser on the analyst's machine | OS access control, disk encryption, restricted shares for exported reports |
| Report authenticity | The content hash proves *integrity* only. Anyone can recompute it | Sign exported reports (for example with your PKI or `minisign`) and store them in evidence management |
| Automated response (IR-4 containment) | Commands are shown, never executed | Your EDR/SOAR and change process |
| Legal admissibility | Hashing and metadata support evidence handling but do not make evidence admissible | Your forensic and legal procedures |

## 3. Security of the tool itself

| Practice | Evidence in this repository | Honest limits |
|---|---|---|
| Secure development (NIST SSDF SP 800-218: PW.4, PW.7, PW.8, RV.1) | Exact-pinned dependencies and lockfile; automated source audit for dangerous APIs; ~180 unit tests plus a real-browser gate; independent security-review pass; `npm audit` in CI | No external penetration test. Rust dependencies not yet `cargo audit`ed |
| Supply-chain transparency (SSDF PS.3, CycloneDX) | `npm run sbom`: CycloneDX 1.5 covering npm and the Rust crates in the EVTX parser | No signed releases or build provenance (SLSA) yet |
| Integrity of the delivered app | Subresource Integrity on the entry script and stylesheet, enforced by the browser; strict CSP; Trusted Types | SRI does not protect against a compromised server that also rewrites `index.html`. Host internally or distribute a signed archive |
| Application security (OWASP ASVS: output encoding, dependency management, HTTP security headers, client-side data protection) | React escaping, no HTML sinks, exported HTML script-free with its own CSP, headers in `public/_headers`, no storage or network APIs | Not an ASVS certification |
| Accessibility (WCAG 2.2 AA) | axe-core scans in light/dark and on the exported report: zero violations | Automated scans find only part of the issues. A manual screen-reader/keyboard audit is still required before claiming conformance |
| Threat model | `docs/THREAT_MODEL.md` | Self-reviewed |

## 4. Using the tool in an audit or investigation: evidence package

1. Confirm the audit baseline is enabled (use the assessment's `auditpol` commands) and leave it running for the period you need evidence for.
2. Export the log (EVTX preferred) and record the file's SHA-256 from your own tooling (`Get-FileHash -Algorithm SHA256 file.evtx`).
3. Run the tool, fill in the **Case details**, choose the correct **Log source** (domain controller or workstation).
4. Export **JSON** (structured evidence) and **HTML** (management review). Use **Redact** for any copy leaving the investigation team.
5. Verify: `node scripts/verify-report.mjs report.json original.evtx`. The source SHA-256 in the report must equal your recorded hash.
6. Sign and store the report and the original log in your evidence system. Record retention according to your policy.

## 5. Maintaining the mappings
Each rule in a pack may list `controls` as `framework:id` strings (for example `pci-dss-4:10.4.1`). Frameworks and titles live in `src/core/audit/controls.ts`; an unknown framework fails the pack, an unknown ID produces a warning. Add the frameworks your organisation answers to (for example NIS2, DORA, ISO 27035, a national framework) by extending that catalog and mapping your own rules, and have the mappings reviewed by someone who owns the relevant compliance programme.
