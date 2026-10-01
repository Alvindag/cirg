import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)])
const sources = walk('src').filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes('.generated.') && !f.includes('src/generated/'))
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('zero-trust source audit', () => {
  const FORBIDDEN: [RegExp, string][] = [
    [/dangerouslySetInnerHTML|\.innerHTML|\.outerHTML|insertAdjacentHTML|document\.write/, 'HTML injection sink'],
    [/\beval\s*\(|new Function\s*\(|setTimeout\s*\(\s*['"`]|setInterval\s*\(\s*['"`]/, 'dynamic code evaluation'],
    [/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts/, 'network / remote code API'],
    [/localStorage|sessionStorage|indexedDB|document\.cookie|\bcaches\b|navigator\.serviceWorker|StorageManager|openDatabase/, 'persistent browser storage'],
    [/window\.open\s*\(|\blocation\.(href|assign|replace)\s*=|document\.location/, 'navigation / popup'],
    [/https?:\/\/(?!local\/|localhost)/, 'hard-coded external URL'],
  ]
  for (const [re, what] of FORBIDDEN) {
    it(`no ${what} anywhere in src/`, () => {
      const hits = sources.filter((f) => re.test(strip(fs.readFileSync(f, 'utf8')))).map((f) => `${f}: ${re.exec(strip(fs.readFileSync(f, 'utf8')))![0]}`)
      expect(hits).toEqual([])
    })
  }
  it('generated EVTX glue has no fetch / import.meta.url / eval', () => {
    const glue = fs.readFileSync('src/evtx/evtx_wasm.generated.js', 'utf8')
    expect(glue).not.toMatch(/\bfetch\s*\(|import\.meta\.url|\beval\s*\(|new Function/)
  })
  it('every dependency is pinned to an exact version', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
    for (const section of ['dependencies', 'devDependencies']) for (const [n, v] of Object.entries<string>(pkg[section] ?? {})) expect(v, `${n}@${v}`).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/)
  })
  it('index.html has no inline scripts/styles and no external origins', () => {
    const html = fs.readFileSync('index.html', 'utf8')
    expect(html).not.toMatch(/<script(?![^>]*\ssrc=)/i)
    expect(html).not.toMatch(/\sstyle\s*=|<style/i)
    expect(html).not.toMatch(/https?:\/\//)
  })
})

describe('CSP consistency', () => {
  const headerCsp = /Content-Security-Policy:\s*(.+)/.exec(fs.readFileSync('public/_headers', 'utf8'))![1]!.trim()
  it('public/_headers matches the policy used by the e2e server', async () => {
    // @ts-expect-error untyped .mjs
    const { CSP } = await import('../e2e/server.mjs')
    expect(headerCsp).toBe(CSP)
  })
  it('index.html meta CSP equals the header policy minus header-only directives', () => {
    const meta = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(fs.readFileSync('index.html', 'utf8'))![1]!
    const headerOnly = /^(frame-ancestors|require-trusted-types-for|trusted-types|report-uri|sandbox)\b/
    const expected = headerCsp.split(';').map((d) => d.trim()).filter((d) => d && !headerOnly.test(d))
    const actual = meta.split(';').map((d) => d.trim()).filter(Boolean).filter((d) => !headerOnly.test(d))
    expect(actual).toEqual(expected)
  })
  it('the policy forbids network access, inline script/style and framing', () => {
    expect(headerCsp).toMatch(/default-src 'none'/)
    expect(headerCsp).toMatch(/connect-src 'none'/)
    expect(headerCsp).not.toMatch(/'unsafe-inline'|'unsafe-eval'|\*/)
    expect(headerCsp).toMatch(/frame-ancestors 'none'/)
    expect(headerCsp).toMatch(/trusted-types triage-worker/)
  })
})

describe('SBOM', () => {
  it('covers every production dependency and the Rust crates, and excludes dev tooling', async () => {
    // @ts-expect-error untyped .mjs
    const { bom } = await import('../scripts/sbom.mjs')
    const names = new Set<string>(bom.components.map((c: { name: string }) => c.name))
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
    for (const dep of Object.keys(pkg.dependencies)) expect(names.has(dep), dep).toBe(true)
    for (const dev of ['vite', 'vitest', 'typescript', 'playwright-core', 'axe-core', 'ajv']) expect(names.has(dev), dev).toBe(false)
    for (const crate of ['evtx', 'wasm-bindgen', 'getrandom']) expect(names.has(crate), crate).toBe(true)
  })
})
