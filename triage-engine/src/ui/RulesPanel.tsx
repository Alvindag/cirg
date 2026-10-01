import { useMemo, useRef, useState } from 'react'
import { buildRules } from '../core/analysis'
import { normalize } from '../core/normalize'
import { MAX_RULE_FILE_BYTES } from '../core/rules/load'
import { useStore } from './store'

export function RulesPanel() {
  const { customPacks, addPack, removePack } = useStore()
  const input = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const { comp, report } = useMemo(() => buildRules(customPacks), [customPacks])

  const onFile = async (f?: File) => {
    if (!f) return
    if (f.size > MAX_RULE_FILE_BYTES) { setMsg(`${f.name} is larger than ${MAX_RULE_FILE_BYTES / 1e6} MB`); return }
    setMsg(null)
    addPack(f.name, await f.text())
  }

  return (
    <details className="panel">
      <summary>Detection rules: {comp.rules.length} active ({comp.rules.filter((r) => r.sequence).length} correlated){report.errors.length ? `, ${report.errors.length} error(s)` : ''}</summary>
      <div className="body">
        <p className="note">Rule packs are JSON or YAML. They are validated and compiled in your browser and held in memory only; reload the page and they are gone.</p>
        <ul>{report.packs.map((p) => <li key={p.id}>{p.name} v{p.version}: {p.rules} rules</li>)}</ul>
        <button onClick={() => input.current?.click()}>Add rule pack…</button>
        <input ref={input} type="file" hidden accept=".json,.yaml,.yml" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = '' }} />
        {msg && <p role="alert" className="err">{msg}</p>}
        {customPacks.map((p) => (
          <div key={p.name} className="packrow">
            <strong>{p.name}</strong> <button onClick={() => removePack(p.name)}>Remove</button>
            {p.report.errors.map((e, i) => <p key={i} role="alert" className="err">{e}</p>)}
            {p.report.warnings.map((e, i) => <p key={i} className="warn">{e}</p>)}
          </div>
        ))}
        <RuleTester rules={comp.rules} />
      </div>
    </details>
  )
}

const SAMPLE = '{\n  "EventID": 4625,\n  "TimeGenerated": "2025-03-01T10:00:00Z",\n  "Computer": "WS1",\n  "TargetUserName": "admin",\n  "IpAddress": "203.0.113.9"\n}'

function RuleTester({ rules }: { rules: ReturnType<typeof buildRules>['comp']['rules'] }) {
  const [text, setText] = useState(SAMPLE)
  const [out, setOut] = useState<string[] | null>(null)
  const test = () => {
    let raw: unknown
    try { raw = JSON.parse(text) } catch (e) { setOut([`Invalid JSON: ${(e as Error).message}`]); return }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { setOut(['Provide a single JSON object (one event).']); return }
    const n = normalize(raw as Record<string, unknown>, 0)
    if (!n.ok) { setOut([`Event rejected by the normalizer: ${n.reason}`]); return }
    const lines = [`Normalized: ${JSON.stringify({ ...n.event, src: undefined })}`]
    const hits = rules.filter((r) => r.eventIds.has(n.event.eventId) && r.predicate(n.event))
    if (!hits.length) lines.push('No rule conditions match this event.')
    for (const r of hits) {
      const sup = r.suppress?.(n.event) ? ' (but SUPPRESSED by this rule\'s suppress list)' : ''
      lines.push(r.threshold
        ? `${r.def.id} ${r.def.name}: event qualifies; fires after ${r.threshold.count}${r.threshold.distinct ? ` distinct ${r.threshold.distinct}` : ''} within the window, grouped by ${r.threshold.groupBy.join(', ')}${sup}`
        : `${r.def.id} ${r.def.name}: MATCH [${r.def.severity}]${sup}`)
    }
    setOut(lines)
  }
  return (
    <div>
      <h4>Rule tester</h4>
      <label>Paste one event as JSON (same field names as your export)
        <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      </label>
      <button onClick={test}>Test event</button>
      {out && <ul className="plain" aria-live="polite">{out.map((l, i) => <li key={i}><code className="wrap">{l}</code></li>)}</ul>}
    </div>
  )
}
