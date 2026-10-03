import { CustomerDetail } from "@/components/das/CustomerDetail";
import { RequireLive } from "@/components/layout/RequireLive";

export default function CustomerPage({ params }: { params: { id: string } }) {
  return (
    <RequireLive feature="customers">
      <CustomerDetail id={params.id} />
    </RequireLive>
  );
}
