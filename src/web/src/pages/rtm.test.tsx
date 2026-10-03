import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { CoverageDashboard, RtmDashboard, UniverseRow, UntaggedList } from '../api/types'
import { fakeApi, me, renderApp } from '../test/helpers'
import { Rtm } from './Rtm'

const dash = (over: Partial<RtmDashboard> = {}): RtmDashboard => ({
  currency: 'GHS', hasUniverse: true, universeScoped: false, universeTotal: 1000, mapped: 300, reached: 120, mappedPct: 30, reachedPct: 12,
  revenue: 50000, top20Share: 84.5,
  classes: [
    { outletClass: 'IndependentPharmacy', universe: 800, mapped: 200, reached: 80, revenue: 30000 },
    { outletClass: 'TeachingHospital', universe: 5, mapped: 5, reached: 5, revenue: 15000 },
    { outletClass: 'Unclassified', universe: null, mapped: 95, reached: 35, revenue: 5000 },
  ],
  channels: [{ channel: 'VanSales', customers: 200, reached: 90, revenue: 30000 }, { channel: 'Unassigned', customers: 100, reached: 30, revenue: 20000 }],
  regions: [{ region: 'Greater Accra', universe: 400, mapped: 200, reached: 90, revenue: 40000 }, { region: 'Upper East', universe: 50, mapped: 2, reached: 0, revenue: 0 }],
  tagging: { total: 300, noChannel: 100, noClass: 95, noRegion: 12 }, ...over,
})
const untagged: UntaggedList = { total: 3, items: [{ id: 'c1', name: 'Quiet Pharmacy', type: 'Pharmacy', city: 'Accra', channel: 'Unassigned', outletClass: 'Unclassified' }] }
const noUniverse: UniverseRow[] = []
const coverage: CoverageDashboard = {
  days: 90, customers: 40, expectedVisits: 120, completedVisits: 66, attainmentPct: 55, overdue: 9, neverVisited: 3,
  territories: [{ territoryId: 't1', territory: 'Tamale', region: 'Northern', customers: 12, expected: 40, completed: 12, attainmentPct: 30, overdue: 6, neverVisited: 2 }],
  worst: [{ customerId: 'c9', name: 'Savelugu Pharmacy', type: 'Pharmacy', segment: 'A', territory: 'Tamale', targetPerMonth: 4, lastVisitAt: null, daysSince: null }],
}

