import { SamplesView } from "@/components/das/SamplesView";
import { RequireLive } from "@/components/layout/RequireLive";

export default function SamplesPage() {
  return (
    <RequireLive
      managersOnly
      deniedMessage="Sample management is available to managers."
    >
      <SamplesView />
    </RequireLive>
  );
}
