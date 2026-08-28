// @ts-nocheck
// Wizard modal to create a new route: pick a date, get smart suggestions based on
// past routes for that weekday, duplicate a past route, and select clients.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listSavedRoutesFn } from "@/lib/rep.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Sparkles, Copy, CalendarDays, Users, ChevronRight } from "lucide-react";
import { toast } from "sonner";


const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const CDMX_ALCALDIAS = [
  "ALVARO OBREGON",
  "AZCAPOTZALCO",
  "BENITO JUAREZ",
  "COYOACAN",
  "CUAJIMALPA",
  "CUAUHTEMOC",
  "GUSTAVO A. MADERO",
  "GUSTAVO A MADERO",
  "IZTACALCO",
  "IZTAPALAPA",
  "LA MAGDALENA CONTRERAS",
  "MAGDALENA CONTRERAS",
  "MIGUEL HIDALGO",
  "MILPA ALTA",
  "TLALPAN",
  "TLAHUAC",
  "VENUSTIANO CARRANZA",
  "XOCHIMILCO",
];

function normalizeAddr(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function extractAlcaldia(direccion: string | null | undefined): string | null {
  if (!direccion) return null;
  const norm = normalizeAddr(direccion);
  // Prefer the municipality/alcaldía token that sits right before the 5-digit CP
  // (standard Mexican address format: ... , COLONIA, ALCALDIA CP, STATE).
  const m = norm.match(/,\s*([^,]+?)\s+\d{5}\b/);
  if (m) {
    const raw = normalizeAddr(m[1]);
    if (raw.length > 2 && raw.length < 60) {
      // Normalize to a known CDMX alcaldía name when possible.
      const known = CDMX_ALCALDIAS.find((a) => raw.includes(a.replace(/\./g, "")));
      return known ? known : raw;
    }
  }
  // Fallback: look for any known alcaldía substring anywhere in the address.
  for (const a of CDMX_ALCALDIAS) {
    if (norm.includes(a.replace(/\./g, ""))) return a;
  }
  return null;
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const re = new RegExp(`(${escapeRegExp(q)})`, "ig");
  const parts = String(text ?? "").split(re);
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} className="rounded-sm bg-yellow-200 px-0.5 text-foreground dark:bg-yellow-500/40">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}


