import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { reportToJson, reportToNdjson } from '../src/core/report/exports'
import { buildReport } from '../src/core/report/model'
import { Pseudonymizer } from '../src/core/report/redact'
import { analyze } from '../src/core/analysis'
import { intrusionResult, SENSITIVE } from './helpers/scenario'

const ajv = addFormats(new Ajv2020({ allErrors: true, strict: false }))
const validate = ajv.compile(JSON.parse(fs.readFileSync('schemas/report.schema.json', 'utf8')))
const NOW = new Date('2025-03-02T00:00:00Z')
const mk = async (redact: boolean) => buildReport(await intrusionResult(), { redact, generatedAt: NOW, sourceName: 'secret-customer-dc.csv' })

describe('report model', () => {
  it('conforms to the published JSON Schema (plain and redacted)', async () => {
    for (const redact of [false, true]) {
      const r = await mk(redact)
      const ok = validate(r)
      expect(validate.errors ?? []).toEqual([])
      expect(ok).toBe(true)
    }
  })
  it('contains all five required sections with real content', async () => {
    const r = await mk(false)
    expect(r.executiveSummary.risk.score).toBeGreaterThan(0)
    expect(r.executiveSummary.topThreats.length).toBeGreaterThan(0)
    expect(r.executiveSummary.headline).toMatch(/attack chain/)
    expect(r.chains.length).toBeGreaterThanOrEqual(1)                       // technical deep dive
    expect(r.attackCoverage.map((t) => t.tactic)).toEqual(expect.arrayContaining(['TA0006', 'TA0008']))
    const f = r.findings.find((x) => x.ruleId === 'EXEC-001')!
    expect(f.context.legitimateExplanations.length).toBeGreaterThan(0)       // contextual analysis
    expect(f.context.maliciousIndicators.length).toBeGreaterThan(0)
    expect(r.findings.some((x) => x.nextSteps.investigate.length || x.nextSteps.remediate.length)).toBe(true) // next steps
    expect(r.limitations.some((l) => /not proof/.test(l))).toBe(true)
  })
  it('fills command templates from evidence and keeps disruptive actions labelled', async () => {
    const r = await mk(false)
    const brute = r.findings.find((f) => f.ruleId === 'AUTH-001')!
    const block = brute.nextSteps.remediate.find((a) => /Block the source IP/.test(a.title))!
    expect(block.command).toContain('203.0.113.9')
    expect(block.risk).toBe('disruptive')
  })
  it('is deterministic for a fixed clock', async () => {
    expect(reportToJson(await mk(false))).toBe(reportToJson(await mk(false)))
  })
  it('flags logging gaps: no 4688 command lines', async () => {
    const r = (await analyze(new Blob(['EventID,TimeGenerated,Computer,NewProcessName\n4688,2025-03-01T10:00:00Z,A,C:\\x.exe\n']), [], { format: 'csv' }))!
    expect(r.coverage.notes.join()).toMatch(/none carried a command line/)
    const rep = buildReport(r, { redact: false, generatedAt: NOW, sourceName: 'x' })
    expect(rep.limitations.join()).toMatch(/command-line detections could not run/)
    expect(rep.executiveSummary.headline).toMatch(/No detection rules matched/)
  })
})

