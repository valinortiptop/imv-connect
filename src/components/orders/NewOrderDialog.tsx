// @ts-nocheck
import { useState, useEffect } from "react";
import { DeliveryStopsEditor, validateStops, type StopValue } from "@/components/orders/DeliveryStopsEditor";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveListPrice } from "@/lib/price-list-math";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProductThumb } from "@/components/ui/product-thumb";
import { ClientTypeBadge } from "@/components/ui/client-type-badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { Trash2, CalendarIcon, AlertOctagon, ChevronsUpDown } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { CentralRow } from "@/types/orders";
import { sortProducts } from "@/lib/sort-products";

const emptyToNull = (v: string | undefined) => {
  if (!v || v.trim() === "") return null;
  return v.trim();
};

/** Case-insensitive strict substring filter for cmdk <Command />.
 *  Prevents fuzzy matches like "marisol" -> "MARICELA". */
const substringFilter = (value: string, search: string) => {
  if (!search) return 1;
  return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
};

/** Highlights every case-insensitive occurrence of `query` inside `text`. */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const q = query.trim();
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  let idx = lower.indexOf(needle, i);
  let key = 0;
  while (idx !== -1) {
    if (idx > i) parts.push(<span key={key++}>{text.slice(i, idx)}</span>);
    parts.push(
      <mark key={key++} className="bg-primary/25 text-foreground rounded-sm px-0.5">
        {text.slice(idx, idx + needle.length)}
      </mark>
    );
    i = idx + needle.length;
    idx = lower.indexOf(needle, i);
  }
  if (i < text.length) parts.push(<span key={key++}>{text.slice(i)}</span>);
  return <>{parts}</>;
}

