import { chromium } from 'playwright-core'
import { serve } from './server.mjs'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { buildEvtx } from './evtxBuilder.mjs'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
const AXE = fs.readFileSync(path.resolve('node_modules/axe-core/axe.min.js'), 'utf8')

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

const sandboxChrome = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const executablePath = process.env.CHROMIUM_PATH ?? (fs.existsSync(sandboxChrome) ? sandboxChrome : undefined) // else Playwright's own install
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] })
const page = await (await browser.newContext({ permissions: [] })).newPage()
const external = [], violations = [], errors = []
page.on('request', (r) => { if (!r.url().startsWith(origin) && !r.url().startsWith('blob:')) external.push(r.url()) })
page.on('console', (m) => { const t = m.text(); if (/Content Security Policy|violat/i.test(t)) violations.push(t); if (m.type() === 'error') errors.push(t) })
page.on('pageerror', (e) => errors.push(String(e)))
const fail = async (why) => { console.log('FAIL:', why); console.log((await page.locator('main').innerText()).slice(0, 800)); console.log({ errors, violations }); process.exit(2) }
const checks = []
const check = (name, ok) => { checks.push([name, ok]); console.log(ok ? 'ok  ' : 'FAIL', name) }

// ---- Subresource Integrity: attributes present and ENFORCED (a tampered bundle must not execute)
const indexHtml = fs.readFileSync(path.resolve('dist/index.html'), 'utf8')
const sriTags = [...indexHtml.matchAll(/<(script|link)\b[^>]*(?:src|href)="\.\/(assets\/[^"]+)"[^>]*>/g)]
check('index.html: every script/stylesheet has a correct sha384 integrity attribute', sriTags.length >= 2 && sriTags.every(([tag, , file]) => {
  const m = /integrity="sha384-([^"]+)"/.exec(tag)
  return m && crypto.createHash('sha384').update(fs.readFileSync(path.resolve('dist', file))).digest('base64') === m[1]
}))
{
  const tp = await (await browser.newContext()).newPage()
  const terrs = []; tp.on('console', (m) => terrs.push(m.text()))
  await tp.goto(origin); await tp.waitForSelector('text=Drop a log file', { timeout: 5000 }).catch(() => {})
  const control = (await tp.locator('#root').innerHTML()) !== ''   // positive control: the untouched bundle runs
  await tp.route(/assets\/index-.*\.js$/, async (route) => { const r = await route.fetch(); await route.fulfill({ response: r, body: (await r.text()) + '\n/*tampered*/' }) })
  terrs.length = 0
  await tp.reload(); await tp.waitForTimeout(800)
  check('SRI enforced: untouched bundle runs, tampered bundle is blocked', control && (await tp.locator('#root').innerHTML()) === '' && terrs.some((t) => /integrity/i.test(t)))
  await tp.context().close()
}
{
  const sub = await serve(path.resolve('dist'), 0, '/some/sub/path')
  const sp = await (await browser.newContext()).newPage(); const serrs = []
  sp.on('pageerror', (e) => serrs.push(String(e)))
  await sp.goto(`http://127.0.0.1:${sub.address().port}/some/sub/path/`)
  await sp.waitForSelector('text=Drop a log file', { timeout: 5000 }).catch(() => {})
  check('app works when hosted under a sub-path', (await sp.locator('main').innerText()).includes('Drop a log file') && serrs.length === 0)
  await sp.context().close(); sub.close()
}

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
await page.waitForSelector('text=Results:', { timeout: 60000 }).catch(() => fail('analysis did not finish'))
const secs = ((Date.now() - t0) / 1000).toFixed(1)
const openAll = () => page.evaluate(() => document.querySelectorAll('main details').forEach((d) => { d.open = true }))
await openAll()
const main = await page.locator('main').innerText()
console.log(`analysis wall time: ${secs}s`)
for (const id of ['AUD-001', 'AUTH-001', 'EXEC-001', 'IMP-001', 'CUS-001']) check(`finding ${id} present`, main.includes(id))
check('400,000+ records ingested', main.includes('400,015'))
check('benign-only rules did not false-positive (EXEC-003, CRED-001)', !main.includes('EXEC-003') && !main.includes('CRED-001'))
check('critical findings sorted before medium', main.indexOf('IMP-001') < main.indexOf('CUS-001'))

