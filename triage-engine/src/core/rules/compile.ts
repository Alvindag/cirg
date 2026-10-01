import type { CanonicalEvent } from '../types'
import type { CompiledRule, CompiledSequence, Condition, Op, Predicate, RuleDef } from './types'

/** Canonical fields a rule may reference (anything else is a load-time error, catching typos). */
export const FIELD_NAMES = [
  'eventId', 'ts', 'channel', 'computer', 'subjectUserSid', 'subjectUserName', 'subjectDomainName', 'subjectLogonId',
  'targetUserSid', 'targetUserName', 'targetDomainName', 'targetLogonId', 'memberSid', 'logonType', 'processId', 'newProcessId',
  'newProcessName', 'parentProcessName', 'commandLine', 'ipAddress', 'ipPort', 'workstationName', 'status',
  'subStatus', 'authenticationPackage', 'serviceName',
] as const
const FIELDS = new Set<string>(FIELD_NAMES)

const REGEX_MAX_LEN = 500
const REGEX_INPUT_CAP = 4096 // bound the work any single regex can do on attacker-controlled text
const NESTED_QUANT = /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)\s*(?:[+*]|\{\d+,\d*\})/ // (a+)+, (a*)*, (a+){2,}

export class RuleCompileError extends Error {}

export function parseDuration(s: string): number {
  const m = /^(\d+)(s|m|h|d)$/.exec(s)
  if (!m) throw new RuleCompileError(`bad duration "${s}"`)
  return Number(m[1]) * { s: 1e3, m: 6e4, h: 36e5, d: 864e5 }[m[2] as 's' | 'm' | 'h' | 'd']
}

export function assertField(f: string, where: string) {
  if (!FIELDS.has(f)) throw new RuleCompileError(`${where}: unknown field "${f}" (valid: ${FIELD_NAMES.join(', ')})`)
}

export const getField = (e: CanonicalEvent, f: string): string | number | undefined =>
  (e as unknown as Record<string, string | number | undefined>)[f]

const norm = (v: unknown, ci: boolean) => (ci ? String(v).toLowerCase() : String(v))

function ipv4ToInt(s: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s)
  if (!m) return null
  const o = m.slice(1).map(Number)
  if (o.some((x) => x > 255)) return null
  return ((o[0]! << 24) | (o[1]! << 16) | (o[2]! << 8) | o[3]!) >>> 0
}
function parseCidr(c: string): [number, number] {
  const m = /^([\d.]+)\/(\d{1,2})$/.exec(c)
  const ip = m ? ipv4ToInt(m[1]!) : null
  const bits = m ? Number(m[2]) : -1
  if (ip === null || bits < 0 || bits > 32) throw new RuleCompileError(`bad CIDR "${c}" (IPv4 only)`)
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return [(ip & mask) >>> 0, mask]
}

export function compileRegex(src: string, ci: boolean, where: string): RegExp {
  if (src.length > REGEX_MAX_LEN) throw new RuleCompileError(`${where}: regex longer than ${REGEX_MAX_LEN} chars`)
  let flags = ci ? 'i' : ''
  if (src.startsWith('(?i)')) { src = src.slice(4); flags = 'i' } // inline flag convenience
  if (NESTED_QUANT.test(src)) throw new RuleCompileError(`${where}: regex has nested quantifiers (ReDoS risk): ${src}`)
  try { return new RegExp(src, flags) } catch (e) { throw new RuleCompileError(`${where}: invalid regex: ${(e as Error).message}`) }
}

