"use client";

import Link from "next/link";

import { fmtMoney } from "@/lib/das/format";
import { useDasQuery } from "@/lib/das/useDasQuery";
import { cn, focusRing } from "@/lib/utils";
import { Widget } from "./Widget";

interface Attention {
  tasksDue: number;
  dealsClosingSoon: number;
  pendingSamples: number;
  overdueCustomers: number;
  pipelineValue: number;
}

/** What needs doing now. Each tile opens the page where it gets done. */
export function AttentionRow() {
  const q = useDasQuery<Attention>("/dashboards/attention", undefined, { refreshMs: 120_000 });
  const a = q.data;
  const tiles = a
    ? [
        { label: "Tasks due", value: a.tasksDue, hint: "today or overdue", href: "/activities?tab=tasks" },
        { label: "Deals closing soon", value: a.dealsClosingSoon, hint: "in the next 14 days", href: "/pipeline" },
        { label: "Sample requests waiting", value: a.pendingSamples, hint: "for a decision", href: "/samples" },
        { label: "Customers not seen in 45 days", value: a.overdueCustomers, hint: "plan a visit", href: "/customers" },
        { label: "Open pipeline", value: fmtMoney(a.pipelineValue), hint: "all open deals", href: "/pipeline" },
      ]
    : [];
  return (
    <Widget title="Needs your attention">
      {!a ? (
        <p className="text-sm text-zinc-400" role="status">{q.error ?? "Loading…"}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {tiles.map((t) => (
            <li key={t.label}>
              <Link href={t.href} className={cn("block rounded-lg border border-white/10 bg-white/5 px-3 py-2 transition-colors hover:bg-white/10", focusRing)}>
                <span className="block text-xs text-zinc-400">{t.label}</span>
                <span className="block text-xl font-semibold text-zinc-100">{t.value}</span>
                <span className="block text-xs text-zinc-400">{t.hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  );
}
