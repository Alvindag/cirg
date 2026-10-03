"use client";

import Link from "next/link";

import { rangeLastDays } from "@/lib/das/range";
import { useDas } from "@/lib/das/context";
import { can } from "@/lib/das/rbac";
import { useDasQuery } from "@/lib/das/useDasQuery";
import { Meter } from "@/components/ui/kit";
import { SourceBadge } from "./SourceBadge";
import { Widget } from "./Widget";

interface Summary {
  overall: { otifPct: number; costToServePct: number; avgCycleDays: number | null };
  byRegion: { label: string; otifPct: number }[];
  reach: { pct: number };
  conflicts: number;
  targets: { otifPct: number };
}

/** The route-to-market headline numbers, for roles that may see cost data. */
export function RtmSnapshot() {
  const { me } = useDas();
  const allowed = !!me && can(me.role, "rtm");
  const q = useDasQuery<Summary>(allowed ? "/rtm/summary" : null, rangeLastDays(90));
  if (!allowed || !q.data) return null;
  const s = q.data;
  const weakest = s.byRegion.slice(0, 4);
  return (
    <Widget title="Route to market, last 90 days" action={<SourceBadge live={q.live} />}>
      <div className="grid gap-6 md:grid-cols-2">
        <dl className="grid grid-cols-2 gap-4">
          {[
            ["OTIF", `${s.overall.otifPct}%`, `target ${s.targets.otifPct}%`],
            ["Cost to serve", `${s.overall.costToServePct}%`, "of revenue"],
            ["Numerical reach", `${s.reach.pct}%`, "outlets served"],
            ["Channel conflicts", String(s.conflicts), "outlets in both channels"],
          ].map(([k, v, h]) => (
            <div key={k}>
              <dt className="text-xs text-zinc-400">{k}</dt>
              <dd className="mt-1 text-2xl font-semibold text-zinc-100">{v}</dd>
              <dd className="text-xs text-zinc-400">{h}</dd>
            </div>
          ))}
        </dl>
        <div>
          <p className="mb-2 text-xs text-zinc-400">Weakest regions by OTIF</p>
          <div className="space-y-2">
            {weakest.map((r) => (
              <Meter key={r.label} label={r.label} value={r.otifPct} target={s.targets.otifPct} display={`${r.otifPct}%`} tone={r.otifPct >= s.targets.otifPct ? undefined : r.otifPct >= s.targets.otifPct - 10 ? "warn" : "bad"} />
            ))}
          </div>
          <Link href="/rtm" className="mt-3 inline-block text-sm text-indigo-300 underline underline-offset-2">See the full route-to-market view</Link>
        </div>
      </div>
    </Widget>
  );
}