export function compileCondition(c: Condition, lists: Record<string, string[]>, where: string): Predicate {
  if ('all' in c) { const ps = c.all.map((x, i) => compileCondition(x, lists, `${where}.all[${i}]`)); return (e) => ps.every((p) => p(e)) }
  if ('any' in c) { const ps = c.any.map((x, i) => compileCondition(x, lists, `${where}.any[${i}]`)); return (e) => ps.some((p) => p(e)) }
  if ('not' in c) { const p = compileCondition(c.not, lists, `${where}.not`); return (e) => !p(e) }

  const { field, op } = c
  const ci = c.caseInsensitive !== false
  assertField(field, where)
  const val = c.value
  const need = (cond: boolean, msg: string) => { if (!cond) throw new RuleCompileError(`${where}: ${msg}`) }
  const resolveList = (): unknown[] => {
    if (typeof val === 'string' && val.startsWith('$lists.')) {
      const l = lists[val.slice(7)]
      need(!!l, `unknown list "${val}"`)
      return l!
    }
    need(Array.isArray(val), `op "${op}" needs an array or $lists.<name>`)
    return val as unknown[]
  }
  const get = (e: CanonicalEvent) => getField(e, field)

  switch (op as Op) {
    case 'exists': { const want = val !== false; return (e) => (get(e) !== undefined) === want }
    case 'eq': { need(val !== undefined, 'eq needs value'); const t = norm(val, ci); return (e) => { const v = get(e); return v !== undefined && norm(v, ci) === t } }
    case 'neq': { need(val !== undefined, 'neq needs value'); const t = norm(val, ci); return (e) => { const v = get(e); return v === undefined || norm(v, ci) !== t } }
    case 'in': case 'notIn': {
      const set = new Set(resolveList().map((x) => norm(x, ci)))
      const neg = op === 'notIn'
      return (e) => { const v = get(e); return neg ? v === undefined || !set.has(norm(v, ci)) : v !== undefined && set.has(norm(v, ci)) }
    }
    case 'contains': case 'startsWith': case 'endsWith': {
      need(typeof val === 'string' && val.length > 0, `${op} needs a non-empty string`)
      const t = norm(val, ci)
      const fn = op === 'contains' ? (s: string) => s.includes(t) : op === 'startsWith' ? (s: string) => s.startsWith(t) : (s: string) => s.endsWith(t)
      return (e) => { const v = get(e); return v !== undefined && fn(norm(v, ci)) }
    }
    case 'regex': {
      need(typeof val === 'string', 'regex needs a string')
      const re = compileRegex(val as string, ci, where)
      return (e) => { const v = get(e); return v !== undefined && re.test(String(v).slice(0, REGEX_INPUT_CAP)) }
    }
    case 'gt': case 'gte': case 'lt': case 'lte': {
      need(typeof val === 'number', `${op} needs a number`)
      const n = val as number
      const cmp = { gt: (x: number) => x > n, gte: (x: number) => x >= n, lt: (x: number) => x < n, lte: (x: number) => x <= n }[op as 'gt' | 'gte' | 'lt' | 'lte']
      return (e) => { const v = get(e); return typeof v === 'number' && cmp(v) }
    }
    case 'cidr': {
      const nets = (Array.isArray(val) ? val : [val]).map((x) => { need(typeof x === 'string', 'cidr needs string(s)'); return parseCidr(x as string) })
      return (e) => {
        const v = get(e)
        const ip = typeof v === 'string' ? ipv4ToInt(v) : null
        return ip !== null && nets.some(([net, mask]) => ((ip & mask) >>> 0) === net)
      }
    }
    default: throw new RuleCompileError(`${where}: unknown op "${String(op)}"`)
  }
}

const SHELLS_WITH_PLACEHOLDERS = /\{\{\s*([A-Za-z]+)\s*\}\}/g

/** Static checks on response command templates (they are displayed, never executed, but must still be safe to paste). */
export function lintAction(a: { shell?: string; command?: string }, where: string) {
  if (!a.command) return
  for (const m of a.command.matchAll(SHELLS_WITH_PLACEHOLDERS)) {
    assertField(m[1]!, `${where} placeholder`)
    if (a.shell === 'powershell') {
      const i = m.index!
      if (a.command[i - 1] !== "'" || a.command[i + m[0].length] !== "'")
        throw new RuleCompileError(`${where}: PowerShell placeholder {{${m[1]}}} must be wrapped in single quotes`)
    }
  }
}

