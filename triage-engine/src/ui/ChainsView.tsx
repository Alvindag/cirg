import type { AnalysisResult } from '../core/analysis'
import { chainTitle, type AttackChain } from '../core/correlate/chains'
import type { RiskScore } from '../core/correlate/risk'
import { FindingCard, fmtTime } from './FindingsView'

const labelClass = (l: string) => (l === 'Critical' ? 'critical' : l === 'High' ? 'high' : l === 'Medium' ? 'medium' : l === 'Low' ? 'low' : 'info')

export function RiskBadge({ risk }: { risk: RiskScore }) {
  return <span className={`sev sev-${labelClass(risk.label)}`}>{risk.label.toUpperCase()} {risk.score}/100</span>
}

function Breakdown({ risk }: { risk: RiskScore }) {
  return (
    <table>
      <caption>How this score was calculated</caption>
      <thead><tr><th>Component</th><th>Points</th></tr></thead>
      <tbody>{risk.components.map((c, i) => <tr key={i}><td>{c.label}</td><td>+{c.points}</td></tr>)}
        <tr><td><strong>Total (max 100)</strong></td><td><strong>{risk.score}</strong></td></tr></tbody>
    </table>
  )
}

export function ExecutiveSummary({ r }: { r: AnalysisResult }) {
  const bySev = r.findings.reduce<Record<string, number>>((m, f) => { m[f.severity] = (m[f.severity] ?? 0) + 1; return m }, {})
  return (
    <section aria-labelledby="exec-h" className="exec">
      <h3 id="exec-h">Executive summary</h3>
      <p className="big"><RiskBadge risk={r.risk} /></p>
      <p>{r.chains.length} correlated attack chain{r.chains.length === 1 ? '' : 's'} · {r.findings.length} finding{r.findings.length === 1 ? '' : 's'}
        {' '}({['critical', 'high', 'medium', 'low', 'info'].filter((s) => bySev[s]).map((s) => `${bySev[s]} ${s}`).join(', ') || 'none'})
        {' '}from {r.summary.parsedEvents.toLocaleString()} events.</p>
      {r.topThreats.length > 0 && (
        <>
          <h4>Top threats</h4>
          <ol>{r.topThreats.map((t) => <li key={t.id}><strong>{t.title}</strong> <span className="meta">({t.kind === 'chain' ? 'attack chain' : 'single finding'}, score {t.score})</span></li>)}</ol>
        </>
      )}
      <details><summary>Overall score breakdown</summary><Breakdown risk={r.risk} /></details>
    </section>
  )
}

export function ChainCard({ c, byId }: { c: AttackChain; byId: Map<string, AnalysisResult['findings'][number]> }) {
  return (
    <details className={`finding chain sev-${labelClass(c.risk.label)}`}>
      <summary>
        <RiskBadge risk={c.risk} /> <strong>{c.id}: {chainTitle(c)}</strong>
        <span className="meta"> · {c.findingIds.length} findings · {fmtTime(c.firstTs)} → {fmtTime(c.lastTs)}</span>
      </summary>
      <div className="body">
        <dl>
          <dt>Hosts</dt><dd>{c.hosts.join(', ') || '—'}</dd>
          <dt>Accounts</dt><dd>{c.accounts.join(', ') || '—'}</dd>
          <dt>Source IPs</dt><dd>{c.ips.join(', ') || '—'}</dd>
          <dt>Why these are linked</dt><dd>{c.links.length ? c.links.join('; ') : 'Correlated sequence rule'}</dd>
          <dt>ATT&amp;CK stages</dt><dd>{c.stages.map((s) => `${s.tacticName ?? s.tactic} (${s.tactic})`).join(' → ')}</dd>
        </dl>
        <h4>Attack narrative (in time order)</h4>
        <ol className="timeline">{c.narrative.map((n, i) => <li key={i}><time>{fmtTime(n.ts)}</time> {n.text}</li>)}</ol>
        <p className="note">Chains are grouped by shared logon sessions, accounts, hosts, IPs and process IDs within a time window. They are leads for an analyst, not proof of a single attacker.</p>
        <Breakdown risk={c.risk} />
        <h4>Findings in this chain</h4>
        {c.findingIds.map((id) => { const f = byId.get(id); return f ? <FindingCard key={id} f={f} /> : null })}
      </div>
    </details>
  )
}
