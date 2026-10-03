"use client";

import { useSearchParams } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent } from "react";

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
  Pager,
  Select,
  Table,
  Td,
  Th,
} from "@/components/ui/primitives";
import { useDas } from "@/lib/das/context";
import { errorText } from "@/lib/das/format";
import {
  canEditCustomers,
  canImportCustomers,
  isManager,
} from "@/lib/das/roles";
import type {
  Customer,
  CustomerFull,
  ImportResult,
  Page,
  Territory,
} from "@/lib/das/types";
import { useDasApi } from "@/lib/das/useDasApi";
import { useDasQuery } from "@/lib/das/useDasQuery";

const types = [
  "Doctor",
  "Pharmacist",
  "Hospital",
  "Clinic",
  "Pharmacy",
  "Distributor",
  "GovernmentInstitution",
];
const segments = ["A", "B", "C", "Unclassified"];
const MAX_CSV_BYTES = 5_000_000;

export function CustomersView() {
  const { me } = useDas();
  const params = useSearchParams();
  // The command palette links here with a customer's name.
  const [q, setQ] = useState(params.get("q") ?? "");
  const [type, setType] = useState("");
  const [segment, setSegment] = useState("");
  const [page, setPage] = useState(1);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const territories = useDasQuery<Territory[]>("/admin/territories");
  const list = useDasQuery<Page<Customer>>("/customers", {
    q,
    type,
    segment,
    page,
    pageSize: 25,
  });
  if (!me) return null;

  const terrName = new Map((territories.data ?? []).map((t) => [t.id, t.name]));
  const pages = list.data
    ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize))
    : 1;
  const canEdit = canEditCustomers(me.role);

  return (
    <>
      <PageHead
        title="Customers"
        actions={
          canImportCustomers(me.role) && (
            <Button onClick={() => setImporting((v) => !v)}>
              {importing ? "Close import" : "Import CSV"}
            </Button>
          )
        }
      />

      {importing && (
        <div className="mb-4">
          <ImportPanel
            onDone={() => {
              setPage(1);
              list.reload();
            }}
          />
        </div>
      )}

      {notice && <Notice>{notice}</Notice>}
      {editing && (
        <div className="mb-4">
          <CustomerEditor
            id={editing}
            territories={territories.data ?? []}
            canDelete={isManager(me.role)}
            onClose={() => setEditing(undefined)}
            onSaved={(text) => {
              setEditing(undefined);
              setNotice(text);
              list.reload();
            }}
          />
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        <Input
          type="search"
          placeholder="Search name or city"
          aria-label="Search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <Select
          aria-label="Type"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
        <Select
          aria-label="Segment"
          value={segment}
          onChange={(e) => {
            setSegment(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All segments</option>
          {segments.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
      </div>

      {list.error && <ErrorBanner message={list.error} onRetry={list.reload} />}
      {list.loading && !list.data && <Loading what="Loading customers" />}
      {list.data &&
        (list.data.items.length === 0 ? (
          <Empty>No customers match.</Empty>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Type</Th>
                  <Th>Specialty</Th>
                  <Th>City</Th>
                  <Th>Segment</Th>
                  <Th>Territory</Th>
                  <Th num>Visits/mo</Th>
                  {canEdit && <Th />}
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((c) => (
                  <tr key={c.id}>
                    <Td>{c.name}</Td>
                    <Td>{c.type}</Td>
                    <Td>{c.specialty ?? "—"}</Td>
                    <Td>{c.city ?? "—"}</Td>
                    <Td>
                      <Badge tone={c.segment === "A" ? "good" : "muted"}>
                        {c.segment}
                      </Badge>
                    </Td>
                    <Td>
                      {c.territoryId
                        ? (terrName.get(c.territoryId) ?? "—")
                        : "—"}
                    </Td>
                    <Td num>{c.targetVisitsPerMonth}</Td>
                    {canEdit && (
                      <Td actions>
                        <Button
                          aria-label={`Edit ${c.name}`}
                          onClick={() => {
                            setNotice(undefined);
                            setEditing(c.id);
                          }}
                        >
                          Edit
                        </Button>
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pager
              page={page}
              pages={pages}
              total={list.data.total}
              noun="customers"
              onPage={setPage}
            />
          </>
        ))}
    </>
  );
}

/** Dry run first: shows what would be created, updated, skipped or rejected, then commits on request. */
function ImportPanel({ onDone }: { onDone: () => void }) {
  const api = useDasApi();
  const [csv, setCsv] = useState<string>();
  const [fileName, setFileName] = useState("");
  const [update, setUpdate] = useState(false);
  const [possible, setPossible] = useState(false);
  const [result, setResult] = useState<ImportResult>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setResult(undefined);
    setError(undefined);
    if (!f) return;
    if (f.size > MAX_CSV_BYTES) {
      setError("The file is larger than 5 MB.");
      return;
    }
    setFileName(f.name);
    setCsv(await f.text());
  }

  async function run(dryRun: boolean) {
    if (!csv) return;
    setBusy(true);
    setError(undefined);
    try {
      const r = await api.postText<ImportResult>("/customers/import", csv, {
        dryRun,
        onDuplicate: update ? "update" : "skip",
        allowPossibleDuplicates: possible,
      });
      setResult(r);
      if (!dryRun) onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const issues = result?.rows.filter((r) => r.status !== "created") ?? [];
  const importable = result ? result.created + result.updated : 0;

  return (
    <Widget title="Import customers from CSV">
      <p className="mb-3 text-sm text-zinc-300">
        Columns: type, name (required); specialty, segment, territory, parent,
        phone, email, address, city, latitude, longitude,
        target_visits_per_month. Always checked first; nothing is saved until
        you confirm.
      </p>
      <input
        type="file"
        accept=".csv,text/csv"
        aria-label="CSV file"
        onChange={pick}
        className="mb-3 block text-sm text-zinc-300"
      />
      <div className="mb-3 flex flex-wrap gap-4 text-sm text-zinc-300">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={update}
            onChange={(e) => setUpdate(e.target.checked)}
          />
          Update existing customers with the same details
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={possible}
            onChange={(e) => setPossible(e.target.checked)}
          />
          Import near-duplicates too
        </label>
      </div>
      <Button disabled={!csv || busy} onClick={() => run(true)}>
        Check file
      </Button>
      {error && (
        <div className="mt-3">
          <ErrorBanner message={error} />
        </div>
      )}
      {result && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-zinc-200">
            <strong>{result.dryRun ? "Check result" : "Imported"}:</strong>{" "}
            {result.created} new, {result.updated} updated, {result.skipped}{" "}
            duplicates skipped, {result.errors} with errors (of {result.total}{" "}
            rows in {fileName}).
          </p>
          {issues.length > 0 && (
            <Table>
              <thead>
                <tr>
                  <Th>Row</Th>
                  <Th>Result</Th>
                  <Th>Details</Th>
                </tr>
              </thead>
              <tbody>
                {issues.slice(0, 200).map((r) => (
                  <tr key={r.row}>
                    <Td>{r.row}</Td>
                    <Td>
                      <Badge tone={r.status === "error" ? "bad" : "warn"}>
                        {r.status.replace("_", " ")}
                      </Badge>
                    </Td>
                    <Td>{r.message}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          {result.dryRun && importable > 0 && (
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => run(false)}
            >
              Import {importable} customer{importable === 1 ? "" : "s"}
            </Button>
          )}
        </div>
      )}
    </Widget>
  );
}

/** Loads the full customer (so nothing the form does not show is lost on save), edits it, or removes it. */
function CustomerEditor({
  id,
  territories,
  canDelete,
  onClose,
  onSaved,
}: {
  id: string;
  territories: Territory[];
  canDelete: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const api = useDasApi();
  const detail = useDasQuery<{ customer: CustomerFull }>(`/customers/${id}`);
  const [f, setF] = useState<CustomerFull>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const c = f ?? detail.data?.customer;

  if (detail.error)
    return <ErrorBanner message={detail.error} onRetry={detail.reload} />;
  if (!c) return <Loading what="Loading customer" />;
  const set = <K extends keyof CustomerFull>(k: K, v: CustomerFull[K]) =>
    setF({ ...c, [k]: v });

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!c) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.put(`/customers/${id}`, {
        id,
        type: c.type,
        name: c.name.trim(),
        specialty: c.specialty || null,
        segment: c.segment,
        territoryId: c.territoryId || null,
        parentCustomerId: c.parentCustomerId,
        phone: c.phone || null,
        email: c.email || null,
        address: c.address || null,
        city: c.city || null,
        latitude: c.latitude,
        longitude: c.longitude,
        targetVisitsPerMonth: Number(c.targetVisitsPerMonth) || 0,
        productIds: (c.productInterests ?? []).map((p) => p.productId),
      });
      onSaved(`${c.name.trim()} saved.`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!c || !window.confirm(`Remove ${c.name}? Their visit history is kept.`))
      return;
    setBusy(true);
    setError(undefined);
    try {
      await api.del(`/customers/${id}`);
      onSaved(`${c.name} removed.`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <Widget title={`Edit ${c.name}`}>
      <form
        className="grid gap-2 sm:grid-cols-2"
        onSubmit={save}
        aria-label="Edit customer"
      >
        <Input
          required
          aria-label="Name"
          value={c.name}
          onChange={(e) => set("name", e.target.value)}
        />
        <Select
          aria-label="Type"
          value={c.type}
          onChange={(e) => set("type", e.target.value)}
        >
          {types.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
        <Select
          aria-label="Segment"
          value={c.segment}
          onChange={(e) => set("segment", e.target.value)}
        >
          {segments.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
        <Select
          aria-label="Territory"
          value={c.territoryId ?? ""}
          onChange={(e) => set("territoryId", e.target.value || null)}
        >
          <option value="">No territory</option>
          {territories.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        <Input
          placeholder="Specialty"
          aria-label="Specialty"
          value={c.specialty ?? ""}
          onChange={(e) => set("specialty", e.target.value)}
        />
        <Input
          placeholder="City"
          aria-label="City"
          value={c.city ?? ""}
          onChange={(e) => set("city", e.target.value)}
        />
        <Input
          placeholder="Address"
          aria-label="Address"
          value={c.address ?? ""}
          onChange={(e) => set("address", e.target.value)}
        />
        <Input
          placeholder="Phone"
          aria-label="Phone"
          value={c.phone ?? ""}
          onChange={(e) => set("phone", e.target.value)}
        />
        <Input
          type="email"
          placeholder="Email"
          aria-label="Email"
          value={c.email ?? ""}
          onChange={(e) => set("email", e.target.value)}
        />
        <Input
          type="number"
          min={0}
          max={31}
          aria-label="Visits per month"
          value={c.targetVisitsPerMonth}
          onChange={(e) => set("targetVisitsPerMonth", Number(e.target.value))}
        />
        {error && (
          <div className="sm:col-span-2">
            <ErrorBanner message={error} />
          </div>
        )}
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button variant="primary" type="submit" disabled={busy}>
            Save
          </Button>
          <Button onClick={onClose}>Cancel</Button>
          {canDelete && (
            <Button disabled={busy} onClick={() => void remove()}>
              Remove customer
            </Button>
          )}
        </div>
      </form>
    </Widget>
  );
}
