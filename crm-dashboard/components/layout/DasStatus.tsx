"use client";

import Link from "next/link";

import { dasEnabled } from "@/lib/das/config";
import { useDas } from "@/lib/das/context";
import { cn, focusRing } from "@/lib/utils";

const labels = {
  demo: "Demo data",
  "signed-out": "Connect DAS Engage",
  connecting: "Connecting…",
  live: "Live",
} as const;

/** Header pill that shows, and links to, the DAS Engage 360 connection state. */
export function DasStatus() {
  const { status, me } = useDas();
  const label = status === "live" && me ? `Live · ${me.role}` : labels[status];

  const pill = (
    <span
      className={cn(
        "flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300",
        status === "live" && "border-teal-300/30 text-teal-200",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "live" ? "bg-teal-300" : "bg-zinc-500",
        )}
      />
      {label}
    </span>
  );

  if (!dasEnabled) return pill;
  return (
    <Link
      href="/connect"
      aria-label={`DAS Engage 360 connection: ${label}`}
      className={cn("rounded-full", focusRing)}
    >
      {pill}
    </Link>
  );
}
