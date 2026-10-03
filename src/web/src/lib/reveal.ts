import { useEffect, useRef } from 'react'
import { motionAllowed } from './motion'

/**
 * Lets a block fade and slide up as it scrolls into view. Without IntersectionObserver or with reduced motion it does nothing
 * (the block is simply there), so nothing can end up invisible.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !motionAllowed() || typeof IntersectionObserver === 'undefined') return
    el.classList.add('reveal')
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in-view'); io.unobserve(e.target) }
    }, { threshold: 0.08 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return ref
}
