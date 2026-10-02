import { useState, type FormEvent } from 'react'
import type { Batch, Compliance, Product, SampleRequest, StockRow } from '../api/types'
import { Badge, Empty, ErrorBox, Kpi, Loading, Section } from '../components/ui'
import { RangePicker } from '../components/RangePicker'
import { useApp } from '../context'
import { fmtDate, fmtDateTime, fmtInt, rangeLastDays, shortId } from '../lib/format'
import { canApproveSamples, isAdmin, isManager } from '../lib/roles'
import { celebrate } from '../lib/celebrate'
import { liveStatus, useAsync } from '../lib/useAsync'
import { LiveBadge } from '../components/LiveBadge'
import { useUserNames } from '../lib/useNames'

type Tab = 'requests' | 'stock' | 'batches' | 'compliance'

export function Samples() {
  const { me } = useApp()
  const [tab, setTab] = useState<Tab>('requests')
  if (!isManager(me.role)) return <ErrorBox message="Sample management is available to managers." />
  const tabs: [Tab, string][] = [['requests', 'Requests'], ['stock', 'Stock'], ['batches', 'Batches'], ['compliance', 'Compliance']]
  return (
    <>
      <div className="page-head"><h1>Samples</h1></div>
      <div className="tabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === 'requests' && <Requests />}
      {tab === 'stock' && <Stock />}
      {tab === 'batches' && <Batches />}
      {tab === 'compliance' && <ComplianceTab />}
    </>
  )
}

function useProducts() {
  const { api } = useApp()
  const products = useAsync(() => api.get<Product[]>('/admin/products'), [])
  const map = new Map((products.data ?? []).map((p) => [p.id, p.name]))
  return { products: products.data ?? [], name: (id: string) => map.get(id) ?? shortId(id), reload: products.reload }
}

const statusTone = (s: string) => (s === 'Fulfilled' ? 'good' : s === 'Approved' ? 'warn' : s === 'Rejected' || s === 'Cancelled' ? 'bad' : 'muted')

