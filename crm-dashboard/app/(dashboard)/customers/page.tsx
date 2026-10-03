import { Suspense } from "react";

import { CustomersView } from "@/components/das/CustomersView";
import { RequireLive } from "@/components/layout/RequireLive";

export default function CustomersPage() {
  return (
    <RequireLive feature="customers">
      {/* useSearchParams needs a Suspense boundary during static rendering. */}
      <Suspense>
        <CustomersView />
      </Suspense>
    </RequireLive>
  );
}
