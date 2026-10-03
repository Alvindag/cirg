"use client";

import { Widget } from "@/components/dashboard/Widget";
import { Badge, ErrorBanner, Loading, PageHead, Table, Td, Th } from "@/components/ui/primitives";
import { Stat, StatGrid, Why } from "@/components/ui/kit";
import { ALL_ROLES, FEATURE_LABELS, FEATURE_ROLES, type Feature } from "@/lib/das/rbac";
import { roleLabel } from "@/lib/das/roles";
import { fmtDateTime } from "@/lib/das/format";
import { useDasQuery } from "@/lib/das/useDasQuery";

interface Integrity {
  checkedAt: string;
  visits: { count: number; ok: boolean; brokenAt: string | null };
  audit: { count: number; ok: boolean; brokenAt: string | null };
  visitsVerifiedPct: number;
  lateSyncedVisits: number;
  unsignedDistributions: number;
  quarantinedBatches: number;
  principles: { name: string; detail: string }[];
}

export function AccessView() {
  const q = useDasQuery<Integrity>("/integrity");
  const features = Object.keys(FEATURE_ROLES) as Feature[];
  const d = q.data;
  return (
    <>
      <PageHead title="Access rules and record integrity" />
      <Why>
        Two questions a regulator or a partner will ask: who can see what, and can the records be trusted? The server enforces the first on every request. The second is checked here by re-calculating the seals on every visit and audit entry.
      </Why>
      <div className="space-y-4">
        <Widget title="Record integrity" action={d && <span className="text-xs text-zinc-400">Checked {fmtDateTime(d.checkedAt)}</span>}>
          {q.error && <ErrorBanner message={q.error} onRetry={q.reload} />}
          {!d && !q.error && <Loading what="Checking records" />}
          {d && (
            <>
              <StatGrid cols={4}>
                <Stat label="Visit records" value={d.visits.ok ? "Intact" : "Altered"} hint={`${d.visits.count} checked`} tone={d.visits.ok ? "good" : "bad"} />
                <Stat label="Audit trail" value={d.audit.ok ? "Intact" : "Altered"} hint={`${d.audit.count} entries checked`} tone={d.audit.ok ? "good" : "bad"} />
                <Stat label="Visits verified by GPS" value={`${d.visitsVerifiedPct}%`} hint={`${d.lateSyncedVisits} uploaded late`} tone={d.visitsVerifiedPct >= 90 ? "good" : "warn"} />
                <Stat label="Samples without signature" value={d.unsignedDistributions} hint={`${d.quarantinedBatches} batch${d.quarantinedBatches === 1 ? "" : "es"} held back`} tone={d.unsignedDistributions ? "warn" : "good"} />
              </StatGrid>
              {(!d.visits.ok || !d.audit.ok) && (
                <p role="alert" className="mt-3 text-sm text-red-300">
                  A record was changed after it was sealed{d.visits.brokenAt ? ` (visit ${d.visits.brokenAt})` : ""}{d.audit.brokenAt ? ` (audit entry ${d.audit.brokenAt})` : ""}. Investigate before relying on these records.
                </p>
              )}
              <ul className="mt-4 grid gap-2 md:grid-cols-2">
                {d.principles.map((p) => (
                  <li key={p.name} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
                    <span className="font-medium text-zinc-100">{p.name}.</span> <span className="text-zinc-300">{p.detail}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Widget>
        <Widget title="Who can open what">
          <Table>
            <thead>
              <tr>
                <Th>Area</Th>
                {ALL_ROLES.map((r) => <Th key={r}>{roleLabel(r)}</Th>)}
              </tr>
            </thead>
            <tbody>
              {features.map((f) => (
                <tr key={f}>
                  <Td>{FEATURE_LABELS[f]}</Td>
                  {ALL_ROLES.map((r) => (
                    <Td key={r}>{FEATURE_ROLES[f].includes(r) ? <Badge tone="good">Yes<span className="sr-only">, {r} can open {FEATURE_LABELS[f]}</span></Badge> : <span className="text-zinc-400" aria-label={`${r} cannot open ${FEATURE_LABELS[f]}`}>—</span>}</Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="mt-2 text-xs text-zinc-400">
            Beyond pages, the server also limits data: a rep sees their own territory, a manager sees their team, and a distributor sees only their own prices, stock and orders.
          </p>
        </Widget>
      </div>
    </>
  );
}
