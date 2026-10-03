#!/usr/bin/env node
// A stand-in for Microsoft Entra ID, for trying the sign-in flow locally.
// It speaks just enough OpenID Connect (authorize, token with PKCE, keys) for
// the app's real verification code to run against it. Never use it in production.
//
//   node scripts/mock-entra.mjs                     # http://localhost:5070
//   ENTRA_AUTHORITY_HOST=http://localhost:5070 ENTRA_TENANT_ID=tenant-1 ENTRA_CLIENT_ID=client-1 \
//   ENTRA_CLIENT_SECRET=secret AUTH_SESSION_SECRET=<32+ characters> npm run dev
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const port = Number(process.env.PORT ?? 5070);
const tenant = process.env.MOCK_TENANT ?? "tenant-1";
const clientId = process.env.MOCK_CLIENT_ID ?? "client-1";
const secret = process.env.MOCK_CLIENT_SECRET ?? "secret";
const base = `http://localhost:${port}`;
const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), alg: "RS256", kid: "mock-key", use: "sig" };
const codes = new Map();
const people = (process.env.MOCK_PEOPLE ?? "esi.mensah@dasplc.example,kojo.asante@dasplc.example,fatima.salifu@dasplc.example,boss@dasplc.example,stranger@elsewhere.com").split(",");
const oidOf = (email) => `oid-${createHash("sha1").update(email).digest("hex").slice(0, 12)}`;

createServer(async (req, res) => {
  const url = new URL(req.url, base);
  const p = url.pathname;
  if (p === `/${tenant}/discovery/v2.0/keys`) {
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ keys: [jwk] }));
  }
  if (p === `/${tenant}/oauth2/v2.0/authorize`) {
    const q = url.searchParams;
    if (q.get("client_id") !== clientId || !q.get("code_challenge")) return res.writeHead(400).end("bad request");
    const choose = url.searchParams.get("as");
    if (choose) {
      const code = randomUUID();
      codes.set(code, { email: choose, challenge: q.get("code_challenge"), nonce: q.get("nonce"), redirect: q.get("redirect_uri") });
      const back = new URL(q.get("redirect_uri"));
      back.searchParams.set("code", code);
      back.searchParams.set("state", q.get("state"));
      return res.writeHead(302, { Location: back.toString() }).end();
    }
    res.setHeader("Content-Type", "text/html");
    const link = (e) => { const u = new URL(url); u.searchParams.set("as", e); return `<li><a href="${u.pathname}${u.search}">${e}</a></li>`; };
    return res.end(`<!doctype html><title>Mock Microsoft sign-in</title><h1>Pick an account</h1><ul>${people.map(link).join("")}</ul>`);
  }
  if (p === `/${tenant}/oauth2/v2.0/token` && req.method === "POST") {
    let body = "";
    for await (const c of req) body += c;
    const f = new URLSearchParams(body);
    const entry = codes.get(f.get("code"));
    codes.delete(f.get("code"));
    const bad = (m) => res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: m }));
    if (!entry || f.get("client_secret") !== secret || f.get("client_id") !== clientId || f.get("redirect_uri") !== entry.redirect) return bad("invalid_grant");
    if (createHash("sha256").update(f.get("code_verifier") ?? "").digest("base64url") !== entry.challenge) return bad("pkce_failed");
    const idToken = await new SignJWT({ nonce: entry.nonce, tid: tenant, oid: oidOf(entry.email), email: entry.email, name: entry.email.split("@")[0] })
      .setProtectedHeader({ alg: "RS256", kid: "mock-key" })
      .setIssuer(`${base}/${tenant}/v2.0`)
      .setAudience(clientId)
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(privateKey);
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ id_token: idToken, token_type: "Bearer" }));
  }
  res.writeHead(404).end("not found");
}).listen(port, () => console.log(`Mock Entra on ${base} (tenant ${tenant}, client ${clientId})`));
