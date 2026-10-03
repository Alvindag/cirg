import { forbid, HttpError, requireFeature, visibleUserIds } from "../access";
import { bad, get, notFound, post, reply, num } from "../router";
import { logAudit, save } from "../store";
import { canApproveSamples, isAdmin, isManager } from "@/lib/das/roles";
import type { Batch, DB, Ledger, SampleRequest, User } from "../model";
import { inRange, range } from "./core";

const id = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const DAY = 864e5;

function lot(db: DB, batchId: string, holderId: string | null) {
  let l = db.stock.find((s) => s.batchId === batchId && s.holderId === holderId);
  if (!l) db.stock.push((l = { batchId, holderId, quantity: 0 }));
  return l;
}
function ledger(db: DB, user: User, kind: Ledger["kind"], batchId: string, holderId: string | null, delta: number, reason: string | null) {
  db.ledger.push({ id: id("led"), kind, batchId, holderId, delta, reason, at: new Date().toISOString(), userId: user.id });
}
const usable = (b: Batch) => b.status === "Active" && Date.parse(b.expiryDate) > Date.now();

/* ---------------- requests ---------------- */

get("/samples/requests", ({ db, user, q }) => {
  requireFeature(user, "samples");
  const people = visibleUserIds(db, user);
  return db.sampleRequests
    .filter((r) => people.has(r.repId) && (!q.get("status") || r.status === q.get("status")) && (!q.get("repId") || r.repId === q.get("repId")))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
});

post("/samples/requests", ({ db, user, body }) => {
  requireFeature(user, "samples");
  const p = db.products.find((x) => x.id === body.productId) ?? bad("Choose a product.");
  const quantity = Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) bad("Quantity must be a whole number of 1 or more.");
  const r: SampleRequest = { id: id("req"), repId: user.id, productId: p.id, quantity, approvedQuantity: null, status: "Pending", notes: body.notes?.trim() || null, decisionNote: null, createdAt: new Date().toISOString() };
  db.sampleRequests.push(r);
  logAudit(user.id, "Create", "SampleRequest", r.id, { product: p.name, quantity });
  save();
  return reply(201, r);
});

function decide(db: DB, user: User, rid: string) {
  if (!canApproveSamples(user.role)) forbid("Your role cannot decide sample requests.");
  const r = db.sampleRequests.find((x) => x.id === rid) ?? notFound("Request");
  if (!visibleUserIds(db, user).has(r.repId) || r.repId === user.id) forbid("You can only decide requests from people who report to you.");
  return r;
}

post("/samples/requests/:id/approve", ({ db, user, params, body }) => {
  const r = decide(db, user, params[0]);
  if (r.status !== "Pending") throw new HttpError(409, `This request is already ${r.status.toLowerCase()}.`);
  const qty = Number(body.quantity ?? r.quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > r.quantity) bad(`Approve a whole number from 1 to ${r.quantity}.`);
  r.status = "Approved";
  r.approvedQuantity = qty;
  logAudit(user.id, "Approve", "SampleRequest", r.id, { quantity: qty });
  save();
  return r;
});
post("/samples/requests/:id/reject", ({ db, user, params, body }) => {
  const r = decide(db, user, params[0]);
  if (r.status !== "Pending") throw new HttpError(409, `This request is already ${r.status.toLowerCase()}.`);
  if (!body.note?.trim()) bad("Say why the request is rejected.");
  r.status = "Rejected";
  r.decisionNote = body.note.trim();
  logAudit(user.id, "Reject", "SampleRequest", r.id, { note: r.decisionNote });
  save();
  return r;
});
/** Moves approved quantity from the warehouse to the rep, oldest usable batch first (FEFO). */
post("/samples/requests/:id/fulfil", ({ db, user, params, body }) => {
  if (!isAdmin(user.role)) forbid("Only an Admin or National Sales Manager can issue stock.");
  const r = db.sampleRequests.find((x) => x.id === params[0]) ?? notFound("Request");
  if (r.status !== "Approved") throw new HttpError(409, "Only approved requests can be fulfilled.");
  let need = r.approvedQuantity ?? r.quantity;
  const lots = db.stock
    .filter((s) => s.holderId === null && s.quantity > 0)
    .map((s) => ({ s, b: db.batches.find((b) => b.id === s.batchId)! }))
    .filter((x) => x.b.productId === r.productId && usable(x.b))
    .sort((a, b) => a.b.expiryDate.localeCompare(b.b.expiryDate));
  const available = lots.reduce((n, x) => n + x.s.quantity, 0);
  if (available < need) {
    if (!body.allowPartial || available === 0) throw new HttpError(409, `Not enough usable stock in the warehouse (${available} units available).`);
    need = available;
  }
  const allocations: { batchId: string; quantity: number }[] = [];
  for (const { s, b } of lots) {
    if (need <= 0) break;
    const take = Math.min(need, s.quantity);
    s.quantity -= take;
    lot(db, b.id, r.repId).quantity += take;
    ledger(db, user, "Issue", b.id, null, -take, `Request ${r.id}`);
    ledger(db, user, "Issue", b.id, r.repId, take, `Request ${r.id}`);
    allocations.push({ batchId: b.id, quantity: take });
    need -= take;
  }
  r.status = "Fulfilled";
  r.allocations = allocations;
  db.notifications.push({ id: id("n"), userId: r.repId, kind: "Notice", title: "Samples issued", body: `${r.approvedQuantity ?? r.quantity} units were added to your stock.`, createdAt: new Date().toISOString(), readAt: null });
  logAudit(user.id, "Fulfil", "SampleRequest", r.id, { allocations });
  save();
  return { allocations };
});

