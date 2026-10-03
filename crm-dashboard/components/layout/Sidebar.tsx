"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

import { GlassPanel } from "@/components/ui/glass-panel";
import { cn, focusRing } from "@/lib/utils";
import { useDas } from "@/lib/das/context";
import { navFor } from "./nav-items";

export function Sidebar() {
  const pathname = usePathname();
  const { me } = useDas();
  const groups = navFor(me?.role);
  const navItems = groups.flatMap((g) => g.items);
  const [hovered, setHovered] = useState<string | null>(null);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  // The longest matching href wins, so "/rtm" does not light up "/".
  const active =
    [...navItems]
      .sort((a, b) => b.href.length - a.href.length)
      .find((item) => isActive(item.href))?.href ?? null;
  // The pill follows the hovered item, and settles back on the active one.
  const pillTarget = hovered ?? active;

  return (
    <GlassPanel
      as="aside"
      className="hidden w-64 shrink-0 flex-col overflow-y-auto p-4 md:flex"
    >
      <div className="mb-6 flex items-center gap-2 px-3 py-2">
        <div
          aria-hidden
          className="h-6 w-6 rounded-md bg-gradient-to-br from-indigo-400 to-teal-300"
        />
        <span className="text-sm font-semibold tracking-tight">DAS Engage 360</span>
      </div>

      <nav
        aria-label="Main"
        className="flex flex-col gap-1"
        onMouseLeave={() => setHovered(null)}
      >
        {groups.map((g) => (
          <div key={g.heading} className="mb-2">
            <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
              {g.heading}
            </p>
            {g.items.map(({ label, href, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onMouseEnter={() => setHovered(href)}
                onFocus={() => setHovered(href)}
                onBlur={() => setHovered(null)}
                aria-current={active === href ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  focusRing,
                  pillTarget === href || active === href
                    ? "text-zinc-100"
                    : "text-zinc-400",
                )}
              >
                {pillTarget === href && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 -z-0 rounded-lg bg-white/10"
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  />
                )}
                <Icon className="relative z-10 h-4 w-4" aria-hidden />
                <span className="relative z-10">{label}</span>
              </Link>
            ))}
          </div>
        ))}
      </nav>
    </GlassPanel>
  );
}
