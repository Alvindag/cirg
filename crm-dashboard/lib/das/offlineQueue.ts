/**
 * Visits recorded without a connection wait here, on this device, until they
 * can be uploaded. Each carries a clientId made on the device, so the server
 * can tell a retry from a new visit and never saves one twice.
 */
export interface QueuedVisit {
  clientId: string;
  customerId: string;
  customerName: string;
  at: string;
  kind: "Visit" | "Call";
  outcome: string;
  notes: string | null;
  durationMin: number | null;
  productIds: string[];
  latitude: number | null;
  longitude: number | null;
  /** Set when the server refused it, so it is kept for the person to look at. */
  error?: string;
}

const key = (userId: string) => `das.visitQueue.${userId}`;

export function loadQueue(userId: string): QueuedVisit[] {
  try {
    const raw = localStorage.getItem(key(userId));
    return raw ? (JSON.parse(raw) as QueuedVisit[]) : [];
  } catch {
    return [];
  }
}

export function saveQueue(userId: string, items: QueuedVisit[]) {
  try {
    if (items.length) localStorage.setItem(key(userId), JSON.stringify(items));
    else localStorage.removeItem(key(userId));
  } catch {
    /* storage full or blocked: the caller still has the items in memory */
  }
}

export const newClientId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** True for failures that mean "no connection" rather than "the server said no". */
export const isNetworkError = (e: unknown) => e instanceof TypeError;

export interface SyncOutcome {
  clientId: string;
  ok: boolean;
  duplicate?: boolean;
  error?: string;
}

/** Given the queue and the server's per-visit results, returns what is left to keep. */
export function applySyncResults(queue: QueuedVisit[], results: SyncOutcome[]): QueuedVisit[] {
  const by = new Map(results.map((r) => [r.clientId, r]));
  return queue.flatMap((q) => {
    const r = by.get(q.clientId);
    if (!r) return [q];
    if (r.ok) return [];
    return [{ ...q, error: r.error ?? "Refused by the server" }];
  });
}
