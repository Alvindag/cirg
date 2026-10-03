#!/usr/bin/env node
// A tiny stand-in for the DAS Engage 360 API, for trying live mode without the
// .NET backend. It implements only the endpoints this dashboard reads, with
// made-up data, and accepts any bearer token.
//
//   node scripts/mock-das-api.mjs            # http://localhost:5050
//   DAS_API_BASE_URL=http://localhost:5050 npm run dev
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 5050);

const routes = {
  "/api/v1/me": () => ({
    id: "00000000-0000-0000-0000-000000000002",
    tenantId: "00000000-0000-0000-0000-000000000001",
    fullName: "Esi Mensah",
    email: "esi.mensah@example.com",
    role: "NationalSalesManager",
    territoryId: null,
  }),
  "/api/v1/dashboards/sales": () => ({
    callsCompleted: 1284,
    plannedVisits: 1490,
    planAdherencePct: 86.2,
    coveragePct: 74.5,
    byRep: [
      { repId: "a", calls: 640, uniqueCustomers: 210, outsideGeofence: 7 },
      { repId: "b", calls: 644, uniqueCustomers: 232, outsideGeofence: 2 },
    ],
  }),
  "/api/v1/dashboards/products": () => [
    { productId: "1", name: "Amoxil", calls: 310, sampleUnits: 820 },
    { productId: "2", name: "Panadol", calls: 260, sampleUnits: 540 },
    { productId: "3", name: "Zinnat", calls: 190, sampleUnits: 300 },
    { productId: "4", name: "Ventolin", calls: 150, sampleUnits: 410 },
  ],
  "/api/v1/notifications": () => [
    { id: "1", kind: "Recall", title: "Batch AX-204 recalled", body: "Return units to the warehouse.", createdAt: new Date().toISOString(), readAt: null },
    { id: "2", kind: "Notice", title: "New sample limit for Zinnat", body: "10 units per customer per 30 days.", createdAt: new Date(Date.now() - 36e5).toISOString(), readAt: null },
  ],
  "/api/v1/customers": () => ({
    total: 2, page: 1, pageSize: 4,
    items: [
      { id: "c1", type: "Doctor", name: "Dr. Kofi Boateng", specialty: "Cardiology", segment: "A", city: "Accra" },
      { id: "c2", type: "Pharmacy", name: "Unity Pharmacy", specialty: null, segment: "B", city: "Kumasi" },
    ],
  }),
  "/api/v1/admin/products": () => [{ id: "1", name: "Amoxil" }],
  "/api/v1/ai/opportunities": () => ({
    product: "Amoxil", note: "Mock data",
    items: [{ customerId: "c1", name: "Dr. Kofi Boateng", likelihood: "High", probability: 0.78 }],
  }),
};

createServer((req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  const handler = routes[path];
  res.setHeader("Content-Type", "application/json");
  if (!req.headers.authorization?.startsWith("Bearer ")) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ title: "Not signed in." }));
  }
  if (!handler) {
    res.statusCode = 404;
    return res.end(JSON.stringify({ title: `No mock for ${path}` }));
  }
  res.end(JSON.stringify(handler()));
}).listen(port, () => console.log(`Mock DAS Engage 360 API on http://localhost:${port}`));
