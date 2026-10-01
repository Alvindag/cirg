import { createHash, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { Sha256, sha256Blob, sha256Hex } from '../src/core/hash/sha256'

const ref = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')

describe('SHA-256', () => {
  it('matches the FIPS 180-4 test vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1')
  })
  it('agrees with node:crypto for every length around the padding boundaries', () => {
    for (let n = 0; n <= 200; n++) { const b = randomBytes(n); expect(sha256Hex(b), `len ${n}`).toBe(ref(b)) }
  })
  it('is independent of how the input is split into chunks', () => {
    const data = randomBytes(10_000)
    for (const size of [1, 3, 55, 56, 63, 64, 65, 1000, 9999]) {
      const h = new Sha256()
      for (let i = 0; i < data.length; i += size) h.update(data.subarray(i, i + size))
      expect(h.digest(), `chunk ${size}`).toBe(ref(data))
    }
  })
  it('hashes a large Blob by streaming and supports cancellation', async () => {
    const data = randomBytes(5_000_000)
    expect(await sha256Blob(new Blob([data]))).toBe(ref(data))
    let calls = 0
    expect(await sha256Blob(new Blob([data]), undefined, () => ++calls > 1)).toBeNull()
  })
})
