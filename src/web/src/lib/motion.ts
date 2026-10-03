import { useEffect, useRef, useState } from 'react'

/** Animation is on only where the browser says it can and the person has not asked for less motion (jsdom and old browsers: off). */
export function motionAllowed(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function useMotion(): boolean {
  return motionAllowed()
}

/** Counts from the previous value (0 the first time) to `target`, easing out. Returns the target at once when motion is off. */
export function useCountUp(target: number, ms = 700): number {
  const allowed = motionAllowed()
  const [shown, setShown] = useState(allowed ? 0 : target)
  const from = useRef(allowed ? 0 : target)
  useEffect(() => {
    if (!allowed) return
    const start = from.current
    const t0 = performance.now()
    let raf = 0
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms)
      const raw = start + (target - start) * (1 - Math.pow(1 - p, 3)) // ease out
      const v = Number.isInteger(target) ? Math.round(raw) : raw // whole numbers count in whole steps
      from.current = v
      setShown(v)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, ms, allowed])
  return allowed ? shown : target
}
