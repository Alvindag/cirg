import { tacticName, techniqueName } from '../attack'
import type { CanonicalEvent } from '../types'
import { getField } from './compile'
import type { CompiledRule, CompiledSequence, EngineStats, Finding } from './types'
import { SEVERITY_RANK } from './types'

export interface EngineLimits {
  evidencePerFinding: number
  maxFindingsPerRule: number
  maxStampsPerGroup: number
  maxEventsPerGroup: number
  maxGroupsPerRule: number
  /** Match rules: events on one host separated by more than this form separate findings (episodes). */
  episodeGapMs: number
  /** Match rules: evidence events retained per host bucket / total per rule. */
  matchEvidencePerHost: number
  matchEvidencePerRule: number
  /** Sequence rules: events retained per step per correlation bucket / total per rule / buckets per rule. */
  seqEventsPerStep: number
  seqEventsPerRule: number
  seqBucketsPerRule: number
  entityKeys: number
  ruleTimeBudgetMs: number
}
export const DEFAULT_LIMITS: EngineLimits = {
  evidencePerFinding: 25, maxFindingsPerRule: 200, maxStampsPerGroup: 100_000, maxEventsPerGroup: 1000,
  maxGroupsPerRule: 50_000, episodeGapMs: 60 * 60_000, matchEvidencePerHost: 200, matchEvidencePerRule: 200_000,
  seqEventsPerStep: 200, seqEventsPerRule: 500_000, seqBucketsPerRule: 200_000, entityKeys: 1000, ruleTimeBudgetMs: 15_000,
}

type Entities = { users: Map<string, number>; hosts: Map<string, number>; ips: Map<string, number> }
const newEntities = (): Entities => ({ users: new Map(), hosts: new Map(), ips: new Map() })

function bump(m: Map<string, number>, k: string | undefined, cap: number) {
  if (!k) return
  const n = m.get(k)
  if (n !== undefined) m.set(k, n + 1)
  else if (m.size < cap) m.set(k, 1)
}
function track(en: Entities, e: CanonicalEvent, cap: number) {
  bump(en.users, e.targetUserName, cap); bump(en.users, e.subjectUserName, cap)
  bump(en.hosts, e.computer, cap); bump(en.ips, e.ipAddress, cap)
}
const top = (m: Map<string, number>): [string, number][] => [...m].sort((a, b) => b[1] - a[1]).slice(0, 5)
const topEntities = (en: Entities) => ({ users: top(en.users), hosts: top(en.hosts), ips: top(en.ips) })
const UNKNOWN_HOST = '(unknown host)'

interface HostBucket { stamps: number[]; evidence: CanonicalEvent[]; maxIdx: number; suppressed: number }
interface Group {
  values: Record<string, string>
  stamps: number[]; distinct: string[]
  events: CanonicalEvent[]
}
interface SeqBucket { steps: Map<string, CanonicalEvent[]> }
interface RuleRt {
  c: CompiledRule
  evals: number; ms: number; disabled: boolean
  suppressed: number
  capped: boolean
  // match
  hosts?: Map<string, HostBucket>; evidenceTotal: number
  // threshold
  groups?: Map<string, Group>
  // sequence
  buckets?: Map<string, SeqBucket>; seqTotal: number
}

type BaseFinding = Omit<Finding, 'id' | 'kind' | 'count' | 'firstTs' | 'lastTs' | 'evidence' | 'evidenceTruncated' | 'entities' | 'suppressed'>

export class RuleEngine {
  private byEvent = new Map<number, RuleRt[]>()
  private rts: RuleRt[] = []
  private processed = 0
  private lim: EngineLimits
  private disabledForTime: string[] = []

  constructor(rules: CompiledRule[], limits: Partial<EngineLimits> = {}) {
    this.lim = { ...DEFAULT_LIMITS, ...limits }
    for (const c of rules) {
      const rt: RuleRt = { c, evals: 0, ms: 0, disabled: false, suppressed: 0, capped: false, evidenceTotal: 0, seqTotal: 0 }
      if (c.def.kind === 'match') rt.hosts = new Map()
      else if (c.def.kind === 'threshold') rt.groups = new Map()
      else rt.buckets = new Map()
      this.rts.push(rt)
      for (const id of c.eventIds) { const l = this.byEvent.get(id); if (l) l.push(rt); else this.byEvent.set(id, [rt]) }
    }
  }

  /** Drop every retained event/timestamp so the memory can be reclaimed immediately (called after finalize). */
  destroy(): void {
    for (const rt of this.rts) {
      rt.hosts?.clear(); rt.groups?.clear(); rt.buckets?.clear()
      rt.evidenceTotal = 0; rt.seqTotal = 0; rt.disabled = true
    }
    this.byEvent.clear()
  }

