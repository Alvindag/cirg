import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../config', () => ({ config: { apiBaseUrl: '', entraClientId: '', entraTenant: 'organizations', apiScope: 'x', devLogin: true } }))

import { AuthGate } from './AuthGate'
import { checkPastedToken } from './tokenSource'

const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const make = (exp: number) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ das_uid: 'u', exp })}.sig_nature-123`
const future = Math.floor(Date.now() / 1000) + 3600
const past = Math.floor(Date.now() / 1000) - 3600

describe('checking a pasted development token', () => {
  it('accepts a good token and removes what copying adds: line breaks, spaces, quotes and "Bearer"', () => {
    const t = make(future)
    for (const pasted of [t, `  ${t}\n`, `Bearer ${t}`, `"${t}"`, `Authorization: Bearer ${t}`, `${t.slice(0, 40)}\r\n${t.slice(40, 90)} ${t.slice(90)}`]) {
      expect(checkPastedToken(pasted)).toEqual({ ok: true, token: t })
    }
  })

  it('explains what is wrong with a bad one', () => {
    expect(checkPastedToken('   ')).toEqual({ ok: false, message: 'Paste the access token first.' })
    expect(checkPastedToken('not a token')).toMatchObject({ ok: false, message: expect.stringContaining('does not look like a token') })
    expect(checkPastedToken('a.b')).toMatchObject({ ok: false })
    expect(checkPastedToken('aaa.%%%.ccc')).toMatchObject({ ok: false })
    expect(checkPastedToken(`${b64({})}.${btoa('not json')}.sig`)).toMatchObject({ ok: false, message: expect.stringContaining('does not look like a token') })
    const expired = checkPastedToken(make(past))
    expect(expired).toMatchObject({ ok: false, message: expect.stringContaining('expired') })
    expect((expired as { message: string }).message).toContain('dev-token.py')
  })
})

describe('the development sign-in form', () => {
  beforeEach(() => sessionStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it('is not an error in development that Microsoft sign-in is missing, and a bad paste is explained instead of ignored', async () => {
    const user = userEvent.setup()
    render(<AuthGate><p>the app</p></AuthGate>)
    await screen.findByLabelText('Access token')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument() // the old red "not configured" box is gone
    expect(screen.getByText(/Microsoft sign-in is not set up on this site/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Use token' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Paste the access token first')
    await user.type(screen.getByLabelText('Access token'), 'rubbish')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument() // typing clears the old message
    await user.click(screen.getByRole('button', { name: 'Use token' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('does not look like a token')
    expect(screen.queryByText('the app')).not.toBeInTheDocument()
  })

  it('lets the person see what they pasted', async () => {
    const user = userEvent.setup()
    render(<AuthGate><p>the app</p></AuthGate>)
    const box = await screen.findByLabelText('Access token')
    expect(box).toHaveAttribute('type', 'password')
    await user.click(screen.getByLabelText('Show what I pasted'))
    expect(box).toHaveAttribute('type', 'text')
  })

  it('signs in with a cleaned-up token and asks the API who they are', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'u', tenantId: 't', fullName: 'Dev Admin', email: 'a@x', role: 'Admin', territoryId: null }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const t = make(future)
    render(<AuthGate><p>the app</p></AuthGate>)
    await user.click(await screen.findByLabelText('Access token'))
    await user.paste(`Bearer ${t}\n`)
    await user.click(screen.getByRole('button', { name: 'Use token' }))
    expect(await screen.findByText('the app')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/v1/me'), expect.objectContaining({ headers: { Authorization: `Bearer ${t}` } }))
    expect(sessionStorage.getItem('das.devToken')).toBe(t)
  })
})
