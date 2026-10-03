"use client";

import { useEffect, useId, useState } from "react";

import { Input, Select } from "@/components/ui/primitives";
import type { Customer, Page } from "@/lib/das/types";
import { useDasQuery } from "@/lib/das/useDasQuery";

/** Type to search, then choose from the matches. Calls onChange with the customer id. */
export function CustomerPicker({
  value,
  onChange,
  label = "Customer",
}: {
  value: string;
  onChange: (id: string, customer?: Customer) => void;
  label?: string;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);
  const list = useDasQuery<Page<Customer>>("/customers", { q: debounced, pageSize: 30 });
  const items = list.data?.items ?? [];
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label htmlFor={`${id}-q`} className="sr-only">
        Search {label.toLowerCase()}
      </label>
      <Input id={`${id}-q`} type="search" placeholder={`Search ${label.toLowerCase()} by name or city`} value={text} onChange={(e) => setText(e.target.value)} />
      <label htmlFor={`${id}-s`} className="sr-only">
        {label}
      </label>
      <Select
        id={`${id}-s`}
        required
        value={value}
        onChange={(e) => onChange(e.target.value, items.find((c) => c.id === e.target.value))}
      >
        <option value="">{items.length ? `Choose ${label.toLowerCase()}` : "No matches"}</option>
        {items.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.city ? `, ${c.city}` : ""}
          </option>
        ))}
      </Select>
    </div>
  );
}
