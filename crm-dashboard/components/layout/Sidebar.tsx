"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

import { GlassPanel } from "@/components/ui/glass-panel";
import { cn } from "@/lib/utils";
import { navItems } from "./nav-items";

export function Sidebar() {
  const pathname = usePathname();
  const [hovered, setHovered] = useState<string | null>(null);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
  const active = navItems.find((item) => isActive(item.href))?.href ?? null;
  // The pill follows the hovered item, and settles back on the active one.
  const pillTarget = hovered ?? active;

  return (
    <GlassPanel
      as="aside"
      className="hidden w-64 shrink-0 flex-col rounded-2xl p-4 md:flex"
    >
      <div className="mb-6 flex items-center gap-2 px-3 py-2">
        <div className="h-6 w-6 rounded-md bg-gradient-to-br from-indigo-400 to-teal-300" />
        <span className="text-sm font-semibold tracking-tight">Orbit CRM</span>
      </div>

      <nav
        className="flex flex-col gap-1"
        onMouseLeave={() => setHovered(null)}
      >
        {navItems.map(({ label, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onMouseEnter={() => setHovered(href)}
            onFocus={() => setHovered(href)}
            onBlur={() => setHovered(null)}
            aria-current={isActive(href) ? "page" : undefined}
            className={cn(
              "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors",
              pillTarget === href || isActive(href)
                ? "text-zinc-100"
                : "text-zinc-400"
            )}
          >
            {pillTarget === href && (
              <motion.span
                layoutId="nav-pill"
                className="absolute inset-0 -z-0 rounded-lg bg-white/10"
                transition={{ type: "spring", stiffness: 400, damping: 34 }}
              />
            )}
            <Icon className="relative z-10 h-4 w-4" />
            <span className="relative z-10">{label}</span>
          </Link>
        ))}
      </nav>
    </GlassPanel>
  );
}
