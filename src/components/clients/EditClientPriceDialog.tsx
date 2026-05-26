/**
 * EditClientPriceDialog
 *
 * Edit per-client price overrides. Two modes:
 *   - "single": one product, used from the Catalogo card pencil icon
 *               or by clicking the amber "Personalizado" band.
 *   - "bulk":   many products at once, used from the Catalogo toolbar
 *               "Editar precios" button after multi-select.
 *
 * Both modes:
 *   - Show base catalog price as reference.
 *   - Show current override if one exists.
 *   - Quick-discount chips (-5 %, -8 %, -10 %, -15 %) below the input.
 *     Bulk mode applies the chip to every product at once.
 *   - "Quitar precio personalizado" button (single mode) to drop the row.
 *   - Save with optimistic invalidate of catalog + override queries.
 *
 * Margin / cost info is intentionally hidden — the user wanted the
 * Catalogo page to stay clean of cost data. The richer margin-aware
 * editor stays on ClientPricesTab.
 *
 * Brand: sm:max-w-5xl in single mode (gives the product card breathing
 * room) and sm:max-w-6xl in bulk mode (so the products table fits).
 * Horizontal layout, fixed heights, AlertDialog confirm on "Quitar".
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ProductThumb } from "@/components/ui/product-thumb";
import {
  BadgePercent,
  ArrowDown,
  ArrowUp,
  Loader2,
  Trash2,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface EditableProduct {
  id: string;
  clave: string;
  name: string;
  image_url: string | null;
  /** Base catalog price (sale_price_with_iva on products). Reference. */
  sale_price_with_iva: number | null;
  /** Active tier price (markup applied) — optional, just for display. */
  tier_price?: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clientId: string;
  clientLabel: string;
  /** Single mode: pass [product]. Bulk mode: pass all selected. */
  products: EditableProduct[];
  /** Current overrides per product_id. Missing key = no override yet. */
  currentOverrides: Map<string, number>;
  /** Optional tier label for context ("Mayoreo", "Menudeo", etc.) */
  tierLabel?: string;
  /** Optional: invalidate extra query keys after save (catalog page). */
  extraInvalidate?: string[];
}

// Quick adjustments applied to the BASE price. Negative = discount
// (sells cheaper to client — amber, lowers margin). Positive = markup
// (sells more expensive — emerald, raises margin).
const QUICK_CHIPS: Array<{ label: string; pct: number; tone: "discount" | "markup" }> = [
  { label: "−15 %", pct: -15, tone: "discount" },
  { label: "−10 %", pct: -10, tone: "discount" },
  { label: "−5 %",  pct: -5,  tone: "discount" },
  { label: "+5 %",  pct:  5,  tone: "markup"   },
  { label: "+10 %", pct:  10, tone: "markup"   },
  { label: "+15 %", pct:  15, tone: "markup"   },
];

function fmtMXN(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(n);
}

