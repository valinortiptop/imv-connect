// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/compras/costos")({
  component: CostosPage,
});

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });

function CostosPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["cost-history-recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cost_history")
        .select("id, producto_id, laboratorio_id, costo_unitario, costo_anterior, variacion_pct, fecha, oc_id, productos(sku, nombre), laboratorios(nombre)")
        .order("fecha", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Cambios recientes de costo por producto (registrados al recibir OCs).</p>
      {isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p> : (
        <>
          <div className="hidden md:block overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2">Proveedor</th>
                  <th className="px-3 py-2 text-right">Anterior</th>
                  <th className="px-3 py-2 text-right">Nuevo</th>
                  <th className="px-3 py-2 text-right">Variación</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((r: any) => {
                  const v = Number(r.variacion_pct);
                  return (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-3 py-2 text-xs">{r.fecha}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.productos?.nombre ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{r.productos?.sku ?? ""}</div>
                      </td>
                      <td className="px-3 py-2 text-xs">{r.laboratorios?.nombre ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {r.costo_anterior != null ? mxn.format(Number(r.costo_anterior)) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{mxn.format(Number(r.costo_unitario))}</td>
                      <td className={`px-3 py-2 text-right tabular-nums text-xs font-medium ${v > 0 ? "text-rose-600" : v < 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                        {r.variacion_pct != null ? `${v > 0 ? "+" : ""}${v}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
                {(data ?? []).length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Aún no hay historial. Se registra automáticamente al recibir OCs.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="md:hidden space-y-2">
            {(data ?? []).map((r: any) => {
              const v = Number(r.variacion_pct);
              return (
                <div key={r.id} className="rounded-md border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.productos?.nombre ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{r.productos?.sku} · {r.laboratorios?.nombre ?? "—"}</p>
                    </div>
                    <span className={`shrink-0 tabular-nums text-sm font-semibold ${v > 0 ? "text-rose-600" : v < 0 ? "text-emerald-600" : ""}`}>
                      {r.variacion_pct != null ? `${v > 0 ? "+" : ""}${v}%` : "—"}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground tabular-nums">
                    <span>{r.fecha}</span>
                    <span>{r.costo_anterior != null ? mxn.format(Number(r.costo_anterior)) : "—"} → {mxn.format(Number(r.costo_unitario))}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
