import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/portal/$token")({
  component: PortalCliente,
});

type CatalogoItem = {
  id: string;
  sku: string | null;
  nombre: string;
  descripcion: string | null;
  presentacion: string | null;
  especie: string[] | null;
  categoria: string | null;
  imagen_url: string | null;
  unidad: string;
  iva_pct: number;
  precio: number;
  laboratorio: { id: string; nombre: string; logo_url: string | null };
};

type CatalogoResponse = {
  cliente: { id: string; razon_social: string; nombre_comercial: string | null };
  productos: CatalogoItem[];
};

function PortalCliente() {
  const { token } = Route.useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ["portal-catalogo", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_catalog_for_token", { _token: token });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row as unknown as CatalogoResponse;
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Cargando catálogo…</p>
      </div>
    );
  }

  if (error || !data?.cliente) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold">Acceso no válido</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Este enlace no existe o fue desactivado. Contacta a tu representante IMV.
          </p>
        </div>
      </div>
    );
  }

  const productos = data.productos ?? [];
  const porLab = productos.reduce<Record<string, CatalogoItem[]>>((acc, p) => {
    const k = p.laboratorio.nombre;
    (acc[k] ??= []).push(p);
    return acc;
  }, {});

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-6 py-6">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">IMV Portal</p>
          <h1 className="mt-1 text-2xl font-bold">
            {data.cliente.nombre_comercial ?? data.cliente.razon_social}
          </h1>
          <p className="text-sm text-muted-foreground">Catálogo personalizado</p>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8">
        {productos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay productos disponibles.</p>
        ) : (
          Object.entries(porLab).map(([lab, items]) => (
            <section key={lab} className="mb-10">
              <h2 className="mb-4 text-lg font-semibold">{lab}</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((p) => (
                  <article
                    key={p.id}
                    className="overflow-hidden rounded-lg border border-border bg-card"
                  >
                    {p.imagen_url ? (
                      <img
                        src={p.imagen_url}
                        alt={p.nombre}
                        loading="lazy"
                        className="aspect-square w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-square w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                        Sin imagen
                      </div>
                    )}
                    <div className="p-4">
                      <h3 className="font-semibold leading-tight">{p.nombre}</h3>
                      {p.presentacion && (
                        <p className="text-xs text-muted-foreground">{p.presentacion}</p>
                      )}
                      <div className="mt-3 flex items-baseline justify-between">
                        <span className="text-lg font-bold tabular-nums">
                          ${Number(p.precio).toFixed(2)}
                        </span>
                        <span className="text-xs text-muted-foreground">/ {p.unidad}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </main>
  );
}
