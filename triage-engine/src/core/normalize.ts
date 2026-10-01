import type { CanonicalEvent, FlatRecord } from './types'

/** Aliases per canonical field. Keys are compared after lowercasing and stripping non-alphanumerics. */
const ALIASES: Record<string, string[]> = {
  eventId: ['eventid', 'eventcode', 'id', 'event_id'],
  ts: ['timegenerated', 'timecreated', 'systemtime', 'time', 'timestamp', 'eventtime', 'datetime', 'utctime'],
  channel: ['channel', 'logname', 'sourcetype'],
  computer: ['computer', 'computername', 'host', 'hostname', 'devicename'],
  subjectUserSid: ['subjectusersid'],
  subjectUserName: ['subjectusername'],
  subjectDomainName: ['subjectdomainname'],
  subjectLogonId: ['subjectlogonid'],
  targetUserSid: ['targetusersid', 'targetsid'],
  targetUserName: ['targetusername'],
  targetDomainName: ['targetdomainname'],
  targetLogonId: ['targetlogonid'],
  memberSid: ['membersid'],
  logonType: ['logontype'],
  processId: ['processid', 'callerprocessid', 'pid'],
  newProcessId: ['newprocessid'],
  newProcessName: ['newprocessname', 'process', 'image'],
  parentProcessName: ['parentprocessname'],
  commandLine: ['commandline', 'processcommandline'],
  processName: ['processname', 'callerprocessname'],
  targetServerName: ['targetservername'],
  ipAddress: ['ipaddress', 'sourcenetworkaddress', 'sourceip', 'srcip', 'clientaddress'],
  ipPort: ['ipport', 'sourceport', 'srcport'],
  workstationName: ['workstationname', 'workstation'],
  status: ['status'],
  subStatus: ['substatus'],
  authenticationPackage: ['authenticationpackagename', 'authenticationpackage'],
  serviceName: ['servicename'],
}

const LOOKUP = new Map<string, string>()
for (const [canon, list] of Object.entries(ALIASES)) {
  for (const a of list) if (!LOOKUP.has(a)) LOOKUP.set(a, canon)
  LOOKUP.set(canon.toLowerCase(), canon)
}
// "id"/"time"/"host"/"process" are weak aliases; exact canonical/stronger names win (see pick order below).
const WEAK = new Set(['id', 'time', 'host', 'process', 'image', 'pid', 'sourcetype'])

const keyNorm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '')

const XML_ENT: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'" }
const decodeXml = (s: string) => s.replace(/&(lt|gt|amp|quot|apos);/g, (m) => XML_ENT[m] ?? m)

/** Sentinel's SecurityEvent can ship an `EventData` XML blob; extract <Data Name="x">v</Data> pairs. */
function expandEventData(blob: string, out: FlatRecord) {
  const re = /<Data\s+Name="([^"]{1,80})"\s*(?:\/>|>([\s\S]*?)<\/Data>)/g
  let m: RegExpExecArray | null
  let n = 0
  while ((m = re.exec(blob)) && n++ < 200) {
    const k = m[1]!
    if (!(k in out)) out[k] = m[2] === undefined ? '' : decodeXml(m[2])
  }
}

/** Flatten nested objects (Splunk/Sentinel JSON) to leaf names; first writer wins, depth capped. */
export function flatten(obj: unknown, out: FlatRecord = {}, depth = 0): FlatRecord {
  if (obj === null || typeof obj !== 'object' || depth > 6) return out
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, out, depth + 1)
    else if (!(k in out)) out[k] = v
  }
  return out
}

const str = (v: unknown): string | undefined => {
  if (v === null || v === undefined) return undefined
  const s = String(v).trim()
  return s === '' || s === '-' ? undefined : s
}
const num = (v: unknown): number | undefined => {
  const s = str(v)
  if (s === undefined) return undefined
  const n = /^0x[0-9a-f]+$/i.test(s) ? parseInt(s, 16) : Number(s)
  return Number.isFinite(n) ? n : undefined
}

const US_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2}):(\d{2})(?:\.\d+)?\s*(AM|PM)?$/i

export function parseTime(v: unknown): number | undefined {
  if (typeof v === 'number') return v > 1e11 ? v : v * 1000 // epoch ms vs seconds
  const s = str(v)
  if (!s) return undefined
  if (/^\d{9,13}(\.\d+)?$/.test(s)) {
    const n = Number(s)
    return n > 1e11 ? n : n * 1000
  }
  const us = US_DATE.exec(s)
  if (us) {
    let h = Number(us[4])
    const ap = us[7]?.toUpperCase()
    if (ap === 'PM' && h < 12) h += 12
    if (ap === 'AM' && h === 12) h = 0
    return Date.UTC(Number(us[3]), Number(us[1]) - 1, Number(us[2]), h, Number(us[5]), Number(us[6]))
  }
  // Treat zone-less ISO strings as UTC (SIEM exports are UTC by convention).
  const iso = /(?:Z|[+-]\d{2}:?\d{2})$/.test(s) ? s : s.replace(' ', 'T') + 'Z'
  const t = Date.parse(iso)
  return Number.isNaN(t) ? undefined : t
}

export type NormalizeResult = { ok: true; event: CanonicalEvent } | { ok: false; reason: string }

export function normalize(rec: FlatRecord, index: number): NormalizeResult {
  const flat = flatten(rec)
  const blob = flat['EventData'] ?? flat['eventdata']
  if (typeof blob === 'string' && blob.includes('<Data')) expandEventData(blob, flat)

  const picked: Record<string, unknown> = {}
  const weakPicked: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(flat)) {
    const nk = keyNorm(k)
    const canon = LOOKUP.get(nk)
    if (!canon) continue
    const target = WEAK.has(nk) ? weakPicked : picked
    if (!(canon in target)) target[canon] = v
  }
  for (const [c, v] of Object.entries(weakPicked)) if (!(c in picked)) picked[c] = v

  const eventId = num(picked['eventId'])
  if (eventId === undefined || eventId <= 0 || eventId > 65535) return { ok: false, reason: 'missing/invalid EventID' }
  const ts = parseTime(picked['ts'])
  if (ts === undefined) return { ok: false, reason: 'missing/invalid timestamp' }

  const ev: CanonicalEvent = { eventId, ts, src: { index } }
  const S = ['channel', 'computer', 'subjectUserSid', 'subjectUserName', 'subjectDomainName', 'targetUserSid',
    'targetUserName', 'targetDomainName', 'memberSid', 'newProcessName', 'parentProcessName', 'commandLine', 'processName', 'targetServerName', 'ipAddress',
    'workstationName', 'status', 'subStatus', 'authenticationPackage', 'serviceName'] as const
  for (const f of S) {
    const v = str(picked[f])
    if (v !== undefined) ev[f] = v
  }
  for (const f of ['subjectLogonId', 'targetLogonId'] as const) {
    const v = str(picked[f])
    if (v !== undefined) ev[f] = v.toLowerCase() // join keys: canonical case
  }
  for (const f of ['logonType', 'processId', 'newProcessId', 'ipPort'] as const) {
    const v = num(picked[f])
    if (v !== undefined) ev[f] = v
  }
  return { ok: true, event: ev }
}
