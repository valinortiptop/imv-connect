import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  buildDailyPlanFn,
  getMyClientsFn,
  getDailyRoutesSummaryFn,
} from "@/lib/rep.functions";
import { getRepKpisFn, getGamificationFn } from "@/lib/rep-analytics.functions";
import { useRepContext } from "./RepLayout";
import LabRiskPanel from "./LabRiskPanel";
import ReorderPredictions from "./ReorderPredictions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  Users,
  TrendingUp,
  MapPin,
  Sparkles,
  FlaskConical,
  ArrowRight,
  Trophy,
  CheckCircle2,
  Target,
  Route as RouteIcon,
  ClipboardList,
  Handshake,
} from "lucide-react";

const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
    notation: n >= 100000 ? "compact" : "standard",
  }).format(n);

const priorityColor: Record<string, string> = {
  urgente: "bg-red-500/15 text-red-600 border-red-500/30",
  oportunidad: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  seguimiento: "bg-blue-500/15 text-blue-600 border-blue-500/30",
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

const longDate = () =>
  new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

/* ── Progress ring (no deps) ── */
function Ring({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div
      className="relative grid h-20 w-20 shrink-0 place-items-center rounded-full"
      style={{
        background: `conic-gradient(var(--color-primary) ${pct * 3.6}deg, color-mix(in oklab, var(--color-primary) 12%, transparent) 0deg)`,
      }}
      aria-label={`${label}: ${pct}%`}
    >
      <div className="grid h-[62px] w-[62px] place-items-center rounded-full bg-card">
        <span className="text-base font-bold tabular-nums">{pct}%</span>
      </div>
    </div>
  );
}

export default function RepDashboard() {
  const { geo, rep, isAdmin } = useRepContext();
  const fetchClients = useServerFn(getMyClientsFn);
  const buildPlan = useServerFn(buildDailyPlanFn);
  const fetchKpis = useServerFn(getRepKpisFn);
  const fetchGame = useServerFn(getGamificationFn);
  const fetchDaily = useServerFn(getDailyRoutesSummaryFn);

  const clientsQ = useQuery({ queryKey: ["rep-clients"], queryFn: () => fetchClients() });
  const planQ = useQuery({
    queryKey: ["rep-daily-plan", geo?.lat, geo?.lng],
    queryFn: () => buildPlan({ data: geo ? { startLat: geo.lat, startLng: geo.lng } : {} }),
  });
  const kpi7Q = useQuery({
    queryKey: ["rep-kpis-7"],
    queryFn: () => fetchKpis({ data: { days: 7 } }),
    retry: false,
  });
  const kpi30Q = useQuery({
    queryKey: ["rep-kpis-30"],
    queryFn: () => fetchKpis({ data: { days: 30 } }),
    retry: false,
  });
  const gameQ = useQuery({ queryKey: ["rep-gamification"], queryFn: () => fetchGame(), retry: false });
  const dailyQ = useQuery({
    queryKey: ["rep-daily-summary"],
    queryFn: () => fetchDaily({ data: {} }),
    retry: false,
  });

  const clientMap = useMemo(
    () => new Map((clientsQ.data?.clients ?? []).map((c: any) => [c.id, c])),
    [clientsQ.data],
  );

  const stats = useMemo(() => {
    const cs = clientsQ.data?.clients ?? [];
    return {
      total: cs.length,
      active30: cs.filter((c: any) => (c.days_since_last ?? 999) <= 30).length,
      atRisk: cs.filter((c: any) => (c.churn_risk_score ?? 0) >= 0.6).length,
      sinVisita: cs.filter((c: any) => c.days_since_last == null || c.days_since_last > 90).length,
    };
  }, [clientsQ.data]);

  // Progreso del día: visitas hechas vs paradas planeadas (mis rutas o del equipo)
  const today = useMemo(() => {
    const rows = (dailyQ.data?.byRep ?? []) as any[];
    const mine = rep && !isAdmin ? rows.filter((r) => r.representante_id === rep.id) : rows;
    const planned = mine.reduce(
      (a, r) => a + (r.planned_count ?? r.planned ?? (r.stops?.length ?? 0)),
      0,
    );
    const done = mine.reduce((a, r) => a + (r.visits?.length ?? r.visitas ?? 0), 0);
    return { planned, done, ratio: planned ? Math.min(1, done / planned) : 0, reps: rows.length };
  }, [dailyQ.data, rep, isAdmin]);

  const k7 = kpi7Q.data;
  const k30 = kpi30Q.data;
  const me = gameQ.data?.me;
  const firstName = clientsQ.data?.rep?.nombre?.split(" ")[0] ?? rep?.nombre?.split(" ")[0];

  return (
    <div className="space-y-5">
      {/* ── Hero ── */}
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card">
        <CardContent className="p-4 md:p-6">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
            <div className="min-w-0">
              <p className="text-xs capitalize text-muted-foreground">{longDate()}</p>
              <h1 className="truncate text-xl font-bold md:text-2xl">
                {greeting()}
                {firstName ? `, ${firstName}` : ""}
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {isAdmin
                  ? `Resumen del equipo · ${today.reps} representante${today.reps === 1 ? "" : "s"} en campo hoy`
                  : today.planned > 0
                    ? `${today.done} de ${today.planned} paradas completadas hoy`
                    : "Aún no tienes ruta para hoy. Crea una en un minuto."}
              </p>
            </div>
            <Ring value={today.ratio} label="Avance del día" />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to="/rep/ruta">
                <RouteIcon className="mr-2 h-4 w-4" /> Mi ruta
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/rep/visitas">
                <CheckCircle2 className="mr-2 h-4 w-4" /> Registrar visita
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/rep/cotizaciones">
                <ClipboardList className="mr-2 h-4 w-4" /> Nuevo pedido
              </Link>
            </Button>
            {isAdmin && (
              <Button asChild size="sm" variant="ghost">
                <Link to="/rep/supervisor">
                  Supervisión <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── KPIs semana ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric
          icon={MapPin}
          label="Visitas 7d"
          value={String(k7?.visitas ?? 0)}
          sub={`${k30?.visitas ?? 0} en 30d`}
        />
        <Metric
          icon={Handshake}
          label="Pedidos 7d"
          value={String(k7?.pedidos ?? 0)}
          sub={`Ticket ${fmtMXN(k7?.ticket_prom ?? 0)}`}
        />
        <Metric
          icon={Target}
          label="Conversión"
          value={`${Math.round((k7?.ratio ?? 0) * 100)}%`}
          sub="visita → pedido"
          bar={Math.min(1, k7?.ratio ?? 0)}
        />
        <Metric
          icon={TrendingUp}
          label="Ventas 7d"
          value={fmtMXN(k7?.ventas ?? 0)}
          sub={`${fmtMXN(k30?.ventas ?? 0)} en 30d`}
        />
      </div>

      {/* ── Cartera + Ranking ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" /> Mi cartera
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Mini label="Clientes" value={stats.total} tone="neutral" />
              <Mini label="Activos 30d" value={stats.active30} tone="good" />
              <Mini label="En riesgo" value={stats.atRisk} tone="warn" />
              <Mini label="Sin compra 90d" value={stats.sinVisita} tone="bad" />
            </div>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${stats.total ? (stats.active30 / stats.total) * 100 : 0}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {stats.total
                ? `${Math.round((stats.active30 / stats.total) * 100)}% de tu cartera compró en los últimos 30 días`
                : "Sin clientes asignados todavía"}
            </p>
            <Link
              to="/rep/clientes"
              className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Ver clientes <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4 text-amber-500" /> Ranking 30 días
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {me ? (
              <>
                <div className="flex items-end gap-3">
                  <span className="text-4xl font-black leading-none text-primary">#{me.rank}</span>
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">Puntos</div>
                    <div className="text-lg font-semibold tabular-nums">
                      {me.puntos.toLocaleString("es-MX")}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(gameQ.data?.badges ?? []).map((b: any) => (
                    <Badge
                      key={b.code}
                      variant={b.earned ? "default" : "outline"}
                      className={b.earned ? "" : "opacity-40"}
                    >
                      {b.label}
                    </Badge>
                  ))}
                </div>
              </>
            ) : (
              <div className="space-y-2 text-sm text-muted-foreground">
                {(gameQ.data?.ranking ?? []).slice(0, 5).map((r: any) => (
                  <div key={r.rep_id} className="flex items-center gap-2">
                    <span className="w-5 text-xs font-semibold text-muted-foreground">{r.rank}</span>
                    <span className="min-w-0 flex-1 truncate text-foreground">{r.nombre}</span>
                    <span className="tabular-nums text-xs">{r.puntos}</span>
                  </div>
                ))}
                {!gameQ.data?.ranking?.length && <p>Sin actividad registrada aún.</p>}
              </div>
            )}
            <Link
              to="/rep/coach"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Ver mi coach IA <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* ── Plan IA ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <div className="flex min-w-0 items-center gap-2">
            <Sparkles className="h-5 w-5 shrink-0 text-primary" />
            <CardTitle className="truncate text-base">Prioridades de hoy</CardTitle>
          </div>
          <Link
            to="/rep/plan"
            className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
          >
            Plan semanal <ArrowRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent>
          {planQ.isLoading && <Skeleton className="h-28 w-full" />}
          {planQ.isError && (
            <p className="text-sm text-muted-foreground">No se pudo generar el plan. Intenta refrescar.</p>
          )}
          {planQ.data && (
            <div className="space-y-2">
              {planQ.data.plan.length === 0 && (
                <p className="text-sm text-muted-foreground">Sin sugerencias por ahora.</p>
              )}
              {planQ.data.plan.slice(0, 5).map((p: any, i: number) => {
                const c = clientMap.get(p.cliente_id) as any;
                return (
                  <Link
                    key={p.cliente_id + i}
                    to="/rep/clientes/$id"
                    params={{ id: p.cliente_id }}
                    className="flex items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/40"
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {c?.nombre_comercial ?? c?.razon_social ?? "Cliente"}
                        </span>
                        <Badge variant="outline" className={priorityColor[p.prioridad] ?? ""}>
                          {p.prioridad}
                        </Badge>
                        {p.ventana_sugerida && (
                          <span className="text-[10px] text-muted-foreground">{p.ventana_sugerida}</span>
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.razon}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Paneles de oportunidad ── */}
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
            <div className="flex min-w-0 items-center gap-2">
              <TrendingUp className="h-5 w-5 shrink-0 text-primary" />
              <CardTitle className="truncate text-base">Recompras próximas</CardTitle>
            </div>
            <Link
              to="/rep/laboratorios"
              className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
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

function Metric({
  icon: Icon,
  label,
  value,
  sub,
  bar,
}: {
  icon: any;
  label: string;
  value: string;
  sub?: string;
  bar?: number;
}) {
  return (
    <Card>
      <CardContent className="p-3 md:p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[11px] uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
        <div className="mt-1 text-lg font-bold tabular-nums md:text-xl">{value}</div>
        {typeof bar === "number" && (
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${bar * 100}%` }} />
          </div>
        )}
        {sub && <div className="mt-1 truncate text-[11px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function Mini({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "good" | "warn" | "bad";
}) {
  const toneCls =
    tone === "good"
      ? "text-emerald-600"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "bad"
          ? "text-red-600"
          : "text-foreground";
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-1.5">
        {tone === "warn" && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
        <span className="min-w-0 truncate text-[11px] text-muted-foreground">{label}</span>
      </div>
      <div className={`mt-0.5 text-lg font-bold tabular-nums ${toneCls}`}>
        {value.toLocaleString("es-MX")}
      </div>
    </div>
  );
}
