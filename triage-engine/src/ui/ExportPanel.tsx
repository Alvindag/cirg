import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AnalysisResult } from '../core/analysis'
import { reportToJson, reportToNdjson } from '../core/report/exports'
import { buildReport, type Report } from '../core/report/model'
import { ReportDocument } from './ReportDocument'
import { buildStandaloneHtml } from './exportHtml'
import { downloadText, stamp } from './download'

export function ExportPanel({ result, fileName }: { result: AnalysisResult; fileName: string }) {
  const [redact, setRedact] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [printing, setPrinting] = useState<Report | null>(null)

  const make = () => buildReport(result, { redact, generatedAt: new Date(), sourceName: fileName })
  const run = async (label: string, fn: () => Promise<void> | void) => {
    setBusy(label); setMsg(null)
    try { await fn(); setMsg(`${label} saved.`) } catch (e) { setMsg(`${label} failed: ${e instanceof Error ? e.message : 'unknown error'}`) } finally { setBusy(null) }
  }

  // Print view: render the report in-page, print, then remove it again. Removal waits for the print dialog to close.
  useEffect(() => {
    if (!printing) return
    const done = () => setPrinting(null)
    window.addEventListener('afterprint', done, { once: true })
    const id = requestAnimationFrame(() => requestAnimationFrame(() => window.print()))
    return () => { cancelAnimationFrame(id); window.removeEventListener('afterprint', done) }
  }, [printing])

  const t = stamp()
  return (
    <section aria-labelledby="export-h" className="exportp">
      <h3 id="export-h">Report and export</h3>
      <label className="check"><input type="checkbox" checked={redact} onChange={(e) => setRedact(e.target.checked)} />
        {' '}Redact usernames, hostnames, domains, SIDs, IP addresses and command lines (pseudonymize) before exporting</label>
      <div className="btnrow">
        <button disabled={!!busy} onClick={() => run('HTML report', async () => downloadText(await buildStandaloneHtml(make()), `triage-report-${t}.html`, 'text/html'))}>Download HTML report</button>
        <button disabled={!!busy} onClick={() => setPrinting(make())}>Print / save as PDF</button>
        <button disabled={!!busy} onClick={() => run('JSON report', () => downloadText(reportToJson(make()), `triage-report-${t}.json`, 'application/json'))}>Download JSON (structured)</button>
        <button disabled={!!busy} onClick={() => run('SIEM alerts', () => downloadText(reportToNdjson(make()), `triage-alerts-${t}.ndjson`, 'application/x-ndjson'))}>Download SIEM alerts (NDJSON)</button>
      </div>
      <p className="note" role="status">{msg ?? 'Exports are generated in your browser and saved directly to your device. Nothing is uploaded. For PDF, choose "Save as PDF" in the print dialog.'}</p>
      {printing && createPortal(<div className="print-only"><ReportDocument report={printing} /></div>, document.body)}
    </section>
  )
}
