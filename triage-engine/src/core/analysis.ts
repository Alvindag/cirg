import defaultPack from '../../rules/default-pack.json'
import { ingest, type IngestOptions } from './ingest'
import { compilePacks, loadPack } from './rules/load'
import { RuleEngine } from './rules/engine'
import { buildChains, chainTitle, type AttackChain } from './correlate/chains'
import { findingScore, scoreOverall, type RiskScore } from './correlate/risk'
import type { EngineStats, Finding, RulePack } from './rules/types'
import type { IngestSummary } from './types'

export interface PackInput { name: string; text: string; format: 'json' | 'yaml' }
export interface RuleLoadReport { packs: { id: string; name: string; version: string; rules: number }[]; errors: string[]; warnings: string[] }
export interface TopThreat { kind: 'chain' | 'finding'; id: string; title: string; score: number }
export interface AnalysisResult {
  summary: IngestSummary; findings: Finding[]; engine: EngineStats; ruleLoad: RuleLoadReport
  chains: AttackChain[]
  /** Finding ids not part of any chain. */
  unchained: string[]
  risk: RiskScore
  topThreats: TopThreat[]
}

/** Load the bundled pack + any user packs (untrusted, validated) and compile them. */
export function buildRules(custom: PackInput[]) {
  const errors: string[] = []
  const warnings: string[] = []
  const packs: RulePack[] = [defaultPack as unknown as RulePack]
  for (const c of custom) {
    const r = loadPack(c.text, c.format, c.name)
    errors.push(...r.errors); warnings.push(...r.warnings)
    if (r.pack) packs.push(r.pack)
  }
  const comp = compilePacks(packs)
  errors.push(...comp.errors); warnings.push(...comp.warnings)
  const report: RuleLoadReport = {
    packs: packs.map((p) => ({ id: p.pack.id, name: p.pack.name, version: p.pack.version, rules: p.rules.length })),
    errors, warnings,
  }
  return { comp, report }
}

export async function analyze(file: File | Blob, custom: PackInput[], opts: IngestOptions = {}): Promise<AnalysisResult | null> {
  const { comp, report } = buildRules(custom)
  const engine = new RuleEngine(comp.rules)
  const summary = await ingest(file, opts, (e) => engine.process(e))
  if (!summary) return null
  const { findings, stats } = engine.finalize()
  const { chains, unchained } = buildChains(findings)
  const byId = new Map(findings.map((f) => [f.id, f]))
  const items: TopThreat[] = [
    ...chains.map((c) => ({ kind: 'chain' as const, id: c.id, title: chainTitle(c), score: c.risk.score })),
    ...unchained.map((id) => byId.get(id)!).filter((f) => f.severity !== 'info').map((f) => ({ kind: 'finding' as const, id: f.id, title: `${f.ruleName}${f.host ? ` on ${f.host}` : ''}`, score: findingScore(f) })),
  ].sort((a, b) => b.score - a.score)
  return { summary, findings, engine: stats, ruleLoad: report, chains, unchained, risk: scoreOverall(items), topThreats: items.slice(0, 5) }
}
