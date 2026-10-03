import { isWide, forbid, HttpError, isActiveCustomer, requireFeature, resolveCustomerId, visibleCustomers, visibleUserIds } from "../access";
import { del, get, num, open, notFound, bad, post, put, reply } from "../router";
import { authConfig } from "../auth";
import { logAudit, resetDb, save } from "../store";
import { isManager, canEditCustomers, canImportCustomers, isAdmin } from "@/lib/das/roles";
import { findDuplicates, normaliseName, normalisePhone } from "@/lib/rtm/dq";
import type { Customer, DB, Deal, DealStage, Task, User, Visit } from "../model";
import { DEAL_STAGES } from "../model";
import { visitPayload } from "../seed";
import { chainHash, GENESIS } from "@/lib/rtm/hashchain";
import { verifyCheckIn } from "@/lib/rtm/geo";
import { checkLines, CONFIRM_ABOVE_QTY, MAX_LINE_QTY, orderValue, unitPrice } from "@/lib/rtm/orders";
import type { OrderRecord } from "@/lib/rtm/metrics";

const uuid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const publicUser = (u: User) => ({
  id: u.id,
  tenantId: u.tenantId,
  fullName: u.fullName,
  email: u.email,
  role: u.role,
  territoryId: u.territoryId,
  distributorId: u.distributorId,
});

/** Date range from ?from&to, defaulting to the last 30 days. */
export function range(q: URLSearchParams, days = 30) {
  const to = q.get("to") ? Date.parse(q.get("to")!) : Date.now() + 864e5;
  const from = q.get("from") ? Date.parse(q.get("from")!) : to - days * 864e5;
  return { from, to };
}
export const inRange = (iso: string, r: { from: number; to: number }) => {
  const t = Date.parse(iso);
  return t >= r.from && t < r.to;
};

/* ---------------- sign-in ---------------- */

// Used by the demo role picker, before anyone is signed in.
open("/auth/config", () => {
  const c = authConfig();
  return { mode: c.mode, reason: c.reason ?? null };
});
open("/demo/users", ({ db }) => {
  if (authConfig().mode !== "demo") throw new HttpError(404, "Not available.");
  return db.users.filter((u) => u.isActive).map((u) => ({ ...publicUser(u), territory: db.territories.find((t) => t.id === u.territoryId)?.name ?? null, distributor: db.distributors.find((d) => d.id === u.distributorId)?.name ?? null }));
});
get("/me", ({ user }) => publicUser(user));
post("/demo/reset", ({ user }) => {
  if (user.role !== "Admin" || authConfig().mode !== "demo") forbid("Only an Admin can reset the sample data, and only in demo mode.");
  resetDb();
});

/* ---------------- dashboards ---------------- */

get("/dashboards/sales", ({ db, user, q }) => {
  requireFeature(user, "dashboard");
  const r = range(q);
  const people = visibleUserIds(db, user);
  const customers = visibleCustomers(db, user);
  const visits = db.visits.filter((v) => people.has(v.repId) && inRange(v.at, r));
  const months = Math.max(1, (r.to - r.from) / (30 * 864e5));
  const planned = Math.round(customers.reduce((n, c) => n + c.targetVisitsPerMonth, 0) * months);
  const unique = new Set(visits.map((v) => resolveCustomerId(db, v.customerId)));
  const reps = db.users.filter((u) => people.has(u.id) && u.role === "Rep");
  return {
    callsCompleted: visits.length,
    plannedVisits: planned,
    planAdherencePct: planned ? Math.round((visits.length / planned) * 1000) / 10 : 0,
    coveragePct: customers.length ? Math.round((customers.filter((c) => unique.has(c.id)).length / customers.length) * 1000) / 10 : 0,
    byRep: reps.map((rep) => {
      const mine = visits.filter((v) => v.repId === rep.id);
      return { repId: rep.id, calls: mine.length, uniqueCustomers: new Set(mine.map((v) => v.customerId)).size, outsideGeofence: mine.filter((v) => v.verifyReason === "outside-geofence").length };
    }),
  };
});

get("/dashboards/products", ({ db, user, q }) => {
  requireFeature(user, "dashboard");
  const r = range(q);
  const people = visibleUserIds(db, user);
  const batchProduct = new Map(db.batches.map((b) => [b.id, b.productId]));
  return db.products.map((p) => ({
    productId: p.id,
    name: p.name,
    calls: db.visits.filter((v) => people.has(v.repId) && inRange(v.at, r) && v.productIds.includes(p.id)).length,
    sampleUnits: db.distributions.filter((d) => people.has(d.repId) && inRange(d.at, r) && batchProduct.get(d.batchId) === p.id).reduce((n, d) => n + d.units, 0),
  }));
});

get("/dashboards/trend", ({ db, user, q }) => {
  requireFeature(user, "dashboard");
  const days = num(q.get("days"), 30);
  const people = visibleUserIds(db, user);
  const out: { date: string; calls: number; verified: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    const day = db.visits.filter((v) => people.has(v.repId) && v.at.slice(0, 10) === d);
    out.push({ date: d, calls: day.length, verified: day.filter((v) => v.verified).length });
  }
  return out;
});

