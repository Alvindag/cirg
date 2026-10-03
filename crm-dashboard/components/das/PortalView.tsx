"use client";

import { useEffect, useState } from "react";

import { Widget } from "@/components/dashboard/Widget";
import { Badge, Button, Empty, ErrorBanner, Loading, Notice, PageHead, Select, Table, Tabs, Td, Th } from "@/components/ui/primitives";
import { Meter, Stat, StatGrid, Why } from "@/components/ui/kit";
import { useDas } from "@/lib/das/context";
import { fmtDate, fmtMoney } from "@/lib/das/format";
import { useActions } from "@/lib/das/useActions";
import { useDasApi } from "@/lib/das/useDasApi";
import { useDasQuery } from "@/lib/das/useDasQuery";

type Tab = "overview" | "pricing" | "inventory" | "orders" | "performance";
interface Partner { id: string; name: string; region: string }

export function PortalView() {
  const { me } = useDas();
  const isPartner = me?.role === "Distributor";
  const partners = useDasQuery<Partner[]>("/portal/partners");
  const [pick, setPick] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  useEffect(() => {
    if (!pick && partners.data?.[0]) setPick(partners.data[0].id);
  }, [partners.data, pick]);
  // A partner never sends an id: the server takes it from their account.
  const scope = isPartner ? undefined : { distributorId: pick || undefined };
  const ready = isPartner || !!pick;
  const partner = partners.data?.find((p) => p.id === pick) ?? partners.data?.[0];

  return (
    <>
      <PageHead title={isPartner ? "Distributor portal" : "Distributor portal (preview)"} />
      <Why>
        {isPartner
          ? `You are signed in as ${partner?.name ?? "a distributor partner"}. You can see your own prices, stock and performance. You cannot see other distributors or DAS internal data.`
          : "This is what a partner sees. Pick a distributor to preview their view. Partners only ever see their own prices, stock and orders, and the server enforces that."}
      </Why>
      {!isPartner && (
        <div className="mb-4">
          <Select aria-label="Preview as distributor" value={pick} onChange={(e) => setPick(e.target.value)}>
            {(partners.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
      )}
      <Tabs
        tabs={[["overview", "Overview"], ["pricing", "My prices"], ["inventory", "My stock"], ["orders", "Orders"], ["performance", "Performance"]]}
        value={tab}
        onChange={setTab}
      />
      {ready && tab === "overview" && <Overview scope={scope} />}
      {ready && tab === "pricing" && <Pricing scope={scope} />}
      {ready && tab === "inventory" && <Inventory scope={scope} canRequest={isPartner} />}
      {ready && tab === "orders" && <Orders scope={scope} />}
      {ready && tab === "performance" && <Performance scope={scope} />}
    </>
  );
}

type Scope = { distributorId?: string } | undefined;

function Overview({ scope }: { scope: Scope }) {
  const q = useDasQuery<{ partner: Partner; orders: number; revenue: number; otifPct: number; avgCycleDays: number | null; outletsServed: number; lowStock: number; stockLines: number }>("/portal/overview", scope);
  if (q.error) return <ErrorBanner message={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading what="Loading overview" />;
  const d = q.data;
  return (
    <Widget title={`${d.partner.name}, last 90 days`}>
      <StatGrid cols={5}>
        <Stat label="Orders" value={d.orders} />
        <Stat label="Sales" value={fmtMoney(d.revenue)} />
        <Stat label="On time, in full" value={`${d.otifPct}%`} tone={d.otifPct >= 95 ? "good" : d.otifPct >= 85 ? "warn" : "bad"} hint="target 95%" />
        <Stat label="Outlets served" value={d.outletsServed} />
        <Stat label="Products low on stock" value={d.lowStock} hint={`of ${d.stockLines}`} tone={d.lowStock ? "warn" : "good"} />
      </StatGrid>
    </Widget>
  );
}

function Pricing({ scope }: { scope: Scope }) {
  const q = useDasQuery<{ discountPct: number; items: { productId: string; name: string; therapeuticArea: string | null; listPrice: number; netPrice: number }[] }>("/portal/pricing", scope);
  if (q.error) return <ErrorBanner message={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading what="Loading prices" />;
  return (
    <Widget title={`Your price list (${q.data.discountPct}% off list)`}>
      <Table>
        <thead><tr><Th>Product</Th><Th>Area</Th><Th num>List price</Th><Th num>Your price</Th></tr></thead>
        <tbody>
          {q.data.items.map((p) => (
            <tr key={p.productId}><Td>{p.name}</Td><Td>{p.therapeuticArea ?? "—"}</Td><Td num>GH₵{p.listPrice.toFixed(2)}</Td><Td num>GH₵{p.netPrice.toFixed(2)}</Td></tr>
          ))}
        </tbody>
      </Table>
    </Widget>
  );
}

function Inventory({ scope, canRequest }: { scope: Scope; canRequest: boolean }) {
  const api = useDasApi();
  const q = useDasQuery<{ productId: string; name: string; units: number; reorderLevel: number; status: string }[]>("/portal/inventory", scope);
  const { message, error, act, setError } = useActions(q.reload);
  if (q.error) return <ErrorBanner message={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading what="Loading stock" />;
  const ask = (productId: string, name: string) => {
    const raw = window.prompt(`How many units of ${name} do you need?`);
    if (raw === null) return;
    const units = Number(raw);
    if (!Number.isInteger(units) || units < 1) return setError("Enter a whole number of 1 or more.");
    void act(() => api.post("/portal/restock", { productId, units }), "Request sent to DAS.");
  };
  return (
    <Widget title="Your stock">
      {message && <Notice>{message}</Notice>}
      {error && <ErrorBanner message={error} />}
      <Table>
        <thead><tr><Th>Product</Th><Th num>Units</Th><Th num>Reorder at</Th><Th>Status</Th>{canRequest && <Th />}</tr></thead>
        <tbody>
          {q.data.map((r) => (
            <tr key={r.productId}>
              <Td>{r.name}</Td><Td num>{r.units}</Td><Td num>{r.reorderLevel}</Td>
              <Td><Badge tone={r.status === "OK" ? "good" : r.status === "Low" ? "warn" : "bad"}>{r.status}</Badge></Td>
              {canRequest && <Td actions><Button onClick={() => ask(r.productId, r.name)} aria-label={`Request more ${r.name}`}>Request stock</Button></Td>}
            </tr>
          ))}
        </tbody>
      </Table>
    </Widget>
  );
}

function Orders({ scope }: { scope: Scope }) {
  const q = useDasQuery<{ id: string; outlet: string; orderedAt: string; promisedAt: string; deliveredAt: string | null; unitsOrdered: number; unitsDelivered: number; revenue: number; status: string }[]>("/portal/orders", scope);
  if (q.error) return <ErrorBanner message={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading what="Loading orders" />;
  return (
    <Widget title="Recent orders">
      {q.data.length === 0 ? <Empty>No orders yet.</Empty> : (
        <Table>
          <thead><tr><Th>Outlet</Th><Th>Ordered</Th><Th>Promised</Th><Th num>Ordered / delivered</Th><Th num>Value</Th><Th>Result</Th></tr></thead>
          <tbody>
            {q.data.map((o) => (
              <tr key={o.id}>
                <Td>{o.outlet}</Td><Td>{fmtDate(o.orderedAt)}</Td><Td>{fmtDate(o.promisedAt)}</Td>
                <Td num>{o.unitsOrdered} / {o.unitsDelivered}</Td><Td num>{fmtMoney(o.revenue)}</Td>
                <Td><Badge tone={o.status === "On time, in full" ? "good" : o.status === "In progress" ? "muted" : "warn"}>{o.status}</Badge></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Widget>
  );
}

function Performance({ scope }: { scope: Scope }) {
  const q = useDasQuery<{ month: string; orders: number; revenue: number; otifPct: number }[]>("/portal/performance", scope);
  if (q.error) return <ErrorBanner message={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading what="Loading performance" />;
  const max = Math.max(1, ...q.data.map((m) => m.revenue));
  return (
    <Widget title="Month by month">
      <div className="space-y-2">
        {q.data.map((m) => (
          <Meter key={m.month} label={m.month} value={m.revenue} max={max} display={fmtMoney(m.revenue)} />
        ))}
      </div>
      <Table>
        <thead><tr><Th>Month</Th><Th num>Orders</Th><Th num>OTIF</Th></tr></thead>
        <tbody>{q.data.map((m) => <tr key={m.month}><Td>{m.month}</Td><Td num>{m.orders}</Td><Td num>{m.otifPct}%</Td></tr>)}</tbody>
      </Table>
    </Widget>
  );
}
