/** Data-quality checks for customer master data (RTM review phase 1: complete, de-duplicated data). */

export interface DqCustomer {
  id: string;
  name: string;
  type: string;
  city: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  territoryId: string | null;
  latitude: number | null;
  longitude: number | null;
  segment: string;
}

const STOP = new Set(["pharmacy", "pharmacies", "chemist", "clinic", "hospital", "ltd", "limited", "co", "and", "the", "dr", "centre", "center", "services", "enterprise", "enterprises"]);

/** Lower-case, strip punctuation and generic words, so "Unity Pharmacy Ltd." matches "UNITY pharmacy". */
export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .join(" ");
}

export function normalisePhone(phone: string | null): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  // Ghana: +233 24 123 4567 and 024 123 4567 are the same number.
  return digits.startsWith("233") ? digits.slice(3) : digits.replace(/^0/, "");
}

/** Levenshtein distance, two-row version. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

const similarity = (a: string, b: string) =>
  a.length === 0 && b.length === 0 ? 1 : 1 - editDistance(a, b) / Math.max(a.length, b.length);

export interface DuplicatePair {
  a: string;
  b: string;
  /** 0 to 1. */
  score: number;
  reasons: string[];
}

/**
 * Likely duplicates: same normalised name in the same city, a very similar name
 * in the same city, or the same phone number. Exact, name-based and phone-based
 * evidence is reported as reasons so a person can judge before merging.
 */
export function findDuplicates(customers: DqCustomer[], threshold = 0.85): DuplicatePair[] {
  const norm = customers.map((c) => ({ c, name: normaliseName(c.name), phone: normalisePhone(c.phone), city: (c.city ?? "").trim().toLowerCase() }));
  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < norm.length; i++) {
    for (let j = i + 1; j < norm.length; j++) {
      const x = norm[i];
      const y = norm[j];
      const reasons: string[] = [];
      let score = 0;
      const samePhone = x.phone.length >= 7 && x.phone === y.phone;
      if (samePhone) {
        reasons.push("same phone number");
        score = Math.max(score, 0.9);
      }
      if (x.city && x.city === y.city && x.name && y.name) {
        const s = similarity(x.name, y.name);
        if (s === 1) {
          reasons.push("same name and city");
          score = Math.max(score, 1);
        } else if (s >= threshold) {
          reasons.push(`very similar name in ${x.c.city}`);
          score = Math.max(score, s);
        }
      }
      if (score >= threshold) pairs.push({ a: x.c.id, b: y.c.id, score: Math.round(score * 100) / 100, reasons });
    }
  }
  return pairs.sort((p, q) => q.score - p.score);
}

export type IssueKind = "missing-phone" | "missing-city" | "missing-territory" | "missing-location" | "bad-email" | "unclassified-segment";

export interface QualityIssue {
  customerId: string;
  kind: IssueKind;
  message: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function qualityIssues(customers: DqCustomer[]): QualityIssue[] {
  const out: QualityIssue[] = [];
  for (const c of customers) {
    const add = (kind: IssueKind, message: string) => out.push({ customerId: c.id, kind, message });
    if (!c.phone?.trim()) add("missing-phone", "No phone number");
    if (!c.city?.trim()) add("missing-city", "No city");
    if (!c.territoryId) add("missing-territory", "Not assigned to a territory");
    if (c.latitude == null || c.longitude == null) add("missing-location", "No GPS location, so visits cannot be verified");
    if (c.email && !EMAIL.test(c.email)) add("bad-email", `Email "${c.email}" is not valid`);
    if (c.segment === "Unclassified") add("unclassified-segment", "Segment not set");
  }
  return out;
}

/** Share of the fields that matter that are filled in, 0 to 1. */
export function completeness(customers: DqCustomer[]): number {
  if (customers.length === 0) return 1;
  const fields = (c: DqCustomer) => [c.phone?.trim(), c.city?.trim(), c.territoryId, c.latitude != null && c.longitude != null, c.address?.trim(), c.segment !== "Unclassified"];
  const total = customers.length * 6;
  const filled = customers.reduce((n, c) => n + fields(c).filter(Boolean).length, 0);
  return filled / total;
}
