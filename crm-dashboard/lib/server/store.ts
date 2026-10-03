import fs from "node:fs";
import path from "node:path";

import { chainHash, GENESIS } from "@/lib/rtm/hashchain";
import type { AuditEntry, DB } from "./model";
import { auditPayload, seedDb } from "./seed";

/**
 * File-backed store for the built-in backend. The whole database is one JSON
 * file, loaded once per server process and written after each change. That
 * suits a demo or a single-instance pilot; a hosted multi-instance deployment
 * should point DAS_API_BASE_URL at the real DAS Engage 360 API instead.
 */
const FILE = process.env.CRM_DATA_FILE ?? path.join(process.cwd(), ".data", "crm-db.json");
const VERSION = 1;

type Holder = { db?: DB };
const g = globalThis as unknown as { __crmStore?: Holder };
const holder: Holder = (g.__crmStore ??= {});

function load(): DB {
  try {
    const db = JSON.parse(fs.readFileSync(FILE, "utf8")) as DB;
    if (db.version === VERSION) return db;
  } catch {
    /* no file yet, or unreadable: start from sample data */
  }
  const db = seedDb();
  persist(db);
  return db;
}

function persist(db: DB) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, FILE);
  } catch {
    /* read-only disk: keep working in memory */
  }
}

export function getDb(): DB {
  return (holder.db ??= load());
}

/** Writes the current state to disk. Call after any change. */
export function save() {
  if (holder.db) persist(holder.db);
}

/** Replaces all data with fresh sample data. */
export function resetDb(): DB {
  holder.db = seedDb();
  persist(holder.db);
  return holder.db;
}

/** Appends a hash-chained entry to the audit trail. */
export function logAudit(
  userId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  changes?: unknown,
  reason?: string | null,
) {
  const db = getDb();
  const last = db.audit[db.audit.length - 1];
  const base: Omit<AuditEntry, "prevHash" | "hash"> = {
    id: (last?.id ?? 0) + 1,
    userId,
    at: new Date().toISOString(),
    action,
    entityType,
    entityId,
    changes: changes === undefined ? null : JSON.stringify(changes),
    reason: reason ?? null,
  };
  const prevHash = last?.hash ?? GENESIS;
  db.audit.push({ ...base, prevHash, hash: chainHash(prevHash, auditPayload(base)) });
}
