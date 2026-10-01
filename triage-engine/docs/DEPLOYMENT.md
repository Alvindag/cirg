# Deployment

The build output (`dist/`) is a static site. It needs **no server-side code**, and it never calls home.

```bash
npm ci
npm run build        # checks the validator is fresh, typechecks, builds, adds SRI hashes to dist/index.html
npm test && npm run e2e
npm run sbom         # sbom.cdx.json (CycloneDX) for your supply-chain records
```
`base` is relative (`./`), so `dist/` works at the site root or under any sub-path.

## Required response headers
Meta-CSP cannot enforce `frame-ancestors` or Trusted Types, so send these headers. `public/_headers` already contains them for Netlify / Cloudflare Pages (it is copied into `dist/`).

```
Content-Security-Policy: default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; require-trusted-types-for 'script'; trusted-types triage-worker
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
Cache-Control: no-store
Strict-Transport-Security: max-age=63072000; includeSubDomains   # HTTPS hosting only
```
nginx:
```nginx
location / {
  root /srv/triage-engine;
  add_header Content-Security-Policy "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; require-trusted-types-for 'script'; trusted-types triage-worker" always;
  add_header X-Content-Type-Options nosniff always;
  add_header Referrer-Policy no-referrer always;
  add_header Cross-Origin-Opener-Policy same-origin always;
  add_header Cross-Origin-Resource-Policy same-origin always;
  add_header Cache-Control no-store always;
  types { application/wasm wasm; }
}
```
Serve `.js` as `text/javascript` and `.css` as `text/css`. If a proxy or CDN injects scripts (analytics, "email protection"), the CSP will block them and the app keeps working. Disable such features anyway.

## Verifying a deployment
1. Open DevTools > Network, load a file: the only requests are the app's own static assets.
2. DevTools > Application: Local Storage, Session Storage, IndexedDB, Cookies and Cache Storage stay empty.
3. `curl -sI https://your-host/ | grep -i content-security-policy` shows the policy above.
4. Compare the released `dist/` hash against your build record; SRI covers the entry script/stylesheet but a compromised server can also rewrite `index.html`. For high-assurance use, host internally or distribute `dist/` as a signed archive and open it from a trusted path.

## Air-gapped use
Copy `dist/` to the analyst workstation and serve it from `http://127.0.0.1` (`npm start`, or `node scripts/serve.mjs` to serve an existing build). Opening `index.html` via `file://` is **not** supported: module workers and Trusted Types behave differently there.

## Rebuilding the EVTX parser (optional)
Generated files are committed. To rebuild: `rustup target add wasm32-unknown-unknown`, `cargo install wasm-bindgen-cli --version 0.2.100 --locked`, then `npm run build:evtx` and review the diff of `src/evtx/*.generated.*` (the recorded SHA-256 is checked by a test).
