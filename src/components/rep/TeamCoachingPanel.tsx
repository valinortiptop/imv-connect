// Coach IA a nivel equipo: información relevante para admins / supervisores.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { generateTeamCoachingFn } from "@/lib/rep-analytics.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Target,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Users,
  AlertTriangle,
} from "lucide-react";

const money = (n: number) => "$" + Math.round(n).toLocaleString("es-MX");

function Delta({ now, prev }: { now: number; prev: number }) {
  if (!prev) return null;
  const pct = Math.round(((now - prev) / prev) * 100);
  const up = pct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${up ? "text-emerald-600" : "text-red-500"}`}
    >
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? "+" : ""}
      {pct}%
    </span>
  );
}

export default function TeamCoachingPanel() {
  const qc = useQueryClient();
  const fetchTeam = useServerFn(generateTeamCoachingFn);

  const teamQ = useQuery({
    queryKey: ["team-coaching"],
    queryFn: () => fetchTeam({ data: {} }),
  });

  const regen = useMutation({
    mutationFn: () => fetchTeam({ data: { force: true } }),
    onSuccess: (d) => {
      qc.setQueryData(["team-coaching"], d);
    },
  });

  const cur = teamQ.data?.team.current;
  const prev = teamQ.data?.team.previous;
  const reps = teamQ.data?.reps ?? [];
  const c = teamQ.data?.coaching as any;
  const loading = teamQ.isLoading || regen.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 truncate text-xl font-semibold md:text-2xl">Coach IA del equipo</h1>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => regen.mutate()}
          disabled={regen.isPending}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${regen.isPending ? "animate-spin" : ""}`} />
          Regenerar
        </Button>
      </div>

      {/* KPIs del equipo (últimos 7 días vs 7 previos) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: "Visitas 7d", value: String(cur?.visitas ?? 0), now: cur?.visitas ?? 0, prev: prev?.visitas ?? 0 },
          { label: "Pedidos 7d", value: String(cur?.pedidos ?? 0), now: cur?.pedidos ?? 0, prev: prev?.pedidos ?? 0 },
          {
            label: "Ratio V→P",
            value: `${((cur?.ratio ?? 0) * 100).toFixed(0)}%`,
            now: cur?.ratio ?? 0,
            prev: prev?.ratio ?? 0,
          },
          { label: "Ventas 7d", value: money(cur?.ventas ?? 0), now: cur?.ventas ?? 0, prev: prev?.ventas ?? 0 },
          {
            label: "Reps activos",
            value: `${cur?.reps_activos ?? 0}/${reps.length}`,
            now: cur?.reps_activos ?? 0,
            prev: prev?.reps_activos ?? 0,
          },
        ].map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-1">
              <CardTitle className="text-[11px] font-normal text-muted-foreground">{k.label}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-baseline gap-x-2 pb-3">
              <span className="text-lg font-semibold md:text-xl">{k.value}</span>
              <Delta now={k.now} prev={k.prev} />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Coaching de gestión */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" /> Lectura semanal del equipo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Generando análisis del equipo…</p>
          ) : c ? (
            <>
              <p className="text-sm">{c.summary}</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-600">
                    <TrendingUp className="h-4 w-4" /> Lo que funciona
                  </h3>
                  <ul className="space-y-1 text-sm">
                    {(c.strengths ?? []).map((s: string, i: number) => (
                      <li key={i} className="flex gap-2">
                        <span>✓</span>
                        <span className="min-w-0">{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-600">
                    <Target className="h-4 w-4" /> A corregir
                  </h3>
                  <ul className="space-y-1 text-sm">
                    {(c.improvements ?? []).map((s: string, i: number) => (
                      <li key={i} className="flex gap-2">
                        <span>→</span>
                        <span className="min-w-0">{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {(c.focos ?? []).length > 0 && (
                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <AlertTriangle className="h-4 w-4 text-amber-500" /> Requieren tu atención
                  </h3>
                  <ul className="space-y-2">
                    {(c.focos ?? []).map((f: any, i: number) => (
                      <li key={i} className="rounded-md border border-border p-3 text-sm">
                        <div className="font-medium">{f.representante}</div>
                        <div className="text-primary">{f.accion}</div>
                        <div className="text-xs text-muted-foreground">{f.motivo}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <h3 className="mb-2 text-sm font-semibold">Metas del equipo · próxima semana</h3>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(c.goals ?? []).map((g: any, i: number) => (
                    <div key={i} className="rounded-md border border-border p-3">
                      <div className="text-xs uppercase text-muted-foreground">{g.kpi}</div>
                      <div className="font-medium">{g.titulo}</div>
                      <div className="text-sm text-primary">{g.meta}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Aún no hay datos suficientes del equipo. Haz clic en "Regenerar".
            </p>
          )}
        </CardContent>
      </Card>

      {/* Desempeño por representante */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" /> Desempeño por representante · 7 días
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="-mx-2 overflow-x-auto px-2">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-1">Representante</th>
                  <th className="py-1 text-right">Visitas</th>
                  <th className="py-1 text-right">Pedidos</th>
                  <th className="py-1 text-right">Ratio</th>
                  <th className="py-1 text-right">Ventas</th>
                  <th className="py-1 text-right">vs sem. ant.</th>
                </tr>
              </thead>
              <tbody>
                {reps.map((r) => (
                  <tr key={r.rep_id} className="border-t border-border/60">
                    <td className="py-1.5">
                      <span className="mr-1.5">{r.nombre}</span>
                      {r.sin_actividad && (
                        <Badge variant="outline" className="border-red-400/50 text-[10px] text-red-500">
                          sin actividad
                        </Badge>
                      )}
                    </td>
                    <td className="py-1.5 text-right">{r.visitas}</td>
                    <td className="py-1.5 text-right">{r.pedidos}</td>
                    <td className="py-1.5 text-right">{(r.ratio * 100).toFixed(0)}%</td>
                    <td className="py-1.5 text-right font-medium">{money(r.ventas)}</td>
                    <td className="py-1.5 text-right">
                      <Delta now={r.ventas} prev={r.ventas_prev} />
                    </td>
                  </tr>
                ))}
                {reps.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-muted-foreground">
                      Sin representantes activos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
