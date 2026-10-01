// Minimal EVTX writer used for tests/e2e. It emits structurally valid EVTX (file header, chunks, records, BinXML)
// with inline names and no templates. It is NOT a substitute for real Windows-generated files.
const CHUNK = 65536, FILE_HEADER = 4096, REC_HDR = 24
const EPOCH_DIFF_MS = 11644473600000n

class W {
  constructor(buf, pos) { this.buf = buf; this.dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength); this.pos = pos }
  u8(v) { this.dv.setUint8(this.pos, v); this.pos += 1 }
  u16(v) { this.dv.setUint16(this.pos, v, true); this.pos += 2 }
  u32(v) { this.dv.setUint32(this.pos, v, true); this.pos += 4 }
  u64(v) { this.dv.setBigUint64(this.pos, BigInt(v), true); this.pos += 8 }
  utf16(s) { for (let i = 0; i < s.length; i++) this.u16(s.charCodeAt(i)) }
}

/** Writes BinXML into a chunk buffer at an absolute chunk offset (name offsets are chunk-relative). */
class XmlWriter extends W {
  nameRef(name) {
    this.u32(this.pos + 4)            // offset of the inline name node = right after this field
    this.u32(0); this.u16(0)           // next-string link + hash (not validated for chunk names)
    this.u16(name.length); this.utf16(name); this.u16(0)
  }
  value(text) { this.u8(0x05); this.u8(0x01); this.u16(text.length); this.utf16(text) }
  /** attrs: [name, value][]; body: () => void; empty => <el attrs/> */
  el(name, attrs, body) {
    const hasAttrs = attrs.length > 0
    this.u8(hasAttrs ? 0x41 : 0x01)
    const sizeAt = this.pos; this.u32(0)
    const startData = this.pos
    this.nameRef(name)
    if (hasAttrs) {
      const listAt = this.pos; this.u32(0)
      const a0 = this.pos
      for (const [n, v] of attrs) { this.u8(0x06); this.nameRef(n); this.value(v) }
      this.dv.setUint32(listAt, this.pos - a0, true)
    }
    if (!body) { this.u8(0x03) } else { this.u8(0x02); body(); this.u8(0x04) }
    this.dv.setUint32(sizeAt, this.pos - startData, true)
  }
  text(name, t) { this.el(name, [], () => this.value(String(t))) }
}

function writeRecord(chunk, pos, recId, ev) {
  const w = new XmlWriter(chunk, pos)
  w.u32(0x00002a2a); const sizeAt = w.pos; w.u32(0); w.u64(recId)
  const ft = (BigInt(new Date(ev.time).getTime()) + EPOCH_DIFF_MS) * 10000n
  w.u64(ft)
  w.u8(0x0f); w.u8(1); w.u8(1); w.u8(0)
  w.el('Event', [['xmlns', 'http://schemas.microsoft.com/win/2004/08/events/event']], () => {
    w.el('System', [], () => {
      w.el('Provider', [['Name', ev.provider ?? 'Microsoft-Windows-Security-Auditing']])
      w.text('EventID', ev.eventId)
      w.el('TimeCreated', [['SystemTime', new Date(ev.time).toISOString().replace('Z', '000Z')]])
      w.text('EventRecordID', recId)
      w.el('Execution', [['ProcessID', '4'], ['ThreadID', '8']])
      w.text('Channel', ev.channel ?? 'Security')
      w.text('Computer', ev.computer)
    })
    w.el('EventData', [], () => { for (const [k, v] of Object.entries(ev.data ?? {})) w.el('Data', [['Name', k]], () => w.value(String(v))) })
  })
  w.u8(0x00)
  const size = w.pos - pos + 4
  w.u32(size)
  w.dv.setUint32(sizeAt, size, true)
  return w.pos
}

/** chunks: array of arrays of events {eventId, time, computer, channel?, data?}. Returns a Uint8Array .evtx file. */
export function buildEvtx(chunks) {
  const out = new Uint8Array(FILE_HEADER + chunks.length * CHUNK)
  const h = new W(out, 0)
  for (const c of 'ElfFile\0') h.u8(c.charCodeAt(0))
  h.u64(0); h.u64(Math.max(0, chunks.length - 1)); h.u64(chunks.flat().length + 1)
  h.u32(128); h.u16(1); h.u16(3); h.u16(FILE_HEADER); h.u16(chunks.length)
  let recId = 1
  chunks.forEach((events, ci) => {
    const base = FILE_HEADER + ci * CHUNK
    const chunk = out.subarray(base, base + CHUNK)
    const w = new W(chunk, 0)
    for (const c of 'ElfChnk\0') w.u8(c.charCodeAt(0))
    const first = recId
    let pos = 512, last = 512
    for (const ev of events) {
      if (pos + 2048 > CHUNK) throw new Error('evtxBuilder: too many events for one 64 KiB chunk (about 40 max); split them across chunks')
      last = pos; pos = writeRecord(chunk, pos, recId++, ev)
    }
    w.u64(first); w.u64(Math.max(first, recId - 1)); w.u64(first); w.u64(Math.max(first, recId - 1)) // record numbers + ids
    w.u32(128); w.u32(last); w.u32(pos)                                                               // header size, last record offset, free space
    w.pos = 120; w.u32(0x4)                                                                          // flags: NO_CRC32 (checksums not computed)
  })
  return out
}
