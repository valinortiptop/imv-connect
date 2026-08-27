// Resumen de las rutas realizadas en un día y la eficiencia de cada representante.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDailyRoutesSummaryFn } from "@/lib/rep.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Route, Clock, MapPin, Zap, ChevronRight } from "lucide-react";
import RouteDetailsDialog from "./RouteDetailsDialog";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const hhmm = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "—";

function effColor(e: number | null) {
  if (e == null) return "text-muted-foreground";
  if (e >= 90) return "text-emerald-600";
  if (e >= 60) return "text-amber-600";
  return "text-red-600";
}

export default function DailyRoutesSummary() {
  const [fecha, setFecha] = useState(todayISO());
  const [openRouteId, setOpenRouteId] = useState<string | null>(null);
  const fetchSummary = useServerFn(getDailyRoutesSummaryFn);
  const { data, isLoading, error } = useQuery({
    queryKey: ["daily-routes-summary", fecha],
    queryFn: () => fetchSummary({ data: { fecha } }),
  });

  const totals = data?.totals;

  return (
    <Card>
      <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 pb-3">
        <CardTitle className="flex min-w-0 items-center gap-2 text-base">
          <Route className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate">Rutas del día</span>
        </CardTitle>
        <Input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="h-9 w-[9.5rem] shrink-0"
        />
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
        {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}

        {!isLoading && totals && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                { label: "Paradas planeadas", value: totals.planned },
                { label: "Visitadas", value: totals.planned_done },
                { label: "Visitas totales", value: totals.visits },
                { label: "Fuera de ruta", value: totals.unplanned },
                {
                  label: "Eficiencia global",
                  value: totals.efficiency == null ? "—" : `${totals.efficiency}%`,
                  accent: effColor(totals.efficiency),
                },
              ].map((k) => (
                <div key={k.label} className="rounded-md border p-2.5">
                  <p className="text-[11px] text-muted-foreground">{k.label}</p>
                  <p className={`text-xl font-semibold tabular-nums ${k.accent ?? ""}`}>{k.value}</p>
                </div>
              ))}
            </div>

            {(data?.reps ?? []).length === 0 && (
              <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                Sin rutas ni visitas registradas ese día.
              </p>
            )}

            <div className="space-y-3">
              {(data?.reps ?? []).map((r: any) => (
                <div
                  key={r.representante_id}
                  role={r.routes.length ? "button" : undefined}
                  tabIndex={r.routes.length ? 0 : undefined}
                  onClick={() => r.routes[0] && setOpenRouteId(r.routes[0].id)}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === " ") && r.routes[0]) {
                      e.preventDefault();
                      setOpenRouteId(r.routes[0].id);
                    }
                  }}
                  className={`rounded-lg border p-3 ${
                    r.routes.length ? "cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/40" : ""
                  }`}
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1 truncate font-medium">
                        {r.nombre}
                        {r.routes.length > 0 && (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {r.planned_done}/{r.planned} paradas · {r.visits} visitas · {r.unplanned} fuera de ruta
                        {r.avg_min != null ? ` · ${r.avg_min} min prom.` : ""}
                        {r.open > 0 ? ` · ${r.open} sin cerrar` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-lg font-bold tabular-nums ${effColor(r.efficiency)}`}>
                        {r.efficiency == null ? "—" : `${r.efficiency}%`}
                      </p>
                      <p className="text-[10px] text-muted-foreground">eficiencia</p>
                    </div>
                  </div>

                  {r.efficiency != null && <Progress value={r.efficiency} className="mt-2 h-1.5" />}

                  {r.routes.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {r.routes.map((rt: any) => (
                        <button
                          key={rt.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenRouteId(rt.id);
                          }}
                          className="max-w-full"
                          title="Ver ruta planeada"
                        >
                          <Badge
                            variant="secondary"
                            className="max-w-full truncate font-normal hover:bg-primary hover:text-primary-foreground"
                          >
                            <MapPin className="mr-1 h-3 w-3" />
                            {rt.nombre ?? "Ruta"} · {rt.stops} paradas
                            {rt.total_km ? ` · ${rt.total_km} km` : ""}
                          </Badge>
                        </button>
                      ))}
                    </div>
                  )}

                  {r.detalle.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {r.detalle.map((v: any) => (
                        <li
                          key={v.id}
                          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs"
                        >
                          <span className="min-w-0 truncate">
                            {v.cliente}
                            {v.unplanned && (
                              <Zap className="ml-1 inline h-3 w-3 text-amber-500" aria-label="fuera de ruta" />
                            )}
                          </span>
                          <span className="shrink-0 whitespace-nowrap text-muted-foreground tabular-nums">
                            <Clock className="mr-1 inline h-3 w-3" />
                            {hhmm(v.check_in_at)}
                            {v.check_out_at ? `–${hhmm(v.check_out_at)}` : " · en curso"}
                            {v.minutos != null ? ` (${v.minutos}m)` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
      <RouteDetailsDialog
        routeId={openRouteId}
        open={!!openRouteId}
        onOpenChange={(v) => !v && setOpenRouteId(null)}
      />
    </Card>
  );
}
