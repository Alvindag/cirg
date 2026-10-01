import { useState, type ChangeEvent } from 'react'
import type { Customer, ImportResult, Page, Territory } from '../api/types'
import { Badge, Empty, ErrorBox, Loading, Section } from '../components/ui'
import { useApp } from '../context'
import { canImportCustomers } from '../lib/roles'
import { useAsync } from '../lib/useAsync'

const types = ['Doctor', 'Pharmacist', 'Hospital', 'Clinic', 'Pharmacy', 'Distributor', 'GovernmentInstitution']
const segments = ['A', 'B', 'C', 'Unclassified']
const MAX_CSV_BYTES = 5_000_000

export function Customers() {
  const { api, me } = useApp()
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [segment, setSegment] = useState('')
  const [page, setPage] = useState(1)
  const [importing, setImporting] = useState(false)
  const territories = useAsync(() => api.get<Territory[]>('/admin/territories').catch(() => [] as Territory[]), [])
  const list = useAsync(() => api.get<Page<Customer>>('/customers', { q, type, segment, page, pageSize: 25 }), [q, type, segment, page])
  const terrName = new Map((territories.data ?? []).map((t) => [t.id, t.name]))
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1

  return (
    <>
      <div className="page-head">
        <h1>Customers</h1>
        {canImportCustomers(me.role) && <button onClick={() => setImporting((v) => !v)}>{importing ? 'Close import' : 'Import CSV'}</button>}
      </div>

      {importing && <ImportPanel onDone={() => { setPage(1); list.reload() }} />}

      <div className="filters">
        <input type="search" placeholder="Search name or city" aria-label="Search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
        <select aria-label="Type" value={type} onChange={(e) => { setType(e.target.value); setPage(1) }}>
          <option value="">All types</option>
          {types.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select aria-label="Segment" value={segment} onChange={(e) => { setSegment(e.target.value); setPage(1) }}>
          <option value="">All segments</option>
          {segments.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
      {list.loading && !list.data && <Loading />}
      {list.data && (list.data.items.length === 0 ? <Empty>No customers match.</Empty> : (
        <>
          <table>
            <thead><tr><th>Name</th><th>Type</th><th>Specialty</th><th>City</th><th>Segment</th><th>Territory</th><th className="num">Visits/mo</th></tr></thead>
            <tbody>
              {list.data.items.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td><td>{c.type}</td><td>{c.specialty ?? '—'}</td><td>{c.city ?? '—'}</td>
                  <td><Badge tone={c.segment === 'A' ? 'good' : 'muted'}>{c.segment}</Badge></td>
                  <td>{c.territoryId ? (terrName.get(c.territoryId) ?? '—') : '—'}</td>
                  <td className="num">{c.targetVisitsPerMonth}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pager">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span>Page {page} of {pages} · {list.data.total} customers</span>
            <button disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </>
      ))}
    </>
  )
}

/** Dry run first: shows what would be created, updated, skipped as duplicate or rejected, then commits on request. */
export function ImportPanel({ onDone }: { onDone: () => void }) {
  const { api } = useApp()
  const [csv, setCsv] = useState<string>()
  const [fileName, setFileName] = useState('')
  const [update, setUpdate] = useState(false)
  const [possible, setPossible] = useState(false)
  const [result, setResult] = useState<ImportResult>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    setResult(undefined); setError(undefined)
    if (!f) return
    if (f.size > MAX_CSV_BYTES) { setError('The file is larger than 5 MB.'); return }
    setFileName(f.name)
    setCsv(await f.text())
  }

  async function run(dryRun: boolean) {
    if (!csv) return
    setBusy(true); setError(undefined)
    try {
      const r = await api.postText<ImportResult>('/customers/import', csv, { dryRun, onDuplicate: update ? 'update' : 'skip', allowPossibleDuplicates: possible })
      setResult(r)
      if (!dryRun) onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const issues = result?.rows.filter((r) => r.status !== 'created') ?? []
  return (
    <Section title="Import customers from CSV">
      <p className="muted">Columns: type, name (required); specialty, segment, territory, parent, phone, email, address, city, latitude, longitude, target_visits_per_month. Always checked first; nothing is saved until you confirm.</p>
      <input type="file" accept=".csv,text/csv" aria-label="CSV file" onChange={pick} />
      <div className="filters">
        <label className="inline"><input type="checkbox" checked={update} onChange={(e) => setUpdate(e.target.checked)} /> Update existing customers with the same details</label>
        <label className="inline"><input type="checkbox" checked={possible} onChange={(e) => setPossible(e.target.checked)} /> Import near-duplicates too</label>
      </div>
      <button disabled={!csv || busy} onClick={() => run(true)}>Check file</button>
      {error && <ErrorBox message={error} />}
      {result && (
        <div className="import-result">
          <p>
            <strong>{result.dryRun ? 'Check result' : 'Imported'}:</strong> {result.created} new, {result.updated} updated, {result.skipped} duplicates skipped, {result.errors} with errors (of {result.total} rows in {fileName}).
          </p>
          {issues.length > 0 && (
            <table>
              <thead><tr><th>Row</th><th>Result</th><th>Details</th></tr></thead>
              <tbody>{issues.slice(0, 200).map((r) => (
                <tr key={r.row}><td>{r.row}</td><td><Badge tone={r.status === 'error' ? 'bad' : 'warn'}>{r.status.replace('_', ' ')}</Badge></td><td>{r.message}</td></tr>
              ))}</tbody>
            </table>
          )}
          {result.dryRun && (result.created > 0 || result.updated > 0) && (
            <button className="primary" disabled={busy} onClick={() => run(false)}>
              Import {result.created + result.updated} customer{result.created + result.updated === 1 ? '' : 's'}
            </button>
          )}
        </div>
      )}
    </Section>
  )
}
