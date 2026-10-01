import defaultPack from '../../rules/default-pack.json'
import { ingest, type IngestOptions } from './ingest'
import type { RuleEvents } from './audit/coverage'
import { sha256Blob, sha256Hex } from './hash/sha256'
import { compilePacks, loadPack } from './rules/load'
import { RuleEngine } from './rules/engine'
import { buildChains, chainTitle, type AttackChain } from './correlate/chains'
import { findingScore, scoreOverall, type RiskScore } from './correlate/risk'
import type { EngineStats, Finding, RulePack } from './rules/types'
import type { IngestSummary } from './types'

export interface PackInput { name: string; text: string; format: 'json' | 'yaml' }
export interface RuleLoadReport { packs: { id: string; name: string; version: string; rules: number; sha256: string }[]; errors: string[]; warnings: string[] }
export interface TopThreat { kind: 'chain' | 'finding'; id: string; title: string; score: number }
export interface AnalysisResult {
  summary: IngestSummary; findings: Finding[]; engine: EngineStats; ruleLoad: RuleLoadReport
  chains: AttackChain[]
  /** Finding ids not part of any chain. */
  unchained: string[]
  risk: RiskScore
  topThreats: TopThreat[]
  /** Event IDs each enabled rule depends on (for the logging-coverage assessment). */
  ruleEvents: RuleEvents[]
  /** Per-finding score (severity x confidence), for the report. */
  scoreByFinding: Record<string, number>
}

/** Load the bundled pack + any user packs (untrusted, validated) and compile them. */
export function buildRules(custom: PackInput[]) {
  const errors: string[] = []
  const warnings: string[] = []
  const packs: RulePack[] = [defaultPack as unknown as RulePack]
  const hashes: string[] = [sha256Hex(JSON.stringify(defaultPack))]
  for (const c of custom) {
    const r = loadPack(c.text, c.format, c.name)
    errors.push(...r.errors); warnings.push(...r.warnings)
    if (r.pack) { packs.push(r.pack); hashes.push(sha256Hex(c.text)) }
  }
  const comp = compilePacks(packs)
  errors.push(...comp.errors); warnings.push(...comp.warnings)
  const report: RuleLoadReport = {
    packs: packs.map((p, i) => ({ id: p.pack.id, name: p.pack.name, version: p.pack.version, rules: p.rules.length, sha256: hashes[i]! })),
    errors, warnings,
  }
  return { comp, report }
}

export async function analyze(file: File | Blob, custom: PackInput[], opts: IngestOptions = {}): Promise<AnalysisResult | null> {
  const { comp, report } = buildRules(custom)
  const engine = new RuleEngine(comp.rules)
  const isCancelled = opts.isCancelled ?? (() => false)
  const phase = (name: string) => (p: { bytes: number; events: number; rejected: number }) => opts.onProgress?.({ ...p, phase: name })

  // 1. Chain of custody: SHA-256 of the source, streamed.
  const sha256 = await sha256Blob(file, (bytes) => phase('Hashing source file (SHA-256)')({ bytes, events: 0, rejected: 0 }), isCancelled)
  if (sha256 === null) return null

  // 2. Pass 1: parse, normalize, aggregate, and run every rule. Guard-step rules collect only their selective step.
  const summary = await ingest(file, { ...opts, onProgress: phase('Analyzing') }, (e) => engine.process(e, 1))
  if (!summary) return null
  summary.sha256 = sha256

  // 3. Pass 2 (only if pass 1 found candidate buckets): collect the other steps, but only near guard events.
  let passes = 1
  if (engine.needsSecondPass()) {
    engine.beginSecondPass()
    const second = await ingest(file, { ...opts, format: summary.format, summarize: false, onProgress: phase('Correlating (pass 2 of 2)') }, (e) => engine.process(e, 2))
    if (!second && isCancelled()) return null
    passes = 2
  }

  const { findings, stats } = engine.finalize()
  stats.passes = passes
  engine.destroy() // release retained events/timestamps now; findings hold their own (capped) evidence
  const { chains, unchained } = buildChains(findings)
  const byId = new Map(findings.map((f) => [f.id, f]))
  const items: TopThreat[] = [
    ...chains.map((c) => ({ kind: 'chain' as const, id: c.id, title: chainTitle(c), score: c.risk.score })),
    ...unchained.map((id) => byId.get(id)!).filter((f) => f.severity !== 'info').map((f) => ({ kind: 'finding' as const, id: f.id, title: `${f.ruleName}${f.host ? ` on ${f.host}` : ''}`, score: findingScore(f) })),
  ].sort((a, b) => b.score - a.score)
  const ruleEvents = comp.rules.map((r) => ({ ruleId: r.def.id, eventIds: [...r.eventIds].sort((x, y) => x - y) }))
  return { summary, findings, engine: stats, ruleLoad: report, chains, unchained, risk: scoreOverall(items), topThreats: items.slice(0, 5), ruleEvents, scoreByFinding: Object.fromEntries(findings.map((f) => [f.id, findingScore(f)])) }
}
