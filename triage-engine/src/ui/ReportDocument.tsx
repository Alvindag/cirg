import { describeAuditChanges } from '../core/audit/auditCodes'
import type { Report, ReportCommand, ReportEvent, ReportFinding } from '../core/report/model'

const fmt = (iso: string | null) => (iso ? iso.replace('T', ' ').replace(/\.\d+Z$/, 'Z').replace(/Z$/, ' UTC') : '—')
const SEV = ['critical', 'high', 'medium', 'low', 'info'] as const
const MAX_EVIDENCE_ROWS = 10

function Sev({ s }: { s: string }) { return <span className={`rsev rsev-${s.toLowerCase()}`}>{s.toUpperCase()}</span> }

function evidenceDetail(e: ReportEvent): string {
  const f = e.fields
  const apc = f['auditPolicyChanges']
  const main = f['commandLine'] ?? f['newProcessName'] ?? f['processName'] ?? f['serviceName'] ?? (apc ? describeAuditChanges(String(apc)) : undefined)
    ?? (f['logonType'] !== undefined ? `LogonType ${f['logonType']}${f['authenticationPackage'] ? ` ${f['authenticationPackage']}` : ''}` : undefined)
  return [main, f['targetServerName'] ? `→ ${f['targetServerName']}` : undefined, f['workstationName'] ? `from ${f['workstationName']}` : undefined].filter(Boolean).join(' ') || '—'
}
function EvidenceTable({ rows, total }: { rows: ReportEvent[]; total: number }) {
  const shown = rows.slice(0, MAX_EVIDENCE_ROWS)
  return (
    <table>
      <caption>Evidence (earliest {shown.length} of {total.toLocaleString()} matching events)</caption>
      <thead><tr><th scope="col">Time (UTC)</th><th scope="col">Event ID</th><th scope="col">Host</th><th scope="col">Account</th><th scope="col">Source IP</th><th scope="col">Detail</th></tr></thead>
      <tbody>{shown.map((e, i) => (
        <tr key={i}><td className="nw">{fmt(e.time)}</td><td>{e.eventId}</td><td className="nw">{e.computer ?? '—'}</td>
          <td>{String(e.fields['targetUserName'] ?? e.fields['subjectUserName'] ?? '—')}</td><td>{String(e.fields['ipAddress'] ?? '—')}</td>
          <td className="wrap"><code>{evidenceDetail(e)}</code></td></tr>
      ))}</tbody>
    </table>
  )
}

function Command({ c }: { c: ReportCommand }) {
  return (
    <li>
      <strong>{c.title}</strong>{c.risk === 'disruptive' && <> <span className="rbadge">DISRUPTIVE: obtain approval first</span></>}
      {c.command && c.shell === 'manual' && <p>{c.command}</p>}
      {c.command && c.shell !== 'manual' && <pre><code>{c.command}</code></pre>}
      {c.unfilled.length > 0 && <p className="note">Fill in manually: {c.unfilled.join(', ')}</p>}
    </li>
  )
}

/** Dedup identical commands within one chain/section. */
function uniq(cmds: { c: ReportCommand; from: string }[]) {
  const seen = new Set<string>()
  return cmds.filter(({ c }) => { const k = `${c.title}\u0001${c.command ?? ''}`; if (seen.has(k)) return false; seen.add(k); return true })
}

function FindingDetail({ f }: { f: ReportFinding }) {
  return (
    <section className="finding-block" aria-labelledby={`f-${f.id}`}>
      <h4 id={`f-${f.id}`}><Sev s={f.severity} /> {f.ruleName} <span className="meta">({f.ruleId})</span></h4>
      <dl>
        <dt>When</dt><dd>{fmt(f.firstSeen)} to {fmt(f.lastSeen)}</dd>
        <dt>Events</dt><dd>{f.count.toLocaleString()}{f.host ? ` on ${f.host}` : ''}{f.group ? ` (${Object.entries(f.group).map(([k, v]) => `${k}: ${v}`).join(', ')})` : ''}</dd>
        <dt>ATT&amp;CK</dt><dd>{f.attack.map((a) => `${a.tacticName ?? a.tactic} (${a.tactic}) / ${a.techniqueName ?? 'unknown'} (${a.technique})`).join('; ')}</dd>
        <dt>Confidence</dt><dd>{Math.round(f.confidence * 100)}% (rule-author estimate)</dd>
        <dt>Accounts</dt><dd>{f.entities.accounts.map(([n, c]) => `${n} (${c})`).join(', ') || '—'}</dd>
        <dt>Source IPs</dt><dd>{f.entities.ips.map(([n, c]) => `${n} (${c})`).join(', ') || '—'}</dd>
        {f.suppressedEvents > 0 && (<><dt>Suppressed</dt><dd>{f.suppressedEvents.toLocaleString()} matching events excluded by the rule&apos;s suppress list</dd></>)}
      </dl>
      {f.steps && <ol>{f.steps.map((s) => <li key={s.id}><strong>{s.id}</strong>: {s.events.map((e) => `${e.eventId} @ ${fmt(e.time)}`).join('; ')}</li>)}</ol>}
      {f.evidence.length > 0 ? <EvidenceTable rows={f.evidence} total={f.count} /> : <p className="note">Evidence events were not retained (memory cap); counts are still accurate.</p>}
    </section>
  )
}

