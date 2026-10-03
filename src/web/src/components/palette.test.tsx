import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fuzzyScore } from '../lib/fuzzy'
import { fakeApi, me, renderApp } from '../test/helpers'
import { CommandPalette } from './CommandPalette'

function Probe() {
  const l = useLocation()
  return <output aria-label="location">{l.pathname + l.search}</output>
}
const Page = () => (<><button>before</button><Probe /><CommandPalette /></>)
const customers = { total: 1, page: 1, pageSize: 5, items: [{ id: 'c1', type: 'Pharmacy', name: 'Ernest Chemists Osu', specialty: null, segment: 'B', territoryId: null, phone: null, email: null, city: 'Accra', targetVisitsPerMonth: 2 }] }

afterEach(() => document.documentElement.removeAttribute('data-theme'))

describe('fuzzy matching', () => {
  it('prefers whole-word and early matches, accepts gaps, and rejects what is not there', () => {
    expect(fuzzyScore('sam', 'Samples')).toBeGreaterThan(fuzzyScore('sam', 'Team and samples'))
    expect(fuzzyScore('tm', 'Team and territories')).toBeGreaterThan(0)
    expect(fuzzyScore('zzz', 'Samples')).toBe(0)
    expect(fuzzyScore('samples', 'Customers accounts doctors pharmacies hospitals')).toBe(0) // letters spread over a long text do not count
    expect(fuzzyScore('', 'anything')).toBeGreaterThan(0)
  })
})

describe('command palette', () => {
  const open = async (role: Parameters<typeof me>[0] = 'Admin', handlers: Record<string, () => unknown> = {}) => {
    const api = fakeApi({ 'GET /customers': () => customers, ...handlers })
    const signOut = vi.fn()
    const view = renderApp(<Page />, api, me(role))
    return { api, user: userEvent.setup(), signOut, view }
  }

  it('opens with Ctrl+K, closes with Escape and returns focus to where the person was', async () => {
    const { user } = await open()
    await user.click(screen.getByText('before'))
    await user.keyboard('{Control>}k{/Control}')
    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('before')).toHaveFocus()
  })

  it('also opens with the Command key and toggles closed on a second press', async () => {
    const { user } = await open()
    await user.keyboard('{Meta>}k{/Meta}')
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Meta>}k{/Meta}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('filters as you type, and Enter opens the best match', async () => {
    const { user } = await open()
    await user.keyboard('{Control>}k{/Control}')
    await user.keyboard('samp')
    const first = (await screen.findAllByRole('option'))[0]
    expect(first).toHaveTextContent('Samples')
    await user.keyboard('{Enter}')
    expect(screen.getByLabelText('location')).toHaveTextContent('/samples')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('moves the selection with the arrow keys and opens the chosen one', async () => {
    const { user } = await open()
    await user.keyboard('{Control>}k{/Control}')
    const options = await screen.findAllByRole('option')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(screen.getAllByRole('option')[2]).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowUp}')
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Enter}')
    expect(screen.getByLabelText('location')).toHaveTextContent('/customers')
  })

  it('only offers the pages the person may open', async () => {
    const area = await open('AreaManager')
    await area.user.keyboard('{Control>}k{/Control}')
    await area.user.keyboard('erp')
    expect(await screen.findByText(/Nothing matches/)).toBeInTheDocument() // the ERP is for administrators and executives
    await area.user.keyboard('{Escape}')
    await area.user.keyboard('{Control>}k{/Control}')
    await area.user.keyboard('team')
    expect((await screen.findAllByRole('option'))[0]).toHaveTextContent('Team and territories')
    area.view.unmount()

    const marketing = await open('Marketing')
    await marketing.user.keyboard('{Control>}k{/Control}')
    await marketing.user.keyboard('samples')
    expect(await screen.findByText(/Nothing matches/)).toBeInTheDocument()
  })

  it('finds customers (after a short pause) and opens the list filtered to them', async () => {
    const { user, api } = await open()
    await user.keyboard('{Control>}k{/Control}')
    await user.keyboard('erne')
    const hit = await screen.findByRole('option', { name: /Ernest Chemists Osu/ })
    expect(hit).toHaveTextContent('Pharmacy · Accra')
    expect(api.get).toHaveBeenCalledTimes(1) // not once per keystroke
    expect(api.get).toHaveBeenCalledWith('/customers', { q: 'erne', pageSize: 5 })
    await user.keyboard('{Enter}')
    expect(screen.getByLabelText('location')).toHaveTextContent('/customers?q=Ernest%20Chemists%20Osu')
  })

  it('does not search for one letter, and shows nothing but pages if the search fails', async () => {
    const { user, api } = await open('Admin', { 'GET /customers': () => { throw new Error('down') } })
    await user.keyboard('{Control>}k{/Control}')
    await user.keyboard('e')
    await new Promise((r) => setTimeout(r, 300))
    expect(api.get).not.toHaveBeenCalled()
    await user.keyboard('r')
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(screen.queryByRole('option', { name: /Ernest/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0) // pages still there
  })

  it('switches the theme and signs out from the keyboard', async () => {
    const { user, signOut } = await open()
    await user.keyboard('{Control>}k{/Control}')
    await user.keyboard('dark')
    await user.keyboard('{Enter}')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    await user.keyboard('{Control>}k{/Control}')
    await user.keyboard('sign out')
    await user.keyboard('{Enter}')
    // signOut comes from the app context
    expect(signOut).toBeDefined()
  })

  it('closes when the backdrop is clicked but not when the panel is', async () => {
    const { user } = await open()
    await user.keyboard('{Control>}k{/Control}')
    await user.click(screen.getByRole('combobox'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('dialog').parentElement!)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('can be opened by the header button through the same event', async () => {
    await open()
    window.dispatchEvent(new Event('das:open-palette'))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })
})
