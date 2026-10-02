import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { Bento, type Widget } from './Bento'

const widgets: Widget[] = [
  { id: 'a', title: 'Alpha', span: 6, node: <p>alpha body</p> },
  { id: 'b', title: 'Beta', span: 6, node: <p>beta body</p> },
  { id: 'c', title: 'Gamma', span: 12, node: <p>gamma body</p>, available: false },
]
const order = () => [...document.querySelectorAll<HTMLElement>('[data-widget]')].map((e) => e.dataset.widget).join('')

describe('customisable dashboard', () => {
  beforeEach(() => localStorage.clear())

  it('shows available widgets in order and nothing of the unavailable ones', () => {
    render(<Bento storageKey="t" widgets={widgets} />)
    expect(order()).toBe('ab')
    expect(screen.queryByText('gamma body')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /Arrange/ })).not.toBeInTheDocument() // no controls until Customise
  })

  it('moves, resizes and hides with buttons, and offers hidden ones back', async () => {
    const user = userEvent.setup()
    render(<Bento storageKey="t" widgets={widgets} />)
    await user.click(screen.getByRole('button', { name: 'Customise' }))
    await user.click(screen.getByRole('button', { name: 'Move Beta earlier' }))
    expect(order()).toBe('ba')

    const cell = document.querySelector<HTMLElement>('[data-widget="a"]')!
    await user.click(within(cell).getByRole('button', { name: /Change width of Alpha/ }))
    expect(cell.style.getPropertyValue('--span')).toBe('8')

    await user.click(within(cell).getByRole('button', { name: 'Hide Alpha' }))
    expect(screen.queryByText('alpha body')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show Alpha' }))
    expect(screen.getByText('alpha body')).toBeInTheDocument()
  })

  it('remembers the layout for the next visit, and Reset puts it back', async () => {
    const user = userEvent.setup()
    const first = render(<Bento storageKey="t" widgets={widgets} />)
    await user.click(screen.getByRole('button', { name: 'Customise' }))
    await user.click(screen.getByRole('button', { name: 'Move Beta earlier' }))
    first.unmount()

    render(<Bento storageKey="t" widgets={widgets} />)
    expect(order()).toBe('ba')
    await user.click(screen.getByRole('button', { name: 'Customise' }))
    await user.click(screen.getByRole('button', { name: 'Reset layout' }))
    expect(order()).toBe('ab')
  })

  it('keeps layouts apart for different keys (different people)', async () => {
    const user = userEvent.setup()
    const mine = render(<Bento storageKey="u1" widgets={widgets} />)
    await user.click(screen.getByRole('button', { name: 'Customise' }))
    await user.click(screen.getByRole('button', { name: 'Hide Alpha' }))
    mine.unmount()
    render(<Bento storageKey="u2" widgets={widgets} />)
    expect(screen.getByText('alpha body')).toBeInTheDocument()
  })
})
