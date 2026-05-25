import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/inventario")({
  component: InventarioPage,
});

type StockRow = {
  producto_id: string;
  sku: string | null;
  nombre: string;
  unidad: string;
  activo: boolean;
  stock_minimo: number;
  laboratorio: string | null;
  stock_total: number;
  bajo_minimo: boolean;
};

type Almacen = { id: string; nombre: string; principal: boolean; activo: boolean };
type Mov = {
  id: string;
  tipo: string;
  cantidad: number;
  referencia: string | null;
  notas: string | null;
  created_at: string;
  almacen: { nombre: string } | null;
};

function InventarioPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [soloBajos, setSoloBajos] = useState(false);
  const [modal, setModal] = useState<{ row: StockRow; mode: "mov" | "hist" } | null>(null);

  const { data: stock, isLoading } = useQuery({
    queryKey: ["v_stock_productos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_stock_productos")
        .select("producto_id, sku, nombre, unidad, activo, stock_minimo, laboratorio, stock_total, bajo_minimo")
        .order("nombre");
      if (error) throw error;
      return data as StockRow[];
    },
  });

  const { data: almacenes } = useQuery({
    queryKey: ["almacenes-activos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("almacenes")
        .select("id, nombre, principal, activo")
        .eq("activo", true)
        .order("principal", { ascending: false })
        .order("nombre");
      if (error) throw error;
      return data as Almacen[];
    },
  });

  const filtered = useMemo(() => {
    if (!stock) return [];
    const term = q.trim().toLowerCase();
    return stock.filter((r) => {
      if (soloBajos && !r.bajo_minimo) return false;
      if (!term) return true;
      return (
        r.nombre.toLowerCase().includes(term) ||
        (r.sku ?? "").toLowerCase().includes(term) ||
        (r.laboratorio ?? "").toLowerCase().includes(term)
      );
    });
  }, [stock, q, soloBajos]);

  const bajosCount = stock?.filter((r) => r.bajo_minimo && r.activo).length ?? 0;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inventario</h1>
          <p className="text-sm text-muted-foreground">
            Stock consolidado por producto. Los pedidos confirmados descuentan del almacén principal.
          </p>
        </div>
        {bajosCount > 0 && (
          <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600">
            {bajosCount} producto{bajosCount === 1 ? "" : "s"} bajo mínimo
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          placeholder="Buscar nombre / SKU / laboratorio…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="input max-w-sm flex-1"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={soloBajos} onChange={(e) => setSoloBajos(e.target.checked)} />
          Solo bajo mínimo
        </label>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Producto</th>
              <th className="px-3 py-2">Laboratorio</th>
              <th className="px-3 py-2 text-right">Stock total</th>
              <th className="px-3 py-2 text-right">Mínimo</th>
              <th className="px-3 py-2"></th>
              <th className="px-3 py-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.producto_id} className={`border-t border-border ${r.bajo_minimo ? "bg-amber-500/5" : ""}`}>
                <td className="px-3 py-2">
                  <div className="font-medium">{r.nombre}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.sku ?? "—"} · {r.unidad}
                  </div>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{r.laboratorio ?? "—"}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                  {Number(r.stock_total)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {Number(r.stock_minimo)}
                </td>
                <td className="px-3 py-2">
                  {r.bajo_minimo && (
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600">
                      bajo mínimo
                    </span>
                  )}
                  {!r.activo && (
                    <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">inactivo</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => setModal({ row: r, mode: "mov" })} className="mr-2 text-xs text-primary hover:underline">
                    Movimiento
                  </button>
                  <button onClick={() => setModal({ row: r, mode: "hist" })} className="text-xs text-muted-foreground hover:underline">
                    Historial
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Sin productos.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && modal.mode === "mov" && almacenes && (
        <MovimientoModal
          row={modal.row}
          almacenes={almacenes}
          onClose={() => setModal(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["v_stock_productos"] });
            setModal(null);
          }}
        />
      )}
      {modal && modal.mode === "hist" && (
        <HistorialModal row={modal.row} onClose={() => setModal(null)} />
      )}
    </section>
  );
}

