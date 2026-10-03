"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { CalendarCheck, KanbanSquare, PackagePlus, Search, UserPlus } from "lucide-react";

import { useDas } from "@/lib/das/context";
import { can, type Feature } from "@/lib/das/rbac";
import type { Customer, Page } from "@/lib/das/types";
import { useDasQuery } from "@/lib/das/useDasQuery";
import { cn } from "@/lib/utils";
import { navFor } from "./nav-items";

export const OPEN_COMMAND_MENU_EVENT = "open-command-menu";

const actions: { label: string; icon: typeof UserPlus; href: string; feature: Feature }[] = [
  { label: "Log a visit", icon: CalendarCheck, href: "/activities?new=1", feature: "activities" },
  { label: "New deal", icon: KanbanSquare, href: "/pipeline?new=1", feature: "deals" },
  { label: "Add a customer", icon: UserPlus, href: "/customers?new=1", feature: "customers" },
  { label: "Request samples", icon: PackagePlus, href: "/samples?new=1", feature: "samples" },
];

const itemClass = cn(
  "flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-300 outline-none",
  "data-[selected=true]:bg-white/10 data-[selected=true]:text-zinc-100",
);

const groupClass = cn(
  "px-1 py-1",
  "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-zinc-400",
);

export function CommandMenu() {
  const router = useRouter();
  const { me } = useDas();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const navItems = navFor(me?.role).flatMap((g) => g.items);
  const myActions = me ? actions.filter((a) => can(me.role, a.feature)) : [];
  // Search the customer list on the server as the person types.
  const customers = useDasQuery<Page<Customer>>(
    me && can(me.role, "customers") && open ? "/customers" : null,
    { pageSize: 6, q: text.trim() || undefined },
  );
  const recentContacts = (customers.data?.items ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    detail: c.city ?? `Segment ${c.segment}`,
  }));

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_COMMAND_MENU_EVENT, onOpen);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_COMMAND_MENU_EVENT, onOpen);
    };
  }, []);

  const run = useCallback((fn: () => void) => {
    setOpen(false);
    fn();
  }, []);

  return (
    <Command.Dialog
      shouldFilter
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      overlayClassName="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
      contentClassName="fixed left-1/2 top-[20vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-white/10 bg-white/5 bg-zinc-950/60 shadow-2xl shadow-black/40 backdrop-blur-xl"
    >
      <div className="group flex items-center gap-3 border-b border-white/10 px-4 transition-shadow focus-within:border-indigo-400/60 focus-within:shadow-[inset_0_-1px_0_rgba(129,140,248,0.6),inset_0_-12px_24px_-12px_rgba(99,102,241,0.35)]">
        <Search
          aria-hidden
          className="h-4 w-4 shrink-0 text-zinc-400 group-focus-within:text-indigo-300"
        />
        <Command.Input
          value={text}
          onValueChange={setText}
          placeholder="Search or jump to…"
          className="h-12 w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-400"
        />
      </div>

      <Command.List className="max-h-80 overflow-y-auto p-2">
        <Command.Empty className="py-8 text-center text-sm text-zinc-400">
          No results found.
        </Command.Empty>

        <Command.Group heading="Navigation" className={groupClass}>
          {navItems.map(({ label, href, icon: Icon }) => (
            <Command.Item
              key={href}
              value={`Go to ${label}`}
              onSelect={() => run(() => router.push(href))}
              className={itemClass}
            >
              <Icon className="h-4 w-4 text-zinc-400" />
              {label}
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Group heading="Actions" className={groupClass}>
          {myActions.map(({ label, icon: Icon, href }) => (
            <Command.Item
              key={label}
              value={label}
              onSelect={() => run(() => router.push(href))}
              className={itemClass}
            >
              <Icon className="h-4 w-4 text-zinc-400" />
              {label}
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Group heading="Customers" className={groupClass}>
          {recentContacts.map((c) => (
            <Command.Item
              key={c.id}
              value={`${c.name} ${c.detail} ${c.id}`}
              onSelect={() =>
                run(() =>
                  router.push(`/customers/${c.id}`),
                )
              }
              className={itemClass}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 text-[10px] font-semibold text-white">
                {c.name
                  .split(" ")
                  .map((p) => p[0])
                  .join("")}
              </span>
              <span>{c.name}</span>
              <span className="ml-auto text-xs text-zinc-400">{c.detail}</span>
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
