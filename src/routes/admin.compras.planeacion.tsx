// @ts-nocheck
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sparkles, Search, RefreshCw, ShoppingCart, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { aiRefinePlaneacion, crearOCsDesdePlaneacion } from "@/lib/compras.functions";

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
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [showAI, setShowAI] = useState(false);
  const [showOC, setShowOC] = useState(false);

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

  const getQty = (r: Row) => edits[r.producto_id] ?? Number(r.cantidad_sugerida);

  const totales = useMemo(() => {
    let unidades = 0;
    let importe = 0;
    filtered.forEach((r) => {
      const qty = getQty(r);
      unidades += qty;
      importe += qty * Number(r.costo ?? 0);
    });
    return { unidades, importe };
  }, [filtered, edits]);

  const selectedRows = useMemo(
    () => filtered.filter((r) => selected[r.producto_id] && getQty(r) > 0),
    [filtered, selected, edits],
  );

  const toggleAll = () => {
    const allSelected = filtered.every((r) => selected[r.producto_id]);
    if (allSelected) setSelected({});
    else setSelected(Object.fromEntries(filtered.map((r) => [r.producto_id, true])));
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
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowAI(true)} disabled={filtered.length === 0}>
            <Sparkles className="mr-1 size-4" /> Asistente IA
          </Button>
          <Button size="sm" onClick={() => setShowOC(true)} disabled={selectedRows.length === 0}>
            <ShoppingCart className="mr-1 size-4" /> Crear OCs ({selectedRows.length})
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
                  <th className="px-2 py-2">
                    <input type="checkbox"
                      checked={filtered.length > 0 && filtered.every((r) => selected[r.producto_id])}
                      onChange={toggleAll} />
                  </th>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2">Proveedor</th>
                  <th className="px-3 py-2 text-right">Disp.</th>
                  <th className="px-3 py-2 text-right">Camino</th>
                  <th className="px-3 py-2 text-right">V.30d</th>
                  <th className="px-3 py-2 text-right">Cobertura</th>
                  <th className="px-3 py-2 text-right">Tend.</th>
                  <th className="px-3 py-2 text-right">Sugerido</th>
                  <th className="px-3 py-2 text-right">Comprar</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const val = getQty(r);
                  const critico = Number(r.stock_disponible) <= Number(r.punto_reorden || 0);
                  const motivo = motivos[r.producto_id];
                  return (
                    <tr key={r.producto_id} className={`border-t border-border ${critico ? "bg-rose-500/5" : ""}`}>
                      <td className="px-2 py-2">
                        <input type="checkbox"
                          checked={!!selected[r.producto_id]}
                          onChange={(e) => setSelected((s) => ({ ...s, [r.producto_id]: e.target.checked }))} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.nombre}</div>
                        <div className="text-xs text-muted-foreground">{r.sku}</div>
                        {motivo && <div className="mt-0.5 text-xs text-primary/80">💡 {motivo}</div>}
                      </td>
                      <td className="px-3 py-2 text-xs">{r.laboratorio ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{Number(r.stock_disponible).toFixed(0)}</td>
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
              const val = getQty(r);
              const critico = Number(r.stock_disponible) <= Number(r.punto_reorden || 0);
              const motivo = motivos[r.producto_id];
              return (
                <div key={r.producto_id} className={`rounded-md border border-border p-3 ${critico ? "bg-rose-500/5" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <label className="flex min-w-0 items-start gap-2">
                      <input type="checkbox" className="mt-1"
                        checked={!!selected[r.producto_id]}
                        onChange={(e) => setSelected((s) => ({ ...s, [r.producto_id]: e.target.checked }))} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{r.nombre}</p>
                        <p className="text-xs text-muted-foreground">{r.sku} · {r.laboratorio ?? "—"}</p>
                      </div>
                    </label>
                    <span className="tabular-nums text-sm font-semibold">{Number(r.cantidad_sugerida).toFixed(0)}</span>
                  </div>
                  {motivo && <p className="mt-1 text-xs text-primary/80">💡 {motivo}</p>}
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

      {showAI && (
        <AIDialog
          rows={filtered.map((r) => ({
            ...r,
            costo: Number(r.costo ?? 0),
            stock_disponible: Number(r.stock_disponible),
            stock_comprometido: Number(r.stock_comprometido ?? 0),
            en_camino: Number(r.en_camino ?? 0),
            ventas_30d: Number(r.ventas_30d),
            ventas_90d: Number(r.ventas_90d ?? 0),
            consumo_diario: Number(r.consumo_diario),
            punto_reorden: Number(r.punto_reorden),
            cantidad_sugerida: Number(r.cantidad_sugerida),
          }))}
          onClose={() => setShowAI(false)}
          onApply={(items, resumen) => {
            const nextEdits = { ...edits };
            const nextMot = { ...motivos };
            const nextSel = { ...selected };
            for (const it of items) {
              nextEdits[it.id] = Math.max(0, Math.round(it.cantidad));
              nextMot[it.id] = it.motivo;
              if (it.cantidad > 0) nextSel[it.id] = true;
            }
            setEdits(nextEdits);
            setMotivos(nextMot);
            setSelected(nextSel);
            setShowAI(false);
            toast.success(resumen || "Ajustes aplicados por IA");
          }}
        />
      )}

      {showOC && (
        <CrearOCsDialog
          lineas={selectedRows.map((r) => ({
            producto_id: r.producto_id,
            laboratorio_id: r.laboratorio_id,
            laboratorio: r.laboratorio,
            cantidad: getQty(r),
            costo_unitario: Number(r.costo ?? 0),
            nombre: r.nombre,
          }))}
          onClose={() => setShowOC(false)}
          onDone={() => {
            setShowOC(false);
            setSelected({});
            setEdits({});
            refetch();
          }}
        />
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

function AIDialog({ rows, onClose, onApply }: any) {
  const [objetivo, setObjetivo] = useState<"balanceado" | "ahorro" | "servicio">("balanceado");
  const [presupuesto, setPresupuesto] = useState<string>("");
  const [notas, setNotas] = useState("");
  const refine = useServerFn(aiRefinePlaneacion);

  const run = useMutation({
    mutationFn: async () => {
      // Trim rows to avoid oversized prompts
      const trimmed = rows.slice(0, 60);
      const res = await refine({
        data: {
          rows: trimmed,
          objetivo,
          presupuesto: presupuesto ? Number(presupuesto) : undefined,
          notas: notas || undefined,
        },
      });
      return res;
    },
    onSuccess: (res: any) => onApply(res.items ?? [], res.resumen ?? ""),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="size-5 text-primary" /> Asistente IA
          </h2>
          <button onClick={onClose}><X className="size-5" /></button>
        </div>
        <div className="space-y-3 text-sm">
          <div>
            <label className="font-medium">Objetivo</label>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {(["balanceado", "servicio", "ahorro"] as const).map((o) => (
                <button
                  key={o}
                  onClick={() => setObjetivo(o)}
                  className={`rounded-md border px-2 py-1.5 text-xs capitalize ${objetivo === o ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
                >{o}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="font-medium">Presupuesto tope (MXN, opcional)</label>
            <Input type="number" value={presupuesto} onChange={(e) => setPresupuesto(e.target.value)} placeholder="Ej. 250000" />
          </div>
          <div>
            <label className="font-medium">Notas para la IA (opcional)</label>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} maxLength={500}
              className="input w-full" placeholder="Ej. Priorizar antibióticos, evitar refrigerados" />
          </div>
          <p className="text-xs text-muted-foreground">Analizaremos {Math.min(rows.length, 60)} productos visibles usando Gemini vía Valinor.</p>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? <><Loader2 className="mr-1 size-4 animate-spin" /> Analizando…</> : "Analizar y aplicar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CrearOCsDialog({ lineas, onClose, onDone }: any) {
  const [almId, setAlmId] = useState("");
  const [fecha, setFecha] = useState("");
  const [notas, setNotas] = useState("");
  const crear = useServerFn(crearOCsDesdePlaneacion);

  const { data: alms } = useQuery({
    queryKey: ["almacenes-oc-plan"],
    queryFn: async () => {
      const { data } = await supabase.from("almacenes").select("id, nombre, principal").eq("activo", true).order("principal", { ascending: false });
      return data ?? [];
    },
  });

  // group by lab
  const grupos = useMemo(() => {
    const m = new Map<string | null, { laboratorio: string | null; items: typeof lineas }>();
    for (const l of lineas) {
      const k = l.laboratorio_id;
      if (!m.has(k)) m.set(k, { laboratorio: l.laboratorio, items: [] });
      m.get(k)!.items.push(l);
    }
    return Array.from(m.entries());
  }, [lineas]);

  const sinProv = grupos.find(([k]) => !k);

  const run = useMutation({
    mutationFn: async () => {
      if (!almId) throw new Error("Selecciona almacén");
      const payload = {
        lineas: lineas
          .filter((l: any) => l.laboratorio_id)
          .map((l: any) => ({
            producto_id: l.producto_id,
            laboratorio_id: l.laboratorio_id,
            cantidad: Math.max(1, Math.round(l.cantidad)),
            costo_unitario: Number(l.costo_unitario ?? 0),
          })),
        almacen_id: almId,
        fecha_esperada: fecha || null,
        notas: notas || undefined,
      };
      return crear({ data: payload });
    },
    onSuccess: (res: any) => {
      toast.success(`${res.created.length} OC(s) creada(s)`);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ShoppingCart className="size-5" /> Crear órdenes de compra
          </h2>
          <button onClick={onClose}><X className="size-5" /></button>
        </div>
        <div className="space-y-3 text-sm">
          <div>
            <label className="font-medium">Almacén destino</label>
            <select value={almId} onChange={(e) => setAlmId(e.target.value)} className="input mt-1 w-full">
              <option value="">— Selecciona —</option>
              {(alms ?? []).map((a: any) => <option key={a.id} value={a.id}>{a.nombre}{a.principal ? " (principal)" : ""}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-medium">Fecha esperada</label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div>
              <label className="font-medium">Notas</label>
              <Input value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={200} />
            </div>
          </div>
          <div className="rounded-md border border-border">
            <div className="border-b border-border bg-muted px-3 py-1.5 text-xs uppercase text-muted-foreground">Resumen — {grupos.filter(([k]) => k).length} orden(es)</div>
            <div className="max-h-56 overflow-y-auto divide-y divide-border">
              {grupos.filter(([k]) => k).map(([k, g]) => {
                const total = g.items.reduce((s: number, it: any) => s + it.cantidad * Number(it.costo_unitario ?? 0), 0);
                return (
                  <div key={k as string} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium">{g.laboratorio}</p>
                      <p className="text-xs text-muted-foreground">{g.items.length} producto(s)</p>
                    </div>
                    <span className="tabular-nums">{mxn.format(total)}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {sinProv && (
            <p className="text-xs text-amber-600">⚠ {sinProv[1].items.length} línea(s) sin proveedor asignado serán omitidas.</p>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => run.mutate()} disabled={run.isPending || !almId}>
            {run.isPending ? <><Loader2 className="mr-1 size-4 animate-spin" /> Creando…</> : "Crear OCs"}
          </Button>
        </div>
      </div>
    </div>
  );
}
