import { Suspense } from "react";

import { PipelineView } from "@/components/das/PipelineView";
import { RequireLive } from "@/components/layout/RequireLive";

export default function PipelinePage() {
  return (
    <RequireLive feature="deals">
      <Suspense>
        <PipelineView />
      </Suspense>
    </RequireLive>
  );
}
