import { can, type Feature } from "@/lib/das/rbac";
import type { Customer, DB, User } from "./model";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const forbid = (msg = "Your role cannot do this."): never => {
  throw new HttpError(403, msg);
};

export function requireFeature(u: User, f: Feature) {
  if (!can(u.role, f)) forbid();
}

const WIDE: User["role"][] = ["NationalSalesManager", "Executive", "Admin", "Marketing", "KeyAccountManager"];

/** The people whose data this user may see: themselves and everyone below them. Wide roles see everyone. */
export function visibleUserIds(db: DB, u: User): Set<string> {
  if (u.role === "Distributor") return new Set();
  if (WIDE.includes(u.role)) return new Set(db.users.map((x) => x.id));
  const ids = new Set([u.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const x of db.users) {
      if (x.managerId && ids.has(x.managerId) && !ids.has(x.id)) {
        ids.add(x.id);
        grew = true;
      }
    }
  }
  return ids;
}

export const isWide = (u: User) => WIDE.includes(u.role);

export const isActiveCustomer = (c: Customer) => !c.archivedAt && !c.mergedInto;

/** Customers this user may see: those in the territories of the people they can see. */
export function visibleCustomers(db: DB, u: User): Customer[] {
  const active = db.customers.filter(isActiveCustomer);
  if (isWide(u)) return active;
  if (u.role === "Distributor") return active.filter((c) => c.distributorId === u.distributorId);
  const people = visibleUserIds(db, u);
  const terr = new Set(db.users.filter((x) => people.has(x.id) && x.territoryId).map((x) => x.territoryId!));
  return active.filter((c) => c.territoryId && terr.has(c.territoryId));
}

/** Follows merges, so old records resolve to the surviving customer. */
export function resolveCustomerId(db: DB, id: string): string {
  let cur = id;
  for (let i = 0; i < 10; i++) {
    const c = db.customers.find((x) => x.id === cur);
    if (!c?.mergedInto) return cur;
    cur = c.mergedInto;
  }
  return cur;
}
