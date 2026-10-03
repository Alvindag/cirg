import { useState } from 'react'
import type { CoverageDashboard, OutletClass, RtmDashboard, SalesChannel, UniverseRow, UntaggedList } from '../api/types'
import { Empty, ErrorBox, Kpi, Loading, Section } from '../components/ui'
import { RangePicker } from '../components/RangePicker'
import { useApp } from '../context'
import { fmtDate, fmtInt, fmtPct, rangeLastDays } from '../lib/format'
import { canImportCustomers } from '../lib/roles'
import { useAsync } from '../lib/useAsync'

const channelLabel: Record<SalesChannel, string> = {
  Unassigned: 'Not tagged yet', VanSales: 'Van sales', MedicalSales: 'Medical sales', Distributor: 'Distributor / wholesaler',
  DirectKeyAccount: 'Direct key account', WalkIn: 'Walk-in (head office and branches)',
}
const classLabel: Record<OutletClass, string> = {
  Unclassified: 'Not classified yet', TeachingHospital: 'Teaching hospital', RegionalHospital: 'Regional hospital', DistrictHospital: 'District hospital',
  PharmacyChain: 'Retail pharmacy chain', IndependentPharmacy: 'Independent pharmacy', OtcShop: 'OTC shop', ClinicOrOther: 'Clinic / other',
}
const classes = Object.keys(classLabel) as OutletClass[]
const channels = Object.keys(channelLabel) as SalesChannel[]
const money = (n: number, currency: string) => `${currency} ${new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(n)}`
const canSetMarket = (role: string) => ['Admin', 'NationalSalesManager', 'Executive'].includes(role)

/** A bar for the whole market, with how much is mapped (light) and reached (solid) inside it. */
function CoverageBar({ universe, mapped, reached }: { universe: number | null; mapped: number; reached: number }) {
  const whole = Math.max(universe ?? 0, mapped, 1)
  return (
    <div className="cov" role="img" aria-label={`${reached} reached, ${mapped} mapped${universe != null ? `, of ${universe}` : ''}`}>
      <i className="cov-mapped" style={{ width: `${(mapped / whole) * 100}%` }} />
      <i className="cov-reached" style={{ width: `${(reached / whole) * 100}%` }} />
    </div>
  )
}

const pct = (part: number, whole: number | null) => (whole ? fmtPct((part / whole) * 100) : '—')

