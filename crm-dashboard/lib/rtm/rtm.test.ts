import { describe, expect, it } from "vitest";

import { chainHash, GENESIS, verifyChain } from "./hashchain";
import { distanceMetres, verifyCheckIn } from "./geo";
import { completeness, findDuplicates, normaliseName, normalisePhone, qualityIssues, type DqCustomer } from "./dq";
import { channelConflicts, isOtif, numericalReach, summarise, type OrderRecord } from "./metrics";
import { computeTco, defaultTco } from "./tco";

const order = (o: Partial<OrderRecord> = {}): OrderRecord => ({
  id: "o", customerId: "c1", channel: "Direct", distributorId: null, region: "Northern",
  orderedAt: "2026-01-01T00:00:00Z", confirmedAt: "2026-01-02T00:00:00Z", promisedAt: "2026-01-06T00:00:00Z",
  deliveredAt: "2026-01-05T00:00:00Z", unitsOrdered: 100, unitsDelivered: 100,
  revenue: 1000, logisticsCost: 50, distributionCost: 30, salesCost: 20, ...o,
});

describe("OTIF and summary", () => {
  it("needs on time and in full", () => {
    expect(isOtif(order())).toBe(true);
    expect(isOtif(order({ deliveredAt: "2026-01-07T00:00:00Z" }))).toBe(false);
    expect(isOtif(order({ unitsDelivered: 90 }))).toBe(false);
    expect(isOtif(order({ deliveredAt: null }))).toBe(false);
  });

  it("computes cost to serve, cycle time and OTIF over delivered orders", () => {
    const s = summarise([order(), order({ unitsDelivered: 80, revenue: 800, logisticsCost: 100 }), order({ deliveredAt: null })]);
    expect(s.orders).toBe(3);
    expect(s.delivered).toBe(2);
    expect(s.revenue).toBe(2800);
    expect(s.totalCost).toBe(100 + 150 + 100);
    expect(s.costToServePct).toBeCloseTo(350 / 2800);
    expect(s.otifPct).toBeCloseTo(0.5);
    expect(s.inFullPct).toBeCloseTo(0.5);
    expect(s.avgCycleDays).toBeCloseTo(3);
  });

  it("handles no orders without dividing by zero", () => {
    const s = summarise([]);
    expect(s.costToServePct).toBe(0);
    expect(s.otifPct).toBe(0);
    expect(s.avgCycleDays).toBeNull();
  });
});

describe("reach and channel conflict", () => {
  it("counts only target customers", () => {
    const r = numericalReach(["a", "b", "c", "d"], ["a", "a", "b", "zzz"]);
    expect(r).toEqual({ target: 4, reached: 2, pct: 0.5 });
  });

  it("flags customers served by both channels", () => {
    const rows = channelConflicts([
      order({ customerId: "x", channel: "Direct", revenue: 500 }),
      order({ customerId: "x", channel: "Distributor", distributorId: "d1", revenue: 300 }),
      order({ customerId: "y", channel: "Direct" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ customerId: "x", directRevenue: 500, distributorRevenue: 300, distributorIds: ["d1"] });
  });
});

const cust = (c: Partial<DqCustomer>): DqCustomer => ({
  id: "1", name: "Unity Pharmacy", type: "Pharmacy", city: "Accra", phone: "0241234567", email: null,
  address: "1 High St", territoryId: "t", latitude: 5.6, longitude: -0.2, segment: "A", ...c,
});

describe("data quality", () => {
  it("normalises names and phones", () => {
    expect(normaliseName("UNITY Pharmacy Ltd.")).toBe("unity");
    expect(normaliseName("Café  Nova Clinic")).toBe("cafe nova");
    expect(normalisePhone("+233 24 123 4567")).toBe(normalisePhone("024 123 4567"));
  });

  it("finds duplicates by name+city and by phone, but not different shops", () => {
    const pairs = findDuplicates([
      cust({ id: "a", name: "Unity Pharmacy" }),
      cust({ id: "b", name: "UNITY pharmacy Ltd", phone: null }),
      cust({ id: "c", name: "Grace Chemist", phone: "0201112222", city: "Kumasi" }),
      cust({ id: "d", name: "Totally Other", phone: "+233 20 111 2222", city: "Tamale" }),
      cust({ id: "e", name: "Sunrise Clinic", phone: "0555000111", city: "Accra" }),
    ]);
    const keys = pairs.map((p) => [p.a, p.b].sort().join("-"));
    expect(keys).toContain("a-b");
    expect(keys).toContain("c-d");
    expect(keys).not.toContain("a-e");
  });

  it("reports missing fields and a completeness score", () => {
    const list = [cust({ id: "ok" }), cust({ id: "bad", phone: null, latitude: null, email: "nope", segment: "Unclassified" })];
    const kinds = qualityIssues(list).filter((i) => i.customerId === "bad").map((i) => i.kind).sort();
    expect(kinds).toEqual(["bad-email", "missing-location", "missing-phone", "unclassified-segment"]);
    expect(completeness([cust({})])).toBe(1);
    expect(completeness(list)).toBeLessThan(1);
  });
});

describe("GPS verification", () => {
  it("measures distance and applies the geofence", () => {
    const accra = { latitude: 5.6037, longitude: -0.187 };
    expect(distanceMetres(accra, accra)).toBe(0);
    expect(distanceMetres(accra, { latitude: 5.6037 + 0.0045, longitude: -0.187 })).toBeGreaterThan(450);
    expect(verifyCheckIn(accra, accra).verified).toBe(true);
    expect(verifyCheckIn({ latitude: 6.7, longitude: -1.6 }, accra)).toMatchObject({ verified: false, reason: "outside-geofence" });
    expect(verifyCheckIn({ latitude: null, longitude: null }, accra).reason).toBe("no-checkin-location");
    expect(verifyCheckIn(accra, { latitude: null, longitude: null }).reason).toBe("no-customer-location");
  });
});

describe("hash chain", () => {
  const build = () => {
    const entries: { n: number; prevHash: string; hash: string }[] = [];
    let prev = GENESIS;
    for (let n = 0; n < 4; n++) {
      const hash = chainHash(prev, { n });
      entries.push({ n, prevHash: prev, hash });
      prev = hash;
    }
    return entries;
  };
  it("verifies an intact chain and finds the first tampered entry", () => {
    const e = build();
    expect(verifyChain(e, (x) => ({ n: x.n }))).toBe(-1);
    e[2].n = 99;
    expect(verifyChain(e, (x) => ({ n: x.n }))).toBe(2);
  });
});

describe("TCO", () => {
  it("adds up one-off, recurring and refresh costs", () => {
    const r = computeTco({ ...defaultTco, years: 6, deviceLifeYears: 3 });
    // 6 years with a 3 year life: bought twice, so one refresh.
    const devices = Math.ceil(defaultTco.reps * (1 + defaultTco.spareDevicePct));
    expect(r.deviceRefresh).toBe(devices * defaultTco.deviceCost);
    expect(r.total).toBeCloseTo(r.oneOff + r.deviceRefresh + r.recurringPerYear * 6);
    expect(r.breakdown.reduce((n, b) => n + b.amount, 0)).toBeCloseTo(r.total);
    expect(r.perVisit).toBeGreaterThan(0);
  });
});
