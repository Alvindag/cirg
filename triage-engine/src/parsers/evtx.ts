import type { FlatRecord, ParseHooks } from '../core/types'

const FILE_HEADER = 4096
const CHUNK = 65536
const CHUNK_MAGIC = [0x45, 0x6c, 0x66, 0x43, 0x68, 0x6e, 0x6b, 0x00] // "ElfChnk\0"

type WasmApi = { parse_chunk(d: Uint8Array): string }
let wasm: Promise<WasmApi> | null = null

/** Lazy-load + instantiate the embedded WASM (no fetch: bytes are bundled; CSP keeps connect-src 'none'). */
function loadWasm(): Promise<WasmApi> {
  wasm ??= (async () => {
    const [glue, bytes] = await Promise.all([import('../evtx/evtx_wasm.generated.js'), import('../evtx/wasmBytes.generated')])
    const bin = atob(bytes.WASM_BASE64)
    const u8 = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
    glue.initSync({ module: u8 })
    return glue as unknown as WasmApi
  })()
  return wasm
}

/** Release the module reference (the WASM instance's memory is reclaimed with the worker). */
export function unloadEvtx() { wasm = null }

const val = (v: unknown): unknown => (v && typeof v === 'object' && !Array.isArray(v) && '#text' in v ? (v as Record<string, unknown>)['#text'] : v)

function flattenInto(src: unknown, out: FlatRecord, depth = 0) {
  if (!src || typeof src !== 'object' || Array.isArray(src) || depth > 5) return
  for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
    if (k === '#attributes') continue
    const x = val(v)
    if (x !== null && typeof x === 'object') flattenInto(x, out, depth + 1) // UserData wrappers (e.g. LogFileCleared)
    else if (!(k in out)) out[k] = x
  }
}

/** Convert the evtx crate's JSON rendering of one event into the flat key/value shape the normalizer expects. */
export function evtxJsonToFlat(doc: unknown): FlatRecord | null {
  const ev = (doc as { Event?: Record<string, unknown> } | null)?.Event
  if (!ev || typeof ev !== 'object') return null
  const sys = (ev['System'] ?? {}) as Record<string, unknown>
  const attrs = (n: string) => ((sys[n] as { '#attributes'?: Record<string, unknown> } | undefined)?.['#attributes'] ?? {})
  const rec: FlatRecord = {
    EventID: val(sys['EventID']),
    TimeCreated: attrs('TimeCreated')['SystemTime'],
    Computer: val(sys['Computer']),
    Channel: val(sys['Channel']),
    EventRecordID: val(sys['EventRecordID']),
    ExecutionProcessID: attrs('Execution')['ProcessID'],
  }
  flattenInto(ev['EventData'], rec)
  flattenInto(ev['UserData'], rec)
  return rec
}

/** Stream an .evtx file chunk by chunk (64 KiB each) through the WASM parser. */
export async function parseEvtx(file: Blob, hooks: ParseHooks): Promise<void> {
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer())
  if (String.fromCharCode(...head.subarray(0, 7)) !== 'ElfFile') throw new Error('Not an EVTX file (missing ElfFile signature)')
  const api = await loadWasm()
  for (let off = FILE_HEADER; off + CHUNK <= file.size; off += CHUNK) {
    if (hooks.isCancelled()) return
    const buf = new Uint8Array(await file.slice(off, off + CHUNK).arrayBuffer())
    hooks.onBytes(off + CHUNK)
    if (!CHUNK_MAGIC.every((b, i) => buf[i] === b)) continue // unused / zeroed chunk slot
    let text: string
    try { text = api.parse_chunk(buf) } catch { hooks.onRecord({ __malformed: true }); continue }
    for (const line of text.split('\n')) {
      if (!line) continue
      let doc: unknown
      try { doc = JSON.parse(line) } catch { hooks.onRecord({ __malformed: true }); continue }
      hooks.onRecord(evtxJsonToFlat(doc) ?? { __malformed: true })
    }
  }
}
