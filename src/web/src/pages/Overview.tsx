import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { LastKnown, ProductEngagement, RevenueResult, SalesDashboard, TrendPoint } from '../api/types'
import { ErrorBox, Kpi, Loading, Section, Empty } from '../components/ui'
import { RangePicker } from '../components/RangePicker'
import { useApp } from '../context'
import { fmtDateTime, fmtInt, fmtPct, rangeLastDays } from '../lib/format'
import { isManager } from '../lib/roles'
import { liveStatus, useAsync } from '../lib/useAsync'
import { LiveBadge } from '../components/LiveBadge'
import { useMotion } from '../lib/motion'
import { useUserNames } from '../lib/useNames'

export function Overview() {
  const { api, me } = useApp()
  const [days, setDays] = useState(30)
  const { name } = useUserNames()
  const range = rangeLastDays(days)
  const animate = useMotion()
  const live = { refreshMs: 60_000 } // the whole page refreshes itself every minute
  const sales = useAsync(() => api.get<SalesDashboard>('/dashboards/sales', range), [days], live)
  const trend = useAsync(() => api.get<TrendPoint[]>('/dashboards/trend', range), [days], live)
  const products = useAsync(() => api.get<ProductEngagement[]>('/dashboards/products', range), [days], live)
  const revenue = useAsync(() => api.get<RevenueResult>('/dashboards/revenue', range).catch(() => undefined), [days], live)
  const positions = useAsync(
    () => (isManager(me.role) ? api.get<LastKnown[]>('/gps/last-known') : Promise.resolve([] as LastKnown[])),
    [me.role],
    live,
  )
  const status = liveStatus(sales, trend, products, revenue, positions)
  const refreshAll = () => { sales.reload(); trend.reload(); products.reload(); revenue.reload(); positions.reload() }

  const s = sales.data
  const outside = s?.byRep.reduce((n, r) => n + r.outsideGeofence, 0) ?? 0

  return (
    <>
      <div className="page-head">
        <h1>Sales overview</h1>
        <LiveBadge updatedAt={status.updatedAt} stale={status.stale} onRefresh={refreshAll} />
        <RangePicker days={days} onChange={setDays} />
      </div>

      {sales.error && <ErrorBox message={sales.error} onRetry={sales.reload} />}
      {sales.loading && !s && <Loading />}
      {s && (
        <div className="kpis">
          <Kpi label="Calls completed" value={fmtInt(s.callsCompleted)} num={s.callsCompleted} format={fmtInt} hint={`${fmtInt(s.plannedVisits)} planned`} />
          <Kpi label="Plan adherence" value={fmtPct(s.planAdherencePct)} num={s.planAdherencePct} format={fmtPct} tone={s.planAdherencePct >= 80 ? 'good' : s.planAdherencePct >= 50 ? 'warn' : 'bad'} />
          <Kpi label="Customer coverage" value={fmtPct(s.coveragePct)} num={s.coveragePct} format={fmtPct} hint="customers visited at least once" />
          <Kpi label="Visits outside geofence" value={fmtInt(outside)} num={outside} format={fmtInt} tone={outside > 0 ? 'warn' : 'good'} hint="check-ins far from the customer" />
        </div>
      )}

      {revenue.data && (revenue.data.trend.length > 0 || revenue.data.total !== 0) ? <RevenueSection r={revenue.data} /> : (
        <p className="muted note">{revenue.loading && !revenue.data ? 'Loading revenue…' : 'No ERP sales data yet. Revenue appears here once invoices are imported or pulled from the ERP (ERP integration).'}</p>
      )}

      <div className="grid-2">
        <Section title="Calls per day">
          {trend.error ? <ErrorBox message={trend.error} /> : !trend.data ? <Loading /> : (
            <div className="chart" aria-label="Calls per day chart">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={trend.data} margin={{ left: 0, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Line isAnimationActive={animate} type="monotone" dataKey="calls" stroke="var(--accent)" strokeWidth={2} dot={false} name="Calls" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Section>

        <Section title="Calls by rep">
          {!s ? <Loading /> : s.byRep.length === 0 ? <Empty>No completed calls in this period.</Empty> : (
            <div className="chart" aria-label="Calls by rep chart">
              <ResponsiveContainer width="100%" height={Math.max(160, s.byRep.length * 34)}>
                <BarChart layout="vertical" data={s.byRep.map((r) => ({ ...r, rep: name(r.repId) }))} margin={{ left: 24, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="rep" width={120} />
                  <Tooltip />
                  <Bar isAnimationActive={animate} dataKey="calls" fill="var(--accent)" name="Calls" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Section>
      </div>

      <Section title="Product engagement">
        {products.error ? <ErrorBox message={products.error} /> : !products.data ? <Loading /> : products.data.length === 0 ? (
          <Empty>No products discussed or sampled in this period.</Empty>
        ) : (
          <div className="chart" aria-label="Product engagement chart">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={products.data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar isAnimationActive={animate} dataKey="calls" fill="var(--accent)" name="Calls discussing product" />
                <Bar isAnimationActive={animate} dataKey="sampleUnits" fill="var(--accent-2)" name="Sample units given" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      <div className="grid-2">
        <Section title="Rep activity">
          {!s ? <Loading /> : s.byRep.length === 0 ? <Empty>No activity yet.</Empty> : (
            <table>
              <thead><tr><th>Rep</th><th className="num">Calls</th><th className="num">Customers</th><th className="num">Outside geofence</th></tr></thead>
              <tbody>
                {s.byRep.map((r) => (
                  <tr key={r.repId}>
                    <td>{name(r.repId)}</td>
                    <td className="num">{r.calls}</td>
                    <td className="num">{r.uniqueCustomers}</td>
                    <td className="num">{r.outsideGeofence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {isManager(me.role) && (
          <Section title="Last known positions today">
            {!positions.data ? <Loading /> : positions.data.length === 0 ? <Empty>No location pings received today.</Empty> : (
              <table>
                <thead><tr><th>Rep</th><th>Last seen</th><th>Location</th></tr></thead>
                <tbody>
                  {positions.data.map((p) => (
                    <tr key={p.repId}>
                      <td>{name(p.repId)}</td>
                      <td>{fmtDateTime(p.recordedAt)}</td>
                      <td>
                        <a href={`https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}#map=15/${p.latitude}/${p.longitude}`} target="_blank" rel="noreferrer noopener">
                          {p.latitude.toFixed(4)}, {p.longitude.toFixed(4)}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        )}
      </div>
    </>
  )
}

const money = (n: number, currency: string) => `${currency} ${new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(n)}`

function RevenueSection({ r }: { r: RevenueResult }) {
  const animate = useMotion()
  return (
    <>
      <div className="kpis">
        <Kpi label="Revenue" value={money(r.total, r.currency)} num={r.total} format={(n) => money(Math.round(n), r.currency)} hint={`${fmtInt(r.units)} units invoiced`} />
        <Kpi label="Change on previous period" value={r.growthPct === null ? '—' : `${r.growthPct > 0 ? '+' : ''}${r.growthPct}%`} tone={r.growthPct === null ? undefined : r.growthPct >= 0 ? 'good' : 'bad'} hint={`previous: ${money(r.previousTotal, r.currency)}`} />
        <Kpi label="Customers buying" value={fmtInt(r.customersBuying)} num={r.customersBuying} format={fmtInt} hint={r.unlinkedAmount ? `${money(r.unlinkedAmount, r.currency)} on accounts not linked yet` : undefined} tone={r.unlinkedAmount ? 'warn' : undefined} />
      </div>
      <div className="grid-2">
        <Section title="Revenue trend">
          <div className="chart" aria-label="Revenue trend chart">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={r.trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" tickFormatter={(p: string) => (r.granularity === 'day' ? p.slice(5) : p)} minTickGap={20} />
                <YAxis tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                <Tooltip formatter={(v) => money(Number(v), r.currency)} />
                <Bar isAnimationActive={animate} dataKey="amount" fill="var(--accent)" name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
        <Section title="Top customers">
          {r.topCustomers.length === 0 ? <Empty>No linked customers have invoices in this period.</Empty> : (
            <table>
              <thead><tr><th>Customer</th><th className="num">Revenue</th></tr></thead>
              <tbody>{r.topCustomers.map((c) => <tr key={c.customerId}><td>{c.name}</td><td className="num">{money(c.amount, r.currency)}</td></tr>)}</tbody>
            </table>
          )}
        </Section>
      </div>
    </>
  )
}
