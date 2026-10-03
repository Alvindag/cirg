"use client";

import { useMemo, useState, type FormEvent } from "react";

import { Widget } from "@/components/dashboard/Widget";
import {
  Badge,
  Button,
  Empty,
  ErrorBanner,
  Input,
  Loading,
  Notice,
  PageHead,
  Select,
  Table,
  Tabs,
  Td,
  Th,
} from "@/components/ui/primitives";
import { useDas } from "@/lib/das/context";
import { errorText, fmtDate, fmtDateTime, fmtInt } from "@/lib/das/format";
import { rangeLastDays } from "@/lib/das/range";
import { canApproveSamples, isAdmin } from "@/lib/das/roles";
import type {
  Batch,
  Compliance,
  Product,
  SampleRequest,
  StockRow,
} from "@/lib/das/types";
import { useDasApi } from "@/lib/das/useDasApi";
import { useDasQuery } from "@/lib/das/useDasQuery";
import { useProducts, useUserNames } from "@/lib/das/useLookups";

type Tab = "requests" | "stock" | "batches" | "compliance";

const tabs: [Tab, string][] = [
  ["requests", "Requests"],
  ["stock", "Stock"],
  ["batches", "Batches"],
  ["compliance", "Compliance"],
];

export function SamplesView() {
  const [tab, setTab] = useState<Tab>("requests");
  return (
    <>
      <PageHead title="Samples" />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "requests" && <Requests />}
      {tab === "stock" && <Stock />}
      {tab === "batches" && <Batches />}
      {tab === "compliance" && <ComplianceTab />}
    </>
  );
}

/** Shared message/error state and an action runner that reloads afterwards. */
function useActions(reload: () => void) {
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  async function act<T>(fn: () => Promise<T>, ok: string | ((r: T) => string)) {
    setError(undefined);
    setMessage(undefined);
    try {
      const r = await fn();
      setMessage(typeof ok === "function" ? ok(r) : ok);
      reload();
    } catch (e) {
      setError(errorText(e));
    }
  }
  return { message, error, setError, act };
}

const statusTone = (s: string) =>
  s === "Fulfilled"
    ? "good"
    : s === "Approved"
      ? "warn"
      : s === "Rejected" || s === "Cancelled"
        ? "bad"
        : "muted";

