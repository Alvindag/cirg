import type { LogFormat } from '../core/types'

/** Detect format from magic bytes / first significant character (extension is only a tiebreaker). */
export async function sniffFormat(file: Blob, name = ''): Promise<LogFormat> {
  const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer())
  if (head.length >= 7 && String.fromCharCode(...head.subarray(0, 7)) === 'ElfFile') return 'evtx'
  let text = new TextDecoder().decode(head).replace(/^﻿/, '').trimStart()
  const c = text[0]
  if (c === '<') return 'xml'
  if (c === '{' || c === '[') return 'json'
  const ext = name.toLowerCase().split('.').pop()
  if (ext === 'xml') return 'xml'
  if (ext === 'json' || ext === 'ndjson' || ext === 'jsonl') return 'json'
  return 'csv'
}
