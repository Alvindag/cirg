import { AccessView } from "@/components/das/AccessView";
import { RequireLive } from "@/components/layout/RequireLive";

export default function Page() {
  return (
    <RequireLive feature="access">
      <AccessView />
    </RequireLive>
  );
}
