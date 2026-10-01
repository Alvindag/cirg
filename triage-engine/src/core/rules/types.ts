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
}

export interface Finding {
  id: string
  ruleId: string; ruleName: string; packId: string; kind: 'match' | 'threshold'
  severity: Severity; confidence: number
  attack: { tactic: string; tacticName?: string; technique: string; techniqueName?: string }[]
  count: number
  firstTs: number; lastTs: number
  group?: Record<string, string>
  distinctCount?: number
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
  rulesDeferred: string[]   // sequence rules (Phase 3)
  rulesDisabledForTime: string[]
  findingsTruncated: string[]
}