export function EditClientPriceDialog({
  open, onOpenChange, clientId, clientLabel,
  products, currentOverrides, tierLabel, extraInvalidate = [],
}: Props) {
  const qc = useQueryClient();
  const isBulk = products.length > 1;

  // SINGLE-mode state: just the price string.
  // BULK-mode state: map of product_id → price string (or empty/null).
  const [singlePrice, setSinglePrice] = useState<string>("");
  const [bulkPrices, setBulkPrices] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Re-seed inputs whenever the dialog re-opens with a different set
  // of products. Pre-fills with the current override if one exists,
  // otherwise empty so the placeholder ("base price") shows.
  useEffect(() => {
    if (!open) return;
    if (isBulk) {
      const init: Record<string, string> = {};
      for (const p of products) {
        const ov = currentOverrides.get(p.id);
        init[p.id] = ov != null ? String(ov) : "";
      }
      setBulkPrices(init);
      setSinglePrice("");
    } else if (products[0]) {
      const ov = currentOverrides.get(products[0].id);
      setSinglePrice(ov != null ? String(ov) : "");
      setBulkPrices({});
    }
  }, [open, products, currentOverrides, isBulk]);

  const singleProduct = !isBulk ? products[0] ?? null : null;
  const singleExisting = singleProduct ? currentOverrides.get(singleProduct.id) ?? null : null;
  const singleBase = singleProduct?.sale_price_with_iva ?? null;
  const singleNew = parseFloat(singlePrice);
  const singleDelta = singleBase != null && Number.isFinite(singleNew)
    ? singleNew - singleBase
    : null;
  const singlePct = singleBase != null && singleDelta != null && singleBase > 0
    ? (singleDelta / singleBase) * 100
    : null;

  /** Apply a percent discount to the base price. Quick chips call
   *  this; results are rounded to 2 decimals for currency. */
  const applyPct = (pct: number) => {
    if (isBulk) {
      const next: Record<string, string> = {};
      for (const p of products) {
        if (p.sale_price_with_iva == null) continue;
        const v = p.sale_price_with_iva * (1 + pct / 100);
        next[p.id] = (Math.round(v * 100) / 100).toFixed(2);
      }
      setBulkPrices(next);
    } else if (singleBase != null) {
      const v = singleBase * (1 + pct / 100);
      setSinglePrice((Math.round(v * 100) / 100).toFixed(2));
    }
  };

  /** Reset the input(s) to the product's base catalog price.
   *  Bulk mode fills every row with its own base. Same affordance as
   *  the percent chips but without any discount/markup applied. */
  const applyBase = () => {
    if (isBulk) {
      const next: Record<string, string> = {};
      for (const p of products) {
        if (p.sale_price_with_iva == null) continue;
        next[p.id] = p.sale_price_with_iva.toFixed(2);
      }
      setBulkPrices(next);
    } else if (singleBase != null) {
      setSinglePrice(singleBase.toFixed(2));
    }
  };

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["client-resolved-prices", clientId] });
    qc.invalidateQueries({ queryKey: ["catalogo-client-overrides", clientId] });
    qc.invalidateQueries({ queryKey: ["overrides-matrix"] });
    for (const k of extraInvalidate) qc.invalidateQueries({ queryKey: [k] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const rows: Array<{ client_id: string; product_id: string; price_with_iva: number }> = [];
      const removes: string[] = [];

      // Lookup base prices for the products in scope so we can
      // collapse "override == base" into a delete (no DB junk rows).
      const baseMap = new Map<string, number | null>();
      for (const p of products) baseMap.set(p.id, p.sale_price_with_iva);

      const collect = (productId: string, raw: string) => {
        const trimmed = raw.trim();
        if (trimmed === "") {
          // Empty input on a product that currently has an override
          // means "drop the override." Empty on a product with no
          // override means "do nothing."
          if (currentOverrides.has(productId)) removes.push(productId);
          return;
        }
        const n = parseFloat(trimmed);
        if (!Number.isFinite(n) || n <= 0) throw new Error(`Precio inválido para ${productId}`);
        // If the operator typed in (or quick-chip filled) a value
        // that matches the base price, treat it as a remove rather
        // than a useless upsert — keeps the override table clean
        // and avoids the "+$0.00 · 0%" cosmetic on the catalog card.
        const base = baseMap.get(productId);
        if (base != null && Math.abs(n - base) <= 0.01) {
          if (currentOverrides.has(productId)) removes.push(productId);
          return;
        }
        rows.push({ client_id: clientId, product_id: productId, price_with_iva: n });
      };

      if (isBulk) {
        for (const p of products) collect(p.id, bulkPrices[p.id] ?? "");
      } else if (singleProduct) {
        collect(singleProduct.id, singlePrice);
      }

      if (rows.length === 0 && removes.length === 0) {
        throw new Error("No hay cambios para guardar");
      }

      if (rows.length > 0) {
        const { error } = await (supabase as any)
          .from("client_price_overrides")
          .upsert(rows, { onConflict: "client_id,product_id" });
        if (error) throw error;
      }
      if (removes.length > 0) {
        const { error } = await supabase
          .from("client_price_overrides")
          .delete()
          .eq("client_id", clientId)
          .in("product_id", removes);
        if (error) throw error;
      }
      return { saved: rows.length, removed: removes.length };
    },
    onSuccess: ({ saved, removed }) => {
      invalidateAll();
      const parts: string[] = [];
      if (saved > 0) parts.push(`${saved} guardado${saved === 1 ? "" : "s"}`);
      if (removed > 0) parts.push(`${removed} eliminado${removed === 1 ? "" : "s"}`);
      toast.success(`Precios personalizados · ${parts.join(" · ")}`);
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast.error("Error: " + (err.message ?? "desconocido"));
    },
  });

  const removeSingle = useMutation({
    mutationFn: async () => {
      if (!singleProduct) return;
      const { error } = await supabase
        .from("client_price_overrides")
        .delete()
        .eq("client_id", clientId)
        .eq("product_id", singleProduct.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Precio personalizado eliminado");
      setConfirmRemove(false);
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast.error("Error al eliminar: " + (err.message ?? "desconocido"));
      setSubmitting(false);
    },
  });

  // Lightweight stats for the bulk header strip.
  const bulkStats = useMemo(() => {
    if (!isBulk) return null;
    let changed = 0;
    let totalDelta = 0;
    let totalBase = 0;
    for (const p of products) {
      const raw = (bulkPrices[p.id] ?? "").trim();
      if (raw === "") continue;
      const n = parseFloat(raw);
      if (!Number.isFinite(n) || n <= 0) continue;
      const base = p.sale_price_with_iva ?? 0;
      if (Math.abs(n - base) < 0.01) continue;
      changed += 1;
      totalDelta += n - base;
      totalBase += base;
    }
    const avgPct = totalBase > 0 ? (totalDelta / totalBase) * 100 : 0;
    return { changed, avgPct };
  }, [isBulk, products, bulkPrices]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn(
            "w-[96vw] max-h-[92vh] p-0 flex flex-col gap-0",
            isBulk ? "sm:max-w-6xl" : "sm:max-w-3xl",
          )}
        >
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle className="text-xl flex items-center gap-3 flex-wrap">
              <Pencil className="h-5 w-5 text-amber-500" />
              <span>
                {isBulk
                  ? `Editar precios personalizados · ${products.length} productos`
                  : "Editar precio personalizado"}
              </span>
              <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40">
                {clientLabel}
              </Badge>
              {tierLabel && (
                <Badge variant="outline" className="text-[10px]">
                  Tarifa: {tierLabel}
                </Badge>
              )}
            </DialogTitle>
            {!isBulk && singleProduct && (
              <p className="text-xs text-muted-foreground">
                Captura el precio acordado con este cliente. Si lo dejas vacío y ya había un precio personalizado, se elimina.
              </p>
            )}
            {isBulk && (
              <p className="text-xs text-muted-foreground">
                Usa los atajos de descuento o edita producto por producto. Dejar un precio vacío elimina el override.
              </p>
            )}
          </DialogHeader>

          {/* Ajuste rápido — single + bulk modes share this row.
              "Precio base" resets the input back to the list price.
              Negative chips lower the price (amber, lowers margin).
              Positive chips raise it (emerald, raises margin). All
              computed against the BASE catalog price, ignoring any
              current override. */}
          <div className="px-6 py-3 border-b shrink-0 flex items-center gap-2 flex-wrap">
            <BadgePercent className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {isBulk ? "Aplicar a todos" : "Ajuste rápido"}
            </span>
            <button
              type="button"
              onClick={applyBase}
              className="rounded-full border px-3 py-1 text-xs font-semibold transition active:scale-[0.97] border-border text-foreground hover:bg-muted/40"
              title="Restablecer el precio al valor del catálogo base."
            >
              Precio base
            </button>
            <span className="w-px h-5 bg-border" />
            {QUICK_CHIPS.map((c) => (
              <button
                key={c.pct}
                type="button"
                onClick={() => applyPct(c.pct)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold transition active:scale-[0.97]",
                  c.tone === "discount"
                    ? "border-amber-500/50 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                    : "border-emerald-500/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10",
                )}
              >
                {c.label}
              </button>
            ))}
            <span className="text-[10px] text-muted-foreground italic ml-2">
              Aplica el porcentaje sobre el precio base de cada producto.
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">
            {!isBulk && singleProduct ? (
              <SingleEditor
                product={singleProduct}
                value={singlePrice}
                onChange={setSinglePrice}
                existing={singleExisting}
                base={singleBase}
                delta={singleDelta}
                pct={singlePct}
              />
            ) : (
              <BulkEditor
                products={products}
                values={bulkPrices}
                onChange={(id, v) => setBulkPrices((m) => ({ ...m, [id]: v }))}
                stats={bulkStats!}
              />
            )}
          </div>

          <DialogFooter className="px-6 py-3 border-t shrink-0 gap-2 sm:gap-2">
            {!isBulk && singleExisting != null && (
              <Button
                variant="outline"
                onClick={() => setConfirmRemove(true)}
                disabled={save.isPending || removeSingle.isPending}
                className="mr-auto gap-1.5 border-red-500/40 text-red-700 dark:text-red-300 hover:bg-red-500/10"
              >
                <Trash2 className="h-4 w-4" />
                Quitar precio personalizado
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white min-w-[160px]"
            >
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Branded confirm for "Quitar override" — replaces the older
          window.confirm pattern. */}
      <AlertDialog
        open={confirmRemove}
        onOpenChange={(o) => { if (!o && !removeSingle.isPending) setConfirmRemove(false); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500" />
              Quitar precio personalizado
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-sm space-y-2">
                <div>
                  {singleProduct && (
                    <>
                      Este cliente volverá a ver el precio base / tarifa para{" "}
                      <span className="font-mono font-semibold">{singleProduct.clave}</span>.
                    </>
                  )}
                </div>
                <div className="text-muted-foreground">El historial del Kardex no se ve afectado.</div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeSingle.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeSingle.mutate()}
              disabled={removeSingle.isPending}
              className="gap-1.5 bg-red-500 hover:bg-red-600 text-white"
            >
              {removeSingle.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Sí, quitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Single-product editor body. 2-col layout: product card on the
 *  left, numeric input + live delta on the right. */
function SingleEditor({
  product, value, onChange, existing, base, delta, pct,
}: {
  product: EditableProduct;
  value: string;
  onChange: (v: string) => void;
  existing: number | null;
  base: number | null;
  delta: number | null;
  pct: number | null;
}) {
  const down = delta != null && delta < 0;
  const hasDelta = delta != null && Math.abs(delta) >= 0.01;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_1.1fr] gap-5 min-h-0">
      {/* LEFT — product info */}
      <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
        <ProductThumb src={product.image_url} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-xs text-primary">{product.clave}</div>
          <div className="text-base font-semibold leading-tight line-clamp-2">{product.name}</div>
          <div className="text-xs text-muted-foreground mt-2">
            Precio base · <span className="font-mono tabular-nums text-foreground">{fmtMXN(base)}</span>
          </div>
          {product.tier_price != null && product.tier_price !== base && (
            <div className="text-[11px] text-muted-foreground">
              Tarifa · <span className="font-mono tabular-nums">{fmtMXN(product.tier_price)}</span>
            </div>
          )}
          {existing != null && (
            <div className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold mt-0.5">
              Override actual · <span className="font-mono tabular-nums">{fmtMXN(existing)}</span>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT — input + live delta */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div>
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Precio personalizado (c/IVA)
          </Label>
          <Input
            type="number"
            step="0.01"
            min={0}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={base != null ? String(base) : ""}
            autoFocus
            className="h-12 text-2xl font-bold tabular-nums mt-1"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Deja vacío para usar el precio base / tarifa del cliente.
          </p>
        </div>

        {/* Live delta preview — colors reflect the impact on margin
            (the business perspective): a discount lowers margin →
            amber/warning. A markup raises margin → emerald/good. */}
        {hasDelta ? (
          <div
            className={cn(
              "rounded-lg border-2 px-3 py-2 flex items-center gap-2 text-sm font-bold tabular-nums",
              down
                ? "bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-300"
                : "bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
            )}
          >
            {down ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
            <span>{delta! > 0 ? "+" : ""}{fmtMXN(delta!)}</span>
            <span className="opacity-70">·</span>
            <span>{pct! > 0 ? "+" : ""}{pct!.toFixed(1)}%</span>
            <span className="text-xs font-normal opacity-80 ml-auto">
              vs precio base
            </span>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground italic">
            Sin cambio respecto al precio base.
          </div>
        )}
      </div>
    </div>
  );
}

/** Bulk editor body. Stats strip + scrollable table of products. */
function BulkEditor({
  products, values, onChange, stats,
}: {
  products: EditableProduct[];
  values: Record<string, string>;
  onChange: (id: string, v: string) => void;
  stats: { changed: number; avgPct: number };
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Productos" value={products.length} accent="muted" />
        <Stat label="Con cambio" value={stats.changed} accent="amber" />
        <Stat
          label="Δ promedio"
          value={`${stats.avgPct >= 0 ? "+" : ""}${stats.avgPct.toFixed(1)}%`}
          accent={stats.avgPct < 0 ? "emerald" : stats.avgPct > 0 ? "red" : "muted"}
          tabularStr
        />
        <Stat label="Cliente" value="Edición rápida" accent="muted" tabularStr />
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card border-b z-10">
              <tr className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="text-left px-3 py-2 w-14"></th>
                <th className="text-left px-3 py-2">SKU</th>
                <th className="text-left px-3 py-2">Producto</th>
                <th className="text-right px-3 py-2">Base</th>
                <th className="text-right px-3 py-2 w-[140px]">Personalizado</th>
                <th className="text-right px-3 py-2 w-[120px]">Δ</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {products.map((p) => {
                const raw = (values[p.id] ?? "").trim();
                const n = raw === "" ? null : parseFloat(raw);
                const base = p.sale_price_with_iva ?? 0;
                const valid = n != null && Number.isFinite(n) && n > 0;
                const delta = valid ? n! - base : null;
                const pct = valid && base > 0 ? (delta! / base) * 100 : null;
                const down = delta != null && delta < 0;
                return (
                  <tr key={p.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2">
                      <ProductThumb src={p.image_url} size="sm" />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-primary whitespace-nowrap">
                      {p.clave}
                    </td>
                    <td className="px-3 py-2 min-w-[220px]">
                      <div className="text-sm leading-tight line-clamp-2">{p.name}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-mono text-muted-foreground">
                      {fmtMXN(p.sale_price_with_iva)}
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        value={raw}
                        onChange={(e) => onChange(p.id, e.target.value)}
                        placeholder={p.sale_price_with_iva != null ? String(p.sale_price_with_iva) : ""}
                        className="h-9 text-right tabular-nums font-bold"
                      />
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {delta == null || Math.abs(delta) < 0.01 ? (
                        <span className="text-muted-foreground text-xs italic">—</span>
                      ) : (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-xs font-semibold tabular-nums",
                            // Down (discount) = amber, Up (markup) = emerald.
                            // Same convention as the SingleEditor delta band.
                            down
                              ? "text-amber-700 dark:text-amber-300"
                              : "text-emerald-700 dark:text-emerald-300",
                          )}
                        >
                          {down ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
                          {pct! > 0 ? "+" : ""}{pct!.toFixed(1)}%
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label, value, accent, tabularStr,
}: {
  label: string;
  value: number | string;
  accent: "muted" | "amber" | "emerald" | "red";
  tabularStr?: boolean;
}) {
  const styles = {
    muted:   "bg-muted/40 text-muted-foreground",
    amber:   "bg-amber-500/15 text-amber-500",
    emerald: "bg-emerald-500/15 text-emerald-500",
    red:     "bg-red-500/15 text-red-500",
  }[accent];
  const valCls = {
    muted:   "text-foreground",
    amber:   "text-amber-700 dark:text-amber-400",
    emerald: "text-emerald-700 dark:text-emerald-400",
    red:     "text-red-700 dark:text-red-400",
  }[accent];
  return (
    <div className="rounded-xl border bg-card p-3 flex items-center gap-3">
      <div className={cn("rounded-lg p-2 shrink-0", styles)}>
        <BadgePercent className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className={cn(
          "text-xl font-bold leading-tight truncate",
          tabularStr ? "tabular-nums" : (typeof value === "number" ? "tabular-nums" : ""),
          valCls,
        )}>
          {typeof value === "number" ? value.toLocaleString("es-MX") : value}
        </div>
        <div className="text-[11px] text-muted-foreground truncate">{label}</div>
      </div>
    </div>
  );
}
