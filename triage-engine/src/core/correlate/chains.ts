import type { CanonicalEvent } from '../types'
import { SEVERITY_RANK, type Finding } from '../rules/types'
import { scoreChain, type RiskScore } from './risk'

export interface AttackChain {
  id: string
  findingIds: string[]
  hosts: string[]
  accounts: string[]
  ips: string[]
  firstTs: number
  lastTs: number
  stages: { tactic: string; tacticName?: string }[]
  /** Why these findings were linked (shared session, host, account, IP, process). */
  links: string[]
  narrative: { ts: number; findingId: string; text: string }[]
  risk: RiskScore
}

export interface ChainOptions {
  hostGapMs: number
  identityGapMs: number
  processGapMs: number
}
export const DEFAULT_CHAIN_OPTIONS: ChainOptions = { hostGapMs: 60 * 60_000, identityGapMs: 2 * 60 * 60_000, processGapMs: 60 * 60_000 }

const IGNORE_ACCOUNTS = new Set(['system', 'local service', 'network service', 'anonymous logon', 'dwm-1', 'dwm-2', 'umfd-0', 'umfd-1', 'window manager', 'font driver host'])
const IGNORE_SIDS = /^(S-1-0-0|S-1-5-18|S-1-5-19|S-1-5-20|S-1-5-7|S-1-5-(80|90|96)-.*)$/i
const IGNORE_LOGON_IDS = new Set(['0x0', '0x3e7', '0x3e4', '0x3e5'])
const IGNORE_IPS = new Set(['127.0.0.1', '::1', '0.0.0.0', '::', ''])

type KeyKind = 'session' | 'host' | 'account' | 'sid' | 'ip' | 'process'
interface Key { kind: KeyKind; id: string; label: string }

const acct = (n?: string): string | undefined => {
  if (!n) return undefined
  const v = n.toLowerCase()
  return v.endsWith('$') || IGNORE_ACCOUNTS.has(v) ? undefined : v
}

function eventKeys(e: CanonicalEvent, out: Map<string, Key>) {
  const put = (kind: KeyKind, id: string, label: string) => { const k = `${kind}:${id}`; if (!out.has(k)) out.set(k, { kind, id: k, label }) }
  const host = e.computer?.toLowerCase()
  if (host) put('host', host, `host ${e.computer}`)
  for (const n of [e.targetUserName, e.subjectUserName]) { const a = acct(n); if (a) put('account', a, `account ${n}`) }
  for (const s of [e.targetUserSid, e.subjectUserSid, e.memberSid]) if (s && !IGNORE_SIDS.test(s)) put('sid', s.toLowerCase(), `SID ${s}`)
  if (e.ipAddress && !IGNORE_IPS.has(e.ipAddress)) put('ip', e.ipAddress, `IP ${e.ipAddress}`)
  for (const l of [e.subjectLogonId, e.targetLogonId]) if (l && !IGNORE_LOGON_IDS.has(l) && host) put('session', `${host}|${l}`, `logon session ${l} on ${e.computer}`)
  if (host) for (const p of [e.newProcessId, e.processId]) if (p && p > 4) put('process', `${host}|${p}`, `process ${p} on ${e.computer}`)
}

function findingKeys(f: Finding): Key[] {
  const m = new Map<string, Key>()
  const evs = f.steps ? f.steps.flatMap((s) => s.events) : f.evidence
  for (const e of evs) eventKeys(e, m)
  if (f.host) { const k = `host:${f.host.toLowerCase()}`; if (!m.has(k)) m.set(k, { kind: 'host', id: k, label: `host ${f.host}` }) }
  for (const [field, v] of Object.entries(f.group ?? {})) {
    if (field === 'ipAddress' && !IGNORE_IPS.has(v)) m.set(`ip:${v}`, { kind: 'ip', id: `ip:${v}`, label: `IP ${v}` })
    if (/UserName$/.test(field) && acct(v)) m.set(`account:${v.toLowerCase()}`, { kind: 'account', id: `account:${v.toLowerCase()}`, label: `account ${v}` })
  }
  return [...m.values()]
}

class DSU {
  parent: number[]
  constructor(n: number) { this.parent = Array.from({ length: n }, (_, i) => i) }
  find(x: number): number { while (this.parent[x] !== x) { this.parent[x] = this.parent[this.parent[x]!]!; x = this.parent[x]! } return x }
  union(a: number, b: number) { a = this.find(a); b = this.find(b); if (a !== b) this.parent[Math.max(a, b)] = Math.min(a, b) }
}

const isStrong = (f: Finding) => f.kind === 'sequence' || SEVERITY_RANK[f.severity] >= SEVERITY_RANK.medium

/**
 * Group findings into attack chains.
 * Findings are linked when they share an entity (logon session, host, account/SID, source IP, process id) and are close in time
 * (sessions link at any distance). Only medium+ findings and sequence matches can link two findings together; low/info findings
 * can join an existing chain but never bridge two, so noisy context rules cannot glue unrelated activity together.
 * A chain needs 2+ medium-or-higher findings or a correlated sequence match.
 */
