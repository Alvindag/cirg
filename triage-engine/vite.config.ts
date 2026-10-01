import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'

/**
 * Adds Subresource Integrity (sha384) to the same-origin script/stylesheet tags in dist/index.html.
 * Runs in writeBundle and hashes the files exactly as written to disk: Vite rewrites chunks late in the build
 * (e.g. preload markers), so hashing the in-memory chunk during transformIndexHtml produces stale digests.
 */
function sri(): Plugin {
  let outDir = 'dist'
  return {
    name: 'triage-sri',
    apply: 'build',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir) },
    writeBundle() {
      const htmlPath = resolve(outDir, 'index.html')
      const html = readFileSync(htmlPath, 'utf8')
      let count = 0
      const out = html.replace(/<(script|link)\b([^>]*)>/g, (tag, _n: string, attrs: string) => {
        if (/integrity=/.test(attrs)) return tag
        const m = /(?:src|href)="(?:\.\/|\/)?(assets\/[^"]+)"/.exec(attrs)
        if (!m) return tag
        const hash = createHash('sha384').update(readFileSync(resolve(outDir, m[1]!))).digest('base64')
        count++
        return tag.replace(/\/?>$/, ` integrity="sha384-${hash}">`)
      })
      if (count < 2) throw new Error(`SRI: expected to protect at least the main script and stylesheet, protected ${count}`)
      writeFileSync(htmlPath, out)
    },
  }
}

/** Dev server only: the strict production CSP blocks Vite's inline HMR preamble and websocket, so drop the meta tag for `npm run dev`. */
function devWithoutCsp(): Plugin {
  return { name: 'triage-dev-no-csp', apply: 'serve', transformIndexHtml: (html) => html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\s*/, '') }
}

export default defineConfig({
  base: './', // relative URLs: the app can be hosted under any path
  plugins: [react(), sri(), devWithoutCsp()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 700, // main bundle (React + app) is ~550 kB; the EVTX WASM and HTML renderer are already lazy chunks
    assetsInlineLimit: 0, // no data:/inline assets -> keeps style-src/script-src strict
    modulePreload: { polyfill: false }, // the polyfill injects inline code
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
})
