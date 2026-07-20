import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingUp, Clock, CheckCircle2, DollarSign, Users } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
  LineChart, Line, CartesianGrid, Legend,
} from "recharts";

export const Route = createFileRoute("/admin/credito-cobranza/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard · Crédito y Cobranza" }] }),
  component: DashboardPage,
});

const mxn = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n || 0);

const RIESGO_COLORS: Record<string, string> = {
  bajo: "#10b981",
  medio: "#f59e0b",
  alto: "#f97316",
  critico: "#ef4444",
};

function DashboardPage() {
  const { data: cartera = [] } = useQuery({
    queryKey: ["dash-cartera"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_cliente_credito_360").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: pagos = [] } = useQuery({
    queryKey: ["dash-pagos-90d"],
    queryFn: async () => {
      const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("pagos")
        .select("fecha, monto")
        .gte("fecha", since);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: promesas = [] } = useQuery({
    queryKey: ["dash-promesas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cobranza_promesas_pago").select("estado, monto");
      if (error) throw error;
      return data ?? [];
    },
  });

  const kpi = useMemo(() => {
    const total = cartera.reduce((s: number, r: any) => s + Number(r.saldo_total || 0), 0);
    const vencido = cartera.reduce((s: number, r: any) => s + Number(r.saldo_vencido || 0), 0);
    const clientes = cartera.filter((r: any) => Number(r.saldo_total || 0) > 0).length;
    const bloqueados = cartera.filter((r: any) => r.bloqueado).length;
    const dsoTotal = cartera.reduce((acc: [number, number], r: any) => {
      const d = Number(r.dias_pago_prom || 0);
      if (d > 0) return [acc[0] + d, acc[1] + 1];
      return acc;
    }, [0, 0]);
    const dso = dsoTotal[1] ? Math.round(dsoTotal[0] / dsoTotal[1]) : 0;

    const hoy = new Date();
    const dia = hoy.toISOString().slice(0, 10);
    const semanaIni = new Date(hoy.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    const mesIni = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
    const recDia = pagos.filter((p: any) => p.fecha === dia).reduce((s: number, p: any) => s + Number(p.monto || 0), 0);
    const recSem = pagos.filter((p: any) => p.fecha >= semanaIni).reduce((s: number, p: any) => s + Number(p.monto || 0), 0);
    const recMes = pagos.filter((p: any) => p.fecha >= mesIni).reduce((s: number, p: any) => s + Number(p.monto || 0), 0);

    const promTotal = promesas.length;
    const promCumplidas = promesas.filter((p: any) => p.estado === "cumplida").length;
    const cumplimiento = promTotal ? Math.round((promCumplidas / promTotal) * 100) : 0;

    return { total, vencido, clientes, bloqueados, dso, recDia, recSem, recMes, cumplimiento };
  }, [cartera, pagos, promesas]);

  const aging = useMemo(() => {
    const buckets = { corriente: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    cartera.forEach((r: any) => {
      const total = Number(r.saldo_total || 0);
      const venc = Number(r.saldo_vencido || 0);
      buckets.corriente += Math.max(0, total - venc);
      // Reparto simple del vencido según días promedio; para exactitud usaríamos facturas.
      const dp = Number(r.dias_pago_prom || 0) - Number(r.dias_credito || 30);
      if (venc > 0) {
        if (dp > 90) buckets["90+"] += venc;
        else if (dp > 60) buckets["61-90"] += venc;
        else if (dp > 30) buckets["31-60"] += venc;
        else buckets["1-30"] += venc;
      }
    });
    return Object.entries(buckets).map(([bucket, monto]) => ({ bucket, monto }));
  }, [cartera]);

  const riesgoDist = useMemo(() => {
    const g: Record<string, number> = { bajo: 0, medio: 0, alto: 0, critico: 0 };
    cartera.forEach((r: any) => {
      const n = r.riesgo_calculado || "bajo";
      g[n] = (g[n] || 0) + Number(r.saldo_total || 0);
    });
    return Object.entries(g).map(([nivel, monto]) => ({ nivel, monto }));
  }, [cartera]);

  const top10 = useMemo(
    () => [...cartera]
      .sort((a: any, b: any) => Number(b.saldo_total || 0) - Number(a.saldo_total || 0))
      .slice(0, 10)
      .map((r: any) => ({
        cliente: (r.nombre_comercial || r.razon_social || "").slice(0, 22),
        saldo: Number(r.saldo_total || 0),
        vencido: Number(r.saldo_vencido || 0),
      })),
    [cartera],
  );

  const tendencia = useMemo(() => {
    const map: Record<string, number> = {};
    pagos.forEach((p: any) => {
      const key = String(p.fecha).slice(0, 7);
      map[key] = (map[key] || 0) + Number(p.monto || 0);
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, monto]) => ({ mes, monto }));
  }, [pagos]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={DollarSign} label="Cartera total" value={mxn(kpi.total)} />
        <KpiCard icon={AlertTriangle} label="Cartera vencida" value={mxn(kpi.vencido)} tone="danger" />
        <KpiCard icon={Clock} label="DSO promedio" value={`${kpi.dso} días`} />
        <KpiCard icon={CheckCircle2} label="Cumplimiento promesas" value={`${kpi.cumplimiento}%`} tone="success" />
        <KpiCard icon={TrendingUp} label="Recuperado hoy" value={mxn(kpi.recDia)} />
        <KpiCard icon={TrendingUp} label="Recuperado 7 días" value={mxn(kpi.recSem)} />
        <KpiCard icon={TrendingUp} label="Recuperado mes" value={mxn(kpi.recMes)} />
        <KpiCard icon={Users} label="Clientes con saldo" value={`${kpi.clientes}${kpi.bloqueados ? ` · ${kpi.bloqueados} bloq.` : ""}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Aging de cartera</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={aging}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="bucket" />
                <YAxis tickFormatter={(v) => mxn(Number(v))} width={80} />
                <Tooltip formatter={(v: any) => mxn(Number(v))} />
                <Bar dataKey="monto" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Exposición por nivel de riesgo</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={riesgoDist} dataKey="monto" nameKey="nivel" outerRadius={90} label={(e: any) => e.nivel}>
                  {riesgoDist.map((r) => <Cell key={r.nivel} fill={RIESGO_COLORS[r.nivel]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => mxn(Number(v))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Tendencia de recuperación (últimos 90 días)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={tendencia}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="mes" />
                <YAxis tickFormatter={(v) => mxn(Number(v))} width={80} />
                <Tooltip formatter={(v: any) => mxn(Number(v))} />
                <Line type="monotone" dataKey="monto" stroke="hsl(var(--primary))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Top 10 exposición por cliente</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={top10} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" tickFormatter={(v) => mxn(Number(v))} />
                <YAxis type="category" dataKey="cliente" width={140} />
                <Tooltip formatter={(v: any) => mxn(Number(v))} />
                <Legend />
                <Bar dataKey="saldo" fill="hsl(var(--primary))" name="Saldo total" />
                <Bar dataKey="vencido" fill="#ef4444" name="Vencido" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon, label, value, tone,
}: {
  icon: any; label: string; value: string; tone?: "danger" | "success";
}) {
  const toneClass =
    tone === "danger" ? "text-red-600" :
    tone === "success" ? "text-emerald-600" : "text-foreground";
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {label}
        </div>
        <div className={`text-xl font-semibold mt-1 ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
