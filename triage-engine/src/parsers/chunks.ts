/** Read a Blob as decoded text chunks, reporting bytes consumed. Never materializes the whole file. */
export async function* textChunks(
  blob: Blob,
  onBytes: (n: number) => void,
  isCancelled: () => boolean,
): AsyncGenerator<string> {
  const reader = blob.stream().getReader()
  const dec = new TextDecoder('utf-8', { fatal: false })
  let bytes = 0
  try {
    for (;;) {
      if (isCancelled()) return
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      onBytes(bytes)
      const text = dec.decode(value, { stream: true })
      if (text) yield text
    }
    const tail = dec.decode()
    if (tail) yield tail
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}