/** What needs attention now, for the home page. */
get("/dashboards/attention", ({ db, user }) => {
  requireFeature(user, "dashboard");
  const people = visibleUserIds(db, user);
  const mine = (id: string) => people.has(id);
  const now = Date.now();
  return {
    tasksDue: db.tasks.filter((t) => !t.done && mine(t.ownerId) && Date.parse(t.dueAt) < now + 864e5).length,
    dealsClosingSoon: db.deals.filter((d) => mine(d.ownerId) && !["Won", "Lost"].includes(d.stage) && Date.parse(d.expectedClose) < now + 14 * 864e5).length,
    pendingSamples: db.sampleRequests.filter((s) => s.status === "Pending" && mine(s.repId)).length,
    overdueCustomers: visibleCustomers(db, user).filter((c) => {
      const last = db.visits.filter((v) => v.customerId === c.id).reduce((m, v) => Math.max(m, Date.parse(v.at)), 0);
      return now - last > 45 * 864e5;
    }).length,
    pipelineValue: db.deals.filter((d) => mine(d.ownerId) && !["Won", "Lost"].includes(d.stage)).reduce((n, d) => n + d.value, 0),
  };
});

/* ---------------- customers ---------------- */

const customerOut = (c: Customer) => {
  const out: Partial<Customer> = { ...c };
  delete out.mergedInto;
  delete out.archivedAt;
  return out as Omit<Customer, "mergedInto" | "archivedAt">;
};

get("/customers", ({ db, user, q }) => {
  requireFeature(user, "customers");
  const text = (q.get("q") ?? "").toLowerCase();
  const list = visibleCustomers(db, user).filter(
    (c) =>
      (!text || c.name.toLowerCase().includes(text) || (c.city ?? "").toLowerCase().includes(text)) &&
      (!q.get("type") || c.type === q.get("type")) &&
      (!q.get("segment") || c.segment === q.get("segment")) &&
      (!q.get("territoryId") || c.territoryId === q.get("territoryId")) &&
      (!q.get("channel") || c.channel === q.get("channel")),
  );
  list.sort((a, b) => a.name.localeCompare(b.name));
  const pageSize = Math.min(200, num(q.get("pageSize"), 25));
  const page = Math.max(1, num(q.get("page"), 1));
  return { total: list.length, page, pageSize, items: list.slice((page - 1) * pageSize, page * pageSize).map(customerOut) };
});

get("/customers/:id", ({ db, user, params }) => {
  requireFeature(user, "customers");
  const c = db.customers.find((x) => x.id === params[0] && isActiveCustomer(x));
  if (!c || !visibleCustomers(db, user).some((x) => x.id === c.id)) return notFound("Customer");
  const visits = db.visits.filter((v) => v.customerId === c.id).sort((a, b) => b.at.localeCompare(a.at));
  return {
    customer: customerOut(c),
    visits: visits.slice(0, 10),
    visitCount: visits.length,
    deals: db.deals.filter((d) => d.customerId === c.id),
    tasks: db.tasks.filter((t) => t.customerId === c.id && !t.done),
    // Cost fields stay out: a rep can see what a customer bought, not what it cost to serve.
    orders: db.orders.filter((o) => !o.cancelledAt && o.customerId === c.id).slice(-10).reverse().map((o) => ({ id: o.id, channel: o.channel, orderedAt: o.orderedAt, deliveredAt: o.deliveredAt, unitsOrdered: o.unitsOrdered, unitsDelivered: o.unitsDelivered, revenue: o.revenue })),
  };
});

function applyCustomer(db: DB, c: Customer, b: any) {
  const set = <K extends keyof Customer>(k: K, v: unknown) => {
    if (v !== undefined) (c as any)[k] = v === "" ? null : v;
  };
  for (const k of ["type", "name", "specialty", "segment", "territoryId", "parentCustomerId", "phone", "email", "address", "city", "latitude", "longitude", "channel", "distributorId"] as const) set(k, b[k]);
  if (b.targetVisitsPerMonth !== undefined) c.targetVisitsPerMonth = Math.max(0, Number(b.targetVisitsPerMonth) || 0);
  if (Array.isArray(b.productIds)) c.productInterests = b.productIds.map((productId: string) => ({ productId }));
  if (!c.name?.trim()) bad("Name is required.");
  if (c.name) c.name = c.name.trim();
  if (c.latitude != null && (c.latitude < -90 || c.latitude > 90)) bad("Latitude must be between -90 and 90.");
  if (c.longitude != null && (c.longitude < -180 || c.longitude > 180)) bad("Longitude must be between -180 and 180.");
  if (c.territoryId && !db.territories.some((t) => t.id === c.territoryId)) bad("Unknown territory.");
}

post("/customers", ({ db, user, body }) => {
  if (!["Rep", "KeyAccountManager"].includes(user.role) && !canEditCustomers(user.role)) forbid();
  const c: Customer = {
    id: uuid("cust"),
    type: "Pharmacy",
    name: "",
    specialty: null,
    segment: "Unclassified",
    territoryId: user.territoryId,
    parentCustomerId: null,
    phone: null,
    email: null,
    address: null,
    city: null,
    latitude: null,
    longitude: null,
    targetVisitsPerMonth: 1,
    productInterests: [],
    channel: "Direct",
    distributorId: null,
    createdAt: new Date().toISOString(),
  };
  applyCustomer(db, c, body);
  const dup = findDuplicates([...visibleCustomers(db, user), c]).find((p) => p.a === c.id || p.b === c.id);
  if (dup && !body.allowDuplicate) {
    const other = db.customers.find((x) => x.id === (dup.a === c.id ? dup.b : dup.a));
    throw new HttpError(409, `This looks like a duplicate of "${other?.name}" (${dup.reasons.join(", ")}). Send allowDuplicate to save it anyway.`);
  }
  db.customers.push(c);
  logAudit(user.id, "Create", "Customer", c.id, { name: c.name });
  save();
  return reply(201, customerOut(c));
});