/* ---------------- stock ---------------- */

get("/samples/reports/stock", ({ db, user }) => {
  requireFeature(user, "samples");
  const people = visibleUserIds(db, user);
  const now = Date.now();
  return db.stock
    .filter((s) => s.quantity > 0 && (s.holderId === null || people.has(s.holderId)))
    .map((s) => {
      const b = db.batches.find((x) => x.id === s.batchId)!;
      const days = Math.floor((Date.parse(b.expiryDate) - now) / DAY);
      const expired = days < 0;
      const expiringSoon = !expired && days <= 90;
      return { holderId: s.holderId, location: s.holderId ? "Rep" : "Warehouse", batchId: b.id, productId: b.productId, batchNumber: b.batchNumber, expiryDate: b.expiryDate, daysToExpiry: days, status: b.status, quantity: s.quantity, expired, expiringSoon, actionRequired: expired || b.status !== "Active" };
    })
    .sort((a, b) => a.daysToExpiry - b.daysToExpiry);
});

post("/samples/receipts", ({ db, user, body }) => {
  if (!isAdmin(user.role)) forbid("Only an Admin or National Sales Manager can receive stock.");
  const b = db.batches.find((x) => x.id === body.batchId) ?? notFound("Batch");
  const q = Number(body.quantity);
  if (!Number.isInteger(q) || q < 1) bad("Quantity must be a whole number of 1 or more.");
  lot(db, b.id, null).quantity += q;
  ledger(db, user, "Receipt", b.id, null, q, body.note ?? null);
  logAudit(user.id, "Receipt", "Batch", b.id, { quantity: q });
  save();
});
post("/samples/adjustments", ({ db, user, body }) => {
  if (!isAdmin(user.role)) forbid("Only an Admin or National Sales Manager can adjust stock.");
  const b = db.batches.find((x) => x.id === body.batchId) ?? notFound("Batch");
  const delta = Number(body.delta);
  if (!Number.isInteger(delta) || delta === 0) bad("The change must be a whole number other than zero.");
  if (!body.reason?.trim()) bad("A reason is required and is kept in the audit trail.");
  const l = lot(db, b.id, body.holderId ?? null);
  if (l.quantity + delta < 0) throw new HttpError(409, `Only ${l.quantity} units are held there.`);
  l.quantity += delta;
  const kind = body.type === "WriteOff" || delta < 0 ? "WriteOff" : "Adjustment";
  ledger(db, user, kind, b.id, body.holderId ?? null, delta, body.reason.trim());
  logAudit(user.id, kind, "Batch", b.id, { delta }, body.reason.trim());
  save();
});
post("/samples/returns", ({ db, user, body }) => {
  requireFeature(user, "samples");
  const repId = body.repId ?? user.id;
  if (repId !== user.id && !isAdmin(user.role) && !canApproveSamples(user.role)) forbid();
  const b = db.batches.find((x) => x.id === body.batchId) ?? notFound("Batch");
  const qty = Number(body.quantity);
  const from = lot(db, b.id, repId);
  if (!Number.isInteger(qty) || qty < 1 || qty > from.quantity) bad(`Return a whole number from 1 to ${from.quantity}.`);
  from.quantity -= qty;
  lot(db, b.id, null).quantity += qty;
  ledger(db, user, "Return", b.id, repId, -qty, body.note ?? "Returned to warehouse");
  ledger(db, user, "Return", b.id, null, qty, body.note ?? "Returned to warehouse");
  logAudit(user.id, "Return", "Batch", b.id, { repId, quantity: qty });
  save();
});

/* ---------------- batches ---------------- */

