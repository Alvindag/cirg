#!/usr/bin/env node
// A tiny stand-in for the DAS Engage 360 API, for trying live mode without the
// .NET backend. It implements the endpoints this dashboard reads and the main
// write actions, with made-up in-memory data, and accepts any bearer token.
// State resets when the process restarts.
//
//   node scripts/mock-das-api.mjs            # http://localhost:5050
//   DAS_API_BASE_URL=http://localhost:5050 npm run dev
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 5050);
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const now = Date.now();
const iso = (offsetDays = 0) => new Date(now + offsetDays * 864e5).toISOString();

const me = { id: id(2), tenantId: id(1), fullName: "Esi Mensah", email: "esi.mensah@example.com", role: "NationalSalesManager", territoryId: null };
const territories = [
  { id: id(11), name: "Greater Accra", region: "Greater Accra", district: "Accra" },
  { id: id(12), name: "Ashanti", region: "Ashanti", district: "Kumasi" },
];
const users = [
  { ...me, externalId: "ext-1", managerId: null, isActive: true },
  { id: id(3), tenantId: id(1), fullName: "Kojo Asante", email: "kojo@example.com", role: "Rep", territoryId: id(11), externalId: "ext-2", managerId: id(2), isActive: true },
  { id: id(4), tenantId: id(1), fullName: "Ama Owusu", email: "ama@example.com", role: "Rep", territoryId: id(12), externalId: "ext-3", managerId: id(2), isActive: true },
];
const products = [
  { id: id(21), name: "Amoxil", sampleLimitPerCustomer: null, sampleLimitDays: null },
  { id: id(22), name: "Panadol", sampleLimitPerCustomer: 10, sampleLimitDays: 30 },
];
let customers = Array.from({ length: 31 }, (_, i) => ({
  id: id(100 + i), type: ["Doctor", "Pharmacy", "Clinic"][i % 3], name: `Customer ${String(i + 1).padStart(2, "0")}`,
  specialty: i % 3 === 0 ? "Cardiology" : null, segment: ["A", "B", "C"][i % 3], territoryId: territories[i % 2].id,
  phone: null, email: null, address: null, city: ["Accra", "Kumasi"][i % 2], latitude: null, longitude: null,
  parentCustomerId: null, targetVisitsPerMonth: 2 + (i % 3), productInterests: [],
}));
customers[0].name = "Dr. Kofi Boateng";
const batches = [
  { id: id(31), productId: id(21), batchNumber: "AX-204", expiryDate: iso(200), status: "Active", statusReason: null },
  { id: id(32), productId: id(22), batchNumber: "PD-117", expiryDate: iso(40), status: "Active", statusReason: null },
];
const requests = [
  { id: id(41), repId: id(3), productId: id(21), quantity: 20, approvedQuantity: null, status: "Pending", notes: "Cardiology clinic visit", decisionNote: null, createdAt: iso(-1) },
  { id: id(42), repId: id(4), productId: id(22), quantity: 10, approvedQuantity: 10, status: "Approved", notes: null, decisionNote: null, createdAt: iso(-2) },
];
const stock = [
  { holderId: null, location: "Warehouse", batchId: id(31), productId: id(21), batchNumber: "AX-204", expiryDate: iso(200), daysToExpiry: 200, status: "Active", quantity: 500, expired: false, expiringSoon: false, actionRequired: false },
  { holderId: id(3), location: "Rep", batchId: id(32), productId: id(22), batchNumber: "PD-117", expiryDate: iso(40), daysToExpiry: 40, status: "Active", quantity: 60, expired: false, expiringSoon: true, actionRequired: false },
];
const audit = Array.from({ length: 60 }, (_, i) => ({
  id: 1000 - i, userId: i % 2 ? id(2) : id(3), at: iso(-i / 4), action: ["Create", "Update", "Approve"][i % 3],
  entityType: ["Customer", "SampleRequest", "Batch"][i % 3], entityId: id(100 + i), changes: i % 3 === 1 ? '{"segment":"A"}' : null,
}));

