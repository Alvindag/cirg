import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { WASM_BASE64, WASM_SHA256 } from '../src/evtx/wasmBytes.generated'
import { analyze } from '../src/core/analysis'
import { ingest } from '../src/core/ingest'
import { evtxJsonToFlat } from '../src/parsers/evtx'
// @ts-expect-error untyped .mjs test helper
import { buildEvtx } from '../e2e/evtxBuilder.mjs'

const T = '2025-03-01T10:00:00Z'
const ev = (eventId: number, sec: number, data: Record<string, string>, computer = 'DC01') =>
  ({ eventId, time: new Date(Date.parse(T) + sec * 1000), computer, data })
const blob = (u8: Uint8Array) => new Blob([u8 as BlobPart])

describe('EVTX via WASM (evtx crate)', () => {
  it('parses synthetic EVTX chunks into canonical events', async () => {
    const file = buildEvtx([
      [ev(4624, 0, { TargetUserName: 'bob', TargetLogonId: '0x5A5A', LogonType: '3', IpAddress: '203.0.113.9' }),
       ev(4672, 1, { SubjectUserName: 'bob', SubjectLogonId: '0x5A5A' })],
      [ev(4688, 2, { SubjectLogonId: '0x5A5A', NewProcessName: 'C:\\Windows\\System32\\cmd.exe', CommandLine: 'cmd /c "echo <b>&</b>"' }, 'WS1')],
    ])
    const seen: unknown[] = []
    const s = await ingest(blob(file), {}, (e) => seen.push(e))
    expect(s).toMatchObject({ format: 'evtx', totalRecords: 3, parsedEvents: 3, rejected: 0, byEventId: { 4624: 1, 4672: 1, 4688: 1 } })
    expect(s!.computers).toEqual(['DC01', 'WS1'])
    expect(seen[0]).toMatchObject({ eventId: 4624, channel: 'Security', computer: 'DC01', targetUserName: 'bob', targetLogonId: '0x5a5a', logonType: 3, ipAddress: '203.0.113.9', ts: Date.parse(T) })
    expect(seen[2]).toMatchObject({ eventId: 4688, commandLine: 'cmd /c "echo <b>&</b>"' }) // XML-special characters survive
  })

  it('skips zeroed chunk slots and counts a corrupt chunk as malformed instead of failing the file', async () => {
    const file: Uint8Array = buildEvtx([[ev(4624, 0, { TargetUserName: 'a' })], [ev(4624, 1, { TargetUserName: 'b' })], [ev(4624, 2, { TargetUserName: 'c' })]])
    file.fill(0, 4096 + 65536, 4096 + 2 * 65536)                // chunk 1 wiped (unused slot)
    file.fill(0xff, 4096 + 2 * 65536 + 512, 4096 + 3 * 65536)   // chunk 2: valid header, garbage records
    const s = await ingest(blob(file), {})
    expect(s!.parsedEvents).toBe(1)
    expect(s!.byEventId[4624]).toBe(1)
  })

  it('full pipeline: EVTX in → correlated chain out (LAT-001 by Logon ID)', async () => {
    const file = buildEvtx([[
      ev(4624, 0, { TargetUserName: 'bob', TargetLogonId: '0x5A5A', LogonType: '3', IpAddress: '203.0.113.9' }),
      ev(4672, 1, { SubjectUserName: 'bob', SubjectLogonId: '0x5A5A' }),
      ev(4688, 60, { SubjectUserName: 'bob', SubjectLogonId: '0x5A5A', NewProcessName: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', CommandLine: 'powershell -enc ' + 'QUJD'.repeat(15) }),
    ]])
    const r = (await analyze(blob(file), []))!
    expect(r.findings.map((f) => f.ruleId)).toEqual(expect.arrayContaining(['LAT-001', 'EXEC-001', 'AUTH-004']))
    expect(r.chains.length).toBeGreaterThanOrEqual(1)
  })

  it('rejects a non-EVTX file with the EVTX extension cleanly', async () => {
    await expect(ingest(blob(new TextEncoder().encode('hello')), { format: 'evtx' })).rejects.toThrow(/Not an EVTX/)
  })

  it('cancellation stops between chunks', async () => {
    const file = buildEvtx(Array.from({ length: 5 }, (_, i) => [ev(4624, i, { TargetUserName: 'u' })]))
    let n = 0
    expect(await ingest(blob(file), { isCancelled: () => ++n > 2 })).toBeNull()
  })

  it('evtxJsonToFlat handles the crate JSON shapes (#text values, UserData wrappers, attributes)', () => {
    const f = evtxJsonToFlat({ Event: { System: { EventID: { '#attributes': { Qualifiers: 16384 }, '#text': 7045 }, Computer: 'H', Channel: 'System',
      TimeCreated: { '#attributes': { SystemTime: T } }, Execution: { '#attributes': { ProcessID: 4 } } },
      UserData: { LogFileCleared: { SubjectUserName: 'x', SubjectLogonId: '0x1' } } } })
    expect(f).toMatchObject({ EventID: 7045, Computer: 'H', Channel: 'System', TimeCreated: T, ExecutionProcessID: 4, SubjectUserName: 'x', SubjectLogonId: '0x1' })
    expect(evtxJsonToFlat({})).toBeNull()
  })
})

describe('embedded WASM integrity & scale', () => {
  it('embedded bytes match the recorded SHA-256 and are a valid WebAssembly module', () => {
    const bytes = Buffer.from(WASM_BASE64, 'base64')
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(WASM_SHA256)
    expect(WebAssembly.validate(bytes)).toBe(true)
  })
  it('streams many chunks with bounded memory', async () => {
    const chunks = Array.from({ length: 300 }, (_, c) => Array.from({ length: 40 }, (_, i) => ev(4625, c * 40 + i, { TargetUserName: `u${i}`, IpAddress: '203.0.113.9', LogonType: '3' })))
    const file = buildEvtx(chunks)
    const before = process.memoryUsage().heapUsed
    const t0 = performance.now()
    const s = await ingest(blob(file), {})
    const secs = (performance.now() - t0) / 1000
    console.log(`EVTX: ${(file.length / 1e6).toFixed(1)} MB, ${s!.parsedEvents} events in ${secs.toFixed(2)}s`)
    expect(s!.parsedEvents).toBe(12000)
    expect(s!.rejected).toBe(0)
    expect((process.memoryUsage().heapUsed - before) / 1e6).toBeLessThan(100)
  })
})
