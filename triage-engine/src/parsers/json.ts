import type { FlatRecord, ParseHooks } from '../core/types'
import { textChunks } from './chunks'

/**
 * Streaming splitter for NDJSON and top-level JSON arrays.
 * Tracks brace depth outside strings and emits each top-level object as soon as it closes,
 * so memory is bounded by the largest single record, not the file.
 */
export class ObjectSplitter {
  private depth = 0
  private inStr = false
  private esc = false
  private base = -1 // depth at which record objects open (0 = NDJSON, 1 = inside top-level array)
  private parts: string[] = []
  private recStart = -1

  constructor(private emit: (json: string) => void, private maxRecordChars = 8_000_000) {}

  write(chunk: string) {
    let start = this.recStart >= 0 ? 0 : -1
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk.charCodeAt(i)
      if (this.inStr) {
        if (this.esc) this.esc = false
        else if (ch === 92) this.esc = true
        else if (ch === 34) this.inStr = false
        continue
      }
      if (ch === 34) { this.inStr = true; continue }
      if (ch === 91 /* [ */) {
        if (this.base < 0 && this.depth === 0) this.base = 1
        this.depth++
      } else if (ch === 123 /* { */) {
        if (this.base < 0) this.base = 0
        if (this.depth === this.base) { start = i; this.recStart = i; this.parts = [] }
        this.depth++
      } else if (ch === 125 /* } */ || ch === 93 /* ] */) {
        this.depth--
        if (ch === 125 && this.depth === this.base && this.recStart >= 0) {
          this.parts.push(chunk.slice(start, i + 1))
          const json = this.parts.join('')
          this.parts = []; this.recStart = -1; start = -1
          this.emit(json)
        }
        if (this.depth < 0) this.depth = 0
      }
    }
    if (this.recStart >= 0) {
      this.parts.push(chunk.slice(Math.max(start, 0)))
      this.recStart = 0 // continuing in next chunk from offset 0
      let size = 0
      for (const p of this.parts) size += p.length
      if (size > this.maxRecordChars) throw new Error('JSON record exceeds size limit (possible malformed input)')
    }
  }
}

export async function parseJson(file: Blob, hooks: ParseHooks): Promise<void> {
  const splitter = new ObjectSplitter((json) => {
    try {
      hooks.onRecord(JSON.parse(json) as FlatRecord)
    } catch {
      hooks.onRecord({ __malformed: true })
    }
  })
  for await (const chunk of textChunks(file, hooks.onBytes, hooks.isCancelled)) splitter.write(chunk)
}
