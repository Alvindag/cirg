import { useMemo, useRef, useState } from 'react'
import { useStore } from './store'
import { eventName } from '../core/eventCatalog'
import { FindingCard } from './FindingsView'
import { ChainCard, ExecutiveSummary } from './ChainsView'
import { RulesPanel } from './RulesPanel'
import { ExportPanel } from './ExportPanel'
import { SEVERITY_RANK, type Severity } from '../core/rules/types'

const fmtBytes = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`)
const fmtTs = (t: number | null) => (t === null ? '—' : new Date(t).toISOString().replace('T', ' ').slice(0, 19) + ' UTC')
const SEVS: Severity[] = ['critical', 'high', 'medium', 'low', 'info']

export function App() {
  const s = useStore()
  const input = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const [minSev, setMinSev] = useState<Severity>('info')
  const pick = (f?: File | null) => { if (f) s.start(f) }
  const pct = s.total ? Math.min(100, Math.round((s.bytes / s.total) * 100)) : 0
  const r = s.result
  const byId = useMemo(() => new Map((r?.findings ?? []).map((f) => [f.id, f])), [r])
  const shown = useMemo(() => (r ? r.unchained.map((id) => byId.get(id)!).filter((f) => SEVERITY_RANK[f.severity] >= SEVERITY_RANK[minSev]) : []), [r, byId, minSev])
  const counts = useMemo(() => {
    const c: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
    r?.findings.forEach((f) => { c[f.severity]++ })
    return c
  }, [r])

  return (
    <>
    <a className="skip screen-only" href="#results">Skip to results</a>
    <main className="screen-only">
      <header>
        <h1>Windows Security Event Log Triage</h1>
        <p className="privacy" role="note">
          100% local analysis. Your log never leaves this browser tab: no uploads, no storage, no telemetry.
        </p>
      </header>

      <RulesPanel />

      {s.phase === 'idle' || s.phase === 'error' ? (
        <section
          className={`drop${drag ? ' over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]) }}
        >
          <p>Drop a log file here (CSV, JSON/NDJSON, or Windows Event XML)</p>
          <button onClick={() => input.current?.click()}>Choose file</button>
          <input ref={input} type="file" hidden accept=".csv,.json,.ndjson,.jsonl,.xml,.evtx"
            onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
          {s.error && <p role="alert" className="err">{s.error}</p>}
        </section>
      ) : null}

      {s.phase === 'running' && (
        <section aria-live="polite">
          <p>Analyzing <strong>{s.fileName}</strong>: {fmtBytes(s.bytes)} of {fmtBytes(s.total)}</p>
          <progress max={100} value={pct} aria-label="Progress" />
          <p>{s.events.toLocaleString()} events parsed · {s.rejected.toLocaleString()} rejected</p>
          <button onClick={s.cancel}>Cancel</button>
        </section>
      )}

      {s.phase === 'done' && r && (
        <section id="results" tabIndex={-1} aria-label="Analysis results">
          <div className="row">
            <h2>Results: {s.fileName}</h2>
            <button onClick={s.clear}>Clear all data</button>
          </div>

          {r.ruleLoad.errors.length > 0 && (
            <div role="alert" className="err"><strong>Some rules failed to load and did NOT run:</strong>
              <ul>{r.ruleLoad.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></div>
          )}
          {r.engine.rulesDisabledForTime.length > 0 && (
            <p role="alert" className="err">Rules disabled for exceeding the time budget (results incomplete): {r.engine.rulesDisabledForTime.join(', ')}</p>
          )}
          {r.engine.capped.length > 0 && (
            <p role="alert" className="err">Memory limits were reached for: {r.engine.capped.join(', ')}. Counts and correlations for these rules are lower bounds.</p>
          )}
          {r.engine.findingsTruncated.length > 0 && (
            <p className="warn">Findings were capped for: {r.engine.findingsTruncated.join(', ')} (showing the highest-count ones).</p>
          )}

          <ExecutiveSummary r={r} />
          <ExportPanel result={r} fileName={s.fileName} />

          <h3>Attack chains</h3>
          {r.chains.length === 0
            ? <p>No correlated attack chains were identified.</p>
            : r.chains.map((c) => <ChainCard key={c.id} c={c} byId={byId} />)}

          <h3>Other findings (not part of a chain)</h3>
          <div className="chips" role="group" aria-label="Filter by minimum severity">
            {SEVS.map((v) => (
              <button key={v} aria-pressed={minSev === v} className={`chip sev-${v}`} onClick={() => setMinSev(v)}>
                {v.toUpperCase()} {counts[v]}
              </button>
            ))}
          </div>

          {shown.length === 0
            ? <p>{r.findings.length === 0 ? 'No rules matched. That does not prove the logs are clean: check coverage below.' : 'No standalone findings at this severity.'}</p>
            : shown.map((f) => <FindingCard key={f.id} f={f} />)}

          <h3>Ingest summary</h3>
          <dl>
            <dt>Format</dt><dd>{r.summary.format.toUpperCase()}</dd>
            <dt>Records</dt><dd>{r.summary.totalRecords.toLocaleString()} ({r.summary.parsedEvents.toLocaleString()} parsed, {r.summary.rejected.toLocaleString()} rejected)</dd>
            <dt>Time range</dt><dd>{fmtTs(r.summary.firstTs)} → {fmtTs(r.summary.lastTs)}</dd>
            <dt>Hosts</dt><dd>{r.summary.computers.length.toLocaleString()}{r.summary.computersTruncated ? '+' : ''}</dd>
            <dt>Elapsed</dt><dd>{(r.summary.elapsedMs / 1000).toFixed(1)} s · {r.engine.rulesActive} rules evaluated</dd>
          </dl>
          {Object.keys(r.summary.rejectReasons).length > 0 && (
            <p className="warn">Rejected: {Object.entries(r.summary.rejectReasons).map(([k, v]) => `${k} (${v})`).join('; ')}</p>
          )}
          <table>
            <caption>Events by ID</caption>
            <thead><tr><th>Event ID</th><th>Meaning</th><th>Count</th></tr></thead>
            <tbody>
              {Object.entries(r.summary.byEventId).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([id, n]) => (
                <tr key={id}><td>{id}</td><td>{eventName(Number(id))}</td><td>{n.toLocaleString()}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="note">Report export (JSON / HTML / PDF) arrives in Phase 4.</p>
        </section>
      )}
    </main>
    </>
  )
}
