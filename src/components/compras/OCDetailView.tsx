import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { notifyEventFn } from "@/lib/notifications.functions";

import { Link } from "@tanstack/react-router";

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
  factura_proveedor: string | null;
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

export function OCDetailView({ id, embedded = false }: { id: string; embedded?: boolean }) {
  const [editOpen, setEditOpen] = useState(false);
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {!embedded && <Link to="/admin/compras/ordenes" className="text-xs text-muted-foreground hover:underline">← Órdenes</Link>}
          <h1 className={embedded ? "text-xl font-bold" : "text-2xl font-bold"}>{oc.folio}</h1>
          <p className="text-sm text-muted-foreground">
            {oc.laboratorios?.nombre} → {oc.almacenes?.nombre}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs ${ESTADOS[oc.estado] ?? "bg-muted"}`}>{oc.estado}</span>
          {editable && (
            <button onClick={() => setEditOpen(true)} className="btn-secondary">Editar</button>
          )}
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

      {editOpen && (
        <EditOCModal
          oc={oc}
          items={items}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["oc", id] });
            qc.invalidateQueries({ queryKey: ["ordenes_compra"] });
            qc.invalidateQueries({ queryKey: ["oc-changes", id] });
            qc.invalidateQueries({ queryKey: ["oc-items", id] });
            setEditOpen(false);
          }}
        />
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
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

type LoteRow = { lote: string; caducidad: string; cantidad: number };

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
  const [lotesByItem, setLotesByItem] = useState<Record<string, LoteRow[]>>(
    Object.fromEntries(pendientes.map((i) => [i.id, [{ lote: "", caducidad: "", cantidad: i.cantidad - i.cantidad_recibida }]])),
  );

  const addLote = (itemId: string) => {
    setLotesByItem((s) => ({ ...s, [itemId]: [...(s[itemId] ?? []), { lote: "", caducidad: "", cantidad: 0 }] }));
  };
  const removeLote = (itemId: string, idx: number) => {
    setLotesByItem((s) => ({ ...s, [itemId]: (s[itemId] ?? []).filter((_, i) => i !== idx) }));
  };
  const updateLote = (itemId: string, idx: number, patch: Partial<LoteRow>) => {
    setLotesByItem((s) => ({
      ...s,
      [itemId]: (s[itemId] ?? []).map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    }));
  };

  const today = new Date();
  const dayMs = 86400000;
  const daysUntil = (iso: string) => Math.floor((new Date(iso).getTime() - today.getTime()) / dayMs);

  const recibir = useMutation({
    mutationFn: async () => {
      const payload: { item_id: string; cantidad_recibir: number }[] = [];
      const allBatches: any[] = [];

      for (const i of pendientes) {
        const cantidad = qty[i.id] ?? 0;
        if (cantidad <= 0) continue;
        const lotes = (lotesByItem[i.id] ?? []).filter((l) => l.lote || l.caducidad || l.cantidad > 0);

        // If user filled any lote data, require sum match cantidad
        if (lotes.length > 0) {
          const sum = lotes.reduce((s, l) => s + Number(l.cantidad || 0), 0);
          if (Math.abs(sum - cantidad) > 0.001) {
            throw new Error(`${i.productos?.nombre}: la suma de lotes (${sum}) no coincide con la cantidad a recibir (${cantidad}).`);
          }
          for (const l of lotes) {
            if (l.cantidad <= 0) continue;
            allBatches.push({
              producto_id: i.producto_id,
              almacen_id: almacenId,
              lote: l.lote || null,
              caducidad: l.caducidad || null,
              cantidad: l.cantidad,
              costo_unitario: Number(i.costo_unitario),
              oc_id: ocId,
            });
          }
        }

        payload.push({ item_id: i.id, cantidad_recibir: cantidad });
      }

      if (payload.length === 0) throw new Error("Nada que recibir");
      const { error } = await supabase.rpc("recibir_oc", { _oc: ocId, _items: payload });
      if (error) throw error;
      if (allBatches.length > 0) {
        const { error: eB } = await supabase.from("product_batches").insert(allBatches);
        if (eB) throw eB;
      }
      const { data: ocInfo } = await supabase
        .from("ordenes_compra")
        .select("folio, laboratorios(nombre)")
        .eq("id", ocId)
        .maybeSingle();
      void notifyEventFn({
        data: {
          event: "oc_recibida",
          vars: {
            oc_id: ocId,
            folio: (ocInfo as any)?.folio ?? "",
            proveedor: (ocInfo as any)?.laboratorios?.nombre ?? "Proveedor",
            estado: "recibida",
            piezas: payload.reduce((a: number, it: any) => a + Number(it.cantidad || 0), 0),
          },
        },
      }).catch(() => {});
    },
    onSuccess: () => {
      toast.success("Recepción registrada · stock y lotes actualizados");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-3xl rounded-lg border border-border bg-card p-6">
        <h2 className="mb-1 text-lg font-semibold">Recibir mercancía</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Puedes registrar múltiples lotes por línea. Si capturas lotes, la suma debe coincidir con la cantidad recibida.
        </p>
        {pendientes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay items pendientes.</p>
        ) : (
          <div className="space-y-3">
            {pendientes.map((i) => {
              const pend = Number(i.cantidad) - Number(i.cantidad_recibida);
              const lotes = lotesByItem[i.id] ?? [];
              const sumLotes = lotes.reduce((s, l) => s + Number(l.cantidad || 0), 0);
              const hasLoteData = lotes.some((l) => l.lote || l.caducidad || l.cantidad > 0);
              const mismatch = hasLoteData && Math.abs(sumLotes - (qty[i.id] ?? 0)) > 0.001;
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

                  <div className="mt-3 space-y-1.5">
                    {lotes.map((l, idx) => {
                      const dias = l.caducidad ? daysUntil(l.caducidad) : null;
                      const vencido = dias != null && dias < 0;
                      const corto = dias != null && dias >= 0 && dias < 90;
                      return (
                        <div key={idx} className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={l.lote}
                            onChange={(e) => updateLote(i.id, idx, { lote: e.target.value })}
                            className="input flex-1 min-w-[100px]"
                            placeholder="Lote"
                            maxLength={60}
                          />
                          <input
                            type="date"
                            value={l.caducidad}
                            onChange={(e) => updateLote(i.id, idx, { caducidad: e.target.value })}
                            className={cn("input w-40", vencido && "border-rose-500", corto && "border-amber-500")}
                          />
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            value={l.cantidad}
                            onChange={(e) => updateLote(i.id, idx, { cantidad: Number(e.target.value) })}
                            className="input w-24 text-right"
                            placeholder="Cant."
                          />
                          {lotes.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLote(i.id, idx)}
                              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                            >
                              −
                            </button>
                          )}
                          {dias != null && (
                            <span className={cn("text-xs tabular-nums",
                              vencido ? "text-rose-600 font-medium" : corto ? "text-amber-600" : "text-muted-foreground")}>
                              {vencido ? `Vencido (${Math.abs(dias)}d)` : `${dias}d`}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => addLote(i.id)}
                        className="text-xs text-primary hover:underline"
                      >
                        + Agregar lote
                      </button>
                      {mismatch && (
                        <span className="text-xs text-rose-600">
                          Σ lotes = {sumLotes} ≠ recibido {qty[i.id] ?? 0}
                        </span>
                      )}
                    </div>
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

type EditRow = { key: string; id: string | null; producto_id: string; cantidad: number; costo_unitario: number; recibida: number };

function EditOCModal({ oc, items, onClose, onSaved }: { oc: OC; items: Item[]; onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useState<EditRow[]>(() => items.map((i) => ({
    key: i.id, id: i.id, producto_id: i.producto_id, cantidad: Number(i.cantidad), costo_unitario: Number(i.costo_unitario), recibida: Number(i.cantidad_recibida ?? 0),
  })));
  const [removed, setRemoved] = useState<string[]>([]);
  const [laboratorioId, setLaboratorioId] = useState(oc.laboratorio_id);
  const [almacenId, setAlmacenId] = useState(oc.almacen_id);
  const [fechaEsperada, setFechaEsperada] = useState(oc.fecha_esperada ?? "");
  const [factura, setFactura] = useState(oc.factura_proveedor ?? "");
  const [notas, setNotas] = useState(oc.notas ?? "");
  const [saving, setSaving] = useState(false);
  const labsQ = useQuery({
    queryKey: ["laboratorios-activos"],
    queryFn: async () => (await supabase.from("laboratorios").select("id, nombre").eq("activo", true).order("nombre")).data ?? [],
  });
  const almQ = useQuery({
    queryKey: ["almacenes-activos"],
    queryFn: async () => (await supabase.from("almacenes").select("id, nombre").eq("activo", true).order("nombre")).data ?? [],
  });
  const prodsQ = useQuery({
    queryKey: ["prods-lab", laboratorioId],
    queryFn: async () => {
      const { data, error } = await supabase.from("productos").select("id, sku, nombre, costo").eq("laboratorio_id", laboratorioId).eq("activo", true).order("nombre");
      if (error) throw error;
      return data as { id: string; sku: string | null; nombre: string; costo: number | null }[];
    },
  });
  const prodOptions = (() => {
    const list = [...(prodsQ.data ?? [])];
    for (const it of items) if (!list.some((p) => p.id === it.producto_id)) list.push({ id: it.producto_id, sku: it.productos?.sku ?? null, nombre: it.productos?.nombre ?? "Producto", costo: null });
    return list;
  })();
  const upd = (key: string, patch: Partial<EditRow>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const total = rows.reduce((a, r) => a + r.cantidad * r.costo_unitario, 0);
  const save = async () => {
    for (const r of rows) {
      if (!r.producto_id) return toast.error("Selecciona el producto en todas las líneas");
      if (!(r.cantidad > 0)) return toast.error("Las piezas deben ser mayores a 0");
      if (r.cantidad < r.recibida) return toast.error(`No puedes pedir menos de lo ya recibido (${r.recibida})`);
      if (!(r.costo_unitario >= 0)) return toast.error("El precio no puede ser negativo");
    }
    setSaving(true);
    for (const rid of removed) {
      const { error } = await supabase.from("oc_items").delete().eq("id", rid);
      if (error) { setSaving(false); return toast.error(error.message); }
    }
    for (const r of rows) {
      const orig = items.find((i) => i.id === r.id);
      if (r.id && orig) {
        if (orig.producto_id === r.producto_id && Number(orig.cantidad) === r.cantidad && Number(orig.costo_unitario) === r.costo_unitario) continue;
        const { error } = await supabase.from("oc_items").update({ producto_id: r.producto_id, cantidad: r.cantidad, costo_unitario: r.costo_unitario }).eq("id", r.id);
        if (error) { setSaving(false); return toast.error(error.message); }
      } else {
        const { error } = await supabase.from("oc_items").insert({ oc_id: oc.id, producto_id: r.producto_id, cantidad: r.cantidad, costo_unitario: r.costo_unitario });
        if (error) { setSaving(false); return toast.error(error.message); }
      }
    }
    const { error } = await supabase.from("ordenes_compra").update({
      laboratorio_id: laboratorioId,
      almacen_id: almacenId,
      fecha_esperada: fechaEsperada || null,
      factura_proveedor: factura.trim() || null,
      notas: notas.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq("id", oc.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Orden actualizada");
    onSaved();
  };
  const field = "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/40 p-4" role="dialog" aria-modal="true" aria-label="Editar orden">
      <div className="max-h-[90vh] w-full max-w-3xl space-y-3 overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-lg">
        <h3 className="text-lg font-semibold">Editar {oc.folio}</h3>
        <label className="block text-sm">Laboratorio
          <select className={field} value={laboratorioId} onChange={(e) => setLaboratorioId(e.target.value)}>
            {(labsQ.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        </label>
        <label className="block text-sm">Almacén
          <select className={field} value={almacenId} onChange={(e) => setAlmacenId(e.target.value)}>
            {(almQ.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">Fecha esperada
            <input type="date" className={field} value={fechaEsperada} onChange={(e) => setFechaEsperada(e.target.value)} />
          </label>
          <label className="block text-sm">Factura proveedor
            <input className={field} value={factura} onChange={(e) => setFactura(e.target.value)} />
          </label>
        </div>
        <label className="block text-sm">Notas
          <textarea className={field} rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} />
        </label>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Productos</h4>
            <button type="button" className="btn-secondary text-xs" onClick={() => setRows((r) => [...r, { key: crypto.randomUUID(), id: null, producto_id: "", cantidad: 1, costo_unitario: 0, recibida: 0 }])}>+ Agregar producto</button>
          </div>
          {rows.length === 0 && <p className="text-sm text-muted-foreground">Sin productos.</p>}
          {rows.map((r) => (
            <div key={r.key} className="grid grid-cols-2 gap-2 rounded-md border border-border p-2 sm:grid-cols-[1fr_90px_110px_90px_auto] sm:items-end">
              <label className="col-span-2 block text-xs sm:col-span-1">Producto
                <select className={field} value={r.producto_id} disabled={r.recibida > 0} onChange={(e) => {
                  const p = prodOptions.find((x) => x.id === e.target.value);
                  upd(r.key, { producto_id: e.target.value, ...(p?.costo != null && !r.id ? { costo_unitario: Number(p.costo) } : {}) });
                }}>
                  <option value="">— Selecciona —</option>
                  {prodOptions.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.sku ? ` (${p.sku})` : ""}</option>)}
                </select>
              </label>
              <label className="block text-xs">Piezas
                <input type="number" min={r.recibida || 0} step="1" className={field} value={r.cantidad} onChange={(e) => upd(r.key, { cantidad: Number(e.target.value) })} />
              </label>
              <label className="block text-xs">Precio unitario
                <input type="number" min={0} step="0.01" className={field} value={r.costo_unitario} onChange={(e) => upd(r.key, { costo_unitario: Number(e.target.value) })} />
              </label>
              <div className="text-xs">Subtotal<div className="py-2 text-sm font-semibold">${(r.cantidad * r.costo_unitario).toFixed(2)}</div></div>
              <button type="button" className="btn-secondary text-xs disabled:opacity-50" disabled={r.recibida > 0}
                title={r.recibida > 0 ? `Ya se recibieron ${r.recibida}` : "Quitar"}
                onClick={() => { if (r.id) setRemoved((x) => [...x, r.id!]); setRows((x) => x.filter((y) => y.key !== r.key)); }}>Quitar</button>
              {r.recibida > 0 && <p className="col-span-2 text-xs text-muted-foreground sm:col-span-5">Recibidas: {r.recibida}. No se puede cambiar el producto ni bajar de esa cantidad.</p>}
            </div>
          ))}
          <p className="text-right text-sm text-muted-foreground">Subtotal productos: <span className="font-semibold text-foreground">${total.toFixed(2)}</span></p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary">{saving ? "Guardando…" : "Guardar"}</button>
        </div>
      </div>
    </div>
  );
}