// Expand EXEC-001 and check hostile content is inert + command escaped
const card = (id) => page.locator('details.finding:not(.chain)', { hasText: id }).first()
const body = await card('EXEC-001').innerText()
check('ATT&CK names shown', /Execution \(TA0002\).*PowerShell \(T1059\.001\)/.test(body))
check('false-positive guidance shown', /Possible legitimate explanations/.test(body))
const xss = await page.evaluate(() => ({ fired: window.__xss === 1, imgs: document.querySelectorAll('main img').length }))
check('XSS payload in log data rendered as text (not executed, no <img> element)', !xss.fired && xss.imgs === 0)
const brute = await card('AUTH-001').innerText()
check('brute-force finding: 12 events grouped by account+IP', /12 events/.test(brute) && /ipAddress=203\.0\.113\.9/.test(brute) && /targetUserName=admin/.test(brute))
check('remediation command rendered with evidence values', /Block 203\.0\.113\.9/.test(brute))

// Correlation: DC01 brute force + log clear, and WS7 PowerShell + shadow-copy deletion each become a chain
check('executive summary with risk score shown', /Executive summary/.test(main) && /\/100/.test(main))
check('two attack chains identified (DC01, WS7)', (main.match(/CHAIN-\d/g) ?? []).length >= 2 && /on DC01/.test(main) && /on WS7/.test(main))
const chainBody = await page.locator('details.chain').first().innerText()
check('chain shows narrative, link reasons and score breakdown', /Attack narrative/.test(chainBody) && /Why these are linked/.test(chainBody) && /How this score was calculated/.test(chainBody))


// ---- Accessibility (axe-core, WCAG 2.x A/AA) in light and dark
const runAxe = async (pg, label) => {
  await pg.evaluate(AXE)
  const res = await pg.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] })).violations
    .map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' :: ' + (n.any[0]?.message ?? n.all[0]?.message ?? '')) })))
  if (res.length) console.log(label, JSON.stringify(res, null, 1))
  check(`axe: no WCAG A/AA violations (${label})`, res.length === 0)
}
await page.emulateMedia({ colorScheme: 'light' }); await runAxe(page, 'app, light')
await page.emulateMedia({ colorScheme: 'dark' }); await runAxe(page, 'app, dark')
await page.emulateMedia({ colorScheme: 'light' })

// ---- Exports
const dl = async (label) => { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click(`button:has-text("${label}")`)]); const f = path.join(tmp, d.suggestedFilename()); await d.saveAs(f); return { name: d.suggestedFilename(), text: fs.readFileSync(f, 'utf8'), f } }
await page.fill('label:has-text("Case or ticket ID") input', 'INC-2026-0001')
await page.fill('label:has-text("Analyst") input', 'Gate Tester')
const json = await dl('Download JSON')
const rep = JSON.parse(json.text)
check('JSON export: valid, versioned, generated filename (no log data in name)', rep.schema === 'windows-security-triage-report' && rep.schemaVersion === '1.1' && /^triage-report-\d{8}-\d{6}Z\.json$/.test(json.name))
check('JSON export: has summary, chains, findings, ATT&CK coverage, limitations', rep.executiveSummary.risk.score > 0 && rep.chains.length >= 2 && rep.findings.length >= 5 && rep.attackCoverage.length > 0 && rep.limitations.length > 0)
check('JSON export: source SHA-256 equals the real file hash (chain of custody)', rep.source.sha256 === crypto.createHash('sha256').update(fs.readFileSync(csv)).digest('hex'))
check('JSON export: case details, rule-pack hashes, two-pass flag present', rep.case.id === 'INC-2026-0001' && rep.case.analyst === 'Gate Tester' && rep.methodology.rulePacks.every((p) => /^[0-9a-f]{64}$/.test(p.sha256)) && [1, 2].includes(rep.methodology.passes))
check('JSON export: logging assessment and control mapping for 8 frameworks', rep.loggingAssessment.rows.length >= 10 && rep.controlMapping.length === 8)
const ver = spawnSync('node', ['scripts/verify-report.mjs', json.f, csv], { encoding: 'utf8' })
check('scripts/verify-report.mjs passes on the downloaded report + original file', ver.status === 0 && /report content hash matches/.test(ver.stdout) && /original log SHA-256 matches/.test(ver.stdout))
check('JSON export (not redacted) keeps real hosts and IPs for the analyst', json.text.includes('DC01') && json.text.includes('203.0.113.9'))
const nd = await dl('Download SIEM alerts')
const ndl = nd.text.trim().split('\n').map((l) => JSON.parse(l))
check('NDJSON export: one ECS-style alert per finding', ndl.length === rep.findings.length && ndl.every((a) => a.event.kind === 'alert' && a['@timestamp'] && a.rule.id && a.threat.framework === 'MITRE ATT&CK'))
const html = await dl('Download HTML')
check('HTML export: script-free, CSP-locked, five sections', !/<script/i.test(html.text) && /Content-Security-Policy/.test(html.text) && ['Executive summary', 'Technical deep dive', 'Contextual analysis', 'Actionable next steps', 'Appendix'].every((h) => html.text.includes(h)))
{ // open the exported file as a standalone document: no requests, no violations, accessible
  const rp = await (await browser.newContext()).newPage(); const rreq = [], rviol = []
  rp.on('request', (r) => { if (!r.url().startsWith('file:')) rreq.push(r.url()) }); rp.on('console', (m) => { if (/Content Security Policy|violat/i.test(m.text())) rviol.push(m.text()) })
  await rp.goto('file://' + html.f); await rp.waitForSelector('text=Executive summary')
  const h2n = await rp.locator('h2').count()
  if (rreq.length || rviol.length || h2n !== 5) console.log({ rreq, rviol, h2n })
  check('standalone report renders from file:// with no requests or CSP violations', rreq.length === 0 && rviol.length === 0 && h2n === 5)
  await runAxe(rp, 'exported report'); await rp.context().close()
}
// Redaction applied to the downloaded artifacts
await page.check('input[type=checkbox]')
const rj = await dl('Download JSON')
const leaks = ['DC01', 'WS7', '203.0.113.9', '"admin"', 'vssadmin delete', 'big.csv', 'powershell -nop'].filter((v) => rj.text.toLowerCase().includes(v.toLowerCase()))
check('redacted JSON export contains none of the sensitive values' + (leaks.length ? ` (leaked: ${leaks})` : ''), leaks.length === 0 && /USER-\d|HOST-\d/.test(rj.text) && JSON.parse(rj.text).redaction.applied === true)
const rh = await dl('Download HTML')
check('redacted HTML export contains none of the sensitive values', !['DC01', 'WS7', '203.0.113.9', 'vssadmin delete'].some((v) => rh.text.includes(v)) && rh.text.includes('Redacted report.'))
await page.uncheck('input[type=checkbox]')

