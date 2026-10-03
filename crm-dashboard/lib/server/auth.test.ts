import os from "node:os";
import path from "node:path";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

process.env.CRM_DATA_FILE = path.join(os.tmpdir(), `crm-auth-test-${process.pid}.json`);

import { authConfig, newFlow, readFlow, readSession, safeReturnTo, signFlow, signSession, verifyIdToken, type AuthConfig } from "./auth";

const SECRET = "s".repeat(40);
const ENTRA = { ENTRA_TENANT_ID: "tenant-1", ENTRA_CLIENT_ID: "client-1", ENTRA_CLIENT_SECRET: "x", AUTH_SESSION_SECRET: SECRET };
const cfg: AuthConfig = { ...(authConfig({ ...ENTRA, NODE_ENV: "production" })) };

describe("auth mode", () => {
  it("uses Microsoft when fully configured", () => expect(authConfig({ ...ENTRA, NODE_ENV: "production" }).mode).toBe("entra"));
  it("allows the demo picker in development", () => expect(authConfig({ NODE_ENV: "development" }).mode).toBe("demo"));
  it("refuses to run the demo picker in production unless asked", () => {
    expect(authConfig({ NODE_ENV: "production" }).mode).toBe("unconfigured");
    expect(authConfig({ NODE_ENV: "production", ALLOW_DEMO_AUTH: "true" }).mode).toBe("demo");
  });
  it("fails closed on partial Microsoft settings, even in development", () => {
    const c = authConfig({ ENTRA_TENANT_ID: "t", NODE_ENV: "development" });
    expect(c.mode).toBe("unconfigured");
    expect(c.reason).toMatch(/ENTRA_CLIENT_ID/);
  });
  it("rejects a short session secret", () => {
    expect(authConfig({ ...ENTRA, AUTH_SESSION_SECRET: "short", NODE_ENV: "production" }).mode).toBe("unconfigured");
  });
});

describe("session and flow cookies", () => {
  it("round-trips a session and rejects tampering, a wrong secret and expiry", async () => {
    const t = await signSession("user-1", SECRET);
    expect(await readSession(t, SECRET)).toBe("user-1");
    expect(await readSession(t + "x", SECRET)).toBeNull();
    expect(await readSession(t, "o".repeat(40))).toBeNull();
    const old = await signSession("user-1", SECRET, Date.now() - 9 * 3600 * 1000);
    expect(await readSession(old, SECRET)).toBeNull();
    expect(await readSession(undefined, SECRET)).toBeNull();
  });
  it("round-trips the sign-in flow", async () => {
    const { flow } = newFlow("/rtm");
    expect(await readFlow(await signFlow(flow, SECRET), SECRET)).toEqual(flow);
  });
  it("only returns to same-site paths", () => {
    expect(safeReturnTo("/rtm")).toBe("/rtm");
    for (const bad of ["//evil.com", "https://evil.com", "\\evil", null, ""]) expect(safeReturnTo(bad)).toBe("/");
  });
});

describe("ID token checks", () => {
  let key: CryptoKey;
  let jwks: ReturnType<typeof createLocalJWKSet>;
  beforeAll(async () => {
    const kp = await generateKeyPair("RS256");
    key = kp.privateKey as CryptoKey;
    jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(kp.publicKey)), alg: "RS256", kid: "k1" }] });
  });
  const mint = (over: Record<string, unknown> = {}, o: { iss?: string; aud?: string; exp?: string } = {}) =>
    new SignJWT({ nonce: "n1", tid: "tenant-1", oid: "oid-1", email: "Ama@DASPLC.com", name: "Ama", ...over })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(o.iss ?? "https://login.microsoftonline.com/tenant-1/v2.0")
      .setAudience(o.aud ?? "client-1")
      .setExpirationTime(o.exp ?? "5m")
      .sign(key);

  it("accepts a good token and lower-cases the email", async () => {
    expect(await verifyIdToken(await mint(), cfg, "n1", jwks)).toEqual({ oid: "oid-1", email: "ama@dasplc.com", name: "Ama" });
  });
  it("rejects wrong nonce, audience, issuer, tenant, expiry and a forged signature", async () => {
    await expect(verifyIdToken(await mint(), cfg, "other", jwks)).rejects.toThrow();
    await expect(verifyIdToken(await mint({}, { aud: "someone-else" }), cfg, "n1", jwks)).rejects.toThrow();
    await expect(verifyIdToken(await mint({}, { iss: "https://evil.example/tenant-1/v2.0" }), cfg, "n1", jwks)).rejects.toThrow();
    await expect(verifyIdToken(await mint({ tid: "tenant-2" }), cfg, "n1", jwks)).rejects.toThrow();
    await expect(verifyIdToken(await mint({}, { exp: "-1m" }), cfg, "n1", jwks)).rejects.toThrow();
    const other = await generateKeyPair("RS256");
    const forged = await new SignJWT({ nonce: "n1", tid: "tenant-1", oid: "o", email: "a@b.c" }).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer("https://login.microsoftonline.com/tenant-1/v2.0").setAudience("client-1").setExpirationTime("5m").sign(other.privateKey);
    await expect(verifyIdToken(forged, cfg, "n1", jwks)).rejects.toThrow();
  });
});

