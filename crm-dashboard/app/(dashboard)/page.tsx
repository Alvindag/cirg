import { ActivityTimeline } from "@/components/dashboard/ActivityTimeline";
import { BentoGrid, BentoItem } from "@/components/dashboard/BentoGrid";
import { CopilotInsight } from "@/components/dashboard/CopilotInsight";
import { KpiRow } from "@/components/dashboard/KpiRow";
import { ProductEngagement } from "@/components/dashboard/ProductEngagement";
import { QuickActions } from "@/components/dashboard/QuickActions";

export default function DashboardPage() {
  return (
    <>
      <h1 className="sr-only">Dashboard</h1>
      <BentoGrid>
        <BentoItem className="md:col-span-3 lg:col-span-4">
          <KpiRow />
        </BentoItem>
        <BentoItem className="md:col-span-2">
          <ProductEngagement />
        </BentoItem>
        <BentoItem>
          <QuickActions />
        </BentoItem>
        <BentoItem className="md:col-span-2 lg:col-span-3">
          <ActivityTimeline />
        </BentoItem>
        <BentoItem className="lg:col-start-4 lg:row-start-2 lg:row-span-2">
          <CopilotInsight />
        </BentoItem>
      </BentoGrid>
    </>
  );
}
