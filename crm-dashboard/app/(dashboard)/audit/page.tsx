import { AuditView } from "@/components/das/AuditView";
import { RequireLive } from "@/components/layout/RequireLive";

export default function AuditPage() {
  return (
    <RequireLive
      managersOnly
      deniedMessage="The audit log is available to managers."
    >
      <AuditView />
    </RequireLive>
  );
}