get("/samples/batches", ({ db, user, q }) => {
  requireFeature(user, "samples");
  const all = q.get("includeExpired") === "true";
  return db.batches.filter((b) => all || Date.parse(b.expiryDate) > Date.now());
});
post("/samples/batches", ({ db, user, body }) => {
  if (!isAdmin(user.role)) forbid("Only an Admin or National Sales Manager can register batches.");
  const p = db.products.find((x) => x.id === body.productId) ?? bad("Choose a product.");
  if (!body.batchNumber?.trim()) bad("Batch number is required.");
  if (db.batches.some((b) => b.productId === p.id && b.batchNumber.toLowerCase() === body.batchNumber.trim().toLowerCase())) throw new HttpError(409, "That batch number already exists for this product.");
  const exp = Date.parse(body.expiryDate);
  if (!Number.isFinite(exp)) bad("Enter a valid expiry date.");
  const b: Batch = { id: id("batch"), productId: p.id, batchNumber: body.batchNumber.trim(), expiryDate: new Date(exp).toISOString(), manufacturedAt: body.manufacturedAt ? new Date(body.manufacturedAt).toISOString() : new Date().toISOString(), status: "Active", statusReason: null };
  db.batches.push(b);
  logAudit(user.id, "Create", "Batch", b.id, { batchNumber: b.batchNumber });
  save();
  return reply(201, b);
});
post("/samples/batches/:id/status", ({ db, user, params, body }) => {
  if (!isAdmin(user.role)) forbid("Only an Admin or National Sales Manager can change a batch's status.");
  const b = db.batches.find((x) => x.id === params[0]) ?? notFound("Batch");
  if (!["Active", "Quarantined", "Recalled"].includes(body.status)) bad("Unknown status.");
  if (body.status !== "Active" && !body.reason?.trim()) bad("A reason is required.");
  if (b.status === "Recalled" && body.status !== "Recalled") throw new HttpError(409, "A recalled batch cannot be reactivated.");
  b.status = body.status;
  b.statusReason = body.status === "Active" ? null : body.reason.trim();
  let notified = 0;
  if (body.status === "Recalled" || body.status === "Quarantined") {
    const holders = new Set(db.stock.filter((s) => s.batchId === b.id && s.holderId && s.quantity > 0).map((s) => s.holderId!));
    holders.forEach((h) =>
      db.notifications.push({ id: id("n"), userId: h, kind: body.status === "Recalled" ? "Recall" : "Notice", title: `Batch ${b.batchNumber} ${body.status === "Recalled" ? "recalled" : "quarantined"}`, body: `${b.statusReason} Do not hand out units from this batch.`, createdAt: new Date().toISOString(), readAt: null }),
    );
    notified = holders.size;
  }
  logAudit(user.id, "Status", "Batch", b.id, { status: body.status }, b.statusReason);
  save();
  return { notified };
});

/* ---------------- hand-over to a customer ---------------- */

post("/samples/distributions", ({ db, user, body }) => {
  requireFeature(user, "samples");
  const c = db.customers.find((x) => x.id === body.customerId && !x.archivedAt && !x.mergedInto) ?? bad("Choose a customer.");
  const b = db.batches.find((x) => x.id === body.batchId) ?? bad("Choose a batch.");
  const units = Number(body.units);
  if (!Number.isInteger(units) || units < 1) bad("Units must be a whole number of 1 or more.");
  if (!usable(b)) throw new HttpError(409, `Batch ${b.batchNumber} is ${b.status !== "Active" ? b.status.toLowerCase() : "expired"} and cannot be handed out.`);
  const held = lot(db, b.id, user.id);
  if (held.quantity < units) throw new HttpError(409, `You hold only ${held.quantity} units of batch ${b.batchNumber}.`);
  const p = db.products.find((x) => x.id === b.productId)!;
  if (p.sampleLimitPerCustomer && p.sampleLimitDays) {
    const since = Date.now() - p.sampleLimitDays * DAY;
    const given = db.distributions.filter((d) => d.customerId === c.id && Date.parse(d.at) >= since && db.batches.find((x) => x.id === d.batchId)?.productId === p.id).reduce((n, d) => n + d.units, 0);
    if (given + units > p.sampleLimitPerCustomer) throw new HttpError(409, `${p.name} is limited to ${p.sampleLimitPerCustomer} units per customer every ${p.sampleLimitDays} days. ${c.name} already received ${given}.`);
  }
  held.quantity -= units;
  const d = { id: id("dist-out"), repId: user.id, customerId: c.id, batchId: b.id, units, at: new Date().toISOString(), signed: body.signed === true };
  db.distributions.push(d);
  ledger(db, user, "Distribution", b.id, user.id, -units, d.id);
  logAudit(user.id, "Distribute", "Customer", c.id, { batch: b.batchNumber, units, signed: d.signed });
  save();
  return reply(201, d);
});

/* ---------------- reports ---------------- */

