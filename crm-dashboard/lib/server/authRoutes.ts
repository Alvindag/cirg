import { NextResponse } from "next/server";

import { authConfig, authorizeUrl, cookieValue, exchangeCode, FLOW_COOKIE, newFlow, readFlow, SESSION_COOKIE, SESSION_HOURS, signFlow, signSession, verifyIdToken } from "./auth";
import { resolveEntraUser } from "./identity";
import { logAudit, getDb, save } from "./store";

/** The public address of the app, for the redirect URI registered in Entra. */
const baseUrl = (req: Request) => (process.env.APP_BASE_URL?.replace(/\/+$/, "") ?? new URL(req.url).origin);
const secure = (req: Request) => baseUrl(req).startsWith("https://");

const cookieOpts = (req: Request, maxAge: number) => ({ httpOnly: true, sameSite: "lax" as const, secure: secure(req), path: "/", maxAge });

const toApp = (req: Request, path: string, params?: Record<string, string>) => {
  const u = new URL(path, baseUrl(req));
  for (const [k, v] of Object.entries(params ?? {})) u.searchParams.set(k, v);
  return NextResponse.redirect(u);
};

export async function login(req: Request) {
  const cfg = authConfig();
  if (cfg.mode !== "entra") return toApp(req, "/connect", { signin_error: cfg.reason ?? "Microsoft sign-in is not configured." });
  const { flow, challenge } = newFlow(new URL(req.url).searchParams.get("returnTo") ?? "/");
  const res = NextResponse.redirect(authorizeUrl(cfg, { redirectUri: `${baseUrl(req)}/auth/callback`, state: flow.state, nonce: flow.nonce, challenge }));
  res.cookies.set(FLOW_COOKIE, await signFlow(flow, cfg.sessionSecret!), cookieOpts(req, 600));
  return res;
}

export async function callback(req: Request) {
  const cfg = authConfig();
  if (cfg.mode !== "entra") return toApp(req, "/connect", { signin_error: "Microsoft sign-in is not configured." });
  const url = new URL(req.url);
  const fail = (msg: string) => {
    const res = toApp(req, "/connect", { signin_error: msg });
    res.cookies.delete(FLOW_COOKIE);
    return res;
  };
  if (url.searchParams.get("error")) return fail(url.searchParams.get("error_description") ?? "Microsoft refused the sign-in.");
  const flow = await readFlow(cookieValue(req.headers.get("cookie"), FLOW_COOKIE), cfg.sessionSecret!);
  const code = url.searchParams.get("code");
  if (!flow || !code || url.searchParams.get("state") !== flow.state) return fail("The sign-in expired or did not match. Please try again.");
  try {
    const idToken = await exchangeCode(cfg, code, flow.verifier, `${baseUrl(req)}/auth/callback`);
    const claims = await verifyIdToken(idToken, cfg, flow.nonce);
    const r = resolveEntraUser(getDb(), claims, cfg.bootstrapAdminEmail);
    if ("error" in r) {
      logAudit(null, "SignInDenied", "User", claims.oid, { email: claims.email });
      save();
      return fail(r.error);
    }
    logAudit(r.user.id, "SignIn", "User", r.user.id);
    save();
    const res = toApp(req, flow.returnTo);
    res.cookies.set(SESSION_COOKIE, await signSession(r.user.id, cfg.sessionSecret!), cookieOpts(req, SESSION_HOURS * 3600));
    res.cookies.delete(FLOW_COOKIE);
    return res;
  } catch {
    return fail("Could not complete the Microsoft sign-in. Please try again.");
  }
}

/** POST only, and only from this site: a link on another site cannot sign people out. */
export async function logout(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(baseUrl(req)).origin) return new NextResponse(null, { status: 403 });
  const res = new NextResponse(null, { status: 204 });
  res.cookies.set(SESSION_COOKIE, "", { ...cookieOpts(req, 0), maxAge: 0 });
  return res;
}
