"use client";

import { motion } from "framer-motion";
import { CalendarCheck, KanbanSquare, PackagePlus, UserPlus, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { useDas } from "@/lib/das/context";
import { can, type Feature } from "@/lib/das/rbac";
import { cn, focusRing } from "@/lib/utils";
import { Widget } from "./Widget";

const actions: { label: string; icon: LucideIcon; href: string; feature: Feature }[] = [
  { label: "Log a visit", icon: CalendarCheck, href: "/activities?new=1", feature: "activities" },
  { label: "New deal", icon: KanbanSquare, href: "/pipeline?new=1", feature: "deals" },
  { label: "Add a customer", icon: UserPlus, href: "/customers?new=1", feature: "customers" },
  { label: "Request samples", icon: PackagePlus, href: "/samples?new=1", feature: "samples" },
];

export function QuickActions() {
  const { me } = useDas();
  const list = me ? actions.filter((a) => can(me.role, a.feature)) : [];
  return (
    <Widget title="Quick Actions">
      <div className="flex flex-col gap-2">
        {list.map(({ label, icon: Icon, href }) => (
          <motion.div key={label} whileTap={{ scale: 0.95 }} transition={{ type: "spring", stiffness: 500, damping: 20 }}>
            <Link
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-200 transition-colors hover:bg-white/10",
                focusRing,
              )}
            >
              <Icon className="h-4 w-4 text-zinc-400" aria-hidden />
              {label}
            </Link>
          </motion.div>
        ))}
      </div>
    </Widget>
  );
}
