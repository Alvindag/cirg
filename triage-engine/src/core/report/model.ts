import pkg from '../../../package.json'
import { ATTACK_VERSION } from '../attack'
import type { AnalysisResult } from '../analysis'
import { chainTitle } from '../correlate/chains'
import { SEVERITY_RANK, type Action, type Finding, type Severity } from '../rules/types'
import { renderAction } from '../rules/render'
import type { CanonicalEvent } from '../types'
import { Pseudonymizer } from './redact'

export const REPORT_SCHEMA_VERSION = '1.0'
const iso = (t: number | null) => (t === null ? null : new Date(t).toISOString())
const MAX_EVIDENCE = 25

export interface ReportOptions { redact: boolean; generatedAt: Date; sourceName: string }

export interface ReportEvent { time: string; eventId: number; computer?: string; fields: Record<string, string | number> }
export interface ReportCommand { title: string; shell?: string; risk?: 'read-only' | 'disruptive'; command?: string; unfilled: string[] }
export interface ReportFinding {
  id: string; ruleId: string; ruleName: string; kind: 'match' | 'threshold' | 'sequence'; severity: Severity; confidence: number; score: number
  attack: { tactic: string; tacticName?: string; technique: string; techniqueName?: string }[]
  count: number; firstSeen: string; lastSeen: string; host?: string; group?: Record<string, string>; distinctCount?: number
  chainId?: string
  entities: { accounts: [string, number][]; hosts: [string, number][]; ips: [string, number][] }
  evidence: ReportEvent[]; evidenceShown: number; evidenceTruncated: boolean
  steps?: { id: string; events: ReportEvent[] }[]
  suppressedEvents: number
  context: { summary?: string; maliciousIndicators: string[]; legitimateExplanations: string[]; references: string[] }
  nextSteps: { investigate: ReportCommand[]; remediate: ReportCommand[] }
}
export interface ReportChain {
  id: string; title: string; risk: { score: number; label: string; components: { label: string; points: number }[] }
  firstSeen: string; lastSeen: string; hosts: string[]; accounts: string[]; ips: string[]
  stages: { tactic: string; tacticName?: string }[]; linkedBecause: string[]
  narrative: { time: string; findingId: string; text: string }[]; findingIds: string[]
}
export interface Report {
  schema: 'windows-security-triage-report'
  schemaVersion: typeof REPORT_SCHEMA_VERSION
  generatedAt: string
  tool: { name: string; version: string }
  redaction: { applied: boolean; note: string }
  source: { fileName: string; format: string; sizeBytes: number; records: number; parsedEvents: number; rejectedRecords: number; firstEvent: string | null; lastEvent: string | null; hostCount: number }
  executiveSummary: {
    risk: { score: number; label: string; components: { label: string; points: number }[] }
    headline: string
    counts: { chains: number; findings: number; bySeverity: Record<Severity, number> }
    topThreats: { kind: 'chain' | 'finding'; id: string; title: string; score: number }[]
    recommendedActions: string[]
  }
  chains: ReportChain[]
  findings: ReportFinding[]
  attackCoverage: { tactic: string; tacticName?: string; techniques: { technique: string; techniqueName?: string; ruleIds: string[]; findingIds: string[] }[] }[]
  methodology: { rulePacks: { id: string; name: string; version: string; rules: number }[]; attackVersion: string; ruleLoadErrors: string[]; ruleLoadWarnings: string[] }
  limitations: string[]
}

const SENSITIVE_NOTE = 'This report contains account names, hostnames, IP addresses and command lines from the analysed logs. Handle it according to your data-classification policy.'
const REDACTED_NOTE = 'Account names, hostnames, domains, SIDs and IP addresses were replaced with stable pseudonyms (USER-1, HOST-2 ...) and command lines were removed. This is pseudonymization, not anonymization: review before sharing outside your organisation.'

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/
/** Classify by content first (sequence keys like `source` hold IPs), then by key name; anything else goes through text replacement. */
function redactGroupValue(ps: Pseudonymizer, key: string, v: string): string {
  if (IPV4.test(v) || /^[0-9a-f:]+:[0-9a-f:]*$/i.test(v)) return ps.ip(v) ?? v
  if (/^S-1-/i.test(v)) return ps.sid(v) ?? v
  if (/user|account/i.test(key)) return ps.user(v) ?? v
  if (/computer|host|workstation/i.test(key)) return ps.host(v) ?? v
  return ps.text(v)
}

function toReportEvent(e: CanonicalEvent): ReportEvent {
  const fields: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(e)) if (k !== 'eventId' && k !== 'ts' && k !== 'src' && k !== 'computer' && v !== undefined) fields[k] = v as string | number
  return { time: new Date(e.ts).toISOString(), eventId: e.eventId, computer: e.computer, fields }
}

