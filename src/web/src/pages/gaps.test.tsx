import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Layout } from '../components/Layout'
import { Customers } from './Customers'
import { Samples } from './Samples'
import { Team } from './Team'
import { fakeApi, me, renderApp, users } from '../test/helpers'
import { Route, Routes } from 'react-router-dom'

afterEach(() => vi.restoreAllMocks())

const stockRow = (over = {}) => ({
  holderId: 'rep-1', location: 'Rep', batchId: 'b1', productId: 'p1', batchNumber: 'B-1', expiryDate: '2027-06-01', daysToExpiry: 250, status: 'Active',
  quantity: 12, expired: false, expiringSoon: false, actionRequired: false, ...over,
})
const products = [{ id: 'p1', name: 'Amoxil', code: null, sampleLimitPerCustomer: null, sampleLimitDays: null }]
const base = {
  'GET /samples/requests': () => [],
  'GET /admin/users': () => users,
  'GET /admin/products': () => products,
}
const prompts = (...answers: (string | null)[]) => {
  const spy = vi.spyOn(window, 'prompt')
  answers.forEach((a) => spy.mockReturnValueOnce(a))
  return spy
}

describe('Samples: stock corrections', () => {
  const open = async (api: ReturnType<typeof fakeApi>, role: Parameters<typeof me>[0] = 'Admin') => {
    renderApp(<Samples />, api, me(role))
    await userEvent.click(await screen.findByRole('tab', { name: 'Stock' }))
  }

  it('writes stock off with a reason', async () => {
    const api = fakeApi({ ...base, 'GET /samples/reports/stock': () => [stockRow()], 'POST /samples/adjustments': () => ({}) })
    prompts('-3', 'Damaged in transit')
    await open(api)
    await userEvent.click(await screen.findByText('Adjust or write off'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/samples/adjustments', { batchId: 'b1', holderId: 'rep-1', delta: -3, reason: 'Damaged in transit', type: 'WriteOff' }))
    expect(await screen.findByText('Stock changed by -3.')).toBeInTheDocument()
  })

  it('adds stock back as an adjustment, and does not call the API for an invalid change', async () => {
    const api = fakeApi({ ...base, 'GET /samples/reports/stock': () => [stockRow()], 'POST /samples/adjustments': () => ({}) })
    prompts('4', 'Count correction')
    await open(api)
    await userEvent.click(await screen.findByText('Adjust or write off'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/samples/adjustments', expect.objectContaining({ delta: 4, type: 'Adjustment' })))
    api.post.mockClear()

    prompts('-50') // more than the 12 held
    await userEvent.click(await screen.findByText('Adjust or write off'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Only 12 units are held.')
    prompts('0')
    await userEvent.click(screen.getByText('Adjust or write off'))
    expect(await screen.findByRole('alert')).toHaveTextContent('other than zero')
    prompts('-1', '  ') // no reason
    await userEvent.click(screen.getByText('Adjust or write off'))
    expect(api.post).not.toHaveBeenCalled()
  })

  it('returns a rep\'s stock to the warehouse, and only for rep-held rows', async () => {
    const rows = [stockRow(), stockRow({ holderId: null, location: 'Warehouse', batchNumber: 'B-W', quantity: 500 })]
    const api = fakeApi({ ...base, 'GET /samples/reports/stock': () => rows, 'POST /samples/returns': () => ({}) })
    prompts('5')
    await open(api)
    expect(await screen.findAllByText('Adjust or write off')).toHaveLength(2)
    expect(screen.getAllByText('Return to warehouse')).toHaveLength(1)
    await userEvent.click(screen.getByText('Return to warehouse'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/samples/returns', { repId: 'rep-1', batchId: 'b1', quantity: 5, note: null }))
    expect(await screen.findByText('5 units returned to the warehouse.')).toBeInTheDocument()
  })

  it('shows the server reason when a correction is refused, and offers nothing to non-controllers', async () => {
    const api = fakeApi({ ...base, 'GET /samples/reports/stock': () => [stockRow()], 'POST /samples/adjustments': () => { throw new Error('Not enough stock for this adjustment.') } })
    prompts('-3', 'Lost')
    await open(api)
    await userEvent.click(await screen.findByText('Adjust or write off'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Not enough stock')

    const manager = fakeApi({ ...base, 'GET /samples/reports/stock': () => [stockRow()] })
    document.body.innerHTML = ''
    await open(manager, 'AreaManager')
    await screen.findByText('B-1')
    expect(screen.queryByText('Adjust or write off')).not.toBeInTheDocument()
  })
})

describe('Samples: request history', () => {
  it('can show every request, or one rep\'s, by passing the filters to the API', async () => {
    const api = fakeApi({ ...base, 'GET /samples/requests': () => [] })
    renderApp(<Samples />, api, me('AreaManager'))
    await screen.findByText(/No pending requests/)
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'All')
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/samples/requests', { status: undefined, repId: undefined }))
    await userEvent.selectOptions(screen.getByLabelText('Rep'), 'rep-1')
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/samples/requests', { status: undefined, repId: 'rep-1' }))
    expect(await screen.findByText('No requests for this rep.')).toBeInTheDocument()
    expect(within(screen.getByLabelText('Rep')).queryByText('Ama Area')).not.toBeInTheDocument() // only reps are offered
  })
})

describe('Samples: recalls and limits', () => {
  const batch = { id: 'b1', productId: 'p1', batchNumber: 'B-1', expiryDate: '2027-06-01', status: 'Active', statusReason: null }
  const open = async (api: ReturnType<typeof fakeApi>) => {
    renderApp(<Samples />, api, me('Admin'))
    await userEvent.click(await screen.findByRole('tab', { name: 'Batches' }))
  }

  it('tells the controller how many reps were notified of a recall', async () => {
    const api = fakeApi({ ...base, 'GET /samples/batches': () => [batch], 'POST /samples/batches/b1/status': () => ({ status: 'Recalled', notified: 2 }) })
    prompts('Contamination')
    await open(api)
    await userEvent.click(await screen.findByText('Recall'))
    expect(await screen.findByText('Batch B-1 is now recalled. 2 reps were notified.')).toBeInTheDocument()
  })

  it('sets and clears a per-customer limit', async () => {
    const api = fakeApi({ ...base, 'GET /samples/batches': () => [batch], 'PUT /admin/products/p1': () => ({}) })
    prompts('10', '30')
    await open(api)
    await userEvent.click(await screen.findByText('Set limit for Amoxil'))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/products/p1', expect.objectContaining({ name: 'Amoxil', sampleLimitPerCustomer: 10, sampleLimitDays: 30 })))
    expect(await screen.findByText('Amoxil: at most 10 per customer every 30 days.')).toBeInTheDocument()
    expect(screen.getByText('10 per customer per 30 days')).toBeInTheDocument()

    prompts('')
    await userEvent.click(screen.getByText('Set limit for Amoxil'))
    await waitFor(() => expect(api.put).toHaveBeenLastCalledWith('/admin/products/p1', expect.objectContaining({ sampleLimitPerCustomer: null, sampleLimitDays: null })))
    expect(await screen.findByText('Amoxil: no limit.')).toBeInTheDocument()
  })

  it('rejects a limit that is not a whole number without calling the API', async () => {
    const api = fakeApi({ ...base, 'GET /samples/batches': () => [batch] })
    prompts('2.5')
    await open(api)
    await userEvent.click(await screen.findByText('Set limit for Amoxil'))
    expect(await screen.findByRole('alert')).toHaveTextContent('whole number')
    expect(api.put).not.toHaveBeenCalled()
  })
})

describe('Notifications', () => {
  const notice = { id: 'n1', kind: 'batch.recalled', title: 'Recall: Amoxil batch B-1', body: 'You hold 10 unit(s).', createdAt: '2026-10-02T08:00:00Z', readAt: null }
  const shell = (api: ReturnType<typeof fakeApi>) =>
    renderApp(<Routes><Route element={<Layout />}><Route path="/" element={<p>page</p>} /></Route></Routes>, api, me('Admin'))

  it('shows unread notices and marks them read', async () => {
    const api = fakeApi({ 'GET /notifications': () => [notice], 'POST /notifications/n1/read': () => ({}) })
    shell(api)
    const bell = await screen.findByRole('button', { name: 'Notifications, 1 unread' })
    await userEvent.click(bell)
    expect(await screen.findByText('Recall: Amoxil batch B-1')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Mark read'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/notifications/n1/read'))
    expect(await screen.findByText('Nothing new.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Notifications, 0 unread' })).toBeInTheDocument()
  })

  it('marks everything read, and keeps working when the notices cannot be loaded', async () => {
    const api = fakeApi({ 'GET /notifications': () => [notice, { ...notice, id: 'n2' }], 'POST /notifications/read-all': () => ({ marked: 2 }) })
    const first = shell(api)
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }))
    await userEvent.click(screen.getByText('Mark all read'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/notifications/read-all'))
    first.unmount()

    shell(fakeApi({ 'GET /notifications': () => { throw new Error('down') } }))
    expect(await screen.findByRole('button', { name: 'Notifications, 0 unread' })).toBeInTheDocument()
  })
})

describe('Customers: editing', () => {
  const row = { id: 'c1', type: 'Doctor', name: 'Dr Ama Boateng', specialty: 'Cardiology', segment: 'A', territoryId: 'terr-1', phone: null, email: null, city: 'Accra', targetVisitsPerMonth: 4 }
  const full = { ...row, parentCustomerId: 'parent-1', address: '1 High St', latitude: 5.6, longitude: -0.18, productInterests: [{ productId: 'p1' }] }
  const handlers = {
    'GET /customers': () => ({ total: 1, page: 1, pageSize: 25, items: [row] }),
    'GET /admin/territories': () => [{ id: 'terr-1', name: 'Accra Central', region: null, district: null }, { id: 'terr-2', name: 'Kumasi', region: null, district: null }],
    'GET /customers/c1': () => ({ customer: full, recentVisits: [] }),
  }

  it('saves changes without losing the fields the form does not show', async () => {
    const api = fakeApi({ ...handlers, 'PUT /customers/c1': () => ({}) })
    renderApp(<Customers />, api, me('RegionalManager'))
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Dr Ama Boateng' }))
    const form = await screen.findByRole('form', { name: 'Edit customer' })
    await userEvent.clear(within(form).getByLabelText('City'))
    await userEvent.type(within(form).getByLabelText('City'), 'Tema')
    await userEvent.selectOptions(within(form).getByLabelText('Territory'), 'terr-2')
    await userEvent.click(within(form).getByText('Save'))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/customers/c1', expect.objectContaining({
      id: 'c1', name: 'Dr Ama Boateng', city: 'Tema', territoryId: 'terr-2', parentCustomerId: 'parent-1', latitude: 5.6, longitude: -0.18, address: '1 High St', productIds: ['p1'], targetVisitsPerMonth: 4,
    })))
    expect(await screen.findByText('Dr Ama Boateng saved.')).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Edit customer' })).not.toBeInTheDocument()
  })

  it('shows the server reason when a save is refused and keeps the form open', async () => {
    const api = fakeApi({ ...handlers, 'PUT /customers/c1': () => { throw new Error('Name is required.') } })
    renderApp(<Customers />, api, me('Admin'))
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Dr Ama Boateng' }))
    await userEvent.click(within(await screen.findByRole('form', { name: 'Edit customer' })).getByText('Save'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Name is required.')
    expect(screen.getByRole('form', { name: 'Edit customer' })).toBeInTheDocument()
  })

  it('removes a customer only after confirmation and only for managers; marketing can edit but not remove', async () => {
    const api = fakeApi({ ...handlers, 'DELETE /customers/c1': () => ({}) })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    const first = renderApp(<Customers />, api, me('Admin'))
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Dr Ama Boateng' }))
    await userEvent.click(await screen.findByText('Remove customer'))
    expect(api.del).not.toHaveBeenCalled()
    await userEvent.click(screen.getByText('Remove customer'))
    await waitFor(() => expect(api.del).toHaveBeenCalledWith('/customers/c1'))
    expect(confirm).toHaveBeenCalledTimes(2)
    first.unmount()

    renderApp(<Customers />, fakeApi(handlers), me('Marketing'))
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Dr Ama Boateng' }))
    await screen.findByRole('form', { name: 'Edit customer' })
    expect(screen.queryByText('Remove customer')).not.toBeInTheDocument()
  })

  it('offers no edit to people who cannot edit customers', async () => {
    renderApp(<Customers />, fakeApi(handlers), me('Executive'))
    await screen.findByText('Dr Ama Boateng')
    expect(screen.queryByRole('button', { name: 'Edit Dr Ama Boateng' })).not.toBeInTheDocument()
  })
})

describe('Team: territories', () => {
  const handlers = { 'GET /admin/users': () => users, 'GET /admin/territories': () => [{ id: 'terr-1', name: 'Accra Central', region: 'Greater Accra', district: null }] }

  it('edits a territory', async () => {
    const api = fakeApi({ ...handlers, 'PUT /admin/territories/terr-1': () => ({}) })
    prompts('Accra Central 2', 'Greater Accra', '')
    renderApp(<Team />, api, me('Admin'))
    await userEvent.click(await screen.findByRole('button', { name: 'Edit territory Accra Central' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/territories/terr-1', { id: 'terr-1', name: 'Accra Central 2', region: 'Greater Accra', district: null }))
    expect(await screen.findByText('Accra Central 2 saved.')).toBeInTheDocument()
  })

  it('deletes after confirmation and shows why it is refused while people are assigned', async () => {
    const api = fakeApi({ ...handlers, 'DELETE /admin/territories/terr-1': () => { throw new Error('Territory is still assigned to 2 user(s) and 5 customer(s); reassign them first.') } })
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    renderApp(<Team />, api, me('Admin'))
    const del = await screen.findByRole('button', { name: 'Delete territory Accra Central' })
    await userEvent.click(del)
    expect(api.del).not.toHaveBeenCalled()
    await userEvent.click(del)
    expect(await screen.findByRole('alert')).toHaveTextContent('still assigned to 2 user(s)')
  })

  it('does not offer territory changes to managers who are not administrators', async () => {
    renderApp(<Team />, fakeApi(handlers), me('RegionalManager'))
    await screen.findByText('Greater Accra')
    expect(screen.queryByRole('button', { name: 'Edit territory Accra Central' })).not.toBeInTheDocument()
  })
})
