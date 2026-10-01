import pkg from '../../../package.json'
import { ATTACK_VERSION } from '../attack'
import type { AnalysisResult } from '../analysis'
import { chainTitle } from '../correlate/chains'
import { SEVERITY_RANK, type Action, type Finding, type Severity } from '../rules/types'
import { renderAction } from '../rules/render'
import type { CanonicalEvent } from '../types'
import { assessLogging, type HostRole, type LoggingAssessment } from '../audit/coverage'
import { controlTitle, frameworkName, parseControl } from '../audit/controls'
import { sha256Hex } from '../hash/sha256'
import { Pseudonymizer } from './redact'

export const REPORT_SCHEMA_VERSION = '1.1' as const
const iso = (t: number | null) => (t === null ? null : new Date(t).toISOString())
const MAX_EVIDENCE = 25

export interface CaseInfo { id?: string; analyst?: string; organisation?: string }
export interface ReportOptions { redact: boolean; generatedAt: Date; sourceName: string; hostRole?: HostRole; caseInfo?: CaseInfo }
export interface ControlMappingEntry { id: string; title?: string; ruleIds: string[]; findingIds: string[]; loggingAreas: string[] }
export interface ControlMapping { framework: string; frameworkName: string; controls: ControlMappingEntry[] }

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
  controls: string[]
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
  case: CaseInfo
  source: { fileName: string; format: string; sizeBytes: number; sha256: string; records: number; parsedEvents: number; rejectedRecords: number; firstEvent: string | null; lastEvent: string | null; hostCount: number }
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
  loggingAssessment: LoggingAssessment
  controlMapping: ControlMapping[]
  methodology: { rulePacks: { id: string; name: string; version: string; rules: number; sha256: string }[]; attackVersion: string; passes: number; ruleLoadErrors: string[]; ruleLoadWarnings: string[] }
  limitations: string[]
  integrity: { algorithm: 'SHA-256'; contentSha256: string; scope: string }
}