const cmd = (a: Action, ev: CanonicalEvent | undefined): ReportCommand => {
  const r = renderAction(a, ev)
  return { title: r.title, shell: r.shell, risk: r.risk, command: r.command, unfilled: r.missing }
}

export function buildReport(r: AnalysisResult, opts: ReportOptions): Report {
  const ps = opts.redact ? new Pseudonymizer() : null
  const T = (s: string) => (ps ? ps.text(s) : s)
  const chainOf = new Map<string, string>()
  r.chains.forEach((c) => c.findingIds.forEach((id) => chainOf.set(id, c.id)))

  // Pseudonymize in a stable order (findings, then chains) BEFORE rendering derived text, so every value is registered.
  const redactEv = (e: CanonicalEvent) => (ps ? ps.event(e) : e)
  const ent = (l: [string, number][], f: (v?: string) => string | undefined): [string, number][] => l.map(([k, n]) => [f(k) ?? k, n])

  const findings: ReportFinding[] = r.findings.map((f: Finding) => {
    const evs = f.evidence.map(redactEv)
    const steps = f.steps?.map((s) => ({ id: s.id, events: s.events.map(redactEv).map(toReportEvent) }))
    const group = f.group && ps ? Object.fromEntries(Object.entries(f.group).map(([k, v]) => [k, redactGroupValue(ps, k, v)])) : f.group
    const first = evs[0]
    return {
      id: f.id, ruleId: f.ruleId, ruleName: f.ruleName, kind: f.kind, severity: f.severity, confidence: f.confidence,
      score: r.scoreByFinding[f.id] ?? 0, attack: f.attack,
      count: f.count, firstSeen: new Date(f.firstTs).toISOString(), lastSeen: new Date(f.lastTs).toISOString(),
      host: ps ? ps.host(f.host) : f.host, group, distinctCount: f.distinctCount, chainId: chainOf.get(f.id),
      entities: ps
        ? { accounts: ent(f.entities.users, (v) => ps.user(v)), hosts: ent(f.entities.hosts, (v) => ps.host(v)), ips: ent(f.entities.ips, (v) => ps.ip(v)) }
        : { accounts: f.entities.users, hosts: f.entities.hosts, ips: f.entities.ips },
      evidence: evs.slice(0, MAX_EVIDENCE).map(toReportEvent), evidenceShown: Math.min(evs.length, MAX_EVIDENCE),
      evidenceTruncated: f.evidenceTruncated || evs.length > MAX_EVIDENCE,
      steps, suppressedEvents: f.suppressed,
      context: {
        summary: f.context?.summary, maliciousIndicators: f.context?.maliciousIndicators ?? [],
        legitimateExplanations: f.context?.falsePositives ?? [], references: f.context?.references ?? [],
      },
      nextSteps: {
        investigate: (f.response?.investigate ?? []).map((a) => cmd(a, first)),
        remediate: (f.response?.remediate ?? []).map((a) => cmd(a, first)),
      },
    }
  })

  const chains: ReportChain[] = r.chains.map((c) => ({
    id: c.id, title: T(chainTitle(c)), risk: c.risk,
    firstSeen: new Date(c.firstTs).toISOString(), lastSeen: new Date(c.lastTs).toISOString(),
    hosts: ps ? c.hosts.map((h) => ps.host(h)!) : c.hosts, accounts: ps ? c.accounts.map((a) => ps.user(a)!) : c.accounts, ips: ps ? c.ips.map((i) => ps.ip(i)!) : c.ips,
    stages: c.stages, linkedBecause: c.links.map(T),
    narrative: c.narrative.map((n) => ({ time: new Date(n.ts).toISOString(), findingId: n.findingId, text: T(n.text) })), findingIds: c.findingIds,
  }))

  const bySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
  r.findings.forEach((f) => { bySeverity[f.severity]++ })
  const topThreats = r.topThreats.map((t) => ({ ...t, title: T(t.title) }))
  const worst = SEVERITY_RANK[(['critical', 'high', 'medium', 'low', 'info'] as Severity[]).find((s) => bySeverity[s]) ?? 'info']

  // Recommended actions: first disruptive remediation (containment) from the top chains/findings, plus the standing advice.
  const recommended: string[] = []
  const byId = new Map(findings.map((f) => [f.id, f]))
  for (const t of r.topThreats.slice(0, 3)) {
    const ids = t.kind === 'chain' ? (chains.find((c) => c.id === t.id)?.findingIds ?? []) : [t.id]
    const act = ids.map((id) => byId.get(id)).flatMap((f) => (f ? [...f.nextSteps.remediate] : [])).find((a) => a.risk === 'disruptive') ?? ids.map((id) => byId.get(id)).flatMap((f) => f?.nextSteps.remediate ?? [])[0]
    if (act) recommended.push(`${T(t.title)}: ${act.title}.`)
  }
  if (r.findings.length) recommended.push('Preserve the original log files and any volatile evidence before remediation, and record who ran which command.')
  if (r.coverage.notes.length) recommended.push('Close the logging gaps listed under Limitations so future analysis has full coverage.')

  const headline = r.findings.length === 0
    ? `No detection rules matched in ${r.summary.parsedEvents.toLocaleString()} events. This does not prove the absence of malicious activity: coverage is limited to the loaded rules and the event types present in the data.`
    : `Analysis of ${r.summary.parsedEvents.toLocaleString()} events from ${r.summary.computers.length}${r.summary.computersTruncated ? '+' : ''} host(s) produced ${r.findings.length} finding(s), grouped into ${r.chains.length} correlated attack chain(s). Overall risk is ${r.risk.label} (${r.risk.score}/100)${worst >= SEVERITY_RANK.high ? '; prompt investigation is recommended' : ''}.`

  // ATT&CK coverage table
  const mat = new Map<string, { tacticName?: string; techs: Map<string, { name?: string; rules: Set<string>; fids: Set<string> }> }>()
  for (const f of r.findings) for (const a of f.attack) {
    const t = mat.get(a.tactic) ?? { tacticName: a.tacticName, techs: new Map() }
    const tt = t.techs.get(a.technique) ?? { name: a.techniqueName, rules: new Set(), fids: new Set() }
    tt.rules.add(f.ruleId); tt.fids.add(f.id); t.techs.set(a.technique, tt); mat.set(a.tactic, t)
  }
  const attackCoverage = [...mat].sort((a, b) => a[0].localeCompare(b[0])).map(([tactic, t]) => ({
    tactic, tacticName: t.tacticName,
    techniques: [...t.techs].sort((a, b) => a[0].localeCompare(b[0])).map(([technique, x]) => ({ technique, techniqueName: x.name, ruleIds: [...x.rules].sort(), findingIds: [...x.fids] })),
  }))

  const limitations = [
    ...r.coverage.notes,
    ...(r.coverage.rulesWithoutData.length ? [`${r.coverage.rulesWithoutData.length} enabled rule(s) could not fire because their Event IDs are absent from the data (${r.coverage.rulesWithoutData.slice(0, 8).map((x) => x.ruleId).join(', ')}${r.coverage.rulesWithoutData.length > 8 ? ', …' : ''}).`] : []),
    ...(r.engine.capped.length ? [`In-memory limits were reached for ${r.engine.capped.join(', ')}: counts and correlations for these rules are lower bounds.`] : []),
    ...(r.engine.findingsTruncated.length ? [`Findings were capped for ${r.engine.findingsTruncated.join(', ')} (highest-count shown).`] : []),
    ...(r.engine.rulesDisabledForTime.length ? [`Rules disabled for exceeding the time budget: ${r.engine.rulesDisabledForTime.join(', ')}. Results are incomplete.`] : []),
    'Attack chains group findings by shared sessions, hosts, accounts, IPs and process IDs within a time window. They are investigative leads, not proof of a single actor.',
    'Confidence values are rule-author estimates, and risk scores use fixed weights. Neither is a statistical probability.',
    'Detections reflect only the log data supplied. Absence of a finding does not prove absence of activity.',
    ...(r.summary.format === 'evtx' ? ['EVTX files were parsed with a WASM build of the open-source `evtx` library; chunk checksums are not enforced.'] : []),
  ]

  return {
    schema: 'windows-security-triage-report', schemaVersion: REPORT_SCHEMA_VERSION, generatedAt: opts.generatedAt.toISOString(),
    tool: { name: pkg.name, version: pkg.version },
    redaction: { applied: opts.redact, note: opts.redact ? REDACTED_NOTE : SENSITIVE_NOTE },
    source: {
      fileName: opts.redact ? '[redacted]' : opts.sourceName, format: r.summary.format, sizeBytes: r.summary.bytes, records: r.summary.totalRecords,
      parsedEvents: r.summary.parsedEvents, rejectedRecords: r.summary.rejected, firstEvent: iso(r.summary.firstTs), lastEvent: iso(r.summary.lastTs),
      hostCount: r.summary.computers.length,
    },
    executiveSummary: { risk: r.risk, headline, counts: { chains: r.chains.length, findings: r.findings.length, bySeverity }, topThreats, recommendedActions: recommended },
    chains, findings, attackCoverage,
    methodology: { rulePacks: r.ruleLoad.packs, attackVersion: ATTACK_VERSION, ruleLoadErrors: r.ruleLoad.errors, ruleLoadWarnings: r.ruleLoad.warnings },
    limitations,
  }
}
