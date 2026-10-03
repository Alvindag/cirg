import { Fragment, useState } from 'react'
import type { CreditOverview, OrderSummary, Product, SalesOrder } from '../api/types'
import { Badge, Empty, ErrorBox, Kpi, Loading, Section } from '../components/ui'
import { LiveBadge } from '../components/LiveBadge'
import { useApp } from '../context'
import { fmtDate, fmtDateTime, fmtInt, fmtPct } from '../lib/format'
import { canManageOrders, canReleaseCredit, canSetPrices, isManager } from '../lib/roles'
import { liveStatus, useAsync } from '../lib/useAsync'
import { useUserNames } from '../lib/useNames'

type Tab = 'orders' | 'credit' | 'prices'

const money = (n: number) => `GHS ${new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`
const tone = (s: string) => (s === 'Delivered' ? 'good' : s === 'Confirmed' ? 'warn' : s === 'Cancelled' ? 'bad' : 'muted')
const hours = (h: number) => (h < 48 ? `${h.toFixed(1)} hours` : `${(h / 24).toFixed(1)} days`)

export function Orders() {
  const { me } = useApp()
  const [tab, setTab] = useState<Tab>('orders')
  if (!isManager(me.role)) return <ErrorBox message="Orders are available to managers." />
  return (
    <>
      <div className="page-head"><h1>Orders</h1></div>
      <div className="tabs" role="tablist">
        {([['orders', 'Orders'], ['credit', 'Credit'], ...(canSetPrices(me.role) ? [['prices', 'Price list']] : [])] as [Tab, string][]).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === 'orders' && <OrderList />}
      {tab === 'credit' && <Credit />}
      {tab === 'prices' && <PriceList />}
    </>
  )
}

