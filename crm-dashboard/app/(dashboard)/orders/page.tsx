import { OrdersView } from "@/components/das/OrdersView";
import { RequireLive } from "@/components/layout/RequireLive";

export default function OrdersPage() {
  return (
    <RequireLive feature="orderDesk" deniedMessage="Orders placed by the field team are managed by managers.">
      <OrdersView />
    </RequireLive>
  );
}
