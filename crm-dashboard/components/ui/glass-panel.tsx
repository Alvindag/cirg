import * as React from "react";

import { cn } from "@/lib/utils";

const GlassPanel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "border border-white/10 bg-white/5 shadow-lg shadow-black/20 backdrop-blur-md",
      className
    )}
    {...props}
  />
));
GlassPanel.displayName = "GlassPanel";

export { GlassPanel };