const SENSITIVE_NOTE = 'This report contains account names, hostnames, IP addresses and command lines from the analysed logs. Handle it according to your data-classification policy.'
const REDACTED_NOTE = 'Account names, hostnames, domains, SIDs and IP addresses were replaced with stable pseudonyms (USER-1, HOST-2 ...) and command lines were removed. This is pseudonymization, not anonymization: review before sharing outside your organisation. Case details you entered (ID, analyst, organisation) and the rule and event metadata are kept.'

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
      controls: f.controls ?? [],
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

  // Recommended actions. Containment is recommended only for chains and high/critical findings. For lower-severity findings the
  // right first step is to VERIFY (a policy change or explicit-credential logon is often legitimate), so recommend the first read-only step.
  const recommended: string[] = []
  const byId = new Map(findings.map((f) => [f.id, f]))
  for (const t of r.topThreats.slice(0, 3)) {
    const ids = t.kind === 'chain' ? (chains.find((c) => c.id === t.id)?.findingIds ?? []) : [t.id]
    const fs = ids.map((id) => byId.get(id)).filter((f): f is ReportFinding => !!f)
    const serious = t.kind === 'chain' || fs.some((f) => SEVERITY_RANK[f.severity] >= SEVERITY_RANK.high)
    if (serious) {
      const rem = fs.flatMap((f) => f.nextSteps.remediate)
      const act = rem.find((a) => a.risk === 'disruptive') ?? rem[0]
      if (act) { recommended.push(`${T(t.title)}: ${act.title}.`); continue }
    }
    const inv = fs.flatMap((f) => f.nextSteps.investigate)[0]
    recommended.push(`${T(t.title)}: verify before acting${inv ? ` (${inv.title.charAt(0).toLowerCase()}${inv.title.slice(1)})` : ''}. This may be legitimate administration; confirm against change records.`)
  }
  if (r.findings.length) recommended.push('Preserve the original log files and any volatile evidence before remediation, and record who ran which command.')
  const la = assessLogging(r.summary, r.ruleEvents, opts.hostRole)
  if (la.recentAuditChange && la.summary.possibleGaps === 0) recommended.push('Auditing was changed shortly before this export ended. Re-export after it has been on for 24 to 48 hours; categories enabled just before the export had no time to produce events, so Kerberos, command-line and similar coverage is not yet representative.')
  else if (la.summary.possibleGaps > 0 || la.commandLine.status === 'absent' || la.commandLine.status === 'partial') recommended.push('Close the audit-logging gaps listed in the Logging assessment so future analysis has full coverage.')

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

  const gapRows = la.rows.filter((x) => x.status === 'possible-gap')
  const limitations = [
    ...(r.summary.parsedEvents === 0 ? ['No events were parsed from this file, so no detections could run.'] : []),
    ...(r.summary.rejected > 0 ? [`${r.summary.rejected.toLocaleString()} of ${r.summary.totalRecords.toLocaleString()} records could not be parsed (${Object.entries(r.summary.rejectReasons).map(([k, v]) => `${k}: ${v}`).join('; ')}).`] : []),
    ...gapRows.map((x) => `No ${x.area} events (${x.eventIds.join(', ')}) were observed in ${la.windowHours.toFixed(0)} hours although they normally appear constantly: the audit setting is probably off${x.affectedRules.length ? `, so ${x.affectedRules.join(', ')} had no data` : ''}.`),
    ...(la.commandLine.status === 'absent' || la.commandLine.status === 'partial' ? [la.commandLine.note] : []),
    ...(la.recordIntegrity.status === 'gaps' ? [la.recordIntegrity.note] : []),
    ...(la.logGaps.length ? [la.logGapsNote] : []),
    ...(r.engine.capped.length ? [`In-memory limits were reached for ${r.engine.capped.join(', ')}: counts and correlations for these rules are lower bounds.`] : []),
    ...(r.engine.findingsTruncated.length ? [`Findings were capped for ${r.engine.findingsTruncated.join(', ')} (highest-count shown).`] : []),
    ...(r.engine.rulesDisabledForTime.length ? [`Rules disabled for exceeding the time budget: ${r.engine.rulesDisabledForTime.join(', ')}. Results are incomplete.`] : []),
    'Attack chains group findings by shared sessions, hosts, accounts, IPs and process IDs within a time window. They are investigative leads, not proof of a single actor.',
    'Confidence values are rule-author estimates, and risk scores use fixed weights. Neither is a statistical probability.',
    'Detections reflect only the log data supplied. Absence of a finding does not prove absence of activity.',
    'Control references are indicative pointers to relevant evidence, not an assessment of compliance. Compliance is determined by an organisation\'s processes and an assessor, not by this tool.',
    ...(r.summary.format === 'evtx' ? ['EVTX files were parsed with a WASM build of the open-source `evtx` library; chunk checksums are not enforced.'] : []),
  ]

  // Control mapping: detections (via the rules that fired) and logging areas (via the assessment).
  const cm = new Map<string, Map<string, ControlMappingEntry>>()
  const touch = (ref: string) => {
    const { framework, id } = parseControl(ref)
    const fw = cm.get(framework) ?? new Map<string, ControlMappingEntry>()
    const e = fw.get(id) ?? { id, title: controlTitle(ref), ruleIds: [], findingIds: [], loggingAreas: [] }
    fw.set(id, e); cm.set(framework, fw)
    return e
  }
  for (const f of findings) for (const c of f.controls) { const e = touch(c); if (!e.ruleIds.includes(f.ruleId)) e.ruleIds.push(f.ruleId); e.findingIds.push(f.id) }
  for (const row of la.rows) if (row.status === 'observed' || row.status === 'possible-gap') for (const c of row.controls) { const e = touch(c); if (!e.loggingAreas.includes(row.area)) e.loggingAreas.push(row.area) }
  const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })
  const controlMapping: ControlMapping[] = [...cm].sort((a, b) => natural(a[0], b[0])).map(([framework, m]) => ({
    framework, frameworkName: frameworkName(framework), controls: [...m.values()].sort((a, b) => natural(a.id, b.id)),
  }))

  const ci = opts.caseInfo ?? {}
  const clean = (v?: string) => { const t = v?.trim().slice(0, 160); return t ? t : undefined }
  const body = {
    schema: 'windows-security-triage-report' as const, schemaVersion: REPORT_SCHEMA_VERSION, generatedAt: opts.generatedAt.toISOString(),
    tool: { name: pkg.name, version: pkg.version },
    redaction: { applied: opts.redact, note: opts.redact ? REDACTED_NOTE : SENSITIVE_NOTE },
    case: { ...(clean(ci.id) ? { id: clean(ci.id) } : {}), ...(clean(ci.analyst) ? { analyst: clean(ci.analyst) } : {}), ...(clean(ci.organisation) ? { organisation: clean(ci.organisation) } : {}) },
    source: {
      fileName: opts.redact ? '[redacted]' : opts.sourceName, format: r.summary.format, sizeBytes: r.summary.bytes, sha256: r.summary.sha256 ?? '',
      records: r.summary.totalRecords, parsedEvents: r.summary.parsedEvents, rejectedRecords: r.summary.rejected,
      firstEvent: iso(r.summary.firstTs), lastEvent: iso(r.summary.lastTs), hostCount: r.summary.computers.length,
    },
    executiveSummary: { risk: r.risk, headline, counts: { chains: r.chains.length, findings: r.findings.length, bySeverity }, topThreats, recommendedActions: recommended },
    chains, findings, attackCoverage, loggingAssessment: la, controlMapping,
    methodology: { rulePacks: r.ruleLoad.packs, attackVersion: ATTACK_VERSION, passes: r.engine.passes, ruleLoadErrors: r.ruleLoad.errors, ruleLoadWarnings: r.ruleLoad.warnings },
    limitations,
  }
  // Tamper evidence for the exported data (integrity, not authenticity: anyone can recompute it; sign the file separately if you need authenticity).
  const integrity = { algorithm: 'SHA-256' as const, contentSha256: sha256Hex(JSON.stringify(body)), scope: 'compact JSON of this report without the integrity block' }
  return { ...body, integrity }
}
