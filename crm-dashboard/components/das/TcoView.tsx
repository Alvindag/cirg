"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import { Widget } from "@/components/dashboard/Widget";
import { Button, Empty, ErrorBanner, Input, Notice, PageHead, Table, Td, Th } from "@/components/ui/primitives";
import { Meter, Stat, StatGrid, Why } from "@/components/ui/kit";
import { fmtMoney } from "@/lib/das/format";
import { useActions } from "@/lib/das/useActions";
import { useDasApi } from "@/lib/das/useDasApi";
import { useDasQuery } from "@/lib/das/useDasQuery";
import { computeTco, defaultTco, type TcoInputs, type TcoResult } from "@/lib/rtm/tco";

interface Saved {
  id: string;
  name: string;
  inputs: TcoInputs;
  result: TcoResult;
  createdAt: string;
}

const FIELDS: { key: keyof TcoInputs; label: string; hint?: string }[] = [
  { key: "years", label: "Years to cover" },
  { key: "reps", label: "Sales reps" },
  { key: "visitsPerRepPerMonth", label: "Visits per rep per month" },
  { key: "deviceCost", label: "Device cost (GHS)" },
  { key: "deviceLifeYears", label: "Device life (years)" },
  { key: "deviceRunningPerYear", label: "Device security and insurance per year (GHS)" },
  { key: "spareDevicePct", label: "Spare devices (0.1 = 10%)" },
  { key: "dataPlanPerRepPerMonth", label: "Data plan per rep per month (GHS)" },
  { key: "licencePerUserPerMonth", label: "Software licence per user per month (GHS)" },
  { key: "hostingPerMonth", label: "Hosting per month (GHS)" },
  { key: "integrationOneOff", label: "ERP and API integration, one-off (GHS)" },
  { key: "integrationSupportPerYear", label: "Integration support per year (GHS)" },
  { key: "trainingPerRepOneOff", label: "Training per rep, one-off (GHS)" },
  { key: "supportPerYear", label: "Support per year (GHS)" },
];

export function TcoView() {
  const api = useDasApi();
  const saved = useDasQuery<Saved[]>("/tco/scenarios");
  const defaults = useDasQuery<TcoInputs>("/tco/defaults");
  const { message, error, act } = useActions(saved.reload);
  const [inputs, setInputs] = useState<TcoInputs>(defaultTco);
  const [name, setName] = useState("");
  useEffect(() => {
    if (defaults.data) setInputs(defaults.data);
  }, [defaults.data]);

  const result = useMemo(() => {
    if (Object.values(inputs).some((v) => !Number.isFinite(v)) || inputs.years < 1 || inputs.deviceLifeYears <= 0) return null;
    return computeTco(inputs);
  }, [inputs]);
  const max = Math.max(1, ...(result?.breakdown.map((b) => b.amount) ?? [1]));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void act(() => api.post("/tco/scenarios", { name, inputs }), `Saved "${name}".`).then((r) => r && setName(""));
  };

  return (
    <>
      <PageHead title="Cost of ownership" />
      <Why>
        The review asks for the whole cost of a field tool, not just the licence: devices, hosting, ERP integration, support and refresh. Change the numbers, see the total and the cost per visit, and save scenarios to compare options.
      </Why>
      {message && <Notice>{message}</Notice>}
      {error && <ErrorBanner message={error} />}
      <div className="grid gap-4 lg:grid-cols-2">
        <Widget title="Assumptions">
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <label key={f.key} className="text-xs text-zinc-300">
                {f.label}
                <Input
                  type="number"
                  min={0}
                  step="any"
                  className="mt-1 w-full"
                  value={Number.isFinite(inputs[f.key]) ? inputs[f.key] : ""}
                  onChange={(e) => setInputs({ ...inputs, [f.key]: e.target.value === "" ? NaN : Number(e.target.value) })}
                />
              </label>
            ))}
          </div>
          <Button className="mt-3" onClick={() => setInputs(defaults.data ?? defaultTco)}>Reset to defaults</Button>
        </Widget>
        <div className="space-y-4">
          <Widget title="Result">
            {result ? (
              <>
                <StatGrid cols={2}>
                  <Stat label={`Total over ${inputs.years} years`} value={fmtMoney(result.total)} />
                  <Stat label="Per year" value={fmtMoney(result.perYear)} />
                  <Stat label="Per rep per year" value={fmtMoney(result.perRepPerYear)} />
                  <Stat label="Per visit" value={`GH₵${result.perVisit.toFixed(2)}`} />
                </StatGrid>
                <div className="mt-4 space-y-2">
                  {result.breakdown.map((b) => <Meter key={b.label} label={b.label} value={b.amount} max={max} display={fmtMoney(b.amount)} />)}
                </div>
              </>
            ) : <p className="text-sm text-red-300">Fill in every number (years and device life above zero) to see a result.</p>}
          </Widget>
          <Widget title="Save this scenario">
            <form onSubmit={submit} className="flex gap-2" aria-label="Save scenario">
              <Input required placeholder="e.g. Rugged phones, 60 reps" aria-label="Scenario name" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
              <Button type="submit" variant="primary" disabled={!result}>Save</Button>
            </form>
          </Widget>
        </div>
      </div>
      <div className="mt-4">
        <Widget title="Saved scenarios">
          {saved.data && (saved.data.length === 0 ? <Empty>Nothing saved yet.</Empty> : (
            <Table>
              <thead><tr><Th>Scenario</Th><Th num>Reps</Th><Th num>Years</Th><Th num>Total</Th><Th num>Per rep per year</Th><Th num>Per visit</Th><Th /></tr></thead>
              <tbody>
                {saved.data.map((s) => (
                  <tr key={s.id}>
                    <Td>{s.name}</Td><Td num>{s.inputs.reps}</Td><Td num>{s.inputs.years}</Td>
                    <Td num>{fmtMoney(s.result.total)}</Td><Td num>{fmtMoney(s.result.perRepPerYear)}</Td><Td num>GH₵{s.result.perVisit.toFixed(2)}</Td>
                    <Td actions>
                      <Button onClick={() => setInputs(s.inputs)} aria-label={`Load ${s.name}`}>Load</Button>
                      <Button onClick={() => window.confirm(`Delete "${s.name}"?`) && act(() => api.del(`/tco/scenarios/${s.id}`), "Deleted.")} aria-label={`Delete ${s.name}`}>Delete</Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ))}
        </Widget>
      </div>
    </>
  );
}