  process(e: CanonicalEvent): void {
    this.processed++
    const list = this.byEvent.get(e.eventId)
    if (!list) return
    for (const rt of list) {
      if (rt.disabled) continue
      const sampled = (++rt.evals & 127) === 0
      const t0 = sampled ? performance.now() : 0
      if (rt.buckets) this.evalSequence(rt, e)
      else this.evalRule(rt, e)
      if (sampled) {
        rt.ms += (performance.now() - t0) * 128 // extrapolate from 1-in-128 timing
        if (rt.ms > this.lim.ruleTimeBudgetMs) { rt.disabled = true; this.disabledForTime.push(rt.c.def.id) }
      }
    }
  }

  // ---------------------------------------------------------------- match / threshold

  private evalRule(rt: RuleRt, e: CanonicalEvent) {
    if (!rt.c.predicate(e)) return
    if (rt.c.suppress?.(e)) { rt.suppressed++; return }
    const L = this.lim
    if (rt.hosts) {
      const key = e.computer ?? UNKNOWN_HOST
      let b = rt.hosts.get(key)
      if (!b) {
        if (rt.hosts.size >= L.maxGroupsPerRule) { rt.capped = true; return }
        b = { stamps: [], evidence: [], maxIdx: -1, suppressed: 0 }
        rt.hosts.set(key, b)
      }
      if (b.stamps.length < L.maxStampsPerGroup) b.stamps.push(e.ts); else rt.capped = true
      // Keep the earliest N evidence events per host regardless of input order.
      if (b.evidence.length < L.matchEvidencePerHost && rt.evidenceTotal < L.matchEvidencePerRule) {
        b.evidence.push(e); rt.evidenceTotal++
        if (b.maxIdx < 0 || e.ts > b.evidence[b.maxIdx]!.ts) b.maxIdx = b.evidence.length - 1
      } else if (b.evidence.length >= L.matchEvidencePerHost && e.ts < b.evidence[b.maxIdx]!.ts) {
        b.evidence[b.maxIdx] = e
        let mi = 0
        for (let i = 1; i < b.evidence.length; i++) if (b.evidence[i]!.ts > b.evidence[mi]!.ts) mi = i
        b.maxIdx = mi
      }
      return
    }
    const th = rt.c.threshold!
    const values: Record<string, string> = {}
    for (const f of th.groupBy) { const v = getField(e, f); if (v === undefined) return; values[f] = String(v) }
    const key = th.groupBy.map((f) => values[f]).join('\u0001')
    let g = rt.groups!.get(key)
    if (!g) {
      if (rt.groups!.size >= L.maxGroupsPerRule) { rt.capped = true; return }
      g = { values, stamps: [], distinct: [], events: [] }
      rt.groups!.set(key, g)
    }
    if (g.stamps.length < L.maxStampsPerGroup) {
      g.stamps.push(e.ts)
      if (th.distinct) g.distinct.push(String(getField(e, th.distinct) ?? ''))
    } else rt.capped = true
    if (g.events.length < L.maxEventsPerGroup) g.events.push(e)
  }

  // ---------------------------------------------------------------- sequence collection

  private keyValue(seq: CompiledSequence, k: number, stepId: string, e: CanonicalEvent): string | undefined {
    const field = seq.keys[k]!.bind.get(stepId)
    if (!field) return undefined
    const v = getField(e, field)
    if (v === undefined) return undefined
    const s = String(v).toLowerCase()
    return seq.keys[k]!.scope === 'host' ? `${e.computer ?? ''}\u0001${s}` : s
  }

  private evalSequence(rt: RuleRt, e: CanonicalEvent) {
    const seq = rt.c.sequence!
    for (const step of seq.steps) {
      if (!step.eventIds.has(e.eventId) || !step.predicate(e)) continue
      const key = this.keyValue(seq, 0, step.id, e)
      if (key === undefined) continue
      let b = rt.buckets!.get(key)
      if (!b) {
        if (rt.buckets!.size >= this.lim.seqBucketsPerRule) { rt.capped = true; continue }
        b = { steps: new Map() }
        rt.buckets!.set(key, b)
      }
      let list = b.steps.get(step.id)
      if (!list) { list = []; b.steps.set(step.id, list) }
      if (list.length >= this.lim.seqEventsPerStep || rt.seqTotal >= this.lim.seqEventsPerRule) { rt.capped = true; continue }
      list.push(e); rt.seqTotal++
    }
  }

  // ---------------------------------------------------------------- finalize

