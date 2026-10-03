// Subset of the DAS Engage 360 API contract (see src/web/src/api/types.ts in PR #7).

export type Role =
  | "Rep"
  | "AreaManager"
  | "RegionalManager"
  | "NationalSalesManager"
  | "Marketing"
  | "KeyAccountManager"
  | "Executive"
  | "Admin";

export interface Me {
  id: string;
  tenantId: string;
  fullName: string;
  email: string;
  role: Role;
  territoryId: string | null;
}

export interface Page<T> {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
}

export interface Customer {
  id: string;
  type: string;
  name: string;
  specialty: string | null;
  segment: string;
  city: string | null;
}

export interface SalesDashboard {
  callsCompleted: number;
  plannedVisits: number;
  planAdherencePct: number;
  coveragePct: number;
  byRep: {
    repId: string;
    calls: number;
    uniqueCustomers: number;
    outsideGeofence: number;
  }[];
}

export interface ProductEngagement {
  productId: string;
  name: string;
  calls: number;
  sampleUnits: number;
}

export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface Product {
  id: string;
  name: string;
}

export interface OpportunityResult {
  product: string;
  note: string;
  items: {
    customerId: string;
    name: string;
    likelihood: "High" | "Medium" | "Low";
    probability: number;
  }[];
}
