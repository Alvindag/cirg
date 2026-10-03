import { motionAllowed } from './motion'

const COLOURS = ['#d62028', '#0f5f9c', '#5aa8e6', '#f0b84f', '#5ccf95', '#ffffff']

/**
 * A short confetti pop for a real accomplishment (stock issued to a rep). It is a few absolutely placed, self-removing elements:
 * nothing to install, nothing left behind, and nothing at all when the person prefers reduced motion.
 */
export function celebrate(pieces = 28): void {
  if (!motionAllowed() || typeof document === 'undefined') return
  const layer = document.createElement('div')
  layer.className = 'confetti-layer'
  layer.setAttribute('aria-hidden', 'true')
  for (let i = 0; i < pieces; i++) {
    const p = document.createElement('i')
    const angle = (Math.PI * 2 * i) / pieces + Math.random() * 0.5
    const dist = 90 + Math.random() * 150
    p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`)
    p.style.setProperty('--dy', `${Math.sin(angle) * dist - 60}px`)
    p.style.setProperty('--rot', `${Math.round(Math.random() * 540 - 270)}deg`)
    p.style.background = COLOURS[i % COLOURS.length]
    layer.appendChild(p)
  }
  document.body.appendChild(layer)
  window.setTimeout(() => layer.remove(), 1400)
}
