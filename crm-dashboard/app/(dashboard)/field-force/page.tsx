import { FieldForceView } from "@/components/das/FieldForceView";
import { RequireLive } from "@/components/layout/RequireLive";

export default function Page() {
  return (
    <RequireLive feature="fieldForce">
      <FieldForceView />
    </RequireLive>
  );
}
