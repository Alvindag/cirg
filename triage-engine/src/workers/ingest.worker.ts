/// <reference lib="webworker" />
import { ingest } from '../core/ingest'
import type { FromWorker, ToWorker } from '../core/types'

let cancelled = false
let running = false
const post = (m: FromWorker) => (self as unknown as Worker).postMessage(m)

self.onmessage = async (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data
  if (msg.type === 'cancel') { cancelled = true; return }
  if (msg.type === 'destroy') { cancelled = true; self.close(); return }
  if (msg.type !== 'start' || running) return
  running = true
  cancelled = false
  let file: File | null = msg.file
  try {
    const total = file.size
    const summary = await ingest(file, {
      isCancelled: () => cancelled,
      onProgress: (p) => post({ type: 'progress', total, ...p }),
    })
    post(summary ? { type: 'done', summary } : { type: 'cancelled' })
  } catch (e) {
    post({ type: 'error', message: e instanceof Error ? e.message : 'Unknown ingest error' })
  } finally {
    file = null // drop the only reference to the File handle
    running = false
  }
}
