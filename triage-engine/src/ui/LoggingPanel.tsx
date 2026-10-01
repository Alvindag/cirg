import { useMemo } from 'react'
import type { AnalysisResult } from '../core/analysis'
import { assessLogging, type HostRole } from '../core/audit/coverage'

const STATUS = { observed: 'Observed', 'possible-gap': 'POSSIBLE GAP', 'not-observed': 'Not observed', 'not-evaluated': 'Not evaluated' } as const

export function LoggingPanel({ result, role, onRole }: { result: AnalysisResult; role: HostRole; onRole: (r: HostRole) => void }) {
  const a = useMemo(() => assessLogging(result.summary, result.ruleEvents, role), [result, role])
  const s = result.summary
  return (
    <details className="panel" open={a.summary.possibleGaps > 0}>
      <summary>Audit logging assessment: {a.summary.observed} of {a.summary.evaluated} areas observed{a.summary.possibleGaps ? `, ${a.summary.possibleGaps} possible gap(s)` : ''}</summary>
      <div className="body">
        <label className="inline">Log source{' '}
          <select value={role} onChange={(e) => onRole(e.target.value as HostRole)}>
            <option value="auto">Auto-detect{a.roleInferred ? ` (${a.role === 'dc' ? 'domain controller' : 'unknown'})` : ''}</option>
            <option value="dc">Domain controller</option>
            <option value="member">Workstation or member server</option>
          </select>
        </label>
        <p className="note">A <strong>possible gap</strong> is an event type that normally appears constantly but is absent, so the audit setting is probably off. Rare events (log cleared, service installed) being absent is normal.</p>
        <div className="scroll">
          <table>
            <caption>Audit areas over {a.windowHours.toFixed(1)} hours</caption>
            <thead><tr><th scope="col">Area</th><th scope="col">Event IDs</th><th scope="col">Observed</th><th scope="col">Status</th><th scope="col">Note</th></tr></thead>
            <tbody>{a.rows.map((r) => (
              <tr key={r.id}><td>{r.area}</td><td>{r.eventIds.join(', ')}</td><td>{r.observed.toLocaleString()}</td><td>{STATUS[r.status]}</td>
                <td>{r.note}{(r.status === 'possible-gap' || r.status === 'not-observed') && r.enable && r.expectation !== 'rare' ? <> Enable: <code>{r.enable}</code></> : null}{r.hint ? ` ${r.hint}` : ''}{r.affectedRules.length ? ` Rules without data: ${r.affectedRules.join(', ')}.` : ''}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <dl>
          <dt>Command lines</dt><dd>{a.commandLine.note}{a.commandLine.percent !== null ? ` (${a.commandLine.percent}% of ${a.commandLine.processEvents.toLocaleString()} process-creation events)` : ''}</dd>
          <dt>Gaps in time</dt><dd>{a.logGapsNote}</dd>
          <dt>Record numbers</dt><dd>{a.recordIntegrity.note}</dd>
          <dt>Source SHA-256</dt><dd className="wrap"><code>{s.sha256 ?? 'not computed'}</code></dd>
        </dl>
      </div>
    </details>
  )
}
