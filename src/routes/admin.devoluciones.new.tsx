import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";

const searchSchema = z.object({
  factura: z.string().uuid().optional(),
});

export const Route = createFileRoute("/admin/devoluciones/new")({
  validateSearch: searchSchema,
  component: NuevaDevolucion,
});

type FacturaLite = {
  id: string;
  folio: string;
  cliente_id: string;
  cliente: { razon_social: string } | null;
  factura_items: {
    id: string;
    producto_id: string | null;
    nombre_snapshot: string;
    sku_snapshot: string | null;
    cantidad: number;
    precio_unitario: number;
    iva_pct: number;
  }[];
};

function NuevaDevolucion() {
  const search = Route.useSearch();
  const nav = useNavigate();
  const [facturaId, setFacturaId] = useState<string>(search.factura ?? "");
  const [almacenId, setAlmacenId] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  // por factura_item: { qty, reingreso }
  const [sel, setSel] = useState<Record<string, { qty: number; reingreso: boolean }>>({});

  const { data: facturas } = useQuery({
    queryKey: ["facturas-lookup"],
    queryFn: async () => {
      const { data } = await supabase
        .from("facturas")
        .select("id, folio, cliente:clientes(razon_social)")
        .neq("estado", "cancelada")
        .order("fecha_emision", { ascending: false })
        .limit(200);
      return (data ?? []) as { id: string; folio: string; cliente: { razon_social: string } | null }[];
    },
  });

  const facturaQ = useQuery({
    queryKey: ["factura-for-dev", facturaId],
    enabled: !!facturaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("facturas")
        .select("id, folio, cliente_id, cliente:clientes(razon_social), factura_items(id, producto_id, nombre_snapshot, sku_snapshot, cantidad, precio_unitario, iva_pct)")
        .eq("id", facturaId)
        .single();
      if (error) throw error;
      return data as unknown as FacturaLite;
    },
  });

  const { data: alms } = useQuery({
    queryKey: ["almacenes-activos-dev"],
    queryFn: async () => {
      const { data } = await supabase
        .from("almacenes")
        .select("id, nombre, principal")
        .eq("activo", true)
        .order("principal", { ascending: false });
      return (data ?? []) as { id: string; nombre: string; principal: boolean }[];
    },
  });

  // default almacen al principal
  if (!almacenId && alms && alms.length) {
    const p = alms.find((a) => a.principal) ?? alms[0];
    setTimeout(() => setAlmacenId(p.id), 0);
  }

  const crear = useMutation({
    mutationFn: async () => {
      const f = facturaQ.data;
      if (!f) throw new Error("Selecciona factura");
      if (!almacenId) throw new Error("Selecciona almacén");
      const lines = Object.entries(sel)
        .map(([fiId, v]) => ({ fiId, ...v }))
        .filter((l) => l.qty > 0);
      if (lines.length === 0) throw new Error("Selecciona al menos un producto");

      const { data: u } = await supabase.auth.getUser();
      const { data: dev, error } = await supabase
        .from("devoluciones")
        .insert({
          factura_id: f.id,
          cliente_id: f.cliente_id,
          almacen_id: almacenId,
          fecha,
          motivo: motivo || null,
          created_by: u.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      const devId = dev.id as string;

      const items = lines.map((l) => {
        const fi = f.factura_items.find((x) => x.id === l.fiId)!;
        return {
          devolucion_id: devId,
          factura_item_id: fi.id,
          producto_id: fi.producto_id,
          nombre_snapshot: fi.nombre_snapshot,
          cantidad: l.qty,
          precio_unitario: fi.precio_unitario,
          iva_pct: fi.iva_pct,
          reingreso_stock: l.reingreso,
        };
      });
      const { error: e2 } = await supabase.from("devolucion_items").insert(items);
      if (e2) throw e2;
      return devId;
    },
    onSuccess: (id) => {
      toast.success("Devolución creada en borrador");
      nav({ to: "/admin/devoluciones/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const f = facturaQ.data;
  const totalEstimado = f
    ? Object.entries(sel).reduce((acc, [fiId, v]) => {
        const fi = f.factura_items.find((x) => x.id === fiId);
        if (!fi || v.qty <= 0) return acc;
        return acc + v.qty * Number(fi.precio_unitario) * (1 + Number(fi.iva_pct) / 100);
      }, 0)
    : 0;

  return (
    <section className="space-y-6">
      <div>
        <Link to="/admin/devoluciones" className="text-xs text-muted-foreground hover:underline">← Devoluciones</Link>
        <h1 className="text-2xl font-bold">Nueva devolución</h1>
      </div>

      <div className="grid gap-4 rounded-md border border-border bg-card p-4 md:grid-cols-3">
        <div>
          <label className="text-sm font-medium">Factura</label>
          <select value={facturaId} onChange={(e) => { setFacturaId(e.target.value); setSel({}); }} className="input mt-1">
            <option value="">— Selecciona —</option>
            {facturas?.map((f) => (
              <option key={f.id} value={f.id}>{f.folio} · {f.cliente?.razon_social}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">Almacén destino</label>
          <select value={almacenId} onChange={(e) => setAlmacenId(e.target.value)} className="input mt-1">
            <option value="">— Selecciona —</option>
            {alms?.map((a) => (
              <option key={a.id} value={a.id}>{a.nombre}{a.principal ? " (principal)" : ""}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">Fecha</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="input mt-1" />
        </div>
        <div className="md:col-span-3">
          <label className="text-sm font-medium">Motivo</label>
          <input
            placeholder="Caducidad, producto dañado, error en pedido…"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={300}
            className="input mt-1"
          />
        </div>
      </div>

      {f && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2 text-right">Facturado</th>
                <th className="px-3 py-2 text-right">Cantidad a devolver</th>
                <th className="px-3 py-2 text-right">Precio</th>
                <th className="px-3 py-2">Reingreso a stock</th>
              </tr>
            </thead>
            <tbody>
              {f.factura_items.map((fi) => {
                const v = sel[fi.id] ?? { qty: 0, reingreso: true };
                return (
                  <tr key={fi.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <div className="font-medium">{fi.nombre_snapshot}</div>
                      <div className="text-xs text-muted-foreground">{fi.sku_snapshot ?? "—"}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(fi.cantidad)}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        max={Number(fi.cantidad)}
                        value={v.qty}
                        onChange={(e) =>
                          setSel({ ...sel, [fi.id]: { ...v, qty: Number(e.target.value) } })
                        }
                        className="input ml-auto w-28 text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">${Number(fi.precio_unitario).toFixed(2)}</td>
                    <td className="px-3 py-2">
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={v.reingreso}
                          onChange={(e) =>
                            setSel({ ...sel, [fi.id]: { ...v, reingreso: e.target.checked } })
                          }
                        />
                        Reingresar
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-border bg-muted/50">
              <tr>
                <td colSpan={4} className="px-3 py-2 text-right font-medium">Total estimado con IVA</td>
                <td className="px-3 py-2 text-right font-bold tabular-nums">${totalEstimado.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Link to="/admin/devoluciones" className="btn-secondary">Cancelar</Link>
        <button onClick={() => crear.mutate()} disabled={crear.isPending} className="btn-primary">
          {crear.isPending ? "Creando…" : "Crear borrador"}
        </button>
      </div>
    </section>
  );
}
