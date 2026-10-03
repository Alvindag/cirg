import { forbid, HttpError, isActiveCustomer, requireFeature, resolveCustomerId, visibleCustomers, visibleUserIds } from "../access";
import { bad, del, get, notFound, num, post } from "../router";
import { logAudit, save } from "../store";
import { verifyChain } from "@/lib/rtm/hashchain";
import { completeness, findDuplicates, qualityIssues } from "@/lib/rtm/dq";
import { channelConflicts, groupBy, isOtif, numericalReach, summarise, type OrderRecord } from "@/lib/rtm/metrics";
import { computeTco, defaultTco, type TcoInputs } from "@/lib/rtm/tco";
import { visitPayload, auditPayload } from "../seed";
import type { DB, User } from "../model";
import { inRange, range } from "./core";

const id = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const DAY = 864e5;

/** Orders for the customers this user may see, in the date range, optionally narrowed. */
function scopedOrders(db: DB, user: User, q: URLSearchParams, days = 180) {
  const r = range(q, days);
  const ok = new Set(visibleCustomers(db, user).map((c) => c.id));
  return db.orders.filter(
    (o) =>
      !o.cancelledAt &&
      ok.has(resolveCustomerId(db, o.customerId)) &&
      inRange(o.orderedAt, r) &&
      (!q.get("region") || o.region === q.get("region")) &&
      (!q.get("channel") || o.channel === q.get("channel")),
  );
}

const rate = (n: number) => Math.round(n * 1000) / 10; // 0.1234 -> 12.3

function row(label: string, orders: OrderRecord[]) {
  const s = summarise(orders);
  return { label, ...s, costToServePct: rate(s.costToServePct), onTimePct: rate(s.onTimePct), inFullPct: rate(s.inFullPct), otifPct: rate(s.otifPct), avgCycleDays: s.avgCycleDays === null ? null : Math.round(s.avgCycleDays * 10) / 10 };
}

/* ---------------- route-to-market ---------------- */

get("/rtm/summary", ({ db, user, q }) => {
  requireFeature(user, "rtm");
  const orders = scopedOrders(db, user, q);
  const customers = visibleCustomers(db, user);
  // Reach counts outlets that actually bought in the period, not outlets that were only visited.
  const reached = orders.filter((o) => o.deliveredAt).map((o) => resolveCustomerId(db, o.customerId));
  const reach = numericalReach(customers.map((c) => c.id), reached);
  const conflicts = channelConflicts(orders);
  return {
    overall: row("All", orders),
    byChannel: Object.entries(groupBy(orders, (o) => o.channel)).map(([k, v]) => row(k, v as OrderRecord[])),
    byRegion: Object.entries(groupBy(orders, (o) => o.region)).map(([k, v]) => row(k, v as OrderRecord[])).sort((a, b) => a.otifPct - b.otifPct),
    reach: { ...reach, pct: rate(reach.pct) },
    conflicts: conflicts.length,
    targets: { otifPct: 95, costToServePct: 12 },
  };
});

get("/rtm/trend", ({ db, user, q }) => {
  requireFeature(user, "rtm");
  const orders = scopedOrders(db, user, q, 365);
  const byMonth = groupBy(orders, (o) => o.orderedAt.slice(0, 7));
  return Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([m, v]) => row(m, v as OrderRecord[]));
});

get("/rtm/conflicts", ({ db, user, q }) => {
  requireFeature(user, "rtm");
  return channelConflicts(scopedOrders(db, user, q)).slice(0, 50).map((c) => {
    const cust = db.customers.find((x) => x.id === c.customerId);
    return { ...c, customerName: cust?.name ?? "—", city: cust?.city ?? null, distributors: c.distributorIds.map((d) => db.distributors.find((x) => x.id === d)?.name ?? d), ...{ overlapRevenue: Math.min(c.directRevenue, c.distributorRevenue) } };
  });
});

