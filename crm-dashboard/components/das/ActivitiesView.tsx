"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Widget } from "@/components/dashboard/Widget";
import { Badge, Button, Empty, ErrorBanner, Input, Loading, Notice, PageHead, Select, Table, Tabs, Td, Th } from "@/components/ui/primitives";
import { Why } from "@/components/ui/kit";
import { useDas } from "@/lib/das/context";
import { errorText, fmtDateTime } from "@/lib/das/format";
import { applySyncResults, isNetworkError, loadQueue, newClientId, saveQueue, type QueuedVisit, type SyncOutcome } from "@/lib/das/offlineQueue";
import type { Product } from "@/lib/das/types";
import { useActions } from "@/lib/das/useActions";
import { useDasApi } from "@/lib/das/useDasApi";
import { useDasQuery } from "@/lib/das/useDasQuery";
import { CustomerPicker } from "./CustomerPicker";

type Tab = "log" | "visits" | "tasks";
const OUTCOMES = ["Order taken", "Follow-up needed", "Samples left", "Information shared", "Not available"];

interface Visit {
  id: string;
  at: string;
  kind: string;
  outcome: string;
  customerName: string;
  repName: string;
  verified: boolean;
  verifyReason: string | null;
  distanceM: number | null;
  receivedAt: string;
}
interface TaskRow {
  id: string;
  title: string;
  dueAt: string;
  done: boolean;
  customerName: string | null;
  ownerName: string;
}

