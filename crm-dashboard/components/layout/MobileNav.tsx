"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useDas } from "@/lib/das/context";
import { cn, focusRing } from "@/lib/utils";
import { navFor } from "./nav-items";

/** The menu on small screens, where the sidebar is hidden. */
export function MobileNav() {
  const { me } = useDas();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="mobile-nav"
        onClick={() => setOpen((o) => !o)}
        className={cn("rounded-lg p-2 text-zinc-300 hover:bg-white/10", focusRing)}
      >
        {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
      </button>
      {open && (
        <nav
          id="mobile-nav"
          aria-label="Main"
          className="fixed inset-x-4 top-20 z-40 max-h-[70vh] overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950/95 p-3 shadow-2xl backdrop-blur-xl"
        >
          {navFor(me?.role).map((g) => (
            <div key={g.heading} className="mb-2">
              <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-zinc-400">{g.heading}</p>
              {g.items.map(({ label, href, icon: Icon }) => (
                <Link key={href} href={href} className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-200 hover:bg-white/10", focusRing)}>
                  <Icon className="h-4 w-4 text-zinc-400" aria-hidden />
                  {label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      )}
    </div>
  );
}
