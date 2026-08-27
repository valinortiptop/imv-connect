import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, LogOut, Search, Star, UserCog, Clock } from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import { useRoles } from "@/lib/use-roles";
import { logoFullWhite } from "@/assets/logos";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  useSidebar,
} from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import {
  navGroups,
  ALWAYS_VISIBLE_KEYS,
  flattenNav,
  isItemActive,
  norm,
  type NavGroup,
  type NavItem,
} from "@/components/nav-items";
import { AdminNavSearch, Highlight, useNavSearchShortcut } from "@/components/admin-nav-search";

const ADMIN_BUILD_MARKER = `Build ${__BUILD_ID__}`;

const LS_GROUPS = "imv.sidebar.groups";
const LS_FAVS = "imv.sidebar.favs";
const LS_RECENT = "imv.sidebar.recent";

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

export function AdminSidebar({
  email,
  onSignOut,
}: {
  email: string | null;
  onSignOut: () => void;
}) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { canAccessKey, loading } = usePermissions();
  const { isAdmin, isLoading: rolesLoading } = useRoles();
  const { isMobile, setOpenMobile } = useSidebar();

  const [query, setQuery] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [favs, setFavs] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);

  useNavSearchShortcut(useCallback(() => setPaletteOpen(true), []));

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    if (isMobile) setOpenMobile(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Hydrate persisted state on the client only (avoids SSR mismatch).
  useEffect(() => {
    setOpenGroups(readLS<string[]>(LS_GROUPS, []));
    setFavs(readLS<string[]>(LS_FAVS, []));
    setRecent(readLS<string[]>(LS_RECENT, []));
  }, []);

  // ---- visible tree (permissions + role filtering) -------------------------
  const visibleGroups: NavGroup[] = useMemo(() => {
    const permissive = loading || rolesLoading;
    return navGroups
      .map((g) => ({
        label: g.label,
        subgroups: g.subgroups
          .map((sg) => ({
            label: sg.label,
            items: sg.items.filter(
              (i) =>
                (!i.adminOnly || isAdmin) &&
                (permissive || ALWAYS_VISIBLE_KEYS.has(i.key) || canAccessKey(i.key)),
            ),
          }))
          .filter((sg) => sg.items.length > 0),
      }))
      .filter((g) => g.subgroups.length > 0);
  }, [loading, rolesLoading, isAdmin, canAccessKey]);

  const allItems = useMemo(() => flattenNav(visibleGroups), [visibleGroups]);

  const activeGroupLabel = useMemo(() => {
    const match = allItems
      .filter((i) => isItemActive(pathname, i.url, i.exact))
      .sort((a, b) => b.url.length - a.url.length)[0];
    return match?.group ?? null;
  }, [allItems, pathname]);

  // Keep the group of the current page open (accordion-friendly default).
  useEffect(() => {
    if (!activeGroupLabel) return;
    setOpenGroups((prev) => (prev.includes(activeGroupLabel) ? prev : [activeGroupLabel]));
  }, [activeGroupLabel]);

  // Track recents.
  useEffect(() => {
    const match = allItems
      .filter((i) => isItemActive(pathname, i.url, i.exact))
      .sort((a, b) => b.url.length - a.url.length)[0];
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

  // ---- search -------------------------------------------------------------
  const q = norm(query.trim());
  const searching = q.length > 0;
  const filteredGroups: NavGroup[] = useMemo(() => {
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
  const favItems = favs.map((k) => byKey.get(k)).filter(Boolean) as NavItem[];
  const recentItems = recent
    .map((k) => byKey.get(k))
    .filter(Boolean)
    .filter((i) => !favs.includes((i as NavItem).key)) as NavItem[];

  const Row = ({ item }: { item: NavItem }) => {
    const active = isItemActive(pathname, item.url, item.exact);
    const isFav = favs.includes(item.key);
    return (
      <li className="group/row relative">
        {active && (
          <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
        )}
        <div className="flex items-center">
          <Link
            to={item.url}
            title={item.label}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors hover:bg-sidebar-accent",
              active ? "bg-sidebar-accent font-medium text-primary" : "text-sidebar-foreground",
            )}
          >
            <img
              src={item.icon}
              alt=""
              aria-hidden="true"
              loading="lazy"
              width={18}
              height={18}
              className="h-[18px] w-[18px] shrink-0 object-contain mix-blend-multiply"
            />
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

  return (
    <Sidebar collapsible="offcanvas">
      {/* Brand header — full IMV lockup on its native navy background */}
      <Link
        to="/admin"
        className="block border-b border-sidebar-border bg-[#0b1f5c] px-4 py-2"
        aria-label="IMV — ir al inicio"
      >
        <div className="flex h-8 items-center justify-center overflow-hidden">
          <img
            src={logoFullWhite}
            alt="IMV Integradora de Medicamentos Veterinarios"
            className="-my-2 block h-12 w-auto"
          />
        </div>
      </Link>

      {/* Search */}
      <div className="border-b border-sidebar-border px-2 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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

      <SidebarContent>
        <SidebarGroup className="px-2">
          <SidebarGroupContent>
            {/* Favoritos */}
            {!searching && favItems.length > 0 && (
              <div className="mb-2">
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
              <div className="mb-2 border-t border-sidebar-border pt-2">
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
            <nav className="space-y-0.5 border-t border-sidebar-border pt-2">
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
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent",
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
                      <div className="ml-2 space-y-1.5 border-l border-sidebar-border pb-2 pl-1.5 pt-1">
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
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="space-y-2 border-t p-3">
          <Link
            to="/admin/cuenta"
            className="flex items-center gap-2 rounded-md px-1 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            <UserCog className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{email ?? "Mi cuenta"}</span>
          </Link>
          <div
            className="text-[10px] text-muted-foreground/70"
            title="Marca visible para confirmar que el navegador cargó la última publicación"
          >
            {ADMIN_BUILD_MARKER}
          </div>
          <button
            onClick={onSignOut}
            className="flex w-full items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
            Cerrar sesión
          </button>
        </div>
      </SidebarFooter>

      <AdminNavSearch groups={visibleGroups} open={paletteOpen} onOpenChange={setPaletteOpen} />
    </Sidebar>
  );
}
