import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { notifyEventFn } from "@/lib/notifications.functions";

export const Route = createFileRoute("/admin/devoluciones/$id")({
  component: DevolucionDetail,
});

type Dev = {
  id: string;
  folio: string;
  fecha: string;
  estado: "borrador" | "aplicada" | "cancelada";
  motivo: string | null;
  subtotal: number;
  iva: number;
  total: number;
  factura_id: string;
  facturas: { folio: string } | null;
  clientes: { razon_social: string } | null;
  almacenes: { nombre: string } | null;
  devolucion_items: {
    id: string;
    nombre_snapshot: string;
    cantidad: number;
    precio_unitario: number;
    iva_pct: number;
    importe: number;
    reingreso_stock: boolean;
  }[];
};

type NC = { id: string; folio: string; fecha: string; total: number };

const ESTADOS: Record<string, string> = {
  borrador: "bg-muted text-muted-foreground",
  aplicada: "bg-emerald-500/10 text-emerald-600",
  cancelada: "bg-rose-500/10 text-rose-600",
};

function DevolucionDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const devQ = useQuery({
    queryKey: ["dev", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devoluciones")
        .select(
          "id, folio, fecha, estado, motivo, subtotal, iva, total, factura_id, facturas(folio), clientes(razon_social), almacenes(nombre), devolucion_items(id, nombre_snapshot, cantidad, precio_unitario, iva_pct, importe, reingreso_stock)",
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as unknown as Dev;
    },
  });

  const ncQ = useQuery({
    queryKey: ["dev-nc", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("notas_credito")
        .select("id, folio, fecha, total")
        .eq("devolucion_id", id)
        .order("fecha", { ascending: false });
      return (data ?? []) as NC[];
    },
  });

  const aplicar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("aplicar_devolucion", { _dev: id });
      if (error) throw error;
      void notifyEventFn({
        data: {
          event: "devolucion_registrada",
          vars: {
            devolucion_id: id,
            folio: (devQ.data as any)?.folio ?? "",
            cliente: (devQ.data as any)?.cliente?.razon_social ?? "Cliente",
            total: (devQ.data as any)?.total ?? 0,
          },
        },
      }).catch(() => {});
    },
    onSuccess: () => {
      toast.success("Devolución aplicada · NC y stock actualizados");
      qc.invalidateQueries({ queryKey: ["dev", id] });
      qc.invalidateQueries({ queryKey: ["dev-nc", id] });
      qc.invalidateQueries({ queryKey: ["devoluciones"] });
      qc.invalidateQueries({ queryKey: ["v_stock_productos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("devoluciones")
        .update({ estado: "cancelada", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Devolución cancelada");
      qc.invalidateQueries({ queryKey: ["dev", id] });
      qc.invalidateQueries({ queryKey: ["devoluciones"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (devQ.isLoading) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  const d = devQ.data;
  if (!d) return <p className="text-sm">No encontrada.</p>;

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link to="/admin/devoluciones" className="text-xs text-muted-foreground hover:underline">← Devoluciones</Link>
          <h1 className="text-2xl font-bold">{d.folio}</h1>
          <p className="text-sm text-muted-foreground">
            Factura{" "}
            <Link to="/admin/facturas/$id" params={{ id: d.factura_id }} className="text-primary hover:underline">
              {d.facturas?.folio}
            </Link>{" "}
            · {d.clientes?.razon_social} → {d.almacenes?.nombre}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs ${ESTADOS[d.estado]}`}>{d.estado}</span>
          {d.estado === "borrador" && (
            <>
              <button onClick={() => aplicar.mutate()} disabled={aplicar.isPending} className="btn-primary">
                {aplicar.isPending ? "Aplicando…" : "Aplicar devolución"}
              </button>
              <button onClick={() => { if (confirm("¿Cancelar?")) cancelar.mutate(); }} className="btn-secondary">
                Cancelar
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-md border border-border bg-card p-4 text-sm md:grid-cols-4">
        <div><div className="text-xs text-muted-foreground">Fecha</div><div>{d.fecha}</div></div>
        <div><div className="text-xs text-muted-foreground">Motivo</div><div>{d.motivo ?? "—"}</div></div>
        <div><div className="text-xs text-muted-foreground">Subtotal</div><div>${Number(d.subtotal).toFixed(2)}</div></div>
        <div><div className="text-xs text-muted-foreground">Total</div><div className="text-lg font-bold">${Number(d.total).toFixed(2)}</div></div>
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">Items</h2>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2 text-right">Cantidad</th>
                <th className="px-3 py-2 text-right">Precio</th>
                <th className="px-3 py-2 text-right">IVA %</th>
                <th className="px-3 py-2">Reingreso</th>
                <th className="px-3 py-2 text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {d.devolucion_items.map((i) => (
                <tr key={i.id} className="border-t border-border">
                  <td className="px-3 py-2">{i.nombre_snapshot}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(i.cantidad)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">${Number(i.precio_unitario).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(i.iva_pct)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{i.reingreso_stock ? "sí" : "no"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">${Number(i.importe).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">Notas de crédito</h2>
        {(ncQ.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin notas de crédito aún.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Folio</th>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {(ncQ.data ?? []).map((nc) => (
                  <tr key={nc.id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">{nc.folio}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{nc.fecha}</td>
                    <td className="px-3 py-2 text-right tabular-nums">${Number(nc.total).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
