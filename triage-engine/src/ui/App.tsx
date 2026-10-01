import { useRef, useState } from 'react'
import { useStore } from './store'
import { eventName } from '../core/eventCatalog'

const fmtBytes = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`)
const fmtTs = (t: number | null) => (t === null ? '—' : new Date(t).toISOString().replace('T', ' ').slice(0, 19) + ' UTC')

export function App() {
  const s = useStore()
  const input = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const pick = (f?: File | null) => { if (f) s.start(f) }
  const pct = s.total ? Math.min(100, Math.round((s.bytes / s.total) * 100)) : 0

  return (
    <main>
      <header>
        <h1>Windows Security Event Log Triage</h1>
        <p className="privacy" role="note">
          100% local analysis. Your log never leaves this browser tab: no uploads, no storage, no telemetry.
        </p>
      </header>

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
          <p>Processing <strong>{s.fileName}</strong> — {fmtBytes(s.bytes)} of {fmtBytes(s.total)}</p>
          <progress max={100} value={pct} aria-label="Progress" />
          <p>{s.events.toLocaleString()} events parsed · {s.rejected.toLocaleString()} rejected</p>
          <button onClick={s.cancel}>Cancel</button>
        </section>
      )}

      {s.phase === 'done' && s.summary && (
        <section>
          <div className="row">
            <h2>Ingest summary — {s.fileName}</h2>
            <button onClick={s.clear}>Clear all data</button>
          </div>
          <dl>
            <dt>Format</dt><dd>{s.summary.format.toUpperCase()}</dd>
            <dt>Records</dt><dd>{s.summary.totalRecords.toLocaleString()} ({s.summary.parsedEvents.toLocaleString()} parsed, {s.summary.rejected.toLocaleString()} rejected)</dd>
            <dt>Time range</dt><dd>{fmtTs(s.summary.firstTs)} → {fmtTs(s.summary.lastTs)}</dd>
            <dt>Hosts</dt><dd>{s.summary.computers.length.toLocaleString()}{s.summary.computersTruncated ? '+' : ''}</dd>
            <dt>Elapsed</dt><dd>{(s.summary.elapsedMs / 1000).toFixed(1)} s</dd>
          </dl>
          {Object.keys(s.summary.rejectReasons).length > 0 && (
            <p className="warn">Rejected: {Object.entries(s.summary.rejectReasons).map(([k, v]) => `${k} (${v})`).join('; ')}</p>
          )}
          <table>
            <caption>Events by ID</caption>
            <thead><tr><th>Event ID</th><th>Meaning</th><th>Count</th></tr></thead>
            <tbody>
              {Object.entries(s.summary.byEventId).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([id, n]) => (
                <tr key={id}><td>{id}</td><td>{eventName(Number(id))}</td><td>{n.toLocaleString()}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="note">Detection, correlation and reporting arrive in Phases 2–4.</p>
        </section>
      )}
    </main>
  )
}
