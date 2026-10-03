export type Role =
  | 'Rep' | 'AreaManager' | 'RegionalManager' | 'NationalSalesManager' | 'Marketing' | 'KeyAccountManager' | 'Executive' | 'Admin'

export interface Me {
  id: string
  tenantId: string
  fullName: string
  email: string
  role: Role
  territoryId: string | null
}

export interface AppUser extends Me {
  externalId: string
  managerId: string | null
  isActive: boolean
}

export interface Territory { id: string; name: string; region: string | null; district: string | null }

export interface Customer {
  id: string
  type: string
  name: string
  specialty: string | null
  segment: string
  territoryId: string | null
  phone: string | null
  email: string | null
  city: string | null
  targetVisitsPerMonth: number
}

export interface Page<T> { total: number; page: number; pageSize: number; items: T[] }

export interface SalesDashboard {
  callsCompleted: number
  plannedVisits: number
  planAdherencePct: number
  coveragePct: number
  byRep: { repId: string; calls: number; uniqueCustomers: number; outsideGeofence: number }[]
}

export interface TrendPoint { date: string; calls: number }
export interface ProductEngagement { productId: string; name: string; calls: number; sampleUnits: number }
export interface LastKnown { repId: string; recordedAt: string; latitude: number; longitude: number }

export interface ImportRow { row: number; status: string; message: string | null; customerId: string | null; matchedCustomerId: string | null }
export interface ImportResult { dryRun: boolean; total: number; created: number; updated: number; skipped: number; errors: number; rows: ImportRow[] }

export interface Product {
  id: string; name: string; code: string | null
  therapeuticArea?: string | null; standardCost?: number | null; reorderLevel?: number | null
  /** Most units one customer may be given in `sampleLimitDays` days; null = no limit. */
  sampleLimitPerCustomer?: number | null; sampleLimitDays?: number | null
  /** Selling price (GHS) that orders are priced from; null = not for sale yet. */
  listPrice?: number | null
}
export interface AppNotification { id: string; kind: string; title: string; body: string | null; createdAt: string; readAt: string | null }
export interface Batch { id: string; productId: string; batchNumber: string; expiryDate: string; status: string; statusReason: string | null }

export interface SampleRequest {
  id: string
  repId: string
  productId: string
  quantity: number
  approvedQuantity: number | null
  status: 'Pending' | 'Approved' | 'Rejected' | 'Fulfilled' | 'Cancelled'
  notes: string | null
  decisionNote: string | null
  createdAt: string
}

export interface StockRow {
  holderId: string | null
  location: 'Warehouse' | 'Rep'
  batchId: string
  productId: string
  batchNumber: string
  expiryDate: string
  daysToExpiry: number
  status: string
  quantity: number
  expired: boolean
  expiringSoon: boolean
  actionRequired: boolean
}

export interface Compliance {
  period: { from: string; to: string }
  distributions: { count: number; units: number; withoutSignature: number; withoutSignatureUnits: number }
  byRep: { repId: string; count: number; units: number; withoutSignature: number }[]
  stockHeld: { expiredUnits: number; expiringWithin90DaysUnits: number; quarantinedOrRecalledUnits: number }
  writeOffs: { count: number; units: number }
  reconciliation: { ok: boolean; negativeBalances: unknown[]; ledgerDistributionUnits: number; loggedDistributionUnits: number }
}

export interface AuditEntry {
  id: number
  userId: string | null
  at: string
  action: string
  entityType: string
  entityId: string
  changes: string | null
}

export interface ScoreRow { customerId: string; name: string; potential: number; engagement: number; overall: number; status: string; suggestedSegment: string | null }
export interface Factor { name: string; points: number; max: number; explanation: string }
export interface ScoreDetail extends ScoreRow { factors: Factor[] }

export interface OpportunityItem { customerId: string; name: string; likelihood: 'High' | 'Medium' | 'Low'; probability: number; factors: Factor[] }
export interface OpportunityResult { product: string; note: string; items: OpportunityItem[] }

export interface TerritoryLoad { territoryId: string; name: string; customers: number; requiredCallsPerMonth: number; reps: number; capacityPerMonth: number; loadRatio: number; status: string }
export interface MoveSuggestion { customerId: string; customerName: string; fromTerritoryId: string; toTerritoryId: string; callsPerMonth: number; distanceToCurrentKm: number; distanceToNewKm: number }
export interface BalanceResult { territories: TerritoryLoad[]; suggestions: MoveSuggestion[] }

export interface Governance {
  configuration: { providerEnabled: boolean; provider: string; tenantOptIn: boolean; chatDeployment: string; transcriptionDeployment: string; dailyLimitPerUser: number; maxInputChars: number }
  usageLast30Days: { feature: string; requests: number; failed: number; inputTokens: number; outputTokens: number; averageLatencyMs: number; accepted: number; rejected: number; pendingReview: number }[]
  topUsers: { userId: string; requests: number }[]
  safeguards: string[]
}

export interface RevenueResult {
  currency: string
  total: number
  previousTotal: number
  growthPct: number | null
  units: number
  customersBuying: number
  unlinkedAmount: number
  granularity: 'day' | 'month'
  trend: { period: string; amount: number; units: number }[]
  topCustomers: { customerId: string; name: string; amount: number }[]
  byProduct: { productId: string | null; name: string; amount: number }[]
  byTerritory: { territoryId: string | null; name: string; amount: number }[]
}

