import { useState, type ChangeEvent, type FormEvent } from 'react'
import type {
  CreatedKey, Customer, ErpConnection, ErpImportResult, IntegrationKeyRow, OutboxResult, Page, Product, Requisition, StockReconciliation,
  Suggestion, SyncRunRow, Unmatched,
} from '../api/types'
import { Badge, Empty, ErrorBox, Kpi, Loading, Section } from '../components/ui'
import { useApp } from '../context'
import { fmtDateTime, fmtInt } from '../lib/format'
import { canSeeErp, isAdmin } from '../lib/roles'
import { useAsync } from '../lib/useAsync'
import { useUserNames } from '../lib/useNames'

type Tab = 'connection' | 'import' | 'outbox' | 'reconciliation' | 'procurement'

export function Erp() {
  const { me } = useApp()
  const [tab, setTab] = useState<Tab>('connection')
  if (!canSeeErp(me.role)) return <ErrorBox message="The ERP integration is available to administrators and executives." />
  const tabs: [Tab, string][] = [['connection', 'Connection'], ['import', 'Import'], ['outbox', 'Outbox'], ['reconciliation', 'Reconciliation'], ['procurement', 'Procurement']]
  return (
    <>
      <div className="page-head"><h1>ERP integration</h1></div>
      <div className="tabs" role="tablist">
        {tabs.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {tab === 'connection' && <Connection />}
      {tab === 'import' && <Import />}
      {tab === 'outbox' && <Outbox />}
      {tab === 'reconciliation' && <Reconciliation />}
      {tab === 'procurement' && <Procurement />}
    </>
  )
}

function useAct(reload: () => void) {
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  async function act<T>(fn: () => Promise<T>, ok: string | ((r: T) => string)) {
    setError(undefined); setMessage(undefined)
    try { const r = await fn(); setMessage(typeof ok === 'function' ? ok(r) : ok); reload() } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  const banners = <>{message && <div className="notice" role="status">{message}</div>}{error && <ErrorBox message={error} />}</>
  return { act, banners }
}

// ---------- connection, keys, runs ----------

function Connection() {
  const { api, me } = useApp()
  const admin = isAdmin(me.role)
  const conn = useAsync(() => api.get<ErpConnection>('/erp/connection'), [])
  const keys = useAsync(() => api.get<IntegrationKeyRow[]>('/erp/keys'), [])
  const runs = useAsync(() => api.get<SyncRunRow[]>('/erp/runs', { take: 15 }), [])
  const { act, banners } = useAct(() => { conn.reload(); keys.reload(); runs.reload() })
  const [form, setForm] = useState<ErpConnection>()
  const [newKeyName, setNewKeyName] = useState('')
  const [shownKey, setShownKey] = useState<CreatedKey>()
  const f = form ?? conn.data

  const set = <K extends keyof ErpConnection>(k: K, v: ErpConnection[K]) => f && setForm({ ...f, [k]: v })
  async function put(e: FormEvent) {
    e.preventDefault()
    if (!f) return
    const body = { provider: f.provider, baseUrl: f.baseUrl, secretName: f.secretName, enabled: f.enabled, outboundEnabled: f.outboundEnabled, pullEnabled: f.pullEnabled, pullIntervalMinutes: f.pullIntervalMinutes, currency: f.currency }
    await act(() => api.put<unknown>('/erp/connection', body), 'Connection saved.')
    setForm(undefined)
  }

  return (
    <>
      {banners}
      <Section title="ERP gateway">
        {conn.error && <ErrorBox message={conn.error} onRetry={conn.reload} />}
        {conn.loading && !f && <Loading />}
        {f && (
          <form className="form" onSubmit={put} aria-label="ERP connection">
            <select aria-label="Provider" disabled={!admin} value={f.provider} onChange={(e) => set('provider', e.target.value as ErpConnection['provider'])}>
              <option value="none">None (CSV and push only)</option><option value="rest">ERP gateway (REST)</option><option value="businesscentral">Dynamics 365 Business Central</option>
            </select>
            <input aria-label="Gateway address" placeholder={f.provider === 'businesscentral' ? 'https://api.businesscentral.dynamics.com/v2.0/{tenant}/{environment}/api/v2.0/companies({id})' : 'https://erp-gateway.example.com'} disabled={!admin || f.provider === 'none'} value={f.baseUrl ?? ''} onChange={(e) => set('baseUrl', e.target.value)} />
            <input aria-label="Secret name" placeholder="Name of the secret in Key Vault" disabled={!admin || f.provider === 'none'} value={f.secretName ?? ''} onChange={(e) => set('secretName', e.target.value)} />
            <input aria-label="Currency" maxLength={3} disabled={!admin} value={f.currency} onChange={(e) => set('currency', e.target.value.toUpperCase())} />
            <label className="inline"><input type="checkbox" disabled={!admin} checked={f.enabled} onChange={(e) => set('enabled', e.target.checked)} /> Enabled</label>
            <label className="inline"><input type="checkbox" disabled={!admin} checked={f.outboundEnabled} onChange={(e) => set('outboundEnabled', e.target.checked)} /> Send stock movements and requisitions</label>
            <label className="inline"><input type="checkbox" disabled={!admin} checked={f.pullEnabled} onChange={(e) => set('pullEnabled', e.target.checked)} /> Pull data on a schedule</label>
            <label className="inline">Every <input type="number" aria-label="Pull interval" style={{ width: '5rem' }} min={5} max={1440} disabled={!admin} value={f.pullIntervalMinutes} onChange={(e) => set('pullIntervalMinutes', Number(e.target.value))} /> min</label>
            {admin && <button className="primary" type="submit">Save</button>}
            {admin && f.provider !== 'none' && !form && <button type="button" onClick={() => act(() => api.post<{ ok: boolean; error: string | null }>('/erp/connection/test'), (r) => (r.ok ? 'The ERP answered.' : `Test failed: ${r.error}`))}>Test connection</button>}
            {admin && f.provider !== 'none' && !form && <button type="button" onClick={() => act(() => api.post<unknown[]>('/erp/pull'), (r) => `Pulled ${r.length} batch(es) of data.`)}>Pull now</button>}
          </form>
        )}
        {f?.lastPullAt && <p className="muted small">Last pull {fmtDateTime(f.lastPullAt)}.</p>}
        {f?.lastError && <ErrorBox message={`Last pull failed: ${f.lastError}`} />}
      </Section>

      <Section title="Integration keys">
        <p className="muted small">For ERP middleware that pushes data to <code>/integration/v1</code>. A key is shown once when created and stored only as a hash.</p>
        {shownKey && (
          <div className="notice" role="status">
            New key for <strong>{shownKey.name}</strong>. Copy it now; it cannot be shown again.<div className="mono"><code data-testid="new-key">{shownKey.key}</code></div>
            <button onClick={() => setShownKey(undefined)}>I have copied it</button>
          </div>
        )}
        {keys.data && (keys.data.length === 0 ? <Empty>No keys yet.</Empty> : (
          <table>
            <thead><tr><th>Name</th><th>Starts with</th><th>Created</th><th>Last used</th><th>Status</th>{admin && <th />}</tr></thead>
            <tbody>
              {keys.data.map((k) => (
                <tr key={k.id}>
                  <td>{k.name}</td><td className="mono">dek_{k.prefix}…</td><td>{fmtDateTime(k.createdAt)}</td><td>{k.lastUsedAt ? fmtDateTime(k.lastUsedAt) : 'never'}</td>
                  <td><Badge tone={k.revokedAt ? 'bad' : 'good'}>{k.revokedAt ? 'Revoked' : 'Active'}</Badge></td>
                  {admin && <td>{!k.revokedAt && <button onClick={() => window.confirm(`Revoke the key "${k.name}"? Systems using it will stop working.`) && act(() => api.del(`/erp/keys/${k.id}`), 'Key revoked.')}>Revoke</button>}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
        {admin && (
          <form className="form" aria-label="Create key" onSubmit={async (e) => {
            e.preventDefault()
            await act(async () => { const k = await api.post<CreatedKey>('/erp/keys', { name: newKeyName }); setShownKey(k); setNewKeyName(''); return k }, 'Key created.')
          }}>
            <input required aria-label="Key name" placeholder="Which system will use it?" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} />
            <button className="primary" type="submit">Create key</button>
          </form>
        )}
      </Section>

      <Section title="Recent runs">
        {runs.data && (runs.data.length === 0 ? <Empty>Nothing has been imported yet.</Empty> : (
          <table>
            <thead><tr><th>When</th><th>Data</th><th>Source</th><th className="num">New</th><th className="num">Updated</th><th className="num">Skipped</th><th className="num">Errors</th></tr></thead>
            <tbody>{runs.data.map((r) => (
              <tr key={r.id}><td>{fmtDateTime(r.startedAt)}</td><td>{r.entity}</td><td>{r.source}</td><td className="num">{r.created}</td><td className="num">{r.updated}</td><td className="num">{r.skipped}</td><td className="num">{r.errors || ''}</td></tr>
            ))}</tbody>
          </table>
        ))}
      </Section>
    </>
  )
}

// ---------- import ----------

const entities: [string, string][] = [['products', 'Products (item master)'], ['customers', 'Customer accounts'], ['sales', 'Invoice lines'], ['goods-receipts', 'Goods receipts'], ['stock-levels', 'Stock levels']]

function Import() {
  const { api, me } = useApp()
  const admin = isAdmin(me.role)
  const [entity, setEntity] = useState('products')
  const [csv, setCsv] = useState<string>()
  const [name, setName] = useState('')
  const [createMissing, setCreateMissing] = useState(false)
  const [result, setResult] = useState<ErpImportResult>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const unmatched = useAsync(() => api.get<Unmatched>('/erp/unmatched'), [result])

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    setResult(undefined); setError(undefined)
    if (!file) return
    if (file.size > 5_000_000) { setError('The file is larger than 5 MB.'); return }
    setName(file.name); setCsv(await file.text())
  }
  async function run() {
    if (!csv) return
    setBusy(true); setError(undefined)
    try { setResult(await api.postText<ErpImportResult>(`/erp/import/${entity}`, csv, entity === 'customers' ? { createMissing } : undefined)) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  const problems = result?.items.filter((i) => i.status === 'error' || i.status === 'unmatched') ?? []

  return (
    <>
      {admin ? (
        <Section title="Upload a CSV export">
          <p className="muted small">Export from the ERP as CSV. Required columns for each kind of data are in docs/erp-integration.md. Records already imported are recognised and not duplicated.</p>
          <div className="filters">
            <select aria-label="Kind of data" value={entity} onChange={(e) => { setEntity(e.target.value); setResult(undefined) }}>{entities.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
            <input type="file" accept=".csv,text/csv" aria-label="CSV file" onChange={pick} />
            {entity === 'customers' && <label className="inline"><input type="checkbox" checked={createMissing} onChange={(e) => setCreateMissing(e.target.checked)} /> Create customers that cannot be matched</label>}
            <button className="primary" disabled={!csv || busy} onClick={run}>Import</button>
          </div>
          {error && <ErrorBox message={error} />}
          {result && (
            <div className="import-result">
              <p><strong>{name}:</strong> {result.created} new, {result.updated} updated, {result.skipped} skipped, {result.errors} with errors.</p>
              {problems.length > 0 && (
                <table>
                  <thead><tr><th>Record</th><th>Result</th><th>Details</th></tr></thead>
                  <tbody>{problems.slice(0, 200).map((p, i) => <tr key={`${p.key}-${i}`}><td>{p.key}</td><td><Badge tone={p.status === 'error' ? 'bad' : 'warn'}>{p.status}</Badge></td><td>{p.message}</td></tr>)}</tbody>
                </table>
              )}
            </div>
          )}
        </Section>
      ) : <Empty>Only administrators can import data.</Empty>}

      <Section title="Not linked yet">
        {unmatched.error && <ErrorBox message={unmatched.error} />}
        {unmatched.data && (unmatched.data.customers.length === 0 && unmatched.data.items.length === 0 ? <Empty>Every invoiced account and item is linked.</Empty> : (
          <div className="grid-2">
            <div>
              <h3>Customer accounts with invoices</h3>
              <table>
                <thead><tr><th>Account</th><th className="num">Lines</th><th className="num">Invoiced</th></tr></thead>
                <tbody>{unmatched.data.customers.map((c) => <tr key={c.accountCode}><td>{c.accountCode}</td><td className="num">{c.lines}</td><td className="num">{fmtInt(c.amount)}</td></tr>)}</tbody>
              </table>
              {admin && <LinkForm accounts={unmatched.data.customers.map((c) => c.accountCode)} onLinked={unmatched.reload} />}
            </div>
            <div>
              <h3>Items not in the product list</h3>
              <table>
                <thead><tr><th>Item code</th><th className="num">Lines</th></tr></thead>
                <tbody>{unmatched.data.items.map((i) => <tr key={i.itemCode}><td>{i.itemCode}</td><td className="num">{i.lines}</td></tr>)}</tbody>
              </table>
              <p className="muted small">Import the product master to link these.</p>
            </div>
          </div>
        ))}
      </Section>
    </>
  )
}

function LinkForm({ accounts, onLinked }: { accounts: string[]; onLinked: () => void }) {
  const { api } = useApp()
  const [account, setAccount] = useState('')
  const [q, setQ] = useState('')
  const [customerId, setCustomerId] = useState('')
  const matches = useAsync(() => (q.trim().length >= 2 ? api.get<Page<Customer>>('/customers', { q, pageSize: 8 }) : Promise.resolve(undefined)), [q])
  const { act, banners } = useAct(onLinked)
  return (
    <form className="form" aria-label="Link account" onSubmit={(e) => { e.preventDefault(); void act(() => api.post('/erp/customers/link', { customerId, accountCode: account || accounts[0] }), 'Account linked.') }}>
      {banners}
      <select aria-label="Account" value={account || accounts[0] || ''} onChange={(e) => setAccount(e.target.value)}>{accounts.map((a) => <option key={a}>{a}</option>)}</select>
      <input aria-label="Find customer" placeholder="Search customer name" value={q} onChange={(e) => { setQ(e.target.value); setCustomerId('') }} />
      <select aria-label="Customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
        <option value="">Choose…</option>
        {(matches.data?.items ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}{c.city ? ` (${c.city})` : ''}</option>)}
      </select>
      <button className="primary" type="submit" disabled={!customerId}>Link</button>
    </form>
  )
}

// ---------- outbox ----------

function Outbox() {
  const { api, me } = useApp()
  const admin = isAdmin(me.role)
  const [status, setStatus] = useState('')
  const box = useAsync(() => api.get<OutboxResult>('/erp/outbox', { status }), [status])
  const { act, banners } = useAct(box.reload)
  const n = (s: string) => box.data?.counts.find((c) => c.status === s)?.n ?? 0
  return (
    <>
      {banners}
      <div className="kpis">
        <Kpi label="Waiting" value={fmtInt(n('Pending'))} tone={n('Pending') > 20 ? 'warn' : undefined} />
        <Kpi label="Delivered" value={fmtInt(n('Sent'))} tone="good" />
        <Kpi label="Failed (needs attention)" value={fmtInt(n('DeadLetter'))} tone={n('DeadLetter') ? 'bad' : 'good'} hint="the ERP refused these" />
      </div>
      <Section title="Messages to the ERP" actions={<>
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option>Pending</option><option>Sent</option><option>DeadLetter</option></select>{' '}
        {admin && <button onClick={() => act(() => api.post<{ sent: number; retrying: number; deadLettered: number }>('/erp/outbox/dispatch'), (r) => `${r.sent} sent, ${r.retrying} to retry, ${r.deadLettered} failed.`)}>Send now</button>}
      </>}>
        {box.error && <ErrorBox message={box.error} onRetry={box.reload} />}
        {box.loading && !box.data && <Loading />}
        {box.data && (box.data.items.length === 0 ? <Empty>No messages.</Empty> : (
          <table>
            <thead><tr><th>Created</th><th>Type</th><th>Status</th><th className="num">Tries</th><th>ERP reference</th><th>Last problem</th>{admin && <th />}</tr></thead>
            <tbody>
              {box.data.items.map((m) => (
                <tr key={m.id} className={m.status === 'DeadLetter' ? 'flag' : ''}>
                  <td>{fmtDateTime(m.createdAt)}</td><td>{m.type}</td>
                  <td><Badge tone={m.status === 'Sent' ? 'good' : m.status === 'DeadLetter' ? 'bad' : 'warn'}>{m.status === 'DeadLetter' ? 'Failed' : m.status}</Badge></td>
                  <td className="num">{m.attempts}</td><td>{m.externalRef ?? ''}</td><td className="small">{m.lastError ?? ''}</td>
                  {admin && <td>{m.status === 'DeadLetter' && <button onClick={() => act(() => api.post(`/erp/outbox/${m.id}/retry`), 'Message queued to send again.')}>Retry</button>}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </Section>
    </>
  )
}

// ---------- reconciliation ----------

function Reconciliation() {
  const { api } = useApp()
  const rec = useAsync(() => api.get<StockReconciliation>('/erp/reconciliation/stock'), [])
  const tone = (s: string) => (s === 'Match' ? 'good' : s === 'Differs' ? 'bad' : 'warn')
  return (
    <Section title="Warehouse stock: DAS Engage vs ERP">
      {rec.error && <ErrorBox message={rec.error} onRetry={rec.reload} />}
      {rec.loading && !rec.data && <Loading />}
      {rec.data && (
        <>
          {rec.data.snapshotCount === 0 && <p className="muted">The ERP has not reported stock levels yet. Import or pull them to compare.</p>}
          {rec.data.snapshotCount > 0 && <div className={rec.data.balanced ? 'notice' : 'error'} role="status">{rec.data.balanced ? 'Stock agrees with the ERP.' : 'Stock differs from the ERP. Check the rows below.'}</div>}
          {rec.data.rows.length > 0 && (
            <table>
              <thead><tr><th>Item</th><th>Batch</th><th className="num">DAS Engage</th><th className="num">ERP</th><th className="num">Difference</th><th>Result</th></tr></thead>
              <tbody>
                {rec.data.rows.map((r, i) => (
                  <tr key={`${r.itemCode}-${r.batchNumber}-${i}`} className={r.status === 'Differs' ? 'flag' : ''}>
                    <td>{r.itemCode}{r.product && <div className="muted small">{r.product}</div>}</td><td>{r.batchNumber ?? 'all batches'}</td>
                    <td className="num">{fmtInt(r.das)}</td><td className="num">{r.erp === null ? '—' : fmtInt(r.erp)}</td><td className="num">{r.difference === null ? '—' : fmtInt(r.difference)}</td>
                    <td><Badge tone={tone(r.status)}>{r.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </Section>
  )
}

// ---------- procurement ----------

const reqTone = (s: string) => (s === 'Received' ? 'good' : s === 'Approved' ? 'warn' : s === 'Rejected' || s === 'Cancelled' ? 'bad' : 'muted')

function Procurement() {
  const { api, me } = useApp()
  const admin = isAdmin(me.role)
  const { name: userName } = useUserNames()
  const suggestions = useAsync(() => api.get<Suggestion[]>('/erp/procurement/suggestions'), [])
  const reqs = useAsync(() => api.get<Requisition[]>('/erp/procurement/requisitions'), [])
  const products = useAsync(() => api.get<Product[]>('/admin/products'), [])
  const pname = new Map((products.data ?? []).map((p) => [p.id, p.name]))
  const { act, banners } = useAct(() => { suggestions.reload(); reqs.reload() })

  const create = (s: Suggestion) => {
    const answer = window.prompt(`Raise a purchase requisition for ${s.name}. Quantity?`, String(s.suggestedQuantity))
    if (answer === null) return
    const quantity = Number(answer)
    if (!Number.isInteger(quantity) || quantity < 1) return void act(async () => { throw new Error('Enter a whole number of 1 or more.') }, '')
    void act(() => api.post('/erp/procurement/requisitions', { productId: s.productId, quantity }), 'Requisition created. Someone else must approve it.')
  }
  const reject = (r: Requisition) => {
    const note = window.prompt('Reason for rejecting:')
    if (note?.trim()) void act(() => api.post(`/erp/procurement/requisitions/${r.id}/reject`, { note }), 'Requisition rejected.')
  }
  const reference = (r: Requisition) => {
    const ref = window.prompt('ERP purchase reference (for example the purchase order number):')
    if (ref?.trim()) void act(() => api.post(`/erp/procurement/requisitions/${r.id}/reference`, { erpReference: ref }), 'Reference saved.')
  }

  return (
    <>
      {banners}
      <Section title="Sample stock to reorder">
        {suggestions.error && <ErrorBox message={suggestions.error} onRetry={suggestions.reload} />}
        {suggestions.loading && !suggestions.data && <Loading />}
        {suggestions.data && (suggestions.data.length === 0 ? <Empty>No products have a reorder level yet. They come from the ERP product list.</Empty> : (
          <table>
            <thead><tr><th>Product</th><th className="num">In warehouse</th><th className="num">On order</th><th className="num">Reorder level</th><th className="num">Used / month</th><th className="num">Months of cover</th><th /></tr></thead>
            <tbody>
              {suggestions.data.map((s) => (
                <tr key={s.productId} className={s.belowReorderLevel ? 'flag' : ''}>
                  <td>{s.name}<div className="muted small">{s.itemCode}</div></td>
                  <td className="num">{fmtInt(s.available)}</td><td className="num">{fmtInt(s.onOrder)}</td><td className="num">{fmtInt(s.reorderLevel)}</td>
                  <td className="num">{s.monthlyUsage}</td><td className="num">{s.monthsOfCover ?? '—'}</td>
                  <td>{s.belowReorderLevel ? (admin ? <button className="primary" onClick={() => create(s)}>Order {fmtInt(s.suggestedQuantity)}…</button> : <Badge tone="bad">Below level</Badge>) : <Badge tone="good">OK</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </Section>

      <Section title="Purchase requisitions">
        {reqs.data && (reqs.data.length === 0 ? <Empty>No requisitions yet.</Empty> : (
          <table>
            <thead><tr><th>Raised</th><th>Product</th><th className="num">Quantity</th><th>Raised by</th><th>Status</th><th>ERP reference</th><th /></tr></thead>
            <tbody>
              {reqs.data.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDateTime(r.createdAt)}</td><td>{pname.get(r.productId) ?? '—'}</td>
                  <td className="num">{r.status === 'Approved' && r.receivedQuantity > 0 ? `${r.receivedQuantity} of ${r.quantity}` : r.quantity}</td>
                  <td>{userName(r.requestedBy)}</td>
                  <td><Badge tone={reqTone(r.status)}>{r.status}</Badge>{r.decisionNote && <div className="muted small">{r.decisionNote}</div>}</td>
                  <td>{r.erpReference ?? ''}</td>
                  <td className="actions">
                    {admin && r.status === 'Draft' && r.requestedBy !== me.id && <><button className="primary" onClick={() => act(() => api.post(`/erp/procurement/requisitions/${r.id}/approve`), 'Requisition approved and queued for the ERP.')}>Approve</button><button onClick={() => reject(r)}>Reject</button></>}
                    {admin && r.status === 'Draft' && r.requestedBy === me.id && <span className="muted small">Waiting for a second approver</span>}
                    {admin && r.status === 'Approved' && !r.erpReference && <button onClick={() => reference(r)}>Add ERP reference</button>}
                    {admin && (r.status === 'Draft' || (r.status === 'Approved' && r.receivedQuantity === 0)) && <button onClick={() => act(() => api.post(`/erp/procurement/requisitions/${r.id}/cancel`), 'Requisition cancelled.')}>Cancel</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </Section>
    </>
  )
}
