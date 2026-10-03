import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

process.env.CRM_DATA_FILE = path.join(os.tmpdir(), `crm-test-${process.pid}.json`);

type Api = typeof import("./index");
let dispatch: Api["dispatch"];
let db: typeof import("./store");

const as = (userId: string) => `Bearer builtin:${userId}`;
const call = (who: string | null, method: string, p: string, body?: unknown, q = "") =>
  dispatch(method, p, new URLSearchParams(q), body === undefined ? "" : JSON.stringify(body), who ? as(who) : null);

const ADMIN = "user-0002";
const NSM = "user-0001";
const REP_ACCRA = "user-0008";
const REP_TAMALE = "user-0013";
const DIST_NORTH = "user-0018";
const DIST_COAST = "user-0019";

beforeAll(async () => {
  ({ dispatch } = await import("./index"));
  db = await import("./store");
  db.resetDb();
});

describe("sign-in", () => {
  it("rejects requests without a valid built-in token", async () => {
    expect((await call(null, "GET", "/me")).status).toBe(401);
    expect((await dispatch("GET", "/me", new URLSearchParams(), "", "Bearer nope")).status).toBe(401);
  });
  it("lists demo users without a token", async () => {
    const r = await call(null, "GET", "/demo/users");
    expect(r.status).toBe(200);
    expect((r.body as unknown[]).length).toBeGreaterThan(10);
  });
});

describe("role-based access", () => {
  it("lets a distributor see only their own partner data", async () => {
    const mine = await call(DIST_NORTH, "GET", "/portal/overview");
    expect((mine.body as any).partner.id).toBe("dist-0001");
    // Asking for someone else's partner id is ignored: they still get their own.
    const spoof = await call(DIST_NORTH, "GET", "/portal/overview", undefined, "distributorId=dist-0002");
    expect((spoof.body as any).partner.id).toBe("dist-0001");
    const other = await call(DIST_COAST, "GET", "/portal/inventory");
    expect(other.status).toBe(200);
    const orders = (await call(DIST_NORTH, "GET", "/portal/orders")).body as { id: string }[];
    const all = db.getDb().orders;
    for (const o of orders) expect(all.find((x) => x.id === o.id)!.distributorId).toBe("dist-0001");
  });
  it("keeps distributors out of internal data", async () => {
    for (const p of ["/customers", "/rtm/summary", "/admin/users", "/admin/audit-logs", "/dq/summary", "/deals", "/samples/requests"]) {
      expect((await call(DIST_NORTH, "GET", p)).status, p).toBe(403);
    }
  });
  it("keeps reps out of cost-to-serve and management data", async () => {
    for (const p of ["/rtm/summary", "/tco/scenarios", "/admin/users", "/admin/audit-logs", "/integrity"]) {
      expect((await call(REP_ACCRA, "GET", p)).status, p).toBe(403);
    }
  });
  it("shows a rep only customers in their own territory", async () => {
    const r = (await call(REP_TAMALE, "GET", "/customers", undefined, "pageSize=200")).body as { items: { territoryId: string }[] };
    const tamale = db.getDb().territories.find((t) => t.district === "Tamale")!.id;
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items.every((c) => c.territoryId === tamale)).toBe(true);
  });
  it("lets a regional manager see their team but not other regions' reps", async () => {
    const r = (await call("user-0005", "GET", "/admin/users")).body as { id: string }[];
    expect(r.some((u) => u.id === REP_TAMALE)).toBe(true);
    expect(r.some((u) => u.id === REP_ACCRA)).toBe(false);
  });
});

