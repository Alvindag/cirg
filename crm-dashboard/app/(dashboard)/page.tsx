import { ActivityTimeline } from "@/components/dashboard/ActivityTimeline";
import { CopilotInsight } from "@/components/dashboard/CopilotInsight";
import { PipelineOverview } from "@/components/dashboard/PipelineOverview";
import { QuickActions } from "@/components/dashboard/QuickActions";

export default function DashboardPage() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4">
      <PipelineOverview className="md:col-span-2" />
      <QuickActions />
      <ActivityTimeline className="md:col-span-2 lg:col-span-3 lg:row-start-2" />
      <CopilotInsight className="lg:col-start-4 lg:row-span-2 lg:row-start-1" />
    </div>
  );
}
