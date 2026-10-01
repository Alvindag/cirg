import { useState, type FormEvent } from 'react'
import type { AppUser, Role, Territory } from '../api/types'
import { Badge, Empty, ErrorBox, Loading, Section } from '../components/ui'
import { useApp } from '../context'
import { isAdmin } from '../lib/roles'
import { useAsync } from '../lib/useAsync'

const roles: Role[] = ['Rep', 'AreaManager', 'RegionalManager', 'NationalSalesManager', 'Marketing', 'KeyAccountManager', 'Executive', 'Admin']

export function Team() {
  const { api, me } = useApp()
  const admin = isAdmin(me.role)
  const users = useAsync(() => api.get<AppUser[]>('/admin/users', { includeInactive: true }), [])
  const territories = useAsync(() => api.get<Territory[]>('/admin/territories'), [])
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()

  const nameOf = new Map((users.data ?? []).map((u) => [u.id, u.fullName]))
  const terrOf = new Map((territories.data ?? []).map((t) => [t.id, t.name]))

  async function act(fn: () => Promise<unknown>, ok: string) {
    setError(undefined); setMessage(undefined)
    try {
      await fn()
      setMessage(ok)
      users.reload(); territories.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function deactivate(u: AppUser) {
    const hasReports = (users.data ?? []).some((x) => x.managerId === u.id && x.isActive)
    let reassign: string | undefined
    if (hasReports) {
      const names = (users.data ?? []).filter((x) => x.isActive && x.id !== u.id).map((x) => `${x.fullName} (${x.id.slice(0, 8)})`).join('\n')
      const pick = window.prompt(`${u.fullName} has direct reports. Enter the id (first 8 characters) of the manager who takes them over:\n\n${names}`)
      if (!pick) return
      reassign = (users.data ?? []).find((x) => x.id.startsWith(pick.trim()))?.id
      if (!reassign) { setError('No user matches that id.'); return }
    }
    await act(() => api.post(`/admin/users/${u.id}/deactivate`, undefined, { reassignTo: reassign }), `${u.fullName} was deactivated.`)
  }

  return (
    <>
      <div className="page-head"><h1>Team and territories</h1></div>
      {message && <div className="notice" role="status">{message}</div>}
      {error && <ErrorBox message={error} />}

      <Section title="People">
        {users.error && <ErrorBox message={users.error} onRetry={users.reload} />}
        {users.loading && !users.data && <Loading />}
        {users.data && (users.data.length === 0 ? <Empty>No users yet.</Empty> : (
          <table>
            <thead><tr><th>Name</th><th>Role</th><th>Reports to</th><th>Territory</th><th>Status</th>{admin && <th />}</tr></thead>
            <tbody>
              {users.data.map((u) => (
                <tr key={u.id} className={u.isActive ? '' : 'inactive'}>
                  <td>{u.fullName}<div className="muted small">{u.email}</div></td>
                  <td>{u.role}</td>
                  <td>{u.managerId ? (nameOf.get(u.managerId) ?? '—') : '—'}</td>
                  <td>{u.territoryId ? (terrOf.get(u.territoryId) ?? '—') : '—'}</td>
                  <td><Badge tone={u.isActive ? 'good' : 'muted'}>{u.isActive ? 'Active' : 'Inactive'}</Badge></td>
                  {admin && <td>{u.isActive
                    ? <button onClick={() => deactivate(u)} disabled={u.id === me.id}>Deactivate</button>
                    : <button onClick={() => act(() => api.post(`/admin/users/${u.id}/reactivate`), `${u.fullName} was reactivated.`)}>Reactivate</button>}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
        {admin && users.data && territories.data && <AddUser users={users.data} territories={territories.data} onCreate={(body) => act(() => api.post('/admin/users', body), 'User added.')} />}
      </Section>

      <Section title="Territories">
        {territories.error && <ErrorBox message={territories.error} onRetry={territories.reload} />}
        {territories.data && (territories.data.length === 0 ? <Empty>No territories yet.</Empty> : (
          <table>
            <thead><tr><th>Name</th><th>Region</th><th>District</th></tr></thead>
            <tbody>{territories.data.map((t) => <tr key={t.id}><td>{t.name}</td><td>{t.region ?? '—'}</td><td>{t.district ?? '—'}</td></tr>)}</tbody>
          </table>
        ))}
        {admin && <AddTerritory onCreate={(body) => act(() => api.post('/admin/territories', body), 'Territory added.')} />}
      </Section>
    </>
  )
}

function AddUser({ users, territories, onCreate }: { users: AppUser[]; territories: Territory[]; onCreate: (body: unknown) => void }) {
  const [f, setF] = useState({ externalId: '', fullName: '', email: '', role: 'Rep' as Role, managerId: '', territoryId: '' })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onCreate({ ...f, managerId: f.managerId || null, territoryId: f.territoryId || null })
    setF({ ...f, externalId: '', fullName: '', email: '' })
  }
  return (
    <form className="form" onSubmit={submit} aria-label="Add user">
      <h3>Add a person</h3>
      <input required placeholder="Entra object id" aria-label="Entra object id" value={f.externalId} onChange={set('externalId')} />
      <input required placeholder="Full name" aria-label="Full name" value={f.fullName} onChange={set('fullName')} />
      <input required type="email" placeholder="Email" aria-label="Email" value={f.email} onChange={set('email')} />
      <select aria-label="Role" value={f.role} onChange={set('role')}>{roles.map((r) => <option key={r}>{r}</option>)}</select>
      <select aria-label="Reports to" value={f.managerId} onChange={set('managerId')}>
        <option value="">No manager</option>
        {users.filter((u) => u.isActive).map((u) => <option key={u.id} value={u.id}>{u.fullName} ({u.role})</option>)}
      </select>
      <select aria-label="Territory" value={f.territoryId} onChange={set('territoryId')}>
        <option value="">No territory</option>
        {territories.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <button className="primary" type="submit">Add</button>
    </form>
  )
}

function AddTerritory({ onCreate }: { onCreate: (body: unknown) => void }) {
  const [f, setF] = useState({ name: '', region: '', district: '' })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onCreate({ name: f.name, region: f.region || null, district: f.district || null })
    setF({ name: '', region: '', district: '' })
  }
  return (
    <form className="form" onSubmit={submit} aria-label="Add territory">
      <h3>Add a territory</h3>
      <input required placeholder="Name" aria-label="Territory name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <input placeholder="Region" aria-label="Region" value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })} />
      <input placeholder="District" aria-label="District" value={f.district} onChange={(e) => setF({ ...f, district: e.target.value })} />
      <button className="primary" type="submit">Add</button>
    </form>
  )
}
