import { ActivityTimeline } from "@/components/dashboard/ActivityTimeline";
import { BentoGrid, BentoItem } from "@/components/dashboard/BentoGrid";
import { CopilotInsight } from "@/components/dashboard/CopilotInsight";
import { PipelineOverview } from "@/components/dashboard/PipelineOverview";
import { QuickActions } from "@/components/dashboard/QuickActions";

export default function DashboardPage() {
  return (
    <BentoGrid>
      <BentoItem className="md:col-span-2">
        <PipelineOverview />
      </BentoItem>
      <BentoItem>
        <QuickActions />
      </BentoItem>
      <BentoItem className="md:col-span-2 lg:col-span-3 lg:row-start-2">
        <ActivityTimeline />
      </BentoItem>
      <BentoItem className="lg:col-start-4 lg:row-span-2 lg:row-start-1">
        <CopilotInsight />
      </BentoItem>
    </BentoGrid>
  );
}
