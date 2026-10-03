import { DAS_API_PREFIX } from "./config";

export class DasApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "DasApiError";
  }
}

export type Query = Record<
  string,
  string | number | boolean | null | undefined
>;

function withQuery(url: string, query?: Query) {
  if (!query) return url;
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `${url}?${s}` : url;
}

async function errorMessage(r: Response) {
  const text = await r.text().catch(() => "");
  if (!text) return r.statusText || `Request failed (${r.status})`;
  try {
    const j = JSON.parse(text);
    if (typeof j === "string") return j;
    if (j && typeof j === "object") return j.detail ?? j.title ?? text;
  } catch {
    /* plain text */
  }
  return text;
}

/** GET a JSON resource from the DAS Engage 360 API with a bearer token. */
export async function dasGet<T>(
  path: string,
  token: string,
  query?: Query,
  signal?: AbortSignal,
): Promise<T> {
  const r = await fetch(withQuery(`${DAS_API_PREFIX}${path}`, query), {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!r.ok) throw new DasApiError(r.status, await errorMessage(r));
  const text = r.status === 204 ? "" : await r.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