function Requests() {
  const { me } = useDas();
  const api = useDasApi();
  const [status, setStatus] = useState("Pending");
  const [repId, setRepId] = useState("");
  const { name: userName, users } = useUserNames();
  const { name: productName } = useProducts();
  // "All" leaves the status out so the history of every request can be searched.
  const list = useDasQuery<SampleRequest[]>(
    "/samples/requests",
    {
      status: status === "All" ? undefined : status,
      repId: repId || undefined,
    },
    { refreshMs: 60_000 },
  );
  const { message, error, setError, act } = useActions(list.reload);
  if (!me) return null;

  const approve = (r: SampleRequest) => {
    const answer = window.prompt(
      `Approve how many? (requested ${r.quantity})`,
      String(r.quantity),
    );
    if (answer === null) return;
    const qty = Number(answer);
    if (!Number.isInteger(qty) || qty < 1 || qty > r.quantity) {
      setError(`Enter a whole number from 1 to ${r.quantity}.`);
      return;
    }
    void act(
      () =>
        api.post(`/samples/requests/${r.id}/approve`, {
          quantity: qty,
          note: null,
        }),
      "Request approved.",
    );
  };
  const reject = (r: SampleRequest) => {
    const note = window.prompt("Reason for rejecting (the rep will see it):");
    if (!note?.trim()) return;
    void act(
      () => api.post(`/samples/requests/${r.id}/reject`, { note }),
      "Request rejected.",
    );
  };
  const fulfil = (r: SampleRequest, allowPartial: boolean) =>
    act(
      () =>
        api.post<{ allocations: { batchId: string; quantity: number }[] }>(
          `/samples/requests/${r.id}/fulfil`,
          { allowPartial },
        ),
      (res) =>
        `Issued ${res.allocations.reduce((n, a) => n + a.quantity, 0)} units from ${res.allocations.length} batch(es), oldest expiry first.`,
    );

  return (
    <Widget
      title="Sample requests"
      action={
        <span className="flex flex-wrap gap-2">
          <Select
            aria-label="Rep"
            value={repId}
            onChange={(e) => setRepId(e.target.value)}
          >
            <option value="">All reps</option>
            {users
              .filter((u) => u.role === "Rep")
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
          </Select>
          <Select
            aria-label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {[
              "All",
              "Pending",
              "Approved",
              "Fulfilled",
              "Rejected",
              "Cancelled",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </span>
      }
    >
      {message && <Notice>{message}</Notice>}
      {error && <ErrorBanner message={error} />}
      {list.error && <ErrorBanner message={list.error} onRetry={list.reload} />}
      {list.loading && !list.data && <Loading what="Loading requests" />}
      {list.data &&
        (list.data.length === 0 ? (
          <Empty>
            {status === "All"
              ? "No requests"
              : `No ${status.toLowerCase()} requests`}
            {repId ? " for this rep" : ""}.
          </Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Requested</Th>
                <Th>Rep</Th>
                <Th>Product</Th>
                <Th num>Qty</Th>
                <Th>Status</Th>
                <Th>Note</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {list.data.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap">
                    {fmtDateTime(r.createdAt)}
                  </Td>
                  <Td>{userName(r.repId)}</Td>
                  <Td>{productName(r.productId)}</Td>
                  <Td num>
                    {r.approvedQuantity && r.approvedQuantity !== r.quantity
                      ? `${r.approvedQuantity} of ${r.quantity}`
                      : r.quantity}
                  </Td>
                  <Td>
                    <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                  </Td>
                  <Td>{r.decisionNote ?? r.notes ?? ""}</Td>
                  <Td actions>
                    {r.status === "Pending" &&
                      canApproveSamples(me.role) &&
                      r.repId !== me.id && (
                        <>
                          <Button onClick={() => approve(r)}>Approve</Button>
                          <Button onClick={() => reject(r)}>Reject</Button>
                        </>
                      )}
                    {r.status === "Approved" && isAdmin(me.role) && (
                      <>
                        <Button
                          variant="primary"
                          onClick={() => fulfil(r, false)}
                        >
                          Issue stock
                        </Button>
                        <Button onClick={() => fulfil(r, true)}>
                          Issue what is available
                        </Button>
                      </>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ))}
    </Widget>
  );
}

function Stock() {
  const { me } = useDas();
  const api = useDasApi();
  const { name: userName } = useUserNames();
  const { name: productName } = useProducts();
  const stock = useDasQuery<StockRow[]>("/samples/reports/stock", undefined, {
    refreshMs: 60_000,
  });
  const { message, error, setError, act } = useActions(stock.reload);
  if (!me) return null;
  const admin = isAdmin(me.role);
  const rows = stock.data ?? [];
  const heldBy = (r: StockRow) =>
    r.location === "Warehouse" ? "warehouse" : userName(r.holderId);

  // Write-offs are negative (damage, loss, expiry); corrections can add stock back.
  // A reason is always required and stock cannot go below zero.
  const adjust = (r: StockRow) => {
    const raw = window.prompt(
      `Change in units for batch ${r.batchNumber} (${heldBy(r)}, ${r.quantity} held). Use a negative number to write off:`,
    );
    if (raw === null) return;
    const delta = Number(raw);
    if (!Number.isInteger(delta) || delta === 0) {
      setError("Enter a whole number other than zero.");
      return;
    }
    if (delta < 0 && -delta > r.quantity) {
      setError(`Only ${r.quantity} units are held.`);
      return;
    }
    const reason = window.prompt("Reason (required, kept in the audit trail):");
    if (!reason?.trim()) return;
    void act(
      () =>
        api.post("/samples/adjustments", {
          batchId: r.batchId,
          holderId: r.holderId,
          delta,
          reason,
          type: delta < 0 ? "WriteOff" : "Adjustment",
        }),
      `Stock changed by ${delta}.`,
    );
  };
  const giveBack = (r: StockRow) => {
    const raw = window.prompt(
      `Return how many units of batch ${r.batchNumber} from ${userName(r.holderId)} to the warehouse? (${r.quantity} held)`,
      String(r.quantity),
    );
    if (raw === null) return;
    const qty = Number(raw);
    if (!Number.isInteger(qty) || qty < 1 || qty > r.quantity) {
      setError(`Enter a whole number from 1 to ${r.quantity}.`);
      return;
    }
    void act(
      () =>
        api.post("/samples/returns", {
          repId: r.holderId,
          batchId: r.batchId,
          quantity: qty,
          note: null,
        }),
      `${qty} units returned to the warehouse.`,
    );
  };
  const attention = rows.filter((r) => r.actionRequired);

  return (
    <Widget title="Where the stock is">
      {message && <Notice>{message}</Notice>}
      {error && <ErrorBanner message={error} />}
      {stock.error && (
        <ErrorBanner message={stock.error} onRetry={stock.reload} />
      )}
      {stock.loading && !stock.data && <Loading what="Loading stock" />}
      {attention.length > 0 && (
        <ErrorBanner
          message={`${attention.reduce((n, r) => n + r.quantity, 0)} units are expired, quarantined or recalled and should be recovered: ${attention
            .map((r) => `${r.batchNumber} (${heldBy(r)})`)
            .join(", ")}.`}
        />
      )}
      {stock.data &&
        (rows.length === 0 ? (
          <Empty>No stock recorded yet.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Held by</Th>
                <Th>Product</Th>
                <Th>Batch</Th>
                <Th>Expires</Th>
                <Th>Status</Th>
                <Th num>Qty</Th>
                {admin && <Th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.batchId}-${r.holderId}`}
                  className={r.actionRequired ? "bg-red-400/5" : ""}
                >
                  <Td>
                    {r.location === "Warehouse"
                      ? "Warehouse"
                      : userName(r.holderId)}
                  </Td>
                  <Td>{productName(r.productId)}</Td>
                  <Td>{r.batchNumber}</Td>
                  <Td>
                    {fmtDate(r.expiryDate)}{" "}
                    {r.expired ? (
                      <Badge tone="bad">Expired</Badge>
                    ) : r.expiringSoon ? (
                      <Badge tone="warn">{r.daysToExpiry} days</Badge>
                    ) : null}
                  </Td>
                  <Td>
                    <Badge tone={r.status === "Active" ? "good" : "bad"}>
                      {r.status}
                    </Badge>
                  </Td>
                  <Td num>{fmtInt(r.quantity)}</Td>
                  {admin && (
                    <Td actions>
                      <Button onClick={() => adjust(r)}>
                        Adjust or write off
                      </Button>
                      {r.location === "Rep" && (
                        <Button onClick={() => giveBack(r)}>
                          Return to warehouse
                        </Button>
                      )}
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        ))}
    </Widget>
  );
}

function Batches() {
  const { me } = useDas();
  const api = useDasApi();
  const { products, name: productName } = useProducts();
  const batches = useDasQuery<Batch[]>("/samples/batches", {
    includeExpired: true,
  });
  const { message, error, act } = useActions(batches.reload);
  const [form, setForm] = useState({
    productId: "",
    batchNumber: "",
    expiryDate: "",
  });
  if (!me) return null;
  const admin = isAdmin(me.role);

  const receive = (b: Batch) => {
    const q = Number(
      window.prompt(
        `Receive how many units of batch ${b.batchNumber} into the warehouse?`,
      ),
    );
    if (!Number.isInteger(q) || q < 1) return;
    void act(
      () =>
        api.post("/samples/receipts", {
          batchId: b.id,
          quantity: q,
          note: null,
        }),
      `${q} units received.`,
    );
  };
  const setStatus = (
    b: Batch,
    status: "Quarantined" | "Recalled" | "Active",
  ) => {
    const reason =
      status === "Active"
        ? ""
        : window.prompt(
            `Reason for marking batch ${b.batchNumber} as ${status.toLowerCase()}:`,
          );
    if (status !== "Active" && !reason?.trim()) return;
    void act(
      () =>
        api.post<{ notified?: number }>(`/samples/batches/${b.id}/status`, {
          status,
          reason,
        }),
      (r) =>
        `Batch ${b.batchNumber} is now ${status.toLowerCase()}.` +
        (r?.notified
          ? ` ${r.notified} rep${r.notified === 1 ? " was" : "s were"} notified.`
          : ""),
    );
  };
  const create = (e: FormEvent) => {
    e.preventDefault();
    void act(
      () =>
        api.post("/samples/batches", {
          productId: form.productId || products[0]?.id,
          batchNumber: form.batchNumber,
          expiryDate: form.expiryDate,
        }),
      "Batch created.",
    );
    setForm({ ...form, batchNumber: "" });
  };

  return (
    <div className="space-y-4">
      <Widget title="Batches">
        {message && <Notice>{message}</Notice>}
        {error && <ErrorBanner message={error} />}
        {batches.error && (
          <ErrorBanner message={batches.error} onRetry={batches.reload} />
        )}
        {batches.loading && !batches.data && <Loading what="Loading batches" />}
        {batches.data &&
          (batches.data.length === 0 ? (
            <Empty>No batches yet.</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th>Batch</Th>
                  <Th>Expires</Th>
                  <Th>Status</Th>
                  {admin && <Th />}
                </tr>
              </thead>
              <tbody>
                {batches.data.map((b) => (
                  <tr key={b.id}>
                    <Td>{productName(b.productId)}</Td>
                    <Td>{b.batchNumber}</Td>
                    <Td>{fmtDate(b.expiryDate)}</Td>
                    <Td>
                      <Badge tone={b.status === "Active" ? "good" : "bad"}>
                        {b.status}
                      </Badge>
                      {b.statusReason && (
                        <div className="text-xs text-zinc-400">
                          {b.statusReason}
                        </div>
                      )}
                    </Td>
                    {admin && (
                      <Td actions>
                        <Button onClick={() => receive(b)}>
                          Receive stock
                        </Button>
                        {b.status === "Active" && (
                          <>
                            <Button onClick={() => setStatus(b, "Quarantined")}>
                              Quarantine
                            </Button>
                            <Button onClick={() => setStatus(b, "Recalled")}>
                              Recall
                            </Button>
                          </>
                        )}
                        {b.status === "Quarantined" && (
                          <Button onClick={() => setStatus(b, "Active")}>
                            Release
                          </Button>
                        )}
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
          ))}
        {admin && (
          <form
            className="mt-5 flex flex-wrap items-end gap-2"
            onSubmit={create}
            aria-label="Add batch"
          >
            <h3 className="w-full text-sm font-medium text-zinc-300">
              Add a batch
            </h3>
            <Select
              aria-label="Product"
              value={form.productId}
              onChange={(e) => setForm({ ...form, productId: e.target.value })}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <Input
              required
              placeholder="Batch number"
              aria-label="Batch number"
              value={form.batchNumber}
              onChange={(e) =>
                setForm({ ...form, batchNumber: e.target.value })
              }
            />
            <Input
              required
              type="date"
              aria-label="Expiry date"
              value={form.expiryDate}
              onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
            />
            <Button variant="primary" type="submit">
              Add batch
            </Button>
          </form>
        )}
      </Widget>
      {admin && <Limits products={products} />}
    </div>
  );
}

function ComplianceTab() {
  const api = useDasApi();
  const [days, setDays] = useState(30);
  const { name: userName } = useUserNames();
  const range = useMemo(() => rangeLastDays(days), [days]);
  const report = useDasQuery<Compliance>("/samples/reports/compliance", range);
  const [error, setError] = useState<string>();
  const c = report.data;

  async function csv() {
    setError(undefined);
    try {
      await api.download(
        "/samples/reports/distributions",
        { ...range, format: "csv" },
        `sample-distributions-${new Date().toISOString().slice(0, 10)}.csv`,
      );
    } catch (e) {
      setError(errorText(e));
    }
  }

  const kpis = c && [
    {
      label: "Hand-overs",
      value: fmtInt(c.distributions.count),
      hint: `${fmtInt(c.distributions.units)} units`,
      tone: "muted" as const,
    },
    {
      label: "Without signature",
      value: fmtInt(c.distributions.withoutSignature),
      hint: `${fmtInt(c.distributions.withoutSignatureUnits)} units`,
      tone: c.distributions.withoutSignature
        ? ("bad" as const)
        : ("good" as const),
    },
    {
      label: "Expired stock held",
      value: fmtInt(c.stockHeld.expiredUnits),
      hint: `${fmtInt(c.stockHeld.expiringWithin90DaysUnits)} expiring within 90 days`,
      tone: c.stockHeld.expiredUnits ? ("bad" as const) : ("good" as const),
    },
    {
      label: "Ledger reconciliation",
      value: c.reconciliation.ok ? "Balanced" : "Check",
      hint: `${fmtInt(c.reconciliation.loggedDistributionUnits)} logged vs ${fmtInt(c.reconciliation.ledgerDistributionUnits)} in ledger`,
      tone: c.reconciliation.ok ? ("good" as const) : ("bad" as const),
    },
  ];
  const toneText = {
    good: "text-teal-200",
    bad: "text-red-200",
    muted: "text-zinc-100",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select
          aria-label="Period"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          {[7, 30, 90].map((d) => (
            <option key={d} value={d}>
              Last {d} days
            </option>
          ))}
        </Select>
        <Button onClick={csv}>Download distributions (CSV)</Button>
      </div>
      {error && <ErrorBanner message={error} />}
      {report.error && (
        <ErrorBanner message={report.error} onRetry={report.reload} />
      )}
      {report.loading && !c && <Loading what="Loading compliance report" />}
      {c && kpis && (
        <>
          <Widget title="Summary">
            <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {kpis.map((k) => (
                <div key={k.label}>
                  <dt className="text-xs text-zinc-400">{k.label}</dt>
                  <dd
                    className={`mt-1 text-2xl font-semibold tracking-tight ${toneText[k.tone]}`}
                  >
                    {k.value}
                  </dd>
                  <dd className="text-xs text-zinc-400">{k.hint}</dd>
                </div>
              ))}
            </dl>
          </Widget>
          <Widget title="By rep">
            {c.byRep.length === 0 ? (
              <Empty>No hand-overs in this period.</Empty>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Rep</Th>
                    <Th num>Hand-overs</Th>
                    <Th num>Units</Th>
                    <Th num>Without signature</Th>
                  </tr>
                </thead>
                <tbody>
                  {c.byRep.map((r) => (
                    <tr
                      key={r.repId}
                      className={r.withoutSignature ? "bg-red-400/5" : ""}
                    >
                      <Td>{userName(r.repId)}</Td>
                      <Td num>{r.count}</Td>
                      <Td num>{r.units}</Td>
                      <Td num>{r.withoutSignature}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            <p className="mt-3 text-xs text-zinc-400">
              Write-offs in period: {c.writeOffs.count} ({c.writeOffs.units}{" "}
              units). Quarantined or recalled units still held:{" "}
              {c.stockHeld.quarantinedOrRecalledUnits}.
            </p>
          </Widget>
        </>
      )}
    </div>
  );
}

/** Per-customer sample limits: how many units of a product one customer may be given in a period. Enforced when hand-overs are recorded. */
function Limits({ products }: { products: Product[] }) {
  const api = useDasApi();
  const [overrides, setOverrides] = useState<
    Record<string, { limit: number | null; days: number | null }>
  >({});
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const current = (p: Product) =>
    overrides[p.id] ?? {
      limit: p.sampleLimitPerCustomer ?? null,
      days: p.sampleLimitDays ?? null,
    };

  async function save(p: Product, limit: number | null, days: number | null) {
    setError(undefined);
    setMessage(undefined);
    try {
      await api.put(`/admin/products/${p.id}`, {
        name: p.name,
        therapeuticArea: p.therapeuticArea ?? null,
        standardCost: p.standardCost ?? null,
        reorderLevel: p.reorderLevel ?? null,
        sampleLimitPerCustomer: limit,
        sampleLimitDays: days,
      });
      setOverrides((o) => ({ ...o, [p.id]: { limit, days } }));
      setMessage(
        limit === null
          ? `${p.name}: no limit.`
          : `${p.name}: at most ${limit} per customer every ${days} days.`,
      );
    } catch (e) {
      setError(errorText(e));
    }
  }
  const edit = (p: Product) => {
    const cur = current(p);
    const limit = window.prompt(
      `Most units of ${p.name} one customer may be given (leave empty for no limit):`,
      cur.limit === null ? "" : String(cur.limit),
    );
    if (limit === null) return;
    if (limit.trim() === "") {
      void save(p, null, null);
      return;
    }
    const n = Number(limit);
    if (!Number.isInteger(n) || n < 1) {
      setError("Enter a whole number of at least 1.");
      return;
    }
    const days = window.prompt(
      "...within how many days?",
      String(cur.days ?? 30),
    );
    if (days === null) return;
    const d = Number(days);
    if (!Number.isInteger(d) || d < 1 || d > 3650) {
      setError("Enter a whole number of days from 1 to 3650.");
      return;
    }
    void save(p, n, d);
  };

  return (
    <Widget title="Per-customer sample limits">
      {message && <Notice>{message}</Notice>}
      {error && <ErrorBanner message={error} />}
      {products.length === 0 ? (
        <Empty>No products yet.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Product</Th>
              <Th>Limit</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const c = current(p);
              return (
                <tr key={p.id}>
                  <Td>{p.name}</Td>
                  <Td>
                    {c.limit === null
                      ? "No limit"
                      : `${c.limit} per customer per ${c.days} days`}
                  </Td>
                  <Td actions>
                    <Button onClick={() => edit(p)}>
                      Set limit for {p.name}
                    </Button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Widget>
  );
}
