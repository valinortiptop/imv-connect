import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { buildDailyPlanFn, getMyClientsFn } from "@/lib/rep.functions";
import { useRepContext } from "./RepLayout";
import LabRiskPanel from "./LabRiskPanel";
import ReorderPredictions from "./ReorderPredictions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Users, TrendingUp, MapPin, Sparkles, FlaskConical, ArrowRight } from "lucide-react";

const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

const priorityColor: Record<string, string> = {
  urgente: "bg-red-500/15 text-red-600 border-red-500/30",
  oportunidad: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  seguimiento: "bg-blue-500/15 text-blue-600 border-blue-500/30",
};

export default function RepDashboard() {
  const { geo } = useRepContext();
  const fetchClients = useServerFn(getMyClientsFn);
  const buildPlan = useServerFn(buildDailyPlanFn);

  const clientsQ = useQuery({ queryKey: ["rep-clients"], queryFn: () => fetchClients() });
  const planQ = useQuery({
    queryKey: ["rep-daily-plan", geo?.lat, geo?.lng],
    queryFn: () =>
      buildPlan({
        data: geo ? { startLat: geo.lat, startLng: geo.lng } : {},
      }),
  });

  const clientMap = useMemo(
    () => new Map((clientsQ.data?.clients ?? []).map((c: any) => [c.id, c])),
    [clientsQ.data],
  );

  const stats = useMemo(() => {
    const cs = clientsQ.data?.clients ?? [];
    const total12m = cs.reduce((a: number, c: any) => a + (c.total_12m ?? 0), 0);
    const active30 = cs.filter((c: any) => (c.days_since_last ?? 999) <= 30).length;
    const atRisk = cs.filter((c: any) => (c.churn_risk_score ?? 0) >= 0.6).length;
    return {
      total: cs.length,
      total12m,
      active30,
      atRisk,
    };
  }, [clientsQ.data]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold md:text-2xl">Hola{clientsQ.data?.rep ? `, ${clientsQ.data.rep.nombre.split(" ")[0]}` : ""}</h1>
        <p className="text-sm text-muted-foreground">Tu asistente comercial IA para el día</p>
      </div>

      {/* Mobile: horizontal scroll rail. Desktop: 4-col grid */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0 md:pb-0 [&>*]:snap-start">
        <StatCard icon={Users} label="Mis clientes" value={String(stats.total)} />
        <StatCard icon={TrendingUp} label="Ventas 12m" value={fmtMXN(stats.total12m)} />
        <StatCard icon={MapPin} label="Activos 30d" value={String(stats.active30)} />
        <StatCard icon={AlertTriangle} label="Riesgo pérdida" value={String(stats.atRisk)} tone="warn" />
      </div>

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Plan sugerido por IA</CardTitle>
        </CardHeader>
        <CardContent>
          {planQ.isLoading && <Skeleton className="h-32 w-full" />}
          {planQ.isError && (
            <p className="text-sm text-muted-foreground">
              No se pudo generar el plan. Intenta refrescar.
            </p>
          )}
          {planQ.data && (
            <div className="space-y-2">
              {planQ.data.plan.length === 0 && (
                <p className="text-sm text-muted-foreground">Sin sugerencias por ahora.</p>
              )}
              {planQ.data.plan.map((p: any, i: number) => {
                const c = clientMap.get(p.cliente_id) as any;
                return (
                  <Link
                    key={p.cliente_id + i}
                    to="/rep/clientes/$id"
                    params={{ id: p.cliente_id }}
                    className="flex items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/40"
                  >
                    <span className="text-lg font-bold text-muted-foreground">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">
                          {c?.nombre_comercial ?? c?.razon_social ?? "Cliente"}
                        </span>
                        <Badge variant="outline" className={priorityColor[p.prioridad] ?? ""}>
                          {p.prioridad}
                        </Badge>
                        {p.ventana_sugerida && (
                          <span className="text-[10px] text-muted-foreground">
                            {p.ventana_sugerida}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                        {p.razon}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <div className="flex min-w-0 items-center gap-2">
              <FlaskConical className="h-5 w-5 shrink-0 text-primary" />
              <CardTitle className="truncate text-base">Laboratorios en riesgo</CardTitle>
            </div>
            <Link
              to="/rep/laboratorios"
              className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
            >
              Ver todo <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>

          <CardContent>
            <LabRiskPanel maxLabs={3} compact />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Recompras próximas</CardTitle>
            </div>
            <Link
              to="/rep/laboratorios"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Ver todo <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            <ReorderPredictions withinDays={7} limit={5} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: any;
  label: string;
  value: string;
  tone?: "warn";
}) {
  return (
    <Card className="w-[70%] shrink-0 md:w-auto md:shrink">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Icon className={`h-4 w-4 shrink-0 ${tone === "warn" ? "text-amber-500" : "text-muted-foreground"}`} />
        </div>
        <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}
