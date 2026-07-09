import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { generateRepCoachingFn, getGamificationFn, getRepKpisFn } from "@/lib/rep.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Trophy, Target, TrendingUp, RefreshCw } from "lucide-react";

const money = (n: number) => "$" + Math.round(n).toLocaleString("es-MX");

export default function CoachingPanel() {
  const qc = useQueryClient();
  const fetchCoaching = useServerFn(generateRepCoachingFn);
  const fetchGame = useServerFn(getGamificationFn);
  const fetchKpis = useServerFn(getRepKpisFn);

  const kpiQ = useQuery({ queryKey: ["rep-kpis-7"], queryFn: () => fetchKpis({ data: { days: 7 } }) });
  const gameQ = useQuery({ queryKey: ["rep-gamification"], queryFn: () => fetchGame() });
  const coachQ = useQuery({ queryKey: ["rep-coaching"], queryFn: () => fetchCoaching({ data: {} }) });

  const regen = useMutation({
    mutationFn: () => fetchCoaching({ data: { force: true } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rep-coaching"] }),
  });

  const c = coachQ.data?.coaching as any;
  const me = gameQ.data?.me;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold">Mi coach IA</h1>
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

      {/* KPIs 7d */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Visitas 7d</CardTitle></CardHeader>
          <CardContent className="text-xl font-semibold">{kpiQ.data?.visitas ?? 0}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Pedidos 7d</CardTitle></CardHeader>
          <CardContent className="text-xl font-semibold">{kpiQ.data?.pedidos ?? 0}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Ratio V→P</CardTitle></CardHeader>
          <CardContent className="text-xl font-semibold">{((kpiQ.data?.ratio ?? 0) * 100).toFixed(0)}%</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Ventas 7d</CardTitle></CardHeader>
          <CardContent className="text-xl font-semibold">{money(kpiQ.data?.ventas ?? 0)}</CardContent></Card>
      </div>

      {/* Coaching */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Coaching semanal
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {coachQ.isLoading || regen.isPending ? (
            <p className="text-sm text-muted-foreground">Generando análisis…</p>
          ) : c ? (
            <>
              <p className="text-sm">{c.summary}</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-600">
                    <TrendingUp className="h-4 w-4" /> Fortalezas
                  </h3>
                  <ul className="space-y-1 text-sm">
                    {(c.strengths ?? []).map((s: string, i: number) => (
                      <li key={i} className="flex gap-2"><span>✓</span><span>{s}</span></li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-600">
                    <Target className="h-4 w-4" /> Áreas de mejora
                  </h3>
                  <ul className="space-y-1 text-sm">
                    {(c.improvements ?? []).map((s: string, i: number) => (
                      <li key={i} className="flex gap-2"><span>→</span><span>{s}</span></li>
                    ))}
                  </ul>
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">Metas próxima semana</h3>
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
            <p className="text-sm text-muted-foreground">Aún no hay coaching. Haz clic en "Regenerar".</p>
          )}
        </CardContent>
      </Card>

      {/* Gamificación */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" /> Ranking · 30 días
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {me && (
            <div className="flex flex-wrap items-center gap-3 rounded-md bg-muted/40 p-3">
              <div className="text-3xl font-bold text-primary">#{me.rank}</div>
              <div className="min-w-0">
                <div className="text-sm text-muted-foreground">Mis puntos</div>
                <div className="text-xl font-semibold">{me.puntos.toLocaleString("es-MX")}</div>
              </div>
              <div className="ml-auto flex flex-wrap gap-2">
                {(gameQ.data?.badges ?? []).map((b) => (
                  <Badge key={b.code} variant={b.earned ? "default" : "outline"} className={b.earned ? "" : "opacity-40"}>
                    {b.label}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-1">#</th>
                  <th className="py-1">Rep</th>
                  <th className="py-1 text-right">Visitas</th>
                  <th className="py-1 text-right">Pedidos</th>
                  <th className="py-1 text-right">Ventas</th>
                  <th className="py-1 text-right">Puntos</th>
                </tr>
              </thead>
              <tbody>
                {(gameQ.data?.ranking ?? []).map((r) => (
                  <tr key={r.rep_id} className={me && r.rep_id === me.rep_id ? "bg-primary/5 font-medium" : ""}>
                    <td className="py-1">{r.rank}</td>
                    <td className="py-1">{r.nombre}</td>
                    <td className="py-1 text-right">{r.visitas}</td>
                    <td className="py-1 text-right">{r.pedidos}</td>
                    <td className="py-1 text-right">{money(r.ventas)}</td>
                    <td className="py-1 text-right font-semibold">{r.puntos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
