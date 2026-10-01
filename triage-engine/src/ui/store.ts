import { create } from 'zustand'
import ingestWorkerUrl from '../workers/ingest.worker.ts?worker&url'
import { buildRules, type AnalysisResult, type PackInput, type RuleLoadReport } from '../core/analysis'
import type { FromWorker, ToWorker } from '../core/types'
import { createIngestWorker } from './trustedWorker'

type Phase = 'idle' | 'running' | 'done' | 'error'
export interface CustomPack extends PackInput { report: RuleLoadReport }

interface State {
  phase: Phase
  fileName: string
  bytes: number
  total: number
  events: number
  rejected: number
  result: AnalysisResult | null
  error: string | null
  customPacks: CustomPack[]
  start(file: File): void
  cancel(): void
  clear(): void
  addPack(name: string, text: string): void
  removePack(name: string): void
}

let worker: Worker | null = null

function killWorker() {
  if (!worker) return
  try { worker.postMessage({ type: 'destroy' } satisfies ToWorker) } catch { /* ignore */ }
  worker.terminate()
  worker = null
}

const run = { phase: 'idle' as Phase, fileName: '', bytes: 0, total: 0, events: 0, rejected: 0, result: null, error: null }

export const useStore = create<State>((set, get) => ({
  ...run,
  customPacks: [],
  start(file) {
    killWorker()
    worker = createIngestWorker(new URL(ingestWorkerUrl, self.location.href))
    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data
      if (m.type === 'progress') set({ bytes: m.bytes, total: m.total, events: m.events, rejected: m.rejected })
      else if (m.type === 'done') { set({ phase: 'done', result: m.result }); killWorker() }
      else if (m.type === 'cancelled') { set({ ...run }); killWorker() }
      else if (m.type === 'error') { set({ phase: 'error', error: m.message }); killWorker() }
    }
    worker.onerror = (e) => { set({ phase: 'error', error: `Worker crashed: ${e.message || 'unknown error'}` }); killWorker() }
    set({ ...run, phase: 'running', fileName: file.name, total: file.size })
    const packs = get().customPacks.map(({ name, text, format }) => ({ name, text, format }))
    worker.postMessage({ type: 'start', file, packs } satisfies ToWorker)
  },
  cancel() { worker?.postMessage({ type: 'cancel' } satisfies ToWorker) },
  // Drops results/evidence (eligible for GC). Rule packs are configuration, not log data, and are kept in memory only.
  clear() { killWorker(); set({ ...run }) },
  addPack(name, text) {
    const format = /\.ya?ml$/i.test(name) ? 'yaml' : 'json'
    const { report } = buildRules([{ name, text, format }])
    const rest = get().customPacks.filter((p) => p.name !== name)
    set({ customPacks: [...rest, { name, text, format, report }] })
  },
  removePack(name) { set({ customPacks: get().customPacks.filter((p) => p.name !== name) }) },
}))

// Tab close / navigation: make sure nothing lingers.
if (typeof window !== 'undefined') window.addEventListener('pagehide', killWorker)
