"use client";

import { useState } from "react";

import { Widget } from "@/components/dashboard/Widget";
import {
  Button,
  Empty,
  ErrorBanner,
  Loading,
  PageHead,
  Table,
  Td,
  Th,
} from "@/components/ui/primitives";
import { useDasApi } from "@/lib/das/useDasApi";
import { errorText, fmtDateTime, shortId } from "@/lib/das/format";
import type { AuditEntry } from "@/lib/das/types";
import { useDasQuery } from "@/lib/das/useDasQuery";
import { useUserNames } from "@/lib/das/useLookups";

export function AuditView() {
  const api = useDasApi();
  const { name } = useUserNames();
  const first = useDasQuery<AuditEntry[]>("/admin/audit-logs", { take: 50 });
  const [older, setOlder] = useState<AuditEntry[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string>();

  const rows = [...(first.data ?? []), ...older];

  async function more() {
    const last = rows[rows.length - 1];
    if (!last) return;
    setLoadingMore(true);
    setMoreError(undefined);
    try {
      const next = await api.get<AuditEntry[]>("/admin/audit-logs", {
        take: 50,
        before: last.id,
      });
      setOlder((o) => [...o, ...next]);
    } catch (e) {
      setMoreError(errorText(e));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <PageHead title="Audit log" />
      <Widget title="Recent changes">
        {first.error && (
          <ErrorBanner message={first.error} onRetry={first.reload} />
        )}
        {moreError && <ErrorBanner message={moreError} />}
        {first.loading && !first.data && <Loading what="Loading audit log" />}
        {first.data &&
          (rows.length === 0 ? (
            <Empty>Nothing recorded yet.</Empty>
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th>When</Th>
                    <Th>Who</Th>
                    <Th>Action</Th>
                    <Th>Record</Th>
                    <Th>Changes</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id}>
                      <Td className="whitespace-nowrap">{fmtDateTime(a.at)}</Td>
                      <Td>{name(a.userId)}</Td>
                      <Td>{a.action}</Td>
                      <Td>
                        {a.entityType}{" "}
                        <span className="text-xs text-zinc-400">
                          {shortId(a.entityId)}
                        </span>
                      </Td>
                      <Td className="break-all font-mono text-xs">
                        {a.changes ?? ""}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <div className="mt-3 flex justify-center">
                <Button disabled={loadingMore} onClick={more}>
                  Load older
                </Button>
              </div>
            </>
          ))}
        <p className="mt-3 text-xs text-zinc-400">
          The log is append-only and hash-chained; entries cannot be edited or
          removed.
        </p>
      </Widget>
    </>
  );
}