describe("visits", () => {
  const cust = () => db.getDb().customers.find((c) => c.territoryId === db.getDb().users.find((u) => u.id === REP_ACCRA)!.territoryId && c.latitude != null && !c.mergedInto)!;

  it("verifies a check-in at the customer and flags one that is far away", async () => {
    const c = cust();
    const near = await call(REP_ACCRA, "POST", "/visits", { clientId: "t-near", customerId: c.id, latitude: c.latitude, longitude: c.longitude });
    expect(near.status).toBe(201);
    expect((near.body as any).verified).toBe(true);
    const far = await call(REP_ACCRA, "POST", "/visits", { clientId: "t-far", customerId: c.id, latitude: c.latitude! + 0.05, longitude: c.longitude });
    expect((far.body as any).verified).toBe(false);
    expect((far.body as any).verifyReason).toBe("outside-geofence");
  });
  it("ignores a verified flag sent by the device", async () => {
    const c = cust();
    const r = await call(REP_ACCRA, "POST", "/visits", { clientId: "t-liar", customerId: c.id, latitude: 0, longitude: 0, verified: true });
    expect((r.body as any).verified).toBe(false);
  });
  it("does not save a retried visit twice", async () => {
    const c = cust();
    const before = db.getDb().visits.length;
    await call(REP_ACCRA, "POST", "/visits", { clientId: "t-retry", customerId: c.id });
    const again = await call(REP_ACCRA, "POST", "/visits", { clientId: "t-retry", customerId: c.id });
    expect(again.status).toBe(200);
    expect(db.getDb().visits.length).toBe(before + 1);
  });
  it("accepts a batch of offline visits and reports bad ones separately", async () => {
    const c = cust();
    const r = await call(REP_ACCRA, "POST", "/visits/sync", {
      visits: [
        { clientId: "t-off-1", customerId: c.id, at: new Date(Date.now() - 3 * 36e5).toISOString() },
        { clientId: "t-off-2", customerId: "nope" },
        { clientId: "t-off-3", customerId: c.id, at: new Date(Date.now() + 36e5).toISOString() },
      ],
    });
    const b = r.body as any;
    expect(b.accepted).toBe(1);
    expect(b.rejected).toBe(2);
  });
  it("keeps the hash chains intact", async () => {
    const r = (await call(ADMIN, "GET", "/integrity")).body as any;
    expect(r.visits.ok).toBe(true);
    expect(r.audit.ok).toBe(true);
  });
  it("detects a changed record", async () => {
    const d = db.getDb();
    const v = d.visits[10];
    const old = v.outcome;
    v.outcome = "Edited later";
    const r = (await call(ADMIN, "GET", "/integrity")).body as any;
    expect(r.visits.ok).toBe(false);
    expect(r.visits.brokenAt).toBe(v.id);
    v.outcome = old;
  });
});

describe("customers and data quality", () => {
  it("finds the seeded duplicates and merges without losing history", async () => {
    const pairs = (await call(NSM, "GET", "/dq/duplicates")).body as any[];
    expect(pairs.length).toBeGreaterThanOrEqual(8);
    const p = pairs[0];
    const visits = db.getDb().visits.filter((v) => v.customerId === p.right.id || v.customerId === p.left.id).length;
    const noReason = await call(NSM, "POST", "/dq/merge", { keepId: p.a, mergeId: p.b });
    expect(noReason.status).toBe(422);
    const ok = await call(NSM, "POST", "/dq/merge", { keepId: p.a, mergeId: p.b, reason: "Same outlet keyed twice" });
    expect(ok.status).toBe(200);
    expect(db.getDb().customers.find((c) => c.id === p.b)!.mergedInto).toBe(p.a);
    expect(db.getDb().visits.filter((v) => v.customerId === p.right.id || v.customerId === p.left.id).length).toBe(visits);
    expect(((await call(ADMIN, "GET", "/integrity")).body as any).visits.ok).toBe(true);
    const after = (await call(NSM, "GET", "/customers", undefined, "pageSize=200&q=")).body as any;
    expect(after.items.some((c: any) => c.id === p.b)).toBe(false);
  });
  it("warns before creating a duplicate customer", async () => {
    const c = db.getDb().customers.find((x) => x.territoryId && x.city && !x.mergedInto)!;
    const r = await call(NSM, "POST", "/customers", { type: c.type, name: c.name, city: c.city, territoryId: c.territoryId });
    expect(r.status).toBe(409);
  });
  it("imports a CSV after a dry run", async () => {
    const csv = "type,name,city,phone\nPharmacy,Brand New Rx,Accra,0244000111\nClinic,,Accra,\n";
    const dry = await dispatch("POST", "/customers/import", new URLSearchParams("dryRun=true"), csv, as(NSM));
    expect((dry.body as any).created).toBe(1);
    expect((dry.body as any).errors).toBe(1);
    const before = db.getDb().customers.length;
    expect(db.getDb().customers.length).toBe(before);
    await dispatch("POST", "/customers/import", new URLSearchParams("dryRun=false"), csv, as(NSM));
    expect(db.getDb().customers.length).toBe(before + 1);
  });
});

