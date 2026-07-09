import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { buildWeeklyPlanFn, detectOverVisitedFn } from "@/lib/rep.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, AlertOctagon, Phone } from "lucide-react";
import AIPageInsights from "@/components/ai/AIPageInsights";

export const Route = createFileRoute("/rep/plan")({
  head: () => ({ meta: [{ title: "Plan semanal · Panel Rep" }] }),
  component: WeeklyPlanRoute,
});

const priorityColor: Record<string, string> = {
  urgente: "bg-red-500/15 text-red-600 border-red-500/30",
  oportunidad: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  seguimiento: "bg-blue-500/15 text-blue-600 border-blue-500/30",
};

function WeeklyPlanRoute() {
  const buildWeek = useServerFn(buildWeeklyPlanFn);
  const detectOver = useServerFn(detectOverVisitedFn);

  const weekQ = useQuery({
    queryKey: ["rep-week-plan"],
    queryFn: () => buildWeek({ data: { maxPerDay: 8 } }),
  });
  const overQ = useQuery({ queryKey: ["rep-over-visited"], queryFn: () => detectOver() });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Plan semanal</h1>
        <p className="text-sm text-muted-foreground">
          Distribución balanceada por zona con prioridad por riesgo y valor
        </p>
      </div>

      <AIPageInsights module="rep-plan" />


      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <CalendarDays className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Ruta sugerida lunes a viernes</CardTitle>
        </CardHeader>
        <CardContent>
          {weekQ.isLoading && <Skeleton className="h-40 w-full" />}
          {weekQ.data && (
            <div className="grid gap-3 md:grid-cols-5">
              {weekQ.data.week.map((d: any) => (
                <div
                  key={d.dia}
                  className="rounded-lg border border-border bg-card p-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold capitalize">{d.dia}</span>
                    {d.zona_principal && (
                      <span className="text-[10px] text-muted-foreground">
                        {d.zona_principal}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {d.clientes.length === 0 && (
                      <p className="text-xs text-muted-foreground">Sin visitas</p>
                    )}
                    {d.clientes.map((c: any) => (
                      <Link
                        key={c.cliente_id}
                        to="/rep/clientes/$id"
                        params={{ id: c.cliente_id }}
                        className="block rounded-md border border-border/60 p-2 text-xs hover:bg-muted/40"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate font-medium">{c.nombre}</span>
                          <Badge
                            variant="outline"
                            className={`shrink-0 px-1 py-0 text-[9px] ${priorityColor[c.prioridad] ?? ""}`}
                          >
                            {c.prioridad}
                          </Badge>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">
                          {c.razon}
                        </p>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <AlertOctagon className="h-5 w-5 text-amber-500" />
          <CardTitle className="text-base">Clientes sobre-visitados sin resultado</CardTitle>
        </CardHeader>
        <CardContent>
          {overQ.isLoading && <Skeleton className="h-24 w-full" />}
          {overQ.data && overQ.data.clients.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Ningún cliente con más de 3 visitas sin pedido en 60 días. Buen trabajo.
            </p>
          )}
          {overQ.data && overQ.data.clients.length > 0 && (
            <div className="space-y-2">
              {overQ.data.clients.map((c: any) => (
                <div
                  key={c.cliente_id}
                  className="flex items-start justify-between gap-3 rounded-md border border-border p-3"
                >
                  <Link
                    to="/rep/clientes/$id"
                    params={{ id: c.cliente_id }}
                    className="min-w-0 flex-1"
                  >
                    <div className="truncate text-sm font-medium hover:underline">{c.nombre}</div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {c.visits} visitas sin pedido · última: {new Date(c.last).toLocaleDateString("es-MX")}
                      {c.zona ? ` · ${c.zona}` : ""}
                    </p>
                  </Link>
                  {c.telefono && (
                    <a
                      href={`tel:${c.telefono}`}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <Phone className="h-3 w-3" /> {c.telefono}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
