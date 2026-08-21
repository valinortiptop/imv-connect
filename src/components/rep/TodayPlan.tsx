import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  buildWeeklyPlanFn,
  getMyClientsFn,
  listMyVisitsFn,
  listSavedRoutesFn,
} from "@/lib/rep.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, CheckCircle2, ClipboardList, Navigation, Plus, Search } from "lucide-react";
import { Link } from "@tanstack/react-router";
import CheckInDialog from "./CheckInDialog";
import { cn } from "@/lib/utils";

const DAY_KEYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

const priorityColor: Record<string, string> = {
  urgente: "bg-red-500/15 text-red-600 border-red-500/30",
  oportunidad: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  seguimiento: "bg-blue-500/15 text-blue-600 border-blue-500/30",
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function TodayPlan() {
  const buildWeek = useServerFn(buildWeeklyPlanFn);
  const listVisits = useServerFn(listMyVisitsFn);
  const listSaved = useServerFn(listSavedRoutesFn);

  const weekQ = useQuery({
    queryKey: ["rep-week-plan"],
    queryFn: () => buildWeek({ data: { maxPerDay: 8 } }),
  });
  const visitsQ = useQuery({
    queryKey: ["rep-visits"],
    queryFn: () => listVisits({ data: { limit: 100 } }),
  });
  const savedQ = useQuery({
    queryKey: ["rep-saved-routes"],
    queryFn: () => listSaved({ data: { limit: 60 } }),
  });

  const todayKey = DAY_KEYS[new Date().getDay()];
  const iso = todayISO();

  // Saved routes for today take precedence — the rep explicitly planned them.
  const today = useMemo(() => {
    const savedToday = (savedQ.data?.routes ?? []).filter(
      (r: any) => String(r.fecha) === iso,
    );
    const weekToday =
      weekQ.data?.week?.find((d: any) => d.dia === todayKey) ?? null;

    if (savedToday.length > 0) {
      const seen = new Set<string>();
      const clientes: any[] = [];
      for (const r of savedToday) {
        for (const s of (r.ordered_stops as any[]) ?? []) {
          const id = String(s.cliente_id ?? "");
          if (!id || seen.has(id)) continue;
          seen.add(id);
          clientes.push({
            cliente_id: id,
            nombre: s.nombre ?? "Cliente",
            razon: r.nombre ? `Ruta guardada · ${r.nombre}` : "Ruta guardada",
            prioridad: null,
          });
        }
      }
      return {
        dia: todayKey,
        zona_principal: weekToday?.zona_principal ?? null,
        clientes,
      };
    }

    if (weekToday) return weekToday;
    return weekQ.data?.week?.find((d: any) => d.clientes.length > 0) ?? null;
  }, [weekQ.data, savedQ.data, todayKey, iso]);

  // Which planned clients already have a check-in today
  const visitedToday = useMemo(() => {
    const set = new Set<string>();
    const now = new Date();
    (visitsQ.data?.visits ?? []).forEach((v: any) => {
      const d = new Date(v.check_in_at);
      if (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      ) {
        set.add(v.cliente_id);
      }
    });
    return set;
  }, [visitsQ.data]);

  // Visitas con check-in pero sin check-out (en curso)
  const openByClient = useMemo(() => {
    const map = new Map<string, string>();
    (visitsQ.data?.visits ?? []).forEach((v: any) => {
      if (!v.check_out_at && !map.has(v.cliente_id)) map.set(v.cliente_id, v.check_in_at);
    });
    return map;
  }, [visitsQ.data]);


  const [target, setTarget] = useState<{ id: string; nombre: string; unplanned?: boolean } | null>(null);

  /* ─── Visita fuera de ruta: cliente ajeno al plan del día ─── */
  const listClients = useServerFn(getMyClientsFn);
  const [offRouteOpen, setOffRouteOpen] = useState(false);
  const [offQuery, setOffQuery] = useState("");
  const clientsQ = useQuery({
    queryKey: ["rep-my-clients-offroute"],
    queryFn: () => listClients({ data: {} } as any),
    enabled: offRouteOpen,
    staleTime: 5 * 60_000,
  });
  const plannedIds = useMemo(
    () => new Set((today?.clientes ?? []).map((c: any) => String(c.cliente_id))),
    [today],
  );
  const offRouteResults = useMemo(() => {
    const q = offQuery.trim().toLowerCase();
    const all = (clientsQ.data?.clients ?? []) as any[];
    const base = all.filter((c) => !plannedIds.has(String(c.id)));
    if (!q) return base.slice(0, 60);
    return base
      .filter((c) =>
        [c.nombre_comercial, c.razon_social, c.nickname, c.direccion, c.rfc]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 60);
  }, [clientsQ.data, offQuery, plannedIds]);

  const todayLabel = new Date().toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 text-primary" />
              Ruta de hoy
            </CardTitle>
            <p className="mt-0.5 text-xs capitalize text-muted-foreground">
              {todayLabel}
              {today?.zona_principal ? ` · ${today.zona_principal}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOffRouteOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Visita fuera de ruta
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/rep/ruta">
                <Navigation className="mr-1 h-3.5 w-3.5" /> Ver mapa
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {weekQ.isLoading && <Skeleton className="h-32 w-full" />}
          {!weekQ.isLoading && (!today || today.clientes.length === 0) && (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No hay clientes planeados para hoy.
              <div className="mt-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/rep/plan">Ver plan semanal</Link>
                </Button>
              </div>
            </div>
          )}
          {today && today.clientes.length > 0 && (
            <ol className="space-y-2">
              {today.clientes.map((c: any, i: number) => {
                const done = visitedToday.has(c.cliente_id);
                const openAt = openByClient.get(c.cliente_id);
                return (
                  <li
                    key={c.cliente_id}
                    className={cn(
                      "flex items-start gap-3 rounded-md border p-2.5",
                      done && "bg-emerald-500/5 border-emerald-500/30",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold",
                        done
                          ? "bg-emerald-500 text-white"
                          : "bg-primary text-primary-foreground",
                      )}
                    >
                      {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Link
                          to="/rep/clientes/$id"
                          params={{ id: c.cliente_id }}
                          className="min-w-0 truncate text-sm font-medium hover:underline"
                        >
                          {c.nombre}
                        </Link>
                        {c.prioridad && (
                          <Badge
                            variant="outline"
                            className={cn(
                              "px-1.5 py-0 text-[10px]",
                              priorityColor[c.prioridad] ?? "",
                            )}
                          >
                            {c.prioridad}
                          </Badge>
                        )}
                      </div>
                      {c.razon && (
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                          {c.razon}
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant={openAt ? "default" : done ? "outline" : "default"}
                      className="shrink-0"
                      onClick={() =>
                        setTarget({ id: c.cliente_id, nombre: c.nombre })
                      }
                    >
                      <MapPin className="mr-1 h-3.5 w-3.5" />
                      {openAt ? "Check-out" : done ? "Otra visita" : "Check-in"}
                    </Button>
                  </li>
                );
              })}
            </ol>
          )}
          {today && today.clientes.length > 0 && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              Al registrar la visita se solicitará tu ubicación y podrás subir
              fotos, documentos y notas.
            </p>
          )}
        </CardContent>
      </Card>

      {target && (
        <CheckInDialog
          open={!!target}
          onOpenChange={(v) => !v && setTarget(null)}
          clienteId={target.id}
          clienteNombre={target.nombre}
          unplanned={target.unplanned}
        />
      )}

      {/* Selector de cliente para visitas improvisadas */}
      <Dialog open={offRouteOpen} onOpenChange={setOffRouteOpen}>
        <DialogContent className="max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-lg overflow-hidden p-0 sm:w-full">
          <DialogHeader className="border-b px-4 py-3 pr-12 text-left sm:px-6">
            <DialogTitle className="text-base">Visita fuera de ruta</DialogTitle>
            <DialogDescription className="text-xs">
              Elige el cliente que visitarás hoy sin estar en el plan. Se registrará ubicación,
              fotos y notas igual que una visita planeada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 px-4 py-3 sm:px-6">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={offQuery}
                onChange={(e) => setOffQuery(e.target.value)}
                placeholder="Buscar cliente…"
                className="h-10 pl-7"
              />
            </div>
            <div className="max-h-[50dvh] overflow-y-auto overscroll-contain rounded-md border">
              {clientsQ.isLoading && (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">Cargando clientes…</p>
              )}
              {!clientsQ.isLoading && offRouteResults.length === 0 && (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">Sin coincidencias.</p>
              )}
              {offRouteResults.map((c: any) => (
                <button
                  key={c.id}
                  className="flex w-full min-w-0 flex-col items-start gap-0.5 border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-muted active:bg-muted"
                  onClick={() => {
                    setOffRouteOpen(false);
                    setTarget({
                      id: c.id,
                      nombre: c.nombre_comercial ?? c.razon_social ?? "Cliente",
                      unplanned: true,
                    });
                  }}
                >
                  <span className="break-words text-sm font-medium">
                    {c.nombre_comercial ?? c.razon_social ?? "Cliente"}
                  </span>
                  {c.direccion && (
                    <span className="line-clamp-2 break-words text-[11px] text-muted-foreground">
                      {c.direccion}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
