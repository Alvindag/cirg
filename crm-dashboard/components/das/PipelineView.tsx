"use client";

import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Widget } from "@/components/dashboard/Widget";
import { Badge, Button, Empty, ErrorBanner, Input, Loading, Notice, PageHead, Select } from "@/components/ui/primitives";
import { fmtDate, fmtMoney } from "@/lib/das/format";
import { useActions } from "@/lib/das/useActions";
import { useDasApi } from "@/lib/das/useDasApi";
import { useDasQuery } from "@/lib/das/useDasQuery";
import { CustomerPicker } from "./CustomerPicker";

const STAGES = ["Lead", "Qualified", "Proposal", "Negotiation", "Won", "Lost"] as const;
type Stage = (typeof STAGES)[number];
/** Chance a deal at this stage closes. Used for the weighted forecast. */
const WEIGHT: Record<Stage, number> = { Lead: 0.1, Qualified: 0.25, Proposal: 0.5, Negotiation: 0.75, Won: 1, Lost: 0 };

interface Deal {
  id: string;
  title: string;
  customerId: string;
  customerName: string;
  ownerName: string;
  stage: Stage;
  value: number;
  expectedClose: string;
  lostReason: string | null;
}

export function PipelineView() {
  const api = useDasApi();
  const params = useSearchParams();
  const list = useDasQuery<Deal[]>("/deals");
  const { message, error, act, setError } = useActions(list.reload);
  const [adding, setAdding] = useState(params.get("new") === "1");
  const deals = list.data ?? [];
  const open = deals.filter((d) => d.stage !== "Won" && d.stage !== "Lost");
  const weighted = open.reduce((n, d) => n + d.value * WEIGHT[d.stage], 0);
  const won = deals.filter((d) => d.stage === "Won");
  const lost = deals.filter((d) => d.stage === "Lost");
  const winRate = won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : null;

  function move(d: Deal, stage: Stage) {
    if (stage === d.stage) return;
    let lostReason: string | undefined;
    if (stage === "Lost") {
      const r = window.prompt(`Why was "${d.title}" lost?`);
      if (!r?.trim()) return setError("A reason is needed to mark a deal as lost.");
      lostReason = r;
    }
    void act(() => api.post(`/deals/${d.id}/stage`, { stage, lostReason }), `Moved to ${stage}.`);
  }

  return (
    <>
      <PageHead
        title="Pipeline"
        actions={<Button onClick={() => setAdding((v) => !v)}>{adding ? "Close" : "New deal"}</Button>}
      />
      {message && <Notice>{message}</Notice>}
      {error && <ErrorBanner message={error} />}
      {list.error && <ErrorBanner message={list.error} onRetry={list.reload} />}

      {adding && (
        <div className="mb-4">
          <NewDeal
            onCreate={(body) =>
              act(() => api.post("/deals", body), "Deal added.").then((r) => r && setAdding(false))
            }
          />
        </div>
      )}

      <dl className="mb-4 grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
        {[
          ["Open deals", String(open.length), `${fmtMoney(open.reduce((n, d) => n + d.value, 0))} in total`],
          ["Weighted forecast", fmtMoney(weighted), "value × chance at each stage"],
          ["Won", fmtMoney(won.reduce((n, d) => n + d.value, 0)), `${won.length} deals`],
          ["Win rate", winRate === null ? "—" : `${winRate}%`, `${lost.length} lost`],
        ].map(([k, v, h]) => (
          <div key={k} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <dt className="text-xs text-zinc-400">{k}</dt>
            <dd className="text-xl font-semibold text-zinc-100">{v}</dd>
            <dd className="text-xs text-zinc-400">{h}</dd>
          </div>
        ))}
      </dl>

      {list.loading && !list.data && <Loading what="Loading deals" />}
      {list.data && (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {STAGES.map((s) => {
            const col = deals.filter((d) => d.stage === s);
            return (
              <section key={s} aria-label={`${s}, ${col.length} deals`} className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03] p-2">
                <h2 className="flex items-center justify-between px-1 pb-2 text-xs font-medium uppercase tracking-wide text-zinc-300">
                  {s}
                  <span className="text-zinc-400">{col.length}</span>
                </h2>
                <p className="px-1 pb-2 text-xs text-zinc-400">{fmtMoney(col.reduce((n, d) => n + d.value, 0))}</p>
                <ul className="space-y-2">
                  {col.slice(0, 30).map((d) => (
                    <li key={d.id} className="rounded-lg border border-white/10 bg-white/5 p-2 text-sm">
                      <p className="font-medium text-zinc-100">{d.title}</p>
                      <p className="text-xs text-zinc-300">{d.ownerName}</p>
                      <p className="mt-1 flex flex-wrap items-center justify-between gap-x-2 text-xs text-zinc-300">
                        <span>{fmtMoney(d.value)}</span>
                        <span className="whitespace-nowrap">{fmtDate(d.expectedClose)}</span>
                      </p>
                      {d.lostReason && <p className="mt-1"><Badge tone="bad">{d.lostReason}</Badge></p>}
                      <label className="sr-only" htmlFor={`stage-${d.id}`}>Move {d.title} to</label>
                      <Select id={`stage-${d.id}`} value={d.stage} onChange={(e) => move(d, e.target.value as Stage)} className="mt-2 w-full py-1 text-xs">
                        {STAGES.map((x) => <option key={x}>{x}</option>)}
                      </Select>
                    </li>
                  ))}
                  {col.length === 0 && <li className="px-1 py-3 text-xs text-zinc-400">No deals</li>}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      {list.data && deals.length === 0 && <Empty>No deals yet. Add the first one.</Empty>}
    </>
  );
}

function NewDeal({ onCreate }: { onCreate: (body: unknown) => unknown }) {
  const [f, setF] = useState({ title: "", customerId: "", value: "", expectedClose: "" });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void onCreate({ ...f, value: Number(f.value), expectedClose: f.expectedClose || undefined });
    setF({ title: "", customerId: "", value: "", expectedClose: "" });
  };
  return (
    <Widget title="New deal">
      <form onSubmit={submit} className="grid gap-2 sm:grid-cols-2" aria-label="New deal">
        <Input required placeholder="What is the deal?" aria-label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="sm:col-span-2" />
        <div className="sm:col-span-2">
          <CustomerPicker value={f.customerId} onChange={(id) => setF({ ...f, customerId: id })} />
        </div>
        <Input required type="number" min={0} step="any" placeholder="Value (GHS)" aria-label="Value in GHS" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
        <Input type="date" aria-label="Expected close date" value={f.expectedClose} onChange={(e) => setF({ ...f, expectedClose: e.target.value })} />
        <div className="sm:col-span-2">
          <Button type="submit" variant="primary">Add deal</Button>
        </div>
      </form>
    </Widget>
  );
}
