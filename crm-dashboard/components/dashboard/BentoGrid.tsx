"use client";

import { MotionConfig, motion, type Variants } from "framer-motion";

import { cn } from "@/lib/utils";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" },
  },
};

export function BentoGrid({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}

export function BentoItem({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div className={cn(className)} variants={item}>
      {children}
    </motion.div>
  );
}
