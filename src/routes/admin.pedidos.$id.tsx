import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/pedidos/$id")({
  component: PedidoDetalle,
});

type Estado = "pendiente" | "confirmado" | "enviado" | "entregado" | "cancelado";
const ESTADOS: Estado[] = ["pendiente", "confirmado", "enviado", "entregado", "cancelado"];

type Item = {
  id: string;
  producto_id: string;
  nombre_snapshot: string;
  sku_snapshot: string | null;
  unidad_snapshot: string;
  cantidad: number;
  precio_unitario: number;
  iva_pct: number;
  importe: number;
};

type Pedido = {
  id: string;
  folio: string;
  estado: Estado;
  subtotal: number;
  iva: number;
  total: number;
  comision_pct: number | null;
  comision_monto: number | null;
  notas_cliente: string | null;
  notas_internas: string | null;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  contacto_email: string | null;
  created_at: string;
  updated_at: string;
  cliente: {
    id: string;
    razon_social: string;
    nombre_comercial: string | null;
    rfc: string | null;
    email: string | null;
    telefono: string | null;
  } | null;
  representante: { id: string; nombre: string } | null;
  pedido_items: Item[];
};

function PedidoDetalle() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [internas, setInternas] = useState<string>("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["pedido", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select(
          "id, folio, estado, subtotal, iva, total, comision_pct, comision_monto, notas_cliente, notas_internas, contacto_nombre, contacto_telefono, contacto_email, created_at, updated_at, cliente:clientes(id, razon_social, nombre_comercial, rfc, email, telefono), representante:representantes(id, nombre), pedido_items(id, producto_id, nombre_snapshot, sku_snapshot, unidad_snapshot, cantidad, precio_unitario, iva_pct, importe)",
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      const p = data as unknown as Pedido;
      setInternas(p.notas_internas ?? "");
      return p;
    },
  });

  const setEstado = useMutation({
    mutationFn: async (estado: Estado) => {
      const { error } = await supabase.from("pedidos").update({ estado }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Estado actualizado");
      qc.invalidateQueries({ queryKey: ["pedido", id] });
      qc.invalidateQueries({ queryKey: ["pedidos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveNotas = useMutation({
    mutationFn: async (notas_internas: string) => {
      const { error } = await supabase.from("pedidos").update({ notas_internas }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => toast.success("Notas guardadas"),
    onError: (e: Error) => toast.error(e.message),
  });

  const factura = useQuery({
    queryKey: ["pedido-factura", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("facturas")
        .select("id, folio")
        .eq("pedido_id", id)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; folio: string } | null;
    },
  });

  const crearFactura = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("crear_factura_desde_pedido", {
        _pedido: id,
        _dias_credito: 30,
        _fecha_emision: null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (facturaId) => {
      toast.success("Factura creada");
      qc.invalidateQueries({ queryKey: ["pedido-factura", id] });
      qc.invalidateQueries({ queryKey: ["facturas"] });
      navigate({ to: "/admin/facturas/$id", params: { id: facturaId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (error) {
    return (
      <p className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
        {(error as Error).message}
      </p>
    );
  }
  if (!data) return null;

  return (
    <section className="space-y-6">
      <div>
        <Link to="/admin/pedidos" className="text-xs text-primary hover:underline">
          ← Pedidos
        </Link>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl sm:text-2xl font-bold font-mono break-all">{data.folio}</h1>
          <span className="text-xs sm:text-sm text-muted-foreground">
            {new Date(data.created_at).toLocaleString("es-MX")}
          </span>
        </div>

      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 rounded-md border border-border bg-card p-3 sm:p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">Productos</h2>

          {/* Table view: sm+ */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 text-left">Producto</th>
                  <th className="py-2 text-right">Cant.</th>
                  <th className="py-2 text-right">P. Unit.</th>
                  <th className="py-2 text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {data.pedido_items.map((it) => (
                  <tr key={it.id} className="border-t border-border">
                    <td className="py-2">
                      <div className="font-medium">{it.nombre_snapshot}</div>
                      <div className="text-xs text-muted-foreground">
                        {it.sku_snapshot ?? "—"} · {it.unidad_snapshot}
                      </div>
                    </td>
                    <td className="py-2 text-right tabular-nums">{Number(it.cantidad)}</td>
                    <td className="py-2 text-right tabular-nums">${Number(it.precio_unitario).toFixed(2)}</td>
                    <td className="py-2 text-right tabular-nums">${Number(it.importe).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Card view: mobile */}
          <ul className="sm:hidden divide-y divide-border">
            {data.pedido_items.map((it) => (
              <li key={it.id} className="py-2 first:pt-0">
                <div className="text-sm font-medium break-words">{it.nombre_snapshot}</div>
                <div className="text-xs text-muted-foreground">
                  {it.sku_snapshot ?? "—"} · {it.unidad_snapshot}
                </div>
                <div className="mt-1 flex justify-between text-xs tabular-nums">
                  <span className="text-muted-foreground">
                    {Number(it.cantidad)} × ${Number(it.precio_unitario).toFixed(2)}
                  </span>
                  <span className="font-semibold">${Number(it.importe).toFixed(2)}</span>
                </div>
              </li>
            ))}
          </ul>

          <dl className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular-nums">${Number(data.subtotal).toFixed(2)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">IVA</dt>
              <dd className="tabular-nums">${Number(data.iva).toFixed(2)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-1 text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">${Number(data.total).toFixed(2)}</dd>
            </div>
          </dl>
        </div>


        <div className="space-y-4">
          <div className="rounded-md border border-border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Estado</h2>
            <select
              value={data.estado}
              onChange={(e) => setEstado.mutate(e.target.value as Estado)}
              className="input w-full"
            >
              {ESTADOS.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>

          <div className="rounded-md border border-border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Facturación</h2>
            {factura.data ? (
              <Link
                to="/admin/facturas/$id"
                params={{ id: factura.data.id }}
                className="block rounded-md border border-border bg-muted/50 px-3 py-2 text-sm hover:bg-accent"
              >
                <div className="text-xs text-muted-foreground">Factura</div>
                <div className="font-mono font-semibold">{factura.data.folio}</div>
              </Link>
            ) : (
              <button
                onClick={() => crearFactura.mutate()}
                disabled={crearFactura.isPending || data.estado === "cancelado"}
                className="btn-primary w-full text-sm"
              >
                {crearFactura.isPending ? "Creando…" : "Crear factura"}
              </button>
            )}
          </div>


          <div className="rounded-md border border-border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Representante</h2>
            <p className="font-medium">{data.representante?.nombre ?? "Sin asignar"}</p>
            {data.representante && (
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">% Comisión</p>
                  <p className="font-semibold tabular-nums">
                    {data.comision_pct != null ? `${Number(data.comision_pct).toFixed(2)}%` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Monto</p>
                  <p className="font-semibold tabular-nums">
                    ${Number(data.comision_monto ?? 0).toFixed(2)}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-md border border-border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Cliente</h2>
            <p className="font-medium">
              {data.cliente?.nombre_comercial ?? data.cliente?.razon_social ?? "—"}
            </p>
            {data.cliente?.rfc && (
              <p className="text-xs font-mono text-muted-foreground">{data.cliente.rfc}</p>
            )}
            <div className="mt-2 text-xs text-muted-foreground">
              {data.cliente?.email && <div>{data.cliente.email}</div>}
              {data.cliente?.telefono && <div>{data.cliente.telefono}</div>}
            </div>
          </div>

          <div className="rounded-md border border-border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Contacto pedido</h2>
            <p className="text-sm">{data.contacto_nombre ?? "—"}</p>
            <div className="text-xs text-muted-foreground">
              {data.contacto_email && <div>{data.contacto_email}</div>}
              {data.contacto_telefono && <div>{data.contacto_telefono}</div>}
            </div>
            {data.notas_cliente && (
              <>
                <p className="mt-3 text-xs font-medium uppercase text-muted-foreground">Notas cliente</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{data.notas_cliente}</p>
              </>
            )}
          </div>

          <div className="rounded-md border border-border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Notas internas</h2>
            <textarea
              rows={4} value={internas}
              onChange={(e) => setInternas(e.target.value)}
              className="input w-full"
            />
            <button
              onClick={() => saveNotas.mutate(internas)}
              disabled={saveNotas.isPending}
              className="btn-primary mt-2 w-full text-sm"
            >
              {saveNotas.isPending ? "Guardando…" : "Guardar notas"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