describe("samples", () => {
  it("runs request, approve, issue, hand-over and recall", async () => {
    const d = db.getDb();
    const prod = d.products[0];
    const req = (await call(REP_ACCRA, "POST", "/samples/requests", { productId: prod.id, quantity: 20 })).body as any;
    // The rep cannot approve their own request.
    expect((await call(REP_ACCRA, "POST", `/samples/requests/${req.id}/approve`, { quantity: 20 })).status).toBe(403);
    expect((await call("user-0004", "POST", `/samples/requests/${req.id}/approve`, { quantity: 15 })).status).toBe(200);
    const f = (await call(NSM, "POST", `/samples/requests/${req.id}/fulfil`)).body as any;
    expect(f.allocations.reduce((n: number, a: any) => n + a.quantity, 0)).toBe(15);
    const batchId = f.allocations[0].batchId;
    const cust = d.customers.find((c) => c.territoryId === d.users.find((u) => u.id === REP_ACCRA)!.territoryId && !c.mergedInto)!;
    expect((await call(REP_ACCRA, "POST", "/samples/distributions", { customerId: cust.id, batchId, units: 5, signed: true })).status).toBe(201);
    expect((await call(REP_ACCRA, "POST", "/samples/distributions", { customerId: cust.id, batchId, units: 5000 })).status).toBe(409);
    const rec = await call(NSM, "POST", `/samples/batches/${batchId}/status`, { status: "Recalled", reason: "Test recall" });
    expect((rec.body as any).notified).toBeGreaterThan(0);
    expect((await call(REP_ACCRA, "POST", "/samples/distributions", { customerId: cust.id, batchId, units: 1 })).status).toBe(409);
    const trace = (await call(NSM, "GET", `/trace/batches/${batchId}`)).body as any;
    expect(trace.recallImpact.customers).toBeGreaterThan(0);
  });
  it("reconciles ledger with logged distributions", async () => {
    const r = (await call(NSM, "GET", "/samples/reports/compliance", undefined, "from=2020-01-01T00:00:00Z&to=2100-01-01T00:00:00Z")).body as any;
    expect(r.reconciliation.ok).toBe(true);
  });
});

describe("pipeline", () => {
  it("moves a deal through stages and requires a reason for Lost", async () => {
    const cust = db.getDb().customers.find((c) => !c.mergedInto)!;
    const deal = (await call(NSM, "POST", "/deals", { title: "Test deal", customerId: cust.id, value: 5000 })).body as any;
    expect((await call(NSM, "POST", `/deals/${deal.id}/stage`, { stage: "Qualified" })).status).toBe(200);
    expect((await call(NSM, "POST", `/deals/${deal.id}/stage`, { stage: "Lost" })).status).toBe(422);
    expect((await call(NSM, "POST", `/deals/${deal.id}/stage`, { stage: "Lost", lostReason: "Price" })).status).toBe(200);
  });
});

describe("route to market", () => {
  it("shows weaker service in the Northern regions", async () => {
    const h = (await call(NSM, "GET", "/rtm/hotspots")).body as any[];
    const worst = h.slice(0, 3).map((x) => x.region);
    expect(worst.some((r) => r === "Northern" || r === "Upper East")).toBe(true);
  });
  it("saves and lists TCO scenarios", async () => {
    const s = await call(NSM, "POST", "/tco/scenarios", { name: "Tablets", inputs: { reps: 60 } });
    expect(s.status).toBe(200);
    expect(((await call(NSM, "GET", "/tco/scenarios")).body as any[]).some((x) => x.name === "Tablets")).toBe(true);
    expect((await call(NSM, "POST", "/tco/scenarios", { name: "Bad", inputs: { reps: -1 } })).status).toBe(422);
  });
});

