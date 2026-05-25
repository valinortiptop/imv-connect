import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/productos")({
  component: ProductosPage,
});

type ProductoRow = {
  id: string;
  sku: string | null;
  nombre: string;
  presentacion: string | null;
  categoria: string | null;
  precio_lista: number;
  activo: boolean;
  laboratorios: { nombre: string } | null;
};

function ProductosPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["productos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("productos")
        .select("id, sku, nombre, presentacion, categoria, precio_lista, activo, laboratorios(nombre)")
        .order("nombre");
      if (error) throw error;
      return data as unknown as ProductoRow[];
    },
  });

  return (
    <section>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Productos</h1>
          <p className="text-sm text-muted-foreground">
            Catálogo IMV — todos los laboratorios.
          </p>
        </div>
        <button
          disabled
          className="cursor-not-allowed rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground opacity-50"
        >
          Nuevo producto (próximamente)
        </button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          Error: {(error as Error).message}
          <p className="mt-2 text-xs opacity-80">
            ¿Ya corriste <code>db/migrations/0001_modulo_1_catalogo.sql</code> y llenaste{" "}
            <code>.env</code>?
          </p>
        </div>
      )}

      {data && data.length === 0 && (
        <p className="text-sm text-muted-foreground">Aún no hay productos.</p>
      )}

      {data && data.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">SKU</th>
                <th className="px-4 py-2">Nombre</th>
                <th className="px-4 py-2">Laboratorio</th>
                <th className="px-4 py-2">Presentación</th>
                <th className="px-4 py-2">Categoría</th>
                <th className="px-4 py-2 text-right">Precio lista</th>
                <th className="px-4 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-4 py-2 font-mono text-xs">{p.sku ?? "—"}</td>
                  <td className="px-4 py-2 font-medium">{p.nombre}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {p.laboratorios?.nombre ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{p.presentacion ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{p.categoria ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    ${Number(p.precio_lista).toFixed(2)}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        p.activo
                          ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600"
                          : "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                      }
                    >
                      {p.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
