import { DataQualityView } from "@/components/das/DataQualityView";
import { RequireLive } from "@/components/layout/RequireLive";

export default function Page() {
  return (
    <RequireLive feature="dataQuality">
      <DataQualityView />
    </RequireLive>
  );
}
