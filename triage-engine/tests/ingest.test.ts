import { describe, expect, it } from 'vitest'
import { ingest } from '../src/core/ingest'
import { normalize, parseTime } from '../src/core/normalize'
import { ObjectSplitter } from '../src/parsers/json'

const blob = (s: string) => new Blob([s])

describe('normalize', () => {
  it('maps Sentinel SecurityEvent CSV-style fields and lowercases logon IDs', () => {
    const r = normalize({ EventID: '4624', TimeGenerated: '2025-03-01T10:00:00Z', Computer: 'DC01', TargetLogonId: '0x3E7', LogonType: '3', IpAddress: '10.0.0.5', SubjectUserName: '-' }, 1)
    expect(r.ok && r.event).toMatchObject({ eventId: 4624, computer: 'DC01', targetLogonId: '0x3e7', logonType: 3, ipAddress: '10.0.0.5' })
    expect(r.ok && 'subjectUserName' in r.event).toBe(false) // "-" placeholder dropped
  })
  it('expands Sentinel EventData XML blobs and entity-decodes', () => {
    const r = normalize({ EventID: 4688, TimeGenerated: '2025-03-01 10:00:00', EventData: '<EventData><Data Name="CommandLine">powershell -c &quot;a&amp;b&quot;</Data><Data Name="NewProcessId">0x1a4</Data></EventData>' }, 1)
    expect(r.ok && r.event).toMatchObject({ commandLine: 'powershell -c "a&b"', newProcessId: 420 })
  })
  it('flattens Splunk-style nested JSON and epoch seconds', () => {
    const r = normalize({ _time: 1740823200, result: { EventCode: '4625', Computer: 'WS1' } }, 1)
    expect(r.ok && r.event).toMatchObject({ eventId: 4625, ts: 1740823200000, computer: 'WS1' })
  })
  it('rejects bad records with a reason', () => {
    expect(normalize({ foo: 1 }, 1)).toEqual({ ok: false, reason: 'missing/invalid EventID' })
    expect(normalize({ EventID: 4624, TimeGenerated: 'nope' }, 1)).toEqual({ ok: false, reason: 'missing/invalid timestamp' })
  })
  it('parses US and AM/PM timestamps', () => {
    expect(parseTime('3/1/2025 12:05:00 AM')).toBe(Date.UTC(2025, 2, 1, 0, 5, 0))
    expect(parseTime('3/1/2025 1:05:00 PM')).toBe(Date.UTC(2025, 2, 1, 13, 5, 0))
  })
})

describe('ObjectSplitter', () => {
  const docs = [{ a: 1, s: 'br}ace "q\\" ]', n: { x: [1, { y: 2 }] } }, { a: 2 }, { a: 3, t: '{{' }]
  const collect = (text: string, size: number) => {
    const out: unknown[] = []
    const sp = new ObjectSplitter((j) => out.push(JSON.parse(j)))
    for (let i = 0; i < text.length; i += size) sp.write(text.slice(i, i + size))
    return out
  }
  for (const size of [1, 2, 3, 7, 1000]) {
    it(`NDJSON split at every chunk size (${size})`, () => expect(collect(docs.map((d) => JSON.stringify(d)).join('\n'), size)).toEqual(docs))
    it(`JSON array split at every chunk size (${size})`, () => expect(collect(JSON.stringify(docs, null, 2), size)).toEqual(docs))
  }
})

describe('ingest', () => {
  it('CSV', async () => {
    const csv = 'EventID,TimeGenerated,Computer\n4624,2025-03-01T10:00:00Z,A\n4625,2025-03-01T10:00:05Z,B\n4625,bad,B\n'
    const s = await ingest(blob(csv), { format: 'csv' })
    expect(s).toMatchObject({ format: 'csv', totalRecords: 3, parsedEvents: 2, rejected: 1, byEventId: { 4624: 1, 4625: 1 } })
    expect(s!.computers).toEqual(['A', 'B'])
  })
  it('NDJSON auto-detected, malformed line counted', async () => {
    const s = await ingest(blob('{"EventID":4672,"TimeCreated":"2025-03-01T10:00:00Z"}\n{"EventID":4688,"TimeCreated":"2025-03-01T10:01:00Z"}\n'), { name: 'x.log' })
    expect(s).toMatchObject({ format: 'json', parsedEvents: 2 })
  })
  it('Windows Event XML', async () => {
    const xml = `<Events><Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event"><System><EventID>4688</EventID><TimeCreated SystemTime="2025-03-01T10:00:00.123Z"/><Computer>WS1</Computer><Channel>Security</Channel></System><EventData><Data Name="NewProcessName">C:\\Windows\\System32\\cmd.exe</Data><Data Name="SubjectLogonId">0x3E7</Data></EventData></Event></Events>`
    const evs: unknown[] = []
    const s = await ingest(blob(xml), {}, (e) => evs.push(e))
    expect(s).toMatchObject({ format: 'xml', parsedEvents: 1 })
    expect(evs[0]).toMatchObject({ eventId: 4688, computer: 'WS1', channel: 'Security', newProcessName: 'C:\\Windows\\System32\\cmd.exe', subjectLogonId: '0x3e7' })
  })
  it('EVTX header is detected; a truncated file yields zero events rather than a crash', async () => {
    const s = await ingest(blob('ElfFile\0rest'))
    expect(s).toMatchObject({ format: 'evtx', parsedEvents: 0 })
  })
  it('cancellation returns null promptly', async () => {
    const line = '{"EventID":4624,"TimeCreated":"2025-03-01T10:00:00Z"}\n'
    let calls = 0
    const r = await ingest(blob(line.repeat(100000)), { isCancelled: () => ++calls > 1 })
    expect(r).toBeNull()
  })
  it('handles a large NDJSON (~60MB) without retaining events', async () => {
    const line = '{"EventID":4625,"TimeCreated":"2025-03-01T10:00:00Z","Computer":"H","CommandLine":"' + 'x'.repeat(100) + '"}\n'
    const parts = Array.from({ length: 4 }, () => line.repeat(100000))
    const big = new Blob(parts.concat(parts, parts, parts, parts, parts)) // 2.4M events
    const before = process.memoryUsage().heapUsed
    const s = await ingest(big, {})
    const grown = (process.memoryUsage().heapUsed - before) / 1e6
    expect(s!.parsedEvents).toBe(2_400_000)
    expect(s!.sample.length).toBeLessThanOrEqual(200)
    expect(grown).toBeLessThan(150)
  }, 120000)
})
