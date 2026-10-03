import type { Role } from "./types";

/**
 * Who may open what. The server enforces this on every request; the sidebar
 * and pages only use it to hide what a role cannot use. One table, so the
 * "Access" page, the menu and the tests cannot drift apart.
 */
const FIELD: Role[] = ["Rep"];
const AREA: Role[] = ["AreaManager", "RegionalManager"];
const HQ: Role[] = ["NationalSalesManager", "Executive", "Admin"];
const COMMERCIAL: Role[] = ["Marketing", "KeyAccountManager"];

const INTERNAL: Role[] = [...FIELD, ...AREA, ...HQ, ...COMMERCIAL];
const MANAGERS: Role[] = [...AREA, ...HQ];

export type Feature =
  | "dashboard"
  | "customers"
  | "deals"
  | "activities"
  | "samples"
  | "rtm"
  | "fieldForce"
  | "dataQuality"
  | "tco"
  | "trace"
  | "portal"
  | "team"
  | "audit"
  | "access";

export const FEATURE_ROLES: Record<Feature, Role[]> = {
  dashboard: INTERNAL,
  customers: INTERNAL,
  deals: INTERNAL,
  activities: INTERNAL,
  samples: INTERNAL,
  rtm: [...MANAGERS, ...COMMERCIAL],
  fieldForce: MANAGERS,
  dataQuality: [...MANAGERS, ...COMMERCIAL],
  tco: HQ,
  trace: MANAGERS,
  // Partners use it; managers can preview a partner's view.
  portal: ["Distributor", ...MANAGERS, "KeyAccountManager"],
  team: MANAGERS,
  audit: MANAGERS,
  access: HQ,
};

export const FEATURE_LABELS: Record<Feature, string> = {
  dashboard: "Dashboard",
  customers: "Customers",
  deals: "Pipeline",
  activities: "Visits and tasks",
  samples: "Samples",
  rtm: "Route to market",
  fieldForce: "Field force",
  dataQuality: "Data quality",
  tco: "Cost of ownership",
  trace: "Batch trace",
  portal: "Distributor portal",
  team: "Team",
  audit: "Audit trail",
  access: "Access rules",
};

export const can = (role: Role, f: Feature) => FEATURE_ROLES[f].includes(role);

export const ALL_ROLES: Role[] = [...INTERNAL, "Distributor"];