describe('redaction', () => {
  it('removes every sensitive value from the entire JSON document, including derived text', async () => {
    const json = reportToJson(await mk(true))
    for (const s of SENSITIVE) expect(json.toLowerCase(), `leaked: ${s}`).not.toContain(s.toLowerCase())
    expect(json).not.toContain('secret-customer-dc')
    expect(json).toMatch(/USER-\d/); expect(json).toMatch(/HOST-\d/); expect(json).toMatch(/IP-\d/)
  })
  it('also redacts the NDJSON alerts', async () => {
    const nd = reportToNdjson(await mk(true))
    for (const s of SENSITIVE) expect(nd.toLowerCase(), `leaked: ${s}`).not.toContain(s.toLowerCase())
  })
  it('preserves analysis structure: same findings, chains, scores and severities', async () => {
    const [a, b] = [await mk(false), await mk(true)]
    expect(b.findings.map((f) => [f.ruleId, f.severity, f.count, f.score])).toEqual(a.findings.map((f) => [f.ruleId, f.severity, f.count, f.score]))
    expect(b.chains.map((c) => [c.id, c.risk.score, c.findingIds.length])).toEqual(a.chains.map((c) => [c.id, c.risk.score, c.findingIds.length]))
    expect(b.redaction.applied).toBe(true)
  })
  it('pseudonyms are stable and consistent across events, narratives and entities', async () => {
    const r = await mk(true)
    const user = r.findings.find((f) => f.ruleId === 'LAT-001')!.evidence.find((e) => e.fields['targetUserName'])!.fields['targetUserName'] as string
    expect(user).toMatch(/^USER-\d+$/)
    expect(JSON.stringify(r.chains)).toContain(user.toLowerCase().replace('user', 'USER'))
  })
  it('keeps well-known system accounts/SIDs, strips paths to the executable, never emits a command line', () => {
    const p = new Pseudonymizer()
    const e = p.event({ eventId: 4688, ts: 1, subjectUserName: 'SYSTEM', subjectUserSid: 'S-1-5-18', targetUserSid: 'S-1-5-21-1-2-3-1105', ipAddress: '127.0.0.1',
      newProcessName: 'C:\\Users\\bob\\evil.exe', commandLine: 'evil.exe --password hunter2', computer: 'WS1', workstationName: 'ws1' })
    expect(e).toMatchObject({ subjectUserName: 'SYSTEM', subjectUserSid: 'S-1-5-18', ipAddress: '127.0.0.1', newProcessName: 'evil.exe', computer: 'HOST-1', workstationName: 'HOST-1' })
    expect(e.targetUserSid).toBe('SID-1')
    expect(JSON.stringify(e)).not.toContain('hunter2')
  })
  it('redacts 4648 process paths and remote target servers but keeps localhost', () => {
    const p = new Pseudonymizer()
    const remote = p.event({ eventId: 4648, ts: 1, processName: 'C:\\Users\\bob\\tools\\psexec.exe', targetServerName: 'fileserver01.corp.example' })
    expect(remote).toMatchObject({ processName: 'psexec.exe', targetServerName: 'HOST-1' })
    expect(p.event({ eventId: 4648, ts: 1, targetServerName: 'localhost' }).targetServerName).toBe('localhost')
  })
  it('does not double-replace and skips tiny tokens', () => {
    const p = new Pseudonymizer()
    p.host('host'); p.user('al')
    expect(p.text('host and al and all')).toBe('HOST-1 and al and all')
  })
  it('classifies sequence-rule group values by content (e.g. key "source" holds an IP)', async () => {
    const r = await mk(true)
    const g = r.findings.find((f) => f.ruleId === 'AUTH-006')?.group
    expect(g).toBeDefined()
    expect(JSON.stringify(g)).not.toContain('203.0.113.9')
    expect(JSON.stringify(g)).not.toContain('jdoe')
  })
})

describe('SIEM NDJSON export', () => {
  it('emits one valid ECS-style alert per finding with ATT&CK fields', async () => {
    const r = await mk(false)
    const lines = reportToNdjson(r).trim().split('\n').map((l) => JSON.parse(l))
    expect(lines).toHaveLength(r.findings.length)
    const a = lines.find((l) => l.rule.id === 'IMP-001')
    expect(a).toMatchObject({ event: { kind: 'alert', severity: 99 }, threat: { framework: 'MITRE ATT&CK' }, host: { name: 'WKSTN-DAVE' } })
    expect(a['@timestamp']).toMatch(/^2025-03-01T11:00:00/)
    expect(a.threat.technique.id).toContain('T1490')
    expect(reportToNdjson({ ...r, findings: [] })).toBe('')
  })
})
