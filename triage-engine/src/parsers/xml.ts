import { SaxesParser } from 'saxes'
import type { FlatRecord, ParseHooks } from '../core/types'
import { textChunks } from './chunks'

/** Streaming SAX parser for Windows Event XML (`<Event>` or `<Events><Event>…`). No DOM is built. */
export async function parseXml(file: Blob, hooks: ParseHooks): Promise<void> {
  const p = new SaxesParser({ xmlns: false, fragment: true })
  let rec: FlatRecord | null = null
  let stack: string[] = []
  let text = ''
  let dataName: string | null = null

  p.on('opentag', (t) => {
    const name = t.name
    stack.push(name)
    text = ''
    if (name === 'Event') rec = {}
    else if (rec) {
      if (name === 'TimeCreated' && t.attributes['SystemTime']) rec['TimeCreated'] = String(t.attributes['SystemTime'])
      else if (name === 'Execution' && t.attributes['ProcessID']) rec['ExecutionProcessID'] = String(t.attributes['ProcessID'])
      else if (name === 'Data') dataName = t.attributes['Name'] ? String(t.attributes['Name']) : null
    }
  })
  p.on('text', (t) => { if (text.length < 65536) text += t })
  p.on('closetag', (t) => {
    const name = t.name
    stack.pop()
    if (rec) {
      if (name === 'Event') { const r = rec; rec = null; hooks.onRecord(r) }
      else if (name === 'Data' && dataName) { if (!(dataName in rec)) rec[dataName] = text.trim(); dataName = null }
      else if (['EventID', 'Computer', 'Channel', 'EventRecordID'].includes(name)) rec[name] = text.trim()
    }
    text = ''
  })
  // Malformed XML: stop cleanly; records emitted so far are kept.
  let fatal: Error | null = null
  p.on('error', (e) => { fatal = e })

  for await (const chunk of textChunks(file, hooks.onBytes, hooks.isCancelled)) {
    p.write(chunk)
    if (fatal) throw new Error(`XML parse error: ${(fatal as Error).message}`)
  }
  p.close()
  stack = []
}
