export type Theme = 'system' | 'light' | 'dark'

const KEY = 'das-theme'

/** The person's choice, kept in this browser only. Storage can be blocked (private windows), so every access is guarded. */
export function getTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

export function setTheme(theme: Theme) {
  try {
    if (theme === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, theme)
  } catch {
    /* the choice still applies for this visit */
  }
  applyTheme(theme)
}
