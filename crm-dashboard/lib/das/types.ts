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
  territoryId: string | null;
  city: string | null;
  targetVisitsPerMonth: number;
}

/** Full customer record, as returned by GET /customers/:id. */
export interface CustomerFull extends Omit<Customer, "targetVisitsPerMonth"> {
  parentCustomerId: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  targetVisitsPerMonth: number;
  productInterests?: { productId: string }[];
}

export interface ImportRow {
  row: number;
  status: string;
  message: string | null;
  customerId: string | null;
  matchedCustomerId: string | null;
}

export interface ImportResult {
  dryRun: boolean;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  rows: ImportRow[];
}

export interface Territory {
  id: string;
  name: string;
  region: string | null;
  district: string | null;
}

export interface AppUser extends Me {
  externalId: string;
  managerId: string | null;
  isActive: boolean;
}

export interface Batch {
  id: string;
  productId: string;
  batchNumber: string;
  expiryDate: string;
  status: string;
  statusReason: string | null;
}

export interface SampleRequest {
  id: string;
  repId: string;
  productId: string;
  quantity: number;
  approvedQuantity: number | null;
  status: "Pending" | "Approved" | "Rejected" | "Fulfilled" | "Cancelled";
  notes: string | null;
  decisionNote: string | null;
  createdAt: string;
}

export interface StockRow {
  holderId: string | null;
  location: "Warehouse" | "Rep";
  batchId: string;
  productId: string;
  batchNumber: string;
  expiryDate: string;
  daysToExpiry: number;
  status: string;
  quantity: number;
  expired: boolean;
  expiringSoon: boolean;
  actionRequired: boolean;
}

export interface Compliance {
  period: { from: string; to: string };
  distributions: {
    count: number;
    units: number;
    withoutSignature: number;
    withoutSignatureUnits: number;
  };
  byRep: {
    repId: string;
    count: number;
    units: number;
    withoutSignature: number;
  }[];
  stockHeld: {
    expiredUnits: number;
    expiringWithin90DaysUnits: number;
    quarantinedOrRecalledUnits: number;
  };
  writeOffs: { count: number; units: number };
  reconciliation: {
    ok: boolean;
    ledgerDistributionUnits: number;
    loggedDistributionUnits: number;
  };
}

export interface AuditEntry {
  id: number;
  userId: string | null;
  at: string;
  action: string;
  entityType: string;
  entityId: string;
  changes: string | null;
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
  therapeuticArea?: string | null;
  standardCost?: number | null;
  reorderLevel?: number | null;
  /** Most units one customer may be given in `sampleLimitDays` days; null = no limit. */
  sampleLimitPerCustomer?: number | null;
  sampleLimitDays?: number | null;
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