describe('Route to market', () => {
  it('shows the market, what is mapped and reached, channels, regions and what is left to tag', async () => {
    const api = fakeApi({ 'GET /dashboards/rtm': () => dash(), 'GET /rtm/untagged': () => untagged, 'GET /rtm/universe': () => noUniverse, 'GET /dashboards/coverage': () => coverage })
    renderApp(<Rtm />, api, me('NationalSalesManager'))
    expect(await screen.findByText('Coverage by kind of outlet')).toBeInTheDocument()
    expect(screen.getByText('12.0% of the market')).toBeInTheDocument()
    expect(screen.getByText(/of GHS 50,000 revenue/)).toBeInTheDocument()

    const row = screen.getByText('Independent pharmacy').closest('tr')!
    expect(within(row).getByText('800')).toBeInTheDocument()
    expect(within(row).getByText('10.0%')).toBeInTheDocument() // 80 of 800
    expect(within(row).getByRole('img')).toHaveAccessibleName('80 reached, 200 mapped, of 800')

    expect(screen.getByText('Van sales')).toBeInTheDocument()
    expect(screen.getByText('Not tagged yet')).toBeInTheDocument()
    const upper = screen.getByText('Upper East').closest('tr')!
    expect(within(upper).getAllByText('50')).toHaveLength(2) // market 50 and a gap of 50: none reached
    expect(screen.getByText(/100 of 300 outlets have no channel, 95 have no kind of outlet, and 12 have no region/)).toBeInTheDocument()
    expect(screen.getByText(/not on individual sales people/)).toBeInTheDocument()
  })

  it('says so when no market size is set instead of showing misleading percentages', async () => {
    const api = fakeApi({ 'GET /dashboards/rtm': () => dash({ hasUniverse: false, universeTotal: null, mappedPct: null, reachedPct: null, top20Share: null }), 'GET /rtm/untagged': () => untagged, 'GET /rtm/universe': () => noUniverse, 'GET /dashboards/coverage': () => coverage })
    renderApp(<Rtm />, api, me('Admin'))
    expect(await screen.findByText('Not set')).toBeInTheDocument()
    expect(screen.getByText('set it below to see coverage')).toBeInTheDocument()
    expect(screen.getByText('needs at least 5 buyers')).toBeInTheDocument()
  })

  it('an area manager sees their own area, can tag outlets, and cannot edit the national market size', async () => {
    const api = fakeApi({
      'GET /dashboards/rtm': () => dash({ universeScoped: true, universeTotal: null, hasUniverse: false, mappedPct: null, reachedPct: null }),
      'GET /rtm/untagged': () => untagged,
      'PUT /rtm/customers/c1': () => undefined,
    })
    const user = userEvent.setup()
    renderApp(<Rtm />, api, me('AreaManager'))
    expect(await screen.findByText('compared nationally, not for your area')).toBeInTheDocument()
    expect(screen.queryByText('Market size (estimated outlets)')).not.toBeInTheDocument()

    await user.selectOptions(await screen.findByLabelText('Channel for Quiet Pharmacy'), 'VanSales')
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/rtm/customers/c1', { channel: 'VanSales', outletClass: 'Unclassified' }))
    await user.selectOptions(screen.getByLabelText('Kind of outlet for Quiet Pharmacy'), 'OtcShop')
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/rtm/customers/c1', { channel: 'Unassigned', outletClass: 'OtcShop' })) // the list is the server's, which this fake does not change
  })

  it('lets a national leader enter the market size and refreshes the numbers after saving', async () => {
    let saved: UniverseRow[] | undefined
    let calls = 0
    const api = fakeApi({
      'GET /dashboards/rtm': () => { calls++; return dash() },
      'GET /rtm/untagged': () => ({ total: 0, items: [] }),
      'GET /rtm/universe': () => saved ?? noUniverse,
      'PUT /rtm/universe': (_q, body) => { saved = body as UniverseRow[]; return undefined },
    })
    const user = userEvent.setup()
    renderApp(<Rtm />, api, me('NationalSalesManager'))
    await screen.findByText('Market size (estimated outlets)')
    await user.click(screen.getByRole('button', { name: 'Add a row' }))
    await user.selectOptions(screen.getByLabelText('Kind of outlet'), 'OtcShop')
    const outlets = screen.getByLabelText('Outlets')
    await user.clear(outlets); await user.type(outlets, '12000')
    await user.type(screen.getByLabelText('Source'), 'FDA register')
    const before = calls
    await user.click(screen.getByRole('button', { name: 'Save market size' }))

    expect(await screen.findByText('Market size saved.')).toBeInTheDocument()
    expect(saved).toEqual([{ region: null, outletClass: 'OtcShop', outlets: 12000, source: 'FDA register' }])
    expect(calls).toBeGreaterThan(before)
  })

  it('shows the server\'s reason when the market size is refused', async () => {
    const api = fakeApi({
      'GET /dashboards/rtm': () => dash(), 'GET /rtm/untagged': () => ({ total: 0, items: [] }), 'GET /rtm/universe': () => noUniverse, 'GET /dashboards/coverage': () => coverage,
      'PUT /rtm/universe': () => { throw new Error('Each region and kind of outlet may appear once.') },
    })
    const user = userEvent.setup()
    renderApp(<Rtm />, api, me('Admin'))
    await screen.findByText('Market size (estimated outlets)')
    await user.click(screen.getByRole('button', { name: 'Add a row' }))
    await user.click(screen.getByRole('button', { name: 'Save market size' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('may appear once')
  })

  it('shows whether the planned visits are being made, by territory, and the most overdue customers', async () => {
    const api = fakeApi({ 'GET /dashboards/rtm': () => dash(), 'GET /rtm/untagged': () => untagged, 'GET /rtm/universe': () => noUniverse, 'GET /dashboards/coverage': () => coverage })
    renderApp(<Rtm />, api, me('NationalSalesManager'))
    expect(await screen.findByText('Visit coverage, last 90 days')).toBeInTheDocument()
    expect(screen.getByText('55.0%')).toBeInTheDocument()
    expect(screen.getByText('66 visits against 120 expected')).toBeInTheDocument()
    const row = screen.getAllByText('Tamale', { selector: 'td' })[0].closest('tr')!
    expect(within(row).getByText('12 of 40')).toBeInTheDocument()
    expect(within(row).getByText('30.0%')).toBeInTheDocument()
    const worst = screen.getByText('Savelugu Pharmacy').closest('tr')!
    expect(within(worst).getByText('Never')).toBeInTheDocument()
  })

  it('says so when no customer has a visit target yet', async () => {
    const api = fakeApi({ 'GET /dashboards/rtm': () => dash(), 'GET /rtm/untagged': () => untagged, 'GET /rtm/universe': () => noUniverse, 'GET /dashboards/coverage': () => ({ ...coverage, customers: 0, territories: [], worst: [] }) })
    renderApp(<Rtm />, api, me('NationalSalesManager'))
    expect(await screen.findByText(/No customers have a visit target yet/)).toBeInTheDocument()
  })
})
