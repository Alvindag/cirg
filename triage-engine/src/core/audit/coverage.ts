import type { IngestSummary } from '../types'

export type HostRole = 'auto' | 'dc' | 'member'
export type Expectation = 'frequent' | 'occasional' | 'rare'
export type RowStatus = 'observed' | 'possible-gap' | 'not-observed' | 'not-evaluated'

interface Area { id: string; area: string; eventIds: number[]; expectation: Expectation; dcOnly?: boolean; enable?: string; controls: string[] }

/** What a healthy, audited Windows system normally produces. "frequent" = absence over a day or more indicates the audit setting is probably off. */
export const AREAS: Area[] = [
  { id: 'logon', area: 'Logon and logoff', eventIds: [4624, 4634], expectation: 'frequent', enable: 'auditpol /set /subcategory:"Logon" /success:enable /failure:enable', controls: ['nist-800-53:AU-2', 'pci-dss-4:10.2.1', 'cis-v8:8.2', 'iso-27001:A.8.15'] },
  { id: 'special', area: 'Special privileges assigned (admin logons)', eventIds: [4672], expectation: 'frequent', enable: 'auditpol /set /subcategory:"Special Logon" /success:enable', controls: ['nist-800-53:AU-2', 'pci-dss-4:10.2.1.2', 'cis-v8:8.5'] },
  { id: 'proc', area: 'Process creation', eventIds: [4688], expectation: 'frequent', enable: 'auditpol /set /subcategory:"Process Creation" /success:enable', controls: ['nist-800-53:AU-12', 'cis-v8:8.5', 'pci-dss-4:10.2.2', 'iso-27001:A.8.15'] },
  { id: 'kerb-tgt', area: 'Kerberos authentication (TGT)', eventIds: [4768], expectation: 'frequent', dcOnly: true, enable: 'auditpol /set /subcategory:"Kerberos Authentication Service" /success:enable /failure:enable', controls: ['nist-800-53:AU-2', 'cis-v8:8.5', 'pci-dss-4:10.2.1'] },
  { id: 'kerb-tgs', area: 'Kerberos service tickets (TGS)', eventIds: [4769], expectation: 'frequent', dcOnly: true, enable: 'auditpol /set /subcategory:"Kerberos Service Ticket Operations" /success:enable /failure:enable', controls: ['nist-800-53:AU-2', 'cis-v8:8.5', 'pci-dss-4:10.2.1'] },
  { id: 'ntlm', area: 'Credential validation (NTLM)', eventIds: [4776], expectation: 'occasional', dcOnly: true, enable: 'auditpol /set /subcategory:"Credential Validation" /success:enable /failure:enable', controls: ['nist-800-53:AU-2', 'cis-v8:8.5'] },
  { id: 'failed', area: 'Failed logons', eventIds: [4625], expectation: 'occasional', enable: 'auditpol /set /subcategory:"Logon" /success:enable /failure:enable', controls: ['nist-800-53:AC-7', 'pci-dss-4:10.2.1.4', 'nist-800-171:3.1.8'] },
  { id: 'explicit', area: 'Logon with explicit credentials', eventIds: [4648], expectation: 'occasional', enable: 'auditpol /set /subcategory:"Logon" /success:enable', controls: ['nist-800-53:AU-2', 'nist-800-171:3.3.2'] },
  { id: 'acct', area: 'User account management', eventIds: [4720, 4722, 4724, 4725, 4726, 4738], expectation: 'occasional', enable: 'auditpol /set /subcategory:"User Account Management" /success:enable /failure:enable', controls: ['nist-800-53:AC-2', 'pci-dss-4:10.2.1.5', 'iso-27001:A.5.16'] },
  { id: 'group', area: 'Security group changes', eventIds: [4728, 4729, 4732, 4733, 4756, 4757], expectation: 'occasional', enable: 'auditpol /set /subcategory:"Security Group Management" /success:enable', controls: ['nist-800-53:AC-2', 'pci-dss-4:10.2.1.2', 'iso-27001:A.8.2'] },
  { id: 'task', area: 'Scheduled task changes', eventIds: [4698, 4699, 4702], expectation: 'occasional', enable: 'auditpol /set /subcategory:"Other Object Access Events" /success:enable', controls: ['nist-800-53:CM-6', 'pci-dss-4:10.2.1.7'] },
  { id: 'service', area: 'Service installation', eventIds: [4697], expectation: 'rare', enable: 'auditpol /set /subcategory:"Security System Extension" /success:enable', controls: ['nist-800-53:CM-6', 'pci-dss-4:10.2.1.7'] },
  { id: 'policy', area: 'Audit policy changes', eventIds: [4719], expectation: 'rare', enable: 'auditpol /set /subcategory:"Audit Policy Change" /success:enable', controls: ['nist-800-53:AU-12', 'pci-dss-4:10.2.1.6', 'nist-800-171:3.3.8'] },
  { id: 'clear', area: 'Audit log cleared', eventIds: [1102, 104], expectation: 'rare', controls: ['nist-800-53:AU-9', 'pci-dss-4:10.2.1.6', 'pci-dss-4:10.3.2'] },
]

