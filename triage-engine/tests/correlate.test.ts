import { describe, expect, it } from 'vitest'
import { analyze, buildRules } from '../src/core/analysis'
import { buildChains } from '../src/core/correlate/chains'
import { labelFor, scoreChain, scoreOverall } from '../src/core/correlate/risk'
import { loadPack, compilePacks } from '../src/core/rules/load'
import { RuleEngine } from '../src/core/rules/engine'
import type { Finding } from '../src/core/rules/types'
import type { CanonicalEvent } from '../src/core/types'

const T0 = Date.UTC(2025, 2, 1, 10, 0, 0)
const MIN = 60_000
const ev = (o: Partial<CanonicalEvent> & { eventId: number }): CanonicalEvent => ({ ts: T0, computer: 'WS1', ...o })
const run = (events: CanonicalEvent[], pack?: object) => {
  const { comp, report } = buildRules(pack ? [{ name: 'x.json', text: JSON.stringify(pack), format: 'json' }] : [])
  expect(report.errors).toEqual([])
  const eng = new RuleEngine(comp.rules)
  events.forEach((e) => eng.process(e))
  return eng.finalize()
}
const ids = (events: CanonicalEvent[]) => run(events).findings.map((f) => f.ruleId)

const ps = (o: Partial<CanonicalEvent> = {}) => ev({ eventId: 4688, subjectLogonId: '0x5a5a', subjectUserName: 'bob', ts: T0 + 2 * MIN,
  newProcessName: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', commandLine: 'powershell -enc ' + 'QUJD'.repeat(15), ...o })
const logon = (o: Partial<CanonicalEvent> = {}) => ev({ eventId: 4624, logonType: 3, targetLogonId: '0x5a5a', targetUserName: 'bob', ipAddress: '10.9.9.9', ...o })
const priv = (o: Partial<CanonicalEvent> = {}) => ev({ eventId: 4672, subjectLogonId: '0x5a5a', subjectUserName: 'bob', ts: T0 + MIN, ...o })

describe('starter sequence rules', () => {
  it('LAT-001 links 4624 → 4672 → 4688 by Logon ID', () => {
    const r = run([logon(), priv(), ps()]).findings.find((f) => f.ruleId === 'LAT-001')!
    expect(r.kind).toBe('sequence')
    expect(r.steps!.map((s) => s.id)).toEqual(['logon', 'priv', 'proc'])
    expect(r.group).toEqual({ session: '0x5a5a' })
    expect(r.count).toBe(3)
  })
  it('LAT-001 does NOT fire when the Logon IDs differ', () => {
    expect(ids([logon(), priv({ subjectLogonId: '0x9999' }), ps()])).not.toContain('LAT-001')
  })
  it('LAT-001 respects host scope: same Logon ID value on another computer is a different session', () => {
    expect(ids([logon(), priv({ computer: 'WS2' }), ps({ computer: 'WS2' })])).not.toContain('LAT-001')
  })
  it('LAT-001 respects the time window and order', () => {
    expect(ids([logon(), priv(), ps({ ts: T0 + 11 * MIN })])).not.toContain('LAT-001') // 10m window
    expect(ids([logon({ ts: T0 + 5 * MIN }), priv(), ps({ ts: T0 + 3 * MIN })])).not.toContain('LAT-001') // logon after the others
  })
  it('LAT-001 is independent of input order', () => {
    expect(ids([ps(), priv(), logon()])).toContain('LAT-001')
  })
  it('LAT-001 suppress list drops the chain and counts it', () => {
    const pack = { schemaVersion: '1.0', pack: { id: 'ovr-pack', name: 'o', version: '1.0.0' }, assets: { approvedAdminAccounts: ['bob'] }, rules: [
      { id: 'LAT-001', name: 'ovr', kind: 'sequence', severity: 'high', attack: [{ tactic: 'TA0008', technique: 'T1021.002' }],
        when: { within: '10m', correlateOn: [{ name: 'session', bind: { logon: 'targetLogonId', priv: 'subjectLogonId' } }],
          steps: [{ id: 'logon', eventIds: [4624] }, { id: 'priv', eventIds: [4672] }] },
        suppress: [{ field: 'subjectUserName', op: 'in', value: '$lists.approvedAdminAccounts' }] }] }
    const r = run([logon(), priv()], pack)
    expect(r.findings.filter((f) => f.ruleId === 'LAT-001')).toEqual([])
  })
  it('AUTH-006: success after 5+ failures from the same IP for the same account', () => {
    const fail = (i: number, o: Partial<CanonicalEvent> = {}) => ev({ eventId: 4625, ts: T0 + i * 1000, targetUserName: 'Admin', ipAddress: '203.0.113.9', ...o })
    const ok = ev({ eventId: 4624, ts: T0 + 60_000, targetUserName: 'admin', ipAddress: '203.0.113.9', logonType: 3 })
    const five = Array.from({ length: 5 }, (_, i) => fail(i))
    expect(ids([...five, ok])).toContain('AUTH-006') // account compare is case-insensitive
    expect(ids([...five.slice(0, 4), ok])).not.toContain('AUTH-006')
    expect(ids([...five, { ...ok, ipAddress: '198.51.100.1' }])).not.toContain('AUTH-006') // secondary key (source IP) must match
    expect(ids([...five, { ...ok, targetUserName: 'someone-else' }])).not.toContain('AUTH-006')
    expect(ids([ok, ...five.map((f) => ({ ...f, ts: f.ts + 2 * 60_000 }))])).not.toContain('AUTH-006') // success BEFORE the failures
  })
  it('ACC-003: account created then added to a privileged group, linked by SID', () => {
    const c = ev({ eventId: 4720, computer: 'DC1', targetUserName: 'svc_backup2', targetUserSid: 'S-1-5-21-1-2-3-1105', subjectUserName: 'mallory' })
    const add = (sid: string, group: string) => ev({ eventId: 4732, computer: 'DC1', ts: T0 + 5 * MIN, targetUserName: group, memberSid: sid, subjectUserName: 'mallory' })
    expect(ids([c, add('S-1-5-21-1-2-3-1105', 'Administrators')])).toContain('ACC-003')
    expect(ids([c, add('S-1-5-21-1-2-3-9999', 'Administrators')])).not.toContain('ACC-003')
    expect(ids([c, add('S-1-5-21-1-2-3-1105', 'Print Users')])).not.toContain('ACC-003')
  })
  it('LAT-002: service install inside a remote logon session', () => {
    const svc = ev({ eventId: 4697, subjectLogonId: '0x5a5a', ts: T0 + MIN, serviceName: 'PSEXESVC' })
    expect(ids([logon(), svc])).toContain('LAT-002')
    expect(ids([logon({ logonType: 2 }), svc])).not.toContain('LAT-002') // interactive logon
    expect(ids([logon({ ts: T0 - 6 * MIN }), svc])).not.toContain('LAT-002') // 5m window
  })
  it('EVAS-002: privileged session clears the log', () => {
    expect(ids([priv(), ev({ eventId: 1102, subjectLogonId: '0x5a5a', ts: T0 + 10 * MIN })])).toContain('EVAS-002')
    expect(ids([priv(), ev({ eventId: 1102, subjectLogonId: '0xbeef', ts: T0 + 10 * MIN })])).not.toContain('EVAS-002')
  })
})

describe('sequence semantics (custom rules)', () => {
  const pack = (when: object, extra: object = {}) => ({ schemaVersion: '1.0', pack: { id: 'seq-test', name: 's', version: '1.0.0' }, rules: [
    { id: 'SEQ-001', name: 'seq', kind: 'sequence', severity: 'medium', attack: [{ tactic: 'TA0002', technique: 'T1059' }], when, ...extra }] })
  const key = (bind: object, scope = 'global') => [{ name: 'k', scope, bind }]
  const e = (id: number, k: string, tsMin: number, o: Partial<CanonicalEvent> = {}) => ev({ eventId: id, targetUserName: k, ts: T0 + tsMin * MIN, ...o })
  const seqFindings = (events: CanonicalEvent[], when: object) => run(events, pack(when)).findings.filter((f) => f.ruleId === 'SEQ-001')

  it('optional steps are included when present and never required', () => {
    const when = { within: '10m', correlateOn: key({ a: 'targetUserName', b: 'targetUserName', c: 'targetUserName' }), steps: [{ id: 'a', eventIds: [1] }, { id: 'b', eventIds: [2], optional: true }, { id: 'c', eventIds: [3] }] }
    expect(seqFindings([e(1, 'u', 0), e(3, 'u', 2)], when)[0]!.steps!.map((s) => s.id)).toEqual(['a', 'c'])
    expect(seqFindings([e(1, 'u', 0), e(2, 'u', 1), e(3, 'u', 2)], when)[0]!.steps!.map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })
  it('negate step voids the chain only when the forbidden event occurs inside its span', () => {
    const when = { within: '10m', correlateOn: key({ a: 'targetUserName', n: 'targetUserName', c: 'targetUserName' }), steps: [{ id: 'a', eventIds: [1] }, { id: 'n', eventIds: [9], negate: true }, { id: 'c', eventIds: [3] }] }
    expect(seqFindings([e(1, 'u', 0), e(3, 'u', 5)], when).length).toBe(1)
    expect(seqFindings([e(1, 'u', 0), e(9, 'u', 2), e(3, 'u', 5)], when).length).toBe(0)
    expect(seqFindings([e(1, 'u', 0), e(9, 'u', 7), e(3, 'u', 5)], when).length).toBe(1) // forbidden event after the chain
    expect(seqFindings([e(1, 'u', 0), e(9, 'other', 2), e(3, 'u', 5)], when).length).toBe(1) // different key bucket
  })
  it('min requires N events in that step', () => {
    const when = { within: '10m', correlateOn: key({ a: 'targetUserName', b: 'targetUserName' }), steps: [{ id: 'a', eventIds: [1], min: 3 }, { id: 'b', eventIds: [2] }] }
    expect(seqFindings([e(1, 'u', 0), e(1, 'u', 1), e(2, 'u', 3)], when).length).toBe(0)
    expect(seqFindings([e(1, 'u', 0), e(1, 'u', 1), e(1, 'u', 2), e(2, 'u', 3)], when)[0]!.count).toBe(4)
  })
  it('unordered sequences match steps in any order within the window', () => {
    const when = { within: '10m', ordered: false, correlateOn: key({ a: 'targetUserName', b: 'targetUserName' }), steps: [{ id: 'a', eventIds: [1] }, { id: 'b', eventIds: [2] }] }
    expect(seqFindings([e(2, 'u', 0), e(1, 'u', 3)], when).length).toBe(1)
    expect(seqFindings([e(2, 'u', 0), e(1, 'u', 30)], when).length).toBe(0)
  })
  it('two non-overlapping occurrences in one bucket yield two findings', () => {
    const when = { within: '10m', correlateOn: key({ a: 'targetUserName', b: 'targetUserName' }), steps: [{ id: 'a', eventIds: [1] }, { id: 'b', eventIds: [2] }] }
    expect(seqFindings([e(1, 'u', 0), e(2, 'u', 1), e(1, 'u', 60), e(2, 'u', 61)], when).length).toBe(2)
  })
  it('events lacking the key field never join a bucket', () => {
    const when = { within: '10m', correlateOn: key({ a: 'targetUserName', b: 'targetUserName' }), steps: [{ id: 'a', eventIds: [1] }, { id: 'b', eventIds: [2] }] }
    expect(seqFindings([ev({ eventId: 1, ts: T0 }), ev({ eventId: 2, ts: T0 + 1000 })], when).length).toBe(0)
  })
  it('memory caps are enforced and reported, not silent', () => {
    const { comp } = buildRules([{ name: 'x.json', text: JSON.stringify(pack({ within: '10m', correlateOn: key({ a: 'targetUserName', b: 'targetUserName' }), steps: [{ id: 'a', eventIds: [1] }, { id: 'b', eventIds: [2] }] })), format: 'json' }])
    const eng = new RuleEngine(comp.rules, { seqBucketsPerRule: 10 })
    for (let i = 0; i < 50; i++) eng.process(e(1, `user${i}`, 0))
    expect(eng.finalize().stats.capped).toContain('SEQ-001')
  })
  it('load-time validation of sequence definitions', () => {
    const errs = (when: object) => {
      const r = loadPack(JSON.stringify(pack(when)), 'json'); expect(r.errors).toEqual([])
      return compilePacks([r.pack!]).errors.join('\n')
    }
    expect(errs({ within: '5m', correlateOn: key({ a: 'targetUserName' }), steps: [{ id: 'a', eventIds: [1] }, { id: 'b', eventIds: [2] }] })).toMatch(/step "b" is not bound/)
    expect(errs({ within: '5m', correlateOn: key({ a: 'targetUserName', zz: 'targetUserName' }), steps: [{ id: 'a', eventIds: [1] }, { id: 'b', eventIds: [2] }] })).toMatch(/unknown step "zz"/)
    expect(errs({ within: '5m', correlateOn: key({ a: 'nope', b: 'targetUserName' }), steps: [{ id: 'a', eventIds: [1] }, { id: 'b', eventIds: [2] }] })).toMatch(/unknown field "nope"/)
    expect(errs({ within: '5m', correlateOn: key({ a: 'targetUserName', b: 'targetUserName' }), steps: [{ id: 'a', eventIds: [1], optional: true }, { id: 'b', eventIds: [2] }] })).toMatch(/first step must be required/)
    expect(errs({ within: '5m', correlateOn: key({ a: 'targetUserName', a2: 'targetUserName' }), steps: [{ id: 'a', eventIds: [1] }, { id: 'a', eventIds: [2] }] })).toMatch(/duplicate step id/)
  })
})

describe('match findings are split per host and per episode', () => {
  it('same rule on two hosts produces two findings', () => {
    const f = run([ev({ eventId: 1102, computer: 'A' }), ev({ eventId: 1102, computer: 'B' })]).findings.filter((x) => x.ruleId === 'AUD-001')
    expect(f.map((x) => x.host).sort()).toEqual(['A', 'B'])
  })
  it('a >1h gap on one host starts a new episode', () => {
    const f = run([ev({ eventId: 1102 }), ev({ eventId: 1102, ts: T0 + 10 * MIN }), ev({ eventId: 1102, ts: T0 + 5 * 60 * MIN })]).findings.filter((x) => x.ruleId === 'AUD-001')
    expect(f.map((x) => x.count).sort()).toEqual([1, 2])
  })
})

describe('attack chains', () => {
  const finding = (o: Partial<Finding> & { id: string }): Finding => ({
    ruleId: o.id.split(':')[0]!, ruleName: o.id, packId: 'p', kind: 'match', severity: 'high', confidence: 0.7,
    attack: [{ tactic: 'TA0002', tacticName: 'Execution', technique: 'T1059' }], count: 1, firstTs: T0, lastTs: T0,
    evidence: [], evidenceTruncated: false, entities: { users: [], hosts: [], ips: [] }, suppressed: 0, host: 'WS1', ...o })

  it('links findings on the same host close in time, in time order, with reasons', () => {
    const { chains, unchained } = buildChains([
      finding({ id: 'B:0', firstTs: T0 + 20 * MIN, lastTs: T0 + 20 * MIN, attack: [{ tactic: 'TA0005', tacticName: 'Defense Evasion', technique: 'T1070.001' }] }),
      finding({ id: 'A:0', firstTs: T0, lastTs: T0 })])
    expect(unchained).toEqual([])
    expect(chains).toHaveLength(1)
    expect(chains[0]!.findingIds).toEqual(['A:0', 'B:0'])
    expect(chains[0]!.stages.map((s) => s.tacticName)).toEqual(['Execution', 'Defense Evasion'])
    expect(chains[0]!.links).toContain('host WS1')
  })
  it('does not link the same host when far apart in time', () => {
    const { chains } = buildChains([finding({ id: 'A:0' }), finding({ id: 'B:0', firstTs: T0 + 3 * 60 * MIN, lastTs: T0 + 3 * 60 * MIN })])
    expect(chains).toHaveLength(0)
  })
  it('does not link different hosts with nothing in common', () => {
    expect(buildChains([finding({ id: 'A:0', host: 'WS1' }), finding({ id: 'B:0', host: 'WS2' })]).chains).toHaveLength(0)
  })
  it('links lateral movement across hosts via a shared account', () => {
    const e1 = ev({ eventId: 4688, computer: 'WS1', subjectUserName: 'Bob' }), e2 = ev({ eventId: 4697, computer: 'SRV1', subjectUserName: 'bob', ts: T0 + 30 * MIN })
    const { chains } = buildChains([finding({ id: 'A:0', host: 'WS1', evidence: [e1] }), finding({ id: 'B:0', host: 'SRV1', evidence: [e2], firstTs: e2.ts, lastTs: e2.ts })])
    expect(chains).toHaveLength(1)
    expect(chains[0]!.hosts).toEqual(['SRV1', 'WS1'])
    expect(chains[0]!.risk.components.some((c) => /Spans 2 hosts/.test(c.label))).toBe(true)
  })
  it('ignores machine accounts, SYSTEM and system logon IDs as link keys', () => {
    const a = ev({ eventId: 1, computer: 'WS1', subjectUserName: 'WS1$', subjectLogonId: '0x3e7', targetUserName: 'SYSTEM' })
    const b = ev({ eventId: 2, computer: 'WS2', subjectUserName: 'WS1$', subjectLogonId: '0x3e7', targetUserName: 'SYSTEM' })
    expect(buildChains([finding({ id: 'A:0', host: 'WS1', evidence: [a] }), finding({ id: 'B:0', host: 'WS2', evidence: [b] })]).chains).toHaveLength(0)
  })
  it('links by shared logon session at any time distance', () => {
    const mk = (id: string, tsMin: number) => { const e = ev({ eventId: 4688, subjectLogonId: '0x7a7a', ts: T0 + tsMin * MIN }); return finding({ id, evidence: [e], firstTs: e.ts, lastTs: e.ts }) }
    expect(buildChains([mk('A:0', 0), mk('B:0', 600)]).chains[0]!.links.join()).toMatch(/logon session 0x7a7a/)
  })
  it('links parent/child processes by PID (4688 NewProcessId ↔ ProcessId)', () => {
    const parent = ev({ eventId: 4688, newProcessId: 4242 }), child = ev({ eventId: 4688, processId: 4242, ts: T0 + 5 * MIN })
    const mk = (id: string, e: CanonicalEvent, host: string) => finding({ id, host, evidence: [e], firstTs: e.ts, lastTs: e.ts })
    // different "host" label on the finding but same computer on events => only the PID/host keys connect them
    expect(buildChains([mk('A:0', parent, 'X'), mk('B:0', child, 'Y')]).chains).toHaveLength(1)
  })
  it('noisy low/info findings attach to a chain but never bridge two chains', () => {
    const e = (c: string, u: string, t: number) => ev({ eventId: 1, computer: c, subjectUserName: u, ts: T0 + t * MIN })
    const strong = (id: string, host: string, user: string, t: number) => finding({ id, host, evidence: [e(host, user, t)], firstTs: T0 + t * MIN, lastTs: T0 + t * MIN })
    const noisy = finding({ id: 'N:0', severity: 'info', host: 'WS1', evidence: [e('WS1', 'alice', 3), e('WS2', 'carol', 3)], firstTs: T0 + 3 * MIN, lastTs: T0 + 3 * MIN })
    const { chains } = buildChains([strong('A:0', 'WS1', 'alice', 0), strong('B:0', 'WS1', 'alice', 5), strong('C:0', 'WS2', 'carol', 0), strong('D:0', 'WS2', 'carol', 5), noisy])
    expect(chains).toHaveLength(2) // the info finding touches both but must not merge them
    expect(chains.filter((c) => c.findingIds.includes('N:0'))).toHaveLength(1)
  })
  it('REGRESSION (real workstation data): one medium finding + one info finding sharing a logon session is NOT a chain', () => {
    const e = (id: number, tsMin: number) => ev({ eventId: id, subjectLogonId: '0x1a2b3c', subjectUserName: 'alice', ts: T0 + tsMin * MIN })
    const medium = finding({ id: 'AUD-002:0', severity: 'medium', evidence: [e(4719, 29 * 60)], firstTs: T0 + 29 * 60 * MIN, lastTs: T0 + 29 * 60 * MIN })
    const info = finding({ id: 'PRIV-001:0', severity: 'info', evidence: [e(4672, 0)], firstTs: T0, lastTs: T0 })
    const r = buildChains([medium, info])
    expect(r.chains).toHaveLength(0)
    expect(r.unchained.sort()).toEqual(['AUD-002:0', 'PRIV-001:0'])
  })
  it('two medium+ findings still chain, and context findings can then decorate that chain', () => {
    const e = (id: number, tsMin: number) => ev({ eventId: id, subjectLogonId: '0x1a2b3c', ts: T0 + tsMin * MIN })
    const mk = (id: string, severity: Finding['severity'], tsMin: number) => finding({ id, severity, evidence: [e(1, tsMin)], firstTs: T0 + tsMin * MIN, lastTs: T0 + tsMin * MIN })
    const { chains } = buildChains([mk('A:0', 'high', 0), mk('B:0', 'medium', 5), mk('N:0', 'info', 3)])
    expect(chains).toHaveLength(1)
    expect(chains[0]!.findingIds.sort()).toEqual(['A:0', 'B:0', 'N:0'])
  })
  it('a lone sequence finding is a chain by itself; a lone match finding is not', () => {
    expect(buildChains([finding({ id: 'S:0', kind: 'sequence' })]).chains).toHaveLength(1)
    expect(buildChains([finding({ id: 'M:0' })]).chains).toHaveLength(0)
  })
  it('scales: 20k findings across 2k hosts chains in well under a second', () => {
    const fs: Finding[] = []
    for (let i = 0; i < 20000; i++) fs.push(finding({ id: `R${i % 20}:${i}`, host: `H${i % 2000}`, firstTs: T0 + (i % 50) * MIN, lastTs: T0 + (i % 50) * MIN }))
    const t = performance.now(); const { chains } = buildChains(fs)
    expect(performance.now() - t).toBeLessThan(2000)
    expect(chains.length).toBeGreaterThan(100)
  })
})

describe('risk scoring', () => {
  const f = (severity: Finding['severity'], tactic = 'TA0002', kind: Finding['kind'] = 'match', confidence = 1): Finding => ({
    id: severity, ruleId: 'X', ruleName: 'x', packId: 'p', kind, severity, confidence, attack: [{ tactic, technique: 'T1059' }], count: 1, firstTs: 0, lastTs: 0,
    evidence: [], evidenceTruncated: false, entities: { users: [], hosts: [], ips: [] }, suppressed: 0 })
  it('is deterministic, explainable (components sum to the score) and capped at 100', () => {
    const r = scoreChain([f('critical', 'TA0006'), f('critical', 'TA0005'), f('high', 'TA0008'), f('high', 'TA0003'), f('high', 'TA0040', 'sequence'), f('high', 'TA0010')], 3)
    expect(r.score).toBe(100)
    expect(scoreChain([f('high'), f('medium', 'TA0005')], 1).components.reduce((s, c) => s + c.points, 0)).toBe(scoreChain([f('high'), f('medium', 'TA0005')], 1).score)
  })
  it('more tactics, more hosts and a sequence match raise the score', () => {
    const base = scoreChain([f('high'), f('high')], 1).score
    expect(scoreChain([f('high', 'TA0002'), f('high', 'TA0005')], 1).score).toBeGreaterThan(base)
    expect(scoreChain([f('high'), f('high')], 2).score).toBeGreaterThan(base)
    expect(scoreChain([f('high', 'TA0002', 'sequence'), f('high')], 1).score).toBeGreaterThan(base)
  })
  it('labels and overall score', () => {
    expect([0, 14, 15, 35, 60, 80].map(labelFor)).toEqual(['Informational', 'Informational', 'Low', 'Medium', 'High', 'Critical'])
    expect(scoreOverall([]).score).toBe(0)
    expect(scoreOverall([{ score: 70, title: 'a' }, { score: 50, title: 'b' }]).score).toBe(75)
  })
})

describe('end to end', () => {
  it('a realistic intrusion becomes ONE chain, ordered by time, with the right stages', async () => {
    const rows = ['EventID,TimeGenerated,Computer,TargetUserName,SubjectUserName,IpAddress,LogonType,TargetLogonId,SubjectLogonId,NewProcessName,CommandLine,ServiceName']
    const R = (t: string, o: Record<string, string>) => rows.push(['EventID', 'TimeGenerated', 'Computer', 'TargetUserName', 'SubjectUserName', 'IpAddress', 'LogonType', 'TargetLogonId', 'SubjectLogonId', 'NewProcessName', 'CommandLine', 'ServiceName'].map((k) => k === 'TimeGenerated' ? t : (o[k] ?? '')).join(','))
    for (let i = 0; i < 12; i++) R(`2025-03-01T10:00:${String(i).padStart(2, '0')}Z`, { EventID: '4625', Computer: 'SRV1', TargetUserName: 'admin', IpAddress: '203.0.113.9', LogonType: '3' })
    R('2025-03-01T10:01:00Z', { EventID: '4624', Computer: 'SRV1', TargetUserName: 'admin', IpAddress: '203.0.113.9', LogonType: '3', TargetLogonId: '0xABC' })
    R('2025-03-01T10:01:01Z', { EventID: '4672', Computer: 'SRV1', SubjectUserName: 'admin', SubjectLogonId: '0xABC' })
    R('2025-03-01T10:02:00Z', { EventID: '4688', Computer: 'SRV1', SubjectUserName: 'admin', SubjectLogonId: '0xABC', NewProcessName: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', CommandLine: 'powershell -enc ' + 'QUJD'.repeat(15) })
    R('2025-03-01T10:09:00Z', { EventID: '1102', Computer: 'SRV1', SubjectUserName: 'admin', SubjectLogonId: '0xABC' })
    R('2025-03-01T11:00:00Z', { EventID: '4688', Computer: 'WS9', SubjectUserName: 'dave', NewProcessName: 'C:\\x.exe', CommandLine: 'vssadmin delete shadows /all' }) // unrelated host, an hour later
    const r = (await analyze(new Blob([rows.join('\n')]), [], { format: 'csv' }))!
    const ruleIds = r.findings.map((f) => f.ruleId)
    for (const id of ['AUTH-001', 'AUTH-006', 'LAT-001', 'EXEC-001', 'AUD-001', 'EVAS-002', 'IMP-001']) expect(ruleIds).toContain(id)
    const main = r.chains.find((c) => c.hosts.includes('SRV1'))!
    expect(main.hosts).not.toContain('WS9')
    expect(main.findingIds.length).toBeGreaterThanOrEqual(6)
    expect(main.stages.map((s) => s.tactic)[0]).toBe('TA0006') // brute force first
    expect(main.narrative.map((n) => n.ts)).toEqual([...main.narrative.map((n) => n.ts)].sort((a, b) => a - b))
    expect(main.risk.label).toMatch(/Critical|High/)
    expect(r.topThreats[0]!.score).toBeGreaterThanOrEqual(main.risk.score - 1)
    expect(r.risk.score).toBeGreaterThanOrEqual(main.risk.score)
    expect(r.unchained.some((id) => id.startsWith('IMP-001'))).toBe(true) // lone ransomware precursor stays visible as a standalone finding
  })
})
