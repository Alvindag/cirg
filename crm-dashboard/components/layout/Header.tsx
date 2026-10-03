"use client";

import { Search } from "lucide-react";

import { GlassPanel } from "@/components/ui/glass-panel";
import { cn, focusRing } from "@/lib/utils";
import { dasBuiltIn } from "@/lib/das/config";
import { useDas } from "@/lib/das/context";
import { MobileNav } from "./MobileNav";
import { NotificationsMenu } from "./NotificationsMenu";
import { RoleSwitcher } from "./RoleSwitcher";
import { DasStatus } from "./DasStatus";
import { OPEN_COMMAND_MENU_EVENT } from "./CommandMenu";

export function Header() {
  const { me } = useDas();
  const initials = me
    ? me.fullName
        .split(/\s+/)
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "AD";
  return (
    <GlassPanel
      as="header"
      className="flex h-14 shrink-0 items-center justify-between px-4"
    >
      <MobileNav />
      <button
        type="button"
        aria-label="Open command palette"
        aria-keyshortcuts="Meta+K Control+K"
        onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_MENU_EVENT))}
        className={cn(
          "mx-2 flex min-w-0 shrink items-center gap-2 sm:w-full sm:max-w-xs rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-200",
          focusRing,
        )}
      >
        <Search className="h-4 w-4" aria-hidden />
        <span className="hidden flex-1 text-left sm:inline">Search…</span>
        <kbd className="hidden rounded sm:inline border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-xs text-zinc-400">
          ⌘K
        </kbd>
      </button>

      <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
        {dasBuiltIn ? <RoleSwitcher /> : <DasStatus />}
        <NotificationsMenu />
        <div
          role="img"
          aria-label={me ? `${me.fullName}, ${me.role}` : "User profile"}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 text-xs font-semibold text-white ring-1 ring-white/20"
        >
          {initials}
        </div>
      </div>
    </GlassPanel>
  );
}
