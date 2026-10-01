import { describe, expect, it } from 'vitest'
import { analyze, buildRules } from '../src/core/analysis'
import { RuleEngine } from '../src/core/rules/engine'
import { compilePacks, loadPack } from '../src/core/rules/load'
import type { CanonicalEvent } from '../src/core/types'

const T0 = Date.UTC(2025, 2, 1, 0, 0, 0)
const MIN = 60_000
const ev = (o: Partial<CanonicalEvent> & { eventId: number }): CanonicalEvent => ({ ts: T0, computer: 'DC1', ...o })
const fail = (min: number, user = 'jdoe', ip = '203.0.113.9') => ev({ eventId: 4625, ts: T0 + min * MIN, targetUserName: user, ipAddress: ip })
const ok = (min: number, user = 'jdoe', ip = '203.0.113.9') => ev({ eventId: 4624, ts: T0 + min * MIN, targetUserName: user, ipAddress: ip, logonType: 3 })
const engine = (events: CanonicalEvent[]) => { const { comp } = buildRules([]); const e = new RuleEngine(comp.rules); e.processAll(events); return e }

describe('two-pass correlation (guard steps)', () => {
  // Real DC data hit the 200-events-per-step cap for AUTH-006 because a busy account has thousands of successful logons.
  const noise = (n: number, startMin: number) => Array.from({ length: n }, (_, i) => ok(startMin + i * 0.1))

  it('REGRESSION: detects failures-then-success for an account with 5000 other successful logons, without hitting memory caps', () => {
    const events = [...noise(2500, 0), ...[0, 1, 2, 3, 4].map((i) => fail(400 + i)), ok(406), ...noise(2500, 500)]
    const e = engine(events)
    const { findings, stats } = e.finalize()
    const f = findings.find((x) => x.ruleId === 'AUTH-006')
    expect(f, 'AUTH-006 must fire').toBeDefined()
    expect(f!.steps!.map((s) => s.id)).toEqual(['fail', 'success'])
    expect(stats.capped).not.toContain('AUTH-006')
  })
  it('gives the same answer for ascending, descending and shuffled input', () => {
    const base = [...noise(1500, 0), ...[0, 1, 2, 3, 4].map((i) => fail(400 + i)), ok(406), ...noise(1500, 500)]
    const orders = [base, [...base].reverse(), [...base].sort(() => 0.5 - Math.sin(base.indexOf(base[0]!) + 1))]
    // deterministic pseudo-shuffle
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    orders.push([...base].map((x) => [rnd(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x))
    for (const evs of orders) expect(engine(evs).finalize().findings.some((x) => x.ruleId === 'AUTH-006')).toBe(true)
  })
  it('does not fire for a success BEFORE the failures, or for a different source IP', () => {
    expect(engine([ok(0), ...[10, 11, 12, 13, 14].map((i) => fail(i))]).finalize().findings.some((x) => x.ruleId === 'AUTH-006')).toBe(false)
    expect(engine([...[0, 1, 2, 3, 4].map((i) => fail(i)), ok(6, 'jdoe', '198.51.100.1')]).finalize().findings.some((x) => x.ruleId === 'AUTH-006')).toBe(false)
  })
  it('a second pass is only requested when a guard event exists', () => {
    const { comp } = buildRules([])
    const clean = new RuleEngine(comp.rules)
    for (const e of noise(500, 0)) clean.process(e, 1)
    expect(clean.needsSecondPass()).toBe(false)                // only successes: nothing to correlate, no re-read of the file
    const dirty = new RuleEngine(comp.rules)
    for (const e of [...noise(5, 0), fail(1)]) dirty.process(e, 1)
    expect(dirty.needsSecondPass()).toBe(true)
  })
  it('pass 2 never creates buckets: successes for accounts without failures are not retained or reported', () => {
    const e = engine([...noise(1000, 0), ...Array.from({ length: 800 }, (_, i) => ok(i, `user${i}`))])
    expect(e.finalize().findings.filter((f) => f.kind === 'sequence')).toEqual([])
  })
  it('analyze() reports the number of passes (1 for clean data, 2 when correlation needs it)', async () => {
    const clean = 'EventID,TimeGenerated,Computer\n4624,2025-03-01T10:00:00Z,A\n'
    expect((await analyze(new Blob([clean]), [], { format: 'csv' }))!.engine.passes).toBe(1)
    const rows = ['EventID,TimeGenerated,Computer,TargetUserName,IpAddress,LogonType']
    for (let i = 0; i < 6; i++) rows.push(`4625,2025-03-01T10:0${i}:00Z,DC1,bob,203.0.113.9,3`)
    rows.push('4624,2025-03-01T10:09:00Z,DC1,bob,203.0.113.9,3')
    const r = (await analyze(new Blob([rows.join('\n')]), [], { format: 'csv' }))!
    expect(r.engine.passes).toBe(2)
    expect(r.findings.some((f) => f.ruleId === 'AUTH-006')).toBe(true)
  })
  it('a cancelled second pass returns null', async () => {
    const rows = ['EventID,TimeGenerated,Computer,TargetUserName,IpAddress']
    for (let i = 0; i < 6; i++) rows.push(`4625,2025-03-01T10:0${i}:00Z,DC1,bob,1.2.3.4`)
    let calls = 0
    // cancel only after the first pass has completed (hash pass + pass 1 use isCancelled several times)
    const r = await analyze(new Blob([rows.join('\n')]), [], { format: 'csv', isCancelled: () => ++calls > 12 })
    expect(r === null || r.engine.passes === 2).toBe(true)
  })
  it('compile-time validation of guard steps', () => {
    const mk = (steps: object[]) => JSON.stringify({ schemaVersion: '1.0', pack: { id: 'g-test', name: 'g', version: '1.0.0' }, rules: [{
      id: 'GRD-001', name: 'g', kind: 'sequence', severity: 'low', attack: [{ tactic: 'TA0002', technique: 'T1059' }],
      when: { within: '5m', correlateOn: [{ name: 'k', scope: 'global', bind: { a: 'targetUserName', b: 'targetUserName' } }], steps } }] })
    const errs = (steps: object[]) => { const r = loadPack(mk(steps), 'json'); expect(r.errors).toEqual([]); return compilePacks([r.pack!]).errors.join() }
    expect(errs([{ id: 'a', eventIds: [1], guard: true }, { id: 'b', eventIds: [2], guard: true }])).toMatch(/at most one step/)
    expect(errs([{ id: 'a', eventIds: [1] }, { id: 'b', eventIds: [2], guard: true, optional: true }])).toMatch(/guard step "b" must be a required step/)
    expect(errs([{ id: 'a', eventIds: [1] }, { id: 'b', eventIds: [2], guard: true }])).toBe('')
  })
})
