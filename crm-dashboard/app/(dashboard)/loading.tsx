import { Widget } from "@/components/dashboard/Widget";
import { SkeletonLoader } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4"
    >
      <span className="sr-only">Loading dashboard…</span>
      <Widget className="md:col-span-3 lg:col-span-4">
        <SkeletonLoader className="mb-4 h-4 w-28" />
        <SkeletonLoader className="h-14 w-full" />
      </Widget>
      <Widget className="md:col-span-2">
        <SkeletonLoader className="mb-6 h-4 w-40" />
        <SkeletonLoader className="h-48 w-full" />
      </Widget>
      <Widget>
        <SkeletonLoader className="mb-4 h-4 w-28" />
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <SkeletonLoader key={i} className="h-10 w-full" />
          ))}
        </div>
      </Widget>
      <Widget className="md:col-span-2 lg:col-span-3">
        <SkeletonLoader className="mb-4 h-4 w-36" />
        <div className="flex flex-col gap-4">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonLoader key={i} className="h-8 w-full" />
          ))}
        </div>
      </Widget>
      <Widget className="lg:col-start-4 lg:row-start-2 lg:row-span-2">
        <SkeletonLoader className="mb-4 h-4 w-32" />
        <SkeletonLoader className="mb-3 h-8 w-16" />
        <SkeletonLoader className="h-16 w-full" />
      </Widget>
    </div>
  );
}
