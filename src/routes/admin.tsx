import { createFileRoute, Outlet, useNavigate, useRouterState, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin-sidebar";
import { AdminGlobalSearch } from "@/components/admin/AdminGlobalSearch";
import { resolveAdminPageTitle } from "@/components/admin/page-title";
import type { NavGroup } from "@/components/nav-items";
import NotificationBell from "@/components/notifications/NotificationBell";
import { usePermissions } from "@/hooks/use-permissions";
import { useRepOnly } from "@/hooks/use-rep-only";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      throw redirect({ to: "/login", search: { redirect: location.pathname } });
    }
  },
  component: AdminLayout,
});

function AdminLayout() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { allowedRoutePaths, canAccess, loading, permissive } = usePermissions();
  const { loading: repLoading, repOnly } = useRepOnly();
  const [visibleGroups, setVisibleGroups] = useState<NavGroup[]>([]);
  const page = resolveAdminPageTitle(pathname);

  // Vendedores (rol representante únicamente) solo tienen acceso al portal /rep.
  useEffect(() => {
    if (repLoading) return;
    if (repOnly) navigate({ to: "/rep", replace: true });
  }, [repLoading, repOnly, navigate]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  // Redirect users to their first allowed page if they hit a route they
  // cannot see (e.g. landing on /admin or /admin/productos as a viewer).
  useEffect(() => {
    if (repOnly) return;
    if (loading || permissive) return;
    if (allowedRoutePaths.length === 0) return;
    if (!canAccess(pathname)) {
      navigate({ to: allowedRoutePaths[0], replace: true });
    }
  }, [loading, permissive, repOnly, allowedRoutePaths, pathname, canAccess, navigate]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };


  if (repLoading || repOnly) {
    return <div className="p-6 text-sm text-muted-foreground">Redirigiendo al panel de representantes…</div>;
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-sidebar text-foreground">
        <AdminSidebar email={email} onSignOut={signOut} onGroupsChange={setVisibleGroups} />
        <div className="flex min-w-0 flex-1 flex-col bg-sidebar">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 bg-sidebar px-2 pt-[env(safe-area-inset-top)] text-sidebar-foreground sm:gap-3 sm:px-3">
            <SidebarTrigger aria-label="Abrir o cerrar menú" className="size-9 shrink-0" />
            <div className="min-w-0 shrink" aria-live="polite">
              {page.section && (
                <div className="hidden truncate text-[10px] font-semibold uppercase leading-none tracking-wider text-muted-foreground sm:block">
                  {page.section}
                </div>
              )}
              <div className="truncate text-sm font-semibold leading-tight sm:text-base">
                {page.title}
                {page.detail && (
                  <span className="font-normal text-muted-foreground"> › {page.detail}</span>
                )}
              </div>
            </div>
            <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-1.5 sm:gap-2">
              <div className="w-9 min-w-0 sm:w-full sm:max-w-sm lg:max-w-md">
                <AdminGlobalSearch groups={visibleGroups} />
              </div>
              <NotificationBell />
            </div>
          </header>
          <main
            data-mobile-safe
            className="w-full min-w-0 flex-1 overflow-x-clip bg-background px-3 py-4 sm:px-6 sm:py-6 md:mb-2 md:mr-2 md:rounded-2xl md:border md:border-sidebar-border md:shadow-sm lg:px-8"
          >
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
