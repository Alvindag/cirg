"use client";

import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

/** A placeholder block with a shimmer sweep, for content that is loading. */
export function SkeletonLoader({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative overflow-hidden rounded-md bg-white/5",
        className
      )}
    >
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
        initial={{ x: "-100%" }}
        animate={{ x: "100%" }}
        transition={{ duration: 1.6, ease: "linear", repeat: Infinity }}
      />
    </div>
  );
}
