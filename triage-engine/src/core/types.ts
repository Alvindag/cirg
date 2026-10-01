import type { AnalysisResult, PackInput } from './analysis'

/** Canonical, vendor-neutral Windows Security event. Raw records are discarded after normalization. */
export interface CanonicalEvent {
  eventId: number
  /** Epoch milliseconds (UTC). NaN-free: records without a parsable time are rejected. */
  ts: number
  channel?: string
  computer?: string
  subjectUserSid?: string
  subjectUserName?: string
  subjectDomainName?: string
  subjectLogonId?: string
  targetUserSid?: string
  targetUserName?: string
  targetDomainName?: string
  targetLogonId?: string
  logonType?: number
  processId?: number
  newProcessId?: number
  newProcessName?: string
  parentProcessName?: string
  commandLine?: string
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
  | { type: 'progress'; bytes: number; total: number; events: number; rejected: number }
  | { type: 'done'; result: AnalysisResult }
  | { type: 'cancelled' }
  | { type: 'error'; message: string }
