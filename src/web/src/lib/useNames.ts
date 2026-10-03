import type { AppUser } from '../api/types'
import { shortId } from './format'
import { useApp } from '../context'
import { isManager } from './roles'
import { useAsync } from './useAsync'

/** Maps user ids to names. Only managers can list users; for others ids are shown shortened. */
export function useUserNames(): { name: (id: string | null | undefined) => string; users: AppUser[] } {
  const { api, me } = useApp()
  const { data } = useAsync(
    () => (isManager(me.role) ? api.get<AppUser[]>('/admin/users', { includeInactive: true }) : Promise.resolve([] as AppUser[])),
    [me.role],
  )
  const users = data ?? []
  const map = new Map(users.map((u) => [u.id, u.fullName]))
  return { users, name: (id) => (id ? (map.get(id) ?? shortId(id)) : '—') }
}
