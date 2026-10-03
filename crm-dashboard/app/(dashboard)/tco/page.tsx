import { TcoView } from "@/components/das/TcoView";
import { RequireLive } from "@/components/layout/RequireLive";

export default function Page() {
  return (
    <RequireLive feature="tco">
      <TcoView />
    </RequireLive>
  );
}
