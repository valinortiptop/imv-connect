import { createFileRoute, Outlet, useNavigate, useRouterState, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin-sidebar";
import { usePermissions } from "@/hooks/use-permissions";

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
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { allowedRoutePaths, canAccess, loading, permissive } = usePermissions();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  // Redirect users to their first allowed page if they hit a route they
  // cannot see (e.g. landing on /admin or /admin/productos as a viewer).
  useEffect(() => {
    if (loading || permissive) return;
    if (allowedRoutePaths.length === 0) return;
    if (!canAccess(pathname)) {
      navigate({ to: allowedRoutePaths[0], replace: true });
    }
  }, [loading, permissive, allowedRoutePaths, pathname, canAccess, navigate]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };


  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background text-foreground">
        <AdminSidebar email={email} onSignOut={signOut} />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur sm:px-4">
            <SidebarTrigger />
            <span className="truncate text-sm font-medium text-muted-foreground">
              Panel de administración
            </span>
          </header>
          <main className="w-full min-w-0 flex-1 overflow-x-hidden px-3 py-4 sm:px-6 sm:py-8">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