function weekdayOf(fecha: string) {
  if (!fecha) return null;
  const d = new Date(fecha + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d.getDay();
}

export default function NewRouteWizardDialog({
  open,
  onOpenChange,
  clients,
  initialFecha,
  reps = [],
  isAdmin = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clients: any[];
  initialFecha?: string;
  reps?: { id: string; nombre: string; activo?: boolean | null }[];
  isAdmin?: boolean;
  onConfirm: (payload: {
    fecha: string;
    clientIds: string[];
    optimize: boolean;
    assignedRepId: string | null;
    officeMotivo?: string | null;
  }) => void;
}) {
  const listSaved = useServerFn(listSavedRoutesFn);
  const savedQ = useQuery({
    queryKey: ["rep-saved-routes-wizard"],
    queryFn: () => listSaved({ data: { limit: 80 } }),
    enabled: open,
  });

  const [fecha, setFecha] = useState<string>(
    initialFecha || new Date().toISOString().slice(0, 10),
  );
  const [query, setQuery] = useState("");
  const [alcaldiaFilter, setAlcaldiaFilter] = useState<string>("all");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [assignedRepId, setAssignedRepId] = useState<string>("__self__");
  const [officeMotivo, setOfficeMotivo] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFecha(initialFecha || new Date().toISOString().slice(0, 10));
      setQuery("");
      setAlcaldiaFilter("all");
      setSel(new Set());
      setAssignedRepId("__self__");
      setOfficeMotivo(null);
    }
  }, [open, initialFecha]);



  const dow = weekdayOf(fecha);
  const dowLabel = dow === null ? "" : WEEKDAYS[dow];

  const routes = savedQ.data?.routes ?? [];

  // Smart suggestions: past routes saved for the same weekday, most recent first.
  const suggestions = useMemo(() => {
    if (dow === null) return [];
    return routes
      .filter((r: any) => r.fecha && weekdayOf(String(r.fecha).slice(0, 10)) === dow)
      .slice(0, 4);
  }, [routes, dow]);

  // Most frequent clients on that weekday
  const frequentOnDow = useMemo(() => {
    if (dow === null) return [];
    const counts = new Map<string, { id: string; nombre: string; n: number }>();
    for (const r of routes) {
      if (!r.fecha || weekdayOf(String(r.fecha).slice(0, 10)) !== dow) continue;
      for (const s of r.ordered_stops ?? []) {
        const id = String(s?.cliente_id ?? "");
        if (!id) continue;
        const prev = counts.get(id);
        counts.set(id, {
          id,
          nombre: s?.nombre ?? prev?.nombre ?? "Cliente",
          n: (prev?.n ?? 0) + 1,
        });
      }
    }
    return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 8);
  }, [routes, dow]);

  const alcaldias = useMemo(() => {
    const set = new Set<string>();
    for (const c of clients) {
      const a = extractAlcaldia(c.direccion);
      if (a) set.add(a);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [clients]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = clients.filter((c: any) => c.lat && c.lng);
    if (alcaldiaFilter && alcaldiaFilter !== "all") {
      list = list.filter((c: any) => extractAlcaldia(c.direccion) === alcaldiaFilter);
    }
    if (!q) return list;
    return list.filter((c: any) =>
      [c.nombre_comercial, c.razon_social, c.nickname, c.direccion, c.codigo_postal, c.rfc]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [clients, query, alcaldiaFilter]);


  const toggle = (id: string) =>
    setSel((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const applyRoute = (r: any) => {
    const ids = (r.ordered_stops ?? []).map((s: any) => String(s.cliente_id)).filter(Boolean);
    if (ids.length === 0) {
      toast.error("Esa ruta no tiene paradas");
      return;
    }
    setSel(new Set(ids));
    toast.success(`${ids.length} clientes cargados de "${r.nombre ?? "ruta"}"`);
  };

  const confirm = (optimize: boolean) => {
    if (!fecha) return toast.error("Selecciona la fecha de la ruta");
    if (sel.size < 2) return toast.error("Selecciona al menos 2 clientes");
    onConfirm({
      fecha,
      clientIds: [...sel],
      optimize,
      assignedRepId: isAdmin && assignedRepId !== "__self__" ? assignedRepId : null,
    });
    onOpenChange(false);
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Layout: encabezado fijo, cuerpo con scroll vertical y footer pegado.
          `w-[calc(100vw-1.5rem)]` evita el desborde horizontal en móvil. */}
      <DialogContent className="grid max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:w-full">
        <DialogHeader className="border-b px-4 py-3 pr-12 text-left sm:px-6 sm:py-4">
          <DialogTitle className="text-base sm:text-lg">Nueva ruta</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Elige la fecha, aprovecha las sugerencias y selecciona tus clientes.
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-3 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-4 sm:px-6">
          {/* Step 1 — date */}
          <section className="rounded-lg border p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <CalendarDays className="h-4 w-4 text-primary" /> 1. Fecha de la ruta
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="h-10 w-full max-w-[11rem]"
              />
              {dowLabel && <Badge variant="secondary" className="capitalize">{dowLabel}</Badge>}
            </div>
          </section>

          {/* Admin only — assign the route to a representative */}
          {isAdmin && (
            <section className="rounded-lg border p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4 text-primary" /> Asignar a representante
              </div>
              <Select value={assignedRepId} onValueChange={setAssignedRepId}>
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue placeholder="Selecciona representante" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__self__">Para mí (sin asignar)</SelectItem>
                  {reps.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.nombre}
                      {r.activo === false ? " (inactivo)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                La ruta aparecerá en el panel del representante seleccionado.
              </p>
            </section>
          )}


          {/* Step 2 — smart suggestions */}
          <section className="rounded-lg border p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" /> 2. Sugerencias inteligentes
            </div>
            {savedQ.isLoading ? (
              <p className="text-xs text-muted-foreground">Analizando tu historial…</p>
            ) : suggestions.length === 0 && frequentOnDow.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Aún no tenemos historial de rutas en {dowLabel || "este día"}. Selecciona los clientes manualmente y la próxima vez te sugeriremos esta ruta.
              </p>
            ) : (
              <div className="space-y-3">
                {suggestions.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs text-muted-foreground">
                      Normalmente los <span className="font-medium capitalize">{dowLabel}</span> haces estas rutas:
                    </p>
                    <div className="space-y-1.5">
                      {suggestions.map((r: any) => (
                        <button
                          key={r.id}
                          onClick={() => applyRoute(r)}
                          className="flex w-full min-w-0 items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm hover:bg-muted active:bg-muted"
                        >
                          <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">
                              {r.nombre ?? `Ruta ${String(r.fecha).slice(0, 10)}`}
                            </span>
                            <span className="block text-[11px] text-muted-foreground tabular-nums">
                              {String(r.fecha).slice(0, 10)} · {(r.ordered_stops ?? []).length} paradas
                              {r.total_km ? ` · ${r.total_km} km` : ""}
                            </span>
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {frequentOnDow.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs text-muted-foreground">
                      Clientes que visitas seguido en {dowLabel}:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {frequentOnDow.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => toggle(c.id)}
                          className={`max-w-full truncate rounded-full border px-2.5 py-1.5 text-[11px] ${
                            sel.has(c.id)
                              ? "border-primary bg-primary/10 text-primary"
                              : "hover:bg-muted"
                          }`}
                        >
                          {c.nombre} · {c.n}×
                        </button>
                      ))}
                      <button
                        onClick={() =>
                          setSel((prev) => {
                            const n = new Set(prev);
                            frequentOnDow.forEach((c) => n.add(c.id));
                            return n;
                          })
                        }
                        className="rounded-full border border-dashed px-2.5 py-1 text-[11px] hover:bg-muted"
                      >
                        Agregar todos
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Step 3 — clients */}
          <section className="rounded-lg border p-3">
            <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4 shrink-0 text-primary" />
                <span className="truncate">3. Clientes</span>
              </div>
              <Badge variant="outline" className="shrink-0 whitespace-nowrap">
                {sel.size} sel.
              </Badge>
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setQuery("")}
                placeholder="Buscar por nombre o dirección…"
                className="h-10 pl-7 text-sm"
              />
            </div>
            {alcaldias.length > 0 && (
              <div className="mb-2">
                <Select value={alcaldiaFilter} onValueChange={setAlcaldiaFilter}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Filtrar por alcaldía / municipio" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las alcaldías</SelectItem>
                    {alcaldias.map((a) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{filtered.length} resultados</span>
              <div className="flex gap-2">
                <button
                  className="hover:underline"
                  onClick={() =>
                    setSel((prev) => {
                      const n = new Set(prev);
                      filtered.slice(0, 200).forEach((c: any) => n.add(c.id));
                      return n;
                    })
                  }
                >
                  Todos
                </button>
                <button className="hover:underline" onClick={() => setSel(new Set())}>
                  Ninguno
                </button>
              </div>
            </div>
            <ScrollArea className="h-56 rounded-md border sm:h-64">
              {filtered.slice(0, 200).map((c: any) => {
                const name = c.nombre_comercial ?? c.razon_social ?? "";
                return (
                  <label
                    key={c.id}
                    className="flex min-w-0 cursor-pointer items-start gap-2 px-3 py-2.5 text-sm hover:bg-muted active:bg-muted"
                  >
                    <Checkbox
                      checked={sel.has(c.id)}
                      onCheckedChange={() => toggle(c.id)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-medium">
                        <Highlight text={name} query={query} />
                      </span>
                      {c.direccion && (
                        <span className="mt-0.5 line-clamp-2 block break-words text-[11px] text-muted-foreground">
                          <Highlight text={c.direccion} query={query} />
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
              {filtered.length === 0 && (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  Sin coincidencias.
                </div>
              )}
            </ScrollArea>
          </section>
        </div>

        <DialogFooter className="gap-2 border-t bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          <Button variant="ghost" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => confirm(false)}>
            Solo seleccionar
          </Button>
          <Button className="w-full sm:w-auto" onClick={() => confirm(true)}>
            <Sparkles className="mr-1 h-4 w-4" /> Crear y optimizar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