put("/customers/:id", ({ db, user, params, body }) => {
  if (!canEditCustomers(user.role)) forbid("Your role cannot edit customers.");
  const c = db.customers.find((x) => x.id === params[0] && isActiveCustomer(x));
  if (!c || !visibleCustomers(db, user).some((x) => x.id === c.id)) return notFound("Customer");
  const before = JSON.stringify(customerOut(c));
  applyCustomer(db, c, body);
  const changes: Record<string, unknown> = {};
  const after = customerOut(c) as Record<string, unknown>;
  for (const [k, v] of Object.entries(JSON.parse(before))) if (JSON.stringify(v) !== JSON.stringify(after[k])) changes[k] = after[k];
  logAudit(user.id, "Update", "Customer", c.id, changes);
  save();
  return customerOut(c);
});

del("/customers/:id", ({ db, user, params }) => {
  if (!isAdmin(user.role) && !isManager(user.role)) forbid();
  const c = db.customers.find((x) => x.id === params[0] && isActiveCustomer(x));
  if (!c || !visibleCustomers(db, user).some((x) => x.id === c.id)) return notFound("Customer");
  c.archivedAt = new Date().toISOString();
  logAudit(user.id, "Delete", "Customer", c.id, { name: c.name });
  save();
});

/** Minimal CSV parser: quoted fields, commas, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cur);
      cur = "";
    }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

post("/customers/import", ({ db, user, q, text }) => {
  if (!canImportCustomers(user.role)) forbid("Your role cannot import customers.");
  const dryRun = q.get("dryRun") !== "false";
  const update = q.get("onDuplicate") === "update";
  const allowPossible = q.get("allowPossibleDuplicates") === "true";
  const [head, ...lines] = parseCsv(text);
  if (!head) bad("The file is empty.");
  const cols = head.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const col = (r: string[], n: string) => (r[cols.indexOf(n)] ?? "").trim();
  if (!cols.includes("name") || !cols.includes("type")) bad("The file needs at least the columns type and name.");
  const existing = visibleCustomers(db, user);
  const rows: { row: number; status: string; message: string | null; customerId: string | null; matchedCustomerId: string | null }[] = [];
  const pending: Customer[] = [];
  lines.forEach((r, i) => {
    const row = i + 2;
    const name = col(r, "name");
    const type = col(r, "type");
    if (!name) return rows.push({ row, status: "error", message: "Name is required.", customerId: null, matchedCustomerId: null });
    if (!type) return rows.push({ row, status: "error", message: "Type is required.", customerId: null, matchedCustomerId: null });
    const terrName = col(r, "territory");
    const territory = terrName ? db.territories.find((t) => t.name.toLowerCase() === terrName.toLowerCase()) : undefined;
    if (terrName && !territory) return rows.push({ row, status: "error", message: `Unknown territory "${terrName}".`, customerId: null, matchedCustomerId: null });
    const lat = col(r, "latitude");
    const lon = col(r, "longitude");
    const cand: Customer = {
      id: uuid("cust"),
      type,
      name,
      specialty: col(r, "specialty") || null,
      segment: col(r, "segment") || "Unclassified",
      territoryId: territory?.id ?? user.territoryId,
      parentCustomerId: null,
      phone: col(r, "phone") || null,
      email: col(r, "email") || null,
      address: col(r, "address") || null,
      city: col(r, "city") || null,
      latitude: lat ? Number(lat) : null,
      longitude: lon ? Number(lon) : null,
      targetVisitsPerMonth: Number(col(r, "target_visits_per_month")) || 1,
      productInterests: [],
      channel: "Direct",
      distributorId: null,
      createdAt: new Date().toISOString(),
    };
    if ((lat && Number.isNaN(cand.latitude)) || (lon && Number.isNaN(cand.longitude))) return rows.push({ row, status: "error", message: "Latitude and longitude must be numbers.", customerId: null, matchedCustomerId: null });
    const pool = [...existing, ...pending];
    const exact = pool.find((x) => normaliseName(x.name) === normaliseName(cand.name) && (x.city ?? "").toLowerCase() === (cand.city ?? "").toLowerCase());
    const samePhone = cand.phone ? pool.find((x) => normalisePhone(x.phone).length >= 7 && normalisePhone(x.phone) === normalisePhone(cand.phone)) : undefined;
    if (exact || samePhone) {
      const m = (exact ?? samePhone)!;
      if (update && existing.some((x) => x.id === m.id)) {
        if (!dryRun) {
          for (const k of ["specialty", "segment", "phone", "email", "address", "city"] as const) if (cand[k] && cand[k] !== "Unclassified") (m as any)[k] = cand[k];
          logAudit(user.id, "Update", "Customer", m.id, { source: "csv import" });
        }
        return rows.push({ row, status: "updated", message: null, customerId: m.id, matchedCustomerId: m.id });
      }
      return rows.push({ row, status: "duplicate", message: `Already exists as "${m.name}".`, customerId: null, matchedCustomerId: m.id });
    }
    const near = findDuplicates([...pool, cand]).find((p) => p.a === cand.id || p.b === cand.id);
    if (near && !allowPossible) return rows.push({ row, status: "possible_duplicate", message: `Looks like an existing customer (${near.reasons.join(", ")}).`, customerId: null, matchedCustomerId: near.a === cand.id ? near.b : near.a });
    pending.push(cand);
    rows.push({ row, status: "created", message: null, customerId: cand.id, matchedCustomerId: null });
  });
  if (!dryRun) {
    db.customers.push(...pending);
    pending.forEach((c) => logAudit(user.id, "Create", "Customer", c.id, { source: "csv import" }));
    save();
  }
  const n = (s: string) => rows.filter((x) => x.status === s).length;
  return { dryRun, total: rows.length, created: n("created"), updated: n("updated"), skipped: n("duplicate") + n("possible_duplicate"), errors: n("error"), rows };
});

/* ---------------- admin: territories, users, products, audit ---------------- */

