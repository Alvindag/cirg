// Minimal static server that sends the production security headers (CSP etc.). Used by e2e and `npm run preview:secure`.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
export const CSP = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; require-trusted-types-for 'script'; trusted-types triage-worker"
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm' }
export function serve(dir, port = 0, prefix = '') {
  dir = path.resolve(dir) // normalise separators (Windows) before any containment check
  const srv = http.createServer((req, res) => {
    let pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    if (prefix) { if (!pathname.startsWith(prefix)) { res.writeHead(404).end(); return } pathname = pathname.slice(prefix.length) || '/' }
    let p = path.join(dir, pathname)
    const rel = path.relative(dir, p)
    if (rel.startsWith('..') || path.isAbsolute(rel)) { res.writeHead(403).end(); return }
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
  return new Promise((resolve, reject) => { srv.once('error', reject); srv.listen(port, '127.0.0.1', () => resolve(srv)) })
}