/** Where the weak spots are: regions below the OTIF target, ranked, with the main cause. */
get("/rtm/hotspots", ({ db, user, q }) => {
  requireFeature(user, "rtm");
  const orders = scopedOrders(db, user, q);
  return Object.entries(groupBy(orders, (o) => o.region)).map(([region, list]) => {
    const l = list as OrderRecord[];
    const d = l.filter((o) => o.deliveredAt);
    const late = d.filter((o) => Date.parse(o.deliveredAt!) > Date.parse(o.promisedAt)).length;
    const short = d.filter((o) => o.unitsDelivered < o.unitsOrdered).length;
    const s = summarise(l);
    const customers = visibleCustomers(db, user).filter((c) => db.territories.find((t) => t.id === c.territoryId)?.region === region);
    const visited = new Set(db.visits.filter((v) => inRange(v.at, range(q, 90))).map((v) => resolveCustomerId(db, v.customerId)));
    return {
      region,
      otifPct: rate(s.otifPct),
      costToServePct: rate(s.costToServePct),
      cause: late >= short ? "Late deliveries" : "Short deliveries",
      lateOrders: late,
      shortOrders: short,
      customers: customers.length,
      visitCoveragePct: customers.length ? rate(customers.filter((c) => visited.has(c.id)).length / customers.length) : 0,
      unmapped: customers.filter((c) => c.latitude == null).length,
    };
  }).sort((a, b) => a.otifPct - b.otifPct);
});

/* ---------------- field force ---------------- */

get("/rtm/field-force", ({ db, user, q }) => {
  requireFeature(user, "fieldForce");
  const r = range(q, 30);
  const people = visibleUserIds(db, user);
  const days = Math.max(1, (r.to - r.from) / DAY);
  return db.users
    .filter((u) => u.role === "Rep" && people.has(u.id) && u.isActive)
    .map((u) => {
      const v = db.visits.filter((x) => x.repId === u.id && inRange(x.at, r));
      const assigned = db.customers.filter((c) => isActiveCustomer(c) && c.territoryId === u.territoryId);
      const target = Math.round(assigned.reduce((n, c) => n + c.targetVisitsPerMonth, 0) * (days / 30));
      const seen = new Set(v.map((x) => resolveCustomerId(db, x.customerId)));
      const terr = db.territories.find((t) => t.id === u.territoryId);
      const verified = v.filter((x) => x.verified).length;
      const late = v.filter((x) => Date.parse(x.receivedAt) - Date.parse(x.at) > DAY).length;
      return {
        repId: u.id,
        name: u.fullName,
        region: terr?.region ?? "—",
        territory: terr?.district ?? "—",
        visits: v.length,
        target,
        attainmentPct: target ? rate(v.length / target) : 0,
        customersAssigned: assigned.length,
        coveragePct: assigned.length ? rate(assigned.filter((c) => seen.has(c.id)).length / assigned.length) : 0,
        verifiedPct: v.length ? rate(verified / v.length) : 0,
        outsideGeofence: v.filter((x) => x.verifyReason === "outside-geofence").length,
        noLocation: v.filter((x) => x.verifyReason === "no-checkin-location").length,
        lateSyncs: late,
        avgPerDay: Math.round((v.length / days) * 10) / 10,
      };
    })
    .sort((a, b) => b.attainmentPct - a.attainmentPct);
});

/* ---------------- data quality ---------------- */

function requireDq(user: User) {
  requireFeature(user, "dataQuality");
}

get("/dq/summary", ({ db, user }) => {
  requireDq(user);
  const customers = visibleCustomers(db, user);
  const issues = qualityIssues(customers);
  const dupes = findDuplicates(customers);
  const kinds = groupBy(issues, (i) => i.kind);
  const dupIds = new Set(dupes.flatMap((d) => [d.a, d.b]));
  return {
    customers: customers.length,
    completenessPct: rate(completeness(customers)),
    customersWithIssues: new Set(issues.map((i) => i.customerId)).size,
    duplicatePairs: dupes.length,
    customersInDuplicates: dupIds.size,
    issueCounts: Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, (v as unknown[]).length])),
    byRegion: Object.entries(groupBy(customers, (c) => db.territories.find((t) => t.id === c.territoryId)?.region ?? "Unassigned")).map(([region, list]) => ({ region, customers: (list as typeof customers).length, completenessPct: rate(completeness(list as typeof customers)) })),
  };
});

get("/dq/duplicates", ({ db, user }) => {
  requireDq(user);
  const customers = visibleCustomers(db, user);
  const byId = new Map(customers.map((c) => [c.id, c]));
  return findDuplicates(customers).slice(0, 100).map((d) => ({ ...d, id: `${d.a}:${d.b}`, left: byId.get(d.a), right: byId.get(d.b), leftVisits: db.visits.filter((v) => v.customerId === d.a).length, rightVisits: db.visits.filter((v) => v.customerId === d.b).length }));
});

