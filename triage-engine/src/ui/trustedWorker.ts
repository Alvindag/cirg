/** Trusted Types: the only place a script URL is minted. Same-origin URLs only. */
interface TTPolicy { createScriptURL(s: string): string }
interface TTFactory { createPolicy(name: string, rules: { createScriptURL(s: string): string }): TTPolicy }

let policy: TTPolicy | null = null

export function createIngestWorker(url: URL): Worker {
  if (url.origin !== self.location.origin) throw new Error('Refusing cross-origin worker script')
  const tt = (self as unknown as { trustedTypes?: TTFactory }).trustedTypes
  if (tt && !policy) {
    policy = tt.createPolicy('triage-worker', {
      createScriptURL: (s) => {
        if (new URL(s, self.location.href).origin !== self.location.origin) throw new Error('Blocked script URL')
        return s
      },
    })
  }
  return new Worker((policy ? policy.createScriptURL(url.href) : url.href) as string, { type: 'module' })
}
