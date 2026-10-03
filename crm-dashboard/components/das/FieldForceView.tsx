"use client";

import { useMemo, useState } from "react";

import { Widget } from "@/components/dashboard/Widget";
import { Badge, ErrorBanner, Loading, PageHead, Select, Table, Td, Th } from "@/components/ui/primitives";
import { Meter, Stat, StatGrid, Why } from "@/components/ui/kit";
import { rangeLastDays } from "@/lib/das/range";
import { useDasQuery } from "@/lib/das/useDasQuery";

interface Rep {
  repId: string;
  name: string;
  region: string;
  territory: string;
  visits: number;
  target: number;
  attainmentPct: number;
  customersAssigned: number;
  coveragePct: number;
  verifiedPct: number;
  outsideGeofence: number;
  noLocation: number;
  lateSyncs: number;
  avgPerDay: number;
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);

export function FieldForceView() {
  const [days, setDays] = useState(30);
  const q = useDasQuery<Rep[]>("/rtm/field-force", rangeLastDays(days));
  const reps = useMemo(() => q.data ?? [], [q.data]);
  const north = useMemo(() => reps.filter((r) => r.region === "Northern" || r.region === "Upper East"), [reps]);
  const south = useMemo(() => reps.filter((r) => !north.includes(r)), [reps, north]);

  return (
    <>
      <PageHead title="Field force" />
      <Why>
        How is each rep doing against plan, and can their visit data be trusted? Verified visits were checked by the server against the customer&apos;s location. This is the evidence for evaluating the sales force and for planning the Northern regions.
      </Why>
      <div className="mb-4">
        <Select aria-label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[7, 30, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </Select>
      </div>
      {q.error && <ErrorBanner message={q.error} onRetry={q.reload} />}
      {q.loading && !q.data && <Loading what="Loading field force" />}
      {q.data && (
        <div className="space-y-4">
          <Widget title="Northern regions against the rest">
            <StatGrid cols={4}>
              <Stat label="Plan attainment, North" value={`${avg(north.map((r) => r.attainmentPct))}%`} hint={`${north.length} reps`} tone={avg(north.map((r) => r.attainmentPct)) < avg(south.map((r) => r.attainmentPct)) - 10 ? "bad" : undefined} />
              <Stat label="Plan attainment, rest" value={`${avg(south.map((r) => r.attainmentPct))}%`} hint={`${south.length} reps`} />
              <Stat label="Customer coverage, North" value={`${avg(north.map((r) => r.coveragePct))}%`} />
              <Stat label="Customer coverage, rest" value={`${avg(south.map((r) => r.coveragePct))}%`} />
            </StatGrid>
          </Widget>
          <Widget title="Reps">
            <Table>
              <thead>
                <tr><Th>Rep</Th><Th>Territory</Th><Th num>Visits</Th><Th>Against plan</Th><Th num>Coverage</Th><Th num>Verified</Th><Th num>Outside area</Th><Th num>Late uploads</Th></tr>
              </thead>
              <tbody>
                {q.data.map((r) => (
                  <tr key={r.repId}>
                    <Td>{r.name}</Td>
                    <Td>{r.territory}<span className="block text-xs text-zinc-400">{r.region}</span></Td>
                    <Td num>{r.visits}<span className="block text-xs text-zinc-400">of {r.target}</span></Td>
                    <Td className="min-w-40"><Meter label="" value={Math.min(r.attainmentPct, 100)} display={`${r.attainmentPct}%`} tone={r.attainmentPct >= 80 ? undefined : r.attainmentPct >= 60 ? "warn" : "bad"} /></Td>
                    <Td num>{r.coveragePct}%</Td>
                    <Td num><Badge tone={r.verifiedPct >= 90 ? "good" : r.verifiedPct >= 75 ? "warn" : "bad"}>{r.verifiedPct}%</Badge></Td>
                    <Td num>{r.outsideGeofence}</Td>
                    <Td num>{r.lateSyncs}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <p className="mt-2 text-xs text-zinc-400">
              Plan is each customer&apos;s target visits per month. Coverage is the share of the rep&apos;s customers seen at least once. Late uploads arrived more than a day after the visit (offline sync).
            </p>
          </Widget>
        </div>
      )}
    </>
  );
}
