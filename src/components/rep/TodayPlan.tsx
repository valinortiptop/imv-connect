import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  buildWeeklyPlanFn,
  listMyVisitsFn,
  listSavedRoutesFn,
} from "@/lib/rep.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, CheckCircle2, ClipboardList, Navigation } from "lucide-react";
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


  const [target, setTarget] = useState<{ id: string; nombre: string } | null>(null);

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
          <Button asChild variant="outline" size="sm">
            <Link to="/rep/ruta">
              <Navigation className="mr-1 h-3.5 w-3.5" /> Ver mapa
            </Link>
          </Button>
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
                      variant={done ? "outline" : "default"}
                      className="shrink-0"
                      onClick={() =>
                        setTarget({ id: c.cliente_id, nombre: c.nombre })
                      }
                    >
                      <MapPin className="mr-1 h-3.5 w-3.5" />
                      {done ? "Otra visita" : "Registrar"}
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
        />
      )}
    </>
  );
}
