import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/compras/$id")({
  component: OCDetail,
});

type OC = {
  id: string;
  folio: string;
  estado: string;
  fecha_emision: string;
  fecha_esperada: string | null;
  fecha_recepcion: string | null;
  subtotal: number;
  iva: number;
  total: number;
  notas: string | null;
  laboratorio_id: string;
  almacen_id: string;
  laboratorios: { nombre: string } | null;
  almacenes: { nombre: string } | null;
};

type Item = {
  id: string;
  producto_id: string;
  cantidad: number;
  cantidad_recibida: number;
  costo_unitario: number;
  subtotal: number;
  productos: { sku: string | null; nombre: string; unidad: string } | null;
};

const ESTADOS: Record<string, string> = {
  borrador: "bg-muted text-muted-foreground",
  enviada: "bg-blue-500/10 text-blue-600",
  parcial: "bg-amber-500/10 text-amber-600",
  recibida: "bg-emerald-500/10 text-emerald-600",
  cancelada: "bg-rose-500/10 text-rose-600",
};

function OCDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [recOpen, setRecOpen] = useState(false);

  const ocQ = useQuery({
    queryKey: ["oc", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordenes_compra")
        .select("*, laboratorios(nombre), almacenes(nombre)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as unknown as OC;
    },
  });

  const itemsQ = useQuery({
    queryKey: ["oc-items", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("oc_items")
        .select("id, producto_id, cantidad, cantidad_recibida, costo_unitario, subtotal, productos(sku, nombre, unidad)")
        .eq("oc_id", id)
        .order("id");
      if (error) throw error;
      return data as unknown as Item[];
    },
  });

  const setEstado = useMutation({
    mutationFn: async (estado: string) => {
      const { error } = await supabase.from("ordenes_compra").update({ estado, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Estado actualizado");
      qc.invalidateQueries({ queryKey: ["oc", id] });
      qc.invalidateQueries({ queryKey: ["ordenes_compra"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from("oc_items").delete().eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oc-items", id] });
      qc.invalidateQueries({ queryKey: ["oc", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (ocQ.isLoading) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (!ocQ.data) return <p className="text-sm">No encontrada.</p>;
  const oc = ocQ.data;
  const items = itemsQ.data ?? [];
  const editable = oc.estado === "borrador" || oc.estado === "enviada" || oc.estado === "parcial";
  const recibible = oc.estado === "borrador" || oc.estado === "enviada" || oc.estado === "parcial";

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link to="/admin/compras" className="text-xs text-muted-foreground hover:underline">← Compras</Link>
          <h1 className="text-2xl font-bold">{oc.folio}</h1>
          <p className="text-sm text-muted-foreground">
            {oc.laboratorios?.nombre} → {oc.almacenes?.nombre}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs ${ESTADOS[oc.estado] ?? "bg-muted"}`}>{oc.estado}</span>
          {oc.estado === "borrador" && (
            <button onClick={() => setEstado.mutate("enviada")} className="btn-secondary">Marcar enviada</button>
          )}
          {recibible && (
            <button onClick={() => setRecOpen(true)} className="btn-primary">Recibir mercancía</button>
          )}
          {oc.estado !== "recibida" && oc.estado !== "cancelada" && (
            <button onClick={() => { if (confirm("¿Cancelar OC?")) setEstado.mutate("cancelada"); }} className="btn-secondary">
              Cancelar
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-md border border-border bg-card p-4 text-sm md:grid-cols-4">
        <div><div className="text-xs text-muted-foreground">Emisión</div><div>{oc.fecha_emision}</div></div>
        <div><div className="text-xs text-muted-foreground">Esperada</div><div>{oc.fecha_esperada ?? "—"}</div></div>
        <div><div className="text-xs text-muted-foreground">Recepción</div><div>{oc.fecha_recepcion ?? "—"}</div></div>
        <div><div className="text-xs text-muted-foreground">Total</div><div className="text-lg font-bold">${Number(oc.total).toFixed(2)}</div></div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Items</h2>
        {editable && (
          <button onClick={() => setAddOpen(true)} className="btn-secondary">+ Agregar producto</button>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Producto</th>
              <th className="px-3 py-2 text-right">Cantidad</th>
              <th className="px-3 py-2 text-right">Recibido</th>
              <th className="px-3 py-2 text-right">Costo</th>
              <th className="px-3 py-2 text-right">Subtotal</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-t border-border">
                <td className="px-3 py-2">
                  <div className="font-medium">{i.productos?.nombre}</div>
                  <div className="text-xs text-muted-foreground">{i.productos?.sku ?? "—"} · {i.productos?.unidad}</div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{Number(i.cantidad)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <span className={i.cantidad_recibida >= i.cantidad ? "text-emerald-600" : "text-amber-600"}>
                    {Number(i.cantidad_recibida)}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">${Number(i.costo_unitario).toFixed(2)}</td>
                <td className="px-3 py-2 text-right tabular-nums">${Number(i.subtotal).toFixed(2)}</td>
                <td className="px-3 py-2 text-right">
                  {editable && i.cantidad_recibida === 0 && (
                    <button onClick={() => { if (confirm("¿Eliminar?")) delItem.mutate(i.id); }} className="text-xs text-rose-600 hover:underline">
                      Eliminar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Sin items.</td></tr>
            )}
          </tbody>
          {items.length > 0 && (
            <tfoot className="border-t border-border bg-muted/50 text-sm">
              <tr>
                <td colSpan={4} className="px-3 py-2 text-right text-muted-foreground">Subtotal</td>
                <td className="px-3 py-2 text-right tabular-nums">${Number(oc.subtotal).toFixed(2)}</td>
                <td></td>
              </tr>
              <tr>
                <td colSpan={4} className="px-3 py-2 text-right text-muted-foreground">IVA (16%)</td>
                <td className="px-3 py-2 text-right tabular-nums">${Number(oc.iva).toFixed(2)}</td>
                <td></td>
              </tr>
              <tr>
                <td colSpan={4} className="px-3 py-2 text-right font-semibold">Total</td>
                <td className="px-3 py-2 text-right font-bold tabular-nums">${Number(oc.total).toFixed(2)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {oc.notas && (
        <div className="rounded-md border border-border bg-card p-3 text-sm">
          <div className="text-xs text-muted-foreground">Notas</div>
          <div>{oc.notas}</div>
        </div>
      )}

      {addOpen && (
        <AddItemModal
          ocId={id}
          laboratorioId={oc.laboratorio_id}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["oc-items", id] });
            qc.invalidateQueries({ queryKey: ["oc", id] });
            setAddOpen(false);
          }}
        />
      )}

      {recOpen && (
        <RecibirModal
          ocId={id}
          almacenId={oc.almacen_id}
          items={items}
          onClose={() => setRecOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["oc-items", id] });
            qc.invalidateQueries({ queryKey: ["oc", id] });
            qc.invalidateQueries({ queryKey: ["ordenes_compra"] });
            qc.invalidateQueries({ queryKey: ["v_stock_productos"] });
            qc.invalidateQueries({ queryKey: ["v_caducidades"] });
            setRecOpen(false);
          }}
        />
      )}
    </section>
  );
}

function AddItemModal({ ocId, laboratorioId, onClose, onSaved }: {
  ocId: string;
  laboratorioId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [prodId, setProdId] = useState("");
  const [cantidad, setCantidad] = useState<number>(0);
  const [costo, setCosto] = useState<number>(0);

  const { data: prods } = useQuery({
    queryKey: ["prods-lab", laboratorioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("productos")
        .select("id, sku, nombre, unidad, costo, precio_lista")
        .eq("laboratorio_id", laboratorioId)
        .eq("activo", true)
        .order("nombre");
      if (error) throw error;
      return data as { id: string; sku: string | null; nombre: string; unidad: string; costo: number | null; precio_lista: number }[];
    },
  });

  const onPick = (pid: string) => {
    setProdId(pid);
    const p = prods?.find((x) => x.id === pid);
    if (p?.costo) setCosto(Number(p.costo));
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!prodId) throw new Error("Selecciona producto");
      if (cantidad <= 0) throw new Error("Cantidad > 0");
      const { error } = await supabase.from("oc_items").insert({
        oc_id: ocId,
        producto_id: prodId,
        cantidad,
        costo_unitario: costo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Item agregado");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6">
        <h2 className="mb-3 text-lg font-semibold">Agregar producto</h2>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Producto</label>
            <select value={prodId} onChange={(e) => onPick(e.target.value)} className="input mt-1">
              <option value="">— Selecciona —</option>
              {prods?.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre} {p.sku ? `(${p.sku})` : ""}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Cantidad</label>
              <input type="number" step="0.01" min={0} value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} className="input mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Costo unitario</label>
              <input type="number" step="0.01" min={0} value={costo} onChange={(e) => setCosto(Number(e.target.value))} className="input mt-1" />
            </div>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            Subtotal: <span className="font-semibold text-foreground">${(cantidad * costo).toFixed(2)}</span>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={() => save.mutate()} disabled={save.isPending} className="btn-primary">
            {save.isPending ? "Guardando…" : "Agregar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RecibirModal({ ocId, almacenId, items, onClose, onSaved }: {
  ocId: string;
  almacenId: string;
  items: Item[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const pendientes = items.filter((i) => i.cantidad - i.cantidad_recibida > 0);
  const [qty, setQty] = useState<Record<string, number>>(
    Object.fromEntries(pendientes.map((i) => [i.id, i.cantidad - i.cantidad_recibida])),
  );
  const [lotes, setLotes] = useState<Record<string, string>>({});
  const [caducs, setCaducs] = useState<Record<string, string>>({});

  const recibir = useMutation({
    mutationFn: async () => {
      const payload = Object.entries(qty)
        .filter(([, v]) => v > 0)
        .map(([item_id, cantidad_recibir]) => ({ item_id, cantidad_recibir }));
      if (payload.length === 0) throw new Error("Nada que recibir");
      const { error } = await supabase.rpc("recibir_oc", { _oc: ocId, _items: payload });
      if (error) throw error;

      // Register batches (lote + caducidad) for lines that provided them
      const batchRows = pendientes
        .filter((i) => (qty[i.id] ?? 0) > 0 && (lotes[i.id] || caducs[i.id]))
        .map((i) => ({
          producto_id: i.producto_id,
          almacen_id: almacenId,
          lote: lotes[i.id] || null,
          caducidad: caducs[i.id] || null,
          cantidad: qty[i.id],
          costo_unitario: Number(i.costo_unitario),
          oc_id: ocId,
        }));
      if (batchRows.length > 0) {
        const { error: eB } = await supabase.from("product_batches").insert(batchRows);
        if (eB) throw eB;
      }
    },
    onSuccess: () => {
      toast.success("Recepción registrada · stock y lotes actualizados");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-2xl rounded-lg border border-border bg-card p-6">
        <h2 className="mb-1 text-lg font-semibold">Recibir mercancía</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Indica cantidad, lote y caducidad por línea. Se generarán entradas a inventario y se registrarán los lotes para trazabilidad.
        </p>
        {pendientes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay items pendientes.</p>
        ) : (
          <div className="space-y-2">
            {pendientes.map((i) => {
              const pend = Number(i.cantidad) - Number(i.cantidad_recibida);
              return (
                <div key={i.id} className="rounded-md border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{i.productos?.nombre}</div>
                      <div className="text-xs text-muted-foreground">
                        Pendiente: {pend} · Costo: ${Number(i.costo_unitario).toFixed(2)}
                      </div>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      max={pend}
                      value={qty[i.id] ?? 0}
                      onChange={(e) => setQty({ ...qty, [i.id]: Number(e.target.value) })}
                      className="input w-24 text-right"
                      placeholder="Cant."
                    />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={lotes[i.id] ?? ""}
                      onChange={(e) => setLotes({ ...lotes, [i.id]: e.target.value })}
                      className="input"
                      placeholder="Lote"
                      maxLength={60}
                    />
                    <input
                      type="date"
                      value={caducs[i.id] ?? ""}
                      onChange={(e) => setCaducs({ ...caducs, [i.id]: e.target.value })}
                      className="input"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button
            onClick={() => recibir.mutate()}
            disabled={recibir.isPending || pendientes.length === 0}
            className="btn-primary"
          >
            {recibir.isPending ? "Registrando…" : "Registrar recepción"}
          </button>
        </div>
      </div>
    </div>
  );
}
