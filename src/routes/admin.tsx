import { createFileRoute, Outlet, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin-sidebar";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      throw redirect({ to: "/login" });
    }
  },
  component: AdminLayout,
});

function AdminLayout() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background text-foreground">
        <AdminSidebar email={email} onSignOut={signOut} />
        <div className="flex flex-1 flex-col">
          <header className="flex h-12 items-center gap-2 border-b border-border px-4">
            <SidebarTrigger />
            <span className="text-sm font-medium text-muted-foreground">
              Panel de administración
            </span>
          </header>
          <main className="flex-1 px-6 py-8">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
