import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import type { Api } from '../api/client'
import type { Me, Role } from '../api/types'
import { AppContext } from '../context'

export type Handler = (query?: Record<string, unknown>, body?: unknown) => unknown

/** A fake API: handlers keyed by "GET /path" or "POST /path". Unknown routes fail the test loudly. */
export function fakeApi(handlers: Record<string, Handler>) {
  const call = async (method: string, path: string, query?: Record<string, unknown>, body?: unknown) => {
    const h = handlers[`${method} ${path}`]
    if (!h) throw new Error(`Unexpected request: ${method} ${path}`)
    return h(query, body)
  }
  const api = {
    get: vi.fn((path: string, query?: Record<string, unknown>) => call('GET', path, query)),
    post: vi.fn((path: string, body?: unknown, query?: Record<string, unknown>) => call('POST', path, query, body)),
    put: vi.fn((path: string, body?: unknown, query?: Record<string, unknown>) => call('PUT', path, query, body)),
    del: vi.fn((path: string, query?: Record<string, unknown>) => call('DELETE', path, query)),
    postText: vi.fn((path: string, text: string, query?: Record<string, unknown>) => call('POST', path, query, text)),
    download: vi.fn(async () => {}),
  }
  return api as unknown as Api & typeof api
}

export const me = (role: Role, over: Partial<Me> = {}): Me => ({
  id: 'u-me-00000000', tenantId: 't1', fullName: 'Test Person', email: 't@x.test', role, territoryId: null, ...over,
})

export function renderApp(ui: ReactElement, api: Api, user: Me, route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppContext.Provider value={{ api, me: user, signOut: vi.fn() }}>{ui}</AppContext.Provider>
    </MemoryRouter>,
  )
}

export const users = [
  { id: 'rep-1', tenantId: 't1', fullName: 'Kofi Rep', email: 'k@x.test', role: 'Rep', territoryId: 'terr-1', externalId: 'e1', managerId: 'area-1', isActive: true },
  { id: 'area-1', tenantId: 't1', fullName: 'Ama Area', email: 'a@x.test', role: 'AreaManager', territoryId: 'terr-1', externalId: 'e2', managerId: null, isActive: true },
]
