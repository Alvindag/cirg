import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { Erp } from './Erp'
import { Overview } from './Overview'
import { fakeApi, me, renderApp, users } from '../test/helpers'

const conn = { provider: 'rest', baseUrl: 'https://erp-gateway.example.com', secretName: 'ERP_TOKEN', enabled: true, outboundEnabled: true, pullEnabled: false, pullIntervalMinutes: 60, currency: 'GHS', lastPullAt: '2026-10-01T08:00:00Z', lastError: null }
const base = {
  'GET /erp/connection': () => conn,
  'GET /erp/keys': () => [{ id: 'k1', name: 'SAP gateway', prefix: 'ab12cd34', createdAt: '2026-09-01T08:00:00Z', lastUsedAt: null, revokedAt: null }],
  'GET /erp/runs': () => [{ id: 'r1', entity: 'sales', source: 'push', startedAt: '2026-10-01T08:00:00Z', created: 120, updated: 3, skipped: 0, errors: 2, message: null }],
  'GET /admin/users': () => users,
  'GET /admin/products': () => [{ id: 'p1', name: 'Amoxil', code: 'AMX500' }],
}

describe('access', () => {
  it('shows the ERP area to administrators and executives only', async () => {
    renderApp(<App />, fakeApi({ ...base, 'GET /dashboards/sales': () => ({ callsCompleted: 1, plannedVisits: 1, planAdherencePct: 1, coveragePct: 1, byRep: [] }), 'GET /dashboards/trend': () => [], 'GET /dashboards/products': () => [], 'GET /dashboards/revenue': () => ({ currency: 'GHS', total: 0, previousTotal: 0, growthPct: null, units: 0, customersBuying: 0, unlinkedAmount: 0, granularity: 'month', trend: [], topCustomers: [], byProduct: [], byTerritory: [] }), 'GET /gps/last-known': () => [] }), me('Executive'))
    expect(within(await screen.findByRole('navigation', { name: 'Main' })).getByText('ERP')).toBeInTheDocument()
  })

  it('refuses everyone else', () => {
    renderApp(<Erp />, fakeApi({}), me('AreaManager'))
    expect(screen.getByRole('alert')).toHaveTextContent('administrators and executives')
  })
})

