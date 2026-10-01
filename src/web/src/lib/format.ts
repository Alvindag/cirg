export const fmtInt = (n: number) => new Intl.NumberFormat('en-GB').format(n)

export const fmtPct = (n: number) => `${n.toFixed(1)}%`

export function fmtDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** The last `days` days up to tomorrow, as ISO strings the API accepts. */
export function rangeLastDays(days: number, now = new Date()): { from: string; to: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
  return { from: start.toISOString(), to: end.toISOString() }
}

export const shortId = (id: string) => id.slice(0, 8)