export function buildChains(findings: Finding[], opts: Partial<ChainOptions> = {}): { chains: AttackChain[]; unchained: string[] } {
  const o = { ...DEFAULT_CHAIN_OPTIONS, ...opts }
  const gapFor = (k: KeyKind) => (k === 'session' ? Infinity : k === 'host' ? o.hostGapMs : k === 'process' ? o.processGapMs : o.identityGapMs)
  const keys = findings.map(findingKeys)
  const dsu = new DSU(findings.length)
  const reasons = new Map<number, Set<string>>() // by finding index of the link target; merged at the end via root

  // Per entity key: sweep strong findings by start time, merging those whose intervals are within the allowed gap.
  const byKey = new Map<string, { kind: KeyKind; label: string; idx: number[] }>()
  findings.forEach((f, i) => {
    if (!isStrong(f)) return
    for (const k of keys[i]!) { const e = byKey.get(k.id); if (e) e.idx.push(i); else byKey.set(k.id, { kind: k.kind, label: k.label, idx: [i] }) }
  })
  const clusters = new Map<string, { root: number; max: number; min: number }[]>()
  for (const [id, { kind, label, idx }] of byKey) {
    if (idx.length < 2) { clusters.set(id, idx.map((i) => ({ root: i, min: findings[i]!.firstTs, max: findings[i]!.lastTs }))); continue }
    const gap = gapFor(kind)
    idx.sort((a, b) => findings[a]!.firstTs - findings[b]!.firstTs)
    const list: { root: number; max: number; min: number }[] = []
    let cur: { root: number; max: number; min: number } | null = null
    for (const i of idx) {
      const f = findings[i]!
      if (cur && f.firstTs - cur.max <= gap) {
        dsu.union(cur.root, i)
        const r = reasons.get(i) ?? new Set<string>(); r.add(label); reasons.set(i, r)
        cur.max = Math.max(cur.max, f.lastTs)
      } else { cur = { root: i, min: f.firstTs, max: f.lastTs }; list.push(cur) }
    }
    clusters.set(id, list)
  }

  // Attach weak findings to the chain they overlap most (they never merge chains).
  const member = new Map<number, number>() // finding index -> root
  findings.forEach((f, i) => {
    if (isStrong(f)) { member.set(i, dsu.find(i)); return }
    const votes = new Map<number, number>()
    for (const k of keys[i]!) {
      const gap = gapFor(k.kind)
      for (const c of clusters.get(k.id) ?? []) {
        if (f.firstTs - c.max <= gap && c.min - f.lastTs <= gap) { const r = dsu.find(c.root); votes.set(r, (votes.get(r) ?? 0) + 1) }
      }
    }
    let best = -1, bv = 0
    for (const [r, v] of votes) if (v > bv) { best = r; bv = v }
    if (best >= 0) member.set(i, best)
  })

  const comps = new Map<number, number[]>()
  for (const [i, r] of member) { const l = comps.get(r); if (l) l.push(i); else comps.set(r, [i]) }

  const chains: AttackChain[] = []
  const chained = new Set<string>()
  for (const idxs of comps.values()) {
    const fs = idxs.map((i) => findings[i]!).sort((a, b) => a.firstTs - b.firstTs)
    // A chain needs real corroboration: a correlated sequence match, or 2+ medium-or-higher findings.
    // (Low/info findings may decorate a chain but can never create one: a single finding plus context noise is not a chain.)
    if (!fs.some((f) => f.kind === 'sequence') && fs.filter(isStrong).length < 2) continue
    const hosts = new Set<string>(), accounts = new Set<string>(), ips = new Set<string>()
    for (const i of idxs) for (const k of keys[i]!) {
      if (k.kind === 'host') hosts.add(k.label.slice(5))
      else if (k.kind === 'account') accounts.add(k.label.slice(8))
      else if (k.kind === 'ip') ips.add(k.label.slice(3))
    }
    const links = new Set<string>()
    for (const i of idxs) for (const l of reasons.get(i) ?? []) links.add(l)
    const seenT = new Set<string>()
    const stages: AttackChain['stages'] = []
    for (const f of fs) for (const a of f.attack) if (!seenT.has(a.tactic)) { seenT.add(a.tactic); stages.push({ tactic: a.tactic, tacticName: a.tacticName }) }
    const narrative = fs.map((f) => ({
      ts: f.firstTs, findingId: f.id,
      text: `${f.host ? `[${f.host}] ` : ''}${f.attack[0]?.tacticName ?? f.attack[0]?.tactic ?? ''}: ${f.ruleName}` +
        (f.kind === 'sequence' && f.steps ? ` (${f.steps.map((s) => s.id).join(' → ')})` : ` (${f.count.toLocaleString()} event${f.count === 1 ? '' : 's'})`),
    }))
    fs.forEach((f) => chained.add(f.id))
    chains.push({
      id: '', findingIds: fs.map((f) => f.id), hosts: [...hosts].sort(), accounts: [...accounts].sort(), ips: [...ips].sort(),
      firstTs: fs[0]!.firstTs, lastTs: Math.max(...fs.map((f) => f.lastTs)), stages, links: [...links].slice(0, 8), narrative,
      risk: scoreChain(fs, hosts.size),
    })
  }
  chains.sort((a, b) => b.risk.score - a.risk.score || a.firstTs - b.firstTs)
  chains.forEach((c, i) => { c.id = `CHAIN-${i + 1}` })
  return { chains, unchained: findings.filter((f) => !chained.has(f.id)).map((f) => f.id) }
}

export const chainTitle = (c: AttackChain) =>
  `${c.stages.map((s) => s.tacticName ?? s.tactic).slice(0, 4).join(' → ')}${c.stages.length > 4 ? ' …' : ''} on ${c.hosts.slice(0, 3).join(', ') || 'unknown host'}${c.hosts.length > 3 ? ` +${c.hosts.length - 3}` : ''}`
