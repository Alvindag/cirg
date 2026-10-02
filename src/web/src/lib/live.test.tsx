import { act, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveBadge } from '../components/LiveBadge'
import { Kpi } from '../components/ui'
import { liveStatus, useAsync } from './useAsync'

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('live data', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] }))
  afterEach(() => { setHidden(false); vi.useRealTimers() })

  const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })

  it('refreshes by itself without showing the loading state again, and keeps the old data until the new arrives', async () => {
    let n = 0
    const fn = vi.fn(async () => ++n)
    const { result } = renderHook(() => useAsync(fn, [], { refreshMs: 1000 }))
    await flush()
    expect(result.current.data).toBe(1)
    expect(result.current.loading).toBe(false)

    await act(async () => { vi.advanceTimersByTime(1000) })
    await flush()
    expect(fn).toHaveBeenCalledTimes(2)
    expect(result.current.data).toBe(2)
    expect(result.current.loading).toBe(false) // never flipped back to loading
    expect(result.current.updatedAt).toBeDefined()
  })

  it('does not poll unless asked to', async () => {
    const fn = vi.fn(async () => 1)
    renderHook(() => useAsync(fn, []))
    await flush()
    await act(async () => { vi.advanceTimersByTime(600_000) })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('keeps the last good data and marks it stale when a refresh fails, then recovers', async () => {
    let fail = false
    const fn = vi.fn(async () => { if (fail) throw new Error('down'); return 'fresh' })
    const { result } = renderHook(() => useAsync(fn, [], { refreshMs: 1000 }))
    await flush()
    fail = true
    await act(async () => { vi.advanceTimersByTime(1000) })
    await flush()
    expect(result.current.data).toBe('fresh') // still on screen
    expect(result.current.stale).toBe(true)
    expect(result.current.error).toBeUndefined() // not a screen-filling error

    fail = false
    await act(async () => { vi.advanceTimersByTime(1000) })
    await flush()
    expect(result.current.stale).toBe(false)
  })

  it('pauses while the tab is hidden and catches up when the person returns', async () => {
    const fn = vi.fn(async () => 1)
    renderHook(() => useAsync(fn, [], { refreshMs: 1000 }))
    await flush()
    setHidden(true)
    await act(async () => { vi.advanceTimersByTime(5000) })
    expect(fn).toHaveBeenCalledTimes(1) // nothing while hidden
    setHidden(false)
    await flush()
    expect(fn).toHaveBeenCalledTimes(2) // refreshed at once on return
  })

  it('a first load that fails still shows the error (there is nothing to fall back on)', async () => {
    const { result } = renderHook(() => useAsync(async () => { throw new Error('nope') }, [], { refreshMs: 1000 }))
    await flush()
    expect(result.current.error).toBe('nope')
    expect(result.current.stale).toBe(false)
  })

  it('combines several requests into one status: the oldest update, stale if any is', () => {
    const base = { data: undefined, error: undefined, loading: false, reload: () => {} }
    expect(liveStatus({ ...base, updatedAt: 5000, stale: false }, { ...base, updatedAt: 3000, stale: true })).toEqual({ updatedAt: 3000, stale: true })
    expect(liveStatus({ ...base, updatedAt: undefined, stale: false })).toEqual({ updatedAt: undefined, stale: false })
  })
})

describe('live badge', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] }))
  afterEach(() => vi.useRealTimers())

  it('says how fresh the numbers are, moves on with time, and warns when a refresh failed', () => {
    const t0 = Date.now()
    const { rerender } = render(<LiveBadge updatedAt={t0} stale={false} />)
    expect(screen.getByRole('status')).toHaveTextContent('Live · updated just now')
    act(() => { vi.advanceTimersByTime(35_000) })
    expect(screen.getByRole('status')).toHaveTextContent('updated 35 s ago')
    act(() => { vi.advanceTimersByTime(5 * 60_000) })
    expect(screen.getByRole('status')).toHaveTextContent('updated 6 min ago')
    rerender(<LiveBadge updatedAt={t0} stale />)
    expect(screen.getByRole('status')).toHaveTextContent('Could not refresh')
  })

  it('shows nothing before the first load and offers a manual refresh', () => {
    const onRefresh = vi.fn()
    const { container, rerender } = render(<LiveBadge updatedAt={undefined} stale={false} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<LiveBadge updatedAt={Date.now()} stale={false} onRefresh={onRefresh} />)
    screen.getByText('Refresh').click()
    expect(onRefresh).toHaveBeenCalled()
  })
})

describe('animated numbers', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

  it('show the real value at once when the person asked for less motion (or the browser cannot animate)', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }))
    render(<Kpi label="Calls" value="1,284" num={1284} format={(n) => Math.round(n).toLocaleString('en-US')} />)
    expect(screen.getByText('1,284')).toBeInTheDocument()
  })

  it('count up to the real value when motion is allowed, and a screen reader gets the final number', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }))
    const { container } = render(<Kpi label="Calls" value="1,000" num={1000} format={(n) => Math.round(n).toLocaleString('en-US')} />)
    const visible = () => container.querySelector('[aria-hidden="true"]')?.textContent
    expect(visible()).toBe('0') // starts from zero
    expect(container.querySelector('.sr-only')?.textContent).toBe('1,000')
    await act(async () => { vi.advanceTimersByTime(300) })
    const mid = Number((visible() ?? '').replace(/,/g, ''))
    expect(Number.isInteger(mid)).toBe(true) // never a fraction on the way up
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1000)
    await act(async () => { vi.advanceTimersByTime(2000) })
    expect(container.querySelector('.kpi-value')?.textContent).toBe('1,000') // finished: plain text again
  })
})
