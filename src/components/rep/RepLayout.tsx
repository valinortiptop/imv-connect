import { useCallback, useEffect, useMemo, useState, ReactNode, createContext, useContext } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LogOut, ArrowLeft, MapPin, UserCog, Search, Star, Clock, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { getMyRepFn } from "@/lib/rep.functions";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import NotificationBell from "./NotificationBell";
import MoreSheet from "./mobile/MoreSheet";
import { AIProvider } from "@/components/ai/AIProvider";
import { AIToggle } from "@/components/ai/AIToggle";
import { AICopilotButton } from "@/components/ai/AICopilotButton";
import { Highlight, useNavSearchShortcut } from "@/components/admin-nav-search";
import { RepNavSearch } from "./RepNavSearch";
import {
  repNavGroups,
  flattenRepNav,
  isRepItemActive,
  norm,
  type RepNavGroup,
  type RepNavItem,
} from "./rep-nav-items";


type RepCtx = {
  rep: { id: string; nombre: string } | null;
  isAdmin: boolean;
  geo: { lat: number; lng: number } | null;
  refreshGeo: () => void;
};
const Ctx = createContext<RepCtx>({ rep: null, isAdmin: false, geo: null, refreshGeo: () => {} });
export const useRepContext = () => useContext(Ctx);

const LS_GROUPS = "imv.rep.sidebar.groups";
const LS_FAVS = "imv.rep.sidebar.favs";
const LS_RECENT = "imv.rep.sidebar.recent";

function readLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeLS(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export default function RepLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const fetchMyRep = useServerFn(getMyRepFn);
  const { data } = useQuery({ queryKey: ["my-rep"], queryFn: () => fetchMyRep() });
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);

  const [query, setQuery] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [favs, setFavs] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);

  useNavSearchShortcut(useCallback(() => setPaletteOpen(true), []));

  useEffect(() => {
    setOpenGroups(readLS<string[]>(LS_GROUPS, []));
    setFavs(readLS<string[]>(LS_FAVS, []));
    setRecent(readLS<string[]>(LS_RECENT, []));
  }, []);

  const refreshGeo = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGeo(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  };
  useEffect(() => { refreshGeo(); }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  const isAdmin = !!data?.isAdmin;

  // ---- visible tree (adminOnly filtering) ----------------------------------
  const visibleGroups: RepNavGroup[] = useMemo(
    () =>
      repNavGroups
        .map((g) => ({
          label: g.label,
          subgroups: g.subgroups
            .map((sg) => ({
              label: sg.label,
              items: sg.items.filter((i) => !i.adminOnly || isAdmin),
            }))
            .filter((sg) => sg.items.length > 0),
        }))
        .filter((g) => g.subgroups.length > 0),
    [isAdmin],
  );

  const allItems = useMemo(() => flattenRepNav(visibleGroups), [visibleGroups]);

  const activeGroupLabel = useMemo(() => {
    const match = allItems
      .filter((i) => isRepItemActive(pathname, i.to, i.exact))
      .sort((a, b) => b.to.length - a.to.length)[0];
    return match?.group ?? null;
  }, [allItems, pathname]);

  // Keep the group of the current page open.
  useEffect(() => {
    if (!activeGroupLabel) return;
    setOpenGroups((prev) => (prev.includes(activeGroupLabel) ? prev : [activeGroupLabel]));
  }, [activeGroupLabel]);

  // Track recents.
  useEffect(() => {
    const match = allItems
      .filter((i) => isRepItemActive(pathname, i.to, i.exact))
      .sort((a, b) => b.to.length - a.to.length)[0];
    if (!match) return;
    setRecent((prev) => {
      const next = [match.key, ...prev.filter((k) => k !== match.key)].slice(0, 4);
      writeLS(LS_RECENT, next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, allItems.length]);

  const toggleGroup = (label: string) =>
    setOpenGroups((prev) => {
      const next = prev.includes(label) ? prev.filter((l) => l !== label) : [label];
      writeLS(LS_GROUPS, next);
      return next;
    });

  const toggleFav = (key: string) =>
    setFavs((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      writeLS(LS_FAVS, next);
      return next;
    });

  // ---- search ---------------------------------------------------------------
  const q = norm(query.trim());
  const searching = q.length > 0;
  const filteredGroups: RepNavGroup[] = useMemo(() => {
    if (!searching) return visibleGroups;
    return visibleGroups
      .map((g) => ({
        label: g.label,
        subgroups: g.subgroups
          .map((sg) => ({ label: sg.label, items: sg.items.filter((i) => norm(i.label).includes(q)) }))
          .filter((sg) => sg.items.length > 0),
      }))
      .filter((g) => g.subgroups.length > 0);
  }, [visibleGroups, searching, q]);

  const byKey = useMemo(() => new Map(allItems.map((i) => [i.key, i])), [allItems]);
  const favItems = favs.map((k) => byKey.get(k)).filter(Boolean) as RepNavItem[];
  const recentItems = recent
    .map((k) => byKey.get(k))
    .filter(Boolean)
    .filter((i) => !favs.includes((i as RepNavItem).key)) as RepNavItem[];

  const Row = ({ item }: { item: RepNavItem }) => {
    const active = isRepItemActive(pathname, item.to, item.exact);
    const isFav = favs.includes(item.key);
    return (
      <li className="group/row relative">
        {active && (
          <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
        )}
        <div className="flex items-center">
          <Link
            to={item.to}
            title={item.label}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors hover:bg-muted",
              active ? "bg-muted font-medium text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="truncate">
              <Highlight text={item.label} query={query} />
            </span>
          </Link>
          <button
            type="button"
            onClick={() => toggleFav(item.key)}
            aria-label={isFav ? `Quitar ${item.label} de favoritos` : `Agregar ${item.label} a favoritos`}
            className={cn(
              "mr-1 shrink-0 rounded p-1 text-muted-foreground transition-opacity hover:text-primary",
              isFav ? "opacity-100 text-primary" : "opacity-0 group-hover/row:opacity-100 focus:opacity-100",
            )}
          >
            <Star className={cn("h-3.5 w-3.5", isFav && "fill-current")} />
          </button>
        </div>
      </li>
    );
  };

  const mobilePrimary = allItems.filter((n) => n.mobilePrimary);

  return (
    <AIProvider>
    <Ctx.Provider value={{ rep: data?.rep ?? null, isAdmin, geo, refreshGeo }}>
      <div className="flex min-h-screen w-full flex-col bg-background text-foreground md:flex-row">
        {/* Sidebar desktop */}
        <aside className="fixed inset-y-0 left-0 z-40 hidden h-screen w-56 shrink-0 flex-col border-r border-border bg-card md:flex">
          <div className="flex shrink-0 items-start justify-between px-4 pt-4 pb-2">
            <div className="min-w-0">
              <div className="text-lg font-semibold">Panel Rep</div>
              {data?.rep?.nombre && (
                <div className="mt-1 truncate text-xs text-muted-foreground">
                  {data.rep.nombre}
                </div>
              )}
            </div>
            <NotificationBell />
          </div>

          {/* Search */}
          <div className="shrink-0 border-b border-border px-2 pb-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setQuery("")}
                placeholder="Buscar página…"
                className="h-8 pl-7 pr-12 text-[13px]"
              />
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded border border-border px-1 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                aria-label="Abrir buscador de páginas"
              >
                ⌘K
              </button>
            </div>
          </div>

          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-2">
            {/* Favoritos */}
            {!searching && favItems.length > 0 && (
              <div className="mb-1">
                <div className="flex items-center gap-1.5 px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Star className="h-3 w-3" /> Favoritos
                </div>
                <ul className="space-y-0.5">
                  {favItems.map((i) => (
                    <Row key={`fav-${i.key}`} item={i} />
                  ))}
                </ul>
              </div>
            )}

            {/* Recientes */}
            {!searching && recentItems.length > 0 && (
              <div className="mb-1 border-t border-border pt-2">
                <div className="flex items-center gap-1.5 px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Clock className="h-3 w-3" /> Recientes
                </div>
                <ul className="space-y-0.5">
                  {recentItems.map((i) => (
                    <Row key={`recent-${i.key}`} item={i} />
                  ))}
                </ul>
              </div>
            )}

            {/* Groups */}
            <div className="space-y-0.5 border-t border-border pt-2">
              {filteredGroups.length === 0 && (
                <p className="px-2 py-4 text-xs text-muted-foreground">Sin resultados.</p>
              )}
              {filteredGroups.map((group) => {
                const count = group.subgroups.reduce((n, sg) => n + sg.items.length, 0);
                const isOpen = searching || openGroups.includes(group.label);
                const hasActive = group.label === activeGroupLabel;
                return (
                  <div key={group.label}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.label)}
                      aria-expanded={isOpen}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted",
                        hasActive && "text-primary",
                      )}
                    >
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wider",
                          hasActive ? "text-primary" : "text-muted-foreground",
                        )}
                      >
                        {group.label}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground/70">{count}</span>
                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                          !isOpen && "-rotate-90",
                        )}
                      />
                    </button>
                    {isOpen && (
                      <div className="ml-2 space-y-1.5 border-l border-border pb-2 pl-1.5 pt-1">
                        {group.subgroups.map((sg, idx) => (
                          <div key={sg.label ?? idx}>
                            {sg.label && (
                              <div className="px-2 pb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                                {sg.label}
                              </div>
                            )}
                            <ul className="space-y-0.5">
                              {sg.items.map((item) => (
                                <Row key={item.key} item={item} />
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </nav>

          <div className="shrink-0 space-y-2 border-t border-border bg-card p-3">
            <div className="px-2">
              <AIToggle compact />
            </div>
            <Button asChild variant="ghost" size="sm" className="w-full justify-start">
              <Link to="/rep/cuenta">
                <UserCog className="mr-2 h-4 w-4" /> Mi cuenta
              </Link>
            </Button>
            {isAdmin && (
              <Button asChild variant="outline" size="sm" className="w-full justify-start">
                <Link to="/admin">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Volver a la app
                </Link>
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start">
              <LogOut className="mr-2 h-4 w-4" /> Salir
            </Button>
          </div>
        </aside>

        {/* Main */}
        <main
          className="min-w-0 flex-1 md:ml-56 md:pb-6"
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
          {mobilePrimary.map((n) => {
            const active = isRepItemActive(pathname, n.to, n.exact);
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
            isAdmin={isAdmin}
            active={
              !mobilePrimary.some((n) =>
                isRepItemActive(pathname, n.to, n.exact),
              )
            }
          />
        </nav>
        <AICopilotButton />

        <RepNavSearch groups={visibleGroups} open={paletteOpen} onOpenChange={setPaletteOpen} />
      </div>
    </Ctx.Provider>
    </AIProvider>
  );
}
