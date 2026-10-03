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

export type SendOptions = {
  query?: Query;
  /** JSON body. */
  body?: unknown;
  /** Plain-text body (CSV import). */
  text?: string;
  contentType?: string;
  signal?: AbortSignal;
};

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

async function send(
  method: string,
  path: string,
  token: string,
  o: SendOptions,
): Promise<Response> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  let body: BodyInit | undefined;
  if (o.text !== undefined) {
    body = o.text;
    headers["Content-Type"] = o.contentType ?? "text/csv";
  } else if (o.body !== undefined) {
    body = JSON.stringify(o.body);
    headers["Content-Type"] = "application/json";
  }
  const r = await fetch(withQuery(`${DAS_API_PREFIX}${path}`, o.query), {
    method,
    headers,
    body,
    signal: o.signal,
  });
  if (!r.ok) throw new DasApiError(r.status, await errorMessage(r));
  return r;
}

/** Sends a request to the DAS Engage 360 API and parses the JSON reply (if any). */
export async function dasSend<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  token: string,
  o: SendOptions = {},
): Promise<T> {
  const r = await send(method, path, token, o);
  const text = r.status === 204 ? "" : await r.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const dasGet = <T>(
  path: string,
  token: string,
  query?: Query,
  signal?: AbortSignal,
) => dasSend<T>("GET", path, token, { query, signal });

/** Downloads a file (with the bearer token) and offers it to the browser. */
export async function dasDownload(
  path: string,
  token: string,
  query: Query,
  filename: string,
) {
  const blob = await (await send("GET", path, token, { query })).blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
