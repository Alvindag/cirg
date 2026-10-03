import { ActivityTimeline } from "@/components/dashboard/ActivityTimeline";
import { BentoGrid, BentoItem } from "@/components/dashboard/BentoGrid";
import { CopilotInsight } from "@/components/dashboard/CopilotInsight";
import { AttentionRow } from "@/components/dashboard/AttentionRow";
import { RtmSnapshot } from "@/components/dashboard/RtmSnapshot";
import { HomeRedirect } from "@/components/layout/HomeRedirect";
import { KpiRow } from "@/components/dashboard/KpiRow";
import { ProductEngagement } from "@/components/dashboard/ProductEngagement";
import { QuickActions } from "@/components/dashboard/QuickActions";

export default function DashboardPage() {
  return (
    <>
      <h1 className="sr-only">Dashboard</h1>
      <HomeRedirect />
      <BentoGrid>
        <BentoItem className="md:col-span-3 lg:col-span-4">
          <KpiRow />
        </BentoItem>
        <BentoItem className="md:col-span-3 lg:col-span-4">
          <AttentionRow />
        </BentoItem>
        <BentoItem className="md:col-span-2">
          <ProductEngagement />
        </BentoItem>
        <BentoItem>
          <QuickActions />
        </BentoItem>
        <BentoItem className="md:col-span-3 lg:col-span-4">
          <ActivityTimeline />
        </BentoItem>
        <BentoItem>
          <CopilotInsight />
        </BentoItem>
        <BentoItem className="md:col-span-3 lg:col-span-4">
          <RtmSnapshot />
        </BentoItem>
      </BentoGrid>
    </>
  );
}
