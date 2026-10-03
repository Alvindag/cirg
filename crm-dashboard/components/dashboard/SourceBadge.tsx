import { cn } from "@/lib/utils";

/** Says whether a widget is showing live DAS Engage 360 data or sample data. */
export function SourceBadge({ live }: { live: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[11px] font-medium",
        live
          ? "border-teal-300/30 bg-teal-400/10 text-teal-200"
          : "border-white/10 bg-white/5 text-zinc-400",
      )}
    >
      {live ? "Live" : "Sample data"}
    </span>
  );
}
