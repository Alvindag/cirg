import { Sparkles } from "lucide-react";

import { Widget } from "./Widget";

export function CopilotInsight() {
  return (
    <Widget
      className="relative overflow-hidden"
      title={
        <>
          <Sparkles className="h-4 w-4 text-indigo-300" aria-hidden />
          AI Copilot Insight
        </>
      }
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-indigo-500/20 blur-2xl"
      />
      <p className="relative text-3xl font-semibold tracking-tight text-zinc-100">
        85%
      </p>
      <p className="relative mt-2 text-sm leading-relaxed text-zinc-400">
        Acme Corp has a 85% chance of closing this week based on recent email
        sentiment.
      </p>
    </Widget>
  );
}
