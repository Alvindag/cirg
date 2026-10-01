import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import defaultPack from '../rules/default-pack.json'
import { analyze } from '../src/core/analysis'
import { assessLogging } from '../src/core/audit/coverage'
import { CONTROLS, FRAMEWORKS, parseControl } from '../src/core/audit/controls'
import { sha256Hex } from '../src/core/hash/sha256'
import { ingest } from '../src/core/ingest'
import { loadPack } from '../src/core/rules/load'
import { buildReport } from '../src/core/report/model'
import type { IngestSummary } from '../src/core/types'
import { intrusionCsv, intrusionResult } from './helpers/scenario'

const H = 3_600_000
const T0 = Date.UTC(2025, 2, 1, 0, 0, 0)
const summary = (o: Partial<IngestSummary> & { byEventId: Record<number, number> }): IngestSummary => ({
  format: 'evtx', bytes: 1, totalRecords: 1, parsedEvents: 1, rejected: 0, rejectReasons: {}, firstTs: T0, lastTs: T0 + 48 * H,
  computers: ['DC1'], computersTruncated: false, sample: [], elapsedMs: 1, proc4688: 0, proc4688WithCmd: 0, hourly: { [T0 / H]: 1, [T0 / H + 48]: 1 },
  hourlyTruncated: false, lastAuditPolicyChangeTs: null, recordIds: { count: 0, min: 0, max: 0, computers: 1, channels: 1 }, ...o,
})
const rows = (a: ReturnType<typeof assessLogging>) => Object.fromEntries(a.rows.map((r) => [r.id, r.status]))
const RULES = [{ ruleId: 'CRED-002', eventIds: [4769] }, { ruleId: 'AUD-001', eventIds: [1102, 104] }, { ruleId: 'EXEC-001', eventIds: [4688] }]