describe('Connection', () => {
  it('lets an administrator save the gateway settings', async () => {
    const api = fakeApi({ ...base, 'PUT /erp/connection': () => ({ saved: true }) })
    renderApp(<Erp />, api, me('Admin'))
    const addr = await screen.findByLabelText('Gateway address')
    await userEvent.clear(addr)
    await userEvent.type(addr, 'https://new-gateway.example.com')
    await userEvent.click(screen.getByLabelText(/Pull data on a schedule/))
    await userEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/erp/connection', expect.objectContaining({ baseUrl: 'https://new-gateway.example.com', pullEnabled: true, provider: 'rest', currency: 'GHS' })))
    expect(await screen.findByText('Connection saved.')).toBeInTheDocument()
  })

  it('shows the reason when the server refuses an address', async () => {
    const api = fakeApi(base)
    api.put.mockRejectedValue(new Error('That address is not allowed.'))
    renderApp(<Erp />, api, me('Admin'))
    await userEvent.click(await screen.findByText('Save'))
    expect(await screen.findByRole('alert')).toHaveTextContent('not allowed')
  })

  it('tests the connection and reports the answer', async () => {
    const api = fakeApi({ ...base, 'POST /erp/connection/test': () => ({ ok: false, error: 'The ERP gateway answered 502.' }) })
    renderApp(<Erp />, api, me('Admin'))
    await userEvent.click(await screen.findByText('Test connection'))
    expect(await screen.findByText(/Test failed: The ERP gateway answered 502/)).toBeInTheDocument()
  })

  it('is read-only for executives', async () => {
    renderApp(<Erp />, fakeApi(base), me('Executive'))
    expect(await screen.findByLabelText('Gateway address')).toBeDisabled()
    expect(screen.queryByText('Save')).not.toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Create key' })).not.toBeInTheDocument()
    expect(screen.queryByText('Revoke')).not.toBeInTheDocument()
    expect(screen.getByText('120')).toBeInTheDocument() // the run log is visible
  })

  it('shows a new key once, with a warning, and never lists the secret', async () => {
    const api = fakeApi({ ...base, 'POST /erp/keys': () => ({ id: 'k2', name: 'Middleware', prefix: 'ffff0000', key: 'dek_ffff0000_SECRETSECRETSECRETSECRET', note: '' }) })
    renderApp(<Erp />, api, me('Admin'))
    const form = await screen.findByRole('form', { name: 'Create key' })
    await userEvent.type(within(form).getByLabelText('Key name'), 'Middleware')
    await userEvent.click(within(form).getByText('Create key'))
    expect(await screen.findByTestId('new-key')).toHaveTextContent('dek_ffff0000_SECRETSECRETSECRETSECRET')
    expect(screen.getByText(/cannot be shown again/)).toBeInTheDocument()
    await userEvent.click(screen.getByText('I have copied it'))
    expect(screen.queryByTestId('new-key')).not.toBeInTheDocument()
    expect(screen.getByText('dek_ab12cd34…')).toBeInTheDocument() // listed by prefix only
  })

  it('revokes a key only after confirmation', async () => {
    const api = fakeApi({ ...base, 'DELETE /erp/keys/k1': () => undefined })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    renderApp(<Erp />, api, me('Admin'))
    await userEvent.click(await screen.findByText('Revoke'))
    expect(api.del).not.toHaveBeenCalled()
    await userEvent.click(screen.getByText('Revoke'))
    await waitFor(() => expect(api.del).toHaveBeenCalledWith('/erp/keys/k1'))
    expect(confirm).toHaveBeenCalledTimes(2)
  })
})

