import { useEffect, useState } from 'react'

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s} s ago`
  const m = Math.round(s / 60)
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`
}

/** "● Live · updated 12 s ago". Turns amber when a refresh failed, so nobody trusts old numbers by accident. */
export function LiveBadge({ updatedAt, stale, onRefresh }: { updatedAt: number | undefined; stale: boolean; onRefresh?: () => void }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(t)
  }, [])
  if (updatedAt === undefined) return null
  return (
    <span className={`live-badge${stale ? ' stale' : ''}`} role="status">
      <span className="live-dot" aria-hidden="true" />
      {stale ? 'Could not refresh' : 'Live'} · updated {ago(now - updatedAt)}
      {onRefresh && <button className="link" onClick={onRefresh}>Refresh</button>}
    </span>
  )
}
