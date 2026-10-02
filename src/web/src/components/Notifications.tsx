import { useEffect, useState } from 'react'
import type { AppNotification } from '../api/types'
import { useApp } from '../context'
import { fmtDateTime } from '../lib/format'
import { useAsync } from '../lib/useAsync'

const REFRESH_MS = 60_000

/** Unread notices for the signed-in person (for example a recalled batch they hold). Failures are ignored: the bell is a convenience, not a dependency. */
export function Notifications() {
  const { api } = useApp()
  const list = useAsync(() => api.get<AppNotification[]>('/notifications').catch(() => [] as AppNotification[]), [])
  const [dismissed, setDismissed] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const { reload } = list
  const items = (list.data ?? []).filter((n) => !dismissed.includes(n.id))

  useEffect(() => {
    const t = setInterval(reload, REFRESH_MS)
    return () => clearInterval(t)
  }, [reload])

  // the list is hidden right away; if the server refuses, a reload brings it back
  async function read(id: string) {
    setDismissed((d) => [...d, id])
    try { await api.post(`/notifications/${id}/read`) } catch { setDismissed((d) => d.filter((x) => x !== id)) }
  }
  async function readAll() {
    const ids = items.map((n) => n.id)
    setDismissed((d) => [...d, ...ids])
    try { await api.post('/notifications/read-all') } catch { setDismissed((d) => d.filter((x) => !ids.includes(x))) }
  }

  return (
    <div className="notifications">
      <button aria-expanded={open} aria-label={`Notifications, ${items.length} unread`} onClick={() => setOpen((v) => !v)}>
        Notices{items.length > 0 && <span className="badge bad" aria-hidden="true"> {items.length}</span>}
      </button>
      {open && (
        <div className="notice-panel" role="region" aria-label="Notifications">
          {items.length === 0 ? <p className="muted">Nothing new.</p> : (
            <>
              <ul>
                {items.map((n) => (
                  <li key={n.id} className={n.kind.startsWith('batch.recalled') ? 'flag' : ''}>
                    <strong>{n.title}</strong>
                    {n.body && <div>{n.body}</div>}
                    <div className="muted small">{fmtDateTime(n.createdAt)} <button onClick={() => void read(n.id)}>Mark read</button></div>
                  </li>
                ))}
              </ul>
              <button onClick={() => void readAll()}>Mark all read</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