get("/admin/territories", ({ db }) => db.territories);
post("/admin/territories", ({ db, user, body }) => {
  if (!isAdmin(user.role)) forbid("Only an Admin or National Sales Manager can add territories.");
  if (!body.name?.trim()) bad("Name is required.");
  const t = { id: uuid("terr"), name: body.name.trim(), region: body.region ?? null, district: body.district ?? null };
  db.territories.push(t);
  logAudit(user.id, "Create", "Territory", t.id, t);
  save();
  return reply(201, t);
});
put("/admin/territories/:id", ({ db, user, params, body }) => {
  if (!isAdmin(user.role)) forbid();
  const t = db.territories.find((x) => x.id === params[0]) ?? notFound("Territory");
  if (!body.name?.trim()) bad("Name is required.");
  Object.assign(t, { name: body.name.trim(), region: body.region ?? null, district: body.district ?? null });
  logAudit(user.id, "Update", "Territory", t.id, body);
  save();
  return t;
});
del("/admin/territories/:id", ({ db, user, params }) => {
  if (!isAdmin(user.role)) forbid();
  const t = db.territories.find((x) => x.id === params[0]) ?? notFound("Territory");
  if (db.customers.some((c) => c.territoryId === t.id && isActiveCustomer(c)) || db.users.some((u) => u.territoryId === t.id)) throw new HttpError(409, "This territory still has customers or people. Move them first.");
  db.territories = db.territories.filter((x) => x !== t);
  logAudit(user.id, "Delete", "Territory", t.id, { name: t.name });
  save();
});

const appUser = (u: User) => ({ ...publicUser(u), externalId: u.externalId, managerId: u.managerId, isActive: u.isActive });
get("/admin/users", ({ db, user, q }) => {
  if (!isManager(user.role)) forbid("Only managers can list users.");
  const people = visibleUserIds(db, user);
  const all = q.get("includeInactive") === "true";
  return db.users.filter((u) => (isWide(user) || people.has(u.id)) && (all || u.isActive)).map(appUser);
});
post("/admin/users", ({ db, user, body }) => {
  if (!isAdmin(user.role)) forbid("Only an Admin or National Sales Manager can add users.");
  if (!body.fullName?.trim() || !body.email?.trim()) bad("Name and email are required.");
  if (db.users.some((u) => u.email.toLowerCase() === body.email.toLowerCase())) throw new HttpError(409, "Someone with that email already exists.");
  const role = body.role ?? "Rep";
  const distributorId = role === "Distributor" ? (body.distributorId as string | undefined) : undefined;
  if (role === "Distributor" && !db.distributors.some((d) => d.id === distributorId)) bad("A distributor user needs a valid distributorId.");
  const u: User = { id: uuid("user"), tenantId: user.tenantId, fullName: body.fullName.trim(), email: body.email.trim(), role, territoryId: body.territoryId ?? null, externalId: body.externalId || uuid("ext"), managerId: body.managerId ?? null, isActive: true, distributorId: distributorId ?? null };
  db.users.push(u);
  logAudit(user.id, "Create", "User", u.id, { role });
  save();
  return reply(201, appUser(u));
});
post("/admin/users/:id/:action", ({ db, user, params }) => {
  if (!isAdmin(user.role)) forbid();
  const u = db.users.find((x) => x.id === params[0]) ?? notFound("User");
  if (!["deactivate", "reactivate"].includes(params[1])) return notFound("Action");
  if (u.id === user.id) throw new HttpError(409, "You cannot deactivate yourself.");
  u.isActive = params[1] === "reactivate";
  logAudit(user.id, params[1] === "reactivate" ? "Reactivate" : "Deactivate", "User", u.id);
  save();
});

get("/admin/products", ({ db }) => db.products);
put("/admin/products/:id", ({ db, user, params, body }) => {
  if (!isAdmin(user.role)) forbid("Only an Admin or National Sales Manager can change products.");
  const p = db.products.find((x) => x.id === params[0]) ?? notFound("Product");
  const before = { ...p };
  for (const k of ["name", "therapeuticArea", "standardCost", "listPrice", "reorderLevel", "sampleLimitPerCustomer", "sampleLimitDays"] as const) if (body[k] !== undefined) (p as any)[k] = body[k];
  logAudit(user.id, "Update", "Product", p.id, Object.fromEntries(Object.entries(p).filter(([k, v]) => (before as any)[k] !== v)));
  save();
});

