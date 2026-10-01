import Papa from 'papaparse'
import type { FlatRecord, ParseHooks } from '../core/types'

/**
 * Streaming CSV via PapaParse `chunk` mode (runs inside our worker; Papa's own blob worker is NOT used,
 * which keeps `worker-src 'self'` CSP intact). Accepts a File in browsers or a string in tests.
 */
export async function parseCsv(source: Blob | string, hooks: ParseHooks, chunkSize = 4 * 1024 * 1024): Promise<void> {
  // Browsers/workers always have FileReader (true streaming). Non-browser test runners fall back to a string.
  if (typeof source !== 'string' && typeof FileReader === 'undefined') source = await source.text()
  const src = source
  return new Promise((resolve, reject) => {
    Papa.parse<FlatRecord>(src as never, {
      header: true,
      skipEmptyLines: 'greedy',
      chunkSize,
      transformHeader: (h: string) => h.replace(/^﻿/, '').trim(),
      chunk: (res: Papa.ParseResult<FlatRecord>, parser: Papa.Parser) => {
        if (hooks.isCancelled()) { parser.abort(); return }
        for (const row of res.data) hooks.onRecord(row)
        hooks.onBytes(res.meta.cursor)
      },
      complete: () => resolve(),
      error: (e: Error) => reject(e),
    } as never)
  })
}
