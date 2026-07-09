// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/compras/proveedores")({
  component: ProveedoresPage,
});

function ProveedoresPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["v_supplier_kpis"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_supplier_kpis").select("*").order("fill_rate_pct", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">KPIs por proveedor · últimos 12 meses.</p>
      {isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p> : (
        <>
          <div className="hidden md:block overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Proveedor</th>
                  <th className="px-3 py-2 text-right">OCs 12m</th>
                  <th className="px-3 py-2 text-right">Fill Rate</th>
                  <th className="px-3 py-2 text-right">On-time</th>
                  <th className="px-3 py-2 text-right">Lead time</th>
                  <th className="px-3 py-2 text-right">Incidencias</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((p: any) => (
                  <tr key={p.laboratorio_id} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{p.laboratorio}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.ocs_12m}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(p.fill_rate_pct).toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(p.on_time_pct).toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(p.lead_time_prom_dias).toFixed(1)}d</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.incidencias_12m}</td>
                  </tr>
                ))}
                {(data ?? []).length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Sin datos.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="md:hidden space-y-2">
            {(data ?? []).map((p: any) => (
              <div key={p.laboratorio_id} className="rounded-md border border-border p-3">
                <p className="font-medium">{p.laboratorio}</p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <Cell label="Fill rate" value={`${Number(p.fill_rate_pct).toFixed(0)}%`} />
                  <Cell label="On-time" value={`${Number(p.on_time_pct).toFixed(0)}%`} />
                  <Cell label="Lead" value={`${Number(p.lead_time_prom_dias).toFixed(0)}d`} />
                  <Cell label="OCs" value={String(p.ocs_12m)} />
                  <Cell label="Incidencias" value={String(p.incidencias_12m)} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-muted px-2 py-1">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="tabular-nums font-medium">{value}</div>
    </div>
  );
}
