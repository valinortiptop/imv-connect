// @ts-nocheck
/**
 * EditQuoteSheet — lightweight editor for cotizaciones (quotes).
 *
 * Quotes are mock-ups that don't touch real stock. So unlike EditOrderSheet,
 * this component skips: damaged-batch picker, status workflow, urgency flag.
 * It edits client info, delivery date, payment method, price list, lines.
 */

import { useEffect, useState } from "react";
import { resolveListPrice } from "@/lib/price-list-math";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProductThumb } from "@/components/ui/product-thumb";
import { toast } from "sonner";
import { Trash2, Loader2 } from "lucide-react";
import { sortProducts } from "@/lib/sort-products";

const schema = z.object({
  delivery_date: z.string().optional(),
  payment_method: z.string().optional(),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

interface QuoteLine {
  id?: string;
  product_id: string;
  clave: string;
  name: string;
  image_url?: string | null;
  quantity: number | "";
  unit_price: number;
  isNew?: boolean;
}

interface EditQuoteSheetProps {
  quoteId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(n);

export function EditQuoteSheet({ quoteId, open, onOpenChange, onUpdated }: EditQuoteSheetProps) {
  const qc = useQueryClient();
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [deletedLineIds, setDeletedLineIds] = useState<string[]>([]);
  const [appliedPriceList, setAppliedPriceList] = useState<{ id: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { delivery_date: "", payment_method: "Transferencia", notes: "" },
  });

  // Quote header
  const { data: quote } = useQuery({
    queryKey: ["edit-quote", quoteId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("quotes")
        .select("*, clients(name, price_list_id)")
        .eq("id", quoteId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!quoteId && open,
  });

  // Quote items
  const { data: items = [] } = useQuery({
    queryKey: ["edit-quote-items", quoteId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("quote_items")
        .select("id, product_id, product_name, quantity, unit_price, products(clave, name, sale_price_with_iva, image_url)")
        .eq("quote_id", quoteId!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!quoteId && open,
  });

  // Catalog products
  const { data: products = [] } = useQuery({
    queryKey: ["products-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, clave, name, sale_price_with_iva, image_url")
        .eq("active", true)
        .order("clave");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: priceLists = [] } = useQuery({
    queryKey: ["price-lists-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("price_lists").select("id, name, markup_pct").eq("active", true).order("name") as any;
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; markup_pct: number | null }[];
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: allPriceListItems = [] } = useQuery({
    queryKey: ["price-list-all-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("price_list_items")
        .select("price_list_id, product_id, price_with_iva") as any;
      if (error) throw error;
      return (data ?? []) as { price_list_id: string; product_id: string; price_with_iva: number }[];
    },
    staleTime: 2 * 60 * 1000,
  });

  // Hydrate form when quote loads
  useEffect(() => {
    if (quote) {
      form.reset({
        delivery_date: (quote as any).delivery_date ?? "",
        payment_method: (quote as any).payment_method ?? "Transferencia",
        notes: (quote as any).notes ?? "",
      });
      const plId = (quote as any).price_list_id ?? (quote as any).clients?.price_list_id;
      if (plId && priceLists.length > 0) {
        const pl = priceLists.find((p) => p.id === plId);
        setAppliedPriceList(pl ?? null);
      } else {
        setAppliedPriceList(null);
      }
    }
  }, [quote, form, priceLists]);

  useEffect(() => {
    if (items.length > 0) {
      setLines((items as any[]).map((it) => ({
        id: it.id,
        product_id: it.product_id,
        clave: it.products?.clave ?? "",
        name: it.products?.name ?? it.product_name ?? "",
        image_url: it.products?.image_url ?? null,
        quantity: it.quantity,
        unit_price: it.unit_price,
      })));
      setDeletedLineIds([]);
    }
  }, [items]);

  useEffect(() => {
    if (!open) { setLines([]); setDeletedLineIds([]); }
  }, [open]);

  const applyPriceList = (plId: string | null) => {
    if (!plId) {
      setLines((prev) =>
        prev.map((l) => {
          const p = products.find((x) => x.id === l.product_id);
          return { ...l, unit_price: p?.sale_price_with_iva ?? l.unit_price };
        })
      );
      setAppliedPriceList(null);
      return;
    }
    const list = priceLists.find((p) => p.id === plId) ?? null;
    const overrides = new Map<string, number>();
    for (const r of allPriceListItems) {
      if (r.price_list_id === plId) overrides.set(r.product_id, Number(r.price_with_iva));
    }
    setLines((prev) =>
      prev.map((l) => {
        const p = products.find((x) => x.id === l.product_id);
        const mayoreo = p?.sale_price_with_iva ?? l.unit_price;
        return { ...l, unit_price: resolveListPrice(l.product_id, mayoreo, list, overrides) };
      })
    );
    setAppliedPriceList(list);
  };

  const addProduct = (productId: string) => {
    if (lines.some(l => l.product_id === productId)) { toast.error("Producto ya agregado"); return; }
    const p = products.find(x => x.id === productId);
    if (!p) return;
    let unit = p.sale_price_with_iva ?? 0;
    if (appliedPriceList) {
      const list = priceLists.find((pl) => pl.id === appliedPriceList.id) ?? null;
      const overrides = new Map<string, number>();
      for (const r of allPriceListItems) {
        if (r.price_list_id === appliedPriceList.id) overrides.set(r.product_id, Number(r.price_with_iva));
      }
      unit = resolveListPrice(productId, unit, list, overrides);
    }
    setLines(prev => [...prev, {
      product_id: p.id, clave: p.clave, name: p.name,
      image_url: (p as any).image_url ?? null,
      quantity: "" as any, unit_price: unit, isNew: true,
    }]);
  };

  const updateLine = (idx: number, field: "quantity" | "unit_price", value: string) => {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const parsed = value === "" ? "" : (field === "quantity" ? parseInt(value) || "" : parseFloat(value) || "");
      return { ...l, [field]: parsed };
    }));
  };

  const removeLine = (idx: number) => {
    const line = lines[idx];
    if (line.id) setDeletedLineIds(prev => [...prev, line.id!]);
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  const totalQuote = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0);
  const hasInvalidLines = lines.some(l => !Number(l.quantity) || Number(l.quantity) <= 0);
  const availableProducts = sortProducts(products.filter(p => !lines.some(l => l.product_id === p.id)));

  async function onSubmit(values: FormValues) {
    if (!quoteId) return;
    if (hasInvalidLines) { toast.error("Todas las cantidades deben ser > 0"); return; }
    setSaving(true);
    try {
      const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0) / 1.16, 0);
      const total = totalQuote;

      const { error: qErr } = await (supabase as any).from("quotes").update({
        delivery_date: values.delivery_date?.trim() || null,
        payment_method: values.payment_method?.trim() || "Transferencia",
        notes: values.notes?.trim() || null,
        price_list_id: appliedPriceList?.id ?? null,
        subtotal,
        total,
        updated_at: new Date().toISOString(),
      }).eq("id", quoteId);
      if (qErr) throw qErr;

      if (deletedLineIds.length > 0) {
        const { error } = await (supabase as any).from("quote_items").delete().in("id", deletedLineIds);
        if (error) throw error;
      }

      // Update existing
      for (const line of lines.filter(l => l.id && !l.isNew)) {
        const q = Number(line.quantity) || 0;
        const up = Number(line.unit_price) || 0;
        const { error } = await (supabase as any).from("quote_items").update({
          quantity: q, unit_price: up, line_subtotal: q * up,
        }).eq("id", line.id!);
        if (error) throw error;
      }

      // Insert new
      const newLines = lines.filter(l => !l.id || l.isNew);
      if (newLines.length > 0) {
        const items = newLines.map(l => ({
          quote_id: quoteId,
          product_id: l.product_id,
          product_name: l.name,
          quantity: l.quantity,
          unit_price: l.unit_price,
          line_subtotal: (Number(l.quantity) || 0) * (Number(l.unit_price) || 0),
        }));
        const { error } = await (supabase as any).from("quote_items").insert(items);
        if (error) throw error;
      }

      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["edit-quote", quoteId] });
      qc.invalidateQueries({ queryKey: ["edit-quote-items", quoteId] });
      toast.success("Cotización actualizada");
      onUpdated();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Error al guardar: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-5xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-4 sm:px-6 pt-6 pb-0">
          <DialogTitle className="text-xl">
            Editar Cotización
            <span className="text-sm font-normal text-muted-foreground ml-2">
              {quote ? ((quote as any).clients?.name ?? (quote as any).contact_name ?? "—") : ""}
            </span>
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="px-4 sm:px-6 pb-6 mt-4 space-y-5">
            {/* Header fields */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="delivery_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de entrega</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="payment_method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Método de pago</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Transferencia">Transferencia</SelectItem>
                        <SelectItem value="Depósito">Depósito</SelectItem>
                        <SelectItem value="Efectivo">Efectivo</SelectItem>
                        <SelectItem value="Otro">Otro</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Lista de precios:</span>
              <Select
                value={appliedPriceList?.id ?? "__mayoreo__"}
                onValueChange={(v) => applyPriceList(v === "__mayoreo__" ? null : v)}
              >
                <SelectTrigger className="h-8 w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__mayoreo__">Mayoreo</SelectItem>
                  {priceLists.map((pl) => (
                    <SelectItem key={pl.id} value={pl.id}>{pl.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Notas internas u observaciones" />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* Lines */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Productos ({lines.length} {lines.length === 1 ? "SKU" : "SKUs"})
                </h3>
              </div>

              {availableProducts.length > 0 && (
                <Select key={lines.length} value="" onValueChange={addProduct}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Seleccionar producto..." /></SelectTrigger>
                  <SelectContent>
                    {availableProducts.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="inline-flex items-center gap-2">
                          <ProductThumb src={(p as any).image_url ?? null} size="xs" />
                          <span className="font-mono text-xs">{p.clave}</span>
                          <span>{p.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {lines.length > 0 ? (
                <div className="space-y-0">
                  <div className="grid grid-cols-[1fr_100px_120px_80px_40px] gap-2 text-xs text-muted-foreground font-medium py-1 border-b border-border">
                    <div>Producto</div>
                    <div className="text-center">Bultos</div>
                    <div className="text-center">Precio/u</div>
                    <div className="text-right">Subtotal</div>
                    <div />
                  </div>
                  {lines.map((line, idx) => (
                    <div
                      key={line.id ?? `new-${idx}`}
                      className="grid grid-cols-[1fr_100px_120px_80px_40px] gap-2 items-center py-2 border-b border-border/50"
                    >
                      <div className="flex items-center gap-2 text-sm min-w-0">
                        <ProductThumb src={line.image_url} size="sm" />
                        <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-xs text-primary">{line.clave}</span>
                          <span className="truncate">{line.name}</span>
                        </div>
                      </div>
                      <Input
                        type="number"
                        min={0}
                        value={line.quantity}
                        onChange={e => updateLine(idx, "quantity", e.target.value)}
                        className="h-8 text-center"
                      />
                      <Input
                        type="number" min={0} step={0.01}
                        value={line.unit_price}
                        onChange={e => updateLine(idx, "unit_price", e.target.value)}
                        className="h-8 text-center"
                      />
                      <div className="text-sm text-right font-medium">
                        {fmtMXN((Number(line.quantity) || 0) * (Number(line.unit_price) || 0))}
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeLine(idx)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <div className="grid grid-cols-[1fr_100px_120px_80px_40px] gap-2 py-2">
                    <div className="text-sm font-semibold">Total</div>
                    <div className="text-center text-sm font-medium">{lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0)} bultos</div>
                    <div />
                    <div className="text-right text-sm font-bold text-primary">{fmtMXN(totalQuote)}</div>
                    <div />
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground text-center py-4">Sin productos</div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving || lines.length === 0 || hasInvalidLines} className="gradient-button text-white">
                {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Guardando…</> : `Guardar — ${fmtMXN(totalQuote)}`}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
