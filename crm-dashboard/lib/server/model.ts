import type { OrderRecord } from "@/lib/rtm/metrics";

/** The built-in backend's data model. It mirrors the DAS Engage 360 API shapes where they exist. */

export type Role =
  | "Rep"
  | "AreaManager"
  | "RegionalManager"
  | "NationalSalesManager"
  | "Marketing"
  | "KeyAccountManager"
  | "Executive"
  | "Admin"
  | "Distributor";

export interface User {
  id: string;
  tenantId: string;
  fullName: string;
  email: string;
  role: Role;
  territoryId: string | null;
  externalId: string;
  managerId: string | null;
  isActive: boolean;
  /** Set for Distributor users: the partner they belong to. */
  distributorId: string | null;
  /** Microsoft account id, bound on first sign-in so a reassigned email cannot take the account over. */
  entraOid?: string | null;
}

export interface Territory {
  id: string;
  name: string;
  region: string | null;
  district: string | null;
}

export interface Distributor {
  id: string;
  name: string;
  region: string;
  /** Discount off list price that the distributor buys at (0 to 1). */
  discountPct: number;
  active: boolean;
}

export interface Customer {
  id: string;
  type: string;
  name: string;
  specialty: string | null;
  segment: string;
  territoryId: string | null;
  parentCustomerId: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  targetVisitsPerMonth: number;
  productInterests: { productId: string }[];
  /** How the outlet is normally served. */
  channel: "Direct" | "Distributor";
  distributorId: string | null;
  createdAt: string;
  /** Set when the record was merged into another one (kept, never deleted). */
  mergedInto?: string | null;
  /** Set when the record was removed from use (kept for history). */
  archivedAt?: string | null;
}

export interface Product {
  id: string;
  name: string;
  therapeuticArea: string | null;
  standardCost: number | null;
  /** Price list, per unit. */
  listPrice: number;
  reorderLevel: number | null;
  sampleLimitPerCustomer: number | null;
  sampleLimitDays: number | null;
}

export interface Batch {
  id: string;
  productId: string;
  batchNumber: string;
  expiryDate: string;
  manufacturedAt: string;
  status: "Active" | "Quarantined" | "Recalled";
  statusReason: string | null;
}

/** Units of a batch held by the warehouse (holderId null) or by a rep. */
export interface StockLot {
  batchId: string;
  holderId: string | null;
  quantity: number;
}

/** Units of a product held by a distributor, for the partner portal. */
export interface DistributorStock {
  distributorId: string;
  productId: string;
  units: number;
  reorderLevel: number;
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
  allocations?: { batchId: string; quantity: number }[];
}

/** A sample hand-over to a customer. */
export interface Distribution {
  id: string;
  repId: string;
  customerId: string;
  batchId: string;
  units: number;
  at: string;
  signed: boolean;
}

export interface Ledger {
  id: string;
  kind: "Receipt" | "Adjustment" | "WriteOff" | "Return" | "Issue" | "Distribution";
  batchId: string;
  holderId: string | null;
  delta: number;
  reason: string | null;
  at: string;
  userId: string;
}

export type DealStage = "Lead" | "Qualified" | "Proposal" | "Negotiation" | "Won" | "Lost";

export const DEAL_STAGES: DealStage[] = ["Lead", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];

export interface Deal {
  id: string;
  title: string;
  customerId: string;
  ownerId: string;
  stage: DealStage;
  value: number;
  expectedClose: string;
  createdAt: string;
  updatedAt: string;
  lostReason: string | null;
}

export interface Task {
  id: string;
  title: string;
  dueAt: string;
  ownerId: string;
  customerId: string | null;
  done: boolean;
  createdAt: string;
}

/** A customer visit or call. Hash-chained so it cannot be altered unnoticed. */
export interface Visit {
  id: string;
  /** Generated on the device, so a retry after a bad connection is not saved twice. */
  clientId: string;
  repId: string;
  customerId: string;
  at: string;
  kind: "Visit" | "Call";
  outcome: string;
  notes: string | null;
  durationMin: number | null;
  productIds: string[];
  latitude: number | null;
  longitude: number | null;
  distanceM: number | null;
  verified: boolean;
  verifyReason: string | null;
  /** When the server received it (can be later than `at` for offline visits). */
  receivedAt: string;
  prevHash: string;
  hash: string;
}

export interface AuditEntry {
  id: number;
  userId: string | null;
  at: string;
  action: string;
  entityType: string;
  entityId: string;
  changes: string | null;
  reason: string | null;
  prevHash: string;
  hash: string;
}

export interface Notification {
  id: string;
  userId: string | null;
  kind: string;
  title: string;
  body: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface TcoScenario {
  id: string;
  name: string;
  inputs: import("@/lib/rtm/tco").TcoInputs;
  createdBy: string;
  createdAt: string;
}

export interface DB {
  version: number;
  seededAt: string;
  users: User[];
  territories: Territory[];
  distributors: Distributor[];
  customers: Customer[];
  products: Product[];
  batches: Batch[];
  stock: StockLot[];
  distributorStock: DistributorStock[];
  sampleRequests: SampleRequest[];
  distributions: Distribution[];
  ledger: Ledger[];
  deals: Deal[];
  tasks: Task[];
  visits: Visit[];
  orders: OrderRecord[];
  audit: AuditEntry[];
  notifications: Notification[];
  tcoScenarios: TcoScenario[];
}
