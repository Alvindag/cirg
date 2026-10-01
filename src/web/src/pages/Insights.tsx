import { Fragment, useState } from 'react'
import type { BalanceResult, Governance, OpportunityResult, Product, ScoreDetail, ScoreRow, Territory } from '../api/types'
import { Badge, Empty, ErrorBox, Kpi, Loading, Section } from '../components/ui'
import { useApp } from '../context'
import { fmtInt } from '../lib/format'
import { isAdmin, isManager } from '../lib/roles'
import { useAsync } from '../lib/useAsync'

type Tab = 'scores' | 'opportunities' | 'territories' | 'governance'

const canSeeGovernance = (role: string) => ['Admin', 'NationalSalesManager', 'Executive'].includes(role)

export function Insights() {
  const { me } = useApp()
  const [tab, setTab] = useState<Tab>('scores')
  const tabs: [Tab, string][] = [['scores', 'Customer scores'], ['opportunities', 'Opportunities']]
  if (isManager(me.role)) tabs.push(['territories', 'Territory balance'])
  if (canSeeGovernance(me.role)) tabs.push(['governance', 'AI governance'])
  return (
    <>
      <div className="page-head"><h1>Insights</h1></div>
      <p className="muted note">Scores, opportunities and territory suggestions are calculated by explicit rules from visits, call outcomes, samples and customer data. Every figure shows the factors behind it.</p>
      <div className="tabs" role="tablist">
        {tabs.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {tab === 'scores' && <Scores />}
      {tab === 'opportunities' && <Opportunities />}
      {tab === 'territories' && <TerritoryBalance />}
      {tab === 'governance' && <GovernancePanel />}
    </>
  )
}

const tone = (status: string) => (status === 'Thriving' || status === 'Healthy' ? 'good' : status === 'At risk' ? 'bad' : 'warn')

function Scores() {
  const { api } = useApp()
  const [order, setOrder] = useState('attention')
  const [open, setOpen] = useState<string>()
  const list = useAsync(() => api.get<ScoreRow[]>('/ai/customers/scores', { order, take: 50 }), [order])
  const detail = useAsync(() => (open ? api.get<ScoreDetail>(`/ai/customers/${open}/score`) : Promise.resolve(undefined)), [open])

  return (
    <div className="grid-2">
      <Section title="Customers" actions={
        <select aria-label="Order" value={order} onChange={(e) => setOrder(e.target.value)}>
          <option value="attention">Most neglected first</option>
          <option value="score">Highest score first</option>
        </select>
      }>
        {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
        {list.loading && !list.data && <Loading />}
        {list.data && (list.data.length === 0 ? <Empty>No customers to score yet.</Empty> : (
          <table>
            <thead><tr><th>Customer</th><th className="num">Potential</th><th className="num">Engagement</th><th className="num">Score</th><th>Status</th></tr></thead>
            <tbody>
              {list.data.map((s) => (
                <tr key={s.customerId} className={open === s.customerId ? 'selected' : ''}>
                  <td><button className="link-row" onClick={() => setOpen(s.customerId)}>{s.name}</button>{s.suggestedSegment && <div className="muted small">Data suggests segment {s.suggestedSegment}</div>}</td>
                  <td className="num">{s.potential}</td><td className="num">{s.engagement}</td><td className="num"><strong>{s.overall}</strong></td>
                  <td><Badge tone={tone(s.status)}>{s.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </Section>
      <Section title={detail.data ? `Why: ${detail.data.name}` : 'Why this score'}>
        {!open && <Empty>Select a customer to see the factors behind the score.</Empty>}
        {open && detail.loading && !detail.data && <Loading />}
        {detail.error && <ErrorBox message={detail.error} />}
        {detail.data && <FactorTable factors={detail.data.factors} />}
      </Section>
    </div>
  )
}

function FactorTable({ factors }: { factors: { name: string; points: number; max: number; explanation: string }[] }) {
  return (
    <table aria-label="Score factors">
      <thead><tr><th>Factor</th><th className="num">Points</th><th>Explanation</th></tr></thead>
      <tbody>{factors.map((f) => <tr key={f.name}><td>{f.name}</td><td className="num">{f.points} / {f.max}</td><td>{f.explanation}</td></tr>)}</tbody>
    </table>
  )
}

function Opportunities() {
  const { api, me } = useApp()
  const products = useAsync(() => (isManager(me.role) ? api.get<Product[]>('/admin/products') : Promise.resolve([] as Product[])), [me.role])
  const [productId, setProductId] = useState('')
  const chosen = productId || products.data?.[0]?.id || ''
  const result = useAsync(() => (chosen ? api.get<OpportunityResult>('/ai/opportunities', { productId: chosen, take: 25 }) : Promise.resolve(undefined)), [chosen])
  const [open, setOpen] = useState<string>()

  if (!isManager(me.role)) return <Empty>Choose a product from the products list available to managers.</Empty>
  return (
    <Section title="Where to focus a product" actions={
      <select aria-label="Product" value={chosen} onChange={(e) => { setProductId(e.target.value); setOpen(undefined) }}>
        {(products.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    }>
      {result.error && <ErrorBox message={result.error} onRetry={result.reload} />}
      {result.loading && !result.data && <Loading />}
      {result.data && (
        <>
          <p className="muted small">{result.data.note}</p>
          <table>
            <thead><tr><th>Customer</th><th>Likelihood to engage</th></tr></thead>
            <tbody>
              {result.data.items.map((o) => (
                <Fragment key={o.customerId}>
                  <tr>
                    <td><button className="link-row" onClick={() => setOpen(open === o.customerId ? undefined : o.customerId)}>{o.name}</button></td>
                    <td><Badge tone={o.likelihood === 'High' ? 'good' : o.likelihood === 'Medium' ? 'warn' : 'muted'}>{o.likelihood}</Badge></td>
                  </tr>
                  {open === o.customerId && <tr><td colSpan={2}><FactorTable factors={o.factors} /></td></tr>}
                </Fragment>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Section>
  )
}

function TerritoryBalance() {
  const { api, me } = useApp()
  const admin = isAdmin(me.role)
  const balance = useAsync(() => api.get<BalanceResult>('/ai/territories/balance'), [])
  const territories = useAsync(() => api.get<Territory[]>('/admin/territories'), [])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const name = new Map((territories.data ?? []).map((t) => [t.id, t.name]))

  async function apply() {
    const moves = (balance.data?.suggestions ?? []).filter((s) => picked.has(s.customerId)).map((s) => ({ customerId: s.customerId, toTerritoryId: s.toTerritoryId }))
    if (moves.length === 0) return
    if (!window.confirm(`Move ${moves.length} customer(s) to their suggested territories?`)) return
    setError(undefined)
    try {
      await api.post('/ai/territories/moves/apply', { moves })
      setMessage(`${moves.length} customer(s) moved.`)
      setPicked(new Set())
      balance.reload()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <>
      {message && <div className="notice" role="status">{message}</div>}
      {error && <ErrorBox message={error} />}
      <Section title="Workload by territory">
        {balance.error && <ErrorBox message={balance.error} onRetry={balance.reload} />}
        {balance.loading && !balance.data && <Loading />}
        {balance.data && (
          <table>
            <thead><tr><th>Territory</th><th className="num">Customers</th><th className="num">Calls needed / month</th><th className="num">Reps</th><th className="num">Capacity</th><th className="num">Load</th><th>Status</th></tr></thead>
            <tbody>
              {balance.data.territories.map((t) => (
                <tr key={t.territoryId}>
                  <td>{t.name}</td><td className="num">{fmtInt(t.customers)}</td><td className="num">{fmtInt(t.requiredCallsPerMonth)}</td><td className="num">{t.reps}</td>
                  <td className="num">{fmtInt(t.capacityPerMonth)}</td><td className="num">{Math.round(t.loadRatio * 100)}%</td>
                  <td><Badge tone={t.status === 'Balanced' ? 'good' : t.status === 'Underloaded' ? 'warn' : 'bad'}>{t.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
      <Section title="Suggested moves" actions={admin && <button className="primary" disabled={picked.size === 0} onClick={apply}>Apply {picked.size || ''} selected</button>}>
        {balance.data && (balance.data.suggestions.length === 0 ? <Empty>No moves suggested: workloads are within range.</Empty> : (
          <table>
            <thead><tr>{admin && <th />}<th>Customer</th><th>From</th><th>To</th><th className="num">Calls / month</th><th className="num">Distance now → new</th></tr></thead>
            <tbody>
              {balance.data.suggestions.map((s) => (
                <tr key={s.customerId}>
                  {admin && <td><input type="checkbox" aria-label={`Select ${s.customerName}`} checked={picked.has(s.customerId)} onChange={() => toggle(s.customerId)} /></td>}
                  <td>{s.customerName}</td><td>{name.get(s.fromTerritoryId) ?? '—'}</td><td>{name.get(s.toTerritoryId) ?? '—'}</td>
                  <td className="num">{s.callsPerMonth}</td><td className="num">{s.distanceToCurrentKm} km → {s.distanceToNewKm} km</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
        <p className="muted small">Suggestions only: customers move to the nearest territory with spare capacity, and nothing changes until an administrator applies them. Capacity assumes about 160 calls per rep per month.</p>
      </Section>
    </>
  )
}

function GovernancePanel() {
  const { api, me } = useApp()
  const g = useAsync(() => api.get<Governance>('/ai/governance'), [])
  const [error, setError] = useState<string>()
  async function setEnabled(enabled: boolean) {
    setError(undefined)
    try { await api.post('/ai/settings', { enabled }); g.reload() } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  const d = g.data
  return (
    <>
      {g.error && <ErrorBox message={g.error} onRetry={g.reload} />}
      {error && <ErrorBox message={error} />}
      {g.loading && !d && <Loading />}
      {d && (
        <>
          <div className="kpis">
            <Kpi label="AI provider" value={d.configuration.providerEnabled ? d.configuration.provider : 'Off'} tone={d.configuration.providerEnabled ? 'good' : 'warn'} hint={d.configuration.providerEnabled ? `${d.configuration.chatDeployment} · ${d.configuration.transcriptionDeployment}` : 'not configured on the server'} />
            <Kpi label="Your organisation" value={d.configuration.tenantOptIn ? 'Opted in' : 'Not opted in'} tone={d.configuration.tenantOptIn ? 'good' : 'warn'} hint="generative features are off until an administrator opts in" />
            <Kpi label="Daily limit per user" value={fmtInt(d.configuration.dailyLimitPerUser)} hint="AI requests" />
          </div>
          {isAdmin(me.role) && (
            <p>
              {d.configuration.tenantOptIn
                ? <button onClick={() => setEnabled(false)}>Switch generative AI off</button>
                : <button className="primary" onClick={() => window.confirm('Allow voice-to-text and visit summaries for your organisation? Reps will be able to send redacted visit notes to Azure OpenAI.') && setEnabled(true)}>Switch generative AI on</button>}
            </p>
          )}
          <Section title="Model-use register (last 30 days)">
            {d.usageLast30Days.length === 0 ? <Empty>No AI requests yet.</Empty> : (
              <table>
                <thead><tr><th>Feature</th><th className="num">Requests</th><th className="num">Failed</th><th className="num">Accepted</th><th className="num">Rejected</th><th className="num">Awaiting review</th><th className="num">Tokens in / out</th><th className="num">Avg latency</th></tr></thead>
                <tbody>{d.usageLast30Days.map((u) => (
                  <tr key={u.feature}>
                    <td>{u.feature}</td><td className="num">{u.requests}</td><td className="num">{u.failed}</td><td className="num">{u.accepted}</td><td className="num">{u.rejected}</td><td className="num">{u.pendingReview}</td>
                    <td className="num">{fmtInt(u.inputTokens)} / {fmtInt(u.outputTokens)}</td><td className="num">{u.averageLatencyMs} ms</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </Section>
          <Section title="Safeguards in place">
            <ul>{d.safeguards.map((s) => <li key={s}>{s}</li>)}</ul>
          </Section>
        </>
      )}
    </>
  )
}