describe('audit logging assessment', () => {
  it('separates real gaps (frequent events missing) from normal absences (rare events)', () => {
    const a = assessLogging(summary({ byEventId: { 4624: 900, 4672: 40, 4768: 12 } }), RULES, 'dc')
    expect(rows(a)).toMatchObject({ logon: 'observed', special: 'observed', 'kerb-tgt': 'observed', 'kerb-tgs': 'possible-gap', proc: 'possible-gap', clear: 'not-observed', policy: 'not-observed' })
    expect(a.rows.find((r) => r.id === 'kerb-tgs')!.affectedRules).toEqual(['CRED-002'])
    expect(a.rows.find((r) => r.id === 'clear')!.note).toMatch(/normal when no such activity/)
    expect(a.rows.find((r) => r.id === 'clear')!.affectedRules).toEqual([]) // absent log-clear is good news, not a blocked rule
    expect(a.summary.possibleGaps).toBe(2)
  })
  it('infers a domain controller from Kerberos/NTLM events; unknown role leaves DC-only rows not evaluated', () => {
    expect(assessLogging(summary({ byEventId: { 4624: 1, 4768: 1 } }), RULES).role).toBe('dc')
    const u = assessLogging(summary({ byEventId: { 4624: 5 } }), RULES)
    expect(u.role).toBe('unknown')
    expect(rows(u)['kerb-tgs']).toBe('not-evaluated')
    expect(rows(assessLogging(summary({ byEventId: { 4624: 5 } }), RULES, 'member'))['kerb-tgt']).toBe('not-evaluated')
    expect(rows(assessLogging(summary({ byEventId: { 4624: 5 } }), RULES, 'dc'))['kerb-tgt']).toBe('possible-gap')
  })
  it('does not call a short window a gap (the DC export taken 25 seconds after enabling auditing)', () => {
    const a = assessLogging(summary({ byEventId: { 4624: 5 }, firstTs: T0, lastTs: T0 + 25_000 }), RULES, 'dc')
    expect(rows(a)['kerb-tgs']).toBe('not-observed')
    expect(a.rows.find((r) => r.id === 'kerb-tgs')!.note).toMatch(/window is too short/)
  })
  it('REGRESSION (real DC): auditing enabled seconds before the export is NOT reported as a logging gap', () => {
    const s = summary({ byEventId: { 4624: 900, 4719: 8 }, lastAuditPolicyChangeTs: T0 + 48 * H - 24_000 })
    const a = assessLogging(s, RULES, 'dc')
    expect(a.recentAuditChange).toBe(true)
    expect(rows(a)['kerb-tgs']).toBe('not-observed')
    expect(a.rows.find((r) => r.id === 'kerb-tgs')!.note).toMatch(/audit-policy change was recorded 24 second\(s\) before this export ended/)
    expect(a.summary.possibleGaps).toBe(rows(a)['proc'] === 'possible-gap' ? 1 : 0)
    expect(rows(a).proc).toBe('not-observed')
    // an old change (days earlier) does not excuse a missing category
    expect(rows(assessLogging(summary({ byEventId: { 4624: 900, 4719: 8 }, lastAuditPolicyChangeTs: T0 + 2 * H }), RULES, 'dc'))['kerb-tgs']).toBe('possible-gap')
    // and it is annotated on partial command-line coverage too
    const cl = assessLogging(summary({ byEventId: { 4688: 21 }, proc4688: 21, proc4688WithCmd: 3, lastAuditPolicyChangeTs: T0 + 48 * H - 24_000 }), RULES, 'dc').commandLine
    expect(cl).toMatchObject({ status: 'partial', percent: 14 })
    expect(cl.note).toMatch(/Re-export after a day/)
  })
  it('ingest records the latest 4719 timestamp', async () => {
    const csv = 'EventID,TimeGenerated,Computer\n4719,2025-03-01T10:00:00Z,A\n4719,2025-03-01T12:00:00Z,A\n4624,2025-03-01T13:00:00Z,A\n'
    expect((await ingest(new Blob([csv]), { format: 'csv' }))!.lastAuditPolicyChangeTs).toBe(Date.UTC(2025, 2, 1, 12))
  })
  it('command-line status: absent / partial / ok / not applicable', () => {
    const cl = (p: number, c: number) => assessLogging(summary({ byEventId: { 4688: p }, proc4688: p, proc4688WithCmd: c }), RULES).commandLine
    expect(cl(100, 0).status).toBe('absent'); expect(cl(100, 14)).toMatchObject({ status: 'partial', percent: 14 })
    expect(cl(100, 90).status).toBe('ok'); expect(cl(0, 0).status).toBe('not-applicable')
  })
  it('finds periods with no events and ignores short quiet spells', () => {
    const base = T0 / H
    const a = assessLogging(summary({ byEventId: { 4624: 1 }, hourly: { [base]: 5, [base + 2]: 5, [base + 10]: 5, [base + 11]: 1 } }), RULES)
    expect(a.logGaps).toHaveLength(1)                // 1-hour hole ignored; 7 empty hours (base+3 .. base+9) reported
    expect(a.logGaps[0]).toMatchObject({ hours: 7, from: new Date((base + 3) * H).toISOString() })
  })
  it('record-number continuity: contiguous, gaps, and not applicable', () => {
    const ri = (count: number, min: number, max: number, computers = 1, channels = 1) => assessLogging(summary({ byEventId: { 4624: 1 }, recordIds: { count, min, max, computers, channels } }), RULES).recordIntegrity
    expect(ri(100, 5000, 5099)).toMatchObject({ status: 'contiguous', missing: 0 })
    expect(ri(90, 5000, 5099)).toMatchObject({ status: 'gaps', missing: 10, expected: 100 })
    expect(ri(90, 5000, 5099, 2).status).toBe('not-applicable')
    expect(ri(0, 0, 0).status).toBe('not-applicable')
  })
  it('end to end from a real parse: EventRecordID, hourly histogram and SHA-256 are collected', async () => {
    const csv = 'EventID,TimeGenerated,Computer,Channel,EventRecordID\n' + [100, 101, 102, 105].map((id, i) => `4624,2025-03-01T0${i}:00:00Z,A,Security,${id}`).join('\n') + '\n'
    const s = (await ingest(new Blob([csv]), { format: 'csv' }))!
    expect(s.recordIds).toMatchObject({ count: 4, min: 100, max: 105, computers: 1, channels: 1 })
    expect(Object.keys(s.hourly)).toHaveLength(4)
    const a = assessLogging(s, [])
    expect(a.recordIntegrity).toMatchObject({ status: 'gaps', missing: 2, expected: 6 })
    const r = (await analyze(new Blob([csv]), [], { format: 'csv' }))!
    expect(r.summary.sha256).toBe(createHash('sha256').update(csv).digest('hex'))
  })
})

