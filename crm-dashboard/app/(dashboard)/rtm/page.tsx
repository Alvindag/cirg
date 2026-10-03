import { RtmView } from "@/components/das/RtmView";
import { RequireLive } from "@/components/layout/RequireLive";

export default function Page() {
  return (
    <RequireLive feature="rtm">
      <RtmView />
    </RequireLive>
  );
}
