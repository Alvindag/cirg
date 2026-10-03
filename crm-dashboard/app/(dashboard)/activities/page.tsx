import { Suspense } from "react";

import { ActivitiesView } from "@/components/das/ActivitiesView";
import { RequireLive } from "@/components/layout/RequireLive";

export default function ActivitiesPage() {
  return (
    <RequireLive feature="activities">
      <Suspense>
        <ActivitiesView />
      </Suspense>
    </RequireLive>
  );
}
