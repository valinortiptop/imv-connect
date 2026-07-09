import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getRepCatalogFn } from "@/lib/rep-field.functions";
import { getMyClientsFn } from "@/lib/rep.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageOff, Package, Search, ShoppingCart, Tag } from "lucide-react";
import AIPageInsights from "@/components/ai/AIPageInsights";

const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

function Page() {
  const [search, setSearch] = useState("");
  const [clientId, setClientId] = useState<string>("");
  const [zoom, setZoom] = useState<any | null>(null);

  const listClients = useServerFn(getMyClientsFn);
  const fetchCatalog = useServerFn(getRepCatalogFn);

  const clientsQ = useQuery({
    queryKey: ["rep-clientes-simple"],
    queryFn: () => listClients(),
  });

  const catQ = useQuery({
    queryKey: ["rep-catalog", clientId, search],
    queryFn: () =>
      fetchCatalog({
        data: {
          client_id: clientId || undefined,
          search: search || undefined,
          limit: 120,
        },
      }),
  });

  const products = catQ.data?.products ?? [];

  return (
    <div className="space-y-4">
      <AIPageInsights module="rep-inventario" />
      <div>
        <h1 className="text-2xl font-semibold">Catálogo</h1>
        <p className="text-sm text-muted-foreground">
          Vista para mostrar al cliente. Toca una foto para verla grande.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar producto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
        >
          <option value="">Sin lista de precios</option>
          {(clientsQ.data?.clients ?? []).map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.nickname || c.nombre_comercial || c.razon_social}
            </option>
          ))}
        </select>
      </div>

      {catQ.isLoading ? (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <Package className="mx-auto mb-2 h-8 w-8 opacity-40" />
            Sin productos.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p: any) => (
            <Card key={p.id} className="overflow-hidden">
              <button
                type="button"
                onClick={() => setZoom(p)}
                className="relative block h-40 w-full bg-muted"
              >
                {p.imagen_url ? (
                  <img
                    src={p.imagen_url}
                    alt={p.nombre}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <ImageOff className="h-8 w-8 opacity-40" />
                  </div>
                )}
                {p.promo && (
                  <Badge className="absolute left-2 top-2" variant="destructive">
                    <Tag className="mr-1 h-3 w-3" /> Promo
                  </Badge>
                )}
                <Badge
                  className="absolute right-2 top-2"
                  variant={p.stock_disponible > 0 ? "secondary" : "outline"}
                >
                  {p.stock_disponible > 0 ? `${p.stock_disponible}` : "Sin stock"}
                </Badge>
              </button>
              <CardContent className="space-y-1 p-3">
                <div className="line-clamp-2 text-sm font-medium">{p.nombre}</div>
                <div className="text-xs text-muted-foreground">
                  {p.lab_name ?? p.marca ?? "—"} {p.sku ? `· ${p.sku}` : ""}
                </div>
                <div className="flex items-baseline justify-between pt-1">
                  <span className="text-base font-semibold">{fmtMXN(Number(p.price))}</span>
                  {p.promo?.promo_cost_with_iva && (
                    <span className="text-xs text-emerald-600 line-through">
                      {fmtMXN(Number(p.promo.promo_cost_with_iva))}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {clientId && (
        <div className="fixed bottom-20 right-4 md:bottom-6">
          <Link
            to="/rep/clientes/$id"
            params={{ id: clientId }}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg"
          >
            <ShoppingCart className="h-4 w-4" /> Ir al cliente
          </Link>
        </div>
      )}

      {zoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setZoom(null)}
        >
          <div
            className="max-h-[90vh] max-w-lg overflow-hidden rounded-lg bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            {zoom.imagen_url ? (
              <img src={zoom.imagen_url} alt={zoom.nombre} className="max-h-[70vh] w-full object-contain" />
            ) : (
              <div className="flex h-64 items-center justify-center bg-muted">
                <ImageOff className="h-12 w-12 text-muted-foreground opacity-40" />
              </div>
            )}
            <div className="space-y-1 p-4">
              <h2 className="text-lg font-semibold">{zoom.nombre}</h2>
              <p className="text-sm text-muted-foreground">
                {zoom.lab_name ?? zoom.marca ?? "—"} {zoom.sku ? `· ${zoom.sku}` : ""}
              </p>
              <div className="flex items-baseline justify-between pt-2">
                <span className="text-xl font-semibold">{fmtMXN(Number(zoom.price))}</span>
                <Badge variant={zoom.stock_disponible > 0 ? "secondary" : "outline"}>
                  {zoom.stock_disponible > 0 ? `${zoom.stock_disponible} disp.` : "Sin stock"}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/rep/catalogo")({
  head: () => ({ meta: [{ title: "Catálogo · Panel Rep" }] }),
  component: Page,
});
