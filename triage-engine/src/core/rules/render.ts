import type { CanonicalEvent } from '../types'
import { getField } from './compile'
import type { Action } from './types'

const MAX_VALUE = 512
// eslint-disable-next-line no-control-regex
const CTRL = /[\u0000-\u001f\u007f\u0085\u2028\u2029]/g
const PS_QUOTES = /[\u2018\u2019\u201a\u201b']/g // PowerShell treats all of these as a single quote

/** Escape an attacker-controlled log value for embedding in a command template (see lintAction for template rules). */
export function escapeFor(shell: Action['shell'], raw: string): string {
  const v = raw.slice(0, MAX_VALUE).replace(CTRL, ' ')
  switch (shell) {
    case 'powershell': return v.replace(PS_QUOTES, "''")          // template wraps placeholder in single quotes
    case 'cmd': return v.replace(/["%`]/g, '_').replace(/[&|<>^()]/g, '^$&')
    case 'kql': case 'spl': return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"') // template wraps in double quotes
    default: return v
  }
}

export interface RenderedAction { title: string; shell?: Action['shell']; risk?: Action['risk']; command?: string; missing: string[] }

/** Fill {{field}} placeholders from one evidence event. The result is for display/copy only; the app never executes it. */
export function renderAction(a: Action, ev: CanonicalEvent | undefined): RenderedAction {
  const missing: string[] = []
  const command = a.command?.replace(/\{\{\s*([A-Za-z]+)\s*\}\}/g, (_m, f: string) => {
    const v = ev ? getField(ev, f) : undefined
    if (v === undefined) { missing.push(f); return `<${f}>` }
    return escapeFor(a.shell, String(v))
  })
  return { title: a.title, shell: a.shell, risk: a.risk, command, missing }
}
