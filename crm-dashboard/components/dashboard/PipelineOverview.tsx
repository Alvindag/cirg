"use client";

import { motion } from "framer-motion";

import { Widget } from "./Widget";

// Mock data: deal value (in $k) per pipeline stage.
const stages = [
  { label: "Lead", value: 120 },
  { label: "Qualified", value: 96 },
  { label: "Proposal", value: 72 },
  { label: "Negotiation", value: 48 },
  { label: "Won", value: 34 },
];

const total = stages.reduce((sum, s) => sum + s.value, 0);
const max = Math.max(...stages.map((s) => s.value));
const summary = stages.map((s) => `${s.label} $${s.value}k`).join(", ");

export function PipelineOverview() {
  return (
    <Widget
      title="Pipeline Overview"
      action={<span className="text-xs text-zinc-400">${total}k total</span>}
    >
      <div role="img" aria-label={`Pipeline value by stage: ${summary}`}>
        <div className="flex h-48 items-end gap-3 sm:gap-5" aria-hidden>
          {stages.map((stage, i) => (
            <div
              key={stage.label}
              className="flex h-full flex-1 flex-col items-center justify-end gap-2"
            >
              <span className="text-xs text-zinc-400">${stage.value}k</span>
              {/* Static height, animated with scaleY (transform only). */}
              <motion.div
                className="w-full origin-bottom rounded-t-lg bg-gradient-to-t from-indigo-600/70 to-teal-300/70"
                style={{ height: `${(stage.value / max) * 100}%` }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.8, delay: i * 0.08, ease: "easeOut" }}
              />
            </div>
          ))}
        </div>

        <div className="mt-3 flex gap-3 sm:gap-5" aria-hidden>
          {stages.map((stage) => (
            <span
              key={stage.label}
              className="flex-1 truncate text-center text-xs text-zinc-400"
            >
              {stage.label}
            </span>
          ))}
        </div>
      </div>
    </Widget>
  );
}
