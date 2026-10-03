"use client";

import { useMemo } from "react";

import { demoSales } from "@/lib/das/demo";
import { rangeLastDays } from "@/lib/das/range";
import type { SalesDashboard } from "@/lib/das/types";
import { useDasQuery } from "@/lib/das/useDasQuery";
import { SourceBadge } from "./SourceBadge";
import { Widget } from "./Widget";

const int = new Intl.NumberFormat("en-GB");
const pct = (n: number) => `${n.toFixed(1)}%`;

export function KpiRow() {
  const range = useMemo(() => rangeLastDays(30), []);
  const q = useDasQuery<SalesDashboard>("/dashboards/sales", range);
  const s = q.data ?? demoSales;
  const outside = s.byRep.reduce((n, r) => n + r.outsideGeofence, 0);

  const kpis = [
    {
      label: "Calls completed",
      value: int.format(s.callsCompleted),
      hint: `${int.format(s.plannedVisits)} planned`,
    },
    {
      label: "Plan adherence",
      value: pct(s.planAdherencePct),
      hint: "calls against plan",
    },
    {
      label: "Customer coverage",
      value: pct(s.coveragePct),
      hint: "visited at least once",
    },
    {
      label: "Outside geofence",
      value: int.format(outside),
      hint: "check-ins far from customer",
    },
  ];

  return (
    <Widget title="Last 30 days" action={<SourceBadge live={q.live} />}>
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label}>
            <dt className="text-xs text-zinc-400">{k.label}</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight text-zinc-100">
              {k.value}
            </dd>
            <dd className="text-xs text-zinc-400">{k.hint}</dd>
          </div>
        ))}
      </dl>
    </Widget>
  );
}
