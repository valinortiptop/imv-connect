/**
 * ClientPricesTab — manage per-client product price overrides.
 *
 * Empty by default — only shows the products this client has negotiated
 * custom prices for. New overrides are added via a product search dialog
 * so we never display a wall of 70+ toggles.
 *
 * Each row shows the product, the override price (editable), the
 * resolved margin (color-coded by health ≥10% green / 5-10% amber /
 * <5% red — matching the existing margin previews in NewOrderDialog),
 * and a comparison against the catalog + tier price so the user can
 * see where the negotiation lands.
 */

import { useState, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sortProducts } from "@/lib/sort-products";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ProductThumb } from "@/components/ui/product-thumb";
import {
  Plus,
  X,
  Search,
  Loader2,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ResolvedOverride {
  product_id: string;
  clave: string;
  name: string;
  image_url: string | null;
  override_price: number;
  notes: string | null;
  catalog_price: number | null;
  tier_price: number | null;
  cost_without_iva: number | null;
  cost_with_iva: number | null;
  bonificacion_pct: number | null;
  updated_at: string;
}

interface CandidateProduct {
  id: string;
  clave: string;
  name: string;
  image_url: string | null;
  sale_price_with_iva: number | null;
}

interface Props {
  clientId: string;
  /** "Habid", "Menudeo", or null if no tier */
  tierName: string | null;
  tierMarkupPct: number | null;
}

/** Tailwind class for a margin number — green if healthy, amber if low,
 *  red if critical. Mirrors the existing margin-preview thresholds. */
function marginColor(marginPct: number): string {
  if (marginPct >= 10) return "text-emerald-600 dark:text-emerald-400";
  if (marginPct >= 5) return "text-amber-500 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function fmtMXN(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(n);
}

/** Derive margin% from price-with-iva and cost-without-iva.
 *  price_no_iva = price / 1.16; margin = (price_no_iva - cost) / price_no_iva */
function deriveMargin(priceWithIva: number, costWithoutIva: number | null): number | null {
  if (!costWithoutIva || costWithoutIva <= 0) return null;
  const priceNoIva = priceWithIva / 1.16;
  if (priceNoIva <= 0) return null;
  return ((priceNoIva - costWithoutIva) / priceNoIva) * 100;
}

export function ClientPricesTab({ clientId, tierName, tierMarkupPct }: Props) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);

  const { data: overrides = [], isLoading } = useQuery({
    queryKey: ["client-resolved-prices", clientId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "get_client_resolved_prices",
        { p_client_id: clientId },
      );
      if (error) throw error;
      return (data ?? []) as ResolvedOverride[];
    },
  });

  const deleteOverride = useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await supabase
        .from("client_price_overrides")
        .delete()
        .eq("client_id", clientId)
        .eq("product_id", productId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-resolved-prices", clientId] });
      toast.success("Precio personalizado eliminado");
    },
    onError: (err: any) => {
      toast.error("Error: " + (err.message ?? "desconocido"));
    },
  });

  return (
    <div className="space-y-4">
      {/* Header strip with tier reminder + add button */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
        <div className="text-sm">
          <span className="font-semibold">
            {isLoading ? <Skeleton className="h-4 w-12 inline-block" /> : overrides.length}
          </span>{" "}
          <span className="text-muted-foreground">
            {overrides.length === 1 ? "precio personalizado" : "precios personalizados"}
          </span>
          <span className="text-muted-foreground"> · Tier: </span>
          <Badge variant="outline" className="bg-muted/30 font-mono text-[11px]">
            {tierName ?? "Catálogo"}
            {tierMarkupPct != null && (
              <span className="ml-1 opacity-70">
                ({tierMarkupPct > 0 ? "+" : ""}{tierMarkupPct}%)
              </span>
            )}
          </Badge>
        </div>
        <Button size="sm" onClick={() => setAdding(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Agregar precio personalizado
        </Button>
      </div>

      {/* Overrides list */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : overrides.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card/30 p-10 text-center space-y-2">
          <Tag className="h-8 w-8 mx-auto opacity-30" />
          <p className="text-sm text-muted-foreground">
            Este cliente paga el precio del tier o del catálogo en todos los productos.
          </p>
          <p className="text-xs text-muted-foreground">
            Agrega un precio personalizado si negociaste algo distinto.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {overrides.map((o) => (
            <OverrideRow
              key={o.product_id}
              clientId={clientId}
              row={o}
              onDelete={() => deleteOverride.mutate(o.product_id)}
              isDeleting={deleteOverride.isPending}
            />
          ))}
        </div>
      )}

      {adding && (
        <AddOverrideDialog
          open={adding}
          onOpenChange={setAdding}
          clientId={clientId}
          existingProductIds={new Set(overrides.map((o) => o.product_id))}
        />
      )}
    </div>
  );
}

function OverrideRow({
  clientId, row, onDelete, isDeleting,
}: {
  clientId: string;
  row: ResolvedOverride;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const qc = useQueryClient();
  const [draftPrice, setDraftPrice] = useState<string>(String(row.override_price));
  const [draftNotes, setDraftNotes] = useState<string>(row.notes ?? "");
  const draftPriceNum = parseFloat(draftPrice) || 0;
  const dirty =
    draftPriceNum !== row.override_price ||
    (draftNotes || null) !== (row.notes ?? null);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("client_price_overrides")
        .upsert({
          client_id: clientId,
          product_id: row.product_id,
          price_with_iva: draftPriceNum,
          notes: draftNotes.trim() || null,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-resolved-prices", clientId] });
      toast.success("Precio actualizado");
    },
    onError: (err: any) => {
      toast.error("Error: " + (err.message ?? "desconocido"));
    },
  });

  const margin = deriveMargin(draftPriceNum, row.cost_without_iva);
  const tierDelta = row.tier_price != null
    ? ((draftPriceNum - row.tier_price) / row.tier_price) * 100
    : null;

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      {/* Top row: product + price + remove */}
      <div className="flex items-center gap-3">
        <ProductThumb src={row.image_url} size="md" />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[11px] text-primary">{row.clave}</div>
          <div className="text-sm font-medium line-clamp-1">{row.name}</div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          disabled={isDeleting}
          className="h-8 w-8 text-muted-foreground hover:text-red-500 shrink-0"
          title="Quitar precio personalizado"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Price + margin grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
            Precio c/IVA
          </Label>
          <Input
            type="number"
            step="0.01"
            min={0}
            value={draftPrice}
            onChange={(e) => setDraftPrice(e.target.value)}
            className={cn(
              "h-9 text-sm tabular-nums font-semibold",
              dirty && "border-amber-500/60 focus-visible:ring-amber-500/60",
            )}
          />
          <div className="text-[10px] text-muted-foreground">
            Catálogo: {fmtMXN(row.catalog_price)} · Tier: {fmtMXN(row.tier_price)}
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
            Margen
          </Label>
          <div className={cn("text-2xl font-bold tabular-nums", margin != null ? marginColor(margin) : "text-muted-foreground")}>
            {margin != null ? `${margin.toFixed(1)}%` : "—"}
          </div>
          {tierDelta != null && (
            <div className="text-[10px] text-muted-foreground">
              vs tier:{" "}
              <span className={cn("font-semibold tabular-nums", tierDelta < 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}>
                {tierDelta > 0 ? "+" : ""}{tierDelta.toFixed(1)}%
              </span>
            </div>
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
            Nota
          </Label>
          <Input
            value={draftNotes}
            onChange={(e) => setDraftNotes(e.target.value)}
            placeholder="Ej. precio acordado en Mar 2026"
            className="h-9 text-sm"
          />
        </div>
      </div>

      {dirty && (
        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraftPrice(String(row.override_price));
              setDraftNotes(row.notes ?? "");
            }}
            disabled={save.isPending}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={() => save.mutate()}
            disabled={save.isPending || draftPriceNum <= 0}
            className="gap-1.5"
          >
            {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Guardar cambios
          </Button>
        </div>
      )}
    </div>
  );
}

function AddOverrideDialog({
  open, onOpenChange, clientId, existingProductIds,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clientId: string;
  existingProductIds: Set<string>;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CandidateProduct | null>(null);
  const [price, setPrice] = useState<string>("");

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products-for-override"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select("id, clave, name, image_url, sale_price_with_iva")
        .eq("active", true)
        .order("clave");
      if (error) throw error;
      return (data ?? []) as CandidateProduct[];
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = products.filter((p) => !existingProductIds.has(p.id));
    if (q) {
      list = list.filter(
        (p) =>
          p.clave.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q),
      );
    }
    // Match the brand priority used everywhere else in the app:
    // Ganador → Minino → Croqueta → rest alphabetical
    return sortProducts(list);
  }, [products, existingProductIds, search]);

  const create = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Selecciona un producto");
      const n = parseFloat(price);
      if (!n || n <= 0) throw new Error("Precio inválido");
      const { error } = await supabase
        .from("client_price_overrides")
        .insert({
          client_id: clientId,
          product_id: selected.id,
          price_with_iva: n,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-resolved-prices", clientId] });
      toast.success("Precio personalizado agregado");
      onOpenChange(false);
      setSelected(null);
      setPrice("");
      setSearch("");
    },
    onError: (err: any) => {
      toast.error("Error: " + (err.message ?? "desconocido"));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl w-[96vw] max-h-[90vh] p-0 overflow-hidden gap-0 flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
          <DialogTitle>Agregar precio personalizado</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Busca el producto y captura el precio acordado con este cliente.
          </p>
        </DialogHeader>

        <div className="px-6 py-4 flex-1 overflow-y-auto">
          {selected ? (
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
                <ProductThumb src={selected.image_url} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs text-primary">
                    {selected.clave}
                  </div>
                  <div className="text-base font-semibold leading-tight line-clamp-2">{selected.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Catálogo: <span className="font-mono">{fmtMXN(selected.sale_price_with_iva)}</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected(null)}
                  className="shrink-0"
                >
                  Cambiar
                </Button>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Precio personalizado (c/IVA)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  autoFocus
                  placeholder={
                    selected.sale_price_with_iva
                      ? String(selected.sale_price_with_iva)
                      : ""
                  }
                  className="h-10 text-lg font-bold tabular-nums"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar SKU o nombre..."
                  className="pl-8"
                />
              </div>
              {isLoading ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                  Cargando...
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  {search ? "Sin resultados" : "No hay productos disponibles para agregar"}
                </div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {filtered.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setSelected(p);
                        setPrice(
                          p.sale_price_with_iva ? String(p.sale_price_with_iva) : "",
                        );
                      }}
                      className="rounded-lg border bg-card p-3 flex items-center gap-3 text-left hover:bg-muted/40 hover:border-primary/40 transition"
                    >
                      <ProductThumb src={p.image_url} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-[10px] text-primary">
                          {p.clave}
                        </div>
                        <div className="text-xs font-medium leading-tight line-clamp-2">
                          {p.name}
                        </div>
                      </div>
                      <div className="text-xs tabular-nums shrink-0">
                        {fmtMXN(p.sale_price_with_iva)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="px-5 py-3 border-t">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={create.isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!selected || !price || create.isPending}
            className="gap-1.5"
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Agregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
