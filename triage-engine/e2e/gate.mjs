import { chromium } from 'playwright-core'
import { serve } from './server.mjs'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const srv = await serve(path.resolve('dist'))
const origin = `http://127.0.0.1:${srv.address().port}`
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-'))
const rows = ['EventID,TimeGenerated,Computer,TargetLogonId,CommandLine']
for (let i = 0; i < 400000; i++) rows.push(`${[4624, 4625, 4688, 4672][i % 4]},2025-03-01T10:${String(i % 60).padStart(2, '0')}:00Z,HOST${i % 50},0x${(i % 999).toString(16)},"cmd /c ""echo ${i}"""`)
const csv = path.join(tmp, 'big.csv'); fs.writeFileSync(csv, rows.join('\n'))
console.log('test file MB:', (fs.statSync(csv).size / 1e6).toFixed(1))

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] })
const ctx = await browser.newContext()
const page = await ctx.newPage()
const external = [], violations = [], errors = []
page.on('request', (r) => { if (!r.url().startsWith(origin) && !r.url().startsWith('blob:')) external.push(r.url()) })
page.on('console', (m) => { const t = m.text(); if (/Content Security Policy|violat/i.test(t)) violations.push(t); if (m.type() === 'error') errors.push(t) })
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(origin)
// UI responsiveness probe: count rAF ticks while ingest runs.
await page.evaluate(() => { window.__ticks = 0; const f = () => { window.__ticks++; requestAnimationFrame(f) }; f() })
await page.setInputFiles('input[type=file]', csv)
await page.waitForSelector('text=Ingest summary', { timeout: 20000 }).catch(async () => { console.log('STATE:', (await page.locator('main').innerText()).slice(0,400)); console.log('ERR', errors, violations); process.exit(2) })
const text = await page.locator('main').innerText()
const ticks = await page.evaluate(() => window.__ticks)
console.log(text.split('\n').slice(0, 14).join(' | '))
console.log('rAF ticks during ingest (UI alive):', ticks)

const storage = await page.evaluate(async () => ({
  ls: localStorage.length, ss: sessionStorage.length, cookies: document.cookie,
  idb: (await indexedDB.databases?.())?.length ?? 0, caches: (await caches.keys()).length,
}))
console.log('storage:', JSON.stringify(storage))
await page.click('text=Clear all data')
await page.waitForSelector('text=Drop a log file')
console.log('external requests:', external.length, external)
console.log('CSP violations:', violations.length, violations)
console.log('console errors:', errors)
const ok = external.length === 0 && violations.length === 0 && errors.length === 0 && ticks > 20 &&
  storage.ls === 0 && storage.ss === 0 && storage.cookies === '' && storage.idb === 0 && storage.caches === 0 && text.includes('400,000')
console.log(ok ? 'GATE PASS' : 'GATE FAIL')
await browser.close(); srv.close(); fs.rmSync(tmp, { recursive: true })
process.exit(ok ? 0 : 1)