function Requests() {
  const { api, me } = useApp()
  const [status, setStatus] = useState('Pending')
  const [repId, setRepId] = useState('')
  const { name: userName, users } = useUserNames()
  const { name: productName } = useProducts()
  // "All" leaves the status out so the history of every request can be searched
  const list = useAsync(() => api.get<SampleRequest[]>('/samples/requests', { status: status === 'All' ? undefined : status, repId: repId || undefined }), [status, repId], { refreshMs: 60_000 })
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()

  async function act<T>(fn: () => Promise<T>, ok: string | ((result: T) => string)) {
    setError(undefined); setMessage(undefined)
    try { const result = await fn(); setMessage(typeof ok === 'function' ? ok(result) : ok); list.reload() } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  const approve = (r: SampleRequest) => {
    const answer = window.prompt(`Approve how many? (requested ${r.quantity})`, String(r.quantity))
    if (answer === null) return
    const qty = Number(answer)
    if (!Number.isInteger(qty) || qty < 1 || qty > r.quantity) { setError(`Enter a whole number from 1 to ${r.quantity}.`); return }
    void act(() => api.post(`/samples/requests/${r.id}/approve`, { quantity: qty, note: null }), 'Request approved.')
  }
  const reject = (r: SampleRequest) => {
    const note = window.prompt('Reason for rejecting (the rep will see it):')
    if (!note?.trim()) return
    void act(() => api.post(`/samples/requests/${r.id}/reject`, { note }), 'Request rejected.')
  }
  const fulfil = (r: SampleRequest, allowPartial: boolean) =>
    act(
      () => api.post<{ allocations: { batchId: string; quantity: number }[] }>(`/samples/requests/${r.id}/fulfil`, { allowPartial }),
      (res) => {
        celebrate() // stock reached a rep: a small reward
        return `Issued ${res.allocations.reduce((n, a) => n + a.quantity, 0)} units from ${res.allocations.length} batch(es), oldest expiry first.`
      },
    )

  return (
    <Section title="Sample requests" actions={
      <span className="filters">
        <LiveBadge updatedAt={liveStatus(list).updatedAt} stale={list.stale} onRefresh={list.reload} />
        <select aria-label="Rep" value={repId} onChange={(e) => setRepId(e.target.value)}>
          <option value="">All reps</option>
          {users.filter((u) => u.role === 'Rep').map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
        </select>
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          {['All', 'Pending', 'Approved', 'Fulfilled', 'Rejected', 'Cancelled'].map((s) => <option key={s}>{s}</option>)}
        </select>
      </span>
    }>
      {message && <div className="notice" role="status">{message}</div>}
      {error && <ErrorBox message={error} />}
      {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
      {list.loading && !list.data && <Loading />}
      {list.data && (list.data.length === 0 ? <Empty>{status === 'All' ? 'No requests' : `No ${status.toLowerCase()} requests`}{repId ? ' for this rep' : ''}.</Empty> : (
        <table>
          <thead><tr><th>Requested</th><th>Rep</th><th>Product</th><th className="num">Qty</th><th>Status</th><th>Note</th><th /></tr></thead>
          <tbody>
            {list.data.map((r) => (
              <tr key={r.id}>
                <td>{fmtDateTime(r.createdAt)}</td>
                <td>{userName(r.repId)}</td>
                <td>{productName(r.productId)}</td>
                <td className="num">{r.approvedQuantity && r.approvedQuantity !== r.quantity ? `${r.approvedQuantity} of ${r.quantity}` : r.quantity}</td>
                <td><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
                <td>{r.decisionNote ?? r.notes ?? ''}</td>
                <td className="actions">
                  {r.status === 'Pending' && canApproveSamples(me.role) && r.repId !== me.id && (
                    <><button onClick={() => approve(r)}>Approve</button><button onClick={() => reject(r)}>Reject</button></>
                  )}
                  {r.status === 'Approved' && isAdmin(me.role) && (
                    <><button className="primary" onClick={() => fulfil(r, false)}>Issue stock</button><button onClick={() => fulfil(r, true)}>Issue what is available</button></>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </Section>
  )
}

function Stock() {
  const { api, me } = useApp()
  const admin = isAdmin(me.role)
  const { name: userName } = useUserNames()
  const { name: productName } = useProducts()
  const stock = useAsync(() => api.get<StockRow[]>('/samples/reports/stock'), [], { refreshMs: 60_000 })
  const rows = stock.data ?? []
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()

  async function act(fn: () => Promise<unknown>, ok: string) {
    setError(undefined); setMessage(undefined)
    try { await fn(); setMessage(ok); stock.reload() } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  // Write-offs are negative (damage, loss, expiry); corrections can add stock back. A reason is always required and stock cannot go below zero.
  const adjust = (r: StockRow) => {
    const raw = window.prompt(`Change in units for batch ${r.batchNumber} (${r.location === 'Warehouse' ? 'warehouse' : userName(r.holderId)}, ${r.quantity} held). Use a negative number to write off:`)
    if (raw === null) return
    const delta = Number(raw)
    if (!Number.isInteger(delta) || delta === 0) { setError('Enter a whole number other than zero.'); return }
    if (delta < 0 && -delta > r.quantity) { setError(`Only ${r.quantity} units are held.`); return }
    const reason = window.prompt('Reason (required, kept in the audit trail):')
    if (!reason?.trim()) return
    void act(() => api.post('/samples/adjustments', { batchId: r.batchId, holderId: r.holderId, delta, reason, type: delta < 0 ? 'WriteOff' : 'Adjustment' }), `Stock changed by ${delta}.`)
  }
  const giveBack = (r: StockRow) => {
    const raw = window.prompt(`Return how many units of batch ${r.batchNumber} from ${userName(r.holderId)} to the warehouse? (${r.quantity} held)`, String(r.quantity))
    if (raw === null) return
    const qty = Number(raw)
    if (!Number.isInteger(qty) || qty < 1 || qty > r.quantity) { setError(`Enter a whole number from 1 to ${r.quantity}.`); return }
    void act(() => api.post('/samples/returns', { repId: r.holderId, batchId: r.batchId, quantity: qty, note: null }), `${qty} units returned to the warehouse.`)
  }
  const attention = rows.filter((r) => r.actionRequired)
  return (
    <Section title="Where the stock is">
      {message && <div className="notice" role="status">{message}</div>}
      {error && <ErrorBox message={error} />}
      {stock.error && <ErrorBox message={stock.error} onRetry={stock.reload} />}
      {stock.loading && !stock.data && <Loading />}
      {attention.length > 0 && (
        <div className="error" role="alert">
          {attention.reduce((n, r) => n + r.quantity, 0)} units are expired, quarantined or recalled and should be recovered: {attention.map((r) => `${r.batchNumber} (${r.location === 'Warehouse' ? 'warehouse' : userName(r.holderId)})`).join(', ')}.
        </div>
      )}
      {stock.data && (rows.length === 0 ? <Empty>No stock recorded yet.</Empty> : (
        <table>
          <thead><tr><th>Held by</th><th>Product</th><th>Batch</th><th>Expires</th><th>Status</th><th className="num">Qty</th>{admin && <th />}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.batchId}-${r.holderId}`} className={r.actionRequired ? 'flag' : ''}>
                <td>{r.location === 'Warehouse' ? 'Warehouse' : userName(r.holderId)}</td>
                <td>{productName(r.productId)}</td>
                <td>{r.batchNumber}</td>
                <td>{fmtDate(r.expiryDate)} {r.expired ? <Badge tone="bad">Expired</Badge> : r.expiringSoon ? <Badge tone="warn">{r.daysToExpiry} days</Badge> : null}</td>
                <td>{r.status === 'Active' ? <Badge tone="good">Active</Badge> : <Badge tone="bad">{r.status}</Badge>}</td>
                <td className="num">{fmtInt(r.quantity)}</td>
                {admin && <td className="actions">
                  <button onClick={() => adjust(r)}>Adjust or write off</button>
                  {r.location === 'Rep' && <button onClick={() => giveBack(r)}>Return to warehouse</button>}
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </Section>
  )
}

function Batches() {
  const { api, me } = useApp()
  const admin = isAdmin(me.role)
  const { products, name: productName } = useProducts()
  const batches = useAsync(() => api.get<Batch[]>('/samples/batches', { includeExpired: true }), [])
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const [form, setForm] = useState({ productId: '', batchNumber: '', expiryDate: '' })

  async function act<T>(fn: () => Promise<T>, ok: string | ((r: T) => string)) {
    setError(undefined); setMessage(undefined)
    try { const r = await fn(); setMessage(typeof ok === 'function' ? ok(r) : ok); batches.reload() } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  const receive = (b: Batch) => {
    const q = Number(window.prompt(`Receive how many units of batch ${b.batchNumber} into the warehouse?`))
    if (!Number.isInteger(q) || q < 1) return
    void act(() => api.post('/samples/receipts', { batchId: b.id, quantity: q, note: null }), `${q} units received.`)
  }
  const setStatus = (b: Batch, status: 'Quarantined' | 'Recalled' | 'Active') => {
    const reason = status === 'Active' ? '' : window.prompt(`Reason for marking batch ${b.batchNumber} as ${status.toLowerCase()}:`)
    if (status !== 'Active' && !reason?.trim()) return
    void act(
      () => api.post<{ notified?: number }>(`/samples/batches/${b.id}/status`, { status, reason }),
      (r) => `Batch ${b.batchNumber} is now ${status.toLowerCase()}.` + (r?.notified ? ` ${r.notified} rep${r.notified === 1 ? ' was' : 's were'} notified.` : ''),
    )
  }
  const create = (e: FormEvent) => {
    e.preventDefault()
    void act(() => api.post('/samples/batches', { productId: form.productId || products[0]?.id, batchNumber: form.batchNumber, expiryDate: form.expiryDate }), 'Batch created.')
    setForm({ ...form, batchNumber: '' })
  }

  return (
    <Section title="Batches">
      {message && <div className="notice" role="status">{message}</div>}
      {error && <ErrorBox message={error} />}
      {batches.error && <ErrorBox message={batches.error} onRetry={batches.reload} />}
      {batches.loading && !batches.data && <Loading />}
      {batches.data && (batches.data.length === 0 ? <Empty>No batches yet.</Empty> : (
        <table>
          <thead><tr><th>Product</th><th>Batch</th><th>Expires</th><th>Status</th>{admin && <th />}</tr></thead>
          <tbody>
            {batches.data.map((b) => (
              <tr key={b.id}>
                <td>{productName(b.productId)}</td><td>{b.batchNumber}</td><td>{fmtDate(b.expiryDate)}</td>
                <td>{b.status === 'Active' ? <Badge tone="good">Active</Badge> : <Badge tone="bad">{b.status}</Badge>}{b.statusReason && <div className="muted small">{b.statusReason}</div>}</td>
                {admin && <td className="actions">
                  <button onClick={() => receive(b)}>Receive stock</button>
                  {b.status === 'Active' && <><button onClick={() => setStatus(b, 'Quarantined')}>Quarantine</button><button onClick={() => setStatus(b, 'Recalled')}>Recall</button></>}
                  {b.status === 'Quarantined' && <button onClick={() => setStatus(b, 'Active')}>Release</button>}
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
      ))}
      {admin && <Limits products={products} />}
      {admin && (
        <form className="form" onSubmit={create} aria-label="Add batch">
          <h3>Add a batch</h3>
          <select aria-label="Product" value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input required placeholder="Batch number" aria-label="Batch number" value={form.batchNumber} onChange={(e) => setForm({ ...form, batchNumber: e.target.value })} />
          <input required type="date" aria-label="Expiry date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
          <button className="primary" type="submit">Add batch</button>
        </form>
      )}
    </Section>
  )
}

function ComplianceTab() {
  const { api } = useApp()
  const [days, setDays] = useState(30)
  const { name: userName } = useUserNames()
  const range = rangeLastDays(days)
  const report = useAsync(() => api.get<Compliance>('/samples/reports/compliance', range), [days])
  const [error, setError] = useState<string>()
  const c = report.data

  async function csv() {
    setError(undefined)
    try { await api.download('/samples/reports/distributions', { ...range, format: 'csv' }, `sample-distributions-${new Date().toISOString().slice(0, 10)}.csv`) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <>
      <div className="page-head sub"><RangePicker days={days} onChange={setDays} /><button onClick={csv}>Download distributions (CSV)</button></div>
      {error && <ErrorBox message={error} />}
      {report.error && <ErrorBox message={report.error} onRetry={report.reload} />}
      {report.loading && !c && <Loading />}
      {c && (
        <>
          <div className="kpis">
            <Kpi label="Hand-overs" value={fmtInt(c.distributions.count)} hint={`${fmtInt(c.distributions.units)} units`} />
            <Kpi label="Without signature" value={fmtInt(c.distributions.withoutSignature)} hint={`${fmtInt(c.distributions.withoutSignatureUnits)} units`} tone={c.distributions.withoutSignature ? 'bad' : 'good'} />
            <Kpi label="Expired stock held" value={fmtInt(c.stockHeld.expiredUnits)} tone={c.stockHeld.expiredUnits ? 'bad' : 'good'} hint={`${fmtInt(c.stockHeld.expiringWithin90DaysUnits)} expiring within 90 days`} />
            <Kpi label="Ledger reconciliation" value={c.reconciliation.ok ? 'Balanced' : 'Check'} tone={c.reconciliation.ok ? 'good' : 'bad'} hint={`${fmtInt(c.reconciliation.loggedDistributionUnits)} logged vs ${fmtInt(c.reconciliation.ledgerDistributionUnits)} in ledger`} />
          </div>
          <Section title="By rep">
            {c.byRep.length === 0 ? <Empty>No hand-overs in this period.</Empty> : (
              <table>
                <thead><tr><th>Rep</th><th className="num">Hand-overs</th><th className="num">Units</th><th className="num">Without signature</th></tr></thead>
                <tbody>{c.byRep.map((r) => (
                  <tr key={r.repId} className={r.withoutSignature ? 'flag' : ''}>
                    <td>{userName(r.repId)}</td><td className="num">{r.count}</td><td className="num">{r.units}</td><td className="num">{r.withoutSignature}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            <p className="muted small">Write-offs in period: {c.writeOffs.count} ({c.writeOffs.units} units). Quarantined or recalled units still held: {c.stockHeld.quarantinedOrRecalledUnits}.</p>
          </Section>
        </>
      )}
    </>
  )
}

/** Per-customer sample limits: how many units of a product one customer may be given in a period. Enforced when hand-overs are recorded. */
function Limits({ products }: { products: Product[] }) {
  const { api } = useApp()
  const [overrides, setOverrides] = useState<Record<string, { limit: number | null; days: number | null }>>({})
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const current = (p: Product) => overrides[p.id] ?? { limit: p.sampleLimitPerCustomer ?? null, days: p.sampleLimitDays ?? null }

  async function save(p: Product, limit: number | null, days: number | null) {
    setError(undefined); setMessage(undefined)
    try {
      await api.put(`/admin/products/${p.id}`, { name: p.name, therapeuticArea: p.therapeuticArea ?? null, standardCost: p.standardCost ?? null, reorderLevel: p.reorderLevel ?? null, sampleLimitPerCustomer: limit, sampleLimitDays: days })
      setOverrides((o) => ({ ...o, [p.id]: { limit, days } }))
      setMessage(limit === null ? `${p.name}: no limit.` : `${p.name}: at most ${limit} per customer every ${days} days.`)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  const edit = (p: Product) => {
    const cur = current(p)
    const limit = window.prompt(`Most units of ${p.name} one customer may be given (leave empty for no limit):`, cur.limit === null ? '' : String(cur.limit))
    if (limit === null) return
    if (limit.trim() === '') { void save(p, null, null); return }
    const n = Number(limit)
    if (!Number.isInteger(n) || n < 1) { setError('Enter a whole number of at least 1.'); return }
    const days = window.prompt('...within how many days?', String(cur.days ?? 30))
    if (days === null) return
    const d = Number(days)
    if (!Number.isInteger(d) || d < 1 || d > 3650) { setError('Enter a whole number of days from 1 to 3650.'); return }
    void save(p, n, d)
  }
  return (
    <Section title="Per-customer sample limits">
      {message && <div className="notice" role="status">{message}</div>}
      {error && <ErrorBox message={error} />}
      {products.length === 0 ? <Empty>No products yet.</Empty> : (
        <table>
          <thead><tr><th>Product</th><th>Limit</th><th /></tr></thead>
          <tbody>{products.map((p) => {
            const c = current(p)
            return <tr key={p.id}><td>{p.name}</td><td>{c.limit === null ? 'No limit' : `${c.limit} per customer per ${c.days} days`}</td><td className="actions"><button onClick={() => edit(p)}>Set limit for {p.name}</button></td></tr>
          })}</tbody>
        </table>
      )}
    </Section>
  )
}
