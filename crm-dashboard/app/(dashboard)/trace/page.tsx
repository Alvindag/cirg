import { TraceView } from "@/components/das/TraceView";
import { RequireLive } from "@/components/layout/RequireLive";

export default function Page() {
  return (
    <RequireLive feature="trace">
      <TraceView />
    </RequireLive>
  );
}
