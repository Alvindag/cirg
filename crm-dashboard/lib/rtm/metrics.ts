/** RTM metrics from the strategy-review brief: cost-to-serve, order cycle time, OTIF, numerical reach. */

export type Channel = "Direct" | "Distributor";

export interface OrderRecord {
  id: string;
  customerId: string;
  channel: Channel;
  distributorId: string | null;
  region: string;
  orderedAt: string;
  confirmedAt: string;
  promisedAt: string;
  deliveredAt: string | null;
  unitsOrdered: number;
  unitsDelivered: number;
  revenue: number;
  logisticsCost: number;
  distributionCost: number;
  salesCost: number;
  /** Set on orders placed from the CRM or the order app (the older records only carry totals). */
  clientId?: string;
  placedBy?: string;
  lines?: OrderLine[];
  /** What the order is worth at list price, less the distributor discount. Revenue is counted on delivery. */
  orderValue?: number;
  notes?: string | null;
}

export interface OrderLine {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
}

const DAY = 864e5;
const days = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / DAY;

/** On time AND in full. An undelivered order is never OTIF. */
export function isOtif(o: OrderRecord): boolean {
  if (!o.deliveredAt) return false;
  return Date.parse(o.deliveredAt) <= Date.parse(o.promisedAt) && o.unitsDelivered >= o.unitsOrdered;
}

export const totalCost = (o: OrderRecord) => o.logisticsCost + o.distributionCost + o.salesCost;

export interface RtmSummary {
  orders: number;
  delivered: number;
  revenue: number;
  logisticsCost: number;
  distributionCost: number;
  salesCost: number;
  totalCost: number;
  /** Total cost to serve as a share of revenue (0 to 1). */
  costToServePct: number;
  costPerOrder: number;
  onTimePct: number;
  inFullPct: number;
  otifPct: number;
  /** Average days from order confirmation to delivery, delivered orders only. */
  avgCycleDays: number | null;
}

const ratio = (n: number, d: number) => (d === 0 ? 0 : n / d);

export function summarise(orders: OrderRecord[]): RtmSummary {
  const delivered = orders.filter((o) => o.deliveredAt);
  const sum = (f: (o: OrderRecord) => number) => orders.reduce((n, o) => n + f(o), 0);
  const revenue = sum((o) => o.revenue);
  const cost = sum(totalCost);
  const onTime = delivered.filter((o) => Date.parse(o.deliveredAt!) <= Date.parse(o.promisedAt));
  const inFull = delivered.filter((o) => o.unitsDelivered >= o.unitsOrdered);
  const cycle = delivered.map((o) => days(o.confirmedAt, o.deliveredAt!));
  return {
    orders: orders.length,
    delivered: delivered.length,
    revenue,
    logisticsCost: sum((o) => o.logisticsCost),
    distributionCost: sum((o) => o.distributionCost),
    salesCost: sum((o) => o.salesCost),
    totalCost: cost,
    costToServePct: ratio(cost, revenue),
    costPerOrder: ratio(cost, orders.length),
    onTimePct: ratio(onTime.length, delivered.length),
    inFullPct: ratio(inFull.length, delivered.length),
    otifPct: ratio(orders.filter(isOtif).length, delivered.length),
    avgCycleDays: cycle.length ? cycle.reduce((a, b) => a + b, 0) / cycle.length : null,
  };
}

export function groupBy<T, K extends string>(items: T[], key: (t: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const it of items) (out[key(it)] ??= []).push(it);
  return out;
}

/**
 * Numerical reach (penetration): the share of target customers that were
 * actually served, meaning ordered or were visited, in the period.
 */
export function numericalReach(targetIds: string[], reachedIds: Iterable<string>) {
  const target = new Set(targetIds);
  const reached = new Set<string>();
  for (const id of reachedIds) if (target.has(id)) reached.add(id);
  return { target: target.size, reached: reached.size, pct: ratio(reached.size, target.size) };
}

export interface ConflictRow {
  customerId: string;
  directRevenue: number;
  distributorRevenue: number;
  distributorIds: string[];
}

/** Channel conflict: customers that bought both direct and through a distributor in the period. */
export function channelConflicts(orders: OrderRecord[]): ConflictRow[] {
  const byCustomer = groupBy(orders, (o) => o.customerId);
  const rows: ConflictRow[] = [];
  for (const [customerId, list] of Object.entries(byCustomer) as [string, OrderRecord[]][]) {
    const direct = list.filter((o) => o.channel === "Direct");
    const dist = list.filter((o) => o.channel === "Distributor");
    if (direct.length && dist.length) {
      rows.push({
        customerId,
        directRevenue: direct.reduce((n, o) => n + o.revenue, 0),
        distributorRevenue: dist.reduce((n, o) => n + o.revenue, 0),
        distributorIds: [...new Set(dist.map((o) => o.distributorId!).filter(Boolean))],
      });
    }
  }
  return rows.sort(
    (a, b) =>
      Math.min(b.directRevenue, b.distributorRevenue) -
      Math.min(a.directRevenue, a.distributorRevenue)
  );
}
