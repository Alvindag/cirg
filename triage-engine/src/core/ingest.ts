import { normalize } from './normalize'
import type { CanonicalEvent, FlatRecord, IngestSummary, LogFormat, ParseHooks } from './types'
import { parseCsv } from '../parsers/csv'
import { parseJson } from '../parsers/json'
import { parseXml } from '../parsers/xml'
import { parseEvtx } from '../parsers/evtx'
import { sniffFormat } from '../parsers/sniff'

const SAMPLE_MAX = 200
const COMPUTERS_MAX = 5000
const REASON_MAX = 20

export interface IngestOptions {
  onProgress?: (p: { bytes: number; events: number; rejected: number; phase?: string }) => void
  isCancelled?: () => boolean
  /** false = second pass: skip all aggregation (only feed events to onEvent). Default true. */
  summarize?: boolean
  /** Override sniffing (used by tests / user override). */
  format?: LogFormat
  name?: string
}

/**
 * Single-pass ingest: parse → normalize → aggregate. Normalized events are NOT retained beyond a small sample;
 * Phase 2/3 will plug the rule + correlation engines in at `onEvent`.
 */
export async function ingest(
  file: File | Blob,
  opts: IngestOptions = {},
  onEvent?: (e: CanonicalEvent) => void,
): Promise<IngestSummary | null> {
  const t0 = performance.now()
  const isCancelled = opts.isCancelled ?? (() => false)
  const format = opts.format ?? (await sniffFormat(file, opts.name ?? (file as File).name ?? ''))

  const s: IngestSummary = {
    format, bytes: file.size, totalRecords: 0, parsedEvents: 0, rejected: 0, rejectReasons: {},
    firstTs: null, lastTs: null, byEventId: {}, proc4688: 0, proc4688WithCmd: 0,
    hourly: {}, hourlyTruncated: false, lastAuditPolicyChangeTs: null, recordIds: { count: 0, min: Infinity, max: -Infinity, computers: 0, channels: 0 }, computers: [], computersTruncated: false, sample: [], elapsedMs: 0,
  }
  const computers = new Set<string>()
  const channels = new Set<string>()
  const summarize = opts.summarize !== false
  const MAX_HOURS = 24 * 400
  let lastReport = 0
  let bytes = 0

  const hooks: ParseHooks = {
    isCancelled,
    onBytes: (n) => { bytes = n },
    onRecord: (rec: FlatRecord) => {
      s.totalRecords++
      const r = normalize(rec, s.totalRecords)
      if (!r.ok) {
        s.rejected++
        const k = s.rejectReasons
        if (r.reason in k || Object.keys(k).length < REASON_MAX) k[r.reason] = (k[r.reason] ?? 0) + 1
      } else {
        const e = r.event
        s.parsedEvents++
        if (summarize) {
          s.byEventId[e.eventId] = (s.byEventId[e.eventId] ?? 0) + 1
          if (e.eventId === 4688) { s.proc4688++; if (e.commandLine) s.proc4688WithCmd++ }
          if (e.eventId === 4719 && (s.lastAuditPolicyChangeTs === null || e.ts > s.lastAuditPolicyChangeTs)) s.lastAuditPolicyChangeTs = e.ts
          if (s.firstTs === null || e.ts < s.firstTs) s.firstTs = e.ts
          if (s.lastTs === null || e.ts > s.lastTs) s.lastTs = e.ts
          const hr = Math.floor(e.ts / 3_600_000)
          if (hr in s.hourly) s.hourly[hr]!++
          else if (Object.keys(s.hourly).length < MAX_HOURS) s.hourly[hr] = 1
          else s.hourlyTruncated = true
          if (e.recordId !== undefined) {
            const ri = s.recordIds
            ri.count++; if (e.recordId < ri.min) ri.min = e.recordId; if (e.recordId > ri.max) ri.max = e.recordId
          }
          if (e.channel && channels.size < 8) channels.add(e.channel)
          if (e.computer) {
            if (computers.size < COMPUTERS_MAX) computers.add(e.computer)
            else if (!computers.has(e.computer)) s.computersTruncated = true
          }
          if (s.sample.length < SAMPLE_MAX) s.sample.push(e)
        }
        onEvent?.(e)
      }
      const now = performance.now()
      if (now - lastReport > 100) {
        lastReport = now
        opts.onProgress?.({ bytes, events: s.parsedEvents, rejected: s.rejected })
      }
    },
  }

  if (format === 'csv') await parseCsv(file, hooks)
  else if (format === 'json') await parseJson(file, hooks)
  else if (format === 'evtx') await parseEvtx(file, hooks)
  else await parseXml(file, hooks)

  if (isCancelled()) return null
  s.computers = [...computers].sort()
  s.recordIds.computers = computers.size
  s.recordIds.channels = channels.size
  if (s.recordIds.count === 0) { s.recordIds.min = 0; s.recordIds.max = 0 }
  s.elapsedMs = Math.round(performance.now() - t0)
  opts.onProgress?.({ bytes: file.size, events: s.parsedEvents, rejected: s.rejected })
  return s
}