const json = (res, body, status = 200) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
};
const readBody = (req) => new Promise((resolve) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => resolve(b)); });

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const path = url.pathname.replace(/^\/api\/v1/, "");
  const q = url.searchParams;
  const m = req.method;
  if (!req.headers.authorization?.startsWith("Bearer ")) return json(res, { title: "Not signed in." }, 401);
  const raw = m === "GET" || m === "DELETE" ? "" : await readBody(req);
  const body = raw && raw.trim().startsWith("{") ? JSON.parse(raw) : {};
  let r;

  if (m === "GET" && path === "/me") return json(res, me);
  if (m === "GET" && path === "/dashboards/sales")
    return json(res, { callsCompleted: 1284, plannedVisits: 1490, planAdherencePct: 86.2, coveragePct: 74.5, byRep: [{ repId: id(3), calls: 640, uniqueCustomers: 210, outsideGeofence: 7 }, { repId: id(4), calls: 644, uniqueCustomers: 232, outsideGeofence: 2 }] });
  if (m === "GET" && path === "/dashboards/products")
    return json(res, [{ productId: "1", name: "Amoxil", calls: 310, sampleUnits: 820 }, { productId: "2", name: "Panadol", calls: 260, sampleUnits: 540 }, { productId: "3", name: "Zinnat", calls: 190, sampleUnits: 300 }, { productId: "4", name: "Ventolin", calls: 150, sampleUnits: 410 }]);
  if (m === "GET" && path === "/notifications")
    return json(res, [{ id: "1", kind: "Recall", title: "Batch AX-204 recalled", body: "Return units to the warehouse.", createdAt: iso(0), readAt: null }, { id: "2", kind: "Notice", title: "New sample limit for Panadol", body: "10 units per customer per 30 days.", createdAt: iso(-0.04), readAt: null }]);
  if (m === "GET" && path === "/ai/opportunities")
    return json(res, { product: "Amoxil", note: "Mock data", items: [{ customerId: customers[0].id, name: customers[0].name, likelihood: "High", probability: 0.78 }] });

  if (path === "/customers" && m === "GET") {
    const text = (q.get("q") ?? "").toLowerCase();
    let list = customers.filter((c) => (!text || c.name.toLowerCase().includes(text) || (c.city ?? "").toLowerCase().includes(text)) && (!q.get("type") || c.type === q.get("type")) && (!q.get("segment") || c.segment === q.get("segment")));
    const pageSize = Number(q.get("pageSize") ?? 25), page = Number(q.get("page") ?? 1);
    return json(res, { total: list.length, page, pageSize, items: list.slice((page - 1) * pageSize, page * pageSize) });
  }
  if ((r = path.match(/^\/customers\/([^/]+)$/))) {
    const c = customers.find((x) => x.id === r[1]);
    if (!c) return json(res, { title: "Customer not found." }, 404);
    if (m === "GET") return json(res, { customer: c });
    if (m === "PUT") { Object.assign(c, body); return json(res, c); }
    if (m === "DELETE") { customers = customers.filter((x) => x.id !== c.id); return json(res, undefined, 204); }
  }
  if (path === "/customers/import" && m === "POST") {
    const lines = raw.trim().split(/\r?\n/).slice(1);
    const dry = q.get("dryRun") === "true";
    const rows = lines.map((l, i) => (l.split(",")[1] ? { row: i + 2, status: "created", message: null, customerId: null, matchedCustomerId: null } : { row: i + 2, status: "error", message: "Name is required.", customerId: null, matchedCustomerId: null }));
    if (!dry) lines.forEach((l, i) => { const [type, name] = l.split(","); if (name) customers.push({ ...customers[0], id: id(500 + customers.length + i), type, name }); });
    return json(res, { dryRun: dry, total: rows.length, created: rows.filter((x) => x.status === "created").length, updated: 0, skipped: 0, errors: rows.filter((x) => x.status === "error").length, rows });
  }

  if (path === "/admin/territories" && m === "GET") return json(res, territories);
  if (path === "/admin/territories" && m === "POST") { const t = { id: id(60 + territories.length), region: null, district: null, ...body }; territories.push(t); return json(res, t, 201); }
  if (path === "/admin/users" && m === "GET") return json(res, users);
  if ((r = path.match(/^\/admin\/users\/([^/]+)\/(deactivate|reactivate)$/)) && m === "POST") {
    const u = users.find((x) => x.id === r[1]); if (u) u.isActive = r[2] === "reactivate"; return json(res, undefined, 204);
  }
  if (path === "/admin/products" && m === "GET") return json(res, products);
  if ((r = path.match(/^\/admin\/products\/([^/]+)$/)) && m === "PUT") { Object.assign(products.find((p) => p.id === r[1]) ?? {}, body); return json(res, undefined, 204); }
  if (path === "/admin/audit-logs" && m === "GET") {
    const before = Number(q.get("before") ?? Infinity), take = Number(q.get("take") ?? 50);
    return json(res, audit.filter((a) => a.id < before).slice(0, take));
  }

  if (path === "/samples/requests" && m === "GET") return json(res, requests.filter((x) => (!q.get("status") || x.status === q.get("status")) && (!q.get("repId") || x.repId === q.get("repId"))));
  if ((r = path.match(/^\/samples\/requests\/([^/]+)\/(approve|reject|fulfil)$/)) && m === "POST") {
    const x = requests.find((y) => y.id === r[1]); if (!x) return json(res, { title: "Not found." }, 404);
    if (r[2] === "approve") { x.status = "Approved"; x.approvedQuantity = body.quantity; }
    if (r[2] === "reject") { x.status = "Rejected"; x.decisionNote = body.note; }
    if (r[2] === "fulfil") { x.status = "Fulfilled"; return json(res, { allocations: [{ batchId: batches[0].id, quantity: x.approvedQuantity ?? x.quantity }] }); }
    return json(res, x);
  }
  if (path === "/samples/reports/stock") return json(res, stock);
  if (path === "/samples/batches" && m === "GET") return json(res, batches);
  if (path === "/samples/batches" && m === "POST") { const b = { id: id(70 + batches.length), status: "Active", statusReason: null, ...body }; batches.push(b); return json(res, b, 201); }
  if ((r = path.match(/^\/samples\/batches\/([^/]+)\/status$/)) && m === "POST") { const b = batches.find((x) => x.id === r[1]); if (b) { b.status = body.status; b.statusReason = body.reason || null; } return json(res, { notified: body.status === "Recalled" ? 1 : 0 }); }
  if (["/samples/receipts", "/samples/adjustments", "/samples/returns"].includes(path) && m === "POST") return json(res, undefined, 204);
  if (path === "/samples/reports/compliance")
    return json(res, { period: { from: q.get("from"), to: q.get("to") }, distributions: { count: 42, units: 310, withoutSignature: 2, withoutSignatureUnits: 12 }, byRep: [{ repId: id(3), count: 24, units: 180, withoutSignature: 2 }, { repId: id(4), count: 18, units: 130, withoutSignature: 0 }], stockHeld: { expiredUnits: 0, expiringWithin90DaysUnits: 60, quarantinedOrRecalledUnits: 0 }, writeOffs: { count: 1, units: 4 }, reconciliation: { ok: true, ledgerDistributionUnits: 310, loggedDistributionUnits: 310 } });
  if (path === "/samples/reports/distributions") { res.setHeader("Content-Type", "text/csv"); return res.end("rep,product,units\nKojo Asante,Amoxil,20\n"); }

  json(res, { title: `No mock for ${m} ${path}` }, 404);
}).listen(port, () => console.log(`Mock DAS Engage 360 API on http://localhost:${port}`));
