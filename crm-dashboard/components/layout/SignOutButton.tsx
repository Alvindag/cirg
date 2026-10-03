"use client";

import { useDas } from "@/lib/das/context";
import { roleLabel } from "@/lib/das/roles";
import { cn, focusRing } from "@/lib/utils";

/** Microsoft mode: who is signed in, and a way out. */
export function SignOutButton() {
  const { me, signOut } = useDas();
  if (!me) return null;
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-300">
      <span className="hidden max-w-[14rem] truncate md:inline">
        {me.fullName} · {me.role === "Distributor" ? "Partner" : roleLabel(me.role)}
      </span>
      <button
        type="button"
        onClick={signOut}
        className={cn("rounded-lg border border-white/10 bg-white/5 px-3 py-1 hover:bg-white/10", focusRing)}
      >
        Sign out
      </button>
    </div>
  );
}
