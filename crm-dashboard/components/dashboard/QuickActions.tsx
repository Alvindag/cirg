"use client";

import { motion } from "framer-motion";
import { PhoneCall, Plus, UserPlus, type LucideIcon } from "lucide-react";

import { GlassPanel } from "@/components/ui/glass-panel";

const actions: { label: string; icon: LucideIcon }[] = [
  { label: "New Deal", icon: Plus },
  { label: "Log Call", icon: PhoneCall },
  { label: "Add Contact", icon: UserPlus },
];

export function QuickActions() {
  return (
    <GlassPanel className="h-full rounded-2xl p-5">
      <h2 className="mb-4 text-sm font-medium text-zinc-300">Quick Actions</h2>
      <div className="flex flex-col gap-2">
        {actions.map(({ label, icon: Icon }) => (
          <motion.button
            key={label}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 500, damping: 20 }}
            type="button"
            className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-200 transition-colors hover:bg-white/10"
          >
            <Icon className="h-4 w-4 text-zinc-400" />
            {label}
          </motion.button>
        ))}
      </div>
    </GlassPanel>
  );
}
