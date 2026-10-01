import { chromium } from 'playwright-core'
import { serve } from './server.mjs'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const srv = await serve(path.resolve('dist'))
const origin = `http://127.0.0.1:${srv.address().port}`
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-'))

// 400k benign-ish rows (logon types 2 so no rule matches) + seeded attack events.
const q = (s) => `"${s.replaceAll('"', '""')}"`
const rows = ['EventID,TimeGenerated,Computer,TargetUserName,IpAddress,LogonType,NewProcessName,CommandLine']
for (let i = 0; i < 400000; i++) rows.push(`${[4624, 4634, 4688, 4672][i % 4]},2025-03-01T09:${String(i % 60).padStart(2, '0')}:00Z,HOST${i % 50},user${i % 500},10.0.0.${i % 250},2,C:\\Windows\\notepad.exe,notepad.exe`)
const XSS = '<img src=x onerror="window.__xss=1">'
for (let i = 0; i < 12; i++) rows.push(`4625,2025-03-01T10:00:${String(i).padStart(2, '0')}Z,DC01,admin,203.0.113.9,3,,`)
rows.push(`1102,2025-03-01T10:05:00Z,DC01,,,,,`)
rows.push(`4688,2025-03-01T10:06:00Z,WS7,bob,,,C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe,${q(`powershell -nop -w hidden -c "${XSS}" 'x'; calc`)}`)
rows.push(`4688,2025-03-01T10:07:00Z,WS7,bob,,,C:\\Windows\\System32\\vssadmin.exe,vssadmin delete shadows /all`)
const csv = path.join(tmp, 'big.csv'); fs.writeFileSync(csv, rows.join('\n'))
console.log('test file MB:', (fs.statSync(csv).size / 1e6).toFixed(1))

const yml = path.join(tmp, 'custom.yaml')
fs.writeFileSync(yml, `schemaVersion: "1.0"
pack: { id: custom-e2e, name: E2E custom pack, version: 1.0.0 }
rules:
  - id: CUS-001
    name: Notepad launched (custom rule)
    kind: match
    severity: medium
    attack: [{ tactic: TA0002, technique: T1059 }]
    when:
      eventIds: [4688]
      condition: { field: newProcessName, op: endsWith, value: "\\\\notepad.exe" }
`)
const badyml = path.join(tmp, 'bad.yaml'); fs.writeFileSync(badyml, 'schemaVersion: "1.0"\npack: { id: bad-pack, name: B, version: 1.0.0 }\nrules:\n  - { id: BAD-001, name: x, kind: match, severity: loud, attack: [], when: {} }\n')

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] })
const page = await (await browser.newContext({ permissions: [] })).newPage()
const external = [], violations = [], errors = []
page.on('request', (r) => { if (!r.url().startsWith(origin) && !r.url().startsWith('blob:')) external.push(r.url()) })
page.on('console', (m) => { const t = m.text(); if (/Content Security Policy|violat/i.test(t)) violations.push(t); if (m.type() === 'error') errors.push(t) })
page.on('pageerror', (e) => errors.push(String(e)))
const fail = async (why) => { console.log('FAIL:', why); console.log((await page.locator('main').innerText()).slice(0, 800)); console.log({ errors, violations }); process.exit(2) }
const checks = []
const check = (name, ok) => { checks.push([name, ok]); console.log(ok ? 'ok  ' : 'FAIL', name) }

await page.goto(origin)
await page.evaluate(() => { window.__ticks = 0; const f = () => { window.__ticks++; requestAnimationFrame(f) }; f() })

// Rule pack handling (before analysis)
await page.locator('summary', { hasText: 'Detection rules' }).click()
await page.locator('.panel input[type=file]').setInputFiles(badyml)
await page.waitForSelector('.packrow [role=alert]', { timeout: 5000 }).catch(() => fail('no pack error shown'))
check('invalid custom pack rejected with readable error', /bad\.yaml/.test(await page.locator('.packrow').innerText()))
await page.locator('.packrow button', { hasText: 'Remove' }).click()
await page.locator('.panel input[type=file]').setInputFiles(yml)
await page.waitForSelector('text=E2E custom pack')
check('valid YAML pack loaded', true)

// Rule tester
await page.locator('textarea').fill('{"EventID":1102,"TimeGenerated":"2025-03-01T10:00:00Z","Computer":"X"}')
await page.click('text=Test event')
check('rule tester matches AUD-001', /AUD-001.*MATCH/.test(await page.locator('.panel [aria-live=polite]').innerText()))

const t0 = Date.now()
await page.locator('section.drop input[type=file]').setInputFiles(csv)
await page.waitForSelector('text=Findings:', { timeout: 60000 }).catch(() => fail('analysis did not finish'))
const secs = ((Date.now() - t0) / 1000).toFixed(1)
const main = await page.locator('main').innerText()
console.log(`analysis wall time: ${secs}s`)
for (const id of ['AUD-001', 'AUTH-001', 'EXEC-001', 'IMP-001', 'CUS-001']) check(`finding ${id} present`, main.includes(id))
check('400,000+ records ingested', main.includes('400,015'))
check('benign-only rules did not false-positive (EXEC-003, CRED-001)', !main.includes('EXEC-003') && !main.includes('CRED-001'))
check('critical findings sorted before medium', main.indexOf('IMP-001') < main.indexOf('CUS-001'))

// Expand EXEC-001 and check hostile content is inert + command escaped
await page.locator('details.finding', { hasText: 'EXEC-001' }).locator('summary').click()
const body = await page.locator('details.finding', { hasText: 'EXEC-001' }).innerText()
check('ATT&CK names shown', /Execution \(TA0002\).*PowerShell \(T1059\.001\)/.test(body))
check('false-positive guidance shown', /Possible legitimate explanations/.test(body))
const xss = await page.evaluate(() => ({ fired: window.__xss === 1, imgs: document.querySelectorAll('main img').length }))
check('XSS payload in log data rendered as text (not executed, no <img> element)', !xss.fired && xss.imgs === 0)
await page.locator('details.finding', { hasText: 'AUTH-001' }).locator('summary').click()
const brute = await page.locator('details.finding', { hasText: 'AUTH-001' }).innerText()
check('brute-force finding: 12 events grouped by account+IP', /12 events/.test(brute) && /ipAddress=203\.0\.113\.9/.test(brute) && /targetUserName=admin/.test(brute))
check('remediation command rendered with evidence values', /Block 203\.0\.113\.9/.test(brute))

const ticks = await page.evaluate(() => window.__ticks)
const storage = await page.evaluate(async () => ({
  ls: localStorage.length, ss: sessionStorage.length, cookies: document.cookie,
  idb: (await indexedDB.databases?.())?.length ?? 0, caches: (await caches.keys()).length,
}))
check(`UI stayed responsive during analysis (${ticks} frames)`, ticks > 20)
check('no browser storage used', storage.ls === 0 && storage.ss === 0 && storage.cookies === '' && storage.idb === 0 && storage.caches === 0)

await page.click('text=Clear all data')
await page.waitForSelector('text=Drop a log file')
check('Clear removes findings from the DOM', !(await page.locator('main').innerText()).includes('AUD-001 ·'))
check('zero external requests', external.length === 0)
check('zero CSP violations', violations.length === 0)
check('no console errors', errors.length === 0)
if (external.length) console.log(external); if (violations.length) console.log(violations); if (errors.length) console.log(errors)
const ok = checks.every(([, v]) => v)
console.log(ok ? 'GATE PASS' : 'GATE FAIL')
await browser.close(); srv.close(); fs.rmSync(tmp, { recursive: true })
process.exit(ok ? 0 : 1)
