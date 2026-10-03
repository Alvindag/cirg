"use client";

import { MotionConfig } from "framer-motion";

import { DasProvider } from "@/lib/das/context";

/**
 * App-wide client providers: honors the OS "reduce motion" setting for every
 * Framer Motion animation, and shares the DAS Engage 360 connection state.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <DasProvider>{children}</DasProvider>
    </MotionConfig>
  );
}