get("/samples/reports/compliance", ({ db, user, q }) => {
  if (!isManager(user.role)) forbid("Only managers can read the compliance report.");
  const r = range(q, 90);
  const people = visibleUserIds(db, user);
  const ds = db.distributions.filter((d) => people.has(d.repId) && inRange(d.at, r));
  const unsigned = ds.filter((d) => !d.signed);
  const now = Date.now();
  const held = db.stock.filter((s) => s.quantity > 0 && (s.holderId === null || people.has(s.holderId)));
  const batch = (bid: string) => db.batches.find((b) => b.id === bid)!;
  const ledgerUnits = db.ledger.filter((l) => l.kind === "Distribution" && l.holderId && people.has(l.holderId) && inRange(l.at, r)).reduce((n, l) => n - l.delta, 0);
  const logged = ds.reduce((n, d) => n + d.units, 0);
  const wo = db.ledger.filter((l) => l.kind === "WriteOff" && inRange(l.at, r));
  return {
    period: { from: new Date(r.from).toISOString(), to: new Date(r.to).toISOString() },
    distributions: { count: ds.length, units: logged, withoutSignature: unsigned.length, withoutSignatureUnits: unsigned.reduce((n, d) => n + d.units, 0) },
    byRep: [...people].map((rid) => ({ repId: rid, count: ds.filter((d) => d.repId === rid).length, units: ds.filter((d) => d.repId === rid).reduce((n, d) => n + d.units, 0), withoutSignature: unsigned.filter((d) => d.repId === rid).length })).filter((x) => x.count > 0),
    stockHeld: {
      expiredUnits: held.filter((s) => Date.parse(batch(s.batchId).expiryDate) < now).reduce((n, s) => n + s.quantity, 0),
      expiringWithin90DaysUnits: held.filter((s) => { const e = Date.parse(batch(s.batchId).expiryDate); return e >= now && e < now + 90 * DAY; }).reduce((n, s) => n + s.quantity, 0),
      quarantinedOrRecalledUnits: held.filter((s) => batch(s.batchId).status !== "Active").reduce((n, s) => n + s.quantity, 0),
    },
    writeOffs: { count: wo.length, units: wo.reduce((n, l) => n - l.delta, 0) },
    reconciliation: { ok: ledgerUnits === logged, ledgerDistributionUnits: ledgerUnits, loggedDistributionUnits: logged },
  };
});

get("/samples/reports/distributions", ({ db, user, q }) => {
  if (!isManager(user.role)) forbid("Only managers can export distributions.");
  const r = range(q, 90);
  const people = visibleUserIds(db, user);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = ["date,rep,customer,product,batch,units,signed"];
  for (const d of db.distributions.filter((x) => people.has(x.repId) && inRange(x.at, r)).sort((a, b) => a.at.localeCompare(b.at))) {
    const b = db.batches.find((x) => x.id === d.batchId)!;
    lines.push([d.at, db.users.find((u) => u.id === d.repId)?.fullName, db.customers.find((c) => c.id === d.customerId)?.name, db.products.find((p) => p.id === b.productId)?.name, b.batchNumber, d.units, d.signed ? "yes" : "no"].map(esc).join(","));
  }
  return reply(200, lines.join("\n") + "\n", "text/csv");
});

/* ---------------- AI-style lead scoring ---------------- */

get("/ai/opportunities", ({ db, user, q }) => {
  requireFeature(user, "customers");
  const p = db.products.find((x) => x.id === q.get("productId")) ?? db.products[0];
  const now = Date.now();
  const pool = db.customers.filter((c) => !c.archivedAt && !c.mergedInto);
  const people = visibleUserIds(db, user);
  const scored = pool
    .filter((c) => user.role === "Distributor" ? false : people.size && (["NationalSalesManager", "Executive", "Admin", "Marketing", "KeyAccountManager"].includes(user.role) || db.users.some((u) => people.has(u.id) && u.territoryId === c.territoryId)))
    .map((c) => {
      const visits = db.visits.filter((v) => v.customerId === c.id && now - Date.parse(v.at) < 90 * DAY);
      const mentions = visits.filter((v) => v.productIds.includes(p.id)).length;
      const orders = db.orders.filter((o) => !o.cancelledAt && o.customerId === c.id && now - Date.parse(o.orderedAt) < 180 * DAY).length;
      const interest = c.productInterests.some((i) => i.productId === p.id) ? 1 : 0;
      const seg = { A: 1, B: 0.6, C: 0.3 }[c.segment] ?? 0.2;
      const score = Math.min(0.98, 0.1 + 0.25 * seg + 0.2 * interest + 0.06 * Math.min(mentions, 4) + 0.04 * Math.min(orders, 5) + 0.02 * Math.min(visits.length, 5));
      return { customerId: c.id, name: c.name, probability: Math.round(score * 100) / 100, likelihood: score >= 0.6 ? "High" : score >= 0.4 ? "Medium" : "Low" };
    })
    .sort((a, b) => b.probability - a.probability)
    .slice(0, num(q.get("take"), 5));
  return { product: p.name, note: "Scored from segment, product interest, recent visits and orders.", items: scored };
});
