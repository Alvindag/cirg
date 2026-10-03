"use client";

import { Fragment, useState } from "react";

import { Widget } from "@/components/dashboard/Widget";
import { Badge, Button, Empty, ErrorBanner, Input, Loading, Notice, PageHead, Table, Tabs, Td, Th } from "@/components/ui/primitives";
import { fmtDateTime, fmtInt, fmtMoney } from "@/lib/das/format";
import { useDasApi } from "@/lib/das/useDasApi";
import { useDasQuery } from "@/lib/das/useDasQuery";
import { useActions } from "@/lib/das/useActions";

type Status = "Placed" | "Confirmed" | "Delivered" | "Cancelled";
interface OrderRow {
  id: string;
  customerName: string;
  placedBy: string | null;
  orderedAt: string;
  promisedAt: string;
  deliveredAt: string | null;
  status: Status;
  cancelReason: string | null;
  notes: string | null;
  units: number;
  unitsDelivered: number;
  value: number | null;
  lines: { productId: string; name: string; qty: number; unitPrice: number }[];
}

const tone = (s: Status) => (s === "Delivered" ? "good" : s === "Cancelled" ? "bad" : s === "Confirmed" ? "warn" : "muted");
const TABS: [Status | "All", string][] = [
  ["Placed", "To confirm"],
  ["Confirmed", "To deliver"],
  ["Delivered", "Delivered"],
  ["Cancelled", "Cancelled"],
  ["All", "All"],
];

/** Orders taken by the field team (DAS Orders app). Managers confirm, record deliveries and cancel. */
export function OrdersView() {
  const api = useDasApi();
  const [tab, setTab] = useState<Status | "All">("Placed");
  const [text, setText] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [delivering, setDelivering] = useState<{ id: string; units: string } | null>(null);
  const [cancelling, setCancelling] = useState<{ id: string; reason: string } | null>(null);
  const list = useDasQuery<OrderRow[]>("/orders", { status: tab === "All" ? undefined : tab, q: text || undefined });
  const { message, error, act } = useActions(list.reload);

  return (
    <>
      <PageHead title="Orders" />
      <Notice>Orders placed from the DAS Orders phone app appear here. Revenue is counted when you record the delivery.</Notice>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <Widget title="Orders">
        <div className="mb-3">
          <Input aria-label="Search orders" placeholder="Search customer or rep" value={text} onChange={(e) => setText(e.target.value)} className="w-full max-w-xs" />
        </div>
        {message && <p role="status" className="mb-2 text-sm text-teal-200">{message}</p>}
        {(error || list.error) && <ErrorBanner message={(error ?? list.error)!} onRetry={list.reload} />}
        {list.loading && !list.data && <Loading what="Loading orders" />}
        {list.data && (list.data.length === 0 ? (
          <Empty>No orders here.</Empty>
        ) : (
          <Table>
            <thead>
              <tr><Th>Customer</Th><Th>Placed by</Th><Th>Ordered</Th><Th>Units</Th><Th>Value</Th><Th>Status</Th><Th>Actions</Th></tr>
            </thead>
            <tbody>
              {list.data.map((o) => (
                <Fragment key={o.id}>
                  <tr>
                    <Td><button type="button" className="underline-offset-2 hover:underline" aria-expanded={open === o.id} onClick={() => setOpen(open === o.id ? null : o.id)}>{o.customerName}</button></Td>
                    <Td>{o.placedBy ?? "Imported"}</Td>
                    <Td className="whitespace-nowrap">{fmtDateTime(o.orderedAt)}</Td>
                    <Td>{o.status === "Delivered" && o.unitsDelivered < o.units ? `${fmtInt(o.unitsDelivered)} of ${fmtInt(o.units)}` : fmtInt(o.units)}</Td>
                    <Td>{o.value === null ? "—" : fmtMoney(o.value)}</Td>
                    <Td><Badge tone={tone(o.status)}>{o.status}</Badge></Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {o.status === "Placed" && <Button onClick={() => void act(() => api.post(`/orders/${o.id}/confirm`), "Order confirmed.")}>Confirm</Button>}
                        {(o.status === "Placed" || o.status === "Confirmed") && <Button onClick={() => setDelivering({ id: o.id, units: String(o.units) })}>Delivered</Button>}
                        {(o.status === "Placed" || o.status === "Confirmed") && <Button onClick={() => setCancelling({ id: o.id, reason: "" })}>Cancel</Button>}
                      </div>
                    </Td>
                  </tr>
                  {open === o.id && (
                    <tr>
                      <td colSpan={7} className="px-3 py-2">
                        <ul className="text-sm text-zinc-300">
                          {o.lines.length ? o.lines.map((l) => <li key={l.productId}>{l.qty} × {l.name} at {fmtMoney(l.unitPrice)}</li>) : <li>No line detail (imported order).</li>}
                          {o.notes && <li className="mt-1">Note: {o.notes}</li>}
                          {o.cancelReason && <li className="mt-1">Cancelled: {o.cancelReason}</li>}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </Table>
        ))}
        {delivering && (
          <form
            className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-white/10 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void act(() => api.post(`/orders/${delivering.id}/deliver`, { unitsDelivered: Number(delivering.units) }), "Delivery recorded.").then(() => setDelivering(null));
            }}
          >
            <label className="text-sm">Units delivered<Input type="number" min={0} className="ml-2 w-28" value={delivering.units} onChange={(e) => setDelivering({ ...delivering, units: e.target.value })} /></label>
            <Button variant="primary" type="submit">Record delivery</Button>
            <Button onClick={() => setDelivering(null)}>Close</Button>
          </form>
        )}
        {cancelling && (
          <form
            className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-white/10 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void act(() => api.post(`/orders/${cancelling.id}/cancel`, { reason: cancelling.reason }), "Order cancelled.").then(() => setCancelling(null));
            }}
          >
            <label className="text-sm">Reason<Input className="ml-2 w-64" required value={cancelling.reason} onChange={(e) => setCancelling({ ...cancelling, reason: e.target.value })} /></label>
            <Button variant="primary" type="submit">Cancel order</Button>
            <Button onClick={() => setCancelling(null)}>Keep it</Button>
          </form>
        )}
      </Widget>
    </>
  );
}