get("/dq/issues", ({ db, user, q }) => {
  requireDq(user);
  const kind = q.get("kind");
  const byId = new Map(db.customers.map((c) => [c.id, c]));
  return qualityIssues(visibleCustomers(db, user))
    .filter((i) => !kind || i.kind === kind)
    .slice(0, num(q.get("take"), 100))
    .map((i) => ({ ...i, customerName: byId.get(i.customerId)?.name ?? "—", city: byId.get(i.customerId)?.city ?? null }));
});

/** Merges `mergeId` into `keepId`. Nothing is deleted: the merged record stays, pointing at the survivor, so history and visit hashes still verify. */
post("/dq/merge", ({ db, user, body }) => {
  requireDq(user);
  if (!["AreaManager", "RegionalManager", "NationalSalesManager", "Admin", "KeyAccountManager", "Marketing"].includes(user.role)) forbid();
  const people = visibleCustomers(db, user);
  const keep = people.find((c) => c.id === body.keepId) ?? notFound("Customer to keep");
  const gone = people.find((c) => c.id === body.mergeId) ?? notFound("Customer to merge");
  if (keep.id === gone.id) bad("Choose two different customers.");
  if (!body.reason?.trim()) bad("Say why these are the same customer. It is kept in the audit trail.");
  const filled: string[] = [];
  for (const k of ["phone", "email", "address", "city", "latitude", "longitude", "territoryId", "specialty"] as const) {
    if ((keep as any)[k] == null && (gone as any)[k] != null) {
      (keep as any)[k] = (gone as any)[k];
      filled.push(k);
    }
  }
  if (keep.segment === "Unclassified" && gone.segment !== "Unclassified") {
    keep.segment = gone.segment;
    filled.push("segment");
  }
  gone.mergedInto = keep.id;
  gone.archivedAt = new Date().toISOString();
  db.deals.forEach((d) => d.customerId === gone.id && (d.customerId = keep.id));
  db.tasks.forEach((t) => t.customerId === gone.id && (t.customerId = keep.id));
  logAudit(user.id, "Merge", "Customer", keep.id, { merged: gone.id, mergedName: gone.name, filled }, body.reason.trim());
  save();
  return { kept: keep.id, merged: gone.id, filled };
});

/* ---------------- distributor portal (role-based, scoped to one partner) ---------------- */

/**
 * A partner only ever sees their own data. For a Distributor the partner comes
 * from their account and any distributorId in the request is ignored.
 * Internal managers must name a partner, which gives them a "view as partner" preview.
 */
function partnerOf(db: DB, user: User, q: URLSearchParams) {
  requireFeature(user, "portal");
  const idv = user.role === "Distributor" ? user.distributorId : q.get("distributorId");
  if (!idv) throw new HttpError(422, "Choose a distributor to preview.");
  return db.distributors.find((d) => d.id === idv) ?? notFound("Distributor");
}

get("/portal/partners", ({ db, user }) => {
  requireFeature(user, "portal");
  if (user.role === "Distributor") return db.distributors.filter((d) => d.id === user.distributorId);
  return db.distributors;
});

get("/portal/overview", ({ db, user, q }) => {
  const d = partnerOf(db, user, q);
  const orders = db.orders.filter((o) => !o.cancelledAt && o.distributorId === d.id && inRange(o.orderedAt, range(q, 90)));
  const s = summarise(orders);
  const stock = db.distributorStock.filter((x) => x.distributorId === d.id);
  return {
    partner: { id: d.id, name: d.name, region: d.region },
    orders: orders.length,
    revenue: Math.round(s.revenue),
    otifPct: rate(s.otifPct),
    avgCycleDays: s.avgCycleDays === null ? null : Math.round(s.avgCycleDays * 10) / 10,
    outletsServed: new Set(orders.map((o) => o.customerId)).size,
    lowStock: stock.filter((x) => x.units < x.reorderLevel).length,
    stockLines: stock.length,
  };
});

get("/portal/pricing", ({ db, user, q }) => {
  const d = partnerOf(db, user, q);
  return { discountPct: rate(d.discountPct), items: db.products.map((p) => ({ productId: p.id, name: p.name, therapeuticArea: p.therapeuticArea, listPrice: p.listPrice, netPrice: Math.round(p.listPrice * (1 - d.discountPct) * 100) / 100 })) };
});

get("/portal/inventory", ({ db, user, q }) => {
  const d = partnerOf(db, user, q);
  return db.distributorStock.filter((x) => x.distributorId === d.id).map((x) => ({ productId: x.productId, name: db.products.find((p) => p.id === x.productId)?.name ?? "—", units: x.units, reorderLevel: x.reorderLevel, status: x.units === 0 ? "Out of stock" : x.units < x.reorderLevel ? "Low" : "OK" }));
});

