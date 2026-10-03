"use client";

import { Bell, Search } from "lucide-react";

import { GlassPanel } from "@/components/ui/glass-panel";
import { OPEN_COMMAND_MENU_EVENT } from "./CommandMenu";

export function Header() {
  return (
    <GlassPanel
      as="header"
      className="flex h-14 shrink-0 items-center justify-between rounded-2xl px-4"
    >
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_MENU_EVENT))}
        className="flex w-full max-w-xs items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-200"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-xs text-zinc-400">
          ⌘K
        </kbd>
      </button>

      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Notifications"
          className="relative rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-indigo-400 ring-2 ring-zinc-950" />
        </button>
        <div
          aria-label="User profile"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-xs font-semibold text-white ring-1 ring-white/20"
        >
          AD
        </div>
      </div>
    </GlassPanel>
  );
}
