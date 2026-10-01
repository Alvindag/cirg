import type { CanonicalEvent } from '../types'

const KEEP_ACCOUNTS = new Set(['system', 'local service', 'network service', 'anonymous logon', 'dwm-1', 'dwm-2', 'umfd-0', 'umfd-1', 'window manager', 'font driver host', '-'])
const KEEP_DOMAINS = new Set(['nt authority', 'window manager', 'font driver host', 'nt service', 'builtin', '-'])
const KEEP_SID = /^(S-1-0-0|S-1-5-18|S-1-5-19|S-1-5-20|S-1-5-7|S-1-5-32-\d+|S-1-5-(80|90|96)-.*)$/i
const KEEP_IP = new Set(['127.0.0.1', '::1', '0.0.0.0', '::'])

type Kind = 'USER' | 'HOST' | 'IP' | 'SID' | 'DOMAIN'

/**
 * Stable, deterministic pseudonyms (USER-1, HOST-2 ...) so correlation stays readable in a shared report.
 * This is pseudonymization, not anonymization: review a redacted report before sharing it outside your organisation.
 */
export class Pseudonymizer {
  private maps: Record<Kind, Map<string, string>> = { USER: new Map(), HOST: new Map(), IP: new Map(), SID: new Map(), DOMAIN: new Map() }
  /** original (lowercase) -> pseudonym, for replacing values inside derived free text (narratives, titles). */
  readonly replacements = new Map<string, string>()

  private pseudo(kind: Kind, value: string): string {
    const key = value.toLowerCase()
    const m = this.maps[kind]
    let p = m.get(key)
    if (!p) { p = `${kind}-${m.size + 1}`; m.set(key, p); this.replacements.set(key, p) }
    return p
  }
  user(v?: string) { if (!v) return v; const l = v.toLowerCase(); return KEEP_ACCOUNTS.has(l) ? v : this.pseudo('USER', l.endsWith('$') ? l.slice(0, -1) : l) + (l.endsWith('$') ? '$' : '') }
  host(v?: string) { return v ? this.pseudo('HOST', v) : v }
  ip(v?: string) { return v && !KEEP_IP.has(v) ? this.pseudo('IP', v) : v }
  sid(v?: string) { return v && !KEEP_SID.test(v) ? this.pseudo('SID', v) : v }
  domain(v?: string) { return v && !KEEP_DOMAINS.has(v.toLowerCase()) ? this.pseudo('DOMAIN', v) : v }

  event(e: CanonicalEvent): CanonicalEvent {
    const o: CanonicalEvent = { eventId: e.eventId, ts: e.ts }
    const copy = <K extends keyof CanonicalEvent>(k: K) => { if (e[k] !== undefined) (o as unknown as Record<string, unknown>)[k] = e[k] }
    for (const k of ['channel', 'recordId', 'auditPolicyChanges', 'ticketEncryptionType', 'objectProperties', 'subjectLogonId', 'targetLogonId', 'logonType', 'processId', 'newProcessId', 'ipPort', 'status', 'subStatus', 'authenticationPackage', 'serviceName'] as const) copy(k)
    if (e.computer) o.computer = this.host(e.computer)
    if (e.workstationName) o.workstationName = this.host(e.workstationName)
    if (e.subjectUserName) o.subjectUserName = this.user(e.subjectUserName)
    if (e.targetUserName) o.targetUserName = this.user(e.targetUserName)
    if (e.subjectDomainName) o.subjectDomainName = this.domain(e.subjectDomainName)
    if (e.targetDomainName) o.targetDomainName = this.domain(e.targetDomainName)
    if (e.subjectUserSid) o.subjectUserSid = this.sid(e.subjectUserSid)
    if (e.targetUserSid) o.targetUserSid = this.sid(e.targetUserSid)
    if (e.memberSid) o.memberSid = this.sid(e.memberSid)
    if (e.ipAddress) o.ipAddress = this.ip(e.ipAddress)
    // Paths often embed profile names; keep only the executable name. Command lines are removed entirely.
    if (e.targetServerName) o.targetServerName = ['localhost', '-'].includes(e.targetServerName.toLowerCase()) ? e.targetServerName : this.host(e.targetServerName)
    for (const k of ['newProcessName', 'parentProcessName', 'processName'] as const) if (e[k]) o[k] = e[k]!.split(/[\\/]/).pop()
    if (e.commandLine) o.commandLine = `[redacted: ${e.commandLine.length} characters]`
    return o
  }

  /** Replace known sensitive values inside derived free text. Tokens shorter than 3 chars are skipped to avoid mangling words. */
  text(s: string): string {
    const keys = [...this.replacements.keys()].filter((k) => k.length >= 3).sort((a, b) => b.length - a.length)
    let out = s
    for (const k of keys) out = out.replace(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), this.replacements.get(k)!)
    return out
  }
}
