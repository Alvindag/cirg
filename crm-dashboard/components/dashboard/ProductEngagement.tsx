"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";

import { demoProducts } from "@/lib/das/demo";
import { rangeLastDays } from "@/lib/das/range";
import type { ProductEngagement as Engagement } from "@/lib/das/types";
import { useDasQuery } from "@/lib/das/useDasQuery";
import { SourceBadge } from "./SourceBadge";
import { Widget } from "./Widget";

export function ProductEngagement() {
  const range = useMemo(() => rangeLastDays(30), []);
  const q = useDasQuery<Engagement[]>("/dashboards/products", range);
  const products = useMemo(
    () =>
      [...(q.data ?? demoProducts)]
        .sort((a, b) => b.calls - a.calls)
        .slice(0, 6),
    [q.data],
  );
  const max = Math.max(1, ...products.flatMap((p) => [p.calls, p.sampleUnits]));
  const summary = products
    .map((p) => `${p.name}: ${p.calls} calls, ${p.sampleUnits} sample units`)
    .join("; ");

  return (
    <Widget title="Product Engagement" action={<SourceBadge live={q.live} />}>
      {products.length === 0 ? (
        <p className="py-16 text-center text-sm text-zinc-400">
          No products discussed or sampled in this period.
        </p>
      ) : (
        <div role="img" aria-label={`Product engagement: ${summary}`}>
          <div className="flex h-44 items-end gap-3 sm:gap-5" aria-hidden>
            {products.map((p, i) => (
              <div
                key={p.productId}
                className="flex h-full flex-1 items-end justify-center gap-1"
                title={`${p.name}: ${p.calls} calls, ${p.sampleUnits} sample units`}
              >
                {/* Static height, animated with scaleY (transform only). */}
                <motion.div
                  className="w-full max-w-6 origin-bottom rounded-t-md bg-gradient-to-t from-indigo-600/70 to-teal-300/70"
                  style={{ height: `${(p.calls / max) * 100}%` }}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{
                    duration: 0.8,
                    delay: i * 0.08,
                    ease: "easeOut",
                  }}
                />
                <motion.div
                  className="w-full max-w-6 origin-bottom rounded-t-md bg-gradient-to-t from-purple-600/70 to-fuchsia-300/60"
                  style={{ height: `${(p.sampleUnits / max) * 100}%` }}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{
                    duration: 0.8,
                    delay: i * 0.08 + 0.05,
                    ease: "easeOut",
                  }}
                />
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-3 sm:gap-5" aria-hidden>
            {products.map((p) => (
              <span
                key={p.productId}
                className="flex-1 truncate text-center text-xs text-zinc-400"
              >
                {p.name}
              </span>
            ))}
          </div>
          <div className="mt-4 flex gap-4 text-xs text-zinc-400" aria-hidden>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-teal-300/80" /> Calls
              discussing product
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-purple-400/80" /> Sample
              units given
            </span>
          </div>
        </div>
      )}
    </Widget>
  );
}
