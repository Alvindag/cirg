import { useState } from 'react'
import type { AuditEntry } from '../api/types'
import { Empty, ErrorBox, Loading, Section } from '../components/ui'
import { useApp } from '../context'
import { fmtDateTime, shortId } from '../lib/format'
import { isManager } from '../lib/roles'
import { useAsync } from '../lib/useAsync'
import { useUserNames } from '../lib/useNames'

export function Audit() {
  const { api, me } = useApp()
  const { name } = useUserNames()
  const [older, setOlder] = useState<AuditEntry[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const first = useAsync(() => api.get<AuditEntry[]>('/admin/audit-logs', { take: 50 }), [])
  if (!isManager(me.role)) return <ErrorBox message="The audit log is available to managers." />

  const rows = [...(first.data ?? []), ...older]
  async function more() {
    const last = rows[rows.length - 1]
    if (!last) return
    setLoadingMore(true)
    try { setOlder([...older, ...(await api.get<AuditEntry[]>('/admin/audit-logs', { take: 50, before: last.id }))]) } finally { setLoadingMore(false) }
  }

  return (
    <>
      <div className="page-head"><h1>Audit log</h1></div>
      <Section title="Recent changes">
        {first.error && <ErrorBox message={first.error} onRetry={first.reload} />}
        {first.loading && !first.data && <Loading />}
        {first.data && (rows.length === 0 ? <Empty>Nothing recorded yet.</Empty> : (
          <>
            <table>
              <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Changes</th></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td>{fmtDateTime(a.at)}</td><td>{name(a.userId)}</td><td>{a.action}</td>
                    <td>{a.entityType} <span className="muted small">{shortId(a.entityId)}</span></td>
                    <td className="small mono">{a.changes ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pager"><button disabled={loadingMore} onClick={more}>Load older</button></div>
          </>
        ))}
        <p className="muted small">The log is append-only and hash-chained; entries cannot be edited or removed.</p>
      </Section>
    </>
  )
}