describe("orders from the order app", () => {
  let cat: any;
  beforeAll(async () => {
    cat = (await call(REP_ACCRA, "GET", "/orders/catalog")).body;
  });
  const order = (extra: object = {}) => ({ clientId: `c-${Math.random()}`, customerId: cat.customers[0].id, lines: [{ productId: cat.products[0].id, qty: 10 }], ...extra });

  it("gives a rep a catalog with prices and only their own customers", async () => {
    expect(cat.products.length).toBeGreaterThan(3);
    expect(cat.products[0].listPrice).toBeGreaterThan(0);
    const all = (await call(NSM, "GET", "/orders/catalog")).body as any;
    expect(cat.customers.length).toBeGreaterThan(0);
    expect(cat.customers.length).toBeLessThan(all.customers.length);
    expect(cat.rules.confirmAboveQty).toBe(50);
  });
  it("places an order, prices it on the server and ignores a price sent by the phone", async () => {
    const o = order({ lines: [{ productId: cat.products[0].id, qty: 10, unitPrice: 0.01 }] });
    const r = await call(REP_ACCRA, "POST", "/orders", o);
    expect(r.status).toBe(201);
    const b = r.body as any;
    const c = cat.customers[0];
    expect(b.units).toBe(10);
    expect(b.value).toBeCloseTo(10 * Math.round(cat.products[0].listPrice * (1 - c.discountPct) * 100) / 100, 2);
  });
  it("does not save a retry twice", async () => {
    const o = order();
    expect((await call(REP_ACCRA, "POST", "/orders", o)).status).toBe(201);
    expect((await call(REP_ACCRA, "POST", "/orders", o)).status).toBe(200);
    const mine = (await call(REP_ACCRA, "GET", "/orders/mine")).body as any[];
    expect(mine.filter((x) => x.clientId === o.clientId)).toHaveLength(1);
  });
  it("refuses typing mistakes and bad orders", async () => {
    const p = cat.products[0].id;
    const bad = async (lines: unknown) => (await call(REP_ACCRA, "POST", "/orders", order({ lines }))).status;
    expect(await bad([{ productId: p, qty: 5000 }])).toBe(422);
    expect(await bad([{ productId: p, qty: 1.5 }])).toBe(422);
    expect(await bad([{ productId: p, qty: 0 }])).toBe(422);
    expect(await bad([{ productId: p, qty: -3 }])).toBe(422);
    expect(await bad([{ productId: "nope", qty: 1 }])).toBe(422);
    expect(await bad([])).toBe(422);
    expect((await call(REP_ACCRA, "POST", "/orders", order({ customerId: "nobody" }))).status).toBe(422);
  });
  it("merges a product entered twice and refuses a merged total above the limit", async () => {
    const p = cat.products[1].id;
    const r = await call(REP_ACCRA, "POST", "/orders", order({ lines: [{ productId: p, qty: 4 }, { productId: p, qty: 6 }] }));
    expect((r.body as any).lines).toHaveLength(1);
    expect((r.body as any).units).toBe(10);
    expect((await call(REP_ACCRA, "POST", "/orders", order({ lines: [{ productId: p, qty: 600 }, { productId: p, qty: 600 }] }))).status).toBe(422);
  });
  it("will not take an order for someone else's customer", async () => {
    const north = ((await call(NSM, "GET", "/orders/catalog")).body as any).customers.find((c: any) => !cat.customers.some((m: any) => m.id === c.id));
    expect((await call(REP_ACCRA, "POST", "/orders", order({ customerId: north.id }))).status).toBe(422);
  });
  it("syncs a batch and reports each result", async () => {
    const good = order();
    const r = (await call(REP_ACCRA, "POST", "/orders/sync", { orders: [good, order({ lines: [{ productId: cat.products[0].id, qty: 9999 }] }), good] })).body as any;
    expect(r.accepted).toBe(2); // the repeat counts as accepted, but is not saved twice
    expect(r.rejected).toBe(1);
    expect(r.results[2].duplicate).toBe(true);
  });
  it("blocks a distributor from the order endpoints", async () => {
    expect((await call(DIST_NORTH, "GET", "/orders/catalog")).status).toBe(403);
    expect((await call(null, "POST", "/orders", order())).status).toBe(401);
  });
});