describe('Import', () => {
  const unmatched = { customers: [{ accountCode: 'ACC-7', lines: 12, amount: 4500 }], items: [{ itemCode: 'ZZ-1', lines: 3 }] }
  const handlers = { ...base, 'GET /erp/unmatched': () => unmatched, 'GET /customers': () => ({ total: 1, page: 1, pageSize: 8, items: [{ id: 'c1', name: 'Osu Pharmacy', city: 'Accra', type: 'Pharmacy', segment: 'B' }] }) }

  it('uploads a CSV for the chosen kind of data and shows what was refused', async () => {
    const api = fakeApi(handlers)
    api.postText.mockResolvedValue({ entity: 'sales', source: 'csv', created: 10, updated: 1, skipped: 2, errors: 1, items: [{ key: 'row 4', status: 'error', message: "'date' is not a date" }, { key: 'S1', status: 'created', message: null }] })
    renderApp(<Erp />, api, me('Admin'))
    await userEvent.click(await screen.findByRole('tab', { name: 'Import' }))
    await userEvent.selectOptions(await screen.findByLabelText('Kind of data'), 'sales')
    await userEvent.upload(screen.getByLabelText('CSV file'), new File(['external_id,date\nS1,2026-01-01'], 'sales.csv', { type: 'text/csv' }))
    await userEvent.click(screen.getByRole('button', { name: 'Import' }))
    expect(await screen.findByText(/10 new, 1 updated, 2 skipped, 1 with errors/)).toBeInTheDocument()
    expect(screen.getByText("'date' is not a date")).toBeInTheDocument()
    expect(screen.queryByText('S1')).not.toBeInTheDocument() // only problems are listed
    expect(api.postText).toHaveBeenCalledWith('/erp/import/sales', expect.stringContaining('external_id'), undefined)
  })

  it('passes the create-missing choice only for customer accounts', async () => {
    const api = fakeApi(handlers)
    api.postText.mockResolvedValue({ entity: 'customers', source: 'csv', created: 0, updated: 0, skipped: 0, errors: 0, items: [] })
    renderApp(<Erp />, api, me('Admin'))
    await userEvent.click(await screen.findByRole('tab', { name: 'Import' }))
    await userEvent.selectOptions(await screen.findByLabelText('Kind of data'), 'customers')
    await userEvent.click(screen.getByLabelText(/Create customers that cannot be matched/))
    await userEvent.upload(screen.getByLabelText('CSV file'), new File(['account_code,name\nC1,X'], 'c.csv'))
    await userEvent.click(screen.getByRole('button', { name: 'Import' }))
    await waitFor(() => expect(api.postText).toHaveBeenCalledWith('/erp/import/customers', expect.any(String), { createMissing: true }))
  })

  it('links an invoiced account to a customer by hand', async () => {
    const api = fakeApi({ ...handlers, 'POST /erp/customers/link': () => undefined })
    renderApp(<Erp />, api, me('Admin'))
    await userEvent.click(await screen.findByRole('tab', { name: 'Import' }))
    expect(await screen.findByRole('cell', { name: 'ACC-7' })).toBeInTheDocument()
    expect(screen.getByText('ZZ-1')).toBeInTheDocument()
    const form = screen.getByRole('form', { name: 'Link account' })
    expect(within(form).getByText('Link')).toBeDisabled()
    await userEvent.type(within(form).getByLabelText('Find customer'), 'osu')
    await userEvent.selectOptions(await within(form).findByLabelText('Customer'), 'c1')
    await userEvent.click(within(form).getByText('Link'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/erp/customers/link', { customerId: 'c1', accountCode: 'ACC-7' }))
  })

  it('does not offer uploads to executives', async () => {
    renderApp(<Erp />, fakeApi(handlers), me('Executive'))
    await userEvent.click(await screen.findByRole('tab', { name: 'Import' }))
    expect(await screen.findByText('Only administrators can import data.')).toBeInTheDocument()
    expect(screen.queryByLabelText('CSV file')).not.toBeInTheDocument()
  })
})

describe('Outbox', () => {
  const box = { counts: [{ status: 'Pending', n: 3 }, { status: 'Sent', n: 40 }, { status: 'DeadLetter', n: 1 }], items: [
    { id: 'm1', type: 'sample.issue', status: 'Sent', attempts: 1, createdAt: '2026-10-01T08:00:00Z', nextAttemptAt: '2026-10-01T08:00:00Z', lastError: null, externalRef: 'STO-991' },
    { id: 'm2', type: 'sample.adjustment', status: 'DeadLetter', attempts: 1, createdAt: '2026-10-01T08:05:00Z', nextAttemptAt: '2026-10-01T08:05:00Z', lastError: 'ERP answered 400: unknown item', externalRef: null },
  ] }

  it('shows delivery health, highlights failures and lets an administrator retry them', async () => {
    const api = fakeApi({ ...base, 'GET /erp/outbox': () => box, 'POST /erp/outbox/m2/retry': () => ({}) })
    renderApp(<Erp />, api, me('Admin'))
    await userEvent.click(await screen.findByRole('tab', { name: 'Outbox' }))
    expect(await screen.findByText('STO-991')).toBeInTheDocument()
    expect(screen.getByText('ERP answered 400: unknown item')).toBeInTheDocument()
    expect(screen.getByText('Failed (needs attention)')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Retry'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/erp/outbox/m2/retry'))
  })

  it('sends now and reports the outcome; executives cannot', async () => {
    const api = fakeApi({ ...base, 'GET /erp/outbox': () => box, 'POST /erp/outbox/dispatch': () => ({ sent: 2, retrying: 1, deadLettered: 0 }) })
    const admin = renderApp(<Erp />, api, me('Admin'))
    await userEvent.click(await screen.findByRole('tab', { name: 'Outbox' }))
    await userEvent.click(await screen.findByText('Send now'))
    expect(await screen.findByText('2 sent, 1 to retry, 0 failed.')).toBeInTheDocument()
    admin.unmount()
    renderApp(<Erp />, api, me('Executive'))
    await userEvent.click(await screen.findByRole('tab', { name: 'Outbox' }))
    await screen.findByText('STO-991')
    expect(screen.queryByText('Send now')).not.toBeInTheDocument()
    expect(screen.queryByText('Retry')).not.toBeInTheDocument()
  })
})

describe('Reconciliation', () => {
  it('flags differences and says when the ERP has not reported yet', async () => {
    const rec = { balanced: false, snapshotCount: 3, rows: [
      { itemCode: 'AMX500', product: 'Amoxil', batchNumber: 'B-2', das: 200, erp: 190, difference: -10, status: 'Differs' },
      { itemCode: 'AMX500', product: 'Amoxil', batchNumber: 'B-1', das: 500, erp: 500, difference: 0, status: 'Match' },
    ] }
    const a = renderApp(<Erp />, fakeApi({ ...base, 'GET /erp/reconciliation/stock': () => rec }), me('Admin'))
    await userEvent.click(await screen.findByRole('tab', { name: 'Reconciliation' }))
    expect(await screen.findByText(/Stock differs from the ERP/)).toBeInTheDocument()
    expect(screen.getByText('Differs')).toBeInTheDocument()
    expect(screen.getByText('-10')).toBeInTheDocument()
    a.unmount()

    renderApp(<Erp />, fakeApi({ ...base, 'GET /erp/reconciliation/stock': () => ({ balanced: true, snapshotCount: 0, rows: [] }) }), me('Admin'))
    await userEvent.click(await screen.findByRole('tab', { name: 'Reconciliation' }))
    expect(await screen.findByText(/has not reported stock levels yet/)).toBeInTheDocument()
  })
})

describe('Procurement', () => {
  const suggestion = (over = {}) => ({ productId: 'p1', itemCode: 'AMX500', name: 'Amoxil', reorderLevel: 300, available: 100, onOrder: 0, monthlyUsage: 60, monthsOfCover: 1.7, belowReorderLevel: true, suggestedQuantity: 500, ...over })
  const req = (over = {}) => ({ id: 'q1', productId: 'p1', quantity: 400, neededBy: null, note: null, status: 'Draft', requestedBy: 'u-me-00000000', erpReference: null, receivedQuantity: 0, decisionNote: null, createdAt: '2026-10-01T08:00:00Z', ...over })
  const handlers = (reqs: unknown[], suggestions: unknown[] = [suggestion()]) => ({ ...base, 'GET /erp/procurement/suggestions': () => suggestions, 'GET /erp/procurement/requisitions': () => reqs })

  it('turns a low-stock suggestion into a requisition for the suggested quantity', async () => {
    const api = fakeApi({ ...handlers([]), 'POST /erp/procurement/requisitions': () => ({}) })
    vi.spyOn(window, 'prompt').mockReturnValue('450')
    renderApp(<Erp />, api, me('Admin'))
    await userEvent.click(await screen.findByRole('tab', { name: 'Procurement' }))
    await userEvent.click(await screen.findByText('Order 500…'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/erp/procurement/requisitions', { productId: 'p1', quantity: 450 }))
    expect(await screen.findByText(/Someone else must approve it/)).toBeInTheDocument()
  })

  it('does not let you approve your own requisition, but does let someone else', async () => {
    const own = renderApp(<Erp />, fakeApi(handlers([req()])), me('Admin'))
    await userEvent.click(await screen.findByRole('tab', { name: 'Procurement' }))
    expect(await screen.findByText('Waiting for a second approver')).toBeInTheDocument()
    expect(screen.queryByText('Approve')).not.toBeInTheDocument()
    own.unmount()

    const api = fakeApi({ ...handlers([req({ requestedBy: 'someone-else' })]), 'POST /erp/procurement/requisitions/q1/approve': () => ({}) })
    renderApp(<Erp />, api, me('NationalSalesManager'))
    await userEvent.click(await screen.findByRole('tab', { name: 'Procurement' }))
    await userEvent.click(await screen.findByText('Approve'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/erp/procurement/requisitions/q1/approve'))
  })

  it('shows partial deliveries and offers the ERP reference only where it is missing', async () => {
    renderApp(<Erp />, fakeApi(handlers([req({ status: 'Approved', receivedQuantity: 150, erpReference: 'PR-1' }), req({ id: 'q2', status: 'Approved' })], [suggestion({ belowReorderLevel: false, suggestedQuantity: 0 })])), me('Admin'))
    await userEvent.click(await screen.findByRole('tab', { name: 'Procurement' }))
    expect(await screen.findByText('150 of 400')).toBeInTheDocument()
    expect(screen.getAllByText('Add ERP reference')).toHaveLength(1)
    expect(screen.getByText('OK')).toBeInTheDocument()
  })

  it('shows executives the position without any actions', async () => {
    renderApp(<Erp />, fakeApi(handlers([req({ requestedBy: 'x' })])), me('Executive'))
    await userEvent.click(await screen.findByRole('tab', { name: 'Procurement' }))
    expect(await screen.findByText('Below level')).toBeInTheDocument()
    expect(screen.queryByText('Approve')).not.toBeInTheDocument()
    expect(screen.queryByText(/Order/)).not.toBeInTheDocument()
  })
})

describe('Revenue on the overview', () => {
  const sales = { callsCompleted: 5, plannedVisits: 6, planAdherencePct: 83, coveragePct: 40, byRep: [] }
  const handlers = (rev: unknown) => ({ 'GET /dashboards/sales': () => sales, 'GET /dashboards/trend': () => [], 'GET /dashboards/products': () => [], 'GET /gps/last-known': () => [], 'GET /admin/users': () => users, 'GET /dashboards/revenue': () => rev })

  it('shows revenue, growth and what is not linked yet', async () => {
    const rev = { currency: 'GHS', total: 125000, previousTotal: 100000, growthPct: 25, units: 4200, customersBuying: 18, unlinkedAmount: 3000, granularity: 'month',
      trend: [{ period: '2026-09', amount: 60000, units: 2000 }, { period: '2026-10', amount: 65000, units: 2200 }], topCustomers: [{ customerId: 'c1', name: 'Osu Pharmacy', amount: 20000 }], byProduct: [], byTerritory: [] }
    renderApp(<Overview />, fakeApi(handlers(rev)), me('Executive'))
    expect(await screen.findByText('GHS 125,000')).toBeInTheDocument()
    expect(screen.getByText('+25%')).toBeInTheDocument()
    expect(screen.getByText(/GHS 3,000 on accounts not linked yet/)).toBeInTheDocument()
    expect(screen.getByText('Osu Pharmacy')).toBeInTheDocument()
  })

  it('shows a decline in red text terms and tolerates a server without revenue support', async () => {
    const down = { currency: 'GHS', total: 80, previousTotal: 100, growthPct: -20, units: 1, customersBuying: 1, unlinkedAmount: 0, granularity: 'day', trend: [{ period: '2026-10-01', amount: 80, units: 1 }], topCustomers: [], byProduct: [], byTerritory: [] }
    const a = renderApp(<Overview />, fakeApi(handlers(down)), me('Executive'))
    expect(await screen.findByText('-20%')).toBeInTheDocument()
    a.unmount()
    const broken = fakeApi({ ...handlers(null), 'GET /dashboards/revenue': () => { throw new Error('nope') } })
    renderApp(<Overview />, broken, me('Executive'))
    expect(await screen.findByText(/No ERP sales data yet/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
