import { PortalView } from "@/components/das/PortalView";
import { RequireLive } from "@/components/layout/RequireLive";

export default function Page() {
  return (
    <RequireLive feature="portal">
      <PortalView />
    </RequireLive>
  );
}