export interface ErpConnection {
  provider: 'none' | 'rest' | 'businesscentral'
  baseUrl: string | null
  secretName: string | null
  enabled: boolean
  outboundEnabled: boolean
  pullEnabled: boolean
  pullIntervalMinutes: number
  currency: string
  lastPullAt: string | null
  lastError: string | null
}
export interface IntegrationKeyRow { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null }
export interface CreatedKey { id: string; name: string; prefix: string; key: string; note: string }
export interface SyncRunRow { id: string; entity: string; source: string; startedAt: string; created: number; updated: number; skipped: number; errors: number; message: string | null }
export interface OutboxRow { id: string; type: string; status: 'Pending' | 'Sent' | 'DeadLetter'; attempts: number; createdAt: string; nextAttemptAt: string; lastError: string | null; externalRef: string | null }
export interface OutboxResult { counts: { status: string; n: number }[]; items: OutboxRow[] }
export interface ErpImportResult { entity: string; source: string; created: number; updated: number; skipped: number; errors: number; items: { key: string; status: string; message: string | null }[] }
export interface Unmatched { customers: { accountCode: string; lines: number; amount: number }[]; items: { itemCode: string; lines: number }[] }
export interface StockReconciliation {
  balanced: boolean
  snapshotCount: number
  rows: { itemCode: string; product: string | null; batchNumber: string | null; das: number; erp: number | null; difference: number | null; status: string }[]
}
export interface Suggestion { productId: string; itemCode: string | null; name: string; reorderLevel: number; available: number; onOrder: number; monthlyUsage: number; monthsOfCover: number | null; belowReorderLevel: boolean; suggestedQuantity: number }
export interface Requisition { id: string; productId: string; quantity: number; neededBy: string | null; note: string | null; status: 'Draft' | 'Approved' | 'Received' | 'Rejected' | 'Cancelled'; requestedBy: string; erpReference: string | null; receivedQuantity: number; decisionNote: string | null; createdAt: string }

// ---- Route to market ----
export type SalesChannel = 'Unassigned' | 'VanSales' | 'MedicalSales' | 'Distributor' | 'DirectKeyAccount' | 'WalkIn'
export type OutletClass = 'Unclassified' | 'TeachingHospital' | 'RegionalHospital' | 'DistrictHospital' | 'PharmacyChain' | 'IndependentPharmacy' | 'OtcShop' | 'ClinicOrOther'
export interface RtmRow { universe: number | null; mapped: number; reached: number; revenue: number }
export interface RtmDashboard {
  currency: string; hasUniverse: boolean; universeScoped: boolean; universeTotal: number | null
  mapped: number; reached: number; mappedPct: number | null; reachedPct: number | null
  revenue: number; top20Share: number | null
  classes: (RtmRow & { outletClass: OutletClass })[]
  channels: { channel: SalesChannel; customers: number; reached: number; revenue: number }[]
  regions: (RtmRow & { region: string })[]
  tagging: { total: number; noChannel: number; noClass: number; noRegion: number }
}
export interface UniverseRow { region: string | null; outletClass: OutletClass; outlets: number; source: string | null }
export interface UntaggedList { total: number; items: { id: string; name: string; type: string; city: string | null; channel: SalesChannel; outletClass: OutletClass }[] }

export type OrderStatus = 'Placed' | 'Confirmed' | 'Delivered' | 'Cancelled'
export interface OrderLine { id: string; productId: string; productName: string; quantity: number; unitPrice: number; lineTotal: number }
export interface SalesOrder {
  id: string; number: string; repId: string; customerId: string; customerName: string; status: OrderStatus
  total: number; currency: string; notes: string | null; placedAt: string
  confirmedAt: string | null; deliveredAt: string | null; cancelledAt: string | null; cancelReason: string | null
  lines: OrderLine[]
}
export interface OrderSummary {
  days: number; orders: number; value: number; placed: number; confirmed: number; delivered: number; cancelled: number
  avgHoursToDeliver: number | null; topProducts: { productId: string; name: string; quantity: number; value: number }[]
}

export interface CoverageTerritory { territoryId: string | null; territory: string; region: string | null; customers: number; expected: number; completed: number; attainmentPct: number | null; overdue: number; neverVisited: number }
export interface CoverageCustomer { customerId: string; name: string; type: string; segment: string; territory: string; targetPerMonth: number; lastVisitAt: string | null; daysSince: number | null }
export interface CoverageDashboard {
  days: number; customers: number; expectedVisits: number; completedVisits: number; attainmentPct: number | null; overdue: number; neverVisited: number
  territories: CoverageTerritory[]; worst: CoverageCustomer[]
}

export interface TargetRowDto { region: string | null; channel: SalesChannel | null; amount: number }
export interface TargetProgressRow { region: string | null; channel: SalesChannel | null; target: number | null; actual: number; attainmentPct: number | null; projected: number | null; projectedPct: number | null }
export interface TargetsDashboard { month: string; currency: string; scoped: boolean; daysInMonth: number; daysElapsed: number; paceNote: string | null; companyActual: number; rows: TargetProgressRow[] }
