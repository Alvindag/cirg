import type { AnalysisResult, PackInput } from './analysis'

/** Canonical, vendor-neutral Windows Security event. Raw records are discarded after normalization. */
export interface CanonicalEvent {
  eventId: number
  /** Epoch milliseconds (UTC). NaN-free: records without a parsable time are rejected. */
  ts: number
  channel?: string
  computer?: string
  /** EventRecordID: sequential per log; gaps can indicate removed or overwritten records. */
  recordId?: number
  /** 4719: raw AuditPolicyChanges codes (e.g. %%8448 = Success added). */
  auditPolicyChanges?: string
  subjectUserSid?: string
  subjectUserName?: string
  subjectDomainName?: string
  subjectLogonId?: string
  targetUserSid?: string
  targetUserName?: string
  targetDomainName?: string
  targetLogonId?: string
  memberSid?: string
  logonType?: number
  processId?: number
  newProcessId?: number
  newProcessName?: string
  parentProcessName?: string
  commandLine?: string
  /** Process that performed the action (e.g. 4648 ProcessName), distinct from the newly created process in 4688. */
  processName?: string
  /** 4648: the server the explicit credentials were used against. */
  targetServerName?: string
  ipAddress?: string
  ipPort?: number
  workstationName?: string
  status?: string
  subStatus?: string
  authenticationPackage?: string
  serviceName?: string
  /** Provenance for on-demand evidence re-reads. */
  src?: { index: number }
}

export type LogFormat = 'csv' | 'json' | 'xml' | 'evtx'

export type FlatRecord = Record<string, unknown>

export interface ParseHooks {
  /** Called once per raw record. */
  onRecord(rec: FlatRecord): void
  /** Called with cumulative bytes consumed. */
  onBytes(bytes: number): void
  /** Parsers must poll this and stop promptly when true. */
  isCancelled(): boolean
}

export interface IngestSummary {
  format: LogFormat
  bytes: number
  totalRecords: number
  parsedEvents: number
  rejected: number
  rejectReasons: Record<string, number>
  firstTs: number | null
  lastTs: number | null
  byEventId: Record<number, number>
  /** Process-creation (4688) events seen / those carrying a command line. Detects disabled command-line auditing. */
  proc4688: number
  proc4688WithCmd: number
  /** Event counts per UTC hour (hour index = floor(ts / 3600000)); used to find periods with no events. */
  hourly: Record<number, number>
  hourlyTruncated: boolean
  /** EventRecordID statistics (only meaningful for a single computer + channel). */
  recordIds: { count: number; min: number; max: number; computers: number; channels: number }
  /** SHA-256 of the source file, computed by streaming (chain of custody). */
  sha256?: string
  computers: string[]
  computersTruncated: boolean
  sample: CanonicalEvent[]
  elapsedMs: number
}

export type ToWorker =
  | { type: 'start'; file: File; packs: PackInput[] }
  | { type: 'cancel' }
  | { type: 'destroy' }

export type FromWorker =
  | { type: 'progress'; bytes: number; total: number; events: number; rejected: number; phase: string }
  | { type: 'done'; result: AnalysisResult }
  | { type: 'cancelled' }
  | { type: 'error'; message: string }
