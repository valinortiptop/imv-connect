// @ts-nocheck
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Package, DollarSign, TrendingDown, Clock, Truck, RefreshCw, Check, Sparkles, Wallet } from "lucide-react";
import { regenerarAlertasCompras, resolverAlertaCompras, aiInsightCompras } from "@/lib/compras.functions";
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

  const insight = useServerFn(aiInsightCompras);
  const insightMut = useMutation({
    mutationFn: () => insight({}),
    onError: (e: any) => toast.error(e?.message ?? "Error IA"),
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
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase text-muted-foreground">Centro de alertas</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => regenMut.mutate()}
                disabled={regenMut.isPending}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                title="Recalcular alertas"
              >
                <RefreshCw className={`size-3 ${regenMut.isPending ? "animate-spin" : ""}`} />
                Recalcular
              </button>
              <AlertTriangle className="size-4 text-amber-500" />
            </div>
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
                <button
                  onClick={() => resolveMut.mutate(a.id)}
                  className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Marcar como resuelta"
                >
                  <Check className="size-3.5" />
                </button>
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

      <FlujoComprasCard />



      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase text-muted-foreground">Análisis IA</h2>
          </div>
          <button
            onClick={() => insightMut.mutate()}
            disabled={insightMut.isPending}
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
          >
            {insightMut.isPending ? "Generando…" : insightMut.data ? "Regenerar" : "Generar análisis"}
          </button>
        </div>
        {!insightMut.data && !insightMut.isPending && (
          <p className="text-sm text-muted-foreground">
            Genera un resumen priorizado con acciones recomendadas basado en planeación, caducidades, baja rotación y desempeño de proveedores.
          </p>
        )}
        {insightMut.data && (
          <div className="space-y-3 text-sm">
            {insightMut.data.resumen && <p className="leading-relaxed">{insightMut.data.resumen}</p>}
            {insightMut.data.riesgos?.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Riesgos</p>
                <ul className="list-disc pl-5 space-y-0.5">
                  {insightMut.data.riesgos.map((r: string, i: number) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
            {insightMut.data.acciones?.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Acciones prioritarias</p>
                <div className="space-y-1.5">
                  {insightMut.data.acciones.map((a: any, i: number) => (
                    <div key={i} className="rounded-md border border-border p-2">
                      <p className="text-sm font-medium">{a.titulo}</p>
                      <p className="text-xs text-muted-foreground">{a.detalle}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
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

function FlujoComprasCard() {
  const { data } = useQuery({
    queryKey: ["compras-flujo"],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const horizonEnd = new Date(today);
      horizonEnd.setDate(horizonEnd.getDate() + 7 * 8);

      const [ocsRes, accountsRes] = await Promise.all([
        supabase
          .from("ordenes_compra")
          .select("id, folio, total, fecha_emision, fecha_esperada, estado, laboratorio_id")
          .in("estado", ["borrador", "enviada", "parcial"])
          .lte("fecha_esperada", horizonEnd.toISOString().slice(0, 10)),
        supabase.from("bank_accounts").select("id, saldo_inicial, moneda, activa").eq("activa", true),
      ]);

      const mxnAccts = (accountsRes.data ?? []).filter((a: any) => (a.moneda ?? "MXN") === "MXN");
      const saldos = await Promise.all(
        mxnAccts.map(async (a: any) => {
          const { data: s } = await supabase.rpc("bank_account_saldo" as any, { _cuenta: a.id });
          return Number(s ?? a.saldo_inicial ?? 0);
        }),
      );
      const saldoActual = saldos.reduce((s, v) => s + v, 0);

      // Bucket by ISO week starting Monday
      const weeks: { label: string; start: Date; total: number; ocs: number }[] = [];
      const dayOfWeek = today.getDay(); // 0 Sun ... 6 Sat
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(today);
      monday.setDate(monday.getDate() + mondayOffset);
      for (let i = 0; i < 8; i++) {
        const start = new Date(monday);
        start.setDate(start.getDate() + i * 7);
        const label = `${start.getDate()}/${start.getMonth() + 1}`;
        weeks.push({ label, start, total: 0, ocs: 0 });
      }
      let vencidas = 0;
      let vencidasCount = 0;
      for (const oc of (ocsRes.data ?? []) as any[]) {
        const fecha = oc.fecha_esperada ? new Date(oc.fecha_esperada) : null;
        const monto = Number(oc.total || 0);
        if (!fecha || fecha < monday) {
          vencidas += monto;
          vencidasCount += fecha ? 1 : 0;
          continue;
        }
        const idx = Math.min(7, Math.floor((fecha.getTime() - monday.getTime()) / (7 * 24 * 3600 * 1000)));
        weeks[idx].total += monto;
        weeks[idx].ocs += 1;
      }
      const totalHorizonte = weeks.reduce((s, w) => s + w.total, 0) + vencidas;
      const max = Math.max(1, ...weeks.map((w) => w.total));

      // Running projected balance
      let running = saldoActual - vencidas;
      const withRunning = weeks.map((w) => {
        running -= w.total;
        return { ...w, saldoProyectado: running };
      });

      return { saldoActual, vencidas, vencidasCount, totalHorizonte, weeks: withRunning, max };
    },
  });

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wallet className="size-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Flujo de compras · próximas 8 semanas</h2>
        </div>
        <Link to="/admin/bancos" className="text-xs text-muted-foreground hover:text-foreground">Bancos →</Link>
      </div>
      {!data ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Saldo actual MXN</p>
              <p className="font-bold tabular-nums">{mxn.format(data.saldoActual)}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Compromisos 8 sem.</p>
              <p className="font-bold tabular-nums">{mxn.format(data.totalHorizonte)}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Vencidos sin recibir</p>
              <p className={`font-bold tabular-nums ${data.vencidas > 0 ? "text-rose-500" : ""}`}>
                {mxn.format(data.vencidas)} {data.vencidasCount > 0 ? `· ${data.vencidasCount}` : ""}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Saldo proyectado 8 sem.</p>
              <p className={`font-bold tabular-nums ${data.weeks.at(-1)!.saldoProyectado < 0 ? "text-rose-500" : "text-emerald-500"}`}>
                {mxn.format(data.weeks.at(-1)!.saldoProyectado)}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-8 items-end gap-1 h-24">
            {data.weeks.map((w, i) => {
              const h = w.total > 0 ? Math.max(6, Math.round((w.total / data.max) * 100)) : 2;
              return (
                <div key={i} className="flex flex-col items-center justify-end gap-1" title={`Semana ${w.label}: ${mxn.format(w.total)} · ${w.ocs} OC`}>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {w.total > 0 ? Math.round(w.total / 1000) + "k" : ""}
                  </span>
                  <div
                    className={`w-full rounded-t ${w.saldoProyectado < 0 ? "bg-rose-500/70" : "bg-primary/70"}`}
                    style={{ height: `${h}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-1 grid grid-cols-8 gap-1 text-[10px] text-muted-foreground">
            {data.weeks.map((w, i) => (
              <div key={i} className="text-center tabular-nums">{w.label}</div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

