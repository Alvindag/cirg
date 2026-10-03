import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTVerifyGetKey } from "jose";

/**
 * Microsoft Entra ID sign-in (OpenID Connect, authorization code flow with PKCE).
 *
 * The server does the whole exchange. The browser only ever holds an
 * HttpOnly session cookie, never a Microsoft token.
 *
 * Modes:
 *   entra         all ENTRA_* settings and AUTH_SESSION_SECRET are present
 *   demo          no Entra settings; the role picker. Allowed in development,
 *                 and in production only with ALLOW_DEMO_AUTH=true
 *   unconfigured  production without Entra and without ALLOW_DEMO_AUTH, or
 *                 Entra settings that are only partly filled in. The API refuses
 *                 everything (fail closed).
 */
export type AuthMode = "entra" | "demo" | "unconfigured";

export interface AuthConfig {
  mode: AuthMode;
  reason?: string;
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  sessionSecret?: string;
  /** Where Microsoft's endpoints live. Overridden only to test against a fake. */
  authorityHost: string;
  bootstrapAdminEmail?: string;
}

const ENTRA_VARS = ["ENTRA_TENANT_ID", "ENTRA_CLIENT_ID", "ENTRA_CLIENT_SECRET", "AUTH_SESSION_SECRET"] as const;

export function authConfig(env: Record<string, string | undefined> = process.env): AuthConfig {
  const authorityHost = (env.ENTRA_AUTHORITY_HOST ?? "https://login.microsoftonline.com").replace(/\/+$/, "");
  const present = ENTRA_VARS.filter((k) => env[k]?.trim());
  if (present.length === ENTRA_VARS.length) {
    if ((env.AUTH_SESSION_SECRET ?? "").length < 32) {
      return { mode: "unconfigured", reason: "AUTH_SESSION_SECRET must be at least 32 characters.", authorityHost };
    }
    return {
      mode: "entra",
      tenantId: env.ENTRA_TENANT_ID,
      clientId: env.ENTRA_CLIENT_ID,
      clientSecret: env.ENTRA_CLIENT_SECRET,
      sessionSecret: env.AUTH_SESSION_SECRET,
      authorityHost,
      bootstrapAdminEmail: env.ENTRA_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() || undefined,
    };
  }
  if (present.length > 0) {
    const missing = ENTRA_VARS.filter((k) => !env[k]?.trim());
    return { mode: "unconfigured", reason: `Microsoft sign-in is only partly configured. Missing: ${missing.join(", ")}.`, authorityHost };
  }
  if (env.NODE_ENV !== "production" || env.ALLOW_DEMO_AUTH === "true") return { mode: "demo", authorityHost };
  return {
    mode: "unconfigured",
    reason: "Sign-in is not configured. Set the ENTRA_* settings, or ALLOW_DEMO_AUTH=true for a demo.",
    authorityHost,
  };
}

export const SESSION_COOKIE = "das_session";
export const FLOW_COOKIE = "das_oauth";
export const SESSION_HOURS = 8;

const enc = (s: string) => new TextEncoder().encode(s);
const b64url = (b: Buffer) => b.toString("base64url");

/* ---------- session cookie ---------- */

export async function signSession(userId: string, secret: string, now = Date.now()) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt(Math.floor(now / 1000))
    .setExpirationTime(Math.floor(now / 1000) + SESSION_HOURS * 3600)
    .sign(enc(secret));
}

export async function readSession(token: string | undefined, secret: string): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, enc(secret), { algorithms: ["HS256"] });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export function cookieValue(header: string | null | undefined, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

/* ---------- sign-in flow ---------- */

export interface Flow {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
}

export function newFlow(returnTo: string): { flow: Flow; challenge: string } {
  const verifier = b64url(randomBytes(32));
  return {
    flow: { state: b64url(randomBytes(16)), nonce: b64url(randomBytes(16)), verifier, returnTo: safeReturnTo(returnTo) },
    challenge: b64url(createHash("sha256").update(verifier).digest()),
  };
}

/** Only same-site paths, so the sign-in page cannot be used to bounce people elsewhere. */
export function safeReturnTo(p: string | null | undefined): string {
  return p && p.startsWith("/") && !p.startsWith("//") && !p.includes("\\") ? p : "/";
}

export async function signFlow(flow: Flow, secret: string) {
  return new SignJWT({ ...flow }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("10m").sign(enc(secret));
}

export async function readFlow(token: string | undefined, secret: string): Promise<Flow | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, enc(secret), { algorithms: ["HS256"] });
    const { state, nonce, verifier, returnTo } = payload as Partial<Flow>;
    return state && nonce && verifier && returnTo ? { state, nonce, verifier, returnTo } : null;
  } catch {
    return null;
  }
}

const authority = (c: AuthConfig) => `${c.authorityHost}/${c.tenantId}`;

export function authorizeUrl(c: AuthConfig, p: { redirectUri: string; state: string; nonce: string; challenge: string }) {
  const u = new URL(`${authority(c)}/oauth2/v2.0/authorize`);
  u.search = new URLSearchParams({
    client_id: c.clientId!,
    response_type: "code",
    redirect_uri: p.redirectUri,
    response_mode: "query",
    scope: "openid profile email",
    state: p.state,
    nonce: p.nonce,
    code_challenge: p.challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return u.toString();
}

export async function exchangeCode(c: AuthConfig, code: string, verifier: string, redirectUri: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const r = await fetchImpl(`${authority(c)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.clientId!,
      client_secret: c.clientSecret!,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });
  const j = (await r.json().catch(() => ({}))) as { id_token?: string };
  if (!r.ok || !j.id_token) throw new Error("Microsoft did not return an ID token.");
  return j.id_token;
}

export function remoteKeys(c: AuthConfig): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL(`${authority(c)}/discovery/v2.0/keys`));
}

export interface IdClaims {
  oid: string;
  email: string;
  name?: string;
}

/** Checks signature, issuer, audience, expiry, tenant and nonce, then pulls out who signed in. */
export async function verifyIdToken(
  idToken: string,
  c: AuthConfig,
  nonce: string,
  getKey: JWTVerifyGetKey = remoteKeys(c),
): Promise<IdClaims> {
  const { payload } = await jwtVerify(idToken, getKey, {
    issuer: `${authority(c)}/v2.0`,
    audience: c.clientId,
    algorithms: ["RS256"],
  });
  if (payload.nonce !== nonce) throw new Error("Sign-in response did not match the request.");
  if (payload.tid !== c.tenantId) throw new Error("Wrong Microsoft tenant.");
  const oid = typeof payload.oid === "string" ? payload.oid : typeof payload.sub === "string" ? payload.sub : "";
  const email = String(payload.email ?? payload.preferred_username ?? "").trim().toLowerCase();
  if (!oid || !email) throw new Error("The ID token has no account identifier or email.");
  return { oid, email, name: typeof payload.name === "string" ? payload.name : undefined };
}
