// Serves ./dist on http://127.0.0.1:4173 with the production security headers (CSP, Trusted Types, ...).
// Usage: npm start   (builds first)   or   node scripts/serve.mjs [port]   (serves an existing build)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '../e2e/server.mjs'

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const port = Number(process.argv[2] ?? 4173)
if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('No build found. Run: npm run build'); process.exit(1) }
const srv = await serve(dist, port).catch(() => null)
if (!srv) { console.error(`Could not listen on port ${port}. Is it in use? Try: node scripts/serve.mjs 4180`); process.exit(1) }
console.log(`\nTriage engine is running:  http://127.0.0.1:${port}\nPress Ctrl+C to stop. Your logs never leave this browser.\n`)
