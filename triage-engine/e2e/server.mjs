// Minimal static server that sends the production security headers (CSP etc.). Used by e2e and `npm run preview:secure`.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
export const CSP = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; require-trusted-types-for 'script'; trusted-types triage-worker"
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm' }
export function serve(dir, port = 0) {
  const srv = http.createServer((req, res) => {
    let p = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname))
    if (!p.startsWith(dir)) { res.writeHead(403).end(); return }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html')
    if (!fs.existsSync(p)) { res.writeHead(404).end(); return }
    res.writeHead(200, {
      'content-type': MIME[path.extname(p)] ?? 'application/octet-stream',
      'content-security-policy': CSP, 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
      'cross-origin-opener-policy': 'same-origin', 'cross-origin-resource-policy': 'same-origin',
      'permissions-policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()', 'cache-control': 'no-store',
    })
    fs.createReadStream(p).pipe(res)
  })
  return new Promise((r) => srv.listen(port, '127.0.0.1', () => r(srv)))
}
