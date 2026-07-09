import { useEffect, useState, ReactNode, createContext, useContext } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Users, Map as MapIcon, ClipboardList, Boxes, LogOut, Sparkles, Trophy, CalendarDays, ArrowLeft, FileText, Banknote, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { getMyRepFn } from "@/lib/rep.functions";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import NotificationBell from "./NotificationBell";
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

type NavItem = { to: string; label: string; icon: any; exact?: boolean; desktopOnly?: boolean };
const NAV: NavItem[] = [
  { to: "/rep", label: "Inicio", icon: LayoutDashboard, exact: true },
  { to: "/rep/clientes", label: "Clientes", icon: Users },
  { to: "/rep/ruta", label: "Ruta", icon: MapIcon },
  { to: "/rep/visitas", label: "Visitas", icon: ClipboardList },
  { to: "/rep/cotizaciones", label: "Cotizaciones", icon: FileText, desktopOnly: true },
  { to: "/rep/cobranza", label: "Cobranza", icon: Banknote, desktopOnly: true },
  { to: "/rep/devoluciones", label: "Devoluciones", icon: RotateCcw, desktopOnly: true },
  { to: "/rep/calendario", label: "Calendario", icon: CalendarDays, desktopOnly: true },
  { to: "/rep/inventario", label: "Inventario", icon: Boxes },
  { to: "/rep/plan", label: "Plan semanal", icon: ClipboardList, desktopOnly: true },
  { to: "/rep/laboratorios", label: "Laboratorios", icon: ClipboardList, desktopOnly: true },
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
        <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-card p-3 md:flex">
          <div className="mb-6 flex items-start justify-between px-2">
            <div>
              <div className="text-lg font-semibold">Panel Rep</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {data?.rep?.nombre ?? "Cargando…"}
              </div>
            </div>
            <NotificationBell />
          </div>
          <nav className="flex flex-col gap-1">
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
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto space-y-2 pt-4">
            <div className="px-2">
              <AIToggle compact />
            </div>
            <Button asChild variant="outline" size="sm" className="w-full justify-start">
              <Link to="/">
                <ArrowLeft className="mr-2 h-4 w-4" /> Volver a la app
              </Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start">
              <LogOut className="mr-2 h-4 w-4" /> Salir
            </Button>
          </div>
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1 pb-20 md:pb-6">
          <header className="sticky top-0 z-30 flex h-12 items-center justify-between gap-2 border-b border-border bg-background/95 px-4 backdrop-blur md:hidden">
            <span className="text-sm font-semibold">Panel Rep</span>
            <div className="flex items-center gap-2">
              {geo ? (
                <span className="text-[10px] text-muted-foreground">
                  📍 {geo.lat.toFixed(3)}, {geo.lng.toFixed(3)}
                </span>
              ) : (
                <button className="text-[10px] text-primary" onClick={refreshGeo}>
                  Activar ubicación
                </button>
              )}
              <AIToggle compact />
              <NotificationBell />
            </div>
          </header>
          <div className="px-4 py-4 md:px-6 md:py-6">{children}</div>
        </main>

        {/* Bottom nav mobile */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-5 border-t border-border bg-card md:hidden">
          {NAV.filter((n) => !n.desktopOnly).map((n) => {
            const active = isActive(n.to, n.exact);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2 text-[10px]",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <n.icon className="h-5 w-5" />
                <span>{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <AICopilotButton />
      </div>
    </Ctx.Provider>
    </AIProvider>
  );
}
