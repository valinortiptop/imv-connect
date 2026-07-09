// @ts-nocheck
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Package, DollarSign, TrendingDown, Clock, Truck, RefreshCw, Check } from "lucide-react";
import { regenerarAlertasCompras, resolverAlertaCompras } from "@/lib/compras.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/compras/")({
  component: ComprasDashboard,
});

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

function ComprasDashboard() {
  const qc = useQueryClient();
  const regen = useServerFn(regenerarAlertasCompras);
  const resolver = useServerFn(resolverAlertaCompras);

  const regenMut = useMutation({
    mutationFn: () => regen({}),
    onSuccess: (r: any) => {
      toast.success(`Alertas regeneradas: ${r?.generadas ?? 0}`);
      qc.invalidateQueries({ queryKey: ["compras-kpis"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al regenerar alertas"),
  });

  const resolveMut = useMutation({
    mutationFn: (id: string) => resolver({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["compras-kpis"] }),
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const { data: kpis } = useQuery({
    queryKey: ["compras-kpis"],
    queryFn: async () => {
      const [ocsMes, valorInv, planeacion, caducidades, alertas] = await Promise.all([
        supabase.from("ordenes_compra").select("total, estado, fecha_emision").gte("fecha_emision", firstDayOfMonth()),
        supabase.from("v_stock_productos").select("stock_total"),
        supabase.from("v_compras_planeacion").select("producto_id, cantidad_sugerida, stock_disponible, punto_reorden, dias_cobertura"),
        supabase.from("v_caducidades").select("valor_economico, semaforo").in("semaforo", ["rojo", "amarillo"]),
        supabase.from("purchase_alerts").select("id, tipo, severidad, titulo, created_at").eq("resuelto", false).order("created_at", { ascending: false }).limit(10),
      ]);

      const totalMes = (ocsMes.data ?? []).reduce((s: number, o: any) => s + Number(o.total || 0), 0);
      const criticos = (planeacion.data ?? []).filter((p: any) => Number(p.stock_disponible) <= Number(p.punto_reorden || 0)).length;
      const sugerir = (planeacion.data ?? []).filter((p: any) => Number(p.cantidad_sugerida) > 0).length;
      const caducRojo = (caducidades.data ?? []).filter((c: any) => c.semaforo === "rojo").reduce((s: number, c: any) => s + Number(c.valor_economico || 0), 0);
      const caducAmarillo = (caducidades.data ?? []).filter((c: any) => c.semaforo === "amarillo").reduce((s: number, c: any) => s + Number(c.valor_economico || 0), 0);

      return {
        comprasMes: totalMes,
        criticos,
        sugerir,
        caducRojo,
        caducAmarillo,
        alertas: alertas.data ?? [],
      };
    },
  });

  const { data: kpiProv } = useQuery({
    queryKey: ["compras-kpi-prov"],
    queryFn: async () => {
      const { data } = await supabase.from("v_supplier_kpis").select("laboratorio, fill_rate_pct, on_time_pct, lead_time_prom_dias").order("fill_rate_pct", { ascending: false }).limit(5);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={<DollarSign className="size-5" />} label="Compras del mes" value={mxn.format(kpis?.comprasMes ?? 0)} />
        <KpiCard icon={<Package className="size-5" />} label="Productos críticos" value={String(kpis?.criticos ?? 0)} accent="rose" />
        <KpiCard icon={<TrendingDown className="size-5" />} label="A sugerir compra" value={String(kpis?.sugerir ?? 0)} accent="amber" />
        <KpiCard icon={<Clock className="size-5" />} label="Caducidad crítica" value={mxn.format(kpis?.caducRojo ?? 0)} accent="rose" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase text-muted-foreground">Centro de alertas</h2>
            <AlertTriangle className="size-4 text-amber-500" />
          </div>
          <div className="space-y-2">
            {(kpis?.alertas ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Sin alertas activas.</p>
            )}
            {(kpis?.alertas ?? []).map((a: any) => (
              <div key={a.id} className="flex items-start gap-2 rounded-md border border-border p-2">
                <span className={`mt-1 size-2 shrink-0 rounded-full ${sevDot(a.severidad)}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.titulo}</p>
                  <p className="text-xs text-muted-foreground">{a.tipo}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase text-muted-foreground">Top proveedores (fill rate)</h2>
            <Truck className="size-4 text-muted-foreground" />
          </div>
          <div className="space-y-1.5">
            {(kpiProv ?? []).map((p: any) => (
              <div key={p.laboratorio} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{p.laboratorio}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {Number(p.fill_rate_pct).toFixed(0)}% · {Number(p.on_time_pct).toFixed(0)}% · {Number(p.lead_time_prom_dias).toFixed(0)}d
                </span>
              </div>
            ))}
            {(kpiProv ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Aún no hay datos suficientes.</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link to="/admin/compras/planeacion" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90">Ir a Planeación</Link>
        <Link to="/admin/compras/ordenes" className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">Ver órdenes</Link>
        <Link to="/admin/compras/caducidades" className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">Caducidades</Link>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: "rose" | "amber" | "emerald" }) {
  const color =
    accent === "rose" ? "text-rose-500" :
    accent === "amber" ? "text-amber-500" :
    accent === "emerald" ? "text-emerald-500" : "text-muted-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className={`mb-1 flex items-center gap-1.5 ${color}`}>{icon}<span className="text-xs font-medium uppercase">{label}</span></div>
      <p className="text-lg md:text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function sevDot(sev: string) {
  switch (sev) {
    case "critica": return "bg-rose-500";
    case "alta": return "bg-orange-500";
    case "media": return "bg-amber-500";
    default: return "bg-muted-foreground";
  }
}

function firstDayOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
