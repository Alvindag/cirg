import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { createApi } from '../api/client'
import { ApiError } from '../api/client'
import type { Me } from '../api/types'
import { AppContext } from '../context'
import { config } from '../config'
import { createDevSource, createMsalSource, devToken, setDevToken, type TokenSource } from './tokenSource'

type State =
  | { kind: 'loading' }
  | { kind: 'signedOut'; message?: string }
  | { kind: 'signedIn'; me: Me }

interface Props {
  children: ReactNode
  /** Tests inject a ready token source instead of MSAL. */
  sourceOverride?: TokenSource
}

/** Signs the user in (Microsoft Entra ID, or a pasted token in development), loads who they are, then renders the app. */
export function AuthGate({ children, sourceOverride }: Props) {
  const [source, setSource] = useState<TokenSource | undefined>(sourceOverride)
  const [state, setState] = useState<State>({ kind: 'loading' })

  const signOut = useCallback(() => {
    void source?.signOut()
    setState({ kind: 'signedOut' })
  }, [source])

  const api = useMemo(
    () => (source ? createApi({ baseUrl: config.apiBaseUrl, getToken: () => source.getToken(), onUnauthorized: () => setState({ kind: 'signedOut', message: 'Your session has ended. Please sign in again.' }) }) : null),
    [source],
  )

  // 1. find a token source
  useEffect(() => {
    if (sourceOverride) return
    let cancelled = false
    ;(async () => {
      try {
        const dev = config.devLogin ? devToken() : null
        if (dev) return !cancelled && setSource(createDevSource(dev))
        if (!config.entraClientId) return !cancelled && setState({ kind: 'signedOut', message: 'Microsoft sign-in is not configured for this site (VITE_ENTRA_CLIENT_ID).' })
        const { source: msal, account } = await createMsalSource()
        if (cancelled) return
        if (account) setSource(msal)
        else { setSource(msal); setState({ kind: 'signedOut' }) }
      } catch (e) {
        if (!cancelled) setState({ kind: 'signedOut', message: `Sign-in could not start: ${e instanceof Error ? e.message : e}` })
      }
    })()
    return () => { cancelled = true }
  }, [sourceOverride])

  // 2. with a token, find out who the user is (the API maps the Entra identity to a DAS user and role)
  useEffect(() => {
    if (!api || !source) return
    let cancelled = false
    ;(async () => {
      if (!(await source.getToken())) return !cancelled && setState({ kind: 'signedOut' })
      try {
        const me = await api.get<Me>('/me')
        if (!cancelled) setState({ kind: 'signedIn', me })
      } catch (e) {
        if (cancelled) return
        if (e instanceof ApiError && e.status === 403) setState({ kind: 'signedOut', message: 'Your account is not set up for DAS Engage 360. Ask your administrator to add you.' })
        else if (!(e instanceof ApiError && e.status === 401)) setState({ kind: 'signedOut', message: `Could not reach the server: ${e instanceof Error ? e.message : e}` })
      }
    })()
    return () => { cancelled = true }
  }, [api, source])

  if (state.kind === 'loading') return <div className="center muted" role="status">Loading…</div>
  if (state.kind === 'signedOut') return <SignIn message={state.message} source={source} onDevToken={(t) => { setDevToken(t); setSource(createDevSource(t)); setState({ kind: 'loading' }) }} />
  return <AppContext.Provider value={{ api: api!, me: state.me, signOut }}>{children}</AppContext.Provider>
}

function SignIn({ message, source, onDevToken }: { message?: string; source?: TokenSource; onDevToken: (t: string) => void }) {
  const [token, setToken] = useState('')
  const submit = (e: FormEvent) => { e.preventDefault(); if (token.trim()) onDevToken(token.trim()) }
  return (
    <main className="center">
      <h1>DAS Engage 360</h1>
      <p className="muted">Sales force and sample management dashboard</p>
      {message && <div className="error" role="alert">{message}</div>}
      {source && <button className="primary" onClick={() => void source.signIn()}>Sign in with Microsoft</button>}
      {config.devLogin && (
        <form onSubmit={submit} className="form" aria-label="Development sign-in">
          <h3>Development sign-in</h3>
          <input type="password" placeholder="Access token" aria-label="Access token" value={token} onChange={(e) => setToken(e.target.value)} />
          <button type="submit">Use token</button>
        </form>
      )}
    </main>
  )
}
