import { afterEach, describe, expect, it, vi } from 'vitest'
import { celebrate } from './celebrate'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); document.querySelectorAll('.confetti-layer').forEach((e) => e.remove()) })

const motion = (reduce: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({ matches: reduce && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }))

describe('confetti', () => {
  it('pops a short burst and removes itself', () => {
    vi.useFakeTimers()
    motion(false)
    celebrate(10)
    const layer = document.querySelector('.confetti-layer')
    expect(layer?.children).toHaveLength(10)
    expect(layer).toHaveAttribute('aria-hidden', 'true')
    vi.advanceTimersByTime(1500)
    expect(document.querySelector('.confetti-layer')).toBeNull()
  })

  it('does nothing when the person prefers reduced motion, or the browser cannot tell', () => {
    motion(true)
    celebrate()
    expect(document.querySelector('.confetti-layer')).toBeNull()
    vi.unstubAllGlobals()
    celebrate() // jsdom has no matchMedia
    expect(document.querySelector('.confetti-layer')).toBeNull()
  })
})
