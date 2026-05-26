/**
 * OverridesMatrixView — the "who pays what?" cross-client matrix.
 *
 * Rows: each client that has at least one override, plus reference rows
 * for the global tiers (Habid -4%, Menudeo +4%, etc.) and the catalog.
 * Columns: each product that any client has overridden.
 *
 * Cells: the override price for that (client, product) pair, or "—"
 * if the client uses tier/catalog pricing for that product. Tier and
 * catalog reference rows always show their resolved price for
 * comparison.
 *
 * Clicking a client row jumps to that client's Precios tab so the user
 * can edit the override in context.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface MatrixProduct {
  id: string;
  clave: string;
  name: string;
  catalog_price: number | null;
}
interface MatrixClient {
  client_id: string;
  name: string;
  tier: string;
  overrides: Record<string, number>; // product_id → price
}
interface MatrixTier {
  name: string;
  markup_pct: number | null;
  prices: Record<string, number>; // product_id → tier_price
}
interface MatrixData {
  products: MatrixProduct[];
  clients: MatrixClient[];
  tiers: MatrixTier[];
}

function fmtMXN(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function OverridesMatrixView() {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["overrides-matrix"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_overrides_matrix");
      if (error) throw error;
      return (data ?? { products: [], clients: [], tiers: [] }) as MatrixData;
    },
  });

  const products = data?.products ?? [];
  const clients = data?.clients ?? [];
  const tiers = data?.tiers ?? [];

  // Filter products by search query
  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.clave.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q),
    );
  }, [products, search]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-card/30 p-10 text-center space-y-2">
        <p className="text-sm text-muted-foreground">
          Aún no hay precios personalizados configurados.
        </p>
        <p className="text-xs text-muted-foreground">
          Agrega un precio en el tab "Precios" de cualquier cliente para
          que aparezca aquí.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{clients.length}</span> clientes con{" "}
          <span className="font-semibold text-foreground">{products.length}</span> SKUs personalizados
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar SKU o nombre..."
            className="pl-8 h-9 w-[260px]"
          />
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th
                className="sticky left-0 z-10 bg-muted/30 text-left px-3 py-2 font-semibold uppercase text-[10px] tracking-wide text-muted-foreground"
                style={{ minWidth: 180 }}
              >
                Cliente
              </th>
              {visibleProducts.map((p) => (
                <th
                  key={p.id}
                  className="text-right px-3 py-2 font-semibold uppercase text-[10px] tracking-wide text-muted-foreground whitespace-nowrap"
                  style={{ minWidth: 110 }}
                  title={p.name}
                >
                  <div className="font-mono text-primary">{p.clave}</div>
                  <div className="font-normal normal-case text-[10px] truncate max-w-[110px]">
                    {p.name}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {/* Catalog reference row */}
            <tr className="bg-muted/10">
              <td
                className="sticky left-0 z-10 bg-muted/10 px-3 py-2 font-medium text-xs"
                style={{ minWidth: 180 }}
              >
                <Badge variant="outline" className="bg-muted/40 font-normal">
                  Catálogo base
                </Badge>
              </td>
              {visibleProducts.map((p) => (
                <td
                  key={p.id}
                  className="text-right px-3 py-2 font-mono tabular-nums text-[11px] text-muted-foreground"
                >
                  {fmtMXN(p.catalog_price)}
                </td>
              ))}
            </tr>

            {/* Tier reference rows */}
            {tiers.map((t) => (
              <tr key={t.name} className="bg-muted/10">
                <td
                  className="sticky left-0 z-10 bg-muted/10 px-3 py-2 font-medium text-xs"
                  style={{ minWidth: 180 }}
                >
                  <Badge variant="outline" className="font-normal">
                    Tier {t.name}
                    {t.markup_pct != null && (
                      <span className="ml-1 opacity-70">
                        ({t.markup_pct > 0 ? "+" : ""}{t.markup_pct}%)
                      </span>
                    )}
                  </Badge>
                </td>
                {visibleProducts.map((p) => (
                  <td
                    key={p.id}
                    className="text-right px-3 py-2 font-mono tabular-nums text-[11px] text-muted-foreground"
                  >
                    {fmtMXN(t.prices[p.id] ?? null)}
                  </td>
                ))}
              </tr>
            ))}

            {/* Per-client override rows */}
            {clients.map((c) => (
              <tr key={c.client_id} className="hover:bg-muted/20">
                <td
                  className="sticky left-0 z-10 bg-card hover:bg-muted/20 px-3 py-2 font-medium"
                  style={{ minWidth: 180 }}
                >
                  <Link
                    to={`/clients/${c.client_id}?tab=precios`}
                    className="hover:underline text-foreground inline-flex items-center gap-2"
                  >
                    <span className="text-xs">{c.name}</span>
                    <Badge
                      variant="outline"
                      className="bg-muted/30 text-[9px] font-mono"
                    >
                      {c.tier}
                    </Badge>
                  </Link>
                </td>
                {visibleProducts.map((p) => {
                  const overridePrice = c.overrides[p.id];
                  // Compare against the tier or catalog price to show ▲/▼
                  // when this is meaningfully different.
                  let delta: number | null = null;
                  // Find the tier this client uses
                  const tier = tiers.find((t) => t.name === c.tier);
                  const ref =
                    tier?.prices[p.id] ??
                    p.catalog_price ??
                    null;
                  if (overridePrice != null && ref != null && ref > 0) {
                    delta = ((overridePrice - ref) / ref) * 100;
                  }
                  return (
                    <td
                      key={p.id}
                      className={cn(
                        "text-right px-3 py-2 font-mono tabular-nums text-xs",
                        overridePrice == null
                          ? "text-muted-foreground"
                          : "font-semibold",
                      )}
                    >
                      {overridePrice == null ? (
                        "—"
                      ) : (
                        <div className="space-y-0.5">
                          <div>{fmtMXN(overridePrice)}</div>
                          {delta != null && (
                            <div
                              className={cn(
                                "text-[9px] font-normal tabular-nums",
                                delta < 0
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-emerald-600 dark:text-emerald-400",
                              )}
                            >
                              {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-muted-foreground italic">
        Toca el nombre del cliente para abrir su tab "Precios" y editar
        directamente.
      </p>
    </div>
  );
}