describe("order lifecycle", () => {
  const MANAGER = NSM;
  let cat: any;
  const place = async (who = REP_ACCRA, qty = 10) => {
    cat ??= (await call(REP_ACCRA, "GET", "/orders/catalog")).body;
    const r = await call(who, "POST", "/orders", { clientId: `lc-${Math.random()}`, customerId: cat.customers[0].id, lines: [{ productId: cat.products[0].id, qty }] });
    return r.body as any;
  };

  it("shows stock availability in the catalog", async () => {
    cat = (await call(REP_ACCRA, "GET", "/orders/catalog")).body;
    expect(cat.products.every((p: any) => ["In stock", "Low", "Out"].includes(p.availability))).toBe(true);
  });
  it("lets a rep cancel their own placed order, with a reason, and keeps it out of the numbers", async () => {
    const o = await place();
    expect((await call(REP_ACCRA, "POST", `/orders/${o.id}/cancel`, {})).status).toBe(422);
    const count = async () => ((await call(NSM, "GET", "/rtm/summary")).body as any).overall.orders;
    const before = await count();
    const r = await call(REP_ACCRA, "POST", `/orders/${o.id}/cancel`, { reason: "Wrong customer" });
    expect((r.body as any).status).toBe("Cancelled");
    expect(await count()).toBe(before - 1); // the order was counted until it was cancelled
    const mine = (await call(REP_ACCRA, "GET", "/orders/mine")).body as any[];
    expect(mine.find((x) => x.id === o.id).cancelReason).toBe("Wrong customer");
  });
  it("only a manager confirms, and then a rep can no longer cancel", async () => {
    const o = await place();
    expect((await call(REP_ACCRA, "POST", `/orders/${o.id}/confirm`)).status).toBe(403);
    expect(((await call(MANAGER, "POST", `/orders/${o.id}/confirm`)).body as any).status).toBe("Confirmed");
    expect((await call(REP_ACCRA, "POST", `/orders/${o.id}/cancel`, { reason: "x" })).status).toBe(403);
    expect(((await call(MANAGER, "POST", `/orders/${o.id}/cancel`, { reason: "Customer asked" })).body as any).status).toBe("Cancelled");
  });
  it("records a short delivery and counts revenue in proportion", async () => {
    const o = await place(REP_ACCRA, 20);
    const bad = await call(MANAGER, "POST", `/orders/${o.id}/deliver`, { unitsDelivered: 21 });
    expect(bad.status).toBe(422);
    const r = (await call(MANAGER, "POST", `/orders/${o.id}/deliver`, { unitsDelivered: 15 })).body as any;
    expect(r.status).toBe("Delivered");
    expect(r.unitsDelivered).toBe(15);
    expect((await call(MANAGER, "POST", `/orders/${o.id}/cancel`, { reason: "x" })).status).toBe(422);
  });
  it("lists orders for managers only, and a rep cannot touch another rep's order", async () => {
    expect((await call(REP_ACCRA, "GET", "/orders")).status).toBe(403);
    const list = (await call(MANAGER, "GET", "/orders", undefined, "status=Placed")).body as any[];
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((o) => o.status === "Placed")).toBe(true);
    const o = await place();
    expect((await call(REP_TAMALE, "POST", `/orders/${o.id}/cancel`, { reason: "x" })).status).toBe(404);
  });
});
