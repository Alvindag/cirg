import { InteractionRequiredAuthError, PublicClientApplication, type AccountInfo } from '@azure/msal-browser'
import { config } from '../config'

export interface TokenSource {
  /** A valid access token, or null when the user has to sign in. */
  getToken(): Promise<string | null>
  signIn(): Promise<void>
  signOut(): Promise<void>
}

const DEV_KEY = 'das.devToken'

/** Development only: a pasted token for the API's dev signing key. Kept in sessionStorage, never localStorage. */
export function devToken(): string | null {
  try {
    return sessionStorage.getItem(DEV_KEY)
  } catch {
    return null
  }
}

export function setDevToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(DEV_KEY, token)
    else sessionStorage.removeItem(DEV_KEY)
  } catch { /* storage unavailable */ }
}

export type TokenCheck = { ok: true; token: string } | { ok: false; message: string }

const MAKE_ONE = 'Make a new one on your PC with: python scripts\\dev-token.py --role Admin | Set-Clipboard'

/**
 * Cleans up and sanity-checks a pasted development token before it is used, so a bad paste is explained instead of failing silently.
 * Copying from a terminal often adds line breaks or spaces inside the token, and "Bearer " or quotes in front; those are removed.
 */
export function checkPastedToken(raw: string, now: Date = new Date()): TokenCheck {
  const token = raw.replace(/^\s*(authorization:\s*)?bearer\s+/i, '').replace(/\s+/g, '').replace(/^["'`]+|["'`]+$/g, '')
  if (!token) return { ok: false, message: 'Paste the access token first.' }
  const parts = token.split('.')
  const shape = parts.length === 3 && parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p))
  let exp: number | undefined
  if (shape) {
    try {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
      const claims = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))) as { exp?: unknown }
      if (typeof claims.exp === 'number') exp = claims.exp
    } catch {
      return { ok: false, message: `That does not look like a token. ${MAKE_ONE}` }
    }
  }
  if (!shape) return { ok: false, message: `That does not look like a token: it should be one long line of three parts separated by two dots. ${MAKE_ONE}` }
  if (exp !== undefined && exp * 1000 <= now.getTime()) {
    return { ok: false, message: `This token expired on ${new Date(exp * 1000).toLocaleString()}. ${MAKE_ONE}` }
  }
  return { ok: true, token }
}

export function createDevSource(token: string): TokenSource {
  return {
    getToken: async () => token,
    signIn: async () => {},
    signOut: async () => setDevToken(null),
  }
}

/** Microsoft Entra ID sign-in (authorization code + PKCE, redirect flow). Tokens live in sessionStorage. */
export async function createMsalSource(): Promise<{ source: TokenSource; account: AccountInfo | null }> {
  const pca = new PublicClientApplication({
    auth: {
      clientId: config.entraClientId,
      authority: `https://login.microsoftonline.com/${config.entraTenant}`,
      redirectUri: window.location.origin,
      postLogoutRedirectUri: window.location.origin,
    },
    cache: { cacheLocation: 'sessionStorage' },
  })
  await pca.initialize()
  const redirected = await pca.handleRedirectPromise()
  const account = redirected?.account ?? pca.getActiveAccount() ?? pca.getAllAccounts()[0] ?? null
  if (account) pca.setActiveAccount(account)
  const request = { scopes: [config.apiScope] }

  const source: TokenSource = {
    async getToken() {
      const acct = pca.getActiveAccount()
      if (!acct) return null
      try {
        return (await pca.acquireTokenSilent({ ...request, account: acct })).accessToken
      } catch (e) {
        if (e instanceof InteractionRequiredAuthError) return null // session expired or MFA needed: sign in again
        throw e
      }
    },
    signIn: () => pca.loginRedirect(request),
    signOut: () => pca.logoutRedirect({ account: pca.getActiveAccount() ?? undefined }),
  }
  return { source, account }
}
