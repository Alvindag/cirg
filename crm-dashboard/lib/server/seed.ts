import { chainHash, GENESIS } from "@/lib/rtm/hashchain";
import { distanceMetres, GEOFENCE_METRES } from "@/lib/rtm/geo";
import type { OrderRecord } from "@/lib/rtm/metrics";
import type {
  AuditEntry,
  Batch,
  Customer,
  DB,
  Deal,
  DealStage,
  Distribution,
  Distributor,
  DistributorStock,
  Ledger,
  Product,
  SampleRequest,
  StockLot,
  Task,
  Territory,
  User,
  Visit,
} from "./model";
import { DEAL_STAGES } from "./model";

/**
 * Sample data for the built-in backend: a made-up pharma business in Ghana.
 * It is deterministic (same seed, same data), and includes the kinds of problems
 * the RTM review cares about on purpose: duplicate and incomplete customer
 * records, weaker service in the Northern regions, visits outside the
 * geofence, and customers served through both channels.
 */

const DAY = 864e5;
export const T = 1; // tenant id suffix

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const uid = (prefix: string, n: number) => `${prefix}-${String(n).padStart(4, "0")}`;

const CITIES = [
  { city: "Accra", region: "Greater Accra", lat: 5.6037, lon: -0.187, north: false },
  { city: "Kumasi", region: "Ashanti", lat: 6.6885, lon: -1.6244, north: false },
  { city: "Takoradi", region: "Western", lat: 4.8962, lon: -1.7554, north: false },
  { city: "Cape Coast", region: "Central", lat: 5.1053, lon: -1.2466, north: false },
  { city: "Koforidua", region: "Eastern", lat: 6.0941, lon: -0.2591, north: false },
  { city: "Ho", region: "Volta", lat: 6.6008, lon: 0.4713, north: false },
  { city: "Tamale", region: "Northern", lat: 9.4075, lon: -0.8534, north: true },
  { city: "Bolgatanga", region: "Upper East", lat: 10.7856, lon: -0.8514, north: true },
];

