// @ts-nocheck
import { useEffect, useState } from "react";
import { DeliveryStopsEditor, validateStops, type StopValue } from "@/components/orders/DeliveryStopsEditor";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveListPrice } from "@/lib/price-list-math";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProductThumb } from "@/components/ui/product-thumb";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ORDER_STATUSES, STATUS_LABELS } from "@/types/orders";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Trash2, CalendarIcon, Tag, AlertOctagon, Percent, X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { parseLocalDate, calendarDateToString } from "@/lib/date-utils";
import { sortProducts } from "@/lib/sort-products";

const editOrderSchema = z.object({
  status: z.enum(["Nuevo", "Confirmado", "En preparacion", "En ruta", "Entregado", "Cancelado"]),
  payment_method: z.string().optional(),
  delivery_date: z.string().optional(),
  urgency: z.boolean().default(false),
  notes: z.string().trim().max(2000).optional(),
  discount_amount: z.number().min(0).optional(),
  discount_reason: z.string().trim().max(500).optional(),
});

type EditOrderValues = z.infer<typeof editOrderSchema>;

interface OrderLine {
  id?: string;
  product_id: string;
  clave: string;
  name: string;
  image_url: string | null;
  quantity: number;
  unit_price: number;
  isNew?: boolean;
  // Damaged batch tracking
  damaged_batch_id?: string;
  is_damaged?: boolean;
  damaged_condition?: "leve" | "moderado" | "severo";
  damaged_max_qty?: number;
  originalQuantity?: number;
}

interface DamagedOption {
  id: string;
  product_id: string;
  clave: string;
  name: string;
  image_url: string | null;
  remaining_quantity: number;
  condition: "leve" | "moderado" | "severo";
  unit_price: number;
}

interface EditOrderSheetProps {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOrderUpdated: () => void;
}

const EMPTY_ARR: any[] = [];

