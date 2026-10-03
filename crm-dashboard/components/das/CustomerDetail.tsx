"use client";

import Link from "next/link";

import { Widget } from "@/components/dashboard/Widget";
import { Badge, Empty, ErrorBanner, Loading, PageHead, Table, Td, Th } from "@/components/ui/primitives";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/das/format";
import type { CustomerFull } from "@/lib/das/types";
import { useDasQuery } from "@/lib/das/useDasQuery";

interface Detail {
  customer: CustomerFull & { channel: string; distributorId: string | null };
  visits: { id: string; at: string; kind: string; outcome: string; verified: boolean; distanceM: number | null }[];
  visitCount: number;
  deals: { id: string; title: string; stage: string; value: number }[];
  tasks: { id: string; title: string; dueAt: string }[];
  orders: { id: string; channel: string; orderedAt: string; deliveredAt: string | null; unitsOrdered: number; unitsDelivered: number; revenue: number }[];
}

export function CustomerDetail({ id }: { id: string }) {
  const q = useDasQuery<Detail>(`/customers/${id}`);
  if (q.error) return <ErrorBanner message={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading what="Loading customer" />;
  const { customer: c, visits, visitCount, deals, tasks, orders } = q.data;
  const rows: [string, string][] = [
    ["Type", c.type],
    ["Segment", c.segment],
    ["City", c.city ?? "—"],
    ["Address", c.address ?? "—"],
    ["Phone", c.phone ?? "—"],
    ["Email", c.email ?? "—"],
    ["Served", c.channel === "Distributor" ? "Through a distributor" : "Directly"],
    ["Target visits a month", String(c.targetVisitsPerMonth)],
    ["Location", c.latitude != null && c.longitude != null ? `${c.latitude.toFixed(4)}, ${c.longitude.toFixed(4)}` : "Not recorded"],
  ];
  return (
    <>
      <PageHead
        title={c.name}
        actions={
          <div className="flex gap-2 text-sm">
            <Link href="/customers" className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-zinc-200 hover:bg-white/10">All customers</Link>
            <Link href="/activities" className="rounded-lg border border-indigo-400/40 bg-indigo-500/70 px-3 py-1.5 font-medium text-white hover:bg-indigo-500">Log a visit</Link>
          </div>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Widget title="Profile">
          <dl className="space-y-2 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-zinc-400">{k}</dt>
                <dd className="text-right text-zinc-100">{v}</dd>
              </div>
            ))}
          </dl>
          {c.latitude == null && <p className="mt-3 text-xs text-amber-200">Visits cannot be location-verified until a location is recorded. Edit the customer on the Customers page to set it.</p>}
        </Widget>
        <Widget title={`Visits (${visitCount})`} className="lg:col-span-2">
          {visits.length === 0 ? <Empty>No visits yet.</Empty> : (
            <Table>
              <thead><tr><Th>When</Th><Th>Type</Th><Th>Outcome</Th><Th>Location</Th></tr></thead>
              <tbody>
                {visits.map((v) => (
                  <tr key={v.id}><Td>{fmtDateTime(v.at)}</Td><Td>{v.kind}</Td><Td>{v.outcome}</Td><Td>{v.verified ? <Badge tone="good">Verified</Badge> : <Badge tone="warn">Not verified</Badge>}</Td></tr>
                ))}
              </tbody>
            </Table>
          )}
        </Widget>
        <Widget title="Deals">
          {deals.length === 0 ? <Empty>No deals.</Empty> : (
            <ul className="space-y-2 text-sm">
              {deals.map((d) => <li key={d.id} className="flex justify-between gap-2"><span>{d.title}</span><span className="text-zinc-300">{d.stage} · {fmtMoney(d.value)}</span></li>)}
            </ul>
          )}
        </Widget>
        <Widget title="Open tasks">
          {tasks.length === 0 ? <Empty>Nothing to do.</Empty> : (
            <ul className="space-y-2 text-sm">
              {tasks.map((t) => <li key={t.id} className="flex justify-between gap-2"><span>{t.title}</span><span className="text-zinc-300">{fmtDate(t.dueAt)}</span></li>)}
            </ul>
          )}
        </Widget>
        <Widget title="Recent orders">
          {orders.length === 0 ? <Empty>No orders.</Empty> : (
            <ul className="space-y-2 text-sm">
              {orders.map((o) => <li key={o.id} className="flex justify-between gap-2"><span>{fmtDate(o.orderedAt)} · {o.channel}</span><span className="text-zinc-300">{o.unitsDelivered}/{o.unitsOrdered} · {fmtMoney(o.revenue)}</span></li>)}
            </ul>
          )}
        </Widget>
      </div>
    </>
  );
}
