"use client";

import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { fmtDateTime } from "@/lib/das/format";
import type { AppNotification } from "@/lib/das/types";
import { useDasApi } from "@/lib/das/useDasApi";
import { useDasQuery } from "@/lib/das/useDasQuery";
import { cn, focusRing } from "@/lib/utils";

export function NotificationsMenu() {
  const api = useDasApi();
  const q = useDasQuery<AppNotification[]>("/notifications", undefined, { refreshMs: 60_000 });
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const items = q.data ?? [];
  const unread = items.filter((n) => !n.readAt).length;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  async function read(n: AppNotification) {
    if (n.readAt) return;
    try {
      await api.post(`/notifications/${n.id}/read`);
      q.reload();
    } catch {
      /* leave it unread */
    }
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-controls="notifications-panel"
        onClick={() => setOpen((o) => !o)}
        className={cn("relative rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100", focusRing)}
      >
        <Bell className="h-5 w-5" aria-hidden />
        {unread > 0 && (
          <span aria-hidden className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-500 px-1 text-[10px] font-semibold text-white ring-2 ring-zinc-950">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div
          id="notifications-panel"
          role="region"
          aria-label="Notifications"
          className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-white/10 bg-zinc-950/95 p-2 shadow-2xl backdrop-blur-xl"
        >
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-zinc-400">Nothing new.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-white/10 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => read(n)}
                    className={cn("w-full rounded-lg px-3 py-2 text-left hover:bg-white/5", focusRing)}
                  >
                    <span className="flex items-center gap-2 text-sm text-zinc-100">
                      {!n.readAt && <span aria-label="Unread" className="h-1.5 w-1.5 rounded-full bg-indigo-400" />}
                      {n.title}
                    </span>
                    {n.body && <span className="block text-xs text-zinc-300">{n.body}</span>}
                    <span className="block text-[11px] text-zinc-400">{fmtDateTime(n.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
