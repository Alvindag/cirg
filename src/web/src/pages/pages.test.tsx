import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { Customers } from './Customers'
import { Overview } from './Overview'
import { Samples } from './Samples'
import { Team } from './Team'
import { fakeApi, me, renderApp, users } from '../test/helpers'

const sales = {
  callsCompleted: 42, plannedVisits: 50, planAdherencePct: 84, coveragePct: 61.5,
  byRep: [{ repId: 'rep-1', calls: 42, uniqueCustomers: 30, outsideGeofence: 3 }],
}

const overviewHandlers = {
  'GET /dashboards/sales': () => sales,
  'GET /dashboards/trend': () => [{ date: '2026-10-01', calls: 4 }],
  'GET /dashboards/products': () => [{ productId: 'p1', name: 'Amoxil', calls: 9, sampleUnits: 40 }],
  'GET /dashboards/revenue': () => ({ currency: 'GHS', total: 0, previousTotal: 0, growthPct: null, units: 0, customersBuying: 0, unlinkedAmount: 0, granularity: 'month', trend: [], topCustomers: [], byProduct: [], byTerritory: [] }),
  'GET /gps/last-known': () => [{ repId: 'rep-1', recordedAt: '2026-10-01T09:00:00Z', latitude: 5.6037, longitude: -0.187 }],
  'GET /admin/users': () => users,
}