export function ReportDocument({ report: r }: { report: Report }) {
  const es = r.executiveSummary
  const byRule = new Map<string, ReportFinding[]>()
  for (const f of r.findings) byRule.set(f.ruleId, [...(byRule.get(f.ruleId) ?? []), f])
  const byId = new Map(r.findings.map((f) => [f.id, f]))
  const chained = new Set(r.chains.flatMap((c) => c.findingIds))
  const loose = r.findings.filter((f) => !chained.has(f.id))
  const unchainedActionable = loose.filter((f) => f.severity !== 'info')

  return (
    <article className="report" aria-label="Windows Security triage report">
      <header>
        <p className="rkicker">CONFIDENTIAL · SECURITY INCIDENT TRIAGE</p>
        <h1>Windows Security Event Log Triage Report</h1>
        <p className="meta">Generated {fmt(r.generatedAt)} by {r.tool.name} v{r.tool.version} · schema {r.schemaVersion}</p>
        {(r.case.id || r.case.analyst || r.case.organisation) && (
          <p className="meta">{[r.case.id && `Case ${r.case.id}`, r.case.analyst && `Analyst: ${r.case.analyst}`, r.case.organisation && r.case.organisation].filter(Boolean).join(' · ')}</p>
        )}
        <p className={`rnotice${r.redaction.applied ? ' redacted' : ''}`} role="note"><strong>{r.redaction.applied ? 'Redacted report. ' : 'Contains sensitive data. '}</strong>{r.redaction.note}</p>
        <nav aria-label="Report sections"><ol>
          <li><a href="#exec">Executive summary</a></li><li><a href="#deep">Technical deep dive</a></li>
          <li><a href="#context">Contextual analysis</a></li><li><a href="#next">Actionable next steps</a></li><li><a href="#appendix">Appendix</a></li>
        </ol></nav>
      </header>

      <section id="exec" aria-labelledby="exec-h">
        <h2 id="exec-h">1. Executive summary</h2>
        <p className="big"><span className={`rsev rsev-${es.risk.label === 'Informational' ? 'info' : es.risk.label.toLowerCase()}`}>{es.risk.label.toUpperCase()} RISK {es.risk.score}/100</span></p>
        <p>{es.headline}</p>
        <table>
          <caption>Detections by severity</caption>
          <thead><tr><th scope="col">Attack chains</th>{SEV.map((s) => <th scope="col" key={s}>{s[0]!.toUpperCase() + s.slice(1)}</th>)}<th scope="col">Total findings</th></tr></thead>
          <tbody><tr><td>{es.counts.chains}</td>{SEV.map((s) => <td key={s}>{es.counts.bySeverity[s]}</td>)}<td>{es.counts.findings}</td></tr></tbody>
        </table>
        {es.topThreats.length > 0 && (<><h3>Top threats</h3><ol>{es.topThreats.map((t) => <li key={t.id}><strong>{t.title}</strong> ({t.kind === 'chain' ? `attack chain ${t.id}` : 'single finding'}, score {t.score}/100)</li>)}</ol></>)}
        {es.recommendedActions.length > 0 && (<><h3>Recommended actions</h3><ul>{es.recommendedActions.map((a, i) => <li key={i}>{a}</li>)}</ul></>)}
        <table>
          <caption>Scope of analysis</caption>
          <tbody>
            <tr><th scope="row">Source file</th><td>{r.source.fileName} ({r.source.format.toUpperCase()}, {(r.source.sizeBytes / 1e6).toFixed(1)} MB)</td></tr>
            <tr><th scope="row">Records</th><td>{r.source.records.toLocaleString()} ({r.source.parsedEvents.toLocaleString()} parsed, {r.source.rejectedRecords.toLocaleString()} rejected)</td></tr>
            <tr><th scope="row">Time range</th><td>{fmt(r.source.firstEvent)} to {fmt(r.source.lastEvent)}</td></tr>
            <tr><th scope="row">Hosts</th><td>{r.source.hostCount.toLocaleString()}</td></tr>
          </tbody>
        </table>
        <details open><summary>How the overall score was calculated</summary>
          <table><thead><tr><th scope="col">Component</th><th scope="col">Points</th></tr></thead>
            <tbody>{es.risk.components.map((c, i) => <tr key={i}><td>{c.label}</td><td>+{c.points}</td></tr>)}</tbody></table>
        </details>
      </section>

      <section id="deep" aria-labelledby="deep-h">
        <h2 id="deep-h">2. Technical deep dive</h2>
        {r.chains.length === 0 && <p>No correlated attack chains were identified.</p>}
        {r.chains.map((c) => (
          <section key={c.id} className="chain-block" aria-labelledby={`c-${c.id}`}>
            <h3 id={`c-${c.id}`}>{c.id}: {c.title} <span className={`rsev rsev-${c.risk.label === 'Informational' ? 'info' : c.risk.label.toLowerCase()}`}>{c.risk.label.toUpperCase()} {c.risk.score}/100</span></h3>
            <dl>
              <dt>Window</dt><dd>{fmt(c.firstSeen)} to {fmt(c.lastSeen)}</dd>
              <dt>Hosts</dt><dd>{c.hosts.join(', ') || '—'}</dd><dt>Accounts</dt><dd>{c.accounts.join(', ') || '—'}</dd><dt>Source IPs</dt><dd>{c.ips.join(', ') || '—'}</dd>
              <dt>Linked because</dt><dd>{c.linkedBecause.join('; ') || 'correlated sequence rule'}</dd>
              <dt>ATT&amp;CK stages</dt><dd>{c.stages.map((s) => `${s.tacticName ?? s.tactic} (${s.tactic})`).join(' → ')}</dd>
            </dl>
            <h4>Attack narrative</h4>
            <ol className="timeline">{c.narrative.map((n, i) => <li key={i}><time dateTime={n.time}>{fmt(n.time)}</time> {n.text}</li>)}</ol>
            <table><caption>Score breakdown</caption><thead><tr><th scope="col">Component</th><th scope="col">Points</th></tr></thead>
              <tbody>{c.risk.components.map((x, i) => <tr key={i}><td>{x.label}</td><td>+{x.points}</td></tr>)}<tr><th scope="row">Total (max 100)</th><td>{c.risk.score}</td></tr></tbody></table>
            {c.findingIds.map((id) => byId.get(id)).map((f) => (f ? <FindingDetail key={f.id} f={f} /> : null))}
          </section>
        ))}
        {loose.length > 0 && (<><h3>Findings outside attack chains</h3>{loose.map((f) => <FindingDetail key={f.id} f={f} />)}</>)}
        <h3>MITRE ATT&amp;CK coverage</h3>
        {r.attackCoverage.length === 0 ? <p>No techniques observed.</p> : (
          <table><thead><tr><th scope="col">Tactic</th><th scope="col">Technique</th><th scope="col">Rules</th><th scope="col">Findings</th></tr></thead>
            <tbody>{r.attackCoverage.flatMap((t) => t.techniques.map((x, i) => (
              <tr key={`${t.tactic}${x.technique}`}>{i === 0 ? <th scope="row" rowSpan={t.techniques.length}>{t.tacticName ?? t.tactic} ({t.tactic})</th> : null}
                <td>{x.techniqueName ?? 'unknown'} ({x.technique})</td><td>{x.ruleIds.join(', ')}</td><td>{x.findingIds.length}</td></tr>
            )))}</tbody></table>
        )}
      </section>

      <section id="context" aria-labelledby="context-h">
        <h2 id="context-h">3. Contextual analysis</h2>
        <p className="note">Why each detection is suspicious, and what legitimate activity can look the same. Confirm with the account owner or change records before concluding.</p>
        {[...byRule].map(([ruleId, fs]) => {
          const f0 = fs[0]!
          const where = [...new Set(fs.map((f) => f.host).filter(Boolean))]
          return (
            <section key={ruleId} aria-labelledby={`x-${ruleId}`}>
              <h3 id={`x-${ruleId}`}><Sev s={f0.severity} /> {f0.ruleName} <span className="meta">({ruleId}; {fs.length} finding{fs.length === 1 ? '' : 's'}{where.length ? ` on ${where.slice(0, 5).join(', ')}${where.length > 5 ? ` +${where.length - 5}` : ''}` : ''})</span></h3>
              {f0.context.summary && <p><strong>Why it matters.</strong> {f0.context.summary}</p>}
              {f0.context.maliciousIndicators.length > 0 && (<><h4>Signs it is malicious</h4><ul>{f0.context.maliciousIndicators.map((x, i) => <li key={i}>{x}</li>)}</ul></>)}
              {f0.context.legitimateExplanations.length > 0 && (<><h4>Possible legitimate explanations</h4><ul>{f0.context.legitimateExplanations.map((x, i) => <li key={i}>{x}</li>)}</ul></>)}
              {f0.context.references.length > 0 && <p className="note">References: {f0.context.references.join(' ')}</p>}
            </section>
          )
        })}
        {byRule.size === 0 && <p>No findings to analyse.</p>}
      </section>

      <section id="next" aria-labelledby="next-h">
        <h2 id="next-h">4. Actionable next steps</h2>
        <p className="note">Commands are templates filled from the earliest evidence event. Review every command before running it. This tool never executes anything. Preserve evidence before containment.</p>
        {(() => {
          const groups = [...r.chains.map((c) => ({ key: c.id, title: `${c.id}: ${c.title}`, ids: c.findingIds })),
            ...(unchainedActionable.length ? [{ key: 'other', title: 'Findings outside attack chains', ids: unchainedActionable.map((f) => f.id) }] : [])]
            .map((g) => {
              const fs = g.ids.map((id) => byId.get(id)).filter((f): f is ReportFinding => !!f)
              return { ...g, inv: uniq(fs.flatMap((f) => f.nextSteps.investigate.map((c) => ({ c, from: f.ruleId })))), rem: uniq(fs.flatMap((f) => f.nextSteps.remediate.map((c) => ({ c, from: f.ruleId })))) }
            }).filter((g) => g.inv.length || g.rem.length)
          if (!groups.length) return <p>{r.findings.length ? 'No investigation or remediation commands apply to the findings in this report. Review the recommended actions in the executive summary.' : 'No findings, so no actions are required from this analysis. Re-run after the audit coverage gaps (if any) are closed.'}</p>
          return groups.map((g) => (
            <section key={g.key} aria-label={g.title}>
              <h3>{g.title}</h3>
              {g.inv.length > 0 && (<><h4>Investigate (read-only)</h4><ol>{g.inv.map(({ c }, i) => <Command key={i} c={c} />)}</ol></>)}
              {g.rem.length > 0 && (<><h4>Contain and remediate</h4><ol>{g.rem.map(({ c }, i) => <Command key={i} c={c} />)}</ol></>)}
            </section>
          ))
        })()}
      </section>

      <section id="appendix" aria-labelledby="app-h">
        <h2 id="app-h">5. Appendix</h2>

        <h3>5.1 Methodology</h3>
        <p>Events were parsed locally in the browser, normalised, evaluated against the rule packs below ({r.methodology.passes === 2 ? 'two-pass correlation was used' : 'single pass'}), and correlated into chains by shared sessions, hosts, accounts, IPs and process IDs. ATT&amp;CK data: {r.methodology.attackVersion}. No log data was transmitted off the analyst&apos;s machine.</p>
        <table><caption>Rule packs (content hashes allow the exact rules to be reproduced)</caption><thead><tr><th scope="col">Pack</th><th scope="col">Version</th><th scope="col">Rules</th><th scope="col">SHA-256</th></tr></thead>
          <tbody>{r.methodology.rulePacks.map((p) => <tr key={p.id}><td>{p.name} ({p.id})</td><td>{p.version}</td><td>{p.rules}</td><td className="wrap"><code>{p.sha256}</code></td></tr>)}</tbody></table>
        {r.methodology.ruleLoadErrors.length > 0 && (<><h4>Rule load errors (these rules did not run)</h4><ul>{r.methodology.ruleLoadErrors.map((e, i) => <li key={i}>{e}</li>)}</ul></>)}

        <h3>5.2 Evidence integrity and chain of custody</h3>
        <table>
          <caption>Provenance of this analysis</caption>
          <tbody>
            <tr><th scope="row">Source file SHA-256</th><td className="wrap"><code>{r.source.sha256 || 'not computed'}</code></td></tr>
            <tr><th scope="row">Source size</th><td>{r.source.sizeBytes.toLocaleString()} bytes</td></tr>
            <tr><th scope="row">Analysis tool</th><td>{r.tool.name} v{r.tool.version}</td></tr>
            <tr><th scope="row">Report generated</th><td>{fmt(r.generatedAt)}</td></tr>
            <tr><th scope="row">Report content SHA-256</th><td className="wrap"><code>{r.integrity.contentSha256}</code></td></tr>
            <tr><th scope="row">Record-number continuity</th><td>{r.loggingAssessment.recordIntegrity.note}</td></tr>
          </tbody>
        </table>
        <p className="note">The content hash covers this report&apos;s data (the JSON export without its integrity block; verify with <code>scripts/verify-report.mjs</code>). It proves the file was not altered after export, not who produced it: sign the file separately if you need authenticity. Keep the original log file, and compare its SHA-256 with the value above.</p>

        <h3>5.3 Audit logging assessment</h3>
        <p>{r.loggingAssessment.summary.observed} of {r.loggingAssessment.summary.evaluated} evaluated audit areas were observed in a {r.loggingAssessment.windowHours.toFixed(1)}-hour window. Log source: {r.loggingAssessment.role === 'dc' ? 'domain controller' : r.loggingAssessment.role === 'member' ? 'workstation or member server' : 'unknown role'}{r.loggingAssessment.roleInferred ? ' (inferred)' : ''}. &quot;Possible gap&quot; means an event type that normally appears constantly was absent, so the audit setting is probably off. Missing rare events is normal.</p>
        <table>
          <caption>Audit areas</caption>
          <thead><tr><th scope="col">Area</th><th scope="col">Event IDs</th><th scope="col">Observed</th><th scope="col">Status</th><th scope="col">Note</th></tr></thead>
          <tbody>{r.loggingAssessment.rows.map((x) => (
            <tr key={x.id}><td>{x.area}</td><td>{x.eventIds.join(', ')}</td><td>{x.observed.toLocaleString()}</td>
              <td>{x.status === 'observed' ? 'Observed' : x.status === 'possible-gap' ? 'POSSIBLE GAP' : x.status === 'not-evaluated' ? 'Not evaluated' : 'Not observed'}</td>
              <td>{x.note}{(x.status === 'possible-gap' || x.status === 'not-observed') && x.enable && x.expectation !== 'rare' ? <> Enable: <code>{x.enable}</code></> : null}{x.hint ? ` ${x.hint}` : ''}</td></tr>
          ))}</tbody>
        </table>
        <p><strong>Process command lines:</strong> {r.loggingAssessment.commandLine.note}{r.loggingAssessment.commandLine.percent !== null ? ` (${r.loggingAssessment.commandLine.percent}% of ${r.loggingAssessment.commandLine.processEvents.toLocaleString()} process-creation events)` : ''}</p>
        <p><strong>Periods with no events:</strong> {r.loggingAssessment.logGapsNote}</p>
        {r.loggingAssessment.logGaps.length > 0 && (
          <table><caption>Longest gaps</caption><thead><tr><th scope="col">From (UTC)</th><th scope="col">To (UTC)</th><th scope="col">Hours</th></tr></thead>
            <tbody>{r.loggingAssessment.logGaps.map((g, i) => <tr key={i}><td>{fmt(g.from)}</td><td>{fmt(g.to)}</td><td>{g.hours}</td></tr>)}</tbody></table>
        )}

        <h3>5.4 Control mapping (indicative)</h3>
        <p className="note">Which framework controls the detections and logging areas above are relevant to. This points reviewers at evidence; it is not an assessment of compliance, which depends on your organisation&apos;s processes and an assessor&apos;s judgement. Verify identifiers against the current edition of each framework.</p>
        {r.controlMapping.length === 0 ? <p>No controls to list.</p> : r.controlMapping.map((fw) => (
          <table key={fw.framework}>
            <caption>{fw.frameworkName}</caption>
            <thead><tr><th scope="col">Control</th><th scope="col">Relevant detections (rules)</th><th scope="col">Logging areas observed</th></tr></thead>
            <tbody>{fw.controls.map((c) => (
              <tr key={c.id}><td>{c.id}{c.title ? `: ${c.title}` : ''}</td><td>{c.ruleIds.length ? `${c.ruleIds.join(', ')} (${c.findingIds.length} finding${c.findingIds.length === 1 ? '' : 's'})` : '—'}</td><td>{c.loggingAreas.join('; ') || '—'}</td></tr>
            ))}</tbody>
          </table>
        ))}

        <h3>5.5 Limitations</h3>
        <ul>{r.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
      </section>
    </article>
  )
}
