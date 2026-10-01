import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { LastKnown, ProductEngagement, SalesDashboard, TrendPoint } from '../api/types'
import { ErrorBox, Kpi, Loading, Section, Empty } from '../components/ui'
import { RangePicker } from '../components/RangePicker'
import { useApp } from '../context'
import { fmtDateTime, fmtInt, fmtPct, rangeLastDays } from '../lib/format'
import { isManager } from '../lib/roles'
import { useAsync } from '../lib/useAsync'
import { useUserNames } from '../lib/useNames'

export function Overview() {
  const { api, me } = useApp()
  const [days, setDays] = useState(30)
  const { name } = useUserNames()
  const range = rangeLastDays(days)
  const sales = useAsync(() => api.get<SalesDashboard>('/dashboards/sales', range), [days])
  const trend = useAsync(() => api.get<TrendPoint[]>('/dashboards/trend', range), [days])
  const products = useAsync(() => api.get<ProductEngagement[]>('/dashboards/products', range), [days])
  const positions = useAsync(
    () => (isManager(me.role) ? api.get<LastKnown[]>('/gps/last-known') : Promise.resolve([] as LastKnown[])),
    [me.role],
  )

  const s = sales.data
  const outside = s?.byRep.reduce((n, r) => n + r.outsideGeofence, 0) ?? 0

  return (
    <>
      <div className="page-head">
        <h1>Sales overview</h1>
        <RangePicker days={days} onChange={setDays} />
      </div>

      {sales.error && <ErrorBox message={sales.error} onRetry={sales.reload} />}
      {sales.loading && !s && <Loading />}
      {s && (
        <div className="kpis">
          <Kpi label="Calls completed" value={fmtInt(s.callsCompleted)} hint={`${fmtInt(s.plannedVisits)} planned`} />
          <Kpi label="Plan adherence" value={fmtPct(s.planAdherencePct)} tone={s.planAdherencePct >= 80 ? 'good' : s.planAdherencePct >= 50 ? 'warn' : 'bad'} />
          <Kpi label="Customer coverage" value={fmtPct(s.coveragePct)} hint="customers visited at least once" />
          <Kpi label="Visits outside geofence" value={fmtInt(outside)} tone={outside > 0 ? 'warn' : 'good'} hint="check-ins far from the customer" />
        </div>
      )}

      <p className="muted note">Revenue trends appear here once ERP sales data is connected (planned integration).</p>

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
                  <Line isAnimationActive={false} type="monotone" dataKey="calls" stroke="var(--accent)" strokeWidth={2} dot={false} name="Calls" />
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
                  <Bar isAnimationActive={false} dataKey="calls" fill="var(--accent)" name="Calls" />
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
                <Bar isAnimationActive={false} dataKey="calls" fill="var(--accent)" name="Calls discussing product" />
                <Bar isAnimationActive={false} dataKey="sampleUnits" fill="var(--accent-2)" name="Sample units given" />
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