const schema = z.object({
  client_name: z.string().trim().min(1, "Requerido").max(200),
  phone: z.string().optional(),
  rfc: z.string().optional(),
  shipping_address: z.string().optional(),
  delivery_date: z.string().optional(),
  payment_method: z.string().optional(),
  payment_terms: z.string().optional(),
  requires_invoice: z.boolean().default(false),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface OrderLine {
  product_id: string;
  clave: string;
  name: string;
  image_url: string | null;
  quantity: number;
  unit_price: number;
  // Damaged batch tracking (only set for damaged lines)
  damaged_batch_id?: string;
  is_damaged?: boolean;
  damaged_condition?: "leve" | "moderado" | "severo";
  damaged_max_qty?: number;
}

interface DamagedOption {
  id: string;            // damaged_batches.id
  product_id: string;
  clave: string;
  name: string;
  image_url: string | null;
  remaining_quantity: number;
  condition: "leve" | "moderado" | "severo";
  unit_price: number;
}

interface NewOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOrderCreated: (orderId: string) => void;
  /** "order" creates a real pedido. "quote" creates a cotización (mock-up,
   *  doesn't subtract stock, doesn't show in dashboards). Default: "order". */
  mode?: "order" | "quote";
}

export function NewOrderDialog({ open, onOpenChange, onOrderCreated, mode = "order" }: NewOrderDialogProps) {
  const isQuote = mode === "quote";
  const queryClient = useQueryClient();
  const [clientTab, setClientTab] = useState<string>("existing");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [pickerMode, setPickerMode] = useState<"normal" | "damaged">("normal");
  // Search strings for the three combobox pickers (client, damaged lot,
  // normal product) — controlled so we can highlight matches in items.
  const [clientSearch, setClientSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [damagedSearch, setDamagedSearch] = useState("");
  // Multi-stop delivery state. Default = single stop seeded by the
  // chosen client's address (see seeding effect after client load).
  // Stop allocation is keyed by product_id (lines have stable ids only
  // after save, so product_id is the cross-phase key).
  const [stops, setStops] = useState<StopValue[]>([]);

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").eq("active", true).order("name");
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

  // Pre-fetch every list's items so we can apply prices instantly when a
  // client is selected or the list is changed.
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

  // Per-client product price overrides — the TOP of the layered pricing
  // model. Override wins over the tier price, which wins over the catalog
  // price. Refetched whenever the selected client changes.
  const { data: clientOverrides = [] } = useQuery({
    queryKey: ["client-overrides", selectedClientId],
    enabled: !!selectedClientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_price_overrides")
        .select("product_id, price_with_iva")
        .eq("client_id", selectedClientId!);
      if (error) throw error;
      return (data ?? []) as Array<{ product_id: string; price_with_iva: number }>;
    },
    staleTime: 60 * 1000,
  });

  // Active list for THIS pedido. Defaults from the selected client; can be
  // changed per pedido.
  const [appliedPriceList, setAppliedPriceList] = useState<{ id: string; name: string } | null>(null);

  /** Returns the resolved price for a product applying the full layered
   *  fallback chain: client override → price-list (tier) override →
   *  tier markup on catalog → catalog. The fallback parameter is the
   *  catalog's sale_price_with_iva. */
  const priceForProduct = (productId: string, fallback: number): number => {
    // 1. Per-client override beats everything
    const clientOverride = clientOverrides.find((r) => r.product_id === productId);
    if (clientOverride) return Number(clientOverride.price_with_iva);
    // 2. Fall back to existing tier resolution
    if (!appliedPriceList) return fallback;
    const overrides = new Map<string, number>();
    for (const r of allPriceListItems) {
      if (r.price_list_id === appliedPriceList.id) overrides.set(r.product_id, Number(r.price_with_iva));
    }
    const list = priceLists.find((p) => p.id === appliedPriceList.id) ?? null;
    return resolveListPrice(productId, fallback, list, overrides);
  };

  /** True if the resolved price for this product is a per-CLIENT override
   *  (as opposed to a tier-derived or catalog price). Drives the amber
   *  indicator on order-line price inputs so the user can tell at a glance
   *  that this line uses a custom-negotiated price. */
  const isClientOverridePrice = (productId: string): boolean =>
    clientOverrides.some((r) => r.product_id === productId);

  const { data: products = [] } = useQuery({
    queryKey: ["products-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, clave, name, sale_price_with_iva, image_url").eq("active", true).order("clave");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 2 * 60 * 1000,
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
  });

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

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { client_name: "", requires_invoice: false },
  });

  useEffect(() => {
    if (!open) {
      setClientTab("existing");
      setSelectedClientId(null);
      setLines([]);
      setPickerMode("normal");
      setAppliedPriceList(null);
      setStops([]);
      form.reset();
    }
  }, [open, form]);

  // When the user changes the client, reset stops so the default
  // address re-seeds from the new client. Allocations get re-derived
  // from the current `lines` automatically by the editor's self-heal.
  useEffect(() => {
    setStops([]);
  }, [selectedClientId, clientTab]);

  // The client_price_overrides query is async — when the user picks a
  // client, selectClient() runs applyPriceListToLines synchronously with
  // STALE override data. Once the query lands, re-apply prices so the
  // override actually takes effect on lines that were already added.
  useEffect(() => {
    if (!selectedClientId) return;
    if (lines.length === 0) return;
    applyPriceListToLines(appliedPriceList?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientOverrides]);

  // Apply a price list to all currently-loaded lines (excludes damaged
  // lines — those keep their special unit price). Uses resolveListPrice
  // so a list with `markup_pct` (e.g. Menudeo +4%, Habid −4%) computes
  // the right price even for products that don't have an explicit
  // `price_list_items` override row. Without this, switching the list
  // dropdown silently fell back to mayoreo for those products.
  const applyPriceListToLines = (plId: string | null) => {
    // Per-client override always wins, regardless of which tier is applied.
    const clientOverrideMap = new Map(
      clientOverrides.map((r) => [r.product_id, Number(r.price_with_iva)] as const),
    );
    if (!plId) {
      // Restore catalog prices on existing lines — but still respect
      // per-client overrides which sit ABOVE the tier in the layering.
      setLines((prev) =>
        prev.map((l) => {
          if (l.is_damaged) return l;
          const p = products.find((x) => x.id === l.product_id);
          const overridePrice = clientOverrideMap.get(l.product_id);
          return {
            ...l,
            unit_price: overridePrice ?? p?.sale_price_with_iva ?? l.unit_price,
          };
        })
      );
      return;
    }
    const list = priceLists.find((p) => p.id === plId) ?? null;
    const overrides = new Map<string, number>();
    for (const r of allPriceListItems) {
      if (r.price_list_id === plId) overrides.set(r.product_id, Number(r.price_with_iva));
    }
    setLines((prev) =>
      prev.map((l) => {
        if (l.is_damaged) return l;
        const p = products.find((x) => x.id === l.product_id);
        const overridePrice = clientOverrideMap.get(l.product_id);
        if (overridePrice != null) return { ...l, unit_price: overridePrice };
        const mayoreo = p?.sale_price_with_iva ?? l.unit_price;
        return { ...l, unit_price: resolveListPrice(l.product_id, mayoreo, list, overrides) };
      })
    );
  };

  const selectClient = (clientId: string) => {
    const c = clients.find(x => x.id === clientId);
    if (!c) return;
    setSelectedClientId(clientId);
    form.setValue("client_name", c.name ?? "");
    form.setValue("phone", c.phone ?? "");
    form.setValue("rfc", c.rfc ?? "");
    form.setValue("shipping_address", c.address ?? "");
    form.setValue("payment_method", c.payment_method ?? "Transferencia");

    // Auto-apply the client's default price list (editable below)
    const defaultPlId = (c as any).price_list_id ?? null;
    if (defaultPlId) {
      const pl = priceLists.find((p) => p.id === defaultPlId);
      if (pl) {
        setAppliedPriceList(pl);
        applyPriceListToLines(pl.id);
      } else {
        setAppliedPriceList(null);
      }
    } else {
      setAppliedPriceList(null);
      applyPriceListToLines(null);
    }
  };

  const handleTabChange = (tab: string) => {
    setClientTab(tab);
    setSelectedClientId(null);
    setAppliedPriceList(null);
    form.setValue("client_name", "");
    form.setValue("phone", "");
    form.setValue("rfc", "");
    form.setValue("shipping_address", "");
    form.setValue("payment_method", "Transferencia");
  };

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
        damaged_batch_id: b.id,
        is_damaged: true,
        damaged_condition: b.condition,
        damaged_max_qty: b.remaining_quantity,
      }]);
      return;
    }

    // Normal product: ensure not already added as normal (damaged lines allowed alongside)
    if (lines.some(l => l.product_id === id && !l.is_damaged)) { toast.error("Producto ya agregado"); return; }
    const p = products.find(x => x.id === id);
    if (!p) return;
    // Apply the active price list price (if any) to the new line
    const unitPrice = priceForProduct(p.id, p.sale_price_with_iva ?? 0);
    setLines(prev => [...prev, {
      product_id: p.id, clave: p.clave, name: p.name, image_url: p.image_url,
      quantity: "" as any, unit_price: unitPrice,
    }]);
  };

  const updateLine = (idx: number, field: "quantity" | "unit_price", value: string) => {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const parsed = value === "" ? ""
        : (field === "quantity" ? parseInt(value) || "" : parseFloat(value) || "");
      // Cap damaged quantity at remaining_quantity
      if (field === "quantity" && l.is_damaged && l.damaged_max_qty != null && typeof parsed === "number") {
        return { ...l, quantity: Math.min(parsed, l.damaged_max_qty) as any };
      }
      return { ...l, [field]: parsed };
    }));
  };

  const removeLine = (idx: number) => {
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  const totalOrder = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0);
  const fmtMXN = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(n);
  const availableProducts = sortProducts(products.filter(p => !lines.some(l => l.product_id === p.id && !l.is_damaged)));
  const availableDamaged = damagedBatches.filter(b => !lines.some(l => l.damaged_batch_id === b.id));

  const hasInvalidLines = lines.some(l => !Number(l.quantity) || Number(l.quantity) <= 0);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (hasInvalidLines) { throw new Error("Todos los productos deben tener cantidad mayor a 0"); }

      // ── Cotización path ─────────────────────────────────────────
      // A cotización is a draft. It writes to `quotes` + `quote_items`
      // (not `orders`), so it doesn't subtract stock or contribute to
      // sales. Damaged-batch decrement is intentionally skipped.
      if (isQuote) {
        const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0) / 1.16, 0);
        const total    = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0);

        // Trust the picked client id when one was selected from the
        // existing-client tab. Falls back to a case-insensitive name
        // lookup with limit(1) for the new-client path (avoids the
        // duplicate-name error on maybeSingle when two clients share
        // a name).
        let clientId: string | null = selectedClientId;
        if (!clientId) {
          const { data: clientRow } = await (supabase as any)
            .from("clients")
            .select("id")
            .ilike("name", values.client_name.trim())
            .limit(1)
            .maybeSingle();
          clientId = clientRow?.id ?? null;
        }

        const { data: quote, error: qErr } = await (supabase as any)
          .from("quotes")
          .insert({
            client_id: clientId,
            status: "draft",
            source: "pedidos",
            contact_name: values.client_name.trim(),
            contact_phone: emptyToNull(values.phone),
            shipping_address: emptyToNull(values.shipping_address),
            notes: emptyToNull(values.notes),
            delivery_date: emptyToNull(values.delivery_date),
            payment_method: emptyToNull(values.payment_method) ?? "Transferencia",
            price_list_id: appliedPriceList?.id ?? null,
            subtotal,
            total,
          })
          .select("id")
          .single();
        if (qErr) throw qErr;
        const quoteId = quote.id as string;

        if (lines.length > 0) {
          const items = lines.map(l => ({
            quote_id: quoteId,
            product_id: l.product_id,
            product_name: l.name,
            quantity: l.quantity,
            unit_price: l.unit_price,
            line_subtotal: (Number(l.quantity) || 0) * (Number(l.unit_price) || 0),
          }));
          const { error: itemsError } = await (supabase as any).from("quote_items").insert(items);
          if (itemsError) throw itemsError;
        }
        return quoteId;
      }

      // ── Pedido path (original) ──────────────────────────────────
      const { data: orderId, error } = await supabase.rpc("create_order_with_client", {
        p_client_name: values.client_name.trim(),
        p_phone: emptyToNull(values.phone),
        p_address: emptyToNull(values.shipping_address),
        p_rfc: emptyToNull(values.rfc),
        p_payment_method: emptyToNull(values.payment_method),
        p_notes: emptyToNull(values.notes),
        p_delivery_date: emptyToNull(values.delivery_date),
      });
      if (error) throw error;

      // Save the chosen price list on the order (RPC doesn't accept it).
      if (appliedPriceList) {
        const { error: plErr } = await supabase
          .from("orders")
          .update({ price_list_id: appliedPriceList.id } as any)
          .eq("id", orderId as string);
        if (plErr) throw plErr;
      }

      if (lines.length > 0) {
        const items = lines.map(l => ({
          order_id: orderId as string,
          product_id: l.product_id,
          quantity: l.quantity,
          unit_price_override: l.unit_price,
          damaged_batch_id: l.damaged_batch_id ?? null,
          is_damaged: l.is_damaged ?? false,
        }));
        const { error: itemsError } = await supabase.from("order_items").insert(items as any);
        if (itemsError) throw itemsError;

        // Decrement remaining_quantity for each damaged batch used
        for (const line of lines) {
          if (!line.is_damaged || !line.damaged_batch_id) continue;
          const { data: batch, error: fetchErr } = await (supabase as any)
            .from("damaged_batches")
            .select("remaining_quantity")
            .eq("id", line.damaged_batch_id)
            .single();
          if (fetchErr) continue;
          const newRemaining = Math.max(0, (batch.remaining_quantity ?? 0) - (Number(line.quantity) || 0));
          await (supabase as any)
            .from("damaged_batches")
            .update({ remaining_quantity: newRemaining })
            .eq("id", line.damaged_batch_id);
        }

        // ── Multi-stop delivery: persist stops + per-stop allocations ──
        // The editor uses product_id as the stable key; map back to the
        // newly-inserted order_item ids before writing stop_items rows.
        if (stops.length > 0) {
          const { data: insertedItems, error: itemsFetchErr } = await (supabase as any)
            .from("order_items")
            .select("id, product_id")
            .eq("order_id", orderId as string);
          if (itemsFetchErr) throw itemsFetchErr;
          const itemIdByProduct = new Map<string, string>();
          for (const ii of insertedItems ?? []) itemIdByProduct.set(ii.product_id, ii.id);

          for (const s of stops) {
            const { data: stopRow, error: stopErr } = await (supabase as any)
              .from("order_stops")
              .insert({
                order_id: orderId as string,
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
              .map(([productId, qty]) => ({
                order_stop_id: stopRow.id,
                order_item_id: itemIdByProduct.get(productId),
                quantity: qty,
              }))
              .filter((r) => !!r.order_item_id);
            if (allocRows.length > 0) {
              const { error: allocErr } = await (supabase as any)
                .from("order_stop_items")
                .insert(allocRows);
              if (allocErr) throw allocErr;
            }
          }
        }
      }
      return orderId as string;
    },
    onSuccess: (newId) => {
      onOpenChange(false);
      if (isQuote) {
        queryClient.invalidateQueries({ queryKey: ["quotes"] });
        toast.success("Cotización creada");
      } else {
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: ["clients-list"] });
        queryClient.invalidateQueries({ queryKey: ["damaged-batches"] });
        queryClient.invalidateQueries({ queryKey: ["damaged-by-product"] });
        queryClient.invalidateQueries({ queryKey: ["damaged-available-for-order"] });
        toast.success("Pedido creado");
      }
      onOrderCreated(newId);
    },
    onError: (err: Error) => {
      toast.error(`Error al crear ${isQuote ? "cotización" : "pedido"}: ` + err.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl w-[96vw] max-h-[92vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
          <DialogTitle className="text-xl">{isQuote ? "Nueva Cotización" : "Nuevo Pedido"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="flex-1 flex flex-col min-h-0"
          >
            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

            {/* Top row: Client + Order details side by side */}
            <div className="grid grid-cols-2 gap-5">

              {/* LEFT: Client box with tabs */}
              <div className="border border-border rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Cliente</h3>
                <Tabs value={clientTab} onValueChange={handleTabChange}>
                  <TabsList className="w-full">
                    <TabsTrigger value="existing" className="flex-1">Existente</TabsTrigger>
                    <TabsTrigger value="new" className="flex-1">Nuevo</TabsTrigger>
                  </TabsList>

                  <TabsContent value="existing" className="mt-3 space-y-3">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          className="w-full justify-between font-normal"
                        >
                          <span className="truncate">
                            {selectedClientId
                              ? (() => {
                                  const c = clients.find((x) => x.id === selectedClientId);
                                  return c ? `${c.name}${c.company ? ` — ${c.company}` : ""}` : "Seleccionar cliente...";
                                })()
                              : "Seleccionar cliente..."}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Buscar cliente..." />
                          <CommandList>
                            <CommandEmpty>Sin resultados.</CommandEmpty>
                            <CommandGroup>
                              {clients.map((c) => (
                                <CommandItem
                                  key={c.id}
                                  value={`${c.name} ${c.company ?? ""} ${(c as any).rfc ?? ""}`}
                                  onSelect={() => selectClient(c.id)}
                                >
                                  <span className="inline-flex items-center gap-2">
                                    <ClientTypeBadge type={(c as any).client_type ?? "mayoreo"} />
                                    <span>{c.name}{c.company ? ` — ${c.company}` : ""}</span>
                                  </span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {selectedClientId && (
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between"><span className="text-muted-foreground">Teléfono</span><span>{form.getValues("phone") || "—"}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">RFC</span><span>{form.getValues("rfc") || "—"}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Dirección</span><span className="text-right max-w-[200px] truncate">{form.getValues("shipping_address") || "—"}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Método preferido</span><span className="text-muted-foreground/70 text-xs">{clients.find(x => x.id === selectedClientId)?.payment_method || "—"}</span></div>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="new" className="mt-3 space-y-3">
                    <FormField control={form.control} name="client_name" render={({ field }) => (
                      <FormItem><FormLabel>Nombre *</FormLabel><FormControl><Input placeholder="Nombre del cliente" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-2">
                      <FormField control={form.control} name="phone" render={({ field }) => (
                        <FormItem><FormLabel>Teléfono</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="rfc" render={({ field }) => (
                        <FormItem><FormLabel>RFC</FormLabel><FormControl><Input {...field} maxLength={13} /></FormControl></FormItem>
                      )} />
                    </div>
                    <FormField control={form.control} name="shipping_address" render={({ field }) => (
                      <FormItem><FormLabel>Dirección</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                    )} />
                  </TabsContent>
                </Tabs>
              </div>

              {/* RIGHT: Order details box */}
              <div className="border border-border rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Detalles del pedido</h3>
                <FormField control={form.control} name="delivery_date" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de entrega</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-9", !field.value && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(new Date(field.value + "T12:00:00"), "dd MMM yyyy", { locale: es }) : "Seleccionar fecha..."}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value ? new Date(field.value + "T12:00:00") : undefined}
                          onSelect={(date) => field.onChange(date ? format(date, "yyyy-MM-dd") : "")}
                          locale={es}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-2">
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
                  <FormField control={form.control} name="payment_terms" render={({ field }) => (
                    <FormItem><FormLabel>Términos de pago</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="requires_invoice" render={({ field }) => (
                  <FormItem className="flex items-center gap-3">
                    <FormLabel>Requiere factura</FormLabel>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem><FormLabel>Notas</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                )} />
              </div>
            </div>

            {/* Products section - full width */}
            <div className="border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Productos ({lines.length} SKUs)
                </h3>
                {/* Price list picker — defaults from client, editable per pedido */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Lista:</span>
                  <Select
                    value={appliedPriceList?.id ?? "__mayoreo__"}
                    onValueChange={(v) => {
                      if (v === "__mayoreo__") {
                        setAppliedPriceList(null);
                        applyPriceListToLines(null);
                      } else {
                        const pl = priceLists.find((p) => p.id === v);
                        if (pl) {
                          setAppliedPriceList(pl);
                          applyPriceListToLines(pl.id);
                        }
                      }
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs w-[140px]">
                      <SelectValue placeholder="Mayoreo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__mayoreo__">Mayoreo</SelectItem>
                      {priceLists.map((pl) => (
                        <SelectItem key={pl.id} value={pl.id}>
                          {pl.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Damaged-batch picker is order-only; cotizaciones never
                 * touch real damaged stock until they're converted. */}
                {!isQuote && (
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
                )}
              </div>

              {pickerMode === "damaged" ? (
                availableDamaged.length > 0 ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal border-orange-500/40">
                        <span className="text-muted-foreground">Seleccionar lote dañado...</span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar lote..." />
                        <CommandList>
                          <CommandEmpty>Sin resultados.</CommandEmpty>
                          <CommandGroup>
                            {availableDamaged.map((b) => (
                              <CommandItem
                                key={`damaged-${b.id}`}
                                value={`${b.clave} ${b.name} ${b.condition}`}
                                onSelect={() => addProduct(`damaged:${b.id}`)}
                              >
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
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <div className="text-xs text-muted-foreground text-center py-2 border border-dashed border-orange-500/30 rounded-md">
                    No hay lotes dañados disponibles
                  </div>
                )
              ) : (
                availableProducts.length > 0 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal">
                        <span className="text-muted-foreground">Seleccionar producto...</span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar producto por clave o nombre..." />
                        <CommandList>
                          <CommandEmpty>Sin resultados.</CommandEmpty>
                          <CommandGroup>
                            {availableProducts.map((p) => (
                              <CommandItem
                                key={`normal-${p.id}`}
                                value={`${p.clave} ${p.name}`}
                                onSelect={() => addProduct(`normal:${p.id}`)}
                              >
                                <span className="inline-flex items-center gap-2">
                                  <ProductThumb src={p.image_url} size="xs" />
                                  <span className="font-mono text-xs">{p.clave}</span>
                                  <span>{p.name}</span>
                                  {promoProductIds.has(p.id) && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">Promo</span>
                                  )}
                                </span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
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
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={line.unit_price}
                          onChange={e => updateLine(idx, "unit_price", e.target.value)}
                          className={cn(
                            "h-8 text-center",
                            // Amber border when this line's price came from a
                            // per-client override. Matches the existing "this
                            // value was overridden" amber language elsewhere.
                            isClientOverridePrice(line.product_id) &&
                              "border-amber-500/60 focus-visible:ring-amber-500/60",
                          )}
                          title={isClientOverridePrice(line.product_id)
                            ? "Precio acordado con este cliente"
                            : undefined}
                        />
                      </div>
                      <div className="text-sm text-right font-medium">{fmtMXN((Number(line.quantity) || 0) * (Number(line.unit_price) || 0))}</div>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeLine(idx)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <div className="grid grid-cols-[1fr_100px_120px_80px_40px] gap-2 py-2">
                    <div className="text-sm font-semibold">Total</div>
                    <div className="text-center text-sm font-medium">{lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0)} bultos</div>
                    <div />
                    <div className="text-right text-sm font-bold text-primary">{fmtMXN(totalOrder)}</div>
                    <div />
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground text-center py-4">
                  Sin productos. Selecciona un producto arriba para comenzar.
                </div>
              )}
            </div>

            {/* Multi-stop delivery editor — only when there are items to
                allocate. Defaults to 1 stop seeded from the chosen
                client. Skip in quote mode. */}
            {!isQuote && lines.length > 0 && (
              <div className="border rounded-lg p-4 bg-card">
                <DeliveryStopsEditor
                  lines={lines.map((l) => ({
                    lineKey: l.product_id,
                    label: `${l.clave} · ${l.name}`,
                    totalQuantity: Number(l.quantity) || 0,
                  }))}
                  defaultAddress={(() => {
                    if (clientTab === "existing") {
                      const c = clients.find((x: any) => x.id === selectedClientId);
                      return c?.address ?? null;
                    }
                    return form.getValues("shipping_address") ?? null;
                  })()}
                  defaultContactName={(() => {
                    if (clientTab === "existing") {
                      const c = clients.find((x: any) => x.id === selectedClientId);
                      return c?.name ?? null;
                    }
                    return form.getValues("client_name") ?? null;
                  })()}
                  defaultContactPhone={(() => {
                    if (clientTab === "existing") {
                      const c = clients.find((x: any) => x.id === selectedClientId);
                      return c?.phone ?? null;
                    }
                    return form.getValues("phone") ?? null;
                  })()}
                  value={stops}
                  onChange={setStops}
                />
              </div>
            )}

            </div>{/* end scrollable body */}

            {/* Sticky footer — submit always visible, no scrolling needed */}
            <div className="border-t bg-background px-6 py-3 shrink-0">
              {(() => {
                const stopsValidation = !isQuote && lines.length > 0
                  ? validateStops(stops, lines.map((l) => ({
                      lineKey: l.product_id,
                      label: `${l.clave} · ${l.name}`,
                      totalQuantity: Number(l.quantity) || 0,
                    })))
                  : { valid: true };
                const stopsBlock = !stopsValidation.valid;
                return (
                  <>
                    {stopsBlock && stopsValidation.reason && (
                      <p className="text-xs text-destructive mb-2">⚠ {stopsValidation.reason}</p>
                    )}
                    <Button type="submit" className="w-full h-11 text-base gradient-button text-white"
                      disabled={mutation.isPending || lines.length === 0 || hasInvalidLines || stopsBlock || (clientTab === "existing" && !selectedClientId) || (clientTab === "new" && !form.getValues("client_name")?.trim())}>
                      {mutation.isPending ? "Creando..." : `${isQuote ? "Crear Cotización" : "Crear Pedido"} — ${fmtMXN(totalOrder)}`}
                    </Button>
                  </>
                );
              })()}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
