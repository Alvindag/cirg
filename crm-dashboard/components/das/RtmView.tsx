"use client";

import { useState } from "react";

import { Widget } from "@/components/dashboard/Widget";
import { Badge, Empty, ErrorBanner, Loading, PageHead, Select, Table, Td, Th } from "@/components/ui/primitives";
import { Meter, Stat, StatGrid, Why } from "@/components/ui/kit";
import { fmtMoney } from "@/lib/das/format";
import { rangeLastDays } from "@/lib/das/range";
import { useDasQuery } from "@/lib/das/useDasQuery";

interface Row {
  label: string;
  orders: number;
  revenue: number;
  totalCost: number;
  costToServePct: number;
  costPerOrder: number;
  otifPct: number;
  onTimePct: number;
  inFullPct: number;
  avgCycleDays: number | null;
}
interface Summary {
  overall: Row;
  byChannel: Row[];
  byRegion: Row[];
  reach: { target: number; reached: number; pct: number };
  conflicts: number;
  targets: { otifPct: number; costToServePct: number };
}
interface Hotspot {
  region: string;
  otifPct: number;
  costToServePct: number;
  cause: string;
  lateOrders: number;
  shortOrders: number;
  customers: number;
  visitCoveragePct: number;
  unmapped: number;
}
interface Conflict {
  customerId: string;
  customerName: string;
  city: string | null;
  directRevenue: number;
  distributorRevenue: number;
  distributors: string[];
  overlapRevenue: number;
}

const otifTone = (v: number, t: number) => (v >= t ? "good" : v >= t - 10 ? "warn" : "bad");

export function RtmView() {
  const [days, setDays] = useState(180);
  const [region, setRegion] = useState("");
  const [channel, setChannel] = useState("");
  const range = { ...rangeLastDays(days), region: region || undefined, channel: channel || undefined };
  const s = useDasQuery<Summary>("/rtm/summary", range);
  const hot = useDasQuery<Hotspot[]>("/rtm/hotspots", range);
  const conf = useDasQuery<Conflict[]>("/rtm/conflicts", range);
  const o = s.data?.overall;
  const t = s.data?.targets;

  return (
    <>
      <PageHead title="Route to market" />
      <Why>
        Where does it cost too much to serve, where do deliveries fail, and where do direct and distributor sales collide? These are the measures from the route-to-market review, worked out from every order.
      </Why>
      <div className="mb-4 flex flex-wrap gap-2">
        <Select aria-label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[30, 90, 180, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </Select>
        <Select aria-label="Region" value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="">All regions</option>
          {(hot.data ?? []).map((h) => <option key={h.region}>{h.region}</option>)}
        </Select>
        <Select aria-label="Channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="">Both channels</option>
          <option>Direct</option>
          <option>Distributor</option>
        </Select>
      </div>
      {s.error && <ErrorBanner message={s.error} onRetry={s.reload} />}
      {s.loading && !s.data && <Loading what="Loading route-to-market figures" />}
      {o && t && s.data && (
        <div className="space-y-4">
          <Widget title="Service and cost">
            <StatGrid cols={5}>
              <Stat label="On time, in full (OTIF)" value={`${o.otifPct}%`} hint={`target ${t.otifPct}%`} tone={otifTone(o.otifPct, t.otifPct)} />
              <Stat label="Cost to serve" value={`${o.costToServePct}%`} hint={`of revenue, ${fmtMoney(o.totalCost)}`} tone={o.costToServePct <= t.costToServePct ? "good" : "bad"} />
              <Stat label="Order cycle time" value={o.avgCycleDays === null ? "—" : `${o.avgCycleDays} days`} hint="confirmation to delivery" />
              <Stat label="Numerical reach" value={`${s.data.reach.pct}%`} hint={`${s.data.reach.reached} of ${s.data.reach.target} outlets`} tone={s.data.reach.pct >= 80 ? "good" : "warn"} />
              <Stat label="Channel conflict" value={s.data.conflicts} hint="outlets bought both ways" tone={s.data.conflicts > 0 ? "warn" : "good"} />
            </StatGrid>
          </Widget>

          <div className="grid gap-4 lg:grid-cols-2">
            <Widget title="By channel">
              <Table>
                <thead><tr><Th>Channel</Th><Th num>Orders</Th><Th num>Revenue</Th><Th num>Cost to serve</Th><Th num>OTIF</Th></tr></thead>
                <tbody>
                  {s.data.byChannel.map((r) => (
                    <tr key={r.label}>
                      <Td>{r.label}</Td><Td num>{r.orders}</Td><Td num>{fmtMoney(r.revenue)}</Td>
                      <Td num>{r.costToServePct}%</Td><Td num>{r.otifPct}%</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <p className="mt-2 text-xs text-zinc-400">Distributor orders carry the distributor&apos;s margin as well as freight.</p>
            </Widget>
            <Widget title="OTIF by region">
              <div className="space-y-2">
                {s.data.byRegion.map((r) => (
                  <Meter key={r.label} label={r.label} value={r.otifPct} target={t.otifPct} display={`${r.otifPct}%`} tone={r.otifPct >= t.otifPct ? undefined : r.otifPct >= t.otifPct - 10 ? "warn" : "bad"} />
                ))}
              </div>
              <p className="mt-2 text-xs text-zinc-400">The white mark is the {t.otifPct}% target.</p>
            </Widget>
          </div>

          <Widget title="Where to act first">
            {hot.data && (
              <Table>
                <thead><tr><Th>Region</Th><Th num>OTIF</Th><Th num>Cost to serve</Th><Th>Main cause</Th><Th num>Visit coverage</Th><Th num>No GPS</Th></tr></thead>
                <tbody>
                  {hot.data.map((h) => (
                    <tr key={h.region}>
                      <Td>{h.region}</Td>
                      <Td num><Badge tone={otifTone(h.otifPct, t.otifPct)}>{h.otifPct}%</Badge></Td>
                      <Td num>{h.costToServePct}%</Td>
                      <Td>{h.cause} ({h.lateOrders} late, {h.shortOrders} short)</Td>
                      <Td num>{h.visitCoveragePct}%</Td>
                      <Td num>{h.unmapped}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            <p className="mt-2 text-xs text-zinc-400">Regions are ordered worst first. Visit coverage is the share of outlets visited in the last 90 days.</p>
          </Widget>

          <Widget title="Channel conflict: outlets served directly and by a distributor">
            {conf.data && (conf.data.length === 0 ? <Empty>No outlets are bought from both channels.</Empty> : (
              <Table>
                <thead><tr><Th>Outlet</Th><Th>City</Th><Th num>Direct</Th><Th num>Via distributor</Th><Th>Distributor</Th></tr></thead>
                <tbody>
                  {conf.data.slice(0, 15).map((c) => (
                    <tr key={c.customerId}>
                      <Td>{c.customerName}</Td><Td>{c.city ?? "—"}</Td>
                      <Td num>{fmtMoney(c.directRevenue)}</Td><Td num>{fmtMoney(c.distributorRevenue)}</Td>
                      <Td>{c.distributors.join(", ") || "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ))}
            <p className="mt-2 text-xs text-zinc-400">Decide one owner per outlet to avoid price undercutting and double commissions.</p>
          </Widget>
        </div>
      )}
    </>
  );
}
