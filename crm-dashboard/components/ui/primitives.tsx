import * as React from "react";

import { cn, focusRing } from "@/lib/utils";

/* Small dark-glass building blocks shared by the DAS Engage 360 pages. */

type Tone = "good" | "warn" | "bad" | "muted";

const toneClass: Record<Tone, string> = {
  good: "border-teal-300/30 bg-teal-400/10 text-teal-200",
  warn: "border-amber-300/30 bg-amber-400/10 text-amber-200",
  bad: "border-red-300/30 bg-red-400/10 text-red-200",
  muted: "border-white/10 bg-white/5 text-zinc-300",
};

export function Badge({
  tone = "muted",
  children,
}: {
  tone?: Tone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium",
        toneClass[tone],
      )}
    >
      {children}
    </span>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary";
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "default", className, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary"
          ? "border-indigo-400/40 bg-indigo-500/70 font-medium text-white hover:bg-indigo-500"
          : "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10",
        focusRing,
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export const fieldClass = cn(
  "rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-400",
  focusRing,
);

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldClass, className)} {...props} />
));
Input.displayName = "Input";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(fieldClass, "[&>option]:bg-zinc-900", className)}
    {...props}
  />
));
Select.displayName = "Select";

export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="mb-3 rounded-lg border border-teal-300/30 bg-teal-400/10 px-3 py-2 text-sm text-teal-100"
    >
      {children}
    </div>
  );
}

export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-red-300/30 bg-red-400/10 px-3 py-2 text-sm text-red-100"
    >
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={cn("rounded underline underline-offset-2", focusRing)}
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-zinc-400">{children}</p>;
}

export function Loading({ what = "Loading" }: { what?: string }) {
  return (
    <div role="status" className="space-y-2 py-2">
      <span className="sr-only">{what}…</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-8 animate-pulse rounded-md bg-white/5" />
      ))}
    </div>
  );
}

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({
  num,
  children,
}: {
  num?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-400",
        num && "text-right",
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  num,
  actions,
  className,
  children,
}: {
  num?: boolean;
  actions?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <td
      className={cn(
        "border-t border-white/10 px-3 py-2 align-top text-zinc-200",
        num && "text-right tabular-nums",
        actions && "space-x-2 whitespace-nowrap text-right",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function PageHead({
  title,
  actions,
}: {
  title: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {actions}
    </div>
  );
}

export function Pager({
  page,
  pages,
  total,
  noun,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  noun: string;
  onPage: (p: number) => void;
}) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3 text-sm text-zinc-300">
      <Button disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </Button>
      <span>
        Page {page} of {pages} · {total} {noun}
      </span>
      <Button disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </Button>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: [T, string][];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="tablist" className="mb-4 flex gap-1 border-b border-white/10">
      {tabs.map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={value === id}
          onClick={() => onChange(id)}
          className={cn(
            "-mb-px rounded-t-lg border-b-2 px-3 py-2 text-sm transition-colors",
            value === id
              ? "border-indigo-400 text-zinc-100"
              : "border-transparent text-zinc-400 hover:text-zinc-200",
            focusRing,
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
