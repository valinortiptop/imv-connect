import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus } from "lucide-react";

type ItemRow = {
  id: string;
  oc_item_id: string | null;
  producto_id: string;
  clave: string;
  articulo: string;
  lote: string;
  caducidad: string;
  cantidad: number;
  costo_unitario: number;
};

/**
 * Corrección de un ingreso ya capturado: se cancela el ingreso original
 * (revirtiendo inventario y lo recibido en la OC) y se registra uno nuevo
 * con los datos corregidos, mediante la función `editar_recepcion`.
 */
export default function EditarRecepcionDialog({
  recepcionId,
  onClose,
  onSaved,
}: {
  recepcionId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<ItemRow[]>([]);
  const [factura, setFactura] = useState("");
  const [notas, setNotas] = useState("");

  const { isLoading } = useQuery({
    queryKey: ["recepcion-edit", recepcionId],
    queryFn: async () => {
      const { data: head, error: e1 } = await supabase
        .from("entradas_recepcion" as never)
        .select("*")
        .eq("id", recepcionId)
        .maybeSingle();
      if (e1) throw e1;
      const { data: items, error: e2 } = await supabase
        .from("entradas_recepcion_items" as never)
        .select("*, productos(sku, nombre)")
        .eq("recepcion_id", recepcionId);
      if (e2) throw e2;

      const h = head as unknown as { factura_proveedor: string | null; notas: string | null };
      setFactura(h?.factura_proveedor ?? "");
      setNotas(h?.notas ?? "");
      setRows(
        ((items ?? []) as unknown as Record<string, unknown>[]).map((i) => ({
          id: String(i.id),
          oc_item_id: (i.oc_item_id as string) ?? null,
          producto_id: String(i.producto_id),
          clave: ((i.productos as { sku?: string } | null)?.sku ?? "") as string,
          articulo: ((i.productos as { nombre?: string } | null)?.nombre ?? "") as string,
          lote: (i.lote as string) ?? "",
          caducidad: (i.caducidad as string) ?? "",
          cantidad: Number(i.cantidad ?? 0),
          costo_unitario: Number(i.costo_unitario ?? 0),
        })),
      );
      return head;
    },
  });

  const patch = (id: string, p: Partial<ItemRow>) =>
    setRows((s) => s.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const duplicate = (id: string) =>
    setRows((s) => {
      const src = s.find((r) => r.id === id);
      if (!src) return s;
      return [...s, { ...src, id: `${src.id}-${Math.random().toString(36).slice(2, 7)}`, lote: "", cantidad: 0 }];
    });

  const save = useMutation({
    mutationFn: async () => {
      const items = rows
        .filter((r) => r.cantidad > 0)
        .map((r) => ({
          oc_item_id: r.oc_item_id,
          producto_id: r.producto_id,
          lote: r.lote || null,
          caducidad: r.caducidad || null,
          cantidad: r.cantidad,
          costo_unitario: r.costo_unitario,
        }));
      if (items.length === 0) throw new Error("Captura al menos un renglón con cantidad");
      const { error } = await supabase.rpc("editar_recepcion" as never, {
        _rec: recepcionId,
        _items: items,
        _factura: factura || null,
        _notas: notas || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Recepción corregida · se generó un nuevo folio");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-4xl rounded-lg border border-border bg-card p-6">
        <h2 className="mb-1 text-lg font-semibold">Corregir recepción</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Se cancela el ingreso original (revirtiendo inventario y lo recibido en la OC) y se registra uno corregido.
        </p>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Cargando…</div>
        ) : (
          <>
            <div className="mb-3 grid gap-2 sm:grid-cols-2">
              <Input placeholder="Factura del proveedor" value={factura} onChange={(e) => setFactura(e.target.value)} />
              <Input placeholder="Notas / motivo de la corrección" value={notas} onChange={(e) => setNotas(e.target.value)} />
            </div>

            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.id} className="rounded-md border border-border p-3">
                  <div className="mb-2 text-sm font-medium">
                    {r.articulo} <span className="text-xs text-muted-foreground">({r.clave})</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-5">
                    <Input placeholder="Lote" value={r.lote} onChange={(e) => patch(r.id, { lote: e.target.value })} />
                    <Input
                      type="date"
                      value={r.caducidad}
                      onChange={(e) => patch(r.id, { caducidad: e.target.value })}
                    />
                    <Input
                      type="number"
                      step="0.01"
                      value={r.cantidad}
                      onChange={(e) => patch(r.id, { cantidad: Number(e.target.value) })}
                      placeholder="Cantidad"
                    />
                    <Input
                      type="number"
                      step="0.0001"
                      value={r.costo_unitario}
                      onChange={(e) => patch(r.id, { costo_unitario: Number(e.target.value) })}
                      placeholder="Costo"
                    />
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => duplicate(r.id)} title="Agregar otro lote">
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRows((s) => s.filter((x) => x.id !== r.id))}
                        title="Quitar renglón"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Cerrar
              </Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? "Guardando…" : "Guardar corrección"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
