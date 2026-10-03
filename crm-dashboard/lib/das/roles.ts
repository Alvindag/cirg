import type { Role } from "./types";

/** Mirrors the API's `Roles.Managers`: may read team data, users, audit log and sample reports. */
export const isManager = (r: Role) =>
  [
    "AreaManager",
    "RegionalManager",
    "NationalSalesManager",
    "Executive",
    "Admin",
  ].includes(r);

/** Create users, territories and batches; issue stock. */
export const isAdmin = (r: Role) =>
  r === "Admin" || r === "NationalSalesManager";

/** May approve or reject sample requests (for people in their reporting line). */
export const canApproveSamples = (r: Role) =>
  ["AreaManager", "RegionalManager", "NationalSalesManager", "Admin"].includes(
    r,
  );

export const canImportCustomers = (r: Role) =>
  ["AreaManager", "RegionalManager", "NationalSalesManager", "Admin"].includes(
    r,
  );

export const canEditCustomers = (r: Role) =>
  [
    "AreaManager",
    "RegionalManager",
    "NationalSalesManager",
    "KeyAccountManager",
    "Marketing",
    "Admin",
  ].includes(r);

/** "NationalSalesManager" -> "National Sales Manager". */
export const roleLabel = (r: string) => r.replace(/([a-z])([A-Z])/g, "$1 $2");

export const ROLES: Role[] = [
  "Rep",
  "AreaManager",
  "RegionalManager",
  "NationalSalesManager",
  "Marketing",
  "KeyAccountManager",
  "Executive",
  "Admin",
];
