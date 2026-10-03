import { HttpError } from "./access";
import type { DB, User } from "./model";
import { authConfig, cookieValue, readSession, SESSION_COOKIE } from "./auth";
import { getDb, withDb } from "./store";

export interface Ctx {
  db: DB;
  user: User;
  params: string[];
  q: URLSearchParams;
  body: any;
  text: string;
}

export interface Reply {
  status: number;
  body?: unknown;
  contentType?: string;
}

type Handler = (c: Ctx) => unknown | Reply;
interface Route {
  method: string;
  re: RegExp;
  handler: Handler;
  open: boolean;
}

const routes: Route[] = [];

function add(method: string, path: string, handler: Handler, open = false) {
  const re = new RegExp("^" + path.replace(/:[a-zA-Z]+/g, "([^/]+)") + "$");
  routes.push({ method, re, handler, open });
}

export const get = (p: string, h: Handler) => add("GET", p, h);
export const post = (p: string, h: Handler) => add("POST", p, h);
export const put = (p: string, h: Handler) => add("PUT", p, h);
export const del = (p: string, h: Handler) => add("DELETE", p, h);
/** A route that needs no sign-in. */
export const open = (p: string, h: Handler) => add("GET", p, h, true);

export const reply = (status: number, body?: unknown, contentType?: string): Reply => ({ status, body, contentType });
const isReply = (x: unknown): x is Reply => !!x && typeof x === "object" && "status" in x && Object.keys(x).every((k) => ["status", "body", "contentType"].includes(k));

export const num = (v: string | null, d: number) => {
  const n = Number(v);
  return v !== null && v !== "" && Number.isFinite(n) ? n : d;
};

export const bad = (msg: string): never => {
  throw new HttpError(422, msg);
};
export const notFound = (what: string): never => {
  throw new HttpError(404, `${what} not found.`);
};

/** Demo mode only: "builtin:<userId>" tokens, anyone can pick any role. See README. */
export function userFromAuth(auth: string | null | undefined): User | null {
  const m = /^Bearer\s+builtin:(\S+)$/i.exec(auth ?? "");
  if (!m) return null;
  const u = getDb().users.find((x) => x.id === m[1] && x.isActive);
  return u ?? null;
}

/**
 * Who is calling. In Microsoft mode that is the signed session cookie, and
 * every write must also carry the `Authorization: Bearer session` header: a
 * browser will not add a custom header to a cross-site form post, which blocks
 * cross-site request forgery on top of the SameSite cookie.
 */
async function authenticate(method: string, auth: string | null, cookie: string | null): Promise<User | null> {
  const cfg = authConfig();
  if (cfg.mode === "demo") return userFromAuth(auth);
  if (cfg.mode !== "entra") return null;
  if (method !== "GET" && !/^Bearer\s+session$/i.test(auth ?? "")) return null;
  const id = await readSession(cookieValue(cookie, SESSION_COOKIE), cfg.sessionSecret!);
  return getDb().users.find((x) => x.id === id && x.isActive) ?? null;
}

async function dispatchInner(
  method: string,
  path: string,
  q: URLSearchParams,
  text: string,
  auth: string | null,
  cookie: string | null = null,
): Promise<Reply> {
  try {
    for (const r of routes) {
      if (r.method !== method) continue;
      const m = r.re.exec(path);
      if (!m) continue;
      if (!r.open && authConfig().mode === "unconfigured") throw new HttpError(503, authConfig().reason ?? "Sign-in is not configured.");
      const user = r.open ? null : await authenticate(method, auth, cookie);
      if (!user && !r.open) throw new HttpError(401, "Not signed in.");
      let body: any = {};
      if (text && text.trim().startsWith("{")) {
        try {
          body = JSON.parse(text);
        } catch {
          throw new HttpError(400, "The request body is not valid JSON.");
        }
      }
      const out = r.handler({ db: getDb(), user: user as User, params: m.slice(1).map(decodeURIComponent), q, body, text });
      if (isReply(out)) return out;
      return { status: out === undefined ? 204 : 200, body: out };
    }
    throw new HttpError(404, `No such endpoint: ${method} ${path}`);
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, body: { title: e.message } };
    return { status: 500, body: { title: e instanceof Error ? e.message : "Something went wrong." } };
  }
}

/** Runs one API request with up-to-date data, and saves what it changed. */
export function dispatch(method: string, path: string, q: URLSearchParams, text: string, auth: string | null, cookie: string | null = null): Promise<Reply> {
  return withDb(() => dispatchInner(method, path, q, text, auth, cookie));
}
