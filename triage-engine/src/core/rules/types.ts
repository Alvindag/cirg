import type { CanonicalEvent } from '../types'

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical'
export const SEVERITY_RANK: Record<Severity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 }

export type Condition =
  | { all: Condition[] } | { any: Condition[] } | { not: Condition }
  | { field: string; op: Op; value?: unknown; caseInsensitive?: boolean }
export type Op = 'eq' | 'neq' | 'in' | 'notIn' | 'contains' | 'startsWith' | 'endsWith' | 'regex' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists' | 'cidr'

export interface Action { title: string; shell?: 'powershell' | 'cmd' | 'kql' | 'spl' | 'manual'; command?: string; risk?: 'read-only' | 'disruptive' }
export interface RuleContext { summary?: string; falsePositives?: string[]; maliciousIndicators?: string[]; references?: string[] }

export interface RuleDef {
  id: string; name: string; enabled?: boolean; kind: 'match' | 'threshold' | 'sequence'
  severity: Severity; confidence?: number; tags?: string[]
  attack: { tactic: string; technique: string }[]
  when: Record<string, unknown>
  suppress?: Condition[]
  context?: RuleContext
  response?: { investigate?: Action[]; remediate?: Action[] }
}
export interface RulePack {
  schemaVersion: '1.0'
  pack: { id: string; name: string; version: string; attackVersion?: string }
  assets?: Record<string, string[]>
  rules: RuleDef[]
}

export type Predicate = (e: CanonicalEvent) => boolean

export interface CompiledRule {
  def: RuleDef
  packId: string
  eventIds: Set<number>
  predicate: Predicate
  suppress: Predicate | null
  threshold?: { groupBy: string[]; count: number; distinct?: string; windowMs: number }
  sequence?: CompiledSequence
}

export interface CompiledStep {
  id: string
  eventIds: Set<number>
  predicate: Predicate
  optional: boolean
  negate: boolean
  min: number
}
export interface CompiledSequence {
  steps: CompiledStep[]
  withinMs: number
  ordered: boolean
  /** keys[0] is the bucket (primary) key; the rest are equality constraints checked inside a bucket. */
  keys: { name: string; scope: 'host' | 'global'; bind: Map<string, string> }[]
}

export interface Finding {
  id: string
  ruleId: string; ruleName: string; packId: string; kind: 'match' | 'threshold' | 'sequence'
  severity: Severity; confidence: number
  attack: { tactic: string; tacticName?: string; technique: string; techniqueName?: string }[]
  count: number
  firstTs: number; lastTs: number
  group?: Record<string, string>
  /** Computer the finding is about (match: the host bucket; sequence: the first step's host). */
  host?: string
  distinctCount?: number
  /** Sequence findings: the matched events per step, in step order. */
  steps?: { id: string; events: CanonicalEvent[] }[]
  evidence: CanonicalEvent[]
  evidenceTruncated: boolean
  entities: { users: [string, number][]; hosts: [string, number][]; ips: [string, number][] }
  suppressed: number
  context?: RuleContext
  response?: RuleDef['response']
}

export interface EngineStats {
  eventsProcessed: number
  rulesActive: number
  rulesDisabledForTime: string[]
  findingsTruncated: string[]
  /** Rules whose in-memory correlation/evidence caps were hit: results for these are lower bounds. */
  capped: string[]
}