export function compileRule(def: RuleDef, packId: string, lists: Record<string, string[]>): CompiledRule {
  const where = `rule ${def.id}`
  for (const a of def.attack) if (!/^TA\d{4}$/.test(a.tactic)) throw new RuleCompileError(`${where}: bad tactic`)
  for (const a of [...(def.response?.investigate ?? []), ...(def.response?.remediate ?? [])]) lintAction(a, `${where} response`)
  const suppressPs = (def.suppress ?? []).map((c, i) => compileCondition(c, lists, `${where}.suppress[${i}]`))
  const suppress: Predicate | null = suppressPs.length ? (e) => suppressPs.some((p) => p(e)) : null
  const w = def.when as { eventIds?: number[]; condition?: Condition; groupBy?: string[]; count?: number; distinct?: string; window?: string }
  if (def.kind === 'sequence') return compileSequence(def, packId, lists, suppress)
  if (!w.eventIds?.length) throw new RuleCompileError(`${where}: when.eventIds required`)
  const cond = w.condition ? compileCondition(w.condition, lists, `${where}.when.condition`) : () => true
  const base: CompiledRule = { def, packId, eventIds: new Set(w.eventIds), predicate: cond, suppress }
  if (def.kind === 'threshold') {
    for (const f of w.groupBy ?? []) assertField(f, `${where}.groupBy`)
    if (w.distinct) assertField(w.distinct, `${where}.distinct`)
    base.threshold = { groupBy: w.groupBy!, count: w.count!, distinct: w.distinct, windowMs: parseDuration(w.window!) }
  }
  return base
}

interface SeqWhen {
  within: string; ordered?: boolean
  correlateOn: { name: string; scope?: 'host' | 'global'; bind: Record<string, string> }[]
  steps: { id: string; eventIds: number[]; condition?: Condition; optional?: boolean; negate?: boolean; min?: number }[]
}

function compileSequence(def: RuleDef, packId: string, lists: Record<string, string[]>, suppress: Predicate | null): CompiledRule {
  const where = `rule ${def.id}`
  const w = def.when as unknown as SeqWhen
  const ids = new Set<string>()
  const steps = w.steps.map((st, i) => {
    if (ids.has(st.id)) throw new RuleCompileError(`${where}: duplicate step id "${st.id}"`)
    ids.add(st.id)
    if (st.negate && st.optional) throw new RuleCompileError(`${where}: step "${st.id}" cannot be both negate and optional`)
    if (st.negate && st.min && st.min > 1) throw new RuleCompileError(`${where}: negate step "${st.id}" cannot set min`)
    return {
      id: st.id, eventIds: new Set(st.eventIds), optional: !!st.optional, negate: !!st.negate, min: st.min ?? 1,
      predicate: st.condition ? compileCondition(st.condition, lists, `${where}.steps[${i}].condition`) : () => true,
    }
  })
  if (!steps.some((s) => !s.optional && !s.negate)) throw new RuleCompileError(`${where}: needs at least one required step`)
  if (steps[0]!.optional || steps[0]!.negate) throw new RuleCompileError(`${where}: the first step must be required (it anchors the sequence)`)
  const keys = w.correlateOn.map((k, i) => {
    const bind = new Map<string, string>()
    for (const [stepId, field] of Object.entries(k.bind)) {
      if (!ids.has(stepId)) throw new RuleCompileError(`${where}: correlateOn[${i}] binds unknown step "${stepId}"`)
      assertField(field, `${where}.correlateOn[${i}]`)
      bind.set(stepId, field)
    }
    return { name: k.name, scope: k.scope ?? 'host', bind }
  })
  for (const s of steps) {
    if (!keys[0]!.bind.has(s.id)) throw new RuleCompileError(`${where}: step "${s.id}" is not bound in the primary correlation key "${keys[0]!.name}" (every step must bind the first correlateOn entry)`)
  }
  const sequence: CompiledSequence = { steps, withinMs: parseDuration(w.within), ordered: w.ordered !== false, keys }
  const eventIds = new Set<number>()
  for (const s of steps) for (const id of s.eventIds) eventIds.add(id)
  return { def, packId, eventIds, predicate: () => true, suppress, sequence }
}