export function Rtm() {
  const { api, me } = useApp()
  const [days, setDays] = useState(90)
  const range = rangeLastDays(days)
  const r = useAsync(() => api.get<RtmDashboard>('/dashboards/rtm', range), [days])
  const d = r.data

  return (
    <>
      <div className="page-head">
        <h1>Route to market</h1>
        <RangePicker days={days} onChange={setDays} />
      </div>
      <p className="muted note">How outlets are served, how much of the market DAS has mapped and reaches, and where the gaps are. This view reports on channels, kinds of outlet and regions, not on individual sales people. “Reached” means visited or invoiced in the period.</p>

      {r.error && <ErrorBox message={r.error} onRetry={r.reload} />}
      {r.loading && !d && <Loading />}
      {d && (
        <>
          <div className="kpis">
            <Kpi label="Market size (outlets)" value={d.universeTotal != null ? fmtInt(d.universeTotal) : 'Not set'} num={d.universeTotal ?? undefined} format={fmtInt}
              hint={d.universeScoped ? 'compared nationally, not for your area' : d.hasUniverse ? 'estimated by the business' : 'set it below to see coverage'} tone={d.hasUniverse ? undefined : 'warn'} />
            <Kpi label="Mapped on the platform" value={fmtInt(d.mapped)} num={d.mapped} format={fmtInt} hint={d.mappedPct != null ? `${fmtPct(d.mappedPct)} of the market` : 'outlets with a record'} />
            <Kpi label="Reached in the period" value={fmtInt(d.reached)} num={d.reached} format={fmtInt} hint={d.reachedPct != null ? `${fmtPct(d.reachedPct)} of the market` : 'visited or invoiced'} tone={d.reachedPct != null && d.reachedPct < 25 ? 'warn' : undefined} />
            <Kpi label="Top 20% of buyers" value={d.top20Share != null ? fmtPct(d.top20Share) : '—'} hint={d.top20Share != null ? `of ${money(d.revenue, d.currency)} revenue` : 'needs at least 5 buyers'} tone={d.top20Share != null && d.top20Share > 80 ? 'warn' : undefined} />
          </div>

          <Section title="Coverage by kind of outlet">
            {d.classes.length === 0 ? <Empty>No outlets yet. Import customers, then tag the kind of outlet and the channel below.</Empty> : (
              <table>
                <thead><tr><th>Kind of outlet</th><th className="num">Market</th><th className="num">Mapped</th><th className="num">Reached</th><th className="num">Reached %</th><th>Coverage</th><th className="num">Revenue</th></tr></thead>
                <tbody>
                  {d.classes.map((c) => (
                    <tr key={c.outletClass}>
                      <td>{classLabel[c.outletClass]}</td>
                      <td className="num">{c.universe != null ? fmtInt(c.universe) : '—'}</td>
                      <td className="num">{fmtInt(c.mapped)}</td>
                      <td className="num">{fmtInt(c.reached)}</td>
                      <td className="num">{pct(c.reached, c.universe)}</td>
                      <td><CoverageBar universe={c.universe} mapped={c.mapped} reached={c.reached} /></td>
                      <td className="num">{money(c.revenue, d.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="muted small">Light bar: mapped. Solid bar: reached. The full width is the estimated market (or the mapped outlets when no estimate is set).</p>
          </Section>

          <div className="grid-2">
            <Section title="How outlets are served">
              <table>
                <thead><tr><th>Channel</th><th className="num">Outlets</th><th className="num">Reached</th><th className="num">Revenue</th><th className="num">Share</th></tr></thead>
                <tbody>
                  {d.channels.map((c) => (
                    <tr key={c.channel}>
                      <td>{channelLabel[c.channel]}</td>
                      <td className="num">{fmtInt(c.customers)}</td>
                      <td className="num">{fmtInt(c.reached)}</td>
                      <td className="num">{money(c.revenue, d.currency)}</td>
                      <td className="num">{d.revenue > 0 ? fmtPct((c.revenue / d.revenue) * 100) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted small">Sales through distributors to the outlets they supply are not visible until their sell-out is shared with DAS.</p>
            </Section>

            <Section title="By region">
              {d.regions.length === 0 ? <Empty>Outlets have no region yet. Give territories a region under Team.</Empty> : (
                <table>
                  <thead><tr><th>Region</th><th className="num">Market</th><th className="num">Mapped</th><th className="num">Reached</th><th className="num">Gap</th></tr></thead>
                  <tbody>
                    {d.regions.map((g) => (
                      <tr key={g.region}>
                        <td>{g.region}</td>
                        <td className="num">{g.universe != null ? fmtInt(g.universe) : '—'}</td>
                        <td className="num">{fmtInt(g.mapped)}</td>
                        <td className="num">{fmtInt(g.reached)}</td>
                        <td className="num">{g.universe != null ? fmtInt(Math.max(0, g.universe - g.reached)) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>
          </div>

          <VisitCoverage days={Math.min(90, Math.max(7, days))} />

          <Section title="Complete the picture">
            <p>
              {d.tagging.total === 0 ? 'No outlets yet.' : `${fmtInt(d.tagging.noChannel)} of ${fmtInt(d.tagging.total)} outlets have no channel, ${fmtInt(d.tagging.noClass)} have no kind of outlet, and ${fmtInt(d.tagging.noRegion)} have no region.`}
              {' '}The review is only as good as this tagging.
            </p>
            {canImportCustomers(me.role) && <TagList onChanged={r.reload} />}
          </Section>

          {canSetMarket(me.role) && <MarketSize onSaved={r.reload} />}
        </>
      )}
    </>
  )
}

/** Are the planned calls being made? Reported by territory; the list shows customers, not people. */
function VisitCoverage({ days }: { days: number }) {
  const { api } = useApp()
  const c = useAsync(() => api.get<CoverageDashboard>('/dashboards/coverage', { days }), [days])
  const d = c.data
  return (
    <Section title={`Visit coverage, last ${days} days`}>
      {c.error && <ErrorBox message={c.error} onRetry={c.reload} />}
      {c.loading && !d && <Loading />}
      {d && (d.customers === 0 ? <Empty>No customers have a visit target yet. Set “visits a month” on customers, or in the customer import.</Empty> : (
        <>
          <div className="kpis">
            <Kpi label="Planned calls made" value={d.attainmentPct != null ? fmtPct(d.attainmentPct) : '—'} hint={`${fmtInt(d.completedVisits)} visits against ${fmtInt(Math.round(d.expectedVisits))} expected`}
              tone={d.attainmentPct != null && d.attainmentPct < 60 ? 'bad' : d.attainmentPct != null && d.attainmentPct < 85 ? 'warn' : 'good'} />
            <Kpi label="Overdue customers" value={fmtInt(d.overdue)} hint={`of ${fmtInt(d.customers)} with a visit target`} tone={d.overdue > 0 ? 'warn' : 'good'} />
            <Kpi label="Never visited" value={fmtInt(d.neverVisited)} hint="no completed visit on record" tone={d.neverVisited > 0 ? 'warn' : 'good'} />
          </div>
          <table>
            <thead><tr><th>Territory</th><th>Region</th><th className="num">Customers</th><th className="num">Visits</th><th className="num">Planned calls made</th><th className="num">Overdue</th><th className="num">Never visited</th></tr></thead>
            <tbody>
              {d.territories.map((t) => (
                <tr key={t.territoryId ?? 'none'}>
                  <td>{t.territory}</td><td>{t.region ?? '—'}</td>
                  <td className="num">{fmtInt(t.customers)}</td>
                  <td className="num">{fmtInt(t.completed)} of {fmtInt(Math.round(t.expected))}</td>
                  <td className="num">{t.attainmentPct != null ? fmtPct(t.attainmentPct) : '—'}</td>
                  <td className="num">{fmtInt(t.overdue)}</td><td className="num">{fmtInt(t.neverVisited)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {d.worst.length > 0 && (
            <>
              <h3>Most overdue customers</h3>
              <table>
                <thead><tr><th>Customer</th><th>Territory</th><th>Segment</th><th className="num">Target a month</th><th>Last visit</th></tr></thead>
                <tbody>
                  {d.worst.map((w) => (
                    <tr key={w.customerId}>
                      <td>{w.name} <span className="muted small">{w.type}</span></td><td>{w.territory}</td><td>{w.segment}</td>
                      <td className="num">{w.targetPerMonth}</td>
                      <td>{w.lastVisitAt ? `${fmtDate(w.lastVisitAt)} (${w.daysSince} days ago)` : 'Never'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <p className="muted small">A customer is overdue when the time since the last completed visit is longer than their target frequency asks for. Visits above the target do not make up for missed ones elsewhere.</p>
        </>
      ))}
    </Section>
  )
}

function TagList({ onChanged }: { onChanged: () => void }) {
  const { api } = useApp()
  const list = useAsync(() => api.get<UntaggedList>('/rtm/untagged', { take: 15 }), [])
  const [error, setError] = useState<string>()
  const tag = async (id: string, channel: SalesChannel, outletClass: OutletClass) => {
    setError(undefined)
    try { await api.put(`/rtm/customers/${id}`, { channel, outletClass }); list.reload(); onChanged() } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  if (list.error) return <ErrorBox message={list.error} onRetry={list.reload} />
  if (!list.data) return <Loading />
  if (list.data.items.length === 0) return <p className="muted">Every outlet in your area is tagged.</p>
  return (
    <>
      {error && <ErrorBox message={error} />}
      <table>
        <thead><tr><th>Outlet</th><th>Channel</th><th>Kind of outlet</th></tr></thead>
        <tbody>
          {list.data.items.map((c) => (
            <tr key={c.id}>
              <td>{c.name} <span className="muted small">{[c.type, c.city].filter(Boolean).join(' · ')}</span></td>
              <td>
                <select aria-label={`Channel for ${c.name}`} value={c.channel} onChange={(e) => tag(c.id, e.target.value as SalesChannel, c.outletClass)}>
                  {channels.map((x) => <option key={x} value={x}>{channelLabel[x]}</option>)}
                </select>
              </td>
              <td>
                <select aria-label={`Kind of outlet for ${c.name}`} value={c.outletClass} onChange={(e) => tag(c.id, c.channel, e.target.value as OutletClass)}>
                  {classes.map((x) => <option key={x} value={x}>{classLabel[x]}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {list.data.total > list.data.items.length && <p className="muted small">{fmtInt(list.data.total - list.data.items.length)} more to tag. Each change is saved straight away.</p>}
    </>
  )
}

function MarketSize({ onSaved }: { onSaved: () => void }) {
  const { api } = useApp()
  const saved = useAsync(() => api.get<UniverseRow[]>('/rtm/universe'), [])
  const [rows, setRows] = useState<UniverseRow[]>()
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()
  const current = rows ?? saved.data
  if (saved.error) return <ErrorBox message={saved.error} onRetry={saved.reload} />
  if (!current) return <Loading />
  const edit = (i: number, patch: Partial<UniverseRow>) => setRows(current.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const save = async () => {
    setMsg(undefined)
    try {
      await api.put('/rtm/universe', current.map((r) => ({ ...r, region: r.region?.trim() || null, source: r.source?.trim() || null })))
      setRows(undefined); saved.reload(); onSaved(); setMsg({ ok: true, text: 'Market size saved.' })
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }) }
  }
  return (
    <Section title="Market size (estimated outlets)">
      <p className="muted small">How many outlets of each kind exist. Leave the region empty for a national figure, or give a region to compare it with that region. Coverage is measured against these numbers, so record where each one comes from.</p>
      {msg && (msg.ok ? <p className="ok" role="status">{msg.text}</p> : <ErrorBox message={msg.text} />)}
      <table>
        <thead><tr><th>Kind of outlet</th><th>Region (optional)</th><th className="num">Outlets</th><th>Source</th><th /></tr></thead>
        <tbody>
          {current.map((r, i) => (
            <tr key={i}>
              <td><select aria-label="Kind of outlet" value={r.outletClass} onChange={(e) => edit(i, { outletClass: e.target.value as OutletClass })}>{classes.filter((c) => c !== 'Unclassified').map((c) => <option key={c} value={c}>{classLabel[c]}</option>)}</select></td>
              <td><input aria-label="Region" value={r.region ?? ''} placeholder="National" onChange={(e) => edit(i, { region: e.target.value })} /></td>
              <td className="num"><input type="number" min={0} aria-label="Outlets" style={{ width: '6rem' }} value={r.outlets} onChange={(e) => edit(i, { outlets: Number(e.target.value) })} /></td>
              <td><input aria-label="Source" value={r.source ?? ''} placeholder="e.g. FDA register 2025" onChange={(e) => edit(i, { source: e.target.value })} /></td>
              <td><button className="link" onClick={() => setRows(current.filter((_, j) => j !== i))}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <button onClick={() => setRows([...current, { region: null, outletClass: 'IndependentPharmacy', outlets: 0, source: null }])}>Add a row</button>{' '}
        <button className="primary" onClick={save}>Save market size</button>
      </p>
    </Section>
  )
}
