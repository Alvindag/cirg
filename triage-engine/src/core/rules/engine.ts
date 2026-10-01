import { tacticName, techniqueName } from '../attack'
import type { CanonicalEvent } from '../types'
import { getField } from './compile'
import type { CompiledRule, EngineStats, Finding } from './types'
import { SEVERITY_RANK } from './types'

export interface EngineLimits {
  evidencePerFinding: number
  maxFindingsPerRule: number
  maxStampsPerGroup: number
  maxEventsPerGroup: number
  maxGroupsPerRule: number
  entityKeys: number
  ruleTimeBudgetMs: number
}
export const DEFAULT_LIMITS: EngineLimits = {
  evidencePerFinding: 25, maxFindingsPerRule: 200, maxStampsPerGroup: 100_000, maxEventsPerGroup: 1000,
  maxGroupsPerRule: 50_000, entityKeys: 1000, ruleTimeBudgetMs: 15_000,
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

interface MatchState {
  count: number; suppressed: number; first: number; last: number
  evidence: CanonicalEvent[]; maxIdx: number; en: Entities
}
interface Group {
  values: Record<string, string>
  stamps: number[]; distinct: string[]
  events: CanonicalEvent[]
  stampsTruncated: boolean
}
interface RuleRt {
  c: CompiledRule
  evals: number; ms: number; disabled: boolean
  match?: MatchState
  groups?: Map<string, Group>; groupsTruncated?: boolean
  suppressed: number
}

export class RuleEngine {
  private byEvent = new Map<number, RuleRt[]>()
  private rts: RuleRt[] = []
  private processed = 0
  private lim: EngineLimits
  private disabledForTime: string[] = []

  constructor(rules: CompiledRule[], limits: Partial<EngineLimits> = {}, private deferred: string[] = []) {
    this.lim = { ...DEFAULT_LIMITS, ...limits }
    for (const c of rules) {
      const rt: RuleRt = { c, evals: 0, ms: 0, disabled: false, suppressed: 0 }
      if (c.def.kind === 'match') rt.match = { count: 0, suppressed: 0, first: Infinity, last: -Infinity, evidence: [], maxIdx: -1, en: newEntities() }
      else { rt.groups = new Map(); rt.groupsTruncated = false }
      this.rts.push(rt)
      for (const id of c.eventIds) { const l = this.byEvent.get(id); if (l) l.push(rt); else this.byEvent.set(id, [rt]) }
    }
  }

  process(e: CanonicalEvent): void {
    this.processed++
    const list = this.byEvent.get(e.eventId)
    if (!list) return
    for (const rt of list) {
      if (rt.disabled) continue
      const sampled = (++rt.evals & 127) === 0
      const t0 = sampled ? performance.now() : 0
      this.evalRule(rt, e)
      if (sampled) {
        rt.ms += (performance.now() - t0) * 128 // extrapolate from 1-in-128 timing
        if (rt.ms > this.lim.ruleTimeBudgetMs) { rt.disabled = true; this.disabledForTime.push(rt.c.def.id) }
      }
    }
  }

  private evalRule(rt: RuleRt, e: CanonicalEvent) {
    if (!rt.c.predicate(e)) return
    if (rt.c.suppress?.(e)) { rt.suppressed++; return }
    const L = this.lim
    if (rt.match) {
      const m = rt.match
      m.count++
      if (e.ts < m.first) m.first = e.ts
      if (e.ts > m.last) m.last = e.ts
      track(m.en, e, L.entityKeys)
      if (m.evidence.length < L.evidencePerFinding) {
        m.evidence.push(e)
        if (m.maxIdx < 0 || e.ts > m.evidence[m.maxIdx]!.ts) m.maxIdx = m.evidence.length - 1
      } else if (e.ts < m.evidence[m.maxIdx]!.ts) { // keep the earliest N regardless of input order
        m.evidence[m.maxIdx] = e
        let mi = 0
        for (let i = 1; i < m.evidence.length; i++) if (m.evidence[i]!.ts > m.evidence[mi]!.ts) mi = i
        m.maxIdx = mi
      }
      return
    }
    const th = rt.c.threshold!
    const values: Record<string, string> = {}
    for (const f of th.groupBy) { const v = getField(e, f); if (v === undefined) return; values[f] = String(v) }
    const key = th.groupBy.map((f) => values[f]).join('\u0001')
    let g = rt.groups!.get(key)
    if (!g) {
      if (rt.groups!.size >= L.maxGroupsPerRule) { rt.groupsTruncated = true; return }
      g = { values, stamps: [], distinct: [], events: [], stampsTruncated: false }
      rt.groups!.set(key, g)
    }
    if (g.stamps.length < L.maxStampsPerGroup) {
      g.stamps.push(e.ts)
      if (th.distinct) g.distinct.push(String(getField(e, th.distinct) ?? ''))
    } else g.stampsTruncated = true
    if (g.events.length < L.maxEventsPerGroup) g.events.push(e)
  }

  finalize(): { findings: Finding[]; stats: EngineStats } {
    const out: Finding[] = []
    const truncated: string[] = []
    for (const rt of this.rts) {
      const def = rt.c.def
      const attack = def.attack.map((a) => ({ ...a, tacticName: tacticName(a.tactic), techniqueName: techniqueName(a.technique) }))
      const base = { ruleId: def.id, ruleName: def.name, packId: rt.c.packId, severity: def.severity, confidence: def.confidence ?? 0.5, attack, context: def.context, response: def.response }
      if (rt.match) {
        const m = rt.match
        if (m.count > 0) {
          out.push({
            ...base, id: `${def.id}:0`, kind: 'match', count: m.count, firstTs: m.first, lastTs: m.last,
            evidence: [...m.evidence].sort((a, b) => a.ts - b.ts), evidenceTruncated: m.count > m.evidence.length,
            entities: topEntities(m.en), suppressed: rt.suppressed,
          })
        }
      } else if (rt.groups) {
        const found: Finding[] = []
        for (const g of rt.groups.values()) found.push(...this.bursts(rt, g, base))
        found.sort((a, b) => b.count - a.count)
        if (found.length > this.lim.maxFindingsPerRule || rt.groupsTruncated) truncated.push(def.id)
        found.slice(0, this.lim.maxFindingsPerRule).forEach((f, i) => { f.id = `${def.id}:${i}`; f.suppressed = rt.suppressed; out.push(f) })
      }
    }
    out.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.confidence - a.confidence || b.count - a.count)
    const stats: EngineStats = {
      eventsProcessed: this.processed, rulesActive: this.rts.length - this.disabledForTime.length,
      rulesDeferred: this.deferred, rulesDisabledForTime: this.disabledForTime, findingsTruncated: truncated,
    }
    return { findings: out, stats }
  }

  /** Order-independent sliding-window burst detection over one group's timestamps. */
  private bursts(rt: RuleRt, g: Group, base: Omit<Finding, 'id' | 'kind' | 'count' | 'firstTs' | 'lastTs' | 'evidence' | 'evidenceTruncated' | 'entities' | 'suppressed'>): Finding[] {
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
        // Start a fresh window at j so the finished burst cannot re-trigger.
        win.clear(); add(j); left = j
      }
    }
    if (active) emit()
    return res
  }
}