get("/portal/orders", ({ db, user, q }) => {
  const d = partnerOf(db, user, q);
  return db.orders
    .filter((o) => !o.cancelledAt && o.distributorId === d.id)
    .sort((a, b) => b.orderedAt.localeCompare(a.orderedAt))
    .slice(0, 40)
    .map((o) => ({ id: o.id, outlet: db.customers.find((c) => c.id === o.customerId)?.name ?? "—", orderedAt: o.orderedAt, promisedAt: o.promisedAt, deliveredAt: o.deliveredAt, unitsOrdered: o.unitsOrdered, unitsDelivered: o.unitsDelivered, revenue: o.revenue, status: !o.deliveredAt ? "In progress" : isOtif(o) ? "On time, in full" : Date.parse(o.deliveredAt) > Date.parse(o.promisedAt) ? "Late" : "Short" }));
});

get("/portal/performance", ({ db, user, q }) => {
  const d = partnerOf(db, user, q);
  const mine = db.orders.filter((o) => !o.cancelledAt && o.distributorId === d.id);
  return Object.entries(groupBy(mine, (o) => o.orderedAt.slice(0, 7))).sort(([a], [b]) => a.localeCompare(b)).map(([m, v]) => { const s = summarise(v as OrderRecord[]); return { month: m, orders: s.orders, revenue: Math.round(s.revenue), otifPct: rate(s.otifPct) }; });
});

post("/portal/restock", ({ db, user, body, q }) => {
  const d = partnerOf(db, user, q);
  if (user.role !== "Distributor") forbid("Only the partner can request stock.");
  const p = db.products.find((x) => x.id === body.productId) ?? bad("Choose a product.");
  const units = Number(body.units);
  if (!Number.isInteger(units) || units < 1) bad("Units must be a whole number of 1 or more.");
  db.notifications.push({ id: id("n"), userId: null, kind: "Notice", title: `${d.name} asked for ${units} × ${p.name}`, body: body.note ?? "Restock request from the distributor portal.", createdAt: new Date().toISOString(), readAt: null });
  logAudit(user.id, "Restock", "Distributor", d.id, { product: p.name, units });
  save();
});

/* ---------------- total cost of ownership ---------------- */

