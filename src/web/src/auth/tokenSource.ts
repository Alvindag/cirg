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