// ---- Print / PDF
await page.click('button:has-text("Print / save as PDF")')
await page.waitForSelector('.print-only .report', { state: 'attached' })
await page.emulateMedia({ media: 'print' })
const vis = await page.evaluate(() => ({ main: getComputedStyle(document.querySelector('main')).display, print: getComputedStyle(document.querySelector('.print-only')).display }))
check('print media: app UI hidden, report shown', vis.main === 'none' && vis.print === 'block')
const pdf = await page.pdf({ format: 'A4', printBackground: true })
check(`print media produces a real multi-page PDF (${(pdf.length / 1024).toFixed(0)} KB)`, pdf.subarray(0, 4).toString() === '%PDF' && pdf.length > 20000)
await page.emulateMedia({ media: 'screen' })

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

// ---- EVTX (WASM parser under the strict CSP: no fetch, wasm-unsafe-eval only)
const T = Date.parse('2025-03-01T10:00:00Z')
const E = (eventId, sec, data, computer = 'SRV9') => ({ eventId, time: new Date(T + sec * 1000), computer, data })
const evtx = path.join(tmp, 'attack.evtx')
fs.writeFileSync(evtx, buildEvtx([[
  E(4624, 0, { TargetUserName: 'bob', TargetLogonId: '0x5A5A', LogonType: '3', IpAddress: '203.0.113.9' }),
  E(4672, 1, { SubjectUserName: 'bob', SubjectLogonId: '0x5A5A' }),
  E(4688, 60, { SubjectUserName: 'bob', SubjectLogonId: '0x5A5A', NewProcessName: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', CommandLine: 'powershell -enc ' + 'QUJD'.repeat(15) }),
]]))
const reqBefore = external.length
await page.locator('section.drop input[type=file]').setInputFiles(evtx)
await page.waitForSelector('text=Results:', { timeout: 30000 }).catch(() => fail('EVTX analysis did not finish'))
await openAll()
const evtxMain = await page.locator('main').innerText()
check('EVTX parsed (format EVTX, 3 records)', /EVTX/.test(evtxMain) && /3 \(3 parsed, 0 rejected\)/.test(evtxMain))
check('EVTX: logon/priv/process linked by Logon ID into a chain (LAT-001)', /LAT-001/.test(evtxMain) && /CHAIN-1/.test(evtxMain))
check('EVTX load made no network requests', external.length === reqBefore)
await page.click('text=Clear all data')
await page.waitForSelector('text=Drop a log file')

check('no console errors', errors.length === 0)
if (external.length) console.log(external); if (violations.length) console.log(violations); if (errors.length) console.log(errors)
const ok = checks.every(([, v]) => v)
console.log(ok ? 'GATE PASS' : 'GATE FAIL')
await browser.close(); srv.close(); fs.rmSync(tmp, { recursive: true })
process.exit(ok ? 0 : 1)
