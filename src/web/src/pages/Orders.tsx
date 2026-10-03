import { Fragment, useState } from 'react'
import type { OrderSummary, Product, SalesOrder } from '../api/types'
import { Badge, Empty, ErrorBox, Kpi, Loading, Section } from '../components/ui'
import { LiveBadge } from '../components/LiveBadge'
import { useApp } from '../context'
import { fmtDateTime, fmtInt } from '../lib/format'
import { canManageOrders, canSetPrices, isManager } from '../lib/roles'
import { liveStatus, useAsync } from '../lib/useAsync'
import { useUserNames } from '../lib/useNames'

type Tab = 'orders' | 'prices'

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
      {canSetPrices(me.role) && (
        <div className="tabs" role="tablist">
          {([['orders', 'Orders'], ['prices', 'Price list']] as [Tab, string][]).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
      )}
      {tab === 'orders' ? <OrderList /> : <PriceList />}
    </>
  )
}

function OrderList() {
  const { api, me } = useApp()
  const [status, setStatus] = useState('Placed')
  const [open, setOpen] = useState<string>()
  const { name: userName } = useUserNames()
  const summary = useAsync(() => api.get<OrderSummary>('/orders/summary', { days: 30 }), [], { refreshMs: 60_000 })
  const list = useAsync(() => api.get<SalesOrder[]>('/orders', { status: status === 'All' ? undefined : status }), [status], { refreshMs: 60_000 })
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()

  async function act(fn: () => Promise<unknown>, ok: string) {
    setError(undefined); setMessage(undefined)
    try { await fn(); setMessage(ok); list.reload(); summary.reload() } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
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
        </div>
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
                    <td><Badge tone={tone(o.status)}>{o.status}</Badge></td>
                    <td className="actions">
                      {canManageOrders(me.role) && o.status === 'Placed' && <button className="primary" onClick={() => act(() => api.post(`/orders/${o.id}/confirm`, {}), `Order ${o.number} confirmed.`)}>Confirm</button>}
                      {canManageOrders(me.role) && o.status === 'Confirmed' && <button className="primary" onClick={() => act(() => api.post(`/orders/${o.id}/deliver`, {}), `Order ${o.number} marked delivered.`)}>Mark delivered</button>}
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
