export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

type Query = Record<string, string | number | boolean | null | undefined>

export interface Api {
  get<T>(path: string, query?: Query): Promise<T>
  post<T>(path: string, body?: unknown, query?: Query): Promise<T>
  /** POST a plain-text body (used for CSV import). */
  put<T>(path: string, body?: unknown, query?: Query): Promise<T>
  del<T>(path: string, query?: Query): Promise<T>
  postText<T>(path: string, text: string, query?: Query, contentType?: string): Promise<T>
  /** Downloads a file (with the bearer token) and offers it to the browser. */
  download(path: string, query: Query, filename: string): Promise<void>
}

export interface ApiOptions {
  baseUrl: string
  getToken: () => Promise<string | null>
  /** Called when the API refuses the token (401): sign the user out. */
  onUnauthorized: () => void
  fetchImpl?: typeof fetch
}

function withQuery(url: string, query?: Query): string {
  if (!query) return url
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `${url}?${s}` : url
}

async function errorMessage(r: Response): Promise<string> {
  const text = await r.text().catch(() => '')
  if (!text) return r.statusText || `Request failed (${r.status})`
  try {
    const j = JSON.parse(text)
    if (typeof j === 'string') return j
    if (j && typeof j === 'object') return j.detail ?? j.title ?? text
  } catch { /* plain text */ }
  return text
}

export function createApi(o: ApiOptions): Api {
  const doFetch = o.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a))

  async function send(method: string, path: string, init: { query?: Query; body?: BodyInit; contentType?: string }): Promise<Response> {
    const token = await o.getToken()
    if (!token) {
      o.onUnauthorized()
      throw new ApiError(401, 'Not signed in.')
    }
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
    if (init.contentType) headers['Content-Type'] = init.contentType
    const r = await doFetch(withQuery(`${o.baseUrl}/api/v1${path}`, init.query), { method, headers, body: init.body })
    if (r.status === 401) o.onUnauthorized()
    if (!r.ok) throw new ApiError(r.status, await errorMessage(r))
    return r
  }

  async function json<T>(r: Response): Promise<T> {
    const text = r.status === 204 ? '' : await r.text()
    return (text ? JSON.parse(text) : undefined) as T
  }

  return {
    get: async (path, query) => json(await send('GET', path, { query })),
    post: async (path, body, query) =>
      json(await send('POST', path, { query, body: body === undefined ? undefined : JSON.stringify(body), contentType: body === undefined ? undefined : 'application/json' })),
    put: async (path, body, query) =>
      json(await send('PUT', path, { query, body: body === undefined ? undefined : JSON.stringify(body), contentType: body === undefined ? undefined : 'application/json' })),
    del: async (path, query) => json(await send('DELETE', path, { query })),
    postText: async (path, text, query, contentType = 'text/csv') => json(await send('POST', path, { query, body: text, contentType })),
    download: async (path, query, filename) => {
      const blob = await (await send('GET', path, { query })).blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    },
  }
}
