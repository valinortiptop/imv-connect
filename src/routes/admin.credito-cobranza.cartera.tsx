import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Ban, Lock, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/admin/credito-cobranza/cartera")({
  component: CarteraPage,
});

type Row = {
  cliente_id: string;
  razon_social: string;
  nombre_comercial: string | null;
  limite_credito: number;
  dias_credito: number;
  bloqueado: boolean;
  saldo_total: number;
  saldo_vencido: number;
  facturas_abiertas: number;
  facturas_vencidas: number;
  utilizacion_pct: number | null;
  dias_pago_prom: number;
  ultima_gestion_at: string | null;
  promesas_pendientes: number;
  promesas_incumplidas: number;
  riesgo_calculado: "bajo" | "medio" | "alto" | "critico";
};

const mxn = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 }).format(n);

const RIESGO_BADGE: Record<Row["riesgo_calculado"], string> = {
  bajo: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  medio: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  alto: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  critico: "bg-red-500/15 text-red-600 border-red-500/30",
};

function CarteraPage() {
  const [q, setQ] = useState("");
  const [riesgo, setRiesgo] = useState<string>("todos");
  const [estado, setEstado] = useState<string>("deudores");

  const { data = [], isLoading } = useQuery({
    queryKey: ["cobranza-cartera"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_cliente_credito_360" as any)
        .select("*")
        .order("saldo_vencido", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return data.filter((r) => {
      if (estado === "deudores" && Number(r.saldo_total) <= 0) return false;
      if (estado === "vencidos" && Number(r.saldo_vencido) <= 0) return false;
      if (estado === "bloqueados" && !r.bloqueado) return false;
      if (riesgo !== "todos" && r.riesgo_calculado !== riesgo) return false;
      if (!term) return true;
      return (
        (r.razon_social || "").toLowerCase().includes(term) ||
        (r.nombre_comercial || "").toLowerCase().includes(term)
      );
    });
  }, [data, q, riesgo, estado]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (a, r) => {
        a.saldo += Number(r.saldo_total || 0);
        a.vencido += Number(r.saldo_vencido || 0);
        if (r.riesgo_calculado === "critico" || r.riesgo_calculado === "alto") a.riesgoAlto++;
        if (r.bloqueado) a.bloqueados++;
        return a;
      },
      { saldo: 0, vencido: 0, riesgoAlto: 0, bloqueados: 0 },
    );
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi title="Cartera total" value={mxn(totals.saldo)} icon={TrendingUp} tone="text-primary" />
        <Kpi title="Cartera vencida" value={mxn(totals.vencido)} icon={AlertTriangle} tone="text-red-500" />
        <Kpi title="Clientes en riesgo" value={String(totals.riesgoAlto)} icon={AlertTriangle} tone="text-orange-500" />
        <Kpi title="Bloqueados" value={String(totals.bloqueados)} icon={Ban} tone="text-red-500" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar cliente…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Select value={estado} onValueChange={setEstado}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="deudores">Con saldo</SelectItem>
            <SelectItem value="vencidos">Vencidos</SelectItem>
            <SelectItem value="bloqueados">Bloqueados</SelectItem>
          </SelectContent>
        </Select>
        <Select value={riesgo} onValueChange={setRiesgo}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Riesgo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todo riesgo</SelectItem>
            <SelectItem value="bajo">Bajo</SelectItem>
            <SelectItem value="medio">Medio</SelectItem>
            <SelectItem value="alto">Alto</SelectItem>
            <SelectItem value="critico">Crítico</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Cliente</th>
              <th className="text-right px-2 py-2">Saldo</th>
              <th className="text-right px-2 py-2">Vencido</th>
              <th className="text-center px-2 py-2">Fact.</th>
              <th className="text-right px-2 py-2">Límite</th>
              <th className="text-right px-2 py-2">Uso %</th>
              <th className="text-center px-2 py-2">DDP</th>
              <th className="text-center px-2 py-2">Riesgo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">Cargando…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">Sin clientes.</td></tr>
            ) : filtered.map((r) => (
              <tr key={r.cliente_id} className="border-t border-border hover:bg-muted/20">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    {r.bloqueado && <Lock className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                    <div className="min-w-0">
                      <div className="truncate font-medium">{r.nombre_comercial || r.razon_social}</div>
                      {r.nombre_comercial && (
                        <div className="text-xs text-muted-foreground truncate">{r.razon_social}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2 text-right font-mono">{mxn(Number(r.saldo_total))}</td>
                <td className={`px-2 py-2 text-right font-mono ${Number(r.saldo_vencido) > 0 ? "text-red-500 font-semibold" : ""}`}>
                  {mxn(Number(r.saldo_vencido))}
                </td>
                <td className="px-2 py-2 text-center text-xs">
                  {r.facturas_abiertas}
                  {r.facturas_vencidas > 0 && <span className="text-red-500"> ({r.facturas_vencidas}v)</span>}
                </td>
                <td className="px-2 py-2 text-right font-mono text-xs">
                  {Number(r.limite_credito) > 0 ? mxn(Number(r.limite_credito)) : "—"}
                </td>
                <td className="px-2 py-2 text-right font-mono text-xs">
                  {r.utilizacion_pct != null ? `${r.utilizacion_pct}%` : "—"}
                </td>
                <td className="px-2 py-2 text-center text-xs">{r.dias_pago_prom || 0}</td>
                <td className="px-2 py-2 text-center">
                  <Badge className={`${RIESGO_BADGE[r.riesgo_calculado]} border capitalize`}>
                    {r.riesgo_calculado}
                  </Badge>
                </td>
                <td className="px-2 py-2 text-right">
                  <Link
                    to="/admin/credito-cobranza/clientes/$id"
                    params={{ id: r.cliente_id }}
                    className="text-primary text-xs hover:underline whitespace-nowrap"
                  >
                    Ver 360 →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({
  title, value, icon: Icon, tone,
}: { title: string; value: string; icon: React.ComponentType<{ className?: string }>; tone: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={`h-4 w-4 ${tone}`} /> {title}
      </div>
      <div className="mt-1 text-lg font-semibold font-mono">{value}</div>
    </div>
  );
}