get("/admin/audit-logs", ({ db, user, q }) => {
  if (!isManager(user.role)) forbid("Only managers can read the audit trail.");
  const before = num(q.get("before"), Infinity);
  const take = Math.min(200, num(q.get("take"), 50));
  return db.audit
    .filter((a) => a.id < before)
    .sort((a, b) => b.id - a.id)
    .slice(0, take);
});

/* ---------------- notifications ---------------- */

get("/notifications", ({ db, user }) =>
  db.notifications
    .filter((n) => n.userId === null || n.userId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30),
);
post("/notifications/:id/read", ({ db, user, params }) => {
  const n = db.notifications.find((x) => x.id === params[0] && (x.userId === null || x.userId === user.id)) ?? notFound("Notification");
  n.readAt = new Date().toISOString();
  save();
});

/* ---------------- deals ---------------- */

const dealOut = (db: DB, d: Deal) => ({ ...d, customerName: db.customers.find((c) => c.id === d.customerId)?.name ?? "—", ownerName: db.users.find((u) => u.id === d.ownerId)?.fullName ?? "—" });

get("/deals", ({ db, user }) => {
  requireFeature(user, "deals");
  const people = visibleUserIds(db, user);
  return db.deals.filter((d) => people.has(d.ownerId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((d) => dealOut(db, d));
});
post("/deals", ({ db, user, body }) => {
  requireFeature(user, "deals");
  if (!body.title?.trim()) bad("Give the deal a title.");
  if (!db.customers.some((c) => c.id === body.customerId && isActiveCustomer(c))) bad("Choose a customer.");
  const value = Number(body.value);
  if (!Number.isFinite(value) || value < 0) bad("Value must be a number of zero or more.");
  const people = visibleUserIds(db, user);
  const ownerId = body.ownerId && people.has(body.ownerId) ? body.ownerId : user.id;
  const now = new Date().toISOString();
  const d: Deal = { id: uuid("deal"), title: body.title.trim(), customerId: body.customerId, ownerId, stage: "Lead", value, expectedClose: body.expectedClose ? new Date(body.expectedClose).toISOString() : new Date(Date.now() + 30 * 864e5).toISOString(), createdAt: now, updatedAt: now, lostReason: null };
  db.deals.push(d);
  logAudit(user.id, "Create", "Deal", d.id, { title: d.title, value });
  save();
  return reply(201, dealOut(db, d));
});
put("/deals/:id", ({ db, user, params, body }) => {
  requireFeature(user, "deals");
  const d = db.deals.find((x) => x.id === params[0]) ?? notFound("Deal");
  if (!visibleUserIds(db, user).has(d.ownerId)) forbid("This deal belongs to someone outside your team.");
  if (body.title !== undefined) d.title = String(body.title).trim() || d.title;
  if (body.value !== undefined && Number.isFinite(Number(body.value))) d.value = Number(body.value);
  if (body.expectedClose) d.expectedClose = new Date(body.expectedClose).toISOString();
  d.updatedAt = new Date().toISOString();
  logAudit(user.id, "Update", "Deal", d.id, body);
  save();
  return dealOut(db, d);
});
post("/deals/:id/stage", ({ db, user, params, body }) => {
  requireFeature(user, "deals");
  const d = db.deals.find((x) => x.id === params[0]) ?? notFound("Deal");
  if (!visibleUserIds(db, user).has(d.ownerId)) forbid("This deal belongs to someone outside your team.");
  const stage = body.stage as DealStage;
  if (!DEAL_STAGES.includes(stage)) bad("Unknown stage.");
  if (stage === "Lost" && !body.lostReason?.trim()) bad("Say why the deal was lost.");
  const from = d.stage;
  d.stage = stage;
  d.lostReason = stage === "Lost" ? body.lostReason.trim() : null;
  d.updatedAt = new Date().toISOString();
  logAudit(user.id, "Stage", "Deal", d.id, { from, to: stage });
  save();
  return dealOut(db, d);
});
del("/deals/:id", ({ db, user, params }) => {
  requireFeature(user, "deals");
  const d = db.deals.find((x) => x.id === params[0]) ?? notFound("Deal");
  if (!visibleUserIds(db, user).has(d.ownerId)) forbid();
  db.deals = db.deals.filter((x) => x !== d);
  logAudit(user.id, "Delete", "Deal", d.id, { title: d.title });
  save();
});

/* ---------------- tasks ---------------- */

const taskOut = (db: DB, t: Task) => ({ ...t, customerName: db.customers.find((c) => c.id === t.customerId)?.name ?? null, ownerName: db.users.find((u) => u.id === t.ownerId)?.fullName ?? "—" });
get("/tasks", ({ db, user }) => {
  requireFeature(user, "activities");
  const people = visibleUserIds(db, user);
  return db.tasks.filter((t) => people.has(t.ownerId)).sort((a, b) => a.dueAt.localeCompare(b.dueAt)).map((t) => taskOut(db, t));
});
post("/tasks", ({ db, user, body }) => {
  requireFeature(user, "activities");
  if (!body.title?.trim()) bad("Give the task a title.");
  const t: Task = { id: uuid("task"), title: body.title.trim(), dueAt: body.dueAt ? new Date(body.dueAt).toISOString() : new Date(Date.now() + 864e5).toISOString(), ownerId: user.id, customerId: body.customerId ?? null, done: false, createdAt: new Date().toISOString() };
  db.tasks.push(t);
  save();
  return reply(201, taskOut(db, t));
});
post("/tasks/:id/toggle", ({ db, user, params }) => {
  requireFeature(user, "activities");
  const t = db.tasks.find((x) => x.id === params[0]) ?? notFound("Task");
  if (!visibleUserIds(db, user).has(t.ownerId)) forbid();
  t.done = !t.done;
  save();
  return taskOut(db, t);
});
del("/tasks/:id", ({ db, user, params }) => {
  requireFeature(user, "activities");
  const t = db.tasks.find((x) => x.id === params[0]) ?? notFound("Task");
  if (t.ownerId !== user.id && !isManager(user.role)) forbid();
  db.tasks = db.tasks.filter((x) => x !== t);
  save();
});

/* ---------------- visits (GPS-verified, hash-chained, safe to retry) ---------------- */

const visitOut = (db: DB, v: Visit) => ({ ...v, customerName: db.customers.find((c) => c.id === v.customerId)?.name ?? "—", repName: db.users.find((u) => u.id === v.repId)?.fullName ?? "—" });

get("/visits", ({ db, user, q }) => {
  requireFeature(user, "activities");
  const people = visibleUserIds(db, user);
  const r = range(q, 3650);
  return db.visits
    .filter((v) => people.has(v.repId) && inRange(v.at, r) && (!q.get("repId") || v.repId === q.get("repId")) && (!q.get("customerId") || v.customerId === q.get("customerId")))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, Math.min(500, num(q.get("take"), 50)))
    .map((v) => visitOut(db, v));
});

function recordVisit(db: DB, user: User, b: any): { visit: Visit; duplicate: boolean } {
  if (!b.clientId || typeof b.clientId !== "string") bad("Every visit needs a clientId so a retry is not saved twice.");
  const dup = db.visits.find((v) => v.clientId === b.clientId && v.repId === user.id);
  if (dup) return { visit: dup, duplicate: true };
  const customer = db.customers.find((c) => c.id === b.customerId && isActiveCustomer(c)) ?? bad("Unknown customer.");
  const at = b.at ? Date.parse(b.at) : Date.now();
  if (!Number.isFinite(at)) bad("The visit time is not valid.");
  if (at > Date.now() + 5 * 60_000) bad("The visit time is in the future.");
  if (Date.now() - at > 14 * 864e5) bad("Visits older than 14 days cannot be synced. Ask your manager to record it with a reason.");
  const lat = typeof b.latitude === "number" ? b.latitude : null;
  const lon = typeof b.longitude === "number" ? b.longitude : null;
  // The server decides whether the visit counts as verified. The device only reports where it was.
  const check = verifyCheckIn({ latitude: lat, longitude: lon }, customer);
  const last = db.visits[db.visits.length - 1];
  const base: Omit<Visit, "prevHash" | "hash"> = {
    id: uuid("visit"),
    clientId: b.clientId,
    repId: user.id,
    customerId: customer.id,
    at: new Date(at).toISOString(),
    kind: b.kind === "Call" ? "Call" : "Visit",
    outcome: String(b.outcome ?? "Information shared").slice(0, 80),
    notes: b.notes ? String(b.notes).slice(0, 1000) : null,
    durationMin: Number.isFinite(Number(b.durationMin)) ? Number(b.durationMin) : null,
    productIds: Array.isArray(b.productIds) ? b.productIds.filter((p: unknown) => db.products.some((x) => x.id === p)) : [],
    latitude: lat,
    longitude: lon,
    distanceM: check.distanceM,
    verified: check.verified,
    verifyReason: check.reason ?? null,
    receivedAt: new Date().toISOString(),
  };
  const prevHash = last?.hash ?? GENESIS;
  const visit = { ...base, prevHash, hash: chainHash(prevHash, visitPayload(base)) };
  db.visits.push(visit);
  return { visit, duplicate: false };
}

post("/visits", ({ db, user, body }) => {
  requireFeature(user, "activities");
  const { visit, duplicate } = recordVisit(db, user, body);
  if (!duplicate) save();
  return reply(duplicate ? 200 : 201, visitOut(db, visit));
});

/** Upload for visits recorded offline. Each is checked on its own; one bad record does not block the rest. */
post("/visits/sync", ({ db, user, body }) => {
  requireFeature(user, "activities");
  const items: any[] = Array.isArray(body.visits) ? body.visits : [];
  const results = items.map((b) => {
    try {
      const { visit, duplicate } = recordVisit(db, user, b);
      return { clientId: b.clientId, ok: true, duplicate, id: visit.id, verified: visit.verified, verifyReason: visit.verifyReason };
    } catch (e) {
      return { clientId: b?.clientId ?? null, ok: false, duplicate: false, error: e instanceof Error ? e.message : "Failed" };
    }
  });
  save();
  return { accepted: results.filter((r) => r.ok).length, rejected: results.filter((r) => !r.ok).length, results };
});

/* ---------------- orders (the order app and the CRM) ---------------- */

const DAY_MS = 864e5;

/**
 * An indication only: units in the warehouse across released batches. It does not reserve stock,
 * and orders can still be placed when it says Out; it tells the rep what to expect.
 */
function availability(db: DB, productId: string): "In stock" | "Low" | "Out" {
  const ok = new Set(db.batches.filter((b) => b.productId === productId && b.status === "Active").map((b) => b.id));
  const units = db.stock.filter((s) => s.holderId === null && ok.has(s.batchId)).reduce((n, s) => n + s.quantity, 0);
  const reorder = db.products.find((p) => p.id === productId)?.reorderLevel ?? 0;
  return units <= 0 ? "Out" : units < reorder ? "Low" : "In stock";
}

/** Everything the order app needs to work offline: products with prices, and this person's customers. */
get("/orders/catalog", ({ db, user }) => {
  requireFeature(user, "orders");
  return {
    generatedAt: new Date().toISOString(),
    rules: { confirmAboveQty: CONFIRM_ABOVE_QTY, maxLineQty: MAX_LINE_QTY },
    products: db.products.map((p) => ({ id: p.id, name: p.name, therapeuticArea: p.therapeuticArea, listPrice: p.listPrice, availability: availability(db, p.id) })),
    customers: visibleCustomers(db, user).map((c) => {
      const d = c.channel === "Distributor" ? db.distributors.find((x) => x.id === c.distributorId) : undefined;
      return { id: c.id, name: c.name, city: c.city, channel: c.channel, distributorId: c.distributorId, discountPct: d?.discountPct ?? 0 };
    }),
  };
});

function placeOrder(db: DB, user: User, b: any): { order: OrderRecord; duplicate: boolean } {
  if (!b.clientId || typeof b.clientId !== "string") bad("Every order needs a clientId so a retry is not saved twice.");
  const dup = db.orders.find((o) => o.clientId === b.clientId && o.placedBy === user.id);
  if (dup) return { order: dup, duplicate: true };
  const customer = visibleCustomers(db, user).find((c) => c.id === b.customerId) ?? bad("Unknown customer, or not one of yours.");
  const checked = checkLines(b.lines, (id) => db.products.some((p) => p.id === id));
  if (!checked.ok) bad(checked.error);
  const at = b.at ? Date.parse(b.at) : Date.now();
  if (!Number.isFinite(at)) bad("The order time is not valid.");
  if (at > Date.now() + 5 * 60_000) bad("The order time is in the future.");
  if (Date.now() - at > 14 * DAY_MS) bad("Orders older than 14 days cannot be synced. Place it again.");
  const dist = customer.channel === "Distributor" ? db.distributors.find((d) => d.id === customer.distributorId) : undefined;
  const lines = (checked as Extract<typeof checked, { ok: true }>).lines.map((l) => {
    const p = db.products.find((x) => x.id === l.productId)!;
    // Prices come from the server's price list, never from the phone.
    return { productId: p.id, name: p.name, qty: l.qty, unitPrice: unitPrice(p.listPrice, dist?.discountPct ?? 0) };
  });
  const territory = db.territories.find((t) => t.id === customer.territoryId);
  const order: OrderRecord = {
    id: uuid("ord"),
    clientId: b.clientId,
    placedBy: user.id,
    customerId: customer.id,
    channel: customer.channel,
    distributorId: customer.channel === "Distributor" ? customer.distributorId : null,
    region: territory?.region ?? "Unassigned",
    orderedAt: new Date(at).toISOString(),
    confirmedAt: new Date(at).toISOString(),
    promisedAt: new Date(at + (customer.channel === "Direct" ? 3 : 5) * DAY_MS).toISOString(),
    deliveredAt: null,
    unitsOrdered: lines.reduce((n, l) => n + l.qty, 0),
    unitsDelivered: 0,
    revenue: 0,
    logisticsCost: 0,
    distributionCost: 0,
    salesCost: 0,
    lines,
    orderValue: orderValue(lines),
    notes: b.notes ? String(b.notes).slice(0, 500) : null,
  };
  db.orders.push(order);
  logAudit(user.id, "Create", "Order", order.id, { customerId: customer.id, units: order.unitsOrdered, value: order.orderValue, via: "order app" });
  return { order, duplicate: false };
}

export const orderStatus = (o: OrderRecord): "Placed" | "Confirmed" | "Delivered" | "Cancelled" => (o.cancelledAt ? "Cancelled" : o.deliveredAt ? "Delivered" : o.confirmedBy || !o.placedBy ? "Confirmed" : "Placed");

const orderOut = (db: DB, o: OrderRecord) => ({
  id: o.id,
  clientId: o.clientId ?? null,
  customerId: o.customerId,
  customerName: db.customers.find((c) => c.id === resolveCustomerId(db, o.customerId))?.name ?? "Unknown",
  placedBy: o.placedBy ? (db.users.find((u) => u.id === o.placedBy)?.fullName ?? null) : null,
  orderedAt: o.orderedAt,
  promisedAt: o.promisedAt,
  deliveredAt: o.deliveredAt,
  status: orderStatus(o),
  cancelReason: o.cancelReason ?? null,
  notes: o.notes ?? null,
  units: o.unitsOrdered,
  unitsDelivered: o.unitsDelivered,
  value: o.orderValue ?? (o.revenue || null),
  lines: o.lines ?? [],
});

post("/orders", ({ db, user, body }) => {
  requireFeature(user, "orders");
  const { order, duplicate } = placeOrder(db, user, body);
  if (!duplicate) save();
  return reply(duplicate ? 200 : 201, orderOut(db, order));
});

/** Upload for orders taken offline. Each is checked on its own; one bad order does not block the rest. */
post("/orders/sync", ({ db, user, body }) => {
  requireFeature(user, "orders");
  const items: any[] = Array.isArray(body.orders) ? body.orders : [];
  const results = items.map((b) => {
    try {
      const { order, duplicate } = placeOrder(db, user, b);
      return { clientId: b.clientId, ok: true, duplicate, id: order.id, value: order.orderValue };
    } catch (e) {
      return { clientId: b?.clientId ?? null, ok: false, duplicate: false, error: e instanceof Error ? e.message : "Failed" };
    }
  });
  save();
  return { accepted: results.filter((r) => r.ok).length, rejected: results.filter((r) => !r.ok).length, results };
});

/** This person's own recent orders, newest first. */
get("/orders/mine", ({ db, user }) => {
  requireFeature(user, "orders");
  return db.orders.filter((o) => o.placedBy === user.id).slice(-50).reverse().map((o) => orderOut(db, o));
});

/** Orders for managers: everything for the customers they can see, newest first. Filter with ?status and ?q. */
get("/orders", ({ db, user, q }) => {
  requireFeature(user, "orders");
  if (!isManager(user.role)) forbid("Managers see all orders. Reps see theirs under /orders/mine.");
  const ok = new Set(visibleCustomers(db, user).map((c) => c.id));
  const status = q.get("status");
  const text = (q.get("q") ?? "").toLowerCase();
  return db.orders
    .filter((o) => ok.has(resolveCustomerId(db, o.customerId)))
    .map((o) => orderOut(db, o))
    .filter((o) => (!status || o.status === status) && (!text || o.customerName.toLowerCase().includes(text) || (o.placedBy ?? "").toLowerCase().includes(text)))
    .sort((a, b) => b.orderedAt.localeCompare(a.orderedAt))
    .slice(0, Math.min(num(q.get("take"), 100), 300));
});

function findOrder(db: DB, user: User, id: string): OrderRecord {
  const o = db.orders.find((x) => x.id === id) ?? notFound("Order");
  const ok = visibleCustomers(db, user).some((c) => c.id === resolveCustomerId(db, o.customerId));
  if (!ok && o.placedBy !== user.id) notFound("Order");
  return o;
}

/** A rep may cancel their own order until a manager confirms it. A manager may cancel until it is delivered. */
post("/orders/:id/cancel", ({ db, user, params, body }) => {
  requireFeature(user, "orders");
  const o = findOrder(db, user, params[0]);
  const status = orderStatus(o);
  if (status === "Cancelled") return orderOut(db, o);
  if (status === "Delivered") bad("A delivered order cannot be cancelled.");
  const own = o.placedBy === user.id;
  if (!isManager(user.role) && !(own && status === "Placed")) forbid(own ? "A manager has confirmed this order. Ask them to cancel it." : "You can only cancel your own orders.");
  const reason = String(body.reason ?? "").trim().slice(0, 200);
  if (!reason) bad("Say why the order is being cancelled.");
  o.cancelledAt = new Date().toISOString();
  o.cancelledBy = user.id;
  o.cancelReason = reason;
  logAudit(user.id, "Cancel", "Order", o.id, { status }, reason);
  save();
  return orderOut(db, o);
});

post("/orders/:id/confirm", ({ db, user, params }) => {
  requireFeature(user, "orders");
  if (!isManager(user.role)) forbid("Only managers confirm orders.");
  const o = findOrder(db, user, params[0]);
  const status = orderStatus(o);
  if (status === "Confirmed") return orderOut(db, o);
  if (status !== "Placed") bad(`A ${status.toLowerCase()} order cannot be confirmed.`);
  o.confirmedBy = user.id;
  o.confirmedAt = new Date().toISOString();
  logAudit(user.id, "Confirm", "Order", o.id);
  save();
  return orderOut(db, o);
});

/** Records a delivery. Revenue is counted now, in proportion to the units delivered. */
post("/orders/:id/deliver", ({ db, user, params, body }) => {
  requireFeature(user, "orders");
  if (!isManager(user.role)) forbid("Only managers record deliveries.");
  const o = findOrder(db, user, params[0]);
  const status = orderStatus(o);
  if (status === "Delivered") return orderOut(db, o);
  if (status === "Cancelled") bad("A cancelled order cannot be delivered.");
  const units = body.unitsDelivered === undefined ? o.unitsOrdered : Number(body.unitsDelivered);
  if (!Number.isInteger(units) || units < 0 || units > o.unitsOrdered) bad(`Units delivered must be a whole number from 0 to ${o.unitsOrdered}.`);
  const value = o.orderValue ?? o.revenue;
  o.deliveredAt = new Date().toISOString();
  o.confirmedBy ??= user.id;
  o.unitsDelivered = units;
  o.revenue = Math.round(value * (units / o.unitsOrdered) * 100) / 100;
  logAudit(user.id, "Deliver", "Order", o.id, { unitsDelivered: units, of: o.unitsOrdered });
  save();
  return orderOut(db, o);
});