export function ActivitiesView() {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>(params.get("tab") === "tasks" ? "tasks" : params.get("tab") === "visits" ? "visits" : "log");
  return (
    <>
      <PageHead title="Visits and tasks" />
      <Tabs
        tabs={[
          ["log", "Log a visit"],
          ["visits", "Recent visits"],
          ["tasks", "Tasks"],
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "log" && <LogVisit />}
      {tab === "visits" && <Visits />}
      {tab === "tasks" && <Tasks />}
    </>
  );
}

function LogVisit() {
  const { me } = useDas();
  const api = useDasApi();
  const products = useDasQuery<Product[]>("/admin/products");
  const [f, setF] = useState({ customerId: "", customerName: "", kind: "Visit" as "Visit" | "Call", outcome: OUTCOMES[0], notes: "", durationMin: "", productId: "" });
  const [pos, setPos] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [geoMsg, setGeoMsg] = useState<string>();
  const [queue, setQueue] = useState<QueuedVisit[]>([]);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const userId = me?.id;
  useEffect(() => {
    if (userId) setQueue(loadQueue(userId));
    setOnline(navigator.onLine);
  }, [userId]);

  const persist = useCallback(
    (q: QueuedVisit[]) => {
      setQueue(q);
      if (userId) saveQueue(userId, q);
    },
    [userId],
  );

  const sync = useCallback(
    async (items: QueuedVisit[]) => {
      const sendable = items.filter((q) => !q.error);
      if (sendable.length === 0) return;
      try {
        const r = await api.post<{ accepted: number; rejected: number; results: SyncOutcome[] }>("/visits/sync", { visits: sendable });
        persist(applySyncResults(items, r.results));
        setMessage(`${r.accepted} saved visit${r.accepted === 1 ? "" : "s"} uploaded.${r.rejected ? ` ${r.rejected} could not be accepted. See the list below.` : ""}`);
      } catch (e) {
        if (!isNetworkError(e)) setError(errorText(e));
      }
    },
    [api, persist],
  );

  // Upload what is waiting as soon as the connection returns.
  useEffect(() => {
    const on = () => {
      setOnline(true);
      void sync(queue);
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [queue, sync]);

  function locate() {
    setGeoMsg(undefined);
    if (!navigator.geolocation) return setGeoMsg("This device cannot share its location. The visit will be saved as not verified.");
    setGeoMsg("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy });
        setGeoMsg(`Location captured (accurate to about ${Math.round(p.coords.accuracy)} m).`);
      },
      (e) => setGeoMsg(e.code === 1 ? "Location permission was refused. The visit will be saved as not verified." : "Could not get a location. The visit will be saved as not verified."),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    const visit: QueuedVisit = {
      clientId: newClientId(),
      customerId: f.customerId,
      customerName: f.customerName,
      at: new Date().toISOString(),
      kind: f.kind,
      outcome: f.outcome,
      notes: f.notes.trim() || null,
      durationMin: f.durationMin ? Number(f.durationMin) : null,
      productIds: f.productId ? [f.productId] : [],
      latitude: pos?.latitude ?? null,
      longitude: pos?.longitude ?? null,
    };
    try {
      if (!navigator.onLine) throw new TypeError("offline");
      const r = await api.post<{ verified: boolean; verifyReason: string | null; distanceM: number | null }>("/visits", visit);
      setMessage(
        r.verified
          ? `Visit saved and verified (${r.distanceM} m from the customer).`
          : `Visit saved, but not verified: ${reasonText(r.verifyReason, r.distanceM)}`,
      );
      setF({ ...f, notes: "", durationMin: "" });
    } catch (err) {
      if (isNetworkError(err)) {
        persist([...queue, visit]);
        setMessage("No connection. The visit is saved on this device and will upload when you are back online.");
        setF({ ...f, notes: "", durationMin: "" });
      } else setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Why>
        Every visit is checked against the customer&apos;s location by the server, stamped with when it happened and when it arrived, and sealed so it cannot be changed unnoticed. Without a signal the visit waits on this device and uploads later.
      </Why>
      {!online && <Notice>You are offline. Visits will be saved on this device.</Notice>}
      {message && <Notice>{message}</Notice>}
      {error && <ErrorBanner message={error} />}
      <Widget title="Log a visit or call">
        <form onSubmit={submit} className="grid gap-2 sm:grid-cols-2" aria-label="Log a visit">
          <div className="sm:col-span-2">
            <CustomerPicker value={f.customerId} onChange={(id, c) => setF({ ...f, customerId: id, customerName: c?.name ?? "" })} />
          </div>
          <Select aria-label="Type" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as "Visit" | "Call" })}>
            <option>Visit</option>
            <option>Call</option>
          </Select>
          <Select aria-label="Outcome" value={f.outcome} onChange={(e) => setF({ ...f, outcome: e.target.value })}>
            {OUTCOMES.map((o) => <option key={o}>{o}</option>)}
          </Select>
          <Select aria-label="Product discussed" value={f.productId} onChange={(e) => setF({ ...f, productId: e.target.value })}>
            <option value="">No product discussed</option>
            {(products.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Input type="number" min={1} max={480} aria-label="Minutes" placeholder="Minutes spent" value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: e.target.value })} />
          <Input className="sm:col-span-2" aria-label="Notes" placeholder="Notes (optional)" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button onClick={locate}>{pos ? "Update my location" : "Use my location"}</Button>
            <span role="status" className="text-xs text-zinc-300">
              {geoMsg ?? "Share your location to have the visit verified."}
            </span>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" variant="primary" disabled={busy || !f.customerId}>
              {busy ? "Saving…" : "Save visit"}
            </Button>
          </div>
        </form>
      </Widget>

      {queue.length > 0 && (
        <div className="mt-4">
          <Widget
            title={`Waiting to upload (${queue.length})`}
            action={<Button onClick={() => sync(queue)} disabled={!online || queue.every((q) => q.error)}>Upload now</Button>}
          >
            <ul className="divide-y divide-white/10 text-sm">
              {queue.map((q) => (
                <li key={q.clientId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {q.customerName} · {q.outcome} · {fmtDateTime(q.at)}
                    {q.error && <span className="block text-xs text-red-300">Refused: {q.error}</span>}
                  </span>
                  {q.error && <Button onClick={() => persist(queue.filter((x) => x.clientId !== q.clientId))}>Discard</Button>}
                </li>
              ))}
            </ul>
          </Widget>
        </div>
      )}
    </>
  );
}

function reasonText(reason: string | null, d: number | null) {
  if (reason === "outside-geofence") return `you were ${d} m from the customer, outside the allowed distance.`;
  if (reason === "no-checkin-location") return "no location was shared.";
  if (reason === "no-customer-location") return "the customer has no location on file yet.";
  return "unknown reason.";
}

function Visits() {
  const list = useDasQuery<Visit[]>("/visits", { take: 60 });
  return (
    <Widget title="Recent visits">
      {list.error && <ErrorBanner message={list.error} onRetry={list.reload} />}
      {list.loading && !list.data && <Loading what="Loading visits" />}
      {list.data && (list.data.length === 0 ? <Empty>No visits yet.</Empty> : (
        <Table>
          <thead>
            <tr><Th>When</Th><Th>Rep</Th><Th>Customer</Th><Th>Outcome</Th><Th>Location check</Th></tr>
          </thead>
          <tbody>
            {list.data.map((v) => (
              <tr key={v.id}>
                <Td>{fmtDateTime(v.at)}</Td>
                <Td>{v.repName}</Td>
                <Td>{v.customerName}</Td>
                <Td>{v.outcome}</Td>
                <Td>
                  {v.verified ? <Badge tone="good">Verified, {v.distanceM} m</Badge> : <Badge tone="warn">{reasonText(v.verifyReason, v.distanceM).replace(/\.$/, "")}</Badge>}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ))}
    </Widget>
  );
}

function Tasks() {
  const api = useDasApi();
  const list = useDasQuery<TaskRow[]>("/tasks");
  const { message, error, act } = useActions(list.reload);
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [customerId, setCustomerId] = useState("");
  const now = Date.now();
  return (
    <Widget title="Tasks">
      {message && <Notice>{message}</Notice>}
      {error && <ErrorBanner message={error} />}
      {list.error && <ErrorBanner message={list.error} onRetry={list.reload} />}
      <form
        className="mb-4 grid gap-2 sm:grid-cols-3"
        aria-label="New task"
        onSubmit={(e) => {
          e.preventDefault();
          void act(() => api.post("/tasks", { title, dueAt: dueAt || undefined, customerId: customerId || undefined }), "Task added.").then((r) => r && (setTitle(""), setDueAt("")));
        }}
      >
        <Input required placeholder="What needs doing?" aria-label="Task" value={title} onChange={(e) => setTitle(e.target.value)} className="sm:col-span-2" />
        <Input type="date" aria-label="Due date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        <div className="sm:col-span-3">
          <CustomerPicker value={customerId} onChange={setCustomerId} label="Customer (optional)" />
        </div>
        <div className="sm:col-span-3"><Button type="submit" variant="primary">Add task</Button></div>
      </form>
      {list.loading && !list.data && <Loading what="Loading tasks" />}
      {list.data && (list.data.length === 0 ? <Empty>No tasks.</Empty> : (
        <ul className="divide-y divide-white/10 text-sm">
          {list.data.map((t) => {
            const overdue = !t.done && Date.parse(t.dueAt) < now;
            return (
              <li key={t.id} className="flex items-center gap-3 py-2">
                <input
                  type="checkbox"
                  id={`task-${t.id}`}
                  checked={t.done}
                  onChange={() => act(() => api.post(`/tasks/${t.id}/toggle`), t.done ? "Reopened." : "Done.")}
                  className="h-4 w-4"
                />
                <label htmlFor={`task-${t.id}`} className={t.done ? "flex-1 text-zinc-400 line-through" : "flex-1 text-zinc-100"}>
                  {t.title}
                  <span className="block text-xs text-zinc-400">{[t.customerName, t.ownerName].filter(Boolean).join(" · ")}</span>
                </label>
                <span className="text-xs text-zinc-300">{overdue && <Badge tone="bad">Overdue</Badge>} {new Date(t.dueAt).toLocaleDateString("en-GB")}</span>
              </li>
            );
          })}
        </ul>
      ))}
    </Widget>
  );
}
