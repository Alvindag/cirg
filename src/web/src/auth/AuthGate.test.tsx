import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthGate } from './AuthGate'
import type { TokenSource } from './tokenSource'

const source = (token: string | null): TokenSource => ({ getToken: async () => token, signIn: vi.fn(async () => {}), signOut: vi.fn(async () => {}) })
const meBody = { id: 'u1', tenantId: 't', fullName: 'Ama Manager', email: 'a@x.test', role: 'AreaManager', territoryId: null }

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })))
}

afterEach(() => vi.unstubAllGlobals())

describe('AuthGate', () => {
  it('loads who the user is and renders the app', async () => {
    mockFetch(200, meBody)
    render(<AuthGate sourceOverride={source('tok')}><p>the app</p></AuthGate>)
    expect(await screen.findByText('the app')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/me'), expect.objectContaining({ headers: { Authorization: 'Bearer tok' } }))
  })

  it('explains when the Entra account is not a DAS user', async () => {
    mockFetch(403, 'Forbidden')
    render(<AuthGate sourceOverride={source('tok')}><p>the app</p></AuthGate>)
    expect(await screen.findByRole('alert')).toHaveTextContent('not set up for DAS Engage 360')
    expect(screen.queryByText('the app')).not.toBeInTheDocument()
  })

  it('offers sign-in when there is no token', async () => {
    const s = source(null)
    render(<AuthGate sourceOverride={s}><p>the app</p></AuthGate>)
    const btn = await screen.findByText('Sign in with Microsoft')
    btn.click()
    expect(s.signIn).toHaveBeenCalled()
    expect(screen.queryByText('the app')).not.toBeInTheDocument()
  })

  it('returns to sign-in with a message when the server rejects the token', async () => {
    mockFetch(401, '')
    render(<AuthGate sourceOverride={source('stale')}><p>the app</p></AuthGate>)
    expect(await screen.findByRole('alert')).toHaveTextContent('session has ended')
  })

  it('reports an unreachable server', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    render(<AuthGate sourceOverride={source('tok')}><p>the app</p></AuthGate>)
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server')
  })
})
