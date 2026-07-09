// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sparkles, Search, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/compras/planeacion")({
  component: PlaneacionPage,
});

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

type Row = {
  producto_id: string;
  sku: string;
  nombre: string;
  laboratorio: string | null;
  laboratorio_id: string | null;
  costo: number | null;
  stock_disponible: number;
  stock_comprometido: number;
  en_camino: number;
  ventas_30d: number;
  ventas_90d: number;
  tendencia_pct: number | null;
  consumo_diario: number;
  dias_cobertura: number | null;
  punto_reorden: number;
  cantidad_sugerida: number;
};

function PlaneacionPage() {
  const [q, setQ] = useState("");
  const [labFilter, setLabFilter] = useState("all");
  const [soloCritico, setSoloCritico] = useState(false);
  const [edits, setEdits] = useState<Record<string, number>>({});

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["compras-planeacion"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_compras_planeacion")
        .select("*")
        .order("cantidad_sugerida", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const labs = useMemo(() => {
    const s = new Set<string>();
    (data ?? []).forEach((r) => r.laboratorio && s.add(r.laboratorio));
    return Array.from(s).sort();
  }, [data]);

  const filtered = useMemo(() => {
    return (data ?? []).filter((r) => {
      if (soloCritico && Number(r.stock_disponible) > Number(r.punto_reorden || 0)) return false;
      if (labFilter !== "all" && r.laboratorio !== labFilter) return false;
      if (q) {
        const s = q.toLowerCase();
        if (!r.nombre.toLowerCase().includes(s) && !r.sku.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [data, q, labFilter, soloCritico]);

  const totales = useMemo(() => {
    let unidades = 0;
    let importe = 0;
    filtered.forEach((r) => {
      const qty = edits[r.producto_id] ?? Number(r.cantidad_sugerida);
      unidades += qty;
      importe += qty * Number(r.costo ?? 0);
    });
    return { unidades, importe };
  }, [filtered, edits]);

  const askAI = async () => {
    toast.info("Asistente IA — próximamente conectado al proxy Valinor.");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="SKU o nombre" className="pl-8 w-64" />
        </div>
        <select value={labFilter} onChange={(e) => setLabFilter(e.target.value)} className="input">
          <option value="all">Todos los proveedores</option>
          {labs.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={soloCritico} onChange={(e) => setSoloCritico(e.target.checked)} />
          Solo bajo punto de reorden
        </label>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={askAI}>
            <Sparkles className="mr-1 size-4" /> Asistente IA
          </Button>
          <div className="rounded-md border border-border bg-muted px-3 py-1.5 text-sm">
            <span className="tabular-nums">{totales.unidades.toFixed(0)} u · {mxn.format(totales.importe)}</span>
          </div>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2">Proveedor</th>
                  <th className="px-3 py-2 text-right">Disp.</th>
                  <th className="px-3 py-2 text-right">Comp.</th>
                  <th className="px-3 py-2 text-right">En camino</th>
                  <th className="px-3 py-2 text-right">Venta 30d</th>
                  <th className="px-3 py-2 text-right">Cobertura</th>
                  <th className="px-3 py-2 text-right">Tend.</th>
                  <th className="px-3 py-2 text-right">Sugerido</th>
                  <th className="px-3 py-2 text-right">Comprar</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const val = edits[r.producto_id] ?? Number(r.cantidad_sugerida);
                  const critico = Number(r.stock_disponible) <= Number(r.punto_reorden || 0);
                  return (
                    <tr key={r.producto_id} className={`border-t border-border ${critico ? "bg-rose-500/5" : ""}`}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.nombre}</div>
                        <div className="text-xs text-muted-foreground">{r.sku}</div>
                      </td>
                      <td className="px-3 py-2 text-xs">{r.laboratorio ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{Number(r.stock_disponible).toFixed(0)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{Number(r.stock_comprometido).toFixed(0)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-blue-600">{Number(r.en_camino).toFixed(0)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{Number(r.ventas_30d).toFixed(0)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.dias_cobertura != null ? `${r.dias_cobertura}d` : "—"}</td>
                      <td className={`px-3 py-2 text-right tabular-nums text-xs ${Number(r.tendencia_pct) > 0 ? "text-emerald-600" : Number(r.tendencia_pct) < 0 ? "text-rose-600" : "text-muted-foreground"}`}>
                        {r.tendencia_pct != null ? `${r.tendencia_pct > 0 ? "+" : ""}${r.tendencia_pct}%` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{Number(r.cantidad_sugerida).toFixed(0)}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          value={val}
                          onChange={(e) => setEdits((s) => ({ ...s, [r.producto_id]: Number(e.target.value) }))}
                          className="w-20 rounded border border-border bg-background px-2 py-1 text-right tabular-nums"
                        />
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={10} className="px-4 py-6 text-center text-muted-foreground">Sin productos.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {filtered.map((r) => {
              const val = edits[r.producto_id] ?? Number(r.cantidad_sugerida);
              const critico = Number(r.stock_disponible) <= Number(r.punto_reorden || 0);
              return (
                <div key={r.producto_id} className={`rounded-md border border-border p-3 ${critico ? "bg-rose-500/5" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.nombre}</p>
                      <p className="text-xs text-muted-foreground">{r.sku} · {r.laboratorio ?? "—"}</p>
                    </div>
                    <span className="tabular-nums text-sm font-semibold">{Number(r.cantidad_sugerida).toFixed(0)}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
                    <Mini label="Disp." value={Number(r.stock_disponible).toFixed(0)} />
                    <Mini label="Camino" value={Number(r.en_camino).toFixed(0)} />
                    <Mini label="V.30d" value={Number(r.ventas_30d).toFixed(0)} />
                    <Mini label="Cob." value={r.dias_cobertura != null ? `${r.dias_cobertura}d` : "—"} />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Comprar:</span>
                    <input
                      type="number"
                      min={0}
                      value={val}
                      onChange={(e) => setEdits((s) => ({ ...s, [r.producto_id]: Number(e.target.value) }))}
                      className="w-24 rounded border border-border bg-background px-2 py-1 text-right tabular-nums"
                    />
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

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-muted px-2 py-1">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="tabular-nums font-medium">{value}</div>
    </div>
  );
}
