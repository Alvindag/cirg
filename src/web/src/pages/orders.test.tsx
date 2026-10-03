import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CreditOverview, OrderSummary, Product, SalesOrder } from '../api/types'
import { fakeApi, me, renderApp } from '../test/helpers'
import { Orders } from './Orders'

const order = (over: Partial<SalesOrder> = {}): SalesOrder => ({
  id: 'o1', number: 'ORD-20261003-AB12CD', repId: 'r1', customerId: 'c1', customerName: 'Korle Pharmacy', status: 'Placed', total: 37.5, currency: 'GHS',
  notes: 'Deliver after 2pm', placedAt: '2026-10-03T09:00:00Z', confirmedAt: null, deliveredAt: null, cancelledAt: null, cancelReason: null, creditHold: false, creditHoldReason: null, creditReleaseNote: null,
  lines: [{ id: 'l1', productId: 'p1', productName: 'Amoxil 500', quantity: 15, unitPrice: 2.5, lineTotal: 37.5 }], ...over,
})
const summary: OrderSummary = { days: 30, orders: 12, value: 4200, placed: 3, confirmed: 2, delivered: 6, cancelled: 1, avgHoursToDeliver: 30, topProducts: [{ productId: 'p1', name: 'Amoxil 500', quantity: 400, value: 1000 }] }

