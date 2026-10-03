import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Insights } from './Insights'
import { fakeApi, me, renderApp } from '../test/helpers'

const factors = [
  { name: 'Potential', points: 85, max: 100, explanation: 'A segment, 1 product interest(s).' },
  { name: 'Recency', points: 0, max: 35, explanation: 'Last visited 120 day(s) ago.' },
]
const scores = [
  { customerId: 'c1', name: 'Dr Ama Boateng', potential: 90, engagement: 12, overall: 43, status: 'At risk', suggestedSegment: 'B' },
  { customerId: 'c2', name: 'Ernest Chemists', potential: 60, engagement: 80, overall: 72, status: 'Healthy', suggestedSegment: null },
]
const base = {
  'GET /ai/customers/scores': () => scores,
  'GET /ai/customers/c1/score': () => ({ ...scores[0], factors }),
  'GET /admin/products': () => [{ id: 'p1', name: 'Amoxil', code: null }, { id: 'p2', name: 'Cardiostat', code: null }],
  'GET /admin/territories': () => [{ id: 't1', name: 'Accra', region: null, district: null }, { id: 't2', name: 'Tema', region: null, district: null }],
}

describe('Insights tabs', () => {
  it('shows only the tabs a role may use', async () => {
    for (const [role, expected, absent] of [
      ['Marketing', ['Customer scores', 'Opportunities'], ['Territory balance', 'AI governance']],
      ['AreaManager', ['Customer scores', 'Opportunities', 'Territory balance'], ['AI governance']],
      ['Executive', ['Customer scores', 'Opportunities', 'Territory balance', 'AI governance'], []],
    ] as const) {
      const { unmount } = renderApp(<Insights />, fakeApi(base), me(role))
      for (const t of expected) expect(await screen.findByRole('tab', { name: t })).toBeInTheDocument()
      for (const t of absent) expect(screen.queryByRole('tab', { name: t })).not.toBeInTheDocument()
      unmount()
    }
  })
})

describe('Customer scores', () => {
  it('lists customers, flags risk, and explains a score on demand', async () => {
    const api = fakeApi(base)
    renderApp(<Insights />, api, me('AreaManager'))
    expect(await screen.findByText('Dr Ama Boateng')).toBeInTheDocument()
    expect(screen.getByText('At risk')).toBeInTheDocument()
    expect(screen.getByText('Data suggests segment B')).toBeInTheDocument()
    expect(screen.getByText(/Select a customer to see the factors/)).toBeInTheDocument()

    await userEvent.click(screen.getByText('Dr Ama Boateng'))
    const table = await screen.findByRole('table', { name: 'Score factors' })
    expect(within(table).getByText('Last visited 120 day(s) ago.')).toBeInTheDocument()
    expect(within(table).getByText('85 / 100')).toBeInTheDocument()
  })

  it('re-orders by score', async () => {
    const api = fakeApi(base)
    renderApp(<Insights />, api, me('AreaManager'))
    await screen.findByText('Dr Ama Boateng')
    await userEvent.selectOptions(screen.getByLabelText('Order'), 'score')
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/ai/customers/scores', expect.objectContaining({ order: 'score' })))
  })
})

