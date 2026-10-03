"use client";

import { useState } from "react";

import { Widget } from "@/components/dashboard/Widget";
import { Badge, Empty, ErrorBanner, Input, Loading, PageHead, Table, Td, Th } from "@/components/ui/primitives";
import { Stat, StatGrid, Why } from "@/components/ui/kit";
import { fmtDate, fmtDateTime } from "@/lib/das/format";
import { useDasQuery } from "@/lib/das/useDasQuery";
import { cn, focusRing } from "@/lib/utils";

interface BatchRow { id: string; batchNumber: string; productName: string; status: string; expiryDate: string; distributedUnits: number }
interface Trace {
  batch: BatchRow & { statusReason: string | null; manufacturedAt: string };
  received: number;
  inWarehouse: number;
  withReps: { repId: string; name: string; quantity: number }[];
  distributedUnits: number;
  unsignedUnits: number;
  customers: { customerId: string; name: string; city: string | null; phone: string | null; units: number; lastAt: string }[];
  ledger: { id: string; kind: string; delta: number; at: string; holder: string; reason: string | null }[];
  recallImpact: { reps: number; customers: number; unitsToRecover: number };
}

const tone = (s: string) => (s === "Active" ? "good" : s === "Quarantined" ? "warn" : "bad");

export function TraceView() {
  const [text, setText] = useState("");
  const [sel, setSel] = useState<string>();
  const list = useDasQuery<BatchRow[]>("/trace/batches", { q: text.trim() || undefined });
  const trace = useDasQuery<Trace>(sel ? `/trace/batches/${sel}` : null);
  const t = trace.data;

  return (
    <>
      <PageHead title="Batch trace" />
      <Why>
        If a batch has to be pulled, who has it? This follows a batch from receipt to every rep and customer, so a recall can be scoped in minutes. It supports the track-and-trace expectations of the Ghana FDA strategy and GMP record keeping.
      </Why>
      <div className="grid gap-4 lg:grid-cols-3">
        <Widget title="Batches" className="lg:col-span-1">
          <Input type="search" aria-label="Search batches" placeholder="Batch number or product" value={text} onChange={(e) => setText(e.target.value)} className="mb-3 w-full" />
          {list.error && <ErrorBanner message={list.error} onRetry={list.reload} />}
          <ul className="max-h-[28rem] space-y-1 overflow-y-auto">
            {(list.data ?? []).map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  aria-pressed={sel === b.id}
                  onClick={() => setSel(b.id)}
                  className={cn("flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10", sel === b.id && "bg-white/10", focusRing)}
                >
                  <span>
                    <span className="block text-zinc-100">{b.batchNumber}</span>
                    <span className="block text-xs text-zinc-400">{b.productName}</span>
                  </span>
                  <Badge tone={tone(b.status)}>{b.status}</Badge>
                </button>
              </li>
            ))}
          </ul>
        </Widget>
        <div className="space-y-4 lg:col-span-2">
          {!sel && <Widget><Empty>Choose a batch to see where it went.</Empty></Widget>}
          {sel && trace.error && <ErrorBanner message={trace.error} onRetry={trace.reload} />}
          {sel && trace.loading && !t && <Loading what="Tracing batch" />}
          {t && (
            <>
              <Widget title={`${t.batch.batchNumber} · ${t.batch.productName}`} action={<Badge tone={tone(t.batch.status)}>{t.batch.status}</Badge>}>
                {t.batch.statusReason && <p className="mb-3 text-sm text-amber-200">{t.batch.statusReason}</p>}
                <StatGrid cols={4}>
                  <Stat label="Received" value={t.received} hint={`expires ${fmtDate(t.batch.expiryDate)}`} />
                  <Stat label="In warehouse" value={t.inWarehouse} />
                  <Stat label="Given to customers" value={t.distributedUnits} hint={t.unsignedUnits ? `${t.unsignedUnits} without signature` : "all signed"} tone={t.unsignedUnits ? "warn" : undefined} />
                  <Stat label="If recalled" value={`${t.recallImpact.customers} customers`} hint={`${t.recallImpact.reps} reps, ${t.recallImpact.unitsToRecover} units`} tone={t.recallImpact.customers ? "warn" : undefined} />
                </StatGrid>
              </Widget>
              <Widget title="Held by reps">
                {t.withReps.length === 0 ? <Empty>No rep holds this batch.</Empty> : (
                  <Table><thead><tr><Th>Rep</Th><Th num>Units</Th></tr></thead><tbody>{t.withReps.map((r) => <tr key={r.repId}><Td>{r.name}</Td><Td num>{r.quantity}</Td></tr>)}</tbody></Table>
                )}
              </Widget>
              <Widget title="Customers who received it">
                {t.customers.length === 0 ? <Empty>Not handed out yet.</Empty> : (
                  <Table>
                    <thead><tr><Th>Customer</Th><Th>City</Th><Th>Phone</Th><Th num>Units</Th><Th>Last given</Th></tr></thead>
                    <tbody>{t.customers.map((c) => <tr key={c.customerId}><Td>{c.name}</Td><Td>{c.city ?? "—"}</Td><Td>{c.phone ?? "—"}</Td><Td num>{c.units}</Td><Td>{fmtDate(c.lastAt)}</Td></tr>)}</tbody>
                  </Table>
                )}
              </Widget>
              <Widget title="Stock movements">
                <Table>
                  <thead><tr><Th>When</Th><Th>Type</Th><Th>Holder</Th><Th num>Change</Th></tr></thead>
                  <tbody>{t.ledger.map((l) => <tr key={l.id}><Td>{fmtDateTime(l.at)}</Td><Td>{l.kind}</Td><Td>{l.holder}</Td><Td num>{l.delta > 0 ? `+${l.delta}` : l.delta}</Td></tr>)}</tbody>
                </Table>
              </Widget>
            </>
          )}
        </div>
      </div>
    </>
  );
}
