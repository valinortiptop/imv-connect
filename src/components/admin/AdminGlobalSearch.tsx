import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Clock,
  FileText,
  Loader2,
  Package,
  Search,
  ShoppingCart,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Highlight } from "@/components/admin-nav-search";
import { flattenNav, norm, type NavGroup } from "@/components/nav-items";
import { usePermissions } from "@/hooks/use-permissions";
import { globalSearchFn, type GlobalSearchResult } from "@/lib/global-search.functions";
import { cn } from "@/lib/utils";

const RECENT_KEY = "imv.admin.search.recent";

function readRecent(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}
function saveRecent(q: string) {
  const t = q.trim();
  if (t.length < 2) return;
  try {
    const next = [t, ...readRecent().filter((x) => x !== t)].slice(0, 6);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const RECORD_GROUPS: {
  key: keyof GlobalSearchResult;
  label: string;
  icon: LucideIcon;
  /** Página que debe poder abrir el usuario para ver estos resultados. */
  page: string;
}[] = [
  { key: "clientes", label: "Clientes", icon: Users, page: "/admin/clientes" },
  { key: "pedidos", label: "Pedidos", icon: ShoppingCart, page: "/admin/pedidos" },
  { key: "facturas", label: "Facturas", icon: FileText, page: "/admin/facturas" },
  { key: "productos", label: "Productos", icon: Package, page: "/admin/productos" },
  { key: "prospectos", label: "Prospectos", icon: UserPlus, page: "/admin/prospectos" },
];

/** Caja de búsqueda general del encabezado + paleta (⌘K / Ctrl+K / "/"). */
export function AdminGlobalSearch({ groups }: { groups: NavGroup[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const navigate = useNavigate();
  const search = useServerFn(globalSearchFn);
  const { canAccess, permissive, loading } = usePermissions();
  const debounced = useDebounced(q.trim(), 250);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (
        e.key === "/" &&
        !(e.target as HTMLElement | null)?.closest("input,textarea,select,[contenteditable=true]")
      ) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    if (open) setRecent(readRecent());
    else setQ("");
  }, [open]);

  const enabled = open && debounced.length >= 2;
  const { data, isFetching, isError } = useQuery({
    queryKey: ["admin-global-search", debounced],
    queryFn: () => search({ data: { q: debounced, limit: 5 } }),
    enabled,
    staleTime: 30_000,
  });

  const pages = useMemo(() => flattenNav(groups), [groups]);
  const t = norm(q.trim());
  const pageHits = useMemo(() => {
    if (!t) return pages.slice(0, 8);
    return pages.filter((p) => norm(`${p.label} ${p.group}`).includes(t)).slice(0, 8);
  }, [pages, t]);

  const allow = (page: string) => permissive || loading || canAccess(page);
  const recordGroups = enabled && data
    ? RECORD_GROUPS.filter((g) => allow(g.page) && data[g.key].length > 0)
    : [];

  const go = (url: string) => {
    saveRecent(q);
    setOpen(false);
    navigate({ to: url });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buscar en toda la app"
        className={cn(
          "group flex h-9 w-full min-w-0 items-center gap-2 rounded-lg border border-sidebar-border bg-background/70 px-2.5 text-left text-sm text-muted-foreground shadow-xs transition-colors",
          "hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="hidden min-w-0 flex-1 truncate sm:inline">
          Buscar clientes, pedidos, facturas, productos…
        </span>
        <kbd className="ml-auto hidden shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground md:inline">
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
        <CommandInput
          placeholder="Busca un cliente, folio de pedido o factura, producto o página…"
          value={q}
          onValueChange={setQ}
        />
        <CommandList className="max-h-[min(70vh,520px)]">
          {!t && recent.length > 0 && (
            <>
              <CommandGroup heading="Búsquedas recientes">
                {recent.map((r) => (
                  <CommandItem key={`r-${r}`} value={`recent-${r}`} onSelect={() => setQ(r)}>
                    <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                    {r}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}

          {recordGroups.map((g) => (
            <CommandGroup key={g.key} heading={g.label}>
              {data![g.key].map((hit) => (
                <CommandItem key={`${g.key}-${hit.id}`} value={`${g.key}-${hit.id}`} onSelect={() => go(hit.url)}>
                  <g.icon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">
                      <Highlight text={hit.title} query={q} />
                    </div>
                    {hit.subtitle && (
                      <div className="truncate text-xs text-muted-foreground">
                        <Highlight text={hit.subtitle} query={q} />
                      </div>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}

          {pageHits.length > 0 && (
            <CommandGroup heading="Páginas">
              {pageHits.map((p) => (
                <CommandItem key={`p-${p.key}`} value={`page-${p.key}`} onSelect={() => go(p.url)}>
                  <img
                    src={p.icon}
                    alt=""
                    aria-hidden="true"
                    className="mr-2 h-4 w-4 shrink-0 object-contain mix-blend-multiply"
                  />
                  <span className="truncate">
                    <Highlight text={p.label} query={q} />
                  </span>
                  <span className="ml-auto pl-2 text-[11px] text-muted-foreground">{p.group}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {enabled && isFetching && (
            <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando registros…
            </div>
          )}
          {enabled && isError && (
            <div className="px-4 py-3 text-xs text-destructive">
              No se pudo buscar en los registros. Intenta de nuevo.
            </div>
          )}
          {t.length === 1 && (
            <div className="px-4 py-2 text-xs text-muted-foreground">
              Escribe al menos 2 letras para buscar registros.
            </div>
          )}
          {!isFetching && pageHits.length === 0 && recordGroups.length === 0 && t.length >= 2 && (
            <CommandEmpty>Sin resultados para “{q.trim()}”.</CommandEmpty>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
