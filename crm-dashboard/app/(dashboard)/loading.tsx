import { GlassPanel } from "@/components/ui/glass-panel";
import { SkeletonLoader } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4">
      <GlassPanel className="rounded-2xl p-5 md:col-span-2">
        <SkeletonLoader className="mb-6 h-4 w-40" />
        <SkeletonLoader className="h-48 w-full" />
      </GlassPanel>
      <GlassPanel className="rounded-2xl p-5">
        <SkeletonLoader className="mb-4 h-4 w-28" />
        <div className="flex flex-col gap-2">
          <SkeletonLoader className="h-10 w-full" />
          <SkeletonLoader className="h-10 w-full" />
          <SkeletonLoader className="h-10 w-full" />
        </div>
      </GlassPanel>
      <GlassPanel className="rounded-2xl p-5 md:col-span-2 lg:col-span-3 lg:row-start-2">
        <SkeletonLoader className="mb-4 h-4 w-36" />
        <div className="flex flex-col gap-4">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonLoader key={i} className="h-8 w-full" />
          ))}
        </div>
      </GlassPanel>
      <GlassPanel className="rounded-2xl p-5 lg:col-start-4 lg:row-span-2 lg:row-start-1">
        <SkeletonLoader className="mb-4 h-4 w-32" />
        <SkeletonLoader className="mb-3 h-8 w-16" />
        <SkeletonLoader className="h-16 w-full" />
      </GlassPanel>
    </div>
  );
}
