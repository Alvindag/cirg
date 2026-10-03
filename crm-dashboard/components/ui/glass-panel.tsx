import * as React from "react";

import { cn } from "@/lib/utils";

type GlassPanelProps = React.HTMLAttributes<HTMLElement> & {
  as?: "div" | "aside" | "header" | "main" | "section";
};

const GlassPanel = React.forwardRef<HTMLElement, GlassPanelProps>(
  ({ as: Tag = "div", className, ...props }, ref) => (
    <Tag
      ref={ref as React.Ref<never>}
      className={cn(
        "rounded-2xl border border-white/10 bg-white/5 shadow-lg shadow-black/20 backdrop-blur-md",
        className,
      )}
      {...props}
    />
  ),
);
GlassPanel.displayName = "GlassPanel";

export { GlassPanel };
