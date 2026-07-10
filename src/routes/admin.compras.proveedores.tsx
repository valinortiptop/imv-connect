// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, X, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { registerSupplierIncident } from "@/lib/compras.functions";

export const Route = createFileRoute("/admin/compras/proveedores")({
  component: ProveedoresPage,
});

function ProveedoresPage() {
  const [incidentFor, setIncidentFor] = useState<{ id: string; nombre: string } | null>(null);
  const [drawerFor, setDrawerFor] = useState<{ id: string; nombre: string; kpi: any } | null>(null);

  const { data, isLoading, refetch } = useQuery({
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
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((p: any) => (
                  <tr key={p.laboratorio_id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">
                      <button className="text-left hover:underline" onClick={() => setDrawerFor({ id: p.laboratorio_id, nombre: p.laboratorio, kpi: p })}>
                        {p.laboratorio}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.ocs_12m}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(p.fill_rate_pct).toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(p.on_time_pct).toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(p.lead_time_prom_dias).toFixed(1)}d</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.incidencias_12m}</td>
                    <td className="px-3 py-2 text-right">
                      <Button variant="outline" size="sm" onClick={() => setIncidentFor({ id: p.laboratorio_id, nombre: p.laboratorio })}>
                        <AlertTriangle className="mr-1 size-3.5" /> Incidencia
                      </Button>
                    </td>
                  </tr>
                ))}
                {(data ?? []).length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">Sin datos.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="md:hidden space-y-2">
            {(data ?? []).map((p: any) => (
              <div key={p.laboratorio_id} className="rounded-md border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <button className="text-left font-medium hover:underline" onClick={() => setDrawerFor({ id: p.laboratorio_id, nombre: p.laboratorio, kpi: p })}>
                    {p.laboratorio}
                  </button>
                  <Button variant="outline" size="sm" onClick={() => setIncidentFor({ id: p.laboratorio_id, nombre: p.laboratorio })}>
                    <Plus className="size-3.5" />
                  </Button>
                </div>
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
      {incidentFor && (
        <IncidentDialog
          lab={incidentFor}
          onClose={() => setIncidentFor(null)}
          onSaved={() => { setIncidentFor(null); refetch(); }}
        />
      )}
      {drawerFor && (
        <SupplierDrawer
          lab={drawerFor}
          onClose={() => setDrawerFor(null)}
          onOpenIncident={() => { setIncidentFor({ id: drawerFor.id, nombre: drawerFor.nombre }); setDrawerFor(null); }}
        />
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

function IncidentDialog({ lab, onClose, onSaved }: any) {
  const [tipo, setTipo] = useState<"retraso" | "faltante" | "dano" | "calidad" | "otro">("retraso");
  const [motivo, setMotivo] = useState("");
  const [notas, setNotas] = useState("");
  const [monto, setMonto] = useState("");
  const register = useServerFn(registerSupplierIncident);

  const save = useMutation({
    mutationFn: async () => {
      if (notas.trim().length < 3) throw new Error("Describe la incidencia");
      return register({
        data: {
          laboratorio_id: lab.id,
          tipo,
          motivo: motivo || undefined,
          notas,
          monto: monto ? Number(monto) : undefined,
        },
      });
    },
    onSuccess: () => { toast.success("Incidencia registrada"); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Incidencia · {lab.nombre}</h2>
          <button onClick={onClose}><X className="size-5" /></button>
        </div>
        <div className="space-y-3 text-sm">
          <div>
            <label className="font-medium">Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as any)} className="input mt-1 w-full">
              <option value="retraso">Retraso</option>
              <option value="faltante">Faltante</option>
              <option value="dano">Daño</option>
              <option value="calidad">Calidad</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <div>
            <label className="font-medium">Motivo (breve)</label>
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} />
          </div>
          <div>
            <label className="font-medium">Detalle</label>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} maxLength={1000} className="input w-full" />
          </div>
          <div>
            <label className="font-medium">Monto afectado (MXN, opcional)</label>
            <Input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <><Loader2 className="mr-1 size-4 animate-spin" /> Guardando…</> : "Registrar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
