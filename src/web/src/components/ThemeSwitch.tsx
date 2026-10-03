import { useState } from 'react'
import { getTheme, setTheme, type Theme } from '../lib/theme'

const order: Theme[] = ['system', 'light', 'dark']
const label: Record<Theme, string> = { system: 'Auto', light: 'Light', dark: 'Dark' }

/** Cycles Auto (follows the device) → Light → Dark. */
export function ThemeSwitch() {
  const [theme, set] = useState<Theme>(getTheme)
  const next = order[(order.indexOf(theme) + 1) % order.length]
  return (
    <button
      className="theme-switch"
      aria-label={`Theme: ${label[theme]}. Switch to ${label[next]}`}
      title={`Theme: ${label[theme]}`}
      onClick={() => { setTheme(next); set(next) }}
    >
      {theme === 'dark' ? '☾' : theme === 'light' ? '☀' : '◐'}<span className="theme-label"> {label[theme]}</span>
    </button>
  )
}