export function EditOrderSheet({ orderId, open, onOpenChange, onOrderUpdated }: EditOrderSheetProps) {
  const queryClient = useQueryClient();
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [deletedLineIds, setDeletedLineIds] = useState<string[]>([]);
  const [deletedDamagedLines, setDeletedDamagedLines] = useState<{ damaged_batch_id: string; quantity: number }[]>([]);
  const [saving, setSaving] = useState(false);
  const [pickerMode, setPickerMode] = useState<"normal" | "damaged">("normal");
  // Multi-stop delivery state. Loaded from order_stops + order_stop_items
  // when the order opens; persisted on save (delete + re-insert).
  const [stops, setStops] = useState<StopValue[]>([]);

  const { data: stopsData = EMPTY_ARR } = useQuery({
    queryKey: ["edit-order-stops", orderId],
    queryFn: async () => {
      if (!orderId) return [];
      const { data, error } = await (supabase as any)
        .from("order_stops")
        .select("id, stop_index, address, client_label, contact_name, contact_phone, notes, manual_maps_url, signed_at, order_stop_items(order_item_id, quantity)")
        .eq("order_id", orderId)
        .order("stop_index");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orderId && open,
  });

  // Hydrate the stops editor from DB rows (lineKey = order_item_id)
  useEffect(() => {
    if (!open) return;
    if (stopsData.length === 0) {
      setStops((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    setStops(stopsData.map((s: any) => ({
      stop_index: s.stop_index,
      address: s.address ?? "",
      client_label: s.client_label,
      contact_name: s.contact_name,
      contact_phone: s.contact_phone,
      notes: s.notes,
      manual_maps_url: s.manual_maps_url,
      allocations: Object.fromEntries(
        (s.order_stop_items ?? []).map((it: any) => [it.order_item_id, it.quantity]),
      ),
    })));
  }, [stopsData, open]);

  const { data: order, isLoading } = useQuery({
    queryKey: ["edit-order", orderId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("orders")
        .select("*, clients(price_list_id)")
        .eq("id", orderId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!orderId && open,
  });

  const { data: orderItems = EMPTY_ARR } = useQuery({
    queryKey: ["edit-order-items", orderId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("order_items").select("*, products(clave, name, sale_price_with_iva, image_url), damaged_batches(id, condition, remaining_quantity)").eq("order_id", orderId!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orderId && open,
  });

  const { data: damagedBatches = [] } = useQuery<DamagedOption[]>({
    queryKey: ["damaged-available-for-order"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("damaged_batches")
        .select(`
          id, product_id, remaining_quantity, condition, unit_price,
          products!inner(clave, name, image_url)
        `)
        .eq("status", "disponible")
        .gt("remaining_quantity", 0)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((b: any) => ({
        id: b.id,
        product_id: b.product_id,
        clave: b.products?.clave ?? "",
        name: b.products?.name ?? "",
        image_url: b.products?.image_url ?? null,
        remaining_quantity: b.remaining_quantity,
        condition: b.condition,
        unit_price: Number(b.unit_price),
      }));
    },
    staleTime: 30 * 1000,
    enabled: open,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, clave, name, sale_price_with_iva, image_url").eq("active", true).order("clave");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: priceLists = EMPTY_ARR } = useQuery({
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
      const { data, error } = await supabase.from("price_list_items").select("price_list_id, product_id, price_with_iva") as any;
      if (error) throw error;
      return (data ?? []) as { price_list_id: string; product_id: string; price_with_iva: number }[];
    },
    staleTime: 2 * 60 * 1000,
  });

  // Per-client price overrides — TOP of the layered pricing chain.
  const orderClientId: string | null = (order as any)?.client_id ?? null;
  const { data: clientOverrides = [] } = useQuery({
    queryKey: ["client-overrides", orderClientId],
    enabled: !!orderClientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_price_overrides")
        .select("product_id, price_with_iva")
        .eq("client_id", orderClientId!);
      if (error) throw error;
      return (data ?? []) as Array<{ product_id: string; price_with_iva: number }>;
    },
    staleTime: 60 * 1000,
  });

  /** Resolved price layered: client override → tier (when applied) →
   *  fallback (catalog). Used when adding a new line to an existing order
   *  so the chosen product immediately reflects the client's negotiated
   *  price. */
  const resolvePriceForProduct = (productId: string, fallback: number): number => {
    const override = clientOverrides.find(r => r.product_id === productId);
    if (override) return Number(override.price_with_iva);
    if (!appliedPriceList) return fallback;
    const list = priceLists.find(p => p.id === appliedPriceList.id) ?? null;
    const overrides = new Map<string, number>();
    for (const r of allPriceListItems) {
      if (r.price_list_id === appliedPriceList.id) overrides.set(r.product_id, Number(r.price_with_iva));
    }
    return resolveListPrice(productId, fallback, list, overrides);
  };
  const isClientOverridePrice = (productId: string): boolean =>
    clientOverrides.some(r => r.product_id === productId);

  const [appliedPriceList, setAppliedPriceList] = useState<{ id: string; name: string } | null>(null);

  const applyPriceList = (plId: string, plName: string) => {
    const list = priceLists.find((p) => p.id === plId) ?? null;
    const overrides = new Map<string, number>();
    for (const r of allPriceListItems) {
      if (r.price_list_id === plId) overrides.set(r.product_id, Number(r.price_with_iva));
    }
    let matched = 0;
    setLines((prev) =>
      prev.map((line) => {
        // Order: explicit override → list.markup_pct → keep current price
        const newPrice = resolveListPrice(line.product_id, line.unit_price, list, overrides);
        if (newPrice !== line.unit_price) matched++;
        return { ...line, unit_price: newPrice };
      })
    );
    setAppliedPriceList({ id: plId, name: plName });
    toast.success(`${plName}: ${matched} producto${matched !== 1 ? "s" : ""} actualizado${matched !== 1 ? "s" : ""}`);
  };

  const removePriceList = () => {
    // Restore catalog prices
    setLines((prev) =>
      prev.map((line) => {
        const p = products.find((x) => x.id === line.product_id);
        return { ...line, unit_price: p?.sale_price_with_iva ?? line.unit_price };
      })
    );
    setAppliedPriceList(null);
    toast.info("Precios restaurados a catálogo");
  };

  const { data: promoProductIds = new Set<string>() } = useQuery({
    queryKey: ["active-promo-ids"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("product_promotions")
        .select("product_id")
        .eq("active", true)
        .lte("valid_from", today)
        .gte("valid_to", today);
      return new Set((data ?? []).map((d: any) => d.product_id));
    },
    staleTime: 2 * 60 * 1000,
  });

  const form = useForm<EditOrderValues>({
    resolver: zodResolver(editOrderSchema),
    defaultValues: { status: "Nuevo", payment_method: "Transferencia", delivery_date: "", urgency: false, notes: "", discount_amount: 0, discount_reason: "" },
  });

  // Track whether the discount panel is expanded. Auto-expand if the order
  // already has a discount applied so the user sees it immediately.
  const [discountOpen, setDiscountOpen] = useState(false);

  useEffect(() => {
    if (order) {
      const existingDiscount = Number((order as any).discount_amount ?? 0) || 0;
      form.reset({
        status: (ORDER_STATUSES as readonly string[]).includes(order.status) ? (order.status as EditOrderValues["status"]) : "Nuevo",
        payment_method: (order as any).payment_method ?? "Transferencia",
        delivery_date: order.delivery_date ?? "",
        urgency: order.urgency,
        notes: order.notes ?? "",
        discount_amount: existingDiscount,
        discount_reason: (order as any).discount_reason ?? "",
      });
      setDiscountOpen(existingDiscount > 0);
      // Restore applied price list. Resolution order:
      //   1. order.price_list_id (explicitly chosen on this pedido)
      //   2. clients.price_list_id (the client's default — applied as fallback)
      //   3. none (use catalog/mayoreo)
      const orderPlId = (order as any).price_list_id;
      const clientDefaultPlId = (order as any).clients?.price_list_id;
      const plId = orderPlId ?? clientDefaultPlId ?? null;
      if (plId && priceLists.length > 0) {
        const pl = priceLists.find((p) => p.id === plId);
        if (pl) setAppliedPriceList(pl);
        else setAppliedPriceList(null);
      } else {
        setAppliedPriceList(null);
      }
    }
  }, [order, form, priceLists]);

  useEffect(() => {
    if (orderItems.length > 0) {
      setLines(orderItems.map((item: any) => {
        const isDamaged = !!item.is_damaged && !!item.damaged_batch_id;
        const batch = item.damaged_batches;
        // Max qty for an existing damaged line = remaining_quantity + this line's current qty
        // (because that qty has already been subtracted from remaining when the line was created)
        const maxQty = isDamaged && batch
          ? (batch.remaining_quantity ?? 0) + (item.quantity ?? 0)
          : undefined;
        return {
          id: item.id,
          product_id: item.product_id,
          clave: item.products?.clave ?? "",
          name: item.products?.name ?? "",
          image_url: item.products?.image_url ?? null,
          quantity: item.quantity,
          unit_price: item.unit_price_override ?? item.products?.sale_price_with_iva ?? 0,
          originalQuantity: item.quantity ?? 0,
          ...(isDamaged ? {
            is_damaged: true,
            damaged_batch_id: item.damaged_batch_id,
            damaged_condition: batch?.condition,
            damaged_max_qty: maxQty,
          } : {}),
        } as OrderLine;
      }).sort((a, b) => ((b.quantity || 0) * (Number(b.unit_price) || 0)) - ((a.quantity || 0) * (Number(a.unit_price) || 0))));
      setDeletedLineIds([]);
    }
  }, [orderItems]);

  useEffect(() => {
    if (!open) { setLines([]); setDeletedLineIds([]); setDeletedDamagedLines([]); setPickerMode("normal"); }
  }, [open]);

  const addProduct = (composite: string) => {
    // composite is "normal:<product_id>" or "damaged:<batch_id>"
    const [kind, id] = composite.split(":");

    if (kind === "damaged") {
      if (lines.some(l => l.damaged_batch_id === id)) { toast.error("Lote dañado ya agregado"); return; }
      const b = damagedBatches.find(x => x.id === id);
      if (!b) return;
      setLines(prev => [...prev, {
        product_id: b.product_id,
        clave: b.clave,
        name: b.name,
        image_url: b.image_url,
        quantity: b.remaining_quantity,
        unit_price: b.unit_price,
        isNew: true,
        damaged_batch_id: b.id,
        is_damaged: true,
        damaged_condition: b.condition,
        damaged_max_qty: b.remaining_quantity,
      }]);
      return;
    }

    // Normal product: block only duplicates among normal lines (damaged lines OK alongside)
    if (lines.some(l => l.product_id === id && !l.is_damaged)) { toast.error("Producto ya agregado"); return; }
    const p = products.find(x => x.id === id);
    if (!p) return;
    // Resolve through the layered pricing: client override > tier > catalog
    const initialPrice = resolvePriceForProduct(p.id, p.sale_price_with_iva ?? 0);
    setLines(prev => [...prev, { product_id: p.id, clave: p.clave, name: p.name, image_url: p.image_url, quantity: "" as any, unit_price: initialPrice, isNew: true }]);
  };

  const updateLine = (idx: number, field: "quantity" | "unit_price", value: string) => {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const parsed = value === "" ? ""
        : (field === "quantity" ? parseInt(value) || "" : parseFloat(value) || "");
      // Cap damaged quantity at damaged_max_qty
      if (field === "quantity" && l.is_damaged && l.damaged_max_qty != null && typeof parsed === "number") {
        return { ...l, quantity: Math.min(parsed, l.damaged_max_qty) as any };
      }
      return { ...l, [field]: parsed };
    }));
  };

  const removeLine = (idx: number) => {
    const line = lines[idx];
    if (line.id) {
      setDeletedLineIds(prev => [...prev, line.id!]);
      // If this was a persisted damaged line, its original quantity must be
      // restored to damaged_batches.remaining_quantity on submit
      if (line.is_damaged && line.damaged_batch_id) {
        setDeletedDamagedLines(prev => [
          ...prev,
          { damaged_batch_id: line.damaged_batch_id!, quantity: line.originalQuantity ?? 0 },
        ]);
      }
    }
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  const subtotalLines = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0);
  const discountAmountWatched = Number(form.watch("discount_amount")) || 0;
  const discountReasonWatched = (form.watch("discount_reason") ?? "").trim();
  // Cap displayed discount so total never goes negative (DB allows it but UI keeps clean math)
  const effectiveDiscount = Math.min(discountAmountWatched, subtotalLines);
  const totalOrder = Math.max(0, subtotalLines - effectiveDiscount);
  const hasInvalidLines = lines.some(l => !Number(l.quantity) || Number(l.quantity) <= 0);
  // Discount > 0 requires a reason; reason without amount is fine (just not applied)
  const discountNeedsReason = discountAmountWatched > 0 && discountReasonWatched.length === 0;
  const discountTooBig = discountAmountWatched > subtotalLines && subtotalLines > 0;
  const fmtMXN = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(n);
  const availableProducts = sortProducts(products.filter(p => !lines.some(l => l.product_id === p.id && !l.is_damaged)));
  const availableDamaged = damagedBatches.filter(b => !lines.some(l => l.damaged_batch_id === b.id));

  const toNull = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

  async function onSubmit(values: EditOrderValues) {
    if (!orderId) return;
    if (discountNeedsReason) {
      toast.error("Agrega un motivo para el descuento");
      return;
    }
    setSaving(true);
    try {
      // Discount audit: stamp/clear applied_at + applied_by based on whether discount changed
      const newDiscount = Number(values.discount_amount) || 0;
      const newReason = (values.discount_reason ?? "").trim();
      const prevDiscount = Number((order as any)?.discount_amount ?? 0) || 0;
      const prevReason = ((order as any)?.discount_reason ?? "").trim();
      const discountChanged = newDiscount !== prevDiscount || newReason !== prevReason;
      const discountPatch: Record<string, any> = {
        discount_amount: newDiscount,
        discount_reason: newDiscount > 0 ? newReason : null,
      };
      if (discountChanged) {
        if (newDiscount > 0) {
          // Stamp who/when when applying or modifying
          const { data: { user } } = await supabase.auth.getUser();
          discountPatch.discount_applied_by = user?.id ?? null;
          discountPatch.discount_applied_at = new Date().toISOString();
        } else {
          // Cleared the discount → wipe audit
          discountPatch.discount_applied_by = null;
          discountPatch.discount_applied_at = null;
        }
      }

      // Update order
      const { error } = await supabase.from("orders").update({
        status: values.status, payment_method: values.payment_method || "Transferencia", delivery_date: toNull(values.delivery_date), urgency: values.urgency, notes: toNull(values.notes),
        price_list_id: appliedPriceList?.id ?? null,
        ...discountPatch,
      } as any).eq("id", orderId);
      if (error) throw error;

      // Delete removed items
      if (deletedLineIds.length > 0) {
        const { error: delErr } = await supabase.from("order_items").delete().in("id", deletedLineIds);
        if (delErr) throw delErr;
      }

      // Restore remaining_quantity for any removed damaged lines
      for (const d of deletedDamagedLines) {
        if (!d.damaged_batch_id || !d.quantity) continue;
        const { data: batch, error: fErr } = await (supabase as any)
          .from("damaged_batches")
          .select("remaining_quantity")
          .eq("id", d.damaged_batch_id)
          .single();
        if (fErr) continue;
        const newRemaining = (batch?.remaining_quantity ?? 0) + d.quantity;
        await (supabase as any)
          .from("damaged_batches")
          .update({ remaining_quantity: newRemaining })
          .eq("id", d.damaged_batch_id);
      }

      // Update existing items + apply delta for damaged quantity changes
      for (const line of lines.filter(l => l.id && !l.isNew)) {
        const newQty = Number(line.quantity) || 0;
        const { error: updErr } = await supabase.from("order_items").update({
          quantity: newQty, unit_price_override: Number(line.unit_price) || 0,
        }).eq("id", line.id!);
        if (updErr) throw updErr;

        // Adjust damaged batch remaining_quantity by the delta
        if (line.is_damaged && line.damaged_batch_id) {
          const delta = newQty - (line.originalQuantity ?? 0);
          if (delta !== 0) {
            const { data: batch, error: fErr } = await (supabase as any)
              .from("damaged_batches")
              .select("remaining_quantity")
              .eq("id", line.damaged_batch_id)
              .single();
            if (!fErr) {
              const newRemaining = Math.max(0, (batch?.remaining_quantity ?? 0) - delta);
              await (supabase as any)
                .from("damaged_batches")
                .update({ remaining_quantity: newRemaining })
                .eq("id", line.damaged_batch_id);
            }
          }
        }
      }

      // Insert new items
      const newLines = lines.filter(l => l.isNew);
      if (newLines.length > 0) {
        const { error: insErr } = await supabase.from("order_items").insert(
          newLines.map(l => ({
            order_id: orderId,
            product_id: l.product_id,
            quantity: Number(l.quantity) || 0,
            unit_price_override: Number(l.unit_price) || 0,
            damaged_batch_id: l.damaged_batch_id ?? null,
            is_damaged: l.is_damaged ?? false,
          })) as any
        );
        if (insErr) throw insErr;

        // Decrement remaining_quantity for each new damaged line
        for (const l of newLines) {
          if (!l.is_damaged || !l.damaged_batch_id) continue;
          const qty = Number(l.quantity) || 0;
          if (qty <= 0) continue;
          const { data: batch, error: fErr } = await (supabase as any)
            .from("damaged_batches")
            .select("remaining_quantity")
            .eq("id", l.damaged_batch_id)
            .single();
          if (fErr) continue;
          const newRemaining = Math.max(0, (batch?.remaining_quantity ?? 0) - qty);
          await (supabase as any)
            .from("damaged_batches")
            .update({ remaining_quantity: newRemaining })
            .eq("id", l.damaged_batch_id);
        }
      }

      // ── Persist multi-stop delivery: delete + re-insert ──
      // Simpler than diffing for the edit flow's small dataset.
      // ON DELETE CASCADE on order_stops drops stop_items automatically.
      if (stops.length > 0) {
        const { error: delStopsErr } = await (supabase as any)
          .from("order_stops")
          .delete()
          .eq("order_id", orderId);
        if (delStopsErr) throw delStopsErr;

        for (const s of stops) {
          const { data: stopRow, error: stopErr } = await (supabase as any)
            .from("order_stops")
            .insert({
              order_id: orderId,
              stop_index: s.stop_index,
              address: s.address.trim(),
              client_label: s.client_label,
              contact_name: s.contact_name,
              contact_phone: s.contact_phone,
              notes: s.notes,
              manual_maps_url: s.manual_maps_url,
            })
            .select("id")
            .single();
          if (stopErr) throw stopErr;
          const allocRows = Object.entries(s.allocations)
            .filter(([, qty]) => (qty ?? 0) > 0)
            .map(([orderItemId, qty]) => ({
              order_stop_id: stopRow.id,
              order_item_id: orderItemId,
              quantity: qty,
            }));
          if (allocRows.length > 0) {
            const { error: allocErr } = await (supabase as any)
              .from("order_stop_items")
              .insert(allocRows);
            if (allocErr) throw allocErr;
          }
        }
      }

      toast.success("Pedido actualizado");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
        queryClient.invalidateQueries({ queryKey: ["order-detail", orderId] }),
        queryClient.invalidateQueries({ queryKey: ["order-items", orderId] }),
        queryClient.invalidateQueries({ queryKey: ["edit-order-items", orderId] }),
        queryClient.invalidateQueries({ queryKey: ["edit-order-stops", orderId] }),
        queryClient.invalidateQueries({ queryKey: ["damaged-batches"] }),
        queryClient.invalidateQueries({ queryKey: ["damaged-by-product"] }),
        queryClient.invalidateQueries({ queryKey: ["damaged-available-for-order"] }),
      ]);
      onOrderUpdated();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Error al actualizar pedido", { description: err.message });
    } finally {
      setSaving(false);
    }
  }

  const fmtDate = (d: string | null) => {
    if (!d) return "\u2014";
    try { return format(parseLocalDate(d), "dd/MM/yy"); } catch { return d; }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-5xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-4 sm:px-4 sm:px-6 pt-6 pb-0">
          <DialogTitle className="text-xl">
            {isLoading ? <Skeleton className="h-6 w-40" /> : `Editar Pedido ${order?.order_code ?? ""}`}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="px-4 sm:px-6 pb-6 space-y-4 mt-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : order ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="px-4 sm:px-6 pb-6 mt-4 space-y-5">

              {/* Top row: Order details + Notes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="border border-border rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Detalles</h3>
                  <FormField control={form.control} name="status" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estado</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          {ORDER_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="payment_method" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Método de pago</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "Transferencia"}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="Transferencia">Transferencia</SelectItem>
                          <SelectItem value="Depósito">Depósito</SelectItem>
                          <SelectItem value="Efectivo">Efectivo</SelectItem>
                          <SelectItem value="Otro">Otro</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="delivery_date" render={({ field }) => {
                    const dateValue = field.value ? parseLocalDate(field.value) : undefined;
                    return (
                      <FormItem>
                        <FormLabel>Fecha de entrega</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full justify-start text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dateValue
                                  ? `${String(dateValue.getDate()).padStart(2, "0")}/${String(dateValue.getMonth() + 1).padStart(2, "0")}/${dateValue.getFullYear()}`
                                  : "Sin fecha"}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={dateValue}
                              onSelect={(d) => {
                                if (d) {
                                  field.onChange(calendarDateToString(d));
                                } else {
                                  field.onChange("");
                                }
                              }}
                              locale={es}
                            />
                          </PopoverContent>
                        </Popover>
                      </FormItem>
                    );
                  }} />
                  <FormField control={form.control} name="urgency" render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      <FormLabel className="text-sm font-normal">Urgente</FormLabel>
                    </FormItem>
                  )} />
                </div>

                <div className="border border-border rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Notas</h3>
                  <FormField control={form.control} name="notes" render={({ field }) => (
                    <FormItem><FormControl><Textarea rows={6} placeholder="Notas del pedido..." {...field} /></FormControl></FormItem>
                  )} />
                  <div className="text-xs text-muted-foreground">
                    Creado: {fmtDate(order.created_at)} · Actualizado: {fmtDate(order.updated_at)}
                  </div>
                </div>
              </div>

              {/* Products section */}
              <div className="border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Productos ({lines.length} SKUs)
                  </h3>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant={pickerMode === "damaged" ? "default" : "outline"}
                      size="sm"
                      className={cn(
                        "h-7 text-xs gap-1.5",
                        pickerMode === "damaged" && "bg-orange-500 hover:bg-orange-600 text-white border-orange-500"
                      )}
                      onClick={() => setPickerMode(pickerMode === "damaged" ? "normal" : "damaged")}
                    >
                      <AlertOctagon className="h-3 w-3" />
                      Dañados
                      {availableDamaged.length > 0 && (
                        <span className={cn(
                          "ml-0.5 px-1 rounded text-[10px]",
                          pickerMode === "damaged" ? "bg-white/20" : "bg-orange-500/15 text-orange-500"
                        )}>
                          {availableDamaged.length}
                        </span>
                      )}
                    </Button>
                    {appliedPriceList && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30">
                        <Tag className="h-3 w-3" />
                        {appliedPriceList.name}
                        <button onClick={removePriceList} className="ml-1 hover:text-purple-200 transition-colors">✕</button>
                      </span>
                    )}
                    {priceLists.length > 0 && lines.length > 0 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                            <Tag className="h-3 w-3" />
                            Aplicar lista
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {priceLists.map((pl) => (
                            <DropdownMenuItem key={pl.id} onClick={() => applyPriceList(pl.id, pl.name)}>
                              {pl.name}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>

                {pickerMode === "damaged" ? (
                  availableDamaged.length > 0 ? (
                    <Select key={`d-${lines.length}`} value="" onValueChange={(v) => addProduct(v)}>
                      <SelectTrigger className="w-full border-orange-500/40">
                        <SelectValue placeholder="Seleccionar lote dañado..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableDamaged.map(b => (
                          <SelectItem key={`damaged-${b.id}`} value={`damaged:${b.id}`}>
                            <span className="inline-flex items-center gap-2">
                              <ProductThumb src={b.image_url} size="xs" />
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-500/15 text-orange-500 border border-orange-500/30 capitalize">
                                {b.condition}
                              </span>
                              <span className="font-mono text-xs">{b.clave}</span>
                              <span>{b.name}</span>
                              <span className="text-xs text-muted-foreground">
                                · {b.remaining_quantity} disp. · {fmtMXN(b.unit_price)}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="text-xs text-muted-foreground text-center py-2 border border-dashed border-orange-500/30 rounded-md">
                      No hay lotes dañados disponibles
                    </div>
                  )
                ) : (
                  availableProducts.length > 0 && (
                    <Select key={lines.length} value="" onValueChange={(v) => addProduct(v)}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Seleccionar producto..." /></SelectTrigger>
                      <SelectContent>
                        {availableProducts.map(p => (
                          <SelectItem key={`normal-${p.id}`} value={`normal:${p.id}`}>
                            <span className="inline-flex items-center gap-2">
                              <ProductThumb src={p.image_url} size="xs" />
                              <span className="font-mono text-xs">{p.clave}</span>
                              <span>{p.name}</span>
                              {promoProductIds.has(p.id) && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">Promo</span>
                              )}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )
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
                        key={line.is_damaged ? `d-${line.damaged_batch_id}` : line.product_id}
                        className={cn(
                          "grid grid-cols-[1fr_100px_120px_80px_40px] gap-2 items-center py-2 border-b border-border/50",
                          line.is_damaged && "bg-orange-500/5"
                        )}
                      >
                        <div className="flex items-center gap-2 text-sm min-w-0">
                          <ProductThumb src={line.image_url} size="sm" />
                          <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-xs text-primary">{line.clave}</span>
                            <span className="truncate">{line.name}</span>
                            {line.is_damaged && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-500/15 text-orange-500 border border-orange-500/30 capitalize">
                                <AlertOctagon className="h-2.5 w-2.5" />
                                Dañado · {line.damaged_condition}
                              </span>
                            )}
                          </div>
                        </div>
                        <Input
                          type="number"
                          min={0}
                          max={line.is_damaged ? line.damaged_max_qty : undefined}
                          value={line.quantity}
                          onChange={e => updateLine(idx, "quantity", e.target.value)}
                          className="h-8 text-center"
                          placeholder=""
                        />
                        <div className="space-y-0.5">
                          {isClientOverridePrice(line.product_id) && (
                            <div
                              className="text-[9px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 text-center leading-tight"
                              title="Precio acordado con este cliente"
                            >
                              Precio personal
                            </div>
                          )}
                          <Input type="number" min={0} step={0.01} value={line.unit_price}
                            onChange={e => updateLine(idx, "unit_price", e.target.value)}
                            className={cn(
                              "h-8 text-center",
                              isClientOverridePrice(line.product_id) &&
                                "border-amber-500/60 focus-visible:ring-amber-500/60",
                            )}
                            title={isClientOverridePrice(line.product_id) ? "Precio acordado con este cliente" : undefined} />
                        </div>
                        <div className="text-sm text-right font-medium">{fmtMXN((Number(line.quantity) || 0) * (Number(line.unit_price) || 0))}</div>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeLine(idx)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                    {effectiveDiscount > 0 ? (
                      <>
                        <div className="grid grid-cols-[1fr_100px_120px_80px_40px] gap-2 py-1">
                          <div className="text-sm text-muted-foreground">Subtotal</div>
                          <div className="text-center text-sm text-muted-foreground">{lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0)} bultos</div>
                          <div />
                          <div className="text-right text-sm text-muted-foreground">{fmtMXN(subtotalLines)}</div>
                          <div />
                        </div>
                        <div className="grid grid-cols-[1fr_100px_120px_80px_40px] gap-2 py-1">
                          <div className="text-sm text-amber-500">Descuento{discountReasonWatched ? ` · ${discountReasonWatched}` : ""}</div>
                          <div />
                          <div />
                          <div className="text-right text-sm font-medium text-amber-500">−{fmtMXN(effectiveDiscount)}</div>
                          <div />
                        </div>
                        <div className="grid grid-cols-[1fr_100px_120px_80px_40px] gap-2 py-2 border-t border-border">
                          <div className="text-sm font-bold">Total</div>
                          <div />
                          <div />
                          <div className="text-right text-base font-bold text-primary">{fmtMXN(totalOrder)}</div>
                          <div />
                        </div>
                      </>
                    ) : (
                      <div className="grid grid-cols-[1fr_100px_120px_80px_40px] gap-2 py-2">
                        <div className="text-sm font-semibold">Total</div>
                        <div className="text-center text-sm font-medium">{lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0)} bultos</div>
                        <div />
                        <div className="text-right text-sm font-bold text-primary">{fmtMXN(totalOrder)}</div>
                        <div />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground text-center py-4">Sin productos</div>
                )}
              </div>

              {/* Multi-stop delivery editor */}
              {lines.length > 0 && (
                <div className="border border-border rounded-lg p-4 space-y-3">
                  <DeliveryStopsEditor
                    lines={lines.filter((l) => !!l.id).map((l) => ({
                      lineKey: l.id!,
                      label: `${l.clave} · ${l.name}`,
                      totalQuantity: Number(l.quantity) || 0,
                    }))}
                    value={stops}
                    onChange={setStops}
                  />
                </div>
              )}

              {/* Manual discount panel — collapsed by default; auto-expands if order already has a discount */}
              <div className="border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground inline-flex items-center gap-2">
                    <Percent className="h-3.5 w-3.5" />
                    Descuento manual
                    {effectiveDiscount > 0 && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-500 border border-amber-500/30 normal-case tracking-normal">
                        −{fmtMXN(effectiveDiscount)}
                      </span>
                    )}
                  </h3>
                  {!discountOpen && discountAmountWatched === 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      onClick={() => setDiscountOpen(true)}
                    >
                      <Percent className="h-3 w-3" />
                      Agregar descuento
                    </Button>
                  ) : (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                      onClick={() => {
                        form.setValue("discount_amount", 0);
                        form.setValue("discount_reason", "");
                        setDiscountOpen(false);
                      }}
                    >
                      <X className="h-3 w-3" /> Quitar
                    </button>
                  )}
                </div>

                {(discountOpen || discountAmountWatched > 0) && (
                  <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-3">
                    <FormField control={form.control} name="discount_amount" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Monto (MXN)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            inputMode="decimal"
                            placeholder="0"
                            value={field.value ?? 0}
                            onChange={(e) => {
                              const v = e.target.value === "" ? 0 : Number(e.target.value);
                              field.onChange(Number.isFinite(v) ? v : 0);
                            }}
                            className={cn(discountTooBig && "border-destructive focus-visible:ring-destructive")}
                          />
                        </FormControl>
                        {discountTooBig && (
                          <p className="text-[11px] text-destructive">Mayor que el subtotal — se limitará a {fmtMXN(subtotalLines)}</p>
                        )}
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="discount_reason" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">
                          Motivo {discountAmountWatched > 0 && <span className="text-destructive">*</span>}
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder='ej. "compensación P-0038 precio mal"'
                            {...field}
                            className={cn(discountNeedsReason && "border-destructive focus-visible:ring-destructive")}
                          />
                        </FormControl>
                        {discountNeedsReason && (
                          <p className="text-[11px] text-destructive">El motivo es obligatorio cuando hay descuento</p>
                        )}
                      </FormItem>
                    )} />
                  </div>
                )}
              </div>

              {/* Submit */}
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                <Button type="submit" disabled={saving || hasInvalidLines || discountNeedsReason} className="gradient-button text-white">
                  {saving ? "Guardando\u2026" : `Guardar — ${fmtMXN(totalOrder)}`}
                </Button>
              </div>
            </form>
          </Form>
        ) : (
          <div className="px-4 sm:px-6 pb-6 mt-4 text-muted-foreground">Pedido no encontrado</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