export function seedDb(now = Date.now()): DB {
  const r = rng(20261002);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const between = (lo: number, hi: number) => lo + r() * (hi - lo);
  const iso = (ms: number) => new Date(ms).toISOString();
  const tenantId = uid("tenant", T);

  const territories: Territory[] = CITIES.map((c, i) => ({
    id: uid("terr", i + 1),
    name: c.region,
    region: c.region,
    district: c.city,
  }));
  const terrOf = (city: string) => territories.find((t) => t.district === city)!;

  const distributors: Distributor[] = [
    { id: uid("dist", 1), name: "Northern Pharma Distributors", region: "Northern", discountPct: 0.14, active: true },
    { id: uid("dist", 2), name: "Coastal Med Distributors", region: "Western", discountPct: 0.12, active: true },
    { id: uid("dist", 3), name: "Ashanti Health Supplies", region: "Ashanti", discountPct: 0.13, active: true },
  ];

  const mkUser = (n: number, fullName: string, role: User["role"], territoryId: string | null, managerId: string | null, distributorId: string | null = null): User => ({
    id: uid("user", n),
    tenantId,
    fullName,
    email: `${fullName.toLowerCase().replace(/[^a-z]+/g, ".")}@dasplc.example`,
    role,
    territoryId,
    externalId: `ext-${n}`,
    managerId,
    isActive: true,
    distributorId,
  });
  const users: User[] = [
    mkUser(1, "Esi Mensah", "NationalSalesManager", null, null),
    mkUser(2, "Kwame Owusu", "Admin", null, null),
    mkUser(3, "Efua Addo", "Executive", null, null),
    mkUser(4, "Yaw Boateng", "RegionalManager", terrOf("Accra").id, uid("user", 1)),
    mkUser(5, "Abdul Rahman", "RegionalManager", terrOf("Tamale").id, uid("user", 1)),
    mkUser(6, "Akosua Frimpong", "AreaManager", terrOf("Kumasi").id, uid("user", 4)),
    mkUser(7, "Issah Mahama", "AreaManager", terrOf("Bolgatanga").id, uid("user", 5)),
    mkUser(8, "Kojo Asante", "Rep", terrOf("Accra").id, uid("user", 4)),
    mkUser(9, "Ama Serwaa", "Rep", terrOf("Kumasi").id, uid("user", 6)),
    mkUser(10, "Kofi Annan Jr", "Rep", terrOf("Takoradi").id, uid("user", 4)),
    mkUser(11, "Naana Quaye", "Rep", terrOf("Cape Coast").id, uid("user", 4)),
    mkUser(12, "Samuel Tetteh", "Rep", terrOf("Koforidua").id, uid("user", 4)),
    mkUser(13, "Mariam Alhassan", "Rep", terrOf("Tamale").id, uid("user", 5)),
    mkUser(14, "Zakaria Iddrisu", "Rep", terrOf("Bolgatanga").id, uid("user", 7)),
    mkUser(15, "Selorm Agbenyo", "Rep", terrOf("Ho").id, uid("user", 4)),
    mkUser(16, "Dede Lamptey", "Marketing", null, uid("user", 1)),
    mkUser(17, "Nii Armah", "KeyAccountManager", terrOf("Accra").id, uid("user", 1)),
    mkUser(18, "Fatima Salifu", "Distributor", null, null, uid("dist", 1)),
    mkUser(19, "Gideon Ampofo", "Distributor", null, null, uid("dist", 2)),
  ];
  const reps = users.filter((u) => u.role === "Rep");

  const products: Product[] = [
    ["Amoxil 500mg", "Anti-infectives", 4.2, 6.5],
    ["Panadol Extra", "Analgesics", 1.1, 2.0],
    ["Zinnat 250mg", "Anti-infectives", 6.8, 10.5],
    ["Ventolin Inhaler", "Respiratory", 3.9, 6.0],
    ["Coartem 20/120", "Antimalarials", 2.4, 3.8],
    ["Lisinopril 10mg", "Cardiovascular", 1.8, 3.1],
  ].map(([name, area, cost, price], i) => ({
    id: uid("prod", i + 1),
    name: name as string,
    therapeuticArea: area as string,
    standardCost: cost as number,
    listPrice: price as number,
    reorderLevel: 200,
    sampleLimitPerCustomer: i === 1 ? 10 : null,
    sampleLimitDays: i === 1 ? 30 : null,
  }));

  /* ---------- customers ---------- */
  const first = ["Unity", "Grace", "Sunrise", "Hope", "Mercy", "Bright", "Royal", "Trinity", "Golden", "Peace", "Victory", "Faith", "Salem", "Zion", "Alpha", "Nova", "Crown", "Heritage", "Emmanuel", "Divine"];
  const kinds: [Customer["type"], string][] = [
    ["Pharmacy", "Pharmacy"],
    ["Pharmacy", "Chemist"],
    ["Clinic", "Clinic"],
    ["Hospital", "Hospital"],
    ["Doctor", ""],
  ];
  const surnames = ["Boateng", "Mensah", "Owusu", "Asare", "Darko", "Appiah", "Yeboah", "Ofori", "Nkrumah", "Sarpong", "Adjei", "Bonsu", "Tawiah"];
  const customers: Customer[] = [];
  for (let i = 0; i < 210; i++) {
    const c = pick(CITIES);
    const [type, suffix] = pick(kinds);
    const name =
      type === "Doctor"
        ? `Dr. ${pick(first)} ${pick(surnames)}`
        : `${pick(first)} ${pick(["Care", "Health", "Med", "Life", "Wellness"])} ${suffix}`.trim();
    const north = c.north || c.region === "Volta";
    const viaDistributor = r() < (north ? 0.65 : 0.22);
    const dist = viaDistributor
      ? c.region === "Northern" || c.region === "Upper East" || c.region === "Volta"
        ? distributors[0]
        : c.region === "Western" || c.region === "Central"
          ? distributors[1]
          : c.region === "Ashanti"
            ? distributors[2]
            : pick(distributors)
      : null;
    customers.push({
      id: uid("cust", i + 1),
      type,
      name,
      specialty: type === "Doctor" ? pick(["Cardiology", "Paediatrics", "General practice"]) : null,
      segment: r() < 0.1 ? "Unclassified" : pick(["A", "A", "B", "B", "B", "C"]),
      territoryId: terrOf(c.city).id,
      parentCustomerId: null,
      phone: `0${pick(["24", "20", "54", "55", "27"])}${String(Math.floor(r() * 9_000_000) + 1_000_000)}`,
      email: r() < 0.5 ? `contact${i + 1}@example.com` : null,
      address: `${Math.floor(r() * 90) + 1} ${pick(["High", "Market", "Station", "Church", "Liberation"])} Road`,
      city: c.city,
      latitude: c.lat + between(-0.035, 0.035),
      longitude: c.lon + between(-0.035, 0.035),
      targetVisitsPerMonth: pick([1, 2, 2, 3, 4]),
      productInterests: [{ productId: pick(products).id }],
      channel: dist ? "Distributor" : "Direct",
      distributorId: dist?.id ?? null,
      createdAt: iso(now - Math.floor(r() * 700) * DAY),
    });
  }
  // Deliberate near-duplicates: a re-keyed second record of the same outlet.
  const dupSources = customers.slice(0, 12);
  dupSources.forEach((src, i) => {
    const variant =
      i % 3 === 0 ? src.name.toUpperCase() : i % 3 === 1 ? `${src.name} Ltd.` : src.name.replace(/Care|Health|Med|Life|Wellness/, (m) => m.toLowerCase());
    customers.push({
      ...src,
      id: uid("cust", 211 + i),
      name: variant,
      phone: i % 2 ? src.phone : null,
      latitude: src.latitude! + between(-0.0004, 0.0004),
      longitude: src.longitude! + between(-0.0004, 0.0004),
      segment: "Unclassified",
      createdAt: iso(now - Math.floor(r() * 120) * DAY),
    });
  });
  // Deliberate gaps: missing phone, city, GPS, territory or a bad email.
  customers.slice(20, 70).forEach((c, i) => {
    if (i % 5 === 0) c.phone = null;
    if (i % 7 === 0) {
      c.latitude = null;
      c.longitude = null;
    }
    if (i % 11 === 0) c.city = null;
    if (i % 13 === 0) c.territoryId = null;
    if (i % 17 === 0) c.email = "not-an-email";
  });

  /* ---------- samples, batches, stock ---------- */
  const batches: Batch[] = products.flatMap((p, i) => [
    { id: uid("batch", i * 2 + 1), productId: p.id, batchNumber: `${p.name.slice(0, 2).toUpperCase()}-${200 + i}A`, expiryDate: iso(now + (320 - i * 25) * DAY), manufacturedAt: iso(now - (90 + i * 10) * DAY), status: "Active" as const, statusReason: null },
    { id: uid("batch", i * 2 + 2), productId: p.id, batchNumber: `${p.name.slice(0, 2).toUpperCase()}-${200 + i}B`, expiryDate: iso(now + (i === 2 ? 25 : 150) * DAY), manufacturedAt: iso(now - (200 + i * 10) * DAY), status: (i === 4 ? "Quarantined" : "Active") as Batch["status"], statusReason: i === 4 ? "Failed visual inspection" : null },
  ]);
  const stock: StockLot[] = [];
  batches.forEach((b) => {
    stock.push({ batchId: b.id, holderId: null, quantity: 400 + Math.floor(r() * 400) });
    reps.slice(0, 4).forEach((rep) => stock.push({ batchId: b.id, holderId: rep.id, quantity: Math.floor(r() * 60) }));
  });
  const distributorStock: DistributorStock[] = distributors.flatMap((d) =>
    products.map((p) => ({ distributorId: d.id, productId: p.id, units: Math.floor(r() * 900) + (p.id === products[2].id ? 0 : 150), reorderLevel: 250 }))
  );
  const sampleRequests: SampleRequest[] = Array.from({ length: 12 }, (_, i) => ({
    id: uid("req", i + 1),
    repId: reps[i % reps.length].id,
    productId: products[i % products.length].id,
    quantity: 10 + (i % 4) * 10,
    approvedQuantity: i % 3 === 1 ? 10 + (i % 4) * 10 : null,
    status: (["Pending", "Approved", "Fulfilled"] as const)[i % 3] === "Fulfilled" ? "Fulfilled" : (["Pending", "Approved", "Fulfilled"] as const)[i % 3],
    notes: i % 2 ? "Detailing visit" : null,
    decisionNote: null,
    createdAt: iso(now - (i + 1) * DAY * 2),
  }));
  sampleRequests.forEach((q) => {
    if (q.status === "Fulfilled") q.approvedQuantity = q.quantity;
  });
  const distributions: Distribution[] = Array.from({ length: 80 }, (_, i) => {
    const rep = pick(reps);
    const cust = pick(customers.filter((c) => c.territoryId === rep.territoryId));
    return {
      id: uid("dist-out", i + 1),
      repId: rep.id,
      customerId: (cust ?? customers[0]).id,
      batchId: pick(batches).id,
      units: 3 + Math.floor(r() * 8),
      at: iso(now - Math.floor(r() * 60) * DAY),
      signed: r() > 0.07,
    };
  });
  const ledger: Ledger[] = [];
  ledger.push(...batches.map((b, i) => ({ id: uid("led", i + 1), kind: "Receipt" as const, batchId: b.id, holderId: null, delta: stock.find((s) => s.batchId === b.id && s.holderId === null)!.quantity, reason: "Initial receipt", at: b.manufacturedAt, userId: users[1].id })));
  distributions.forEach((d, i) =>
    ledger.push({ id: uid("led", 100 + i), kind: "Distribution", batchId: d.batchId, holderId: d.repId, delta: -d.units, reason: d.id, at: d.at, userId: d.repId })
  );

  /* ---------- orders (6 months) ---------- */
  const orders: OrderRecord[] = [];
  let oid = 1;
  const regionOf = (c: Customer) => territories.find((t) => t.id === c.territoryId)?.region ?? "Unassigned";
  const dualChannel = new Set(customers.filter((_, i) => i % 15 === 0).map((c) => c.id));
  for (const c of customers.slice(0, 210)) {
    const region = regionOf(c);
    const north = region === "Northern" || region === "Upper East";
    // Some outlets have not ordered at all, more so in the Northern regions.
    const n = r() < (north ? 0.35 : 0.12) ? 0 : 2 + Math.floor(r() * 7);
    for (let k = 0; k < n; k++) {
      const channel: "Direct" | "Distributor" = dualChannel.has(c.id) && k % 2 ? (c.channel === "Direct" ? "Distributor" : "Direct") : c.channel;
      const distId = channel === "Distributor" ? (c.distributorId ?? pick(distributors).id) : null;
      const orderedAt = now - Math.floor(between(5, 180)) * DAY;
      const confirmedAt = orderedAt + Math.floor(between(0, 2)) * DAY;
      const promised = confirmedAt + (north ? 5 : 3) * DAY;
      const late = r() < (north ? 0.34 : channel === "Distributor" ? 0.2 : 0.1);
      const delivered = promised + (late ? Math.floor(between(1, 4)) : -Math.floor(between(0, 2))) * DAY;
      const unitsOrdered = 40 + Math.floor(r() * 300);
      const short = r() < (north ? 0.28 : 0.09);
      const unitsDelivered = short ? Math.floor(unitsOrdered * between(0.6, 0.95)) : unitsOrdered;
      const p = pick(products);
      const price = p.listPrice * (channel === "Distributor" ? 1 - (distributors.find((d) => d.id === distId)?.discountPct ?? 0) : 1);
      const revenue = Math.round(unitsDelivered * price * 100) / 100;
      const logisticsPct = channel === "Direct" ? (north ? between(0.09, 0.14) : between(0.04, 0.06)) : between(0.025, 0.04);
      const distributionPct = channel === "Distributor" ? between(0.08, 0.12) : 0;
      const salesPct = channel === "Direct" ? between(0.05, 0.08) : between(0.015, 0.025);
      const delOk = delivered <= now - DAY;
      orders.push({
        id: uid("ord", oid++),
        customerId: c.id,
        channel,
        distributorId: distId,
        region,
        orderedAt: iso(orderedAt),
        confirmedAt: iso(confirmedAt),
        promisedAt: iso(promised),
        deliveredAt: delOk ? iso(delivered) : null,
        unitsOrdered,
        unitsDelivered: delOk ? unitsDelivered : 0,
        revenue: delOk ? revenue : 0,
        logisticsCost: Math.round(revenue * logisticsPct * 100) / 100,
        distributionCost: Math.round(revenue * distributionPct * 100) / 100,
        salesCost: Math.round(revenue * salesPct * 100) / 100,
      });
    }
  }

  /* ---------- visits (hash-chained) ---------- */
  const rawVisits: Omit<Visit, "prevHash" | "hash">[] = [];
  for (let i = 0; i < 1250; i++) {
    let rep = pick(reps);
    // Reps in the Northern regions cover less ground in the sample data.
    if (["Tamale", "Bolgatanga"].includes(territories.find((t) => t.id === rep.territoryId)?.district ?? "") && r() < 0.4) rep = pick(reps);
    const pool = customers.filter((c) => c.territoryId === rep.territoryId && c.latitude != null);
    const cust = pool.length ? pick(pool) : customers[0];
    const at = now - Math.floor(between(0, 90)) * DAY - Math.floor(between(0, 9)) * 36e5;
    const roll = r();
    const far = roll < 0.07;
    const noGps = roll > 0.96;
    const lat = noGps || cust.latitude == null ? null : cust.latitude + (far ? between(0.02, 0.06) : between(-0.0015, 0.0015));
    const lon = noGps || cust.longitude == null ? null : cust.longitude + (far ? between(0.02, 0.06) : between(-0.0015, 0.0015));
    let distanceM: number | null = null;
    let verified = false;
    let reason: string | null = null;
    if (lat == null || lon == null) reason = "no-checkin-location";
    else if (cust.latitude == null || cust.longitude == null) reason = "no-customer-location";
    else {
      distanceM = Math.round(distanceMetres({ latitude: lat, longitude: lon }, { latitude: cust.latitude, longitude: cust.longitude }));
      verified = distanceM <= GEOFENCE_METRES;
      if (!verified) reason = "outside-geofence";
    }
    rawVisits.push({
      id: uid("visit", i + 1),
      clientId: `seed-${i + 1}`,
      repId: rep.id,
      customerId: cust.id,
      at: iso(at),
      kind: r() < 0.85 ? "Visit" : "Call",
      outcome: pick(["Order taken", "Follow-up needed", "Samples left", "Not available", "Information shared"]),
      notes: null,
      durationMin: 10 + Math.floor(r() * 35),
      productIds: [pick(products).id],
      latitude: lat,
      longitude: lon,
      distanceM,
      verified,
      verifyReason: reason,
      receivedAt: iso(at + Math.floor(between(0, 3)) * 36e5),
    });
  }
  rawVisits.sort((a, b) => a.at.localeCompare(b.at));
  let prev = GENESIS;
  const visits: Visit[] = rawVisits.map((v) => {
    const hash = chainHash(prev, visitPayload(v));
    const out = { ...v, prevHash: prev, hash };
    prev = hash;
    return out;
  });

  /* ---------- deals and tasks ---------- */
  const deals: Deal[] = Array.from({ length: 42 }, (_, i) => {
    const stage: DealStage = DEAL_STAGES[Math.floor(r() * DEAL_STAGES.length)];
    const cust = pick(customers.filter((c) => c.type !== "Doctor"));
    const owner = reps.find((u) => u.territoryId === cust.territoryId) ?? pick(reps);
    return {
      id: uid("deal", i + 1),
      title: `${cust.name}: ${pick(["annual supply", "new product listing", "stock top-up", "hospital tender", "pharmacy chain deal"])}`,
      customerId: cust.id,
      ownerId: owner.id,
      stage,
      value: Math.round(between(2_000, 80_000) / 100) * 100,
      expectedClose: iso(now + Math.floor(between(-10, 90)) * DAY),
      createdAt: iso(now - Math.floor(between(5, 100)) * DAY),
      updatedAt: iso(now - Math.floor(between(0, 10)) * DAY),
      lostReason: stage === "Lost" ? pick(["Price", "Competitor", "Stock availability"]) : null,
    };
  });
  const tasks: Task[] = Array.from({ length: 16 }, (_, i) => ({
    id: uid("task", i + 1),
    title: pick(["Send price list", "Follow up on proposal", "Collect signed sample form", "Confirm delivery date", "Update customer GPS location"]),
    dueAt: iso(now + Math.floor(between(-4, 14)) * DAY),
    ownerId: pick(reps).id,
    customerId: pick(customers).id,
    done: r() < 0.25,
    createdAt: iso(now - Math.floor(between(1, 20)) * DAY),
  }));

  /* ---------- audit trail (hash-chained) ---------- */
  const auditRaw: Omit<AuditEntry, "prevHash" | "hash">[] = [];
  for (let i = 0; i < 25; i++) {
    const entity = pick(["Customer", "SampleRequest", "Batch", "Deal"]);
    auditRaw.push({
      id: i + 1,
      userId: pick(users.slice(0, 8)).id,
      at: iso(now - (25 - i) * 0.6 * DAY),
      action: pick(["Create", "Update", "Approve"]),
      entityType: entity,
      entityId: entity === "Customer" ? pick(customers).id : entity === "Deal" ? pick(deals).id : entity === "Batch" ? pick(batches).id : pick(sampleRequests).id,
      changes: null,
      reason: null,
    });
  }
  prev = GENESIS;
  const audit: AuditEntry[] = auditRaw.map((a) => {
    const hash = chainHash(prev, auditPayload(a));
    const out = { ...a, prevHash: prev, hash };
    prev = hash;
    return out;
  });

  return {
    version: 1,
    seededAt: iso(now),
    users,
    territories,
    distributors,
    customers,
    products,
    batches,
    stock,
    distributorStock,
    sampleRequests,
    distributions,
    ledger,
    deals,
    tasks,
    visits,
    orders,
    audit,
    notifications: [
      { id: "n-1", userId: null, kind: "Notice", title: "Quarantined batch CO-204B", body: "Do not hand out units from this batch until it is released.", createdAt: iso(now - 0.2 * DAY), readAt: null },
      { id: "n-2", userId: null, kind: "Notice", title: "Northern region OTIF below target", body: "Review deliveries for Tamale and Bolgatanga.", createdAt: iso(now - 1 * DAY), readAt: null },
    ],
    tcoScenarios: [],
  };
}

/** The fields that make up a visit record's hash. Anything not listed here is not protected. */
export function visitPayload(v: Omit<Visit, "prevHash" | "hash">) {
  return [v.id, v.clientId, v.repId, v.customerId, v.at, v.kind, v.outcome, v.notes, v.durationMin, v.productIds, v.latitude, v.longitude, v.distanceM, v.verified, v.verifyReason];
}

export function auditPayload(a: Omit<AuditEntry, "prevHash" | "hash">) {
  return [a.id, a.userId, a.at, a.action, a.entityType, a.entityId, a.changes, a.reason];
}
