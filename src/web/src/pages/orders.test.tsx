import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { OrderSummary, Product, SalesOrder } from '../api/types'
import { fakeApi, me, renderApp } from '../test/helpers'
import { Orders } from './Orders'

const order = (over: Partial<SalesOrder> = {}): SalesOrder => ({
  id: 'o1', number: 'ORD-20261003-AB12CD', repId: 'r1', customerId: 'c1', customerName: 'Korle Pharmacy', status: 'Placed', total: 37.5, currency: 'GHS',
  notes: 'Deliver after 2pm', placedAt: '2026-10-03T09:00:00Z', confirmedAt: null, deliveredAt: null, cancelledAt: null, cancelReason: null,
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
})
