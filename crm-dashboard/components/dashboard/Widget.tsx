import { GlassPanel } from "@/components/ui/glass-panel";
import { cn } from "@/lib/utils";

type WidgetProps = {
  title?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

/** The shared frame for every bento widget: glass surface, padding, header row. */
export function Widget({ title, action, className, children }: WidgetProps) {
  return (
    <GlassPanel as="section" className={cn("h-full p-5", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-medium text-zinc-300">
            {title}
          </h2>
          {action}
        </div>
      )}
      {children}
    </GlassPanel>
  );
}
