import { CommandMenu } from "@/components/layout/CommandMenu";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { GlassPanel } from "@/components/ui/glass-panel";

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex h-screen gap-4 p-4">
      <CommandMenu />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <Header />
        <GlassPanel as="main" className="min-h-0 flex-1 overflow-y-auto p-6">
          {children}
        </GlassPanel>
      </div>
    </div>
  );
}
