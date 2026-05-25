import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/clientes/$id/precios")({
  component: PreciosClientePage,
});

type Producto = {
  id: string;
  sku: string | null;
  nombre: string;
  presentacion: string | null;
  precio_lista: number;
  unidad: string;
  laboratorio: { nombre: string } | null;
};

type PrecioOverride = {
  id: string;
  cliente_id: string;
  producto_id: string;
  precio: number;
  vigente_desde: string;
  vigente_hasta: string | null;
};

function PreciosClientePage() {
  const { id: clienteId } = Route.useParams();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const cliente = useQuery({
    queryKey: ["cliente", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, razon_social, nombre_comercial")
        .eq("id", clienteId)
        .single();
      if (error) throw error;
      return data as { id: string; razon_social: string; nombre_comercial: string | null };
    },
  });

  const productos = useQuery({
    queryKey: ["productos-precios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("productos")
        .select(
          "id, sku, nombre, presentacion, precio_lista, unidad, laboratorio:laboratorios(nombre)",
        )
        .eq("activo", true)
        .order("nombre");
      if (error) throw error;
      return data as unknown as Producto[];
    },
  });

  const overrides = useQuery({
    queryKey: ["precios-cliente", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("precios_cliente")
        .select("id, cliente_id, producto_id, precio, vigente_desde, vigente_hasta")
        .eq("cliente_id", clienteId)
        .is("vigente_hasta", null);
      if (error) throw error;
      return data as PrecioOverride[];
    },
  });

  const overrideByProd = useMemo(() => {
    const m = new Map<string, PrecioOverride>();
    (overrides.data ?? []).forEach((o) => m.set(o.producto_id, o));
    return m;
  }, [overrides.data]);

  const upsert = useMutation({
    mutationFn: async ({ producto_id, precio }: { producto_id: string; precio: number }) => {
      const existing = overrideByProd.get(producto_id);
      if (existing) {
        const { error } = await supabase
          .from("precios_cliente")
          .update({ precio })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("precios_cliente").insert({
          cliente_id: clienteId,
          producto_id,
          precio,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) => {
      toast.success("Precio actualizado");
      setDrafts((d) => {
        const n = { ...d };
        delete n[v.producto_id];
        return n;
      });
      qc.invalidateQueries({ queryKey: ["precios-cliente", clienteId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("precios_cliente").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Override eliminado");
      qc.invalidateQueries({ queryKey: ["precios-cliente", clienteId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return productos.data ?? [];
    return (productos.data ?? []).filter(
      (p) =>
        p.nombre.toLowerCase().includes(f) ||
        (p.sku ?? "").toLowerCase().includes(f) ||
        (p.laboratorio?.nombre ?? "").toLowerCase().includes(f),
    );
  }, [productos.data, filter]);

  return (
    <section>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <Link to="/admin/clientes" className="text-xs text-primary hover:underline">
            ← Clientes
          </Link>
          <h1 className="mt-1 text-2xl font-bold">
            Precios · {cliente.data?.nombre_comercial ?? cliente.data?.razon_social ?? "…"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Define precios especiales por producto. Vacío = precio de lista.
          </p>
        </div>
        <input
          placeholder="Buscar producto…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="input max-w-xs"
        />
      </div>

      {(productos.isLoading || overrides.isLoading) && (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      )}

      {productos.data && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Laboratorio</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2 text-right">Lista</th>
                <th className="px-3 py-2 text-right">Precio cliente</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const ov = overrideByProd.get(p.id);
                const draftValue = drafts[p.id];
                const currentValue =
                  draftValue !== undefined ? draftValue : ov ? String(ov.precio) : "";
                return (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {p.laboratorio?.nombre ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{p.sku ?? "—"}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{p.nombre}</div>
                      {p.presentacion && (
                        <div className="text-xs text-muted-foreground">{p.presentacion}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      ${Number(p.precio_lista).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="—"
                        value={currentValue}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [p.id]: e.target.value }))
                        }
                        className="input w-28 text-right tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        disabled={
                          draftValue === undefined ||
                          draftValue === "" ||
                          Number(draftValue) === Number(ov?.precio)
                        }
                        onClick={() => {
                          const v = Number(draftValue);
                          if (!Number.isFinite(v) || v < 0) {
                            toast.error("Precio inválido");
                            return;
                          }
                          upsert.mutate({ producto_id: p.id, precio: v });
                        }}
                        className="mr-2 text-xs text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                      >
                        Guardar
                      </button>
                      {ov && (
                        <button
                          onClick={() => {
                            if (confirm("¿Eliminar override?")) remove.mutate(ov.id);
                          }}
                          className="text-xs text-destructive hover:underline"
                        >
                          Quitar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                    Sin productos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
