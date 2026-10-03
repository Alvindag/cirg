"use client";

import { motion } from "framer-motion";

import { GlassPanel } from "@/components/ui/glass-panel";

// Mock data: deal value (in $k) per pipeline stage.
const stages = [
  { label: "Lead", value: 120 },
  { label: "Qualified", value: 96 },
  { label: "Proposal", value: 72 },
  { label: "Negotiation", value: 48 },
  { label: "Won", value: 34 },
];

export function PipelineOverview({ className }: { className?: string }) {
  const max = Math.max(...stages.map((s) => s.value));

  return (
    <GlassPanel className={`rounded-2xl p-5 ${className ?? ""}`}>
      <div className="mb-6 flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-zinc-300">Pipeline Overview</h2>
        <span className="text-xs text-zinc-500">
          ${stages.reduce((sum, s) => sum + s.value, 0)}k total
        </span>
      </div>

      <div className="flex h-48 items-end gap-3 sm:gap-5">
        {stages.map((stage, i) => (
          <div
            key={stage.label}
            className="flex h-full flex-1 flex-col items-center justify-end gap-2"
          >
            <span className="text-xs text-zinc-400">${stage.value}k</span>
            <motion.div
              className="w-full rounded-t-lg bg-gradient-to-t from-indigo-600/70 to-teal-300/70"
              initial={{ height: 0 }}
              animate={{ height: `${(stage.value / max) * 100}%` }}
              transition={{ duration: 0.8, delay: i * 0.08, ease: "easeOut" }}
            />
          </div>
        ))}
      </div>

      <div className="mt-3 flex gap-3 sm:gap-5">
        {stages.map((stage) => (
          <span
            key={stage.label}
            className="flex-1 truncate text-center text-xs text-zinc-500"
          >
            {stage.label}
          </span>
        ))}
      </div>
    </GlassPanel>
  );
}
