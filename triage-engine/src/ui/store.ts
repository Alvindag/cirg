import { create } from 'zustand'
import ingestWorkerUrl from '../workers/ingest.worker.ts?worker&url'
import { createIngestWorker } from './trustedWorker'
import type { FromWorker, IngestSummary, ToWorker } from '../core/types'

type Phase = 'idle' | 'running' | 'done' | 'error'
interface State {
  phase: Phase
  fileName: string
  bytes: number
  total: number
  events: number
  rejected: number
  summary: IngestSummary | null
  error: string | null
  start(file: File): void
  cancel(): void
  clear(): void
}

let worker: Worker | null = null

function killWorker() {
  if (!worker) return
  try { worker.postMessage({ type: 'destroy' } satisfies ToWorker) } catch { /* ignore */ }
  worker.terminate()
  worker = null
}

const initial = { phase: 'idle' as Phase, fileName: '', bytes: 0, total: 0, events: 0, rejected: 0, summary: null, error: null }

export const useStore = create<State>((set) => ({
  ...initial,
  start(file) {
    killWorker()
    worker = createIngestWorker(new URL(ingestWorkerUrl, self.location.href))
    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data
      if (m.type === 'progress') set({ bytes: m.bytes, total: m.total, events: m.events, rejected: m.rejected })
      else if (m.type === 'done') { set({ phase: 'done', summary: m.summary }); killWorker() }
      else if (m.type === 'cancelled') { set({ ...initial }); killWorker() }
      else if (m.type === 'error') { set({ phase: 'error', error: m.message }); killWorker() }
    }
    worker.onerror = (e) => { set({ phase: 'error', error: `Worker crashed: ${e.message || 'unknown error'}` }); killWorker() }
    set({ ...initial, phase: 'running', fileName: file.name, total: file.size })
    worker.postMessage({ type: 'start', file } satisfies ToWorker)
  },
  cancel() { worker?.postMessage({ type: 'cancel' } satisfies ToWorker) },
  clear() { killWorker(); set({ ...initial }) }, // drops summary + sample -> eligible for GC
}))

// Tab close / navigation: make sure nothing lingers.
if (typeof window !== 'undefined') window.addEventListener('pagehide', killWorker)