  finalize(): { findings: Finding[]; stats: EngineStats } {
    const out: Finding[] = []
    const truncated: string[] = []
    const capped: string[] = []
    for (const rt of this.rts) {
      const def = rt.c.def
      const attack = def.attack.map((a) => ({ ...a, tacticName: tacticName(a.tactic), techniqueName: techniqueName(a.technique) }))
      const base: BaseFinding = { ruleId: def.id, ruleName: def.name, packId: rt.c.packId, severity: def.severity, confidence: def.confidence ?? 0.5, attack, context: def.context, response: def.response }
      let found: Finding[] = []
      if (rt.hosts) for (const [host, b] of rt.hosts) found.push(...this.episodes(host, b, base))
      else if (rt.groups) for (const g of rt.groups.values()) found.push(...this.bursts(rt, g, base))
      else if (rt.buckets) for (const b of rt.buckets.values()) found.push(...this.chains(rt, b, base))
      if (rt.capped) capped.push(def.id)
      found.sort((a, b) => b.count - a.count || a.firstTs - b.firstTs)
      if (found.length > this.lim.maxFindingsPerRule) truncated.push(def.id)
      found = found.slice(0, this.lim.maxFindingsPerRule)
      found.forEach((f, i) => { f.id = `${def.id}:${i}`; f.suppressed = rt.suppressed })
      out.push(...found)
    }
    out.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.confidence - a.confidence || b.count - a.count)
    const stats: EngineStats = {
      eventsProcessed: this.processed, rulesActive: this.rts.length - this.disabledForTime.length,
      rulesDisabledForTime: this.disabledForTime, findingsTruncated: truncated, capped,
    }
    return { findings: out, stats }
  }

  /** Match rules: one finding per host per episode (a run of hits with no gap larger than episodeGapMs); low/info rules: one per host. */
  private episodes(host: string, b: HostBucket, base: BaseFinding): Finding[] {
    const ts = b.stamps.slice().sort((x, y) => x - y)
    const ev = b.evidence.slice().sort((x, y) => x.ts - y.ts)
    const res: Finding[] = []
    let start = 0
    // Noisy context rules (low/info) collapse to ONE finding per host for the whole period; only medium+ detections split into episodes.
    const gap = SEVERITY_RANK[base.severity] <= SEVERITY_RANK.low ? Infinity : this.lim.episodeGapMs
    for (let i = 1; i <= ts.length; i++) {
      if (i < ts.length && ts[i]! - ts[i - 1]! <= gap) continue
      const t0 = ts[start]!, t1 = ts[i - 1]!, count = i - start
      const mine = ev.filter((e) => e.ts >= t0 && e.ts <= t1)
      const shown = mine.slice(0, this.lim.evidencePerFinding)
      const en = newEntities()
      for (const e of mine) track(en, e, this.lim.entityKeys)
      res.push({
        ...base, id: '', kind: 'match', count, firstTs: t0, lastTs: t1, host: host === UNKNOWN_HOST ? undefined : host,
        evidence: shown, evidenceTruncated: count > shown.length, entities: topEntities(en), suppressed: 0,
      })
      start = i
    }
    return res
  }

  /** Order-independent sliding-window burst detection over one group's timestamps. */
  private bursts(rt: RuleRt, g: Group, base: BaseFinding): Finding[] {
    const th = rt.c.threshold!
    const n = g.stamps.length
    if (n < th.count) return []
    const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => g.stamps[a]! - g.stamps[b]!)
    const ts = idx.map((i) => g.stamps[i]!)
    const dv = th.distinct ? idx.map((i) => g.distinct[i]!) : null
    const win = new Map<string, number>()
    const metric = (left: number, right: number) => (dv ? win.size : right - left + 1)
    const add = (i: number) => { if (dv) win.set(dv[i]!, (win.get(dv[i]!) ?? 0) + 1) }
    const del = (i: number) => { if (dv) { const c = win.get(dv[i]!)! - 1; if (c <= 0) win.delete(dv[i]!); else win.set(dv[i]!, c) } }

    const res: Finding[] = []
    let left = 0, active = false, bStart = 0, bEnd = 0
    const emit = () => {
      const t0 = ts[bStart]!, t1 = ts[bEnd]!
      const ev = g.events.filter((e) => e.ts >= t0 && e.ts <= t1).sort((a, b) => a.ts - b.ts)
      const en = newEntities()
      for (const e of ev) track(en, e, this.lim.entityKeys)
      const distinctCount = dv ? new Set(dv.slice(bStart, bEnd + 1)).size : undefined
      res.push({
        ...base, id: '', kind: 'threshold', count: bEnd - bStart + 1, firstTs: t0, lastTs: t1, group: g.values, distinctCount,
        host: ev[0]?.computer,
        evidence: ev.slice(0, this.lim.evidencePerFinding), evidenceTruncated: ev.length < bEnd - bStart + 1 || ev.length > this.lim.evidencePerFinding,
        entities: topEntities(en), suppressed: 0,
      })
    }
    for (let j = 0; j < n; j++) {
      add(j)
      while (ts[j]! - ts[left]! > th.windowMs) { del(left); left++ }
      if (metric(left, j) >= th.count) {
        if (!active) { active = true; bStart = left }
        bEnd = j
      } else if (active) {
        emit(); active = false
        win.clear(); add(j); left = j // restart so a finished burst cannot re-trigger
      }
    }
    if (active) emit()
    return res
  }

  /**
   * Sequence rules: within one primary-key bucket, find ordered (or unordered) step matches inside `within`.
   * Secondary keys are equality constraints against the anchor event. Matches do not overlap.
   */
  private chains(rt: RuleRt, b: SeqBucket, base: BaseFinding): Finding[] {
    const seq = rt.c.sequence!
    const sorted = new Map<string, CanonicalEvent[]>()
    for (const [id, l] of b.steps) sorted.set(id, l.slice().sort((x, y) => x.ts - y.ts))
    const required = seq.steps.filter((s) => !s.optional && !s.negate)
    for (const s of required) if ((sorted.get(s.id)?.length ?? 0) < s.min) return []

    const anchors: { step: string; e: CanonicalEvent }[] = seq.ordered
      ? (sorted.get(seq.steps[0]!.id) ?? []).map((e) => ({ step: seq.steps[0]!.id, e }))
      : required.flatMap((s) => (sorted.get(s.id) ?? []).map((e) => ({ step: s.id, e }))).sort((x, y) => x.e.ts - y.e.ts)

    const sec = (stepId: string, e: CanonicalEvent) => seq.keys.slice(1).map((_, i) => this.keyValue(seq, i + 1, stepId, e))
    const secOk = (aVals: (string | undefined)[], stepId: string, e: CanonicalEvent) => {
      const vals = sec(stepId, e)
      return aVals.every((a, i) => a === undefined || vals[i] === undefined || a === vals[i])
    }

    const res: Finding[] = []
    let doneUntil = -Infinity
    for (const a of anchors) {
      if (a.e.ts <= doneUntil) continue
      const limit = a.e.ts + seq.withinMs
      const aVals = sec(a.step, a.e)
      const chosen = new Map<string, CanonicalEvent[]>([[a.step, [a.e]]])
      let prev = a.e.ts, ok = true
      for (const s of seq.steps) {
        if (s.negate) continue
        const isAnchor = s.id === a.step
        const lo = seq.ordered ? prev : a.e.ts
        const cands = (sorted.get(s.id) ?? []).filter((e) => e !== a.e && e.ts >= lo && e.ts <= limit && secOk(aVals, s.id, e))
        const need = isAnchor ? s.min - 1 : s.min // the anchor event itself counts toward its own step's minimum
        if (cands.length < need) { if (s.optional) continue; ok = false; break }
        const take = cands.slice(0, need)
        chosen.set(s.id, isAnchor ? [a.e, ...take] : take)
        if (seq.ordered && (take.length || isAnchor)) prev = (take.length ? take[take.length - 1]! : a.e).ts
      }
      if (!ok) continue
      const all = [...chosen.values()].flat()
      const t0 = Math.min(...all.map((e) => e.ts)), t1 = Math.max(...all.map((e) => e.ts))
      // Negated steps: the chain is void if a forbidden event occurs inside its span.
      const blocked = seq.steps.some((s) => s.negate && (sorted.get(s.id) ?? []).some((e) => e.ts >= t0 && e.ts <= t1 && secOk(aVals, s.id, e)))
      if (blocked) continue
      doneUntil = t1
      if (rt.c.suppress && all.some((e) => rt.c.suppress!(e))) { rt.suppressed++; continue }
      const steps = seq.steps.filter((s) => chosen.has(s.id)).map((s) => ({ id: s.id, events: chosen.get(s.id)!.slice().sort((x, y) => x.ts - y.ts) }))
      const evidence = all.slice().sort((x, y) => x.ts - y.ts)
      const en = newEntities()
      for (const e of evidence) track(en, e, this.lim.entityKeys)
      const key: Record<string, string> = {}
      seq.keys.forEach((k, i) => { const v = this.keyValue(seq, i, a.step, a.e); if (v !== undefined) key[k.name] = v.split('\u0001').pop()! })
      res.push({
        ...base, id: '', kind: 'sequence', count: evidence.length, firstTs: t0, lastTs: t1, group: key, host: evidence[0]?.computer,
        steps, evidence: evidence.slice(0, this.lim.evidencePerFinding), evidenceTruncated: evidence.length > this.lim.evidencePerFinding,
        entities: topEntities(en), suppressed: 0,
      })
    }
    return res
  }
}
