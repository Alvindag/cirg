import { cn } from "@/lib/utils";

/** A labelled figure. `tone` colours the value when it is good or bad against a target. */
export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "good" | "warn" | "bad";
}) {
  return (
    <div>
      <dt className="text-xs text-zinc-400">{label}</dt>
      <dd
        className={cn(
          "mt-1 text-2xl font-semibold tracking-tight",
          tone === "good" && "text-teal-200",
          tone === "warn" && "text-amber-200",
          tone === "bad" && "text-red-300",
          !tone && "text-zinc-100",
        )}
      >
        {value}
      </dd>
      {hint && <dd className="text-xs text-zinc-400">{hint}</dd>}
    </div>
  );
}

export const StatGrid = ({ children, cols = 4 }: { children: React.ReactNode; cols?: 2 | 3 | 4 | 5 }) => (
  <dl
    className={cn(
      "grid grid-cols-2 gap-4",
      cols === 3 && "lg:grid-cols-3",
      cols === 4 && "lg:grid-cols-4",
      cols === 5 && "lg:grid-cols-5",
    )}
  >
    {children}
  </dl>
);

/**
 * A horizontal bar with an optional target mark. The number is always written
 * out, so the bar is a visual aid and never the only way to read the value.
 */
export function Meter({
  value,
  max = 100,
  target,
  label,
  display,
  tone,
}: {
  value: number;
  max?: number;
  target?: number;
  label: string;
  display?: string;
  tone?: "good" | "warn" | "bad";
}) {
  const w = Math.max(0, Math.min(100, (value / max) * 100));
  const t = target === undefined ? undefined : Math.max(0, Math.min(100, (target / max) * 100));
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 truncate text-sm text-zinc-200" title={label}>
        {label}
      </span>
      <div className="relative h-2 flex-1 rounded-full bg-white/10" aria-hidden>
        <div
          className={cn(
            "h-full rounded-full",
            tone === "bad" ? "bg-red-400/80" : tone === "warn" ? "bg-amber-300/80" : "bg-gradient-to-r from-indigo-500/80 to-teal-300/80",
          )}
          style={{ width: `${w}%` }}
        />
        {t !== undefined && <span className="absolute -top-1 h-4 w-0.5 bg-white/70" style={{ left: `${t}%` }} />}
      </div>
      <span className="w-14 shrink-0 text-right text-sm tabular-nums text-zinc-100">{display ?? `${value}`}</span>
    </div>
  );
}

export function Lede({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 max-w-3xl text-sm leading-relaxed text-zinc-300">{children}</p>;
}

/** Small "why this matters" note tying a page to the problem it solves. */
export function Why({ children }: { children: React.ReactNode }) {
  return (
    <aside className="mb-4 rounded-lg border border-indigo-300/20 bg-indigo-400/5 px-3 py-2 text-sm leading-relaxed text-indigo-100">
      {children}
    </aside>
  );
}
