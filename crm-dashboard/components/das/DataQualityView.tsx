"use client";

import Link from "next/link";
import { useState } from "react";

import { Widget } from "@/components/dashboard/Widget";
import { Badge, Button, Empty, ErrorBanner, Loading, Notice, PageHead, Select, Table, Tabs, Td, Th } from "@/components/ui/primitives";
import { Meter, Stat, StatGrid, Why } from "@/components/ui/kit";
import { useActions } from "@/lib/das/useActions";
import { useDasApi } from "@/lib/das/useDasApi";
import { useDasQuery } from "@/lib/das/useDasQuery";

interface Summary {
  customers: number;
  completenessPct: number;
  customersWithIssues: number;
  duplicatePairs: number;
  customersInDuplicates: number;
  issueCounts: Record<string, number>;
  byRegion: { region: string; customers: number; completenessPct: number }[];
}
interface Cust {
  id: string;
  name: string;
  type: string;
  city: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  segment: string;
}
interface Pair {
  id: string;
  a: string;
  b: string;
  score: number;
  reasons: string[];
  left: Cust;
  right: Cust;
  leftVisits: number;
  rightVisits: number;
}
interface Issue {
  customerId: string;
  customerName: string;
  city: string | null;
  kind: string;
  message: string;
}

const KIND_LABEL: Record<string, string> = {
  "missing-phone": "Missing phone",
  "missing-city": "Missing city",
  "missing-territory": "No territory",
  "missing-location": "No GPS location",
  "bad-email": "Invalid email",
  "unclassified-segment": "Segment not set",
};

type Tab = "duplicates" | "issues";

export function DataQualityView() {
  const api = useDasApi();
  const [tab, setTab] = useState<Tab>("duplicates");
  const [kind, setKind] = useState("");
  const summary = useDasQuery<Summary>("/dq/summary");
  const pairs = useDasQuery<Pair[]>("/dq/duplicates");
  const issues = useDasQuery<Issue[]>("/dq/issues", { kind: kind || undefined, take: 200 });
  const reloadAll = () => {
    summary.reload();
    pairs.reload();
    issues.reload();
  };
  const { message, error, act, setError } = useActions(reloadAll);
  const s = summary.data;

  function merge(keep: Cust, gone: Cust) {
    const reason = window.prompt(`Merge "${gone.name}" into "${keep.name}". Why are they the same customer?`, "Same outlet entered twice");
    if (reason === null) return;
    if (!reason.trim()) return setError("A reason is needed. It is kept in the audit trail.");
    void act(() => api.post("/dq/merge", { keepId: keep.id, mergeId: gone.id, reason }), `Merged. "${gone.name}" is kept as a history record but no longer appears in lists.`);
  }

  return (
    <>
      <PageHead title="Data quality" />
      <Why>
        Cost-to-serve and profitability are only as good as the customer list behind them. This page finds outlets entered twice and records with missing details, so they can be fixed before they distort the numbers. Merging never deletes anything.
      </Why>
      {message && <Notice>{message}</Notice>}
      {error && <ErrorBanner message={error} />}
      {summary.error && <ErrorBanner message={summary.error} onRetry={summary.reload} />}
      {summary.loading && !s && <Loading what="Checking customer data" />}
      {s && (
        <div className="mb-4 grid items-start gap-4 lg:grid-cols-3">
          <Widget title="Customer data" className="lg:col-span-2">
            <StatGrid cols={4}>
              <Stat label="Completeness" value={`${s.completenessPct}%`} hint="of the key fields filled in" tone={s.completenessPct >= 90 ? "good" : s.completenessPct >= 75 ? "warn" : "bad"} />
              <Stat label="Customers" value={s.customers} />
              <Stat label="With a problem" value={s.customersWithIssues} tone={s.customersWithIssues ? "warn" : "good"} />
              <Stat label="Likely duplicates" value={s.duplicatePairs} hint="pairs to review" tone={s.duplicatePairs ? "warn" : "good"} />
            </StatGrid>
          </Widget>
          <Widget title="Completeness by region">
            <div className="space-y-2">
              {s.byRegion.map((r) => <Meter key={r.region} label={r.region} value={r.completenessPct} display={`${r.completenessPct}%`} tone={r.completenessPct >= 90 ? undefined : r.completenessPct >= 75 ? "warn" : "bad"} />)}
            </div>
          </Widget>
        </div>
      )}
      <Tabs tabs={[["duplicates", `Possible duplicates${s ? ` (${s.duplicatePairs})` : ""}`], ["issues", "Missing or invalid details"]]} value={tab} onChange={setTab} />

      {tab === "duplicates" && (
        <>
          {pairs.error && <ErrorBanner message={pairs.error} onRetry={pairs.reload} />}
          {pairs.loading && !pairs.data && <Loading what="Finding duplicates" />}
          {pairs.data && (pairs.data.length === 0 ? <Empty>No likely duplicates. Nice.</Empty> : (
            <ul className="space-y-3">
              {pairs.data.map((p) => (
                <li key={p.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-zinc-300">
                    <Badge tone="warn">{Math.round(p.score * 100)}% match</Badge>
                    {p.reasons.join(", ")}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {([["left", p.left, p.leftVisits, p.right], ["right", p.right, p.rightVisits, p.left]] as const).map(([side, c, visits, other]) => (
                      <div key={side} className="rounded-lg border border-white/10 p-2 text-sm">
                        <p className="font-medium text-zinc-100">{c.name}</p>
                        <p className="text-xs text-zinc-300">{[c.type, c.city, c.phone, c.email].filter(Boolean).join(" · ") || "No details"}</p>
                        <p className="text-xs text-zinc-400">{visits} visits on record · segment {c.segment}</p>
                        <Button className="mt-2" aria-label={`Keep ${c.name} and merge ${other.name} into it`} onClick={() => merge(c, other)}>
                          Keep this one
                        </Button>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          ))}
        </>
      )}

      {tab === "issues" && (
        <Widget title="Records to fix">
          <div className="mb-3">
            <Select aria-label="Problem" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">All problems</option>
              {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}{s?.issueCounts[k] ? ` (${s.issueCounts[k]})` : ""}</option>)}
            </Select>
          </div>
          {issues.error && <ErrorBanner message={issues.error} onRetry={issues.reload} />}
          {issues.data && (issues.data.length === 0 ? <Empty>Nothing to fix here.</Empty> : (
            <Table>
              <thead><tr><Th>Customer</Th><Th>City</Th><Th>Problem</Th><Th /></tr></thead>
              <tbody>
                {issues.data.map((i, n) => (
                  <tr key={`${i.customerId}-${i.kind}-${n}`}>
                    <Td>{i.customerName}</Td><Td>{i.city ?? "—"}</Td><Td>{i.message}</Td>
                    <Td actions><Link className="text-indigo-300 underline underline-offset-2" href={`/customers/${i.customerId}`}>Open<span className="sr-only"> {i.customerName}</span></Link></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ))}
        </Widget>
      )}
    </>
  );
}
