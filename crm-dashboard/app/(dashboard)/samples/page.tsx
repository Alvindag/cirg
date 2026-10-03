import { Suspense } from "react";

import { SamplesView } from "@/components/das/SamplesView";
import { RequireLive } from "@/components/layout/RequireLive";

export default function SamplesPage() {
  return (
    <RequireLive feature="samples">
      <Suspense>
        <SamplesView />
      </Suspense>
    </RequireLive>
  );
}