const DC_SIGNS = [4768, 4769, 4770, 4771, 4776, 5136, 4742]

export interface AssessmentRow {
  id: string; area: string; eventIds: number[]; observed: number; expectation: Expectation; dcOnly: boolean
  status: RowStatus; note: string; enable?: string; controls: string[]
  /** Enabled rules that depend only on event IDs that were not observed. */
  affectedRules: string[]
}
export interface LoggingAssessment {
  role: 'dc' | 'member' | 'unknown'
  roleInferred: boolean
  windowHours: number
  rows: AssessmentRow[]
  commandLine: { applicable: boolean; processEvents: number; withCommandLine: number; percent: number | null; status: 'ok' | 'partial' | 'absent' | 'not-applicable'; note: string }
  logGaps: { from: string; to: string; hours: number }[]
  logGapsNote: string
  recordIntegrity: { applicable: boolean; observed: number; expected: number; missing: number; status: 'contiguous' | 'gaps' | 'not-applicable'; note: string }
  summary: { observed: number; possibleGaps: number; evaluated: number }
}

export interface RuleEvents { ruleId: string; eventIds: number[] }

const GAP_HOURS = 4

export function assessLogging(s: IngestSummary, ruleEvents: RuleEvents[], roleOpt: HostRole = 'auto'): LoggingAssessment {
  const count = (ids: number[]) => ids.reduce((n, id) => n + (s.byEventId[id] ?? 0), 0)
  const inferredDc = DC_SIGNS.some((id) => (s.byEventId[id] ?? 0) > 0)
  const role: LoggingAssessment['role'] = roleOpt === 'dc' ? 'dc' : roleOpt === 'member' ? 'member' : inferredDc ? 'dc' : 'unknown'
  const windowHours = s.firstTs !== null && s.lastTs !== null ? (s.lastTs - s.firstTs) / 3_600_000 : 0
  // If auditing was changed shortly before the export ended, newly enabled categories have had no time to produce events.
  const sinceChange = s.lastAuditPolicyChangeTs !== null && s.lastTs !== null ? s.lastTs - s.lastAuditPolicyChangeTs : null
  const recentChange = sinceChange !== null && sinceChange >= 0 && sinceChange <= 6 * 3_600_000
  const recentNote = recentChange ? ` An audit-policy change was recorded ${sinceChange! < 120_000 ? `${Math.max(1, Math.round(sinceChange! / 1000))} second(s)` : `${Math.round(sinceChange! / 60_000)} minute(s)`} before this export ended, so newly enabled categories may not have had time to produce events. Re-export after a day or more.` : ''
  const missingIds = new Set(AREAS.flatMap((a) => a.eventIds).filter((id) => (s.byEventId[id] ?? 0) === 0))

  const rows: AssessmentRow[] = AREAS.map((a) => {
    const observed = count(a.eventIds)
    let status: RowStatus, note: string
    if (observed > 0) { status = 'observed'; note = `${observed.toLocaleString()} event(s) observed.` }
    else if (a.dcOnly && role !== 'dc') { status = 'not-evaluated'; note = role === 'member' ? 'Applies to domain controllers only.' : 'Applies to domain controllers; the log source role is unknown (choose it above to evaluate).' }
    else if (a.expectation === 'frequent' && windowHours >= 6 && recentChange) { status = 'not-observed'; note = 'None observed in this window.' + recentNote }
    else if (a.expectation === 'frequent' && windowHours >= 6) { status = 'possible-gap'; note = 'None observed in this window. This normally appears constantly, so the audit setting is probably not enabled (or its events were not exported).' }
    else if (a.expectation === 'frequent') { status = 'not-observed'; note = 'None observed, but the window is too short to conclude.' }
    else if (a.expectation === 'occasional') { status = 'not-observed'; note = 'None observed. Either the setting is off or the activity did not occur; verify the audit setting.' }
    else { status = 'not-observed'; note = 'None observed. This is normal when no such activity occurred.' }
    const affectedRules = status === 'possible-gap' || (status === 'not-observed' && a.expectation !== 'rare')
      ? ruleEvents.filter((r) => r.eventIds.length && r.eventIds.every((id) => missingIds.has(id) && a.eventIds.includes(id))).map((r) => r.ruleId)
      : []
    return { id: a.id, area: a.area, eventIds: a.eventIds, observed, expectation: a.expectation, dcOnly: !!a.dcOnly, status, note, enable: a.enable, controls: a.controls, affectedRules }
  })

  const p = s.proc4688, c = s.proc4688WithCmd
  const commandLine: LoggingAssessment['commandLine'] = p === 0
    ? { applicable: false, processEvents: 0, withCommandLine: 0, percent: null, status: 'not-applicable', note: 'No process-creation events were present.' }
    : c === 0 ? { applicable: true, processEvents: p, withCommandLine: 0, percent: 0, status: 'absent', note: 'Process-creation events carry no command line, so command-line detections cannot run. Enable "Include command line in process creation events" (Group Policy: Administrative Templates > System > Audit Process Creation).' }
    : c / p < 0.5 ? { applicable: true, processEvents: p, withCommandLine: c, percent: Math.round((100 * c) / p), status: 'partial', note: 'Only part of the period carries command lines (the setting was probably enabled recently), so command-line detections have partial coverage.' + recentNote }
    : { applicable: true, processEvents: p, withCommandLine: c, percent: Math.round((100 * c) / p), status: 'ok', note: 'Command lines are being recorded.' }

  // Periods with no events at all between the first and last event.
  const hours = Object.keys(s.hourly).map(Number).sort((x, y) => x - y)
  const logGaps: LoggingAssessment['logGaps'] = []
  for (let i = 1; i < hours.length; i++) {
    const empty = hours[i]! - hours[i - 1]! - 1
    if (empty >= GAP_HOURS) logGaps.push({ from: new Date((hours[i - 1]! + 1) * 3_600_000).toISOString(), to: new Date(hours[i]! * 3_600_000).toISOString(), hours: empty })
  }
  logGaps.sort((a, b) => b.hours - a.hours)
  const logGapsNote = s.hourlyTruncated ? 'The period is too long for gap analysis.' : logGaps.length
    ? `${logGaps.length} period(s) of ${GAP_HOURS}+ consecutive hours with no events. A powered-off or idle host explains this; on a server that should always log, it may indicate a logging outage or removed records.`
    : `No gaps of ${GAP_HOURS}+ hours without events.`

  const ri = s.recordIds
  const applicable = ri.count >= 2 && ri.computers <= 1 && ri.channels <= 1
  const expected = applicable ? ri.max - ri.min + 1 : 0
  const missing = applicable ? Math.max(0, expected - ri.count) : 0
  const recordIntegrity: LoggingAssessment['recordIntegrity'] = !applicable
    ? { applicable: false, observed: ri.count, expected: 0, missing: 0, status: 'not-applicable', note: ri.count < 2 ? 'The export carries no EventRecordID values.' : 'The file mixes several computers or logs, so record-number continuity cannot be checked.' }
    : missing === 0 ? { applicable, observed: ri.count, expected, missing, status: 'contiguous', note: `All ${expected.toLocaleString()} record numbers in the range are present: no removed or overwritten records within this export.` }
    : { applicable, observed: ri.count, expected, missing, status: 'gaps', note: `${missing.toLocaleString()} of ${expected.toLocaleString()} record numbers in the range are absent. If the export was an unfiltered time-range export, records were removed or lost; if it was filtered by Event ID or user, this is expected.` }

  const evaluated = rows.filter((r) => r.status !== 'not-evaluated')
  return {
    role, roleInferred: roleOpt === 'auto', windowHours, rows, commandLine, logGaps: logGaps.slice(0, 10), logGapsNote, recordIntegrity,
    summary: { observed: rows.filter((r) => r.status === 'observed').length, possibleGaps: rows.filter((r) => r.status === 'possible-gap').length, evaluated: evaluated.length },
  }
}
