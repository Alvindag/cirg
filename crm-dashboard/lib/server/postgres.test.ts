import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

process.env.SEED_SAMPLE_DATA = "false";
process.env.CRM_DATA_FILE = "/nonexistent/should-not-be-used.json";

import { getDb, logAudit, save, useSqlClient, withDb, type SqlClient } from "./store";

let pg: PGlite;
const adapter = (p: PGlite): SqlClient => ({
  async query(sql, params) {
    const r = await p.query(sql, params as unknown[]);
    return { rows: r.rows as Record<string, unknown>[], rowCount: r.affectedRows ?? r.rows.length };
  },
});

beforeAll(async () => {
  pg = new PGlite();
  useSqlClient(adapter(pg));
});

describe("PostgreSQL store", () => {
  it("starts empty when sample data is off", async () => {
    const n = await withDb(() => getDb().users.length + getDb().customers.length);
    expect(n).toBe(0);
  });

  it("saves changes and a new process sees them", async () => {
    await withDb(() => { logAudit(null, "Test", "Thing", "1"); save(); });
    useSqlClient(adapter(pg)); // simulates a restart: nothing cached
    expect(await withDb(() => getDb().audit.length)).toBe(1);
  });

  it("does not write when nothing changed", async () => {
    const before = (await pg.query<{ version: string }>("SELECT version FROM crm_state")).rows[0].version;
    await withDb(() => getDb().users.length);
    const after = (await pg.query<{ version: string }>("SELECT version FROM crm_state")).rows[0].version;
    expect(after).toBe(before);
  });

  it("re-runs on newer data when another process wrote first", async () => {
    let runs = 0;
    await withDb(async () => {
      runs++;
      if (runs === 1) {
        // another instance writes between our read and our write
        await pg.query("UPDATE crm_state SET version = version + 1, data = jsonb_set(data, '{notifications}', '[{\"id\":\"x\"}]')");
      }
      logAudit(null, "Race", "Thing", "2");
      save();
    });
    expect(runs).toBe(2);
    const d = await withDb(() => getDb());
    expect(d.notifications).toHaveLength(1); // the other writer's change survived
    expect(d.audit.map((a) => a.action)).toEqual(["Test", "Race"]);
  });

  it("keeps the audit hash chain intact across saves", async () => {
    const d = await withDb(() => getDb());
    for (let i = 1; i < d.audit.length; i++) expect(d.audit[i].prevHash).toBe(d.audit[i - 1].hash);
  });

  it("runs overlapping requests one at a time without losing writes", async () => {
    await Promise.all(Array.from({ length: 5 }, (_, i) => withDb(() => { logAudit(null, `P${i}`, "Thing", String(i)); save(); })));
    const n = await withDb(() => getDb().audit.filter((a) => a.action.startsWith("P")).length);
    expect(n).toBe(5);
  });
});
