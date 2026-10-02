/** The customisable dashboard: which widgets show, in which order, how wide. Pure functions so they are easy to test. */
export type Span = 4 | 6 | 8 | 12
export interface Slot { id: string; span: Span; hidden: boolean }
export interface Fallback { id: string; span: Span }

const SPANS: Span[] = [4, 6, 8, 12]
const isSpan = (n: unknown): n is Span => SPANS.includes(n as Span)

export const defaultLayout = (defaults: Fallback[]): Slot[] => defaults.map((d) => ({ id: d.id, span: d.span, hidden: false }))

/** Merge a saved layout with the widgets that exist today: unknown ones are dropped, new ones are added at the end. */
export function reconcile(saved: unknown, defaults: Fallback[]): Slot[] {
  const known = new Map(defaults.map((d) => [d.id, d]))
  const out: Slot[] = []
  const seen = new Set<string>()
  if (Array.isArray(saved)) {
    for (const s of saved as Partial<Slot>[]) {
      if (!s || typeof s.id !== 'string' || !known.has(s.id) || seen.has(s.id)) continue
      seen.add(s.id)
      out.push({ id: s.id, span: isSpan(s.span) ? s.span : known.get(s.id)!.span, hidden: s.hidden === true })
    }
  }
  for (const d of defaults) if (!seen.has(d.id)) out.push({ id: d.id, span: d.span, hidden: false })
  return out
}

export function load(key: string, defaults: Fallback[]): Slot[] {
  try {
    const raw = localStorage.getItem(key)
    return reconcile(raw ? JSON.parse(raw) : null, defaults)
  } catch { return defaultLayout(defaults) }
}

export function save(key: string, layout: Slot[]) {
  try { localStorage.setItem(key, JSON.stringify(layout)) } catch { /* private mode: the layout just won't be remembered */ }
}

export function clear(key: string) {
  try { localStorage.removeItem(key) } catch { /* nothing to clear */ }
}

/** Put `id` where `targetId` is. */
export function moveTo(layout: Slot[], id: string, targetId: string): Slot[] {
  const from = layout.findIndex((s) => s.id === id)
  const to = layout.findIndex((s) => s.id === targetId)
  if (from < 0 || to < 0 || from === to) return layout
  const next = layout.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** Move one step earlier (-1) or later (+1) among the widgets that are showing. */
export function step(layout: Slot[], id: string, dir: -1 | 1, showing: (id: string) => boolean): Slot[] {
  const visible = layout.filter((s) => !s.hidden && showing(s.id))
  const i = visible.findIndex((s) => s.id === id)
  const neighbour = visible[i + dir]
  return i < 0 || !neighbour ? layout : moveTo(layout, id, neighbour.id)
}

export const nextSpan = (s: Span): Span => SPANS[(SPANS.indexOf(s) + 1) % SPANS.length]

export const resize = (layout: Slot[], id: string): Slot[] => layout.map((s) => (s.id === id ? { ...s, span: nextSpan(s.span) } : s))
export const setHidden = (layout: Slot[], id: string, hidden: boolean): Slot[] => layout.map((s) => (s.id === id ? { ...s, hidden } : s))
