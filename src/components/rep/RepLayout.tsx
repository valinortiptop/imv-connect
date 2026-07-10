import { useEffect, useState, ReactNode, createContext, useContext } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Users, Map as MapIcon, ClipboardList, Boxes, LogOut, Sparkles, Trophy, CalendarDays, ArrowLeft, FileText, Banknote, RotateCcw, UserPlus, Target, CalendarCheck2, ShoppingBag, Swords, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { getMyRepFn } from "@/lib/rep.functions";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import NotificationBell from "./NotificationBell";
import MoreSheet from "./mobile/MoreSheet";
import { AIProvider } from "@/components/ai/AIProvider";
import { AIToggle } from "@/components/ai/AIToggle";
import { AICopilotButton } from "@/components/ai/AICopilotButton";


type RepCtx = {
  rep: { id: string; nombre: string } | null;
  geo: { lat: number; lng: number } | null;
  refreshGeo: () => void;
};
const Ctx = createContext<RepCtx>({ rep: null, geo: null, refreshGeo: () => {} });
export const useRepContext = () => useContext(Ctx);

type NavItem = { to: string; label: string; icon: any; exact?: boolean; desktopOnly?: boolean; mobilePrimary?: boolean };
const NAV: NavItem[] = [
  { to: "/rep", label: "Inicio", icon: LayoutDashboard, exact: true, mobilePrimary: true },
  { to: "/rep/clientes", label: "Clientes", icon: Users, mobilePrimary: true },
  { to: "/rep/ruta", label: "Ruta", icon: MapIcon, mobilePrimary: true },
  { to: "/rep/visitas", label: "Visitas", icon: ClipboardList, mobilePrimary: true },
  { to: "/rep/cotizaciones", label: "Cotizaciones", icon: FileText, desktopOnly: true },
  { to: "/rep/cobranza", label: "Cobranza", icon: Banknote, desktopOnly: true },
  { to: "/rep/devoluciones", label: "Devoluciones", icon: RotateCcw, desktopOnly: true },
  { to: "/rep/prospectos", label: "Prospectos", icon: UserPlus, desktopOnly: true },

  { to: "/rep/calendario", label: "Calendario", icon: CalendarDays, desktopOnly: true },
  { to: "/rep/catalogo", label: "Catálogo", icon: ShoppingBag, desktopOnly: true },
  { to: "/rep/inventario", label: "Inventario", icon: Boxes },

  { to: "/rep/plan", label: "Plan semanal", icon: ClipboardList, desktopOnly: true },
  { to: "/rep/laboratorios", label: "Laboratorios", icon: ClipboardList, desktopOnly: true },
  { to: "/rep/competencia", label: "Competencia", icon: Swords, desktopOnly: true },
  { to: "/rep/metas", label: "Metas", icon: Target, desktopOnly: true },
  { to: "/rep/cierre", label: "Cierre de día", icon: CalendarCheck2, desktopOnly: true },
  { to: "/rep/coach", label: "Coach IA", icon: Sparkles, desktopOnly: true },
  { to: "/rep/supervisor", label: "Supervisor", icon: Trophy, desktopOnly: true },

];

export default function RepLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const fetchMyRep = useServerFn(getMyRepFn);
  const { data } = useQuery({ queryKey: ["my-rep"], queryFn: () => fetchMyRep() });
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);

  const refreshGeo = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGeo(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  };
  useEffect(() => { refreshGeo(); }, []);

  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <AIProvider>
    <Ctx.Provider value={{ rep: data?.rep ?? null, geo, refreshGeo }}>
      <div className="flex min-h-screen w-full flex-col bg-background text-foreground md:flex-row">
        {/* Sidebar desktop */}
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-border bg-card md:flex">
          <div className="flex shrink-0 items-start justify-between px-5 pt-4 pb-3">
            <div className="min-w-0">
              <div className="text-lg font-semibold">Panel Rep</div>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {data?.rep?.nombre ?? "Cargando…"}
              </div>
            </div>
            <NotificationBell />
          </div>
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive(n.to, n.exact)
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <n.icon className="h-4 w-4 shrink-0" />
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="shrink-0 space-y-2 border-t border-border bg-card p-3">
            <div className="px-2">
              <AIToggle compact />
            </div>
            <Button asChild variant="outline" size="sm" className="w-full justify-start">
              <Link to="/admin">
                <ArrowLeft className="mr-2 h-4 w-4" /> Volver a la app
              </Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start">
              <LogOut className="mr-2 h-4 w-4" /> Salir
            </Button>
          </div>
        </aside>

        {/* Main */}
        <main
          className="min-w-0 flex-1 md:pb-6"
          style={{
            paddingBottom: "calc(6rem + env(safe-area-inset-bottom))",
          }}
        >
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-border bg-background/95 px-4 backdrop-blur md:hidden">
            <span className="truncate text-base font-semibold">Panel Rep</span>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={refreshGeo}
                aria-label={geo ? "Ubicación activa" : "Activar ubicación"}
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors",
                  geo
                    ? "text-primary hover:bg-primary/10"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <MapPin
                  className={cn("h-4 w-4", geo && "animate-pulse")}
                />
              </button>
              <AIToggle compact />
              <NotificationBell />
            </div>
          </header>
          <div className="px-4 py-4 md:px-6 md:py-6">{children}</div>
        </main>

        {/* Bottom nav mobile */}
        <nav
          className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-5 border-t border-border bg-card md:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {NAV.filter((n) => n.mobilePrimary).map((n) => {
            const active = isActive(n.to, n.exact);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "relative flex min-h-14 flex-col items-center justify-center gap-0.5 py-2 text-[10px]",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                {active && (
                  <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-primary" />
                )}
                <n.icon className="h-5 w-5" />
                <span>{n.label}</span>
              </Link>
            );
          })}
          <MoreSheet
            active={
              !NAV.filter((n) => n.mobilePrimary).some((n) =>
                isActive(n.to, n.exact),
              )
            }
          />
        </nav>
        <AICopilotButton />

      </div>
    </Ctx.Provider>
    </AIProvider>
  );
}
