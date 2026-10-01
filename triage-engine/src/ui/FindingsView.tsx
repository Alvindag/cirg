import { useState } from 'react'
import type { Finding } from '../core/rules/types'
import { renderAction } from '../core/rules/render'
import type { CanonicalEvent } from '../core/types'

const fmtTs = (t: number) => new Date(t).toISOString().replace('T', ' ').slice(0, 19) + 'Z'
export const fmtTime = fmtTs
const SEV_LABEL = { critical: 'CRITICAL', high: 'HIGH', medium: 'MEDIUM', low: 'LOW', info: 'INFO' } as const

function Evidence({ rows }: { rows: CanonicalEvent[] }) {
  return (
    <div className="scroll">
      <table>
        <caption>Evidence (earliest matching events)</caption>
        <thead><tr><th>Time (UTC)</th><th>ID</th><th>Host</th><th>Account</th><th>Source IP</th><th>Detail</th></tr></thead>
        <tbody>
          {rows.map((e, i) => (
            <tr key={i}>
              <td>{fmtTs(e.ts)}</td><td>{e.eventId}</td><td>{e.computer ?? '—'}</td>
              <td>{e.targetUserName ?? e.subjectUserName ?? '—'}</td><td>{e.ipAddress ?? '—'}</td>
              <td className="wrap"><code>{[e.commandLine ?? e.newProcessName ?? e.processName ?? e.serviceName ?? (e.logonType !== undefined ? `LogonType ${e.logonType}` : undefined), e.targetServerName ? `→ ${e.targetServerName}` : undefined].filter(Boolean).join(' ') || '—'}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Commands({ f }: { f: Finding }) {
  const [i, setI] = useState(0)
  const [copied, setCopied] = useState<string | null>(null)
  const ev = f.evidence[i]
  const groups = [['Investigate', f.response?.investigate], ['Remediate', f.response?.remediate]] as const
  if (!groups.some(([, a]) => a?.length)) return null
  const copy = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1500) } catch { /* clipboard unavailable */ }
  }
  return (
    <div>
      <h4>Next steps</h4>
      {f.evidence.length > 1 && (
        <label className="inline">Fill commands from evidence row{' '}
          <select value={i} onChange={(e) => setI(Number(e.target.value))}>
            {f.evidence.map((e, k) => <option key={k} value={k}>{k + 1}: {fmtTs(e.ts)} {e.computer ?? ''}</option>)}
          </select>
        </label>
      )}
      <p className="note">Commands are templates for you to review and run yourself. This tool never executes anything.</p>
      {groups.map(([label, acts]) => acts?.length ? (
        <div key={label}>
          <h5>{label}</h5>
          <ul className="plain">
            {acts.map((a, k) => {
              const r = renderAction(a, ev)
              const key = `${label}${k}`
              return (
                <li key={k}>
                  <strong>{r.title}</strong>{r.risk === 'disruptive' && <span className="badge warnb"> disruptive: confirm before running</span>}
                  {r.command && (
                    <div className="cmd">
                      <pre><code>{r.command}</code></pre>
                      <button onClick={() => copy(r.command!, key)}>{copied === key ? 'Copied' : 'Copy'}</button>
                    </div>
                  )}
                  {r.missing.length > 0 && <p className="note">Not available in the evidence: {r.missing.join(', ')}. Fill the &lt;placeholders&gt; manually.</p>}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null)}
    </div>
  )
}

export function FindingCard({ f }: { f: Finding }) {
  const ctx = f.context
  const ent = f.entities
  const fmtEnt = (l: [string, number][]) => l.map(([k, n]) => `${k} (${n})`).join(', ') || '—'
  return (
    <details className={`finding sev-${f.severity}`}>
      <summary>
        <span className={`sev sev-${f.severity}`}>{SEV_LABEL[f.severity]}</span>{' '}
        <strong>{f.ruleName}</strong>
        <span className="meta"> · {f.ruleId} · {f.count.toLocaleString()} event{f.count === 1 ? '' : 's'}
          {f.group ? ` · ${Object.entries(f.group).map(([k, v]) => `${k}=${v}`).join(', ')}` : ''}</span>
      </summary>
      <div className="body">
        <dl>
          <dt>When</dt><dd>{fmtTs(f.firstTs)} → {fmtTs(f.lastTs)}</dd>
          <dt>Confidence</dt><dd>{Math.round(f.confidence * 100)}% (rule-author estimate, not a probability)</dd>
          <dt>MITRE ATT&amp;CK</dt>
          <dd>{f.attack.map((a) => `${a.tacticName ?? a.tactic} (${a.tactic}) → ${a.techniqueName ?? 'unknown'} (${a.technique})`).map((t, i) => <div key={i}>{t}</div>)}</dd>
          {f.distinctCount !== undefined && (<><dt>Distinct values</dt><dd>{f.distinctCount}</dd></>)}
          <dt>Accounts</dt><dd>{fmtEnt(ent.users)}</dd>
          <dt>Hosts</dt><dd>{fmtEnt(ent.hosts)}</dd>
          <dt>Source IPs</dt><dd>{fmtEnt(ent.ips)}</dd>
          {f.suppressed > 0 && (<><dt>Suppressed</dt><dd>{f.suppressed.toLocaleString()} matching event(s) excluded by this rule's suppress list</dd></>)}
        </dl>
        {ctx?.summary && (<><h4>Why this matters</h4><p>{ctx.summary}</p></>)}
        {ctx?.maliciousIndicators?.length ? (<><h4>Signs it is malicious</h4><ul>{ctx.maliciousIndicators.map((x, i) => <li key={i}>{x}</li>)}</ul></>) : null}
        {ctx?.falsePositives?.length ? (<><h4>Possible legitimate explanations</h4><ul>{ctx.falsePositives.map((x, i) => <li key={i}>{x}</li>)}</ul></>) : null}
        {f.steps && (
          <div>
            <h4>Correlated steps{f.group ? ` (${Object.entries(f.group).map(([k, v]) => `${k}: ${v}`).join(', ')})` : ''}</h4>
            <ol>{f.steps.map((st) => (
              <li key={st.id}><strong>{st.id}</strong>: {st.events.map((e) => `${e.eventId} @ ${fmtTs(e.ts)}${e.computer ? ` on ${e.computer}` : ''}`).join('; ')}</li>
            ))}</ol>
          </div>
        )}
        {f.evidence.length > 0
          ? <Evidence rows={f.evidence} />
          : <p className="note">Evidence events were not retained (per-group memory cap reached). The counts above are still accurate.</p>}
        {f.evidenceTruncated && f.evidence.length > 0 && <p className="note">Showing {f.evidence.length} of {f.count.toLocaleString()} matching events.</p>}
        <Commands f={f} />
        {ctx?.references?.length ? (<p className="note">References: {ctx.references.map((r, i) => <span key={i}>{r} </span>)}</p>) : null}
      </div>
    </details>
  )
}
