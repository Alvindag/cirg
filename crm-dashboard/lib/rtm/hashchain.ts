import { createHash } from "node:crypto";

/**
 * Tamper-evident records: each entry stores the hash of the previous one, so
 * changing or removing any earlier entry breaks every hash after it.
 * (ALCOA+: records stay attributable, original and enduring.)
 */
export const GENESIS = "0".repeat(64);

export function chainHash(prevHash: string, payload: unknown): string {
  return createHash("sha256")
    .update(prevHash)
    .update(JSON.stringify(payload))
    .digest("hex");
}

export type Chained = { hash: string; prevHash: string };

/** Re-computes every hash; returns the index of the first broken entry, or -1 if intact. */
export function verifyChain<T extends Chained>(
  entries: T[],
  payloadOf: (e: T) => unknown
): number {
  let prev = GENESIS;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.prevHash !== prev || e.hash !== chainHash(prev, payloadOf(e))) return i;
    prev = e.hash;
  }
  return -1;
}