function MovimientoModal({ row, almacenes, onClose, onSaved }: {
  row: StockRow;
  almacenes: Almacen[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const principal = almacenes.find((a) => a.principal) ?? almacenes[0];
  const [tipo, setTipo] = useState<"entrada" | "salida" | "ajuste">("entrada");
  const [almacenId, setAlmacenId] = useState<string>(principal?.id ?? "");
  const [cantidad, setCantidad] = useState<number>(0);
  const [nuevaCantidad, setNuevaCantidad] = useState<number>(0);
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!almacenId) return toast.error("Selecciona almacén");
    setSaving(true);
    try {
      if (tipo === "ajuste") {
        const { error } = await supabase.rpc("ajustar_stock", {
          _producto: row.producto_id,
          _almacen: almacenId,
          _nueva_cantidad: nuevaCantidad,
          _notas: notas || null,
        });
        if (error) throw error;
      } else {
        if (cantidad <= 0) throw new Error("Cantidad debe ser > 0");
        const { error } = await supabase.from("movimientos_inventario").insert({
          tipo,
          producto_id: row.producto_id,
          almacen_id: almacenId,
          cantidad,
          notas: notas || null,
          referencia: "manual",
        });
        if (error) throw error;
      }
      toast.success("Movimiento registrado");
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-md rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Movimiento de inventario</h2>
        <p className="mb-4 text-sm text-muted-foreground">{row.nombre}</p>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-sm font-medium">Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as "entrada" | "salida" | "ajuste")} className="input mt-1">
              <option value="entrada">Entrada</option>
              <option value="salida">Salida</option>
              <option value="ajuste">Ajuste a cantidad exacta</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Almacén</label>
            <select value={almacenId} onChange={(e) => setAlmacenId(e.target.value)} className="input mt-1">
              {almacenes.map((a) => (
                <option key={a.id} value={a.id}>{a.nombre}{a.principal ? " (principal)" : ""}</option>
              ))}
            </select>
          </div>
          {tipo === "ajuste" ? (
            <div>
              <label className="text-sm font-medium">Nueva cantidad</label>
              <input type="number" step="0.01" min={0} value={nuevaCantidad}
                onChange={(e) => setNuevaCantidad(Number(e.target.value))} className="input mt-1" />
            </div>
          ) : (
            <div>
              <label className="text-sm font-medium">Cantidad</label>
              <input type="number" step="0.01" min={0} value={cantidad}
                onChange={(e) => setCantidad(Number(e.target.value))} className="input mt-1" />
            </div>
          )}
          <div>
            <label className="text-sm font-medium">Notas</label>
            <textarea rows={2} maxLength={300} value={notas}
              onChange={(e) => setNotas(e.target.value)} className="input mt-1" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Guardando…" : "Registrar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function HistorialModal({ row, onClose }: { row: StockRow; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["mov-hist", row.producto_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movimientos_inventario")
        .select("id, tipo, cantidad, referencia, notas, created_at, almacen:almacenes(nombre)")
        .eq("producto_id", row.producto_id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as unknown as Mov[];
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-2xl rounded-lg border border-border bg-card p-6">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Historial</h2>
            <p className="text-sm text-muted-foreground">{row.nombre}</p>
          </div>
          <button onClick={onClose} className="text-sm text-muted-foreground hover:underline">Cerrar</button>
        </div>
        {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {data && (
          <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Almacén</th>
                  <th className="px-3 py-2 text-right">Cantidad</th>
                  <th className="px-3 py-2">Ref / Notas</th>
                </tr>
              </thead>
              <tbody>
                {data.map((m) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(m.created_at).toLocaleString("es-MX")}
                    </td>
                    <td className="px-3 py-2">
                      <TipoTag tipo={m.tipo} />
                    </td>
                    <td className="px-3 py-2 text-xs">{m.almacen?.nombre ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {Number(m.cantidad)}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {m.referencia ?? ""}{m.notas ? ` · ${m.notas}` : ""}
                    </td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Sin movimientos.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function TipoTag({ tipo }: { tipo: string }) {
  const cls =
    tipo === "entrada" || tipo === "devolucion"
      ? "bg-emerald-500/10 text-emerald-600"
      : tipo === "venta" || tipo === "salida"
      ? "bg-rose-500/10 text-rose-600"
      : "bg-muted text-muted-foreground";
  return <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>{tipo}</span>;
}
