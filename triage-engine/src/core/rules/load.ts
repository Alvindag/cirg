import YAML from 'yaml'
import validatePack from '../../generated/validateRules'
import { TACTICS, TECHNIQUES } from '../attack'
import { CONTROLS, FRAMEWORKS, parseControl } from '../audit/controls'
import { compileRule } from './compile'
import type { CompiledRule, RulePack } from './types'

export const MAX_RULE_FILE_BYTES = 2_000_000

export interface LoadResult { pack?: RulePack; errors: string[]; warnings: string[] }

/** Parse (JSON or YAML) and validate a rule pack. Untrusted input: size-capped, safe YAML schema, alias bomb limit. */
export function loadPack(text: string, format: 'json' | 'yaml', label = 'pack'): LoadResult {
  const errors: string[] = []
  const warnings: string[] = []
  if (text.length > MAX_RULE_FILE_BYTES) return { errors: [`${label}: file larger than ${MAX_RULE_FILE_BYTES} bytes`], warnings }
  let data: unknown
  try {
    data = format === 'yaml' ? YAML.parse(text, { schema: 'core', maxAliasCount: 20, version: '1.2' }) : JSON.parse(text)
    data = JSON.parse(JSON.stringify(data)) // normalize to plain JSON (drops anything non-JSON, safe own-key __proto__)
  } catch (e) {
    return { errors: [`${label}: cannot parse ${format}: ${(e as Error).message}`], warnings }
  }

  if (!validatePack(data)) {
    const seen = new Set<string>()
    for (const er of validatePack.errors ?? []) {
      if (er.keyword === 'oneOf' || er.keyword === 'if') continue // noise; the branch errors are more useful
      const msg = `${label}: ${er.instancePath || '/'} ${er.message ?? er.keyword}`
      if (!seen.has(msg) && seen.size < 8) { seen.add(msg); errors.push(msg) }
    }
    if (!errors.length) errors.push(`${label}: does not match the rule pack schema`)
    return { errors, warnings }
  }
  const pack = data as RulePack

  // Semantic checks the JSON schema cannot express.
  const ids = new Set<string>()
  for (const r of pack.rules) {
    if (ids.has(r.id)) errors.push(`${label}: duplicate rule id ${r.id}`)
    ids.add(r.id)
    const w = r.when as Record<string, unknown>
    const shape = 'steps' in w ? 'sequence' : 'groupBy' in w ? 'threshold' : 'match'
    if (shape !== r.kind) errors.push(`${label}: rule ${r.id} has kind "${r.kind}" but its "when" block is a ${shape} spec`)
    for (const c of r.controls ?? []) {
      if (!(parseControl(c).framework in FRAMEWORKS)) errors.push(`${label}: rule ${r.id} references unknown framework in control "${c}" (known: ${Object.keys(FRAMEWORKS).join(', ')})`)
      else if (!(c in CONTROLS)) warnings.push(`${label}: rule ${r.id} control ${c} is not in the bundled catalog (its title will be omitted)`)
    }
    for (const a of r.attack) {
      if (!(a.tactic in TACTICS)) errors.push(`${label}: rule ${r.id} references unknown ATT&CK tactic ${a.tactic}`)
      if (!(a.technique in TECHNIQUES)) warnings.push(`${label}: rule ${r.id} technique ${a.technique} is not in the bundled ATT&CK subset (name will be omitted)`)
    }
  }
  if (errors.length) return { errors, warnings }
  return { pack, errors, warnings }
}

export interface CompileResult {
  rules: CompiledRule[]
  errors: string[]
  warnings: string[]
}

/** Compile packs in order; a later pack's rule with the same id overrides the earlier one. A bad rule never kills the pack. */
export function compilePacks(packs: RulePack[]): CompileResult {
  const byId = new Map<string, CompiledRule>()
  const errors: string[] = []
  const warnings: string[] = []
  for (const p of packs) {
    const lists: Record<string, string[]> = Object.create(null)
    for (const [k, v] of Object.entries(p.assets ?? {})) lists[k] = v
    for (const r of p.rules) {
      if (r.enabled === false) continue
      if (byId.has(r.id)) warnings.push(`rule ${r.id} from "${p.pack.id}" overrides an earlier definition`)
      try { byId.set(r.id, compileRule(r, p.pack.id, lists)) }
      catch (e) { byId.delete(r.id); errors.push(`${p.pack.id}: ${(e as Error).message}`) }
    }
  }
  return { rules: [...byId.values()], errors, warnings }
}