describe('Overview', () => {
  it('shows the headline numbers, rep names and positions', async () => {
    const api = fakeApi(overviewHandlers)
    renderApp(<Overview />, api, me('RegionalManager'))
    expect(await screen.findByText('42', { selector: '.kpi-value' })).toBeInTheDocument() // calls completed
    expect(screen.getByText('84.0%')).toBeInTheDocument()
    expect(screen.getByText('61.5%')).toBeInTheDocument()
    expect(await screen.findAllByText('Kofi Rep')).not.toHaveLength(0) // id resolved to a name
    expect(screen.getByRole('link', { name: /5\.6037, -0\.1870/ })).toHaveAttribute('href', expect.stringContaining('openstreetmap.org'))
    expect(await screen.findByText(/No ERP sales data yet/)).toBeInTheDocument()
  })

  it('asks the API for the chosen period', async () => {
    const api = fakeApi(overviewHandlers)
    renderApp(<Overview />, api, me('RegionalManager'))
    await screen.findByText('42', { selector: '.kpi-value' })
    await userEvent.selectOptions(screen.getByLabelText('Period'), '7')
    await waitFor(() => {
      const calls = api.get.mock.calls.filter((c) => c[0] === '/dashboards/sales')
      const last = calls[calls.length - 1][1] as { from: string; to: string }
      expect((new Date(last.to).getTime() - new Date(last.from).getTime()) / 86_400_000).toBe(7)
    })
  })

  it('does not call manager-only endpoints for non-managers and shows API errors with a retry', async () => {
    const api = fakeApi({ ...overviewHandlers, 'GET /dashboards/sales': () => { throw new Error('Server exploded') } })
    renderApp(<Overview />, api, me('Marketing'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Server exploded')
    expect(api.get.mock.calls.some((c) => c[0] === '/admin/users' || c[0] === '/gps/last-known')).toBe(false)
    expect(screen.queryByText('Last known positions today')).not.toBeInTheDocument()
  })
})

describe('App access', () => {
  it('sends reps to the mobile app', () => {
    renderApp(<App />, fakeApi({}), me('Rep'))
    expect(screen.getByText(/Sales representatives work in the DAS Engage mobile app/)).toBeInTheDocument()
  })

  it('shows manager pages in the navigation only to managers', async () => {
    renderApp(<App />, fakeApi(overviewHandlers), me('AreaManager'))
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    for (const l of ['Overview', 'Customers', 'Team', 'Samples', 'Audit']) expect(within(nav).getByText(l)).toBeInTheDocument()
    expect(within(nav).queryByText('ERP')).not.toBeInTheDocument() // administrators and executives only
  })

  it('hides team, samples and audit from marketing', async () => {
    renderApp(<App />, fakeApi(overviewHandlers), me('Marketing'))
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    expect(within(nav).getByText('Customers')).toBeInTheDocument()
    for (const l of ['Team', 'Samples', 'Audit']) expect(within(nav).queryByText(l)).not.toBeInTheDocument()
  })
})

const customersPage = { total: 1, page: 1, pageSize: 25, items: [{ id: 'c1', type: 'Doctor', name: 'Dr Ama Boateng', specialty: 'Cardiology', segment: 'A', territoryId: 'terr-1', phone: null, email: null, city: 'Accra', targetVisitsPerMonth: 4 }] }

describe('Customers', () => {
  const base = { 'GET /customers': () => customersPage, 'GET /admin/territories': () => [{ id: 'terr-1', name: 'Accra Central', region: null, district: null }] }

  it('lists customers and passes filters to the API', async () => {
    const api = fakeApi(base)
    renderApp(<Customers />, api, me('AreaManager'))
    expect(await screen.findByText('Dr Ama Boateng')).toBeInTheDocument()
    expect(screen.getByText('Accra Central')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'Doctor')
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/customers', expect.objectContaining({ type: 'Doctor', page: 1 })))
  })

  it('only offers import to roles that may import', async () => {
    renderApp(<Customers />, fakeApi(base), me('Marketing'))
    await screen.findByText('Dr Ama Boateng')
    expect(screen.queryByText('Import CSV')).not.toBeInTheDocument()
  })

  it('checks a CSV first and only saves after confirmation', async () => {
    const result = (dryRun: boolean) => ({
      dryRun, total: 3, created: 2, updated: 0, skipped: 1, errors: 0,
      rows: [{ row: 3, status: 'duplicate', message: 'Duplicate of an existing customer.', customerId: null, matchedCustomerId: 'x' }],
    })
    const api = fakeApi({ ...base })
    api.postText.mockImplementation(async (_p: string, _t: string, q?: Record<string, unknown>) => result(q?.dryRun === true))
    renderApp(<Customers />, api, me('Admin'))
    await userEvent.click(await screen.findByText('Import CSV'))

    const file = new File(['type,name\nDoctor,A\n'], 'customers.csv', { type: 'text/csv' })
    await userEvent.upload(screen.getByLabelText('CSV file'), file)
    await userEvent.click(screen.getByText('Check file'))
    expect(await screen.findByText(/2 new, 0 updated, 1 duplicates skipped/)).toBeInTheDocument()
    expect(screen.getByText('Duplicate of an existing customer.')).toBeInTheDocument()
    expect(api.postText).toHaveBeenCalledTimes(1)
    expect(api.postText.mock.calls[0][2]).toMatchObject({ dryRun: true, onDuplicate: 'skip' })

    await userEvent.click(screen.getByText('Import 2 customers'))
    await waitFor(() => expect(api.postText).toHaveBeenCalledTimes(2))
    expect(api.postText.mock.calls[1][2]).toMatchObject({ dryRun: false })
  })

  it('shows a structural error from the server', async () => {
    const api = fakeApi(base)
    api.postText.mockRejectedValue(new Error("Missing required column 'name'."))
    renderApp(<Customers />, api, me('Admin'))
    await userEvent.click(await screen.findByText('Import CSV'))
    await userEvent.upload(screen.getByLabelText('CSV file'), new File(['type\nDoctor'], 'bad.csv'))
    await userEvent.click(screen.getByText('Check file'))
    expect(await screen.findByText(/Missing required column/)).toBeInTheDocument()
  })
})

describe('Team', () => {
  const handlers = { 'GET /admin/users': () => users, 'GET /admin/territories': () => [{ id: 'terr-1', name: 'Accra Central', region: 'Greater Accra', district: null }] }

  it('lets admins add people and territories, but not other managers', async () => {
    const admin = renderApp(<Team />, fakeApi(handlers), me('Admin'))
    expect(await screen.findByRole('form', { name: 'Add user' })).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'Add territory' })).toBeInTheDocument()
    admin.unmount()
    renderApp(<Team />, fakeApi(handlers), me('AreaManager'))
    await screen.findByText('Kofi Rep')
    expect(screen.queryByRole('form', { name: 'Add user' })).not.toBeInTheDocument()
    expect(screen.queryByText('Deactivate')).not.toBeInTheDocument()
  })

  it('shows reporting lines and territory names', async () => {
    renderApp(<Team />, fakeApi(handlers), me('AreaManager'))
    const row = (await screen.findByText('Kofi Rep')).closest('tr')!
    expect(within(row).getByText('Ama Area')).toBeInTheDocument()
    expect(within(row).getByText('Accra Central')).toBeInTheDocument()
  })

  it('creates a user with null manager/territory when none is chosen', async () => {
    const api = fakeApi({ ...handlers, 'POST /admin/users': () => ({}) })
    renderApp(<Team />, api, me('Admin'))
    const form = await screen.findByRole('form', { name: 'Add user' })
    await userEvent.type(within(form).getByLabelText('Entra object id'), 'oid-123')
    await userEvent.type(within(form).getByLabelText('Full name'), 'New Person')
    await userEvent.type(within(form).getByLabelText('Email'), 'new@x.test')
    await userEvent.click(within(form).getByText('Add'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/users', expect.objectContaining({ externalId: 'oid-123', managerId: null, territoryId: null, role: 'Rep' })))
  })

  it('shows the server reason when a change is refused', async () => {
    const api = fakeApi({ ...handlers, 'POST /admin/users/rep-1/deactivate': () => { throw new Error('nope') } })
    api.post.mockRejectedValue(new Error('User has 1 direct report(s); pass reassignTo.'))
    renderApp(<Team />, api, me('Admin'))
    const row = (await screen.findByText('Kofi Rep')).closest('tr')!
    await userEvent.click(within(row).getByText('Deactivate'))
    expect(await screen.findByRole('alert')).toHaveTextContent('direct report')
  })
})

const request = (over = {}) => ({
  id: 'r1', repId: 'rep-1', productId: 'p1', quantity: 50, approvedQuantity: null, status: 'Pending', notes: 'launch', decisionNote: null, createdAt: '2026-10-01T08:00:00Z', ...over,
})

describe('Samples', () => {
  const base = (requests: unknown[]) => ({
    'GET /samples/requests': () => requests,
    'GET /admin/users': () => users,
    'GET /admin/products': () => [{ id: 'p1', name: 'Amoxil', code: null }],
  })

  it('lets an approver approve a smaller quantity', async () => {
    const api = fakeApi({ ...base([request()]), 'POST /samples/requests/r1/approve': () => ({}) })
    vi.spyOn(window, 'prompt').mockReturnValue('30')
    renderApp(<Samples />, api, me('AreaManager'))
    expect(await screen.findByText('Kofi Rep')).toBeInTheDocument()
    expect(screen.getByText('Amoxil')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Approve'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/samples/requests/r1/approve', { quantity: 30, note: null }))
    expect(await screen.findByText('Request approved.')).toBeInTheDocument()
  })

  it('refuses an approval above the requested quantity without calling the API', async () => {
    const api = fakeApi(base([request()]))
    vi.spyOn(window, 'prompt').mockReturnValue('80')
    renderApp(<Samples />, api, me('AreaManager'))
    await userEvent.click(await screen.findByText('Approve'))
    expect(await screen.findByRole('alert')).toHaveTextContent('1 to 50')
    expect(api.post).not.toHaveBeenCalled()
  })

  it('requires a reason to reject', async () => {
    const api = fakeApi({ ...base([request()]), 'POST /samples/requests/r1/reject': () => ({}) })
    const prompt = vi.spyOn(window, 'prompt').mockReturnValueOnce('  ')
    renderApp(<Samples />, api, me('AreaManager'))
    await userEvent.click(await screen.findByText('Reject'))
    expect(api.post).not.toHaveBeenCalled()
    prompt.mockReturnValueOnce('Budget used up')
    await userEvent.click(screen.getByText('Reject'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/samples/requests/r1/reject', { note: 'Budget used up' }))
  })

  it('does not let people decide their own requests, executives approve nothing, and only stock controllers issue', async () => {
    const own = renderApp(<Samples />, fakeApi(base([request({ repId: 'u-me-00000000' })])), me('AreaManager'))
    await screen.findByText('Amoxil')
    expect(screen.queryByText('Approve')).not.toBeInTheDocument()
    own.unmount()

    const exec = renderApp(<Samples />, fakeApi(base([request()])), me('Executive'))
    await screen.findByText('Amoxil')
    expect(screen.queryByText('Approve')).not.toBeInTheDocument()
    exec.unmount()

    const approved = base([request({ status: 'Approved', approvedQuantity: 30 })])
    const regional = renderApp(<Samples />, fakeApi(approved), me('RegionalManager'))
    await screen.findByText('30 of 50')
    expect(screen.queryByText('Issue stock')).not.toBeInTheDocument()
    regional.unmount()

    const api = fakeApi({ ...approved, 'POST /samples/requests/r1/fulfil': () => ({ allocations: [{ batchId: 'b1', quantity: 30 }] }) })
    renderApp(<Samples />, api, me('Admin'))
    await userEvent.click(await screen.findByText('Issue stock'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/samples/requests/r1/fulfil', { allowPartial: false }))
    expect(await screen.findByText(/Issued 30 units from 1 batch/)).toBeInTheDocument()
  })

  it('warns about stock that must be recovered', async () => {
    const stock = [
      { holderId: 'rep-1', location: 'Rep', batchId: 'b1', productId: 'p1', batchNumber: 'B-OLD', expiryDate: '2026-01-01', daysToExpiry: -200, status: 'Active', quantity: 12, expired: true, expiringSoon: false, actionRequired: true },
      { holderId: null, location: 'Warehouse', batchId: 'b2', productId: 'p1', batchNumber: 'B-NEW', expiryDate: '2027-06-01', daysToExpiry: 250, status: 'Active', quantity: 900, expired: false, expiringSoon: false, actionRequired: false },
    ]
    renderApp(<Samples />, fakeApi({ ...base([]), 'GET /samples/reports/stock': () => stock }), me('Admin'))
    await userEvent.click(await screen.findByRole('tab', { name: 'Stock' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('12 units')
    expect(alert).toHaveTextContent('B-OLD (Kofi Rep)')
    expect(screen.getByText('Expired')).toBeInTheDocument()
  })

  it('shows the compliance picture and downloads the CSV with the same period', async () => {
    const report = {
      period: { from: 'a', to: 'b' }, distributions: { count: 10, units: 55, withoutSignature: 2, withoutSignatureUnits: 8 },
      byRep: [{ repId: 'rep-1', count: 10, units: 55, withoutSignature: 2 }],
      stockHeld: { expiredUnits: 0, expiringWithin90DaysUnits: 14, quarantinedOrRecalledUnits: 0 }, writeOffs: { count: 1, units: 3 },
      reconciliation: { ok: true, negativeBalances: [], ledgerDistributionUnits: 55, loggedDistributionUnits: 55 },
    }
    const api = fakeApi({ ...base([]), 'GET /samples/reports/compliance': () => report })
    renderApp(<Samples />, api, me('Admin'))
    await userEvent.click(await screen.findByRole('tab', { name: 'Compliance' }))
    expect(await screen.findByText('Balanced')).toBeInTheDocument()
    expect(screen.getByText('Without signature', { selector: '.kpi-label' })).toBeInTheDocument()
    expect(screen.getByText('Kofi Rep')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Download distributions (CSV)'))
    await waitFor(() => expect(api.download).toHaveBeenCalledWith('/samples/reports/distributions', expect.objectContaining({ format: 'csv' }), expect.stringMatching(/\.csv$/)))
  })

  it('is closed to people who cannot read sample reports', () => {
    renderApp(<Samples />, fakeApi({}), me('Marketing'))
    expect(screen.getByRole('alert')).toHaveTextContent('available to managers')
  })
})