describe('control mapping', () => {
  const rules = (defaultPack as unknown as { rules: { id: string; controls?: string[] }[] }).rules
  it('every rule in the starter pack is mapped, and every reference exists in the catalog', () => {
    for (const r of rules) {
      expect(r.controls?.length, `${r.id} has no controls`).toBeGreaterThan(0)
      for (const c of r.controls!) { expect(parseControl(c).framework in FRAMEWORKS, `${r.id}: ${c} framework`).toBe(true); expect(c in CONTROLS, `${r.id}: ${c} not in catalog`).toBe(true) }
    }
  })
  it('every logging-assessment control is in the catalog', async () => {
    const { AREAS } = await import('../src/core/audit/coverage')
    for (const a of AREAS) for (const c of a.controls) expect(c in CONTROLS, c).toBe(true)
  })
  it('covers the major frameworks', () => {
    const fws = new Set(rules.flatMap((r) => r.controls!.map((c) => parseControl(c).framework)))
    for (const f of ['nist-800-53', 'nist-800-171', 'nist-csf-2', 'iso-27001', 'pci-dss-4', 'cis-v8', 'soc2', 'hipaa']) expect(fws.has(f), f).toBe(true)
  })
  it('custom packs: unknown framework is an error, unknown control id is a warning', () => {
    const mk = (controls: string[]) => JSON.stringify({ schemaVersion: '1.0', pack: { id: 'c-test', name: 'c', version: '1.0.0' }, rules: [{
      id: 'CTL-001', name: 'c', kind: 'match', severity: 'low', attack: [{ tactic: 'TA0002', technique: 'T1059' }], when: { eventIds: [4688] }, controls }] })
    expect(loadPack(mk(['made-up:AU-1']), 'json').errors.join()).toMatch(/unknown framework/)
    expect(loadPack(mk(['nist-800-53:ZZ-99']), 'json').warnings.join()).toMatch(/not in the bundled catalog/)
    expect(loadPack(mk(['nist-800-53:AU-6']), 'json').errors).toEqual([])
    expect(loadPack(mk(['bad format']), 'json').errors.length).toBeGreaterThan(0)
  })
  it('the report maps fired detections and observed logging areas to controls, with titles', async () => {
    const r = buildReport(await intrusionResult(), { redact: false, generatedAt: new Date('2025-03-02T00:00:00Z'), sourceName: 'x.csv' })
    const pci = r.controlMapping.find((m) => m.framework === 'pci-dss-4')!
    expect(pci.frameworkName).toBe('PCI DSS v4.0')
    const c1046 = pci.controls.find((c) => c.id === '10.2.1.6')!
    expect(c1046.title).toMatch(/starting, stopping or pausing/)
    expect(c1046.ruleIds).toContain('AUD-001')
    expect(r.controlMapping.map((m) => m.framework)).toEqual(expect.arrayContaining(['nist-800-53', 'iso-27001', 'cis-v8', 'soc2']))
    expect(r.limitations.join()).toMatch(/not an assessment of compliance/)
  })
})

describe('evidence integrity and chain of custody', () => {
  const NOW = new Date('2025-03-02T00:00:00Z')
  const build = async (extra = {}) => buildReport(await intrusionResult(), { redact: false, generatedAt: NOW, sourceName: 'dc.csv', ...extra })
  it('records the SHA-256 of the exact source bytes and of each rule pack', async () => {
    const r = await build()
    expect(r.source.sha256).toBe(createHash('sha256').update(intrusionCsv()).digest('hex'))
    expect(r.methodology.rulePacks[0]!.sha256).toBe(sha256Hex(JSON.stringify(defaultPack)))
    expect(r.methodology.passes).toBe(2)
  })
  it('content hash covers the report: any change is detected', async () => {
    const r = await build()
    const { integrity, ...body } = r
    expect(createHash('sha256').update(JSON.stringify(body)).digest('hex')).toBe(integrity.contentSha256)
    const tampered = { ...body, executiveSummary: { ...body.executiveSummary, risk: { ...body.executiveSummary.risk, score: 1 } } }
    expect(createHash('sha256').update(JSON.stringify(tampered)).digest('hex')).not.toBe(integrity.contentSha256)
  })
  it('case details are trimmed, length-limited and kept in redacted reports (they are not log data)', async () => {
    const r = await build({ redact: true, caseInfo: { id: '  INC-1042  ', analyst: 'A. Analyst', organisation: 'x'.repeat(500) } })
    expect(r.case).toMatchObject({ id: 'INC-1042', analyst: 'A. Analyst' })
    expect(r.case.organisation!.length).toBe(160)
    expect((await build({ caseInfo: { id: '   ' } })).case).toEqual({})
  })
  it('verify-report.mjs passes an untouched export (with the original log), and fails on any edit or a different log', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-'))
    const log = path.join(dir, 'log.csv'); fs.writeFileSync(log, intrusionCsv())
    const rp = path.join(dir, 'r.json'); fs.writeFileSync(rp, JSON.stringify(await build(), null, 2))
    const run = (...a: string[]) => spawnSync('node', ['scripts/verify-report.mjs', ...a], { encoding: 'utf8' })
    const good = run(rp, log)
    expect(good.status, good.stdout + good.stderr).toBe(0)
    expect(good.stdout).toMatch(/PASS {2}report content hash matches/); expect(good.stdout).toMatch(/PASS {2}original log SHA-256 matches/)
    const edited = JSON.parse(fs.readFileSync(rp, 'utf8')); edited.executiveSummary.headline = 'All clear'
    const rp2 = path.join(dir, 'edited.json'); fs.writeFileSync(rp2, JSON.stringify(edited, null, 2))
    expect(run(rp2).status).toBe(1)
    fs.writeFileSync(log, intrusionCsv() + 'x')
    expect(run(rp, log).status).toBe(1)
    fs.rmSync(dir, { recursive: true })
  })
})

void execFileSync