describe('Opportunities', () => {
  const opp = { product: 'Amoxil', note: 'Heuristic ranking from visits. It is not a sales forecast.', items: [
    { customerId: 'c1', name: 'Dr Ama Boateng', likelihood: 'High', probability: 0.8, factors },
    { customerId: 'c2', name: 'Ernest Chemists', likelihood: 'Low', probability: 0.2, factors },
  ] }

  it('ranks customers for a product, with the honesty note and the reasons', async () => {
    const api = fakeApi({ ...base, 'GET /ai/opportunities': () => opp })
    renderApp(<Insights />, api, me('AreaManager'))
    await userEvent.click(await screen.findByRole('tab', { name: 'Opportunities' }))
    expect(await screen.findByText(/not a sales forecast/)).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/ai/opportunities', expect.objectContaining({ productId: 'p1' }))
    expect(screen.getByText('High')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Ernest Chemists'))
    expect(await screen.findByText('Last visited 120 day(s) ago.')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Product'), 'p2')
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/ai/opportunities', expect.objectContaining({ productId: 'p2' })))
  })
})

describe('Territory balance', () => {
  const balance = {
    territories: [
      { territoryId: 't1', name: 'Accra', customers: 50, requiredCallsPerMonth: 200, reps: 1, capacityPerMonth: 160, loadRatio: 1.25, status: 'Overloaded' },
      { territoryId: 't2', name: 'Tema', customers: 5, requiredCallsPerMonth: 20, reps: 1, capacityPerMonth: 160, loadRatio: 0.13, status: 'Underloaded' },
    ],
    suggestions: [{ customerId: 'c9', customerName: 'Osu Pharmacy', fromTerritoryId: 't1', toTerritoryId: 't2', callsPerMonth: 4, distanceToCurrentKm: 6.2, distanceToNewKm: 1.1 }],
  }

  it('shows load and lets an admin apply only the moves they select', async () => {
    const api = fakeApi({ ...base, 'GET /ai/territories/balance': () => balance, 'POST /ai/territories/moves/apply': () => ({ moved: 1 }) })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderApp(<Insights />, api, me('Admin'))
    await userEvent.click(await screen.findByRole('tab', { name: 'Territory balance' }))
    expect(await screen.findByText('125%')).toBeInTheDocument()
    expect(screen.getByText('Overloaded')).toBeInTheDocument()
    expect(screen.getByText('6.2 km → 1.1 km')).toBeInTheDocument()

    const apply = screen.getByRole('button', { name: /Apply/ })
    expect(apply).toBeDisabled()
    await userEvent.click(screen.getByLabelText('Select Osu Pharmacy'))
    await userEvent.click(apply)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/ai/territories/moves/apply', { moves: [{ customerId: 'c9', toTerritoryId: 't2' }] }))
    expect(await screen.findByText('1 customer(s) moved.')).toBeInTheDocument()
  })

  it('is read-only for managers who are not admins, and does nothing if the admin cancels', async () => {
    const api = fakeApi({ ...base, 'GET /ai/territories/balance': () => balance, 'POST /ai/territories/moves/apply': () => ({}) })
    const ro = renderApp(<Insights />, api, me('AreaManager'))
    await userEvent.click(await screen.findByRole('tab', { name: 'Territory balance' }))
    await screen.findByText('Osu Pharmacy')
    expect(screen.queryByLabelText('Select Osu Pharmacy')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Apply/ })).not.toBeInTheDocument()
    ro.unmount()

    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderApp(<Insights />, api, me('Admin'))
    await userEvent.click(await screen.findByRole('tab', { name: 'Territory balance' }))
    await userEvent.click(await screen.findByLabelText('Select Osu Pharmacy'))
    await userEvent.click(screen.getByRole('button', { name: /Apply/ }))
    expect(api.post).not.toHaveBeenCalled()
  })
})

describe('AI governance', () => {
  const gov = (optIn: boolean) => ({
    configuration: { providerEnabled: true, provider: 'azure', tenantOptIn: optIn, chatDeployment: 'gpt-4o-mini', transcriptionDeployment: 'whisper', dailyLimitPerUser: 40, maxInputChars: 6000 },
    usageLast30Days: [{ feature: 'VisitSummary', requests: 20, failed: 1, inputTokens: 40000, outputTokens: 8000, averageLatencyMs: 1800, accepted: 12, rejected: 3, pendingReview: 4 }],
    topUsers: [], safeguards: ['Every output is a draft.', 'Only a hash of each prompt is stored.'],
  })

  it('shows the register and safeguards to executives, without switches', async () => {
    renderApp(<Insights />, fakeApi({ ...base, 'GET /ai/governance': () => gov(true) }), me('Executive'))
    await userEvent.click(await screen.findByRole('tab', { name: 'AI governance' }))
    expect(await screen.findByText('VisitSummary')).toBeInTheDocument()
    expect(screen.getByText('40,000 / 8,000')).toBeInTheDocument()
    expect(screen.getByText('Every output is a draft.')).toBeInTheDocument()
    expect(screen.getByText('Opted in')).toBeInTheDocument()
    expect(screen.queryByText(/Switch generative AI/)).not.toBeInTheDocument()
  })

  it('lets an administrator opt in only after confirming, and shows the refusal reason otherwise', async () => {
    const api = fakeApi({ ...base, 'GET /ai/governance': () => gov(false), 'POST /ai/settings': () => ({ enabled: true }) })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    renderApp(<Insights />, api, me('Admin'))
    await userEvent.click(await screen.findByRole('tab', { name: 'AI governance' }))
    expect(await screen.findByText('Not opted in')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Switch generative AI on'))
    expect(api.post).not.toHaveBeenCalled()
    await userEvent.click(screen.getByText('Switch generative AI on'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/ai/settings', { enabled: true }))
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(String(confirm.mock.calls[0][0])).toMatch(/redacted visit notes/)
  })
})
