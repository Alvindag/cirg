import defaultPack from '../../rules/default-pack.json'
import { ingest, type IngestOptions } from './ingest'
import { compilePacks, loadPack } from './rules/load'
import { RuleEngine } from './rules/engine'
import type { EngineStats, Finding, RulePack } from './rules/types'
import type { IngestSummary } from './types'

export interface PackInput { name: string; text: string; format: 'json' | 'yaml' }
export interface RuleLoadReport { packs: { id: string; name: string; version: string; rules: number }[]; errors: string[]; warnings: string[] }
export interface AnalysisResult { summary: IngestSummary; findings: Finding[]; engine: EngineStats; ruleLoad: RuleLoadReport }

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
  const engine = new RuleEngine(comp.rules, {}, comp.deferred.map((d) => d.id))
  const summary = await ingest(file, opts, (e) => engine.process(e))
  if (!summary) return null
  const { findings, stats } = engine.finalize()
  return { summary, findings, engine: stats, ruleLoad: report }
}