describe('Orders', () => {
  it('shows the totals, the orders waiting for confirmation and what is in each order', async () => {
    const api = fakeApi({ 'GET /orders/summary': () => summary, 'GET /orders': () => [order()], 'GET /users': () => [] })
    renderApp(<Orders />, api, me('Admin'))
    expect(await screen.findByText('Korle Pharmacy')).toBeInTheDocument()
    expect(screen.getByText('GHS 4,200.00 ordered')).toBeInTheDocument()
    expect(screen.getByText('30.0 hours from order to delivery')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'ORD-20261003-AB12CD' }))
    const unit = screen.getByText('GHS 2.50').closest('tr')!
    expect(within(unit).getByText('Amoxil 500')).toBeInTheDocument()
    expect(within(unit).getByText('15')).toBeInTheDocument()
    expect(screen.getByText('Note: Deliver after 2pm')).toBeInTheDocument()
  })

  it('confirms an order and says so', async () => {
    const post = vi.fn(async () => order({ status: 'Confirmed' }))
    const api = fakeApi({ 'GET /orders/summary': () => summary, 'GET /orders': () => [order()], 'GET /users': () => [], 'POST /orders/o1/confirm': post })
    renderApp(<Orders />, api, me('AreaManager'))
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    expect(await screen.findByText('Order ORD-20261003-AB12CD confirmed.')).toBeInTheDocument()
    expect(post).toHaveBeenCalled()
  })

  it('needs a reason to cancel', async () => {
    const post = vi.fn(async () => order({ status: 'Cancelled' }))
    vi.spyOn(window, 'prompt').mockReturnValueOnce('  ').mockReturnValueOnce('Out of stock')
    const api = fakeApi({ 'GET /orders/summary': () => summary, 'GET /orders': () => [order()], 'GET /users': () => [], 'POST /orders/o1/cancel': post })
    renderApp(<Orders />, api, me('Admin'))
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(post).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(post).toHaveBeenCalled())
  })

  it('lets a senior role set prices, and sends only what changed (an empty box takes a product off sale)', async () => {
    const products: Product[] = [{ id: 'p1', name: 'Amoxil 500', code: 'AMX', listPrice: 2.5 }, { id: 'p2', name: 'New Syrup', code: 'NS', listPrice: null }]
    const put = vi.fn(async () => undefined)
    const api = fakeApi({ 'GET /orders/summary': () => summary, 'GET /orders': () => [], 'GET /users': () => [], 'GET /admin/products': () => products, 'PUT /orders/prices': put })
    renderApp(<Orders />, api, me('NationalSalesManager'))
    await userEvent.click(await screen.findByRole('tab', { name: 'Price list' }))
    const syrup = await screen.findByLabelText('Price for New Syrup')
    await userEvent.type(syrup, '4.5')
    await userEvent.clear(screen.getByLabelText('Price for Amoxil 500'))
    await userEvent.click(screen.getByRole('button', { name: 'Save 2 changes' }))
    expect(await screen.findByText('2 prices saved.')).toBeInTheDocument()
    expect(put).toHaveBeenCalledWith(undefined, [{ productId: 'p2', price: 4.5 }, { productId: 'p1', price: null }])
  })

  it('is for managers only, and area managers do not see the price list', async () => {
    const api = fakeApi({ 'GET /orders/summary': () => summary, 'GET /orders': () => [], 'GET /users': () => [] })
    const { unmount } = renderApp(<Orders />, api, me('Rep'))
    expect(await screen.findByText('Orders are available to managers.')).toBeInTheDocument()
    unmount()
    renderApp(<Orders />, api, me('AreaManager'))
    await screen.findByText('No placed orders.')
    expect(screen.queryByRole('tab', { name: 'Price list' })).toBeNull()
  })

  it('marks an order on credit hold and only a national role can release it, with a reason', async () => {
    const held = order({ creditHold: true, creditHoldReason: 'The customer has GHS 120.00 overdue.' })
    const post = vi.fn(async () => order({ status: 'Confirmed' }))
    vi.spyOn(window, 'prompt').mockReturnValue('Paid this morning')
    const api = fakeApi({ 'GET /orders/summary': () => summary, 'GET /orders': () => [held], 'GET /users': () => [], 'POST /orders/o1/confirm': post })
    renderApp(<Orders />, api, me('NationalSalesManager'))
    expect(await screen.findByText('Credit hold')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Release and confirm' }))
    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(post.mock.calls[0][1]).toEqual({ note: 'Paid this morning' })
    expect(await screen.findByText('Order ORD-20261003-AB12CD released and confirmed.')).toBeInTheDocument()
  })

  it('an area manager cannot release a held order', async () => {
    const api = fakeApi({ 'GET /orders/summary': () => summary, 'GET /orders': () => [order({ creditHold: true, creditHoldReason: 'x' })], 'GET /users': () => [] })
    renderApp(<Orders />, api, me('AreaManager'))
    expect(await screen.findByText('Needs a credit release')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /confirm/i })).toBeNull()
  })

  it('shows who is over their limit or overdue and lets a senior role change a limit', async () => {
    const overview: CreditOverview = { customers: 2, withLimit: 1, overdueTotal: 120, outstandingTotal: 900, overLimit: 1, withOverdue: 1, heldOrders: 2,
      watch: [{ customerId: 'c1', name: 'Korle Pharmacy', territory: 'Accra Central', creditLimit: 500, outstanding: 450, overdue: 120, openOrders: 100, asOf: null, overLimit: true }] }
    const put = vi.fn(async () => undefined)
    const api = fakeApi({ 'GET /orders/summary': () => summary, 'GET /orders': () => [], 'GET /users': () => [], 'GET /credit/overview': () => overview, 'PUT /credit/c1': put })
    const user = userEvent.setup()
    renderApp(<Orders />, api, me('Admin'))
    await user.click(await screen.findByRole('tab', { name: 'Credit' }))
    expect(await screen.findByText('Over limit')).toBeInTheDocument()
    expect(screen.getByText('GHS 120.00', { selector: 'td' })).toBeInTheDocument()
    const box = screen.getByLabelText('Limit for Korle Pharmacy')
    await user.clear(box); await user.type(box, '800')
    await user.click(screen.getByRole('button', { name: 'Save limit' }))
    await waitFor(() => expect(put).toHaveBeenCalled())
    expect(put.mock.calls[0][1]).toEqual({ creditLimit: 800 })
  })

  it('shows delivery service (on time, in full), orders running late and the service by region', async () => {
    const sum: OrderSummary = { ...summary, service: { judged: 8, onTimePct: 75, inFullPct: 87.5, otifPct: 62.5 }, lateOpen: 2, regions: [{ region: 'Northern', delivered: 3, onTimePct: 33.3, inFullPct: 66.7, otifPct: 33.3 }] }
    const api = fakeApi({ 'GET /orders/summary': () => sum, 'GET /orders': () => [], 'GET /users': () => [] })
    renderApp(<Orders />, api, me('Admin'))
    expect(await screen.findByText('62.5%')).toBeInTheDocument()
    expect(screen.getByText('75.0% on time · 87.5% in full (8 orders)')).toBeInTheDocument()
    expect(screen.getByText('Running late')).toBeInTheDocument()
    const row = screen.getByText('Northern').closest('tr')!
    expect(within(row).getAllByText('33.3%')).toHaveLength(2)      // on time and OTIF; in full is 66.7%
  })

  it('asks whether the whole order was delivered, and for what was short when it was not', async () => {
    const post = vi.fn(async () => order({ status: 'Delivered' }))
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    vi.spyOn(window, 'prompt').mockReturnValue('Only 1 carton')
    const api = fakeApi({ 'GET /orders/summary': () => summary, 'GET /orders': () => [order({ status: 'Confirmed', promisedAt: '2099-01-01T00:00:00Z' })], 'GET /users': () => [], 'POST /orders/o1/deliver': post })
    renderApp(<Orders />, api, me('Admin'))
    await userEvent.click(await screen.findByRole('button', { name: 'Mark delivered' }))
    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(post.mock.calls[0][1]).toEqual({ inFull: false, note: 'Only 1 carton' })
    expect(await screen.findByText('Order ORD-20261003-AB12CD marked delivered, not in full.')).toBeInTheDocument()
  })
})