describe("who may sign in, and API access in Microsoft mode", () => {
  let dispatch: typeof import("./index").dispatch;
  let store: typeof import("./store");
  let resolve: typeof import("./identity").resolveEntraUser;
  const saved = { ...process.env };
  beforeAll(async () => {
    ({ dispatch } = await import("./index"));
    store = await import("./store");
    ({ resolveEntraUser: resolve } = await import("./identity"));
    store.resetDb();
  });
  afterEach(() => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  });
  const useEntra = () => Object.assign(process.env, ENTRA, { NODE_ENV: "production" });

  it("signs in a person an admin has added, and binds their Microsoft account", () => {
    const db = store.getDb();
    const r = resolve(db, { oid: "oid-esi", email: "esi.mensah@dasplc.example" });
    expect("user" in r && r.user.id).toBe("user-0001");
    expect(db.users.find((u) => u.id === "user-0001")!.entraOid).toBe("oid-esi");
    expect("user" in resolve(db, { oid: "oid-esi", email: "changed@dasplc.example" })).toBe(true);
  });
  it("does not let a different Microsoft account take over a linked email", () => {
    const r = resolve(store.getDb(), { oid: "oid-attacker", email: "esi.mensah@dasplc.example" });
    expect("error" in r).toBe(true);
  });
  it("does not create accounts for strangers", () => {
    const r = resolve(store.getDb(), { oid: "oid-x", email: "stranger@elsewhere.com" });
    expect("error" in r && r.error).toMatch(/not set up/);
    expect(store.getDb().users.some((u) => u.email === "stranger@elsewhere.com")).toBe(false);
  });
  it("refuses a deactivated person", () => {
    const db = store.getDb();
    db.users.find((u) => u.id === "user-0009")!.isActive = false;
    expect("error" in resolve(db, { oid: "oid-9", email: "ama.serwaa@dasplc.example" })).toBe(true);
  });
  it("creates the bootstrap admin once, and only for that email", () => {
    const db = store.getDb();
    expect("error" in resolve(db, { oid: "o1", email: "boss@dasplc.com" }, undefined)).toBe(true);
    const r = resolve(db, { oid: "o1", email: "boss@dasplc.com", name: "Boss" }, "boss@dasplc.com");
    expect("user" in r && r.user.role).toBe("Admin");
    expect("error" in resolve(db, { oid: "o2", email: "other@dasplc.com" }, "boss@dasplc.com")).toBe(true);
  });

  it("answers only with a valid session cookie, and writes also need the header", async () => {
    useEntra();
    const token = await signSession("user-0001", SECRET);
    const cookie = `das_session=${token}`;
    expect((await dispatch("GET", "/me", new URLSearchParams(), "", null, cookie)).status).toBe(200);
    expect((await dispatch("GET", "/me", new URLSearchParams(), "", null, null)).status).toBe(401);
    // A demo-style header is not accepted in Microsoft mode.
    expect((await dispatch("GET", "/me", new URLSearchParams(), "", "Bearer builtin:user-0001", null)).status).toBe(401);
    const body = JSON.stringify({ title: "t", customerId: store.getDb().customers[0].id, value: 1 });
    expect((await dispatch("POST", "/deals", new URLSearchParams(), body, null, cookie)).status).toBe(401);
    expect((await dispatch("POST", "/deals", new URLSearchParams(), body, "Bearer session", cookie)).status).toBe(201);
  });
  it("hides the demo user list and reset in Microsoft mode", async () => {
    useEntra();
    expect((await dispatch("GET", "/demo/users", new URLSearchParams(), "", null, null)).status).toBe(404);
    const cookie = `das_session=${await signSession("user-0002", SECRET)}`;
    expect((await dispatch("POST", "/demo/reset", new URLSearchParams(), "", "Bearer session", cookie)).status).toBe(403);
    expect(((await dispatch("GET", "/auth/config", new URLSearchParams(), "", null, null)).body as { mode: string }).mode).toBe("entra");
  });
  it("refuses everything when sign-in is not configured", async () => {
    Object.assign(process.env, { NODE_ENV: "production" });
    delete process.env.ALLOW_DEMO_AUTH;
    expect((await dispatch("GET", "/me", new URLSearchParams(), "", "Bearer builtin:user-0001", null)).status).toBe(503);
    expect(((await dispatch("GET", "/auth/config", new URLSearchParams(), "", null, null)).body as { mode: string }).mode).toBe("unconfigured");
  });
});