get("/tco/defaults", ({ user }) => {
  requireFeature(user, "tco");
  return defaultTco;
});
get("/tco/scenarios", ({ db, user }) => {
  requireFeature(user, "tco");
  return db.tcoScenarios.map((s) => ({ ...s, result: computeTco(s.inputs) })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
});
post("/tco/scenarios", ({ db, user, body }) => {
  requireFeature(user, "tco");
  if (!body.name?.trim()) bad("Name the scenario.");
  const inputs: TcoInputs = { ...defaultTco };
  for (const k of Object.keys(defaultTco) as (keyof TcoInputs)[]) {
    if (body.inputs?.[k] !== undefined) {
      const n = Number(body.inputs[k]);
      if (!Number.isFinite(n) || n < 0) bad(`${k} must be a number of zero or more.`);
      inputs[k] = n;
    }
  }
  if (inputs.years < 1 || inputs.deviceLifeYears <= 0) bad("Years and device life must be above zero.");
  const s = { id: id("tco"), name: body.name.trim(), inputs, createdBy: user.id, createdAt: new Date().toISOString() };
  db.tcoScenarios.push(s);
  logAudit(user.id, "Create", "TcoScenario", s.id, { name: s.name });
  save();
  return { ...s, result: computeTco(inputs) };
});
del("/tco/scenarios/:id", ({ db, user, params }) => {
  requireFeature(user, "tco");
  const s = db.tcoScenarios.find((x) => x.id === params[0]) ?? notFound("Scenario");
  db.tcoScenarios = db.tcoScenarios.filter((x) => x !== s);
  logAudit(user.id, "Delete", "TcoScenario", s.id, { name: s.name });
  save();
});

/* ---------------- batch trace and recall impact ---------------- */

function traceOf(db: DB, batchId: string) {
  const b = db.batches.find((x) => x.id === batchId) ?? notFound("Batch");
  const p = db.products.find((x) => x.id === b.productId);
  const dist = db.distributions.filter((d) => d.batchId === b.id).sort((a, b2) => b2.at.localeCompare(a.at));
  const holders = db.stock.filter((s) => s.batchId === b.id && s.quantity > 0);
  const byCustomer = groupBy(dist, (d) => d.customerId);
  const customers = Object.entries(byCustomer).map(([cid, list]) => {
    const c = db.customers.find((x) => x.id === cid);
    return { customerId: cid, name: c?.name ?? "—", city: c?.city ?? null, phone: c?.phone ?? null, units: (list as typeof dist).reduce((n, d) => n + d.units, 0), lastAt: (list as typeof dist)[0].at };
  });
  return {
    batch: { ...b, productName: p?.name ?? "—" },
    received: db.ledger.filter((l) => l.batchId === b.id && l.kind === "Receipt").reduce((n, l) => n + l.delta, 0),
    inWarehouse: holders.filter((h) => h.holderId === null).reduce((n, h) => n + h.quantity, 0),
    withReps: holders.filter((h) => h.holderId).map((h) => ({ repId: h.holderId!, name: db.users.find((u) => u.id === h.holderId)?.fullName ?? "—", quantity: h.quantity })),
    distributedUnits: dist.reduce((n, d) => n + d.units, 0),
    unsignedUnits: dist.filter((d) => !d.signed).reduce((n, d) => n + d.units, 0),
    customers: customers.sort((a, b2) => b2.units - a.units),
    ledger: db.ledger.filter((l) => l.batchId === b.id).sort((a, b2) => b2.at.localeCompare(a.at)).slice(0, 30).map((l) => ({ ...l, holder: l.holderId ? (db.users.find((u) => u.id === l.holderId)?.fullName ?? "—") : "Warehouse" })),
    recallImpact: { reps: holders.filter((h) => h.holderId).length, customers: customers.length, unitsToRecover: holders.reduce((n, h) => n + h.quantity, 0) + dist.reduce((n, d) => n + d.units, 0) },
  };
}

get("/trace/batches", ({ db, user, q }) => {
  requireFeature(user, "trace");
  const text = (q.get("q") ?? "").toLowerCase();
  return db.batches
    .filter((b) => !text || b.batchNumber.toLowerCase().includes(text) || (db.products.find((p) => p.id === b.productId)?.name ?? "").toLowerCase().includes(text))
    .map((b) => ({ ...b, productName: db.products.find((p) => p.id === b.productId)?.name ?? "—", distributedUnits: db.distributions.filter((d) => d.batchId === b.id).reduce((n, d) => n + d.units, 0) }));
});
get("/trace/batches/:id", ({ db, user, params }) => {
  requireFeature(user, "trace");
  return traceOf(db, params[0]);
});

/* ---------------- record integrity ---------------- */

get("/integrity", ({ db, user }) => {
  if (!["NationalSalesManager", "Executive", "Admin", "RegionalManager", "AreaManager"].includes(user.role)) forbid();
  const visitBreak = verifyChain(db.visits, visitPayload);
  const auditBreak = verifyChain(db.audit, auditPayload);
  const v = db.visits;
  const verified = v.filter((x) => x.verified).length;
  const late = v.filter((x) => Date.parse(x.receivedAt) - Date.parse(x.at) > DAY).length;
  const unsigned = db.distributions.filter((d) => !d.signed).length;
  return {
    checkedAt: new Date().toISOString(),
    visits: { count: v.length, ok: visitBreak === -1, brokenAt: visitBreak === -1 ? null : (v[visitBreak]?.id ?? null) },
    audit: { count: db.audit.length, ok: auditBreak === -1, brokenAt: auditBreak === -1 ? null : (db.audit[auditBreak]?.id ?? null) },
    visitsVerifiedPct: v.length ? rate(verified / v.length) : 0,
    lateSyncedVisits: late,
    unsignedDistributions: unsigned,
    quarantinedBatches: db.batches.filter((b) => b.status !== "Active").length,
    principles: [
      { name: "Attributable", detail: "Every visit, change and approval carries the person who made it." },
      { name: "Contemporaneous", detail: "Visits keep both the time they happened and the time the server received them." },
      { name: "Original", detail: "Records are only added to. Merges and removals keep the old record." },
      { name: "Accurate", detail: "The server, not the phone, decides whether a check-in is inside the customer's geofence." },
      { name: "Complete", detail: "Each visit has a client-generated ID, so a retry is never lost or doubled." },
      { name: "Tamper-evident", detail: "Visits and the audit trail are hash-chained. Changing one entry breaks every entry after it." },
    ],
  };
});
