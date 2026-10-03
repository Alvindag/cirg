import fs from "node:fs";
import path from "node:path";

import { chainHash, GENESIS } from "@/lib/rtm/hashchain";
import type { AuditEntry, DB } from "./model";
import { auditPayload, emptyDb, seedDb } from "./seed";

/**
 * Storage for the built-in backend.
 *
 * Two back ends, chosen by environment:
 *   DATABASE_URL set   PostgreSQL. The whole data set is one JSON document in the
 *                      table crm_state, with a version number. Every request loads
 *                      the latest version, runs, and writes back only if nobody else
 *                      wrote in between (otherwise it re-runs on the new data).
 *   otherwise          one JSON file, for development and demos.
 *
 * Handlers stay synchronous: they call getDb() and save(). The async parts
 * (loading and writing) happen around them in withDb(), so every entry point
 * that touches data (the API, the sign-in callback) must go through withDb().
 *
 * One document per organisation is fine for a pilot (tens of users, thousands of
 * records). It is not a relational schema; see docs/azure-deployment.md.
 */

const VERSION = 1;

/** The small part of a Postgres client the store needs. pg and PGlite both fit. */
export interface SqlClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

type Holder = {
  db?: DB;
  /** Row version the in-memory copy was read at (Postgres only). */
  version?: number;
  dirty?: boolean;
  sql?: SqlClient;
  ready?: Promise<void>;
  lock?: Promise<unknown>;
};
const g = globalThis as unknown as { __crmStore?: Holder };
const holder: Holder = (g.__crmStore ??= {});

/* ---------------- file back end ---------------- */

const FILE = () => process.env.CRM_DATA_FILE ?? path.join(process.cwd(), ".data", "crm-db.json");

function loadFile(): DB {
  try {
    const db = JSON.parse(fs.readFileSync(FILE(), "utf8")) as DB;
    if (db.version === VERSION) return db;
  } catch {
    /* no file yet, or unreadable: start from sample data */
  }
  const db = seedDb();
  writeFile(db);
  return db;
}

function writeFile(db: DB) {
  try {
    fs.mkdirSync(path.dirname(FILE()), { recursive: true });
    const tmp = `${FILE()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, FILE());
  } catch {
    /* read-only disk: keep working in memory */
  }
}

/* ---------------- PostgreSQL back end ---------------- */

export const usesPostgres = () => !!holder.sql || !!process.env.DATABASE_URL;

async function client(): Promise<SqlClient> {
  if (holder.sql) return holder.sql;
  const { Pool } = await import("pg");
  const url = process.env.DATABASE_URL!;
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  // Azure Database for PostgreSQL requires TLS. Verify the server certificate unless told not to.
  const ssl = process.env.DATABASE_SSL === "false" || local ? undefined : { rejectUnauthorized: process.env.DATABASE_SSL_VERIFY !== "false" };
  const pool = new Pool({ connectionString: url, ssl, max: 5, connectionTimeoutMillis: 10_000 });
  holder.sql = pool as unknown as SqlClient;
  return holder.sql;
}

/** For tests: use this client instead of connecting from DATABASE_URL. */
export function useSqlClient(c: SqlClient) {
  holder.sql = c;
  holder.ready = undefined;
  holder.db = undefined;
}

async function init(): Promise<void> {
  const sql = await client();
  await sql.query(`CREATE TABLE IF NOT EXISTS crm_state (
    id integer PRIMARY KEY CHECK (id = 1),
    version bigint NOT NULL,
    data jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  // A fresh production database starts empty (the first administrator is created at sign-in).
  // Sample data is opt-in there, and the default elsewhere.
  const sample = process.env.SEED_SAMPLE_DATA ? process.env.SEED_SAMPLE_DATA === "true" : process.env.NODE_ENV !== "production";
  const first = sample ? seedDb() : emptyDb();
  await sql.query("INSERT INTO crm_state (id, version, data) VALUES (1, 1, $1) ON CONFLICT (id) DO NOTHING", [JSON.stringify(first)]);
}

async function refresh(): Promise<void> {
  const sql = await client();
  const cur = await sql.query("SELECT version FROM crm_state WHERE id = 1");
  const v = Number(cur.rows[0]?.version);
  if (holder.db && holder.version === v) return;
  const r = await sql.query("SELECT version, data FROM crm_state WHERE id = 1");
  holder.version = Number(r.rows[0].version);
  holder.db = r.rows[0].data as DB;
}

class Conflict extends Error {}

async function flush(): Promise<void> {
  const sql = await client();
  const r = await sql.query("UPDATE crm_state SET data = $1, version = version + 1, updated_at = now() WHERE id = 1 AND version = $2", [JSON.stringify(holder.db), holder.version]);
  if (!r.rowCount) throw new Conflict();
  holder.version = (holder.version ?? 0) + 1;
}

/**
 * Runs `fn` with up-to-date data, and saves what it changed.
 * Requests in one process run one at a time. Across processes, a write that
 * lost a race is thrown away and `fn` runs again on the newer data (up to 4 tries).
 */
export async function withDb<T>(fn: () => Promise<T> | T): Promise<T> {
  if (!usesPostgres()) return fn();
  const run = async (): Promise<T> => {
    holder.ready ??= init();
    await holder.ready;
    for (let attempt = 0; ; attempt++) {
      await refresh();
      holder.dirty = false;
      const out = await fn();
      if (!holder.dirty) return out;
      try {
        await flush();
        holder.dirty = false;
        return out;
      } catch (e) {
        holder.db = undefined; // drop the unsaved changes, reload, and run again
        if (!(e instanceof Conflict) || attempt >= 3) throw e;
      }
    }
  };
  const prev = holder.lock ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(run);
  holder.lock = next;
  return next;
}

/* ---------------- shared API ---------------- */

export function getDb(): DB {
  if (holder.db) return holder.db;
  if (usesPostgres()) throw new Error("Data was used outside withDb().");
  return (holder.db = loadFile());
}

/** Records that the data changed. It is written when the surrounding withDb() ends. */
export function save() {
  holder.dirty = true;
  if (!usesPostgres() && holder.db) writeFile(holder.db);
}

/** Replaces all data with fresh sample data. */
export function resetDb(): DB {
  holder.db = seedDb();
  save();
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
  holder.dirty = true;
}
