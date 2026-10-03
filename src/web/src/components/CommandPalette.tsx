import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Customer, Page } from '../api/types'
import { useApp } from '../context'
import { fuzzyScore } from '../lib/fuzzy'
import { canSeeErp, isManager } from '../lib/roles'
import { setTheme, type Theme } from '../lib/theme'

interface Command {
  id: string
  title: string
  group: 'Go to' | 'Customers' | 'Settings' | 'Account'
  hint?: string
  keywords?: string
  run: () => void
}

/**
 * Ctrl/⌘+K: jump to any page, find a customer, switch the theme or sign out, without touching the mouse.
 * Pages follow the person's role (the same rules as the menu), and customer search is the same API call as the Customers page.
 */
export function CommandPalette() {
  const { api, me, signOut } = useApp()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [customers, setCustomers] = useState<Customer[]>([])
  const input = useRef<HTMLInputElement>(null)
  const opener = useRef<HTMLElement | null>(null)

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setCustomers([])
    opener.current?.focus() // put the person back where they were
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => {
          if (!o) opener.current = document.activeElement as HTMLElement | null
          return !o
        })
      }
    }
    const onOpen = () => { opener.current = document.activeElement as HTMLElement | null; setOpen(true) }
    window.addEventListener('keydown', onKey)
    window.addEventListener('das:open-palette', onOpen)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('das:open-palette', onOpen) }
  }, [])

  useEffect(() => { if (open) input.current?.focus() }, [open])

  // customers: wait until typing pauses, ignore answers that arrive after a newer search
  useEffect(() => {
    const q = query.trim()
    if (!open || q.length < 2) return
    let stale = false
    const t = setTimeout(() => {
      api.get<Page<Customer>>('/customers', { q, pageSize: 5 }).then((r) => { if (!stale) { setCustomers(r.items); setActive(0) } }).catch(() => { if (!stale) setCustomers([]) })
    }, 200)
    return () => { stale = true; clearTimeout(t) }
  }, [query, open, api])

  const go = useCallback((path: string) => () => { navigate(path); }, [navigate])
  const theme = (t: Theme, label: string): Command => ({ id: `theme-${t}`, title: `Theme: ${label}`, group: 'Settings', keywords: 'dark light appearance mode', run: () => setTheme(t) })

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      { id: 'overview', title: 'Overview', group: 'Go to', keywords: 'dashboard home sales', run: go('/') },
      { id: 'customers', title: 'Customers', group: 'Go to', keywords: 'accounts doctors pharmacies hospitals', run: go('/customers') },
      { id: 'insights', title: 'Insights', group: 'Go to', keywords: 'scores opportunities territory balance ai', run: go('/insights') },
    ]
    if (isManager(me.role)) {
      list.push({ id: 'rtm', title: 'Route to market', group: 'Go to', keywords: 'coverage channels distributors segments market size gaps regions', run: go('/rtm') })
      list.push({ id: 'team', title: 'Team and territories', group: 'Go to', keywords: 'people users reps managers', run: go('/team') })
      list.push({ id: 'orders', title: 'Orders', group: 'Go to', keywords: 'sales order confirm deliver cancel price list', run: go('/orders') })
      list.push({ id: 'samples', title: 'Samples', group: 'Go to', keywords: 'stock batches requests compliance recall', run: go('/samples') })
      list.push({ id: 'audit', title: 'Audit log', group: 'Go to', keywords: 'history changes', run: go('/audit') })
    }
    if (canSeeErp(me.role)) list.push({ id: 'erp', title: 'ERP', group: 'Go to', keywords: 'business central integration outbox reconciliation procurement', run: go('/erp') })
    list.push(theme('system', 'Auto (follow device)'), theme('light', 'Light'), theme('dark', 'Dark'))
    list.push({ id: 'signout', title: 'Sign out', group: 'Account', run: signOut })
    return list
  }, [me.role, go, signOut])

  const results = useMemo(() => {
    const q = query.trim()
    const matched = commands
      .map((c) => ({ c, s: fuzzyScore(q, `${c.title} ${c.keywords ?? ''}`) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.c)
    const people: Command[] = customers.map((c) => ({
      id: `c-${c.id}`, title: c.name, group: 'Customers', hint: [c.type, c.city].filter(Boolean).join(' · '),
      run: go(`/customers?q=${encodeURIComponent(c.name)}`),
    }))
    return [...people, ...matched].slice(0, 12)
  }, [commands, customers, query, go])

  if (!open) return null

  const run = (c: Command | undefined) => { if (!c) return; close(); c.run() }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); run(results[active]) }
  }

  return (
    <div className="palette-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={onKeyDown}>
        <input
          ref={input}
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={results[active] ? `palette-${results[active].id}` : undefined}
          aria-label="Search pages, customers and actions"
          placeholder="Search pages, customers and actions…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0) }}
        />
        <ul id="palette-list" role="listbox" aria-label="Results">
          {results.length === 0 && <li className="palette-empty" role="presentation">Nothing matches “{query}”.</li>}
          {results.map((c, i) => (
            <li
              key={c.id}
              id={`palette-${c.id}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onMouseMove={() => setActive(i)}
              onClick={() => run(c)}
            >
              <span className="palette-group">{c.group}</span>
              <span className="palette-title">{c.title}</span>
              {c.hint && <span className="palette-hint">{c.hint}</span>}
            </li>
          ))}
        </ul>
        <div className="palette-foot"><kbd>↑</kbd><kbd>↓</kbd> move <kbd>Enter</kbd> open <kbd>Esc</kbd> close</div>
      </div>
    </div>
  )
}