function OrderList() {
  const { api, me } = useApp()
  const [status, setStatus] = useState('Placed')
  const [open, setOpen] = useState<string>()
  const [now] = useState(() => Date.now()) // fixed for this view, so late/promised labels do not change while rendering
  const { name: userName } = useUserNames()
  const summary = useAsync(() => api.get<OrderSummary>('/orders/summary', { days: 30 }), [], { refreshMs: 60_000 })
  const list = useAsync(() => api.get<SalesOrder[]>('/orders', { status: status === 'All' ? undefined : status }), [status], { refreshMs: 60_000 })
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()

  async function act(fn: () => Promise<unknown>, ok: string) {
    setError(undefined); setMessage(undefined)
    try { await fn(); setMessage(ok); list.reload(); summary.reload() } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  const confirm = (o: SalesOrder) => {
    if (!o.creditHold) { void act(() => api.post(`/orders/${o.id}/confirm`, {}), `Order ${o.number} confirmed.`); return }
    const note = window.prompt(`This order is on credit hold:\n${o.creditHoldReason ?? ''}\n\nWhy is it being released?`)
    if (!note?.trim()) return
    void act(() => api.post(`/orders/${o.id}/confirm`, { note }), `Order ${o.number} released and confirmed.`)
  }
  const deliver = (o: SalesOrder) => {
    if (window.confirm(`Was the whole of order ${o.number} delivered?`)) { void act(() => api.post(`/orders/${o.id}/deliver`, { inFull: true }), `Order ${o.number} marked delivered.`); return }
    const note = window.prompt('What was short? (this is kept with the order)')
    if (!note?.trim()) return
    void act(() => api.post(`/orders/${o.id}/deliver`, { inFull: false, note }), `Order ${o.number} marked delivered, not in full.`)
  }
  const cancel = (o: SalesOrder) => {
    const note = window.prompt('Reason for cancelling (the rep will see it):')
    if (!note?.trim()) return
    void act(() => api.post(`/orders/${o.id}/cancel`, { note }), `Order ${o.number} cancelled.`)
  }

  const s = summary.data
  return (
    <>
      {s && (
        <div className="kpis">
          <Kpi label="Orders, last 30 days" value={fmtInt(s.orders)} hint={`${money(s.value)} ordered`} />
          <Kpi label="Waiting to be confirmed" value={fmtInt(s.placed)} tone={s.placed > 0 ? 'warn' : undefined} />
          <Kpi label="Confirmed, not yet delivered" value={fmtInt(s.confirmed)} />
          <Kpi label="Delivered" value={fmtInt(s.delivered)} hint={s.avgHoursToDeliver != null ? `${hours(s.avgHoursToDeliver)} from order to delivery` : 'none yet'} />
          {s.service && (
            <Kpi label="On time, in full" value={s.service.otifPct != null ? fmtPct(s.service.otifPct) : '—'}
              hint={s.service.otifPct != null ? `${fmtPct(s.service.onTimePct ?? 0)} on time · ${fmtPct(s.service.inFullPct ?? 0)} in full (${fmtInt(s.service.judged)} orders)` : 'needs delivered orders that carry a promise'}
              tone={s.service.otifPct == null ? undefined : s.service.otifPct < 80 ? 'bad' : s.service.otifPct < 95 ? 'warn' : 'good'} />
          )}
          {s.lateOpen != null && s.lateOpen > 0 && <Kpi label="Running late" value={fmtInt(s.lateOpen)} hint="confirmed, promised date has passed" tone="bad" />}
        </div>
      )}
      {s?.regions && s.regions.length > 0 && (
        <Section title="Delivery service by region">
          <table>
            <thead><tr><th>Region</th><th className="num">Delivered</th><th className="num">On time</th><th className="num">In full</th><th className="num">OTIF</th></tr></thead>
            <tbody>{s.regions.map((r) => <tr key={r.region}><td>{r.region}</td><td className="num">{fmtInt(r.delivered)}</td><td className="num">{fmtPct(r.onTimePct)}</td><td className="num">{fmtPct(r.inFullPct)}</td><td className="num">{fmtPct(r.otifPct)}</td></tr>)}</tbody>
          </table>
        </Section>
      )}
      <Section title="Orders" actions={
        <span className="filters">
          <LiveBadge updatedAt={liveStatus(list).updatedAt} stale={list.stale} onRefresh={list.reload} />
          <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {['All', 'Placed', 'Confirmed', 'Delivered', 'Cancelled'].map((x) => <option key={x}>{x}</option>)}
          </select>
        </span>
      }>
        {message && <div className="notice" role="status">{message}</div>}
        {error && <ErrorBox message={error} />}
        {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
        {list.loading && !list.data && <Loading />}
        {list.data && (list.data.length === 0 ? <Empty>{status === 'All' ? 'No orders yet' : `No ${status.toLowerCase()} orders`}.</Empty> : (
          <table>
            <thead><tr><th>Order</th><th>Taken</th><th>Customer</th><th>Rep</th><th className="num">Total</th><th>Status</th><th /></tr></thead>
            <tbody>
              {list.data.map((o) => (
                <Fragment key={o.id}>
                  <tr>
                    <td><button className="link-row" aria-expanded={open === o.id} onClick={() => setOpen(open === o.id ? undefined : o.id)}>{o.number}</button></td>
                    <td>{fmtDateTime(o.placedAt)}</td>
                    <td>{o.customerName}</td>
                    <td>{userName(o.repId)}</td>
                    <td className="num">{money(o.total)}</td>
                    <td><Badge tone={tone(o.status)}>{o.status}</Badge>{o.status === 'Confirmed' && o.promisedAt && <> <span className={Date.parse(o.promisedAt) < now ? 'muted small late' : 'muted small'}>{Date.parse(o.promisedAt) < now ? 'late, promised ' : 'promised '}{fmtDate(o.promisedAt)}</span></>}{o.status === 'Delivered' && o.deliveredInFull === false && <> <Badge tone="warn">Short</Badge></>}{o.creditHold && o.status === 'Placed' && <> <Badge tone="bad">Credit hold</Badge></>}</td>
                    <td className="actions">
                      {canManageOrders(me.role) && o.status === 'Placed' && (!o.creditHold || canReleaseCredit(me.role)) && <button className="primary" onClick={() => confirm(o)}>{o.creditHold ? 'Release and confirm' : 'Confirm'}</button>}
                      {canManageOrders(me.role) && o.status === 'Placed' && o.creditHold && !canReleaseCredit(me.role) && <span className="muted small">Needs a credit release</span>}
                      {canManageOrders(me.role) && o.status === 'Confirmed' && <button className="primary" onClick={() => deliver(o)}>Mark delivered</button>}
                      {canManageOrders(me.role) && (o.status === 'Placed' || o.status === 'Confirmed') && <button onClick={() => cancel(o)}>Cancel</button>}
                    </td>
                  </tr>
                  {open === o.id && (
                    <tr>
                      <td colSpan={7}>
                        <table>
                          <thead><tr><th>Product</th><th className="num">Qty</th><th className="num">Unit price</th><th className="num">Line total</th></tr></thead>
                          <tbody>{o.lines.map((l) => <tr key={l.id}><td>{l.productName}</td><td className="num">{fmtInt(l.quantity)}</td><td className="num">{money(l.unitPrice)}</td><td className="num">{money(l.lineTotal)}</td></tr>)}</tbody>
                        </table>
                        {o.notes && <p>Note: {o.notes}</p>}
                        {o.shortfallNote && <p>Short delivery: {o.shortfallNote}</p>}
                        {o.creditHold && <p>Credit hold: {o.creditHoldReason}{o.creditReleaseNote ? ` Released: ${o.creditReleaseNote}` : ''}</p>}
                        {o.cancelReason && <p>Cancelled: {o.cancelReason}</p>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        ))}
      </Section>
      {s && s.topProducts.length > 0 && (
        <Section title="Top products, last 30 days">
          <table>
            <thead><tr><th>Product</th><th className="num">Units</th><th className="num">Value</th></tr></thead>
            <tbody>{s.topProducts.map((p) => <tr key={p.productId}><td>{p.name}</td><td className="num">{fmtInt(p.quantity)}</td><td className="num">{money(p.value)}</td></tr>)}</tbody>
          </table>
        </Section>
      )}
    </>
  )
}

function Credit() {
  const { api, me } = useApp()
  const c = useAsync(() => api.get<CreditOverview>('/credit/overview'), [], { refreshMs: 120_000 })
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const d = c.data
  async function save(id: string, name: string) {
    setError(undefined); setMessage(undefined)
    const v = (edits[id] ?? '').trim()
    const limit = v === '' ? null : Number(v)
    if (limit !== null && (!Number.isFinite(limit) || limit < 0)) { setError('A limit must be a number of 0 or more.'); return }
    try {
      await api.put(`/credit/${id}`, { creditLimit: limit })
      setEdits(({ [id]: _drop, ...rest }) => rest); setMessage(`Limit for ${name} saved.`); c.reload()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  return (
    <Section title="Credit">
      <p className="muted">Balances and limits arrive from Business Central (the <code>balances</code> import: account code, credit limit, outstanding, overdue). An order for a customer who is over their limit or has overdue invoices is taken but held until a National Sales Manager or Admin releases it. Customers with no limit and no overdue are never held.</p>
      {message && <div className="notice" role="status">{message}</div>}
      {error && <ErrorBox message={error} />}
      {c.error && <ErrorBox message={c.error} onRetry={c.reload} />}
      {c.loading && !d && <Loading />}
      {d && (d.customers === 0 ? <Empty>No balances yet. Send them with the ERP “balances” import.</Empty> : (
        <>
          <div className="kpis">
            <Kpi label="Overdue in total" value={money(d.overdueTotal)} hint={`${fmtInt(d.withOverdue)} customer(s) overdue`} tone={d.withOverdue > 0 ? 'warn' : 'good'} />
            <Kpi label="Over their limit" value={fmtInt(d.overLimit)} hint={`of ${fmtInt(d.withLimit)} with a limit`} tone={d.overLimit > 0 ? 'warn' : 'good'} />
            <Kpi label="Orders on credit hold" value={fmtInt(d.heldOrders)} tone={d.heldOrders > 0 ? 'bad' : 'good'} />
            <Kpi label="Owed in total" value={money(d.outstandingTotal)} />
          </div>
          {d.watch.length === 0 ? <Empty>Nobody is over their limit or overdue.</Empty> : (
            <table>
              <thead><tr><th>Customer</th><th>Territory</th><th className="num">Limit</th><th className="num">Owes</th><th className="num">Overdue</th><th className="num">On open orders</th><th /></tr></thead>
              <tbody>
                {d.watch.map((r) => (
                  <tr key={r.customerId}>
                    <td>{r.name} {r.overLimit && <Badge tone="bad">Over limit</Badge>}</td>
                    <td>{r.territory ?? '—'}</td>
                    <td className="num">
                      {canSetPrices(me.role)
                        ? <input aria-label={`Limit for ${r.name}`} inputMode="decimal" size={10} value={edits[r.customerId] ?? (r.creditLimit != null ? String(r.creditLimit) : '')} placeholder="no limit" onChange={(e) => setEdits({ ...edits, [r.customerId]: e.target.value })} />
                        : r.creditLimit != null ? money(r.creditLimit) : '—'}
                    </td>
                    <td className="num">{money(r.outstanding)}</td>
                    <td className="num">{r.overdue > 0 ? money(r.overdue) : '—'}</td>
                    <td className="num">{r.openOrders > 0 ? money(r.openOrders) : '—'}</td>
                    <td>{canSetPrices(me.role) && r.customerId in edits && <button onClick={() => save(r.customerId, r.name)}>Save limit</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ))}
    </Section>
  )
}

function PriceList() {
  const { api } = useApp()
  const products = useAsync(() => api.get<Product[]>('/admin/products'), [])
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()

  const changed = Object.entries(edits)
  async function save() {
    setError(undefined); setMessage(undefined)
    const rows = changed.map(([productId, v]) => ({ productId, price: v.trim() === '' ? null : Number(v) }))
    if (rows.some((r) => r.price !== null && !Number.isFinite(r.price))) { setError('Prices must be numbers.'); return }
    try {
      await api.put('/orders/prices', rows)
      setEdits({}); setMessage(`${rows.length} price${rows.length === 1 ? '' : 's'} saved.`); products.reload()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <Section title="Price list (GHS per unit)" actions={<button className="primary" disabled={changed.length === 0} onClick={save}>Save {changed.length > 0 ? `${changed.length} change${changed.length === 1 ? '' : 's'}` : 'changes'}</button>}>
      <p className="muted">Orders are priced from this list. A product with no price cannot be ordered. Prices also arrive from Business Central when the ERP link sends them.</p>
      {message && <div className="notice" role="status">{message}</div>}
      {error && <ErrorBox message={error} />}
      {products.error && <ErrorBox message={products.error} onRetry={products.reload} />}
      {products.loading && !products.data && <Loading />}
      {products.data && (products.data.length === 0 ? <Empty>No products yet.</Empty> : (
        <table>
          <thead><tr><th>Code</th><th>Product</th><th className="num">Price</th></tr></thead>
          <tbody>
            {products.data.map((p) => (
              <tr key={p.id}>
                <td>{p.code ?? ''}</td>
                <td>{p.name}</td>
                <td className="num">
                  <input aria-label={`Price for ${p.name}`} inputMode="decimal" size={8} placeholder="not for sale"
                    value={edits[p.id] ?? (p.listPrice != null ? String(p.listPrice) : '')}
                    onChange={(e) => setEdits({ ...edits, [p.id]: e.target.value })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </Section>
  )
}
