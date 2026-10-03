import { describe, expect, it, vi } from 'vitest'
import { ApiError, createApi } from './client'

function setup(response: Response | (() => Response), token: string | null = 'tok') {
  const fetchImpl = vi.fn(async () => (typeof response === 'function' ? response() : response))
  const onUnauthorized = vi.fn()
  const api = createApi({ baseUrl: 'https://api.test', getToken: async () => token, onUnauthorized, fetchImpl: fetchImpl as unknown as typeof fetch })
  return { api, fetchImpl, onUnauthorized }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('api client', () => {
  it('sends the bearer token and builds the query without empty values', async () => {
    const { api, fetchImpl } = setup(json({ ok: 1 }))
    await api.get('/customers', { q: 'ama', type: '', segment: undefined, page: 2, flag: false })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.test/api/v1/customers?q=ama&page=2&flag=false')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(init.method).toBe('GET')
  })

  it('posts JSON, and only sets a content type when there is a body', async () => {
    const { api, fetchImpl } = setup(() => json({ id: 1 }))
    await api.post('/x', { a: 1 })
    await api.post('/y')
    const [, a] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    const [, b] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit]
    expect(a.body).toBe('{"a":1}')
    expect((a.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(b.body).toBeUndefined()
    expect((b.headers as Record<string, string>)['Content-Type']).toBeUndefined()
  })

  it('posts text such as CSV with its content type', async () => {
    const { api, fetchImpl } = setup(json({ created: 1 }))
    await api.postText('/customers/import', 'type,name\nDoctor,A', { dryRun: true })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('dryRun=true')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('text/csv')
    expect(init.body).toBe('type,name\nDoctor,A')
  })

  it('returns undefined for 204 and for empty bodies', async () => {
    expect(await setup(new Response(null, { status: 204 })).api.post('/x')).toBeUndefined()
    expect(await setup(new Response('', { status: 202 })).api.post('/x')).toBeUndefined()
  })

  it('reads error messages from JSON strings, problem details and plain text', async () => {
    await expect(setup(json('Name is required.', 400)).api.get('/x')).rejects.toMatchObject({ status: 400, message: 'Name is required.' })
    await expect(setup(json({ title: 'Bad thing', detail: 'More detail' }, 400)).api.get('/x')).rejects.toMatchObject({ message: 'More detail' })
    await expect(setup(new Response('plain failure', { status: 500 })).api.get('/x')).rejects.toBeInstanceOf(ApiError)
    await expect(setup(new Response('', { status: 503, statusText: 'Unavailable' })).api.get('/x')).rejects.toMatchObject({ message: 'Unavailable' })
  })

  it('signs the user out on 401 and when there is no token', async () => {
    const a = setup(new Response('', { status: 401 }))
    await expect(a.api.get('/x')).rejects.toMatchObject({ status: 401 })
    expect(a.onUnauthorized).toHaveBeenCalled()

    const b = setup(json({}), null)
    await expect(b.api.get('/x')).rejects.toMatchObject({ status: 401 })
    expect(b.onUnauthorized).toHaveBeenCalled()
    expect(b.fetchImpl).not.toHaveBeenCalled()
  })

  it('does not sign out on 403', async () => {
    const a = setup(new Response('Forbidden', { status: 403 }))
    await expect(a.api.get('/x')).rejects.toMatchObject({ status: 403 })
    expect(a.onUnauthorized).not.toHaveBeenCalled()
  })
})
