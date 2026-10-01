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
export interface Coverage {
  /** Enabled rules that cannot have fired because none of their Event IDs appear in the data. */
  rulesWithoutData: { ruleId: string; ruleName: string; eventIds: number[] }[]
  notes: string[]
}
export interface TopThreat { kind: 'chain' | 'finding'; id: string; title: string; score: number }
export interface AnalysisResult {
  summary: IngestSummary; findings: Finding[]; engine: EngineStats; ruleLoad: RuleLoadReport
  chains: AttackChain[]
  /** Finding ids not part of any chain. */
  unchained: string[]
  risk: RiskScore
  topThreats: TopThreat[]
  coverage: Coverage
  /** Per-finding score (severity x confidence), for the report. */
  scoreByFinding: Record<string, number>
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
  engine.destroy() // release retained events/timestamps now; findings hold their own (capped) evidence
  const { chains, unchained } = buildChains(findings)
  const byId = new Map(findings.map((f) => [f.id, f]))
  const items: TopThreat[] = [
    ...chains.map((c) => ({ kind: 'chain' as const, id: c.id, title: chainTitle(c), score: c.risk.score })),
    ...unchained.map((id) => byId.get(id)!).filter((f) => f.severity !== 'info').map((f) => ({ kind: 'finding' as const, id: f.id, title: `${f.ruleName}${f.host ? ` on ${f.host}` : ''}`, score: findingScore(f) })),
  ].sort((a, b) => b.score - a.score)
  const coverage = computeCoverage(comp.rules, summary)
  return { summary, findings, engine: stats, ruleLoad: report, chains, unchained, risk: scoreOverall(items), topThreats: items.slice(0, 5), coverage, scoreByFinding: Object.fromEntries(findings.map((f) => [f.id, findingScore(f)])) }
}

/** What the data could not tell us: rules with no matching Event IDs, and audit-configuration gaps visible in the data. */
export function computeCoverage(rules: { def: { id: string; name: string }; eventIds: Set<number> }[], summary: IngestSummary): Coverage {
  const present = new Set(Object.keys(summary.byEventId).map(Number))
  const rulesWithoutData = rules
    .filter((r) => ![...r.eventIds].some((id) => present.has(id)))
    .map((r) => ({ ruleId: r.def.id, ruleName: r.def.name, eventIds: [...r.eventIds].sort((a, b) => a - b) }))
  const notes: string[] = []
  if (summary.parsedEvents === 0) notes.push('No events were parsed from this file, so no detections could run.')
  if (summary.proc4688 === 0 && summary.parsedEvents > 0) notes.push('No process-creation events (4688) were present: process, PowerShell, credential-dumping, LOLBin and ransomware-precursor rules had no data. Enable "Audit Process Creation" if this is unexpected.')
  else if (summary.proc4688 > 0 && summary.proc4688WithCmd === 0) notes.push('Process-creation events (4688) were present but none carried a command line: command-line detections could not run. Enable "Include command line in process creation events" via Group Policy.')
  else if (summary.proc4688 > 0 && summary.proc4688WithCmd / summary.proc4688 < 0.5) notes.push(`Only ${Math.round((100 * summary.proc4688WithCmd) / summary.proc4688)}% of process-creation events carried a command line: command-line detections have partial coverage.`)
  if (summary.parsedEvents > 0 && !present.has(4624) && !present.has(4625)) notes.push('No logon events (4624/4625) were present: authentication rules had no data.')
  if (summary.rejected > 0) notes.push(`${summary.rejected.toLocaleString()} of ${summary.totalRecords.toLocaleString()} records could not be parsed (${Object.entries(summary.rejectReasons).map(([k, v]) => `${k}: ${v}`).join('; ')}).`)
  return { rulesWithoutData, notes }
}
