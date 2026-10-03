import { Sparkles } from "lucide-react";

import { GlassPanel } from "@/components/ui/glass-panel";

export function CopilotInsight() {
  return (
    <GlassPanel
      className="relative h-full overflow-hidden rounded-2xl p-5"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-indigo-500/20 blur-2xl"
      />
      <div className="relative">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-300" />
          <h2 className="text-sm font-medium text-zinc-300">
            AI Copilot Insight
          </h2>
        </div>
        <p className="text-3xl font-semibold tracking-tight text-zinc-100">
          85%
        </p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Acme Corp has a 85% chance of closing this week based on recent email
          sentiment.
        </p>
      </div>
    </GlassPanel>
  );
}
