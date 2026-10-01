import type { Finding, Severity } from '../rules/types'

export type RiskLabel = 'Critical' | 'High' | 'Medium' | 'Low' | 'Informational'
export interface RiskScore { score: number; label: RiskLabel; components: { label: string; points: number }[] }

const SEV_WEIGHT: Record<Severity, number> = { info: 5, low: 15, medium: 35, high: 60, critical: 85 }

export const labelFor = (score: number): RiskLabel =>
  score >= 80 ? 'Critical' : score >= 60 ? 'High' : score >= 35 ? 'Medium' : score >= 15 ? 'Low' : 'Informational'

/** Rule severity scaled by the rule author's confidence (0.6..1.0 of the severity weight). */
export const findingScore = (f: Finding) => Math.round(SEV_WEIGHT[f.severity] * (0.6 + 0.4 * f.confidence))

/**
 * Chain score. Transparent and deterministic, so analysts can see exactly why a chain ranks where it does:
 *   strongest finding + 30% of the 2nd + 15% of the next three
 *   + 5 per additional ATT&CK tactic (max 20) + 8 if it spans 2+ hosts + 10 if a correlated sequence rule fired.
 */
export function scoreChain(findings: Finding[], hosts: number): RiskScore {
  const scores = findings.map(findingScore).sort((a, b) => b - a)
  const components: RiskScore['components'] = []
  const add = (label: string, points: number) => { if (points > 0) components.push({ label, points: Math.round(points) }) }
  add('Strongest finding', scores[0] ?? 0)
  add('Second finding (30%)', (scores[1] ?? 0) * 0.3)
  add('Next three findings (15%)', ((scores[2] ?? 0) + (scores[3] ?? 0) + (scores[4] ?? 0)) * 0.15)
  const tactics = new Set(findings.flatMap((f) => f.attack.map((a) => a.tactic)))
  add(`${tactics.size} ATT&CK tactics`, Math.min(20, Math.max(0, tactics.size - 1) * 5))
  if (hosts >= 2) add(`Spans ${hosts} hosts`, 8)
  if (findings.some((f) => f.kind === 'sequence')) add('Correlated sequence matched', 10)
  const score = Math.min(100, components.reduce((s, c) => s + c.points, 0))
  return { score, label: labelFor(score), components }
}

/** Overall file risk: the worst item, plus a small amount for each additional serious chain/finding. */
export function scoreOverall(items: { score: number; title: string }[]): RiskScore {
  const sorted = items.map((i) => i.score).sort((a, b) => b - a)
  if (!sorted.length) return { score: 0, label: 'Informational', components: [{ label: 'No findings', points: 0 }] }
  const extra = Math.round((sorted[1] ?? 0) * 0.1 + (sorted[2] ?? 0) * 0.05 + (sorted[3] ?? 0) * 0.05)
  const components = [{ label: 'Highest-risk item', points: sorted[0]! }]
  if (extra > 0) components.push({ label: 'Additional items (10% / 5% / 5%)', points: extra })
  const score = Math.min(100, sorted[0]! + extra)
  return { score, label: labelFor(score), components }
}
