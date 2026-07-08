// @ts-nocheck
import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ProductThumb } from "@/components/ui/product-thumb";
import { GlowCard } from "@/components/ui/spotlight-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { sortProducts } from "@/lib/sort-products";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, CalendarIcon, ChevronsUpDown, Check, ClipboardPaste, ChevronRight, ChevronDown, X, Package, Truck, BarChart3, Clock, MapPin, Camera, Download } from "lucide-react";
import { EntradaImageImport } from "@/components/stock/EntradaImageImport";
import { PlacementSuggestionDialog } from "@/components/warehouse/PlacementSuggestionDialog";
import { format } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { parseLocalDate, calendarDateToString, todayMx } from "@/lib/date-utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ProductDetail = {
  id: string;
  clave: string;
  name: string;
  supplier: string | null;
  brand: string | null;
  weight_kg: number | null;
  sale_price_with_iva: number | null;
  sale_price_without_iva: number | null;
  cost_without_iva: number | null;
  cost_with_iva: number | null;
  bonificacion_pct: number | null;
  cost_bonificacion_without_iva: number | null;
  margin_pct_normal: number | null;
  margin_pct_bonificacion: number | null;
  stock_actual: number | null;
  stock_incoming: number | null;
  stock_committed: number | null;
  active: boolean | null;
};

type DeliverySummary = {
  id: string;
  delivery_code: string;
  delivery_date: string;
  supplier: string | null;
  reference: string | null;
  notes: string | null;
  delivery_status: string;
  created_at: string;
  line_items: number;
  total_bultos: number;
  top_product_name: string | null;
  adm_proof_path: string | null;
};

type DeliveryItem = {
  id: string;
  delivery_id: string;
  product_id: string;
  quantity: number;
  notes: string | null;
  products: { clave: string; name: string; supplier: string; image_url: string | null } | null;
};

type ProductOption = {
  id: string;
  clave: string;
  name: string;
  supplier: string;
  weight_kg: number;
  image_url: string | null;
};

type LineItem = {
  product_id: string;
  clave: string;
  name: string;
  quantity: number;
  notes: string;
  promo_id: string | null;
  effective_weight_kg: number;
  // Preserved across manual-edit save (delete + re-insert). The Manual
  // tab doesn't expose UI to change these, but without carrying them
  // through any edit that touches the entrada wipes the cortesía flag
  // and per-row cost — making MX018959 quietly lose its 🎁 badge.
  is_gifted: boolean;
  cost_with_iva: number | null;
  cost_without_iva: number | null;
};

type ParsedRow = {
  clave: string;
  productName: string;
  productId: string | null;
  quantity: number;
  supplier: string;
  found: boolean;
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const fmtDate = (d: string | null) => {
  if (!d) return "\u2014";
  try { return format(parseLocalDate(d), "dd/MM/yy", { locale: es }); } catch { return d; }
};

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function StockEntries() {
  const { toast } = useToast();
  const { t, lang } = useLanguage();
  const dateLocale = lang === "en" ? enUS : es;
  const queryClient = useQueryClient();

  // Expand state
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Placement dialog state — opens from a stock entry line item to
  // suggest + commit a warehouse position for the received bultos.
  const [placementItem, setPlacementItem] = useState<DeliveryItem | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDelivery, setEditingDelivery] = useState<DeliverySummary | null>(null);

  // Delete state
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Product detail popup
  const [viewProductId, setViewProductId] = useState<string | null>(null);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"status" | "date" | "delete" | null>(null);
  const [bulkStatus, setBulkStatus] = useState<string>("Recibido");
  const [bulkDate, setBulkDate] = useState<Date>(new Date());
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // Filter state
  const getFirstOfMonth = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  };
  const [dateFrom, setDateFrom] = useState(getFirstOfMonth());
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "Recibido" | "Programado">("all");
  const setThisMonth = () => { setDateFrom(getFirstOfMonth()); setDateTo(""); };
  const setAllTime = () => { setDateFrom(""); setDateTo(""); };

  // Form state — delivery info
  const [formDate, setFormDate] = useState<Date>(new Date());
  const [formSupplier, setFormSupplier] = useState("");
  const [formReference, setFormReference] = useState("");
  const [formNotes, setFormNotes] = useState("");
  /** Explicit delivery status the user sees in the edit dialog. Auto-
   *  syncs from the date by default (future → Programado, else Recibido)
   *  but the user can override via the select — useful e.g. for a past-
   *  dated delivery that physically hasn't arrived yet. */
  const [formStatus, setFormStatus] = useState<"Recibido" | "Programado">("Recibido");

  // Status is derived from the delivery date: future → Programado, else Recibido
  const deriveStatus = (d: Date): "Recibido" | "Programado" =>
    format(d, "yyyy-MM-dd") > todayMx() ? "Programado" : "Recibido";

  // Form state — line items
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [saving, setSaving] = useState(false);

  // Product dropdown state
  const [productPopoverOpen, setProductPopoverOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");

  // Paste tab state
  const [pasteText, setPasteText] = useState("");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);

  // Bar chart animation
  const [barsAnimated, setBarsAnimated] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setBarsAnimated(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Pointer for grid pattern
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.style.setProperty("--x", `${e.clientX}px`);
    el.style.setProperty("--y", `${e.clientY}px`);
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Queries                                                          */
  /* ---------------------------------------------------------------- */

  // Base delivery list — query stock_deliveries directly. The previous
  // `delivery_summary` view was repurposed for a per-product summary and
  // no longer exposes the aggregated columns this page expects; we now
  // read the raw table and derive line_items / total_bultos / top_product
  // client-side from `allStockEntries` below.
  const { data: deliveries, isLoading: deliveriesLoading } = useQuery({
    queryKey: ["delivery-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_deliveries")
        .select("id, delivery_code, delivery_date, supplier, reference, notes, delivery_status, created_at")
        .order("delivery_code", { ascending: false });
      if (error) throw error;
      // adm_proof_path is populated from stock_delivery_documents in a
      // separate query further down (kept null here — code that reads it
      // already treats it as optional).
      return (data ?? []).map((d: any) => ({
        ...d,
        line_items: 0,
        total_bultos: 0,
        top_product_name: null,
        adm_proof_path: null,
      })) as DeliverySummary[];
    },
  });


  const { data: products } = useQuery({
    queryKey: ["products-for-stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, clave, name, supplier, weight_kg, image_url")
        .eq("active", true)
        .order("clave");
      if (error) throw error;
      return data as ProductOption[];
    },
  });

  // Active/upcoming promos keyed by product_id
  const { data: promosByProduct = {} } = useQuery({
    queryKey: ["promos-for-stock"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("product_promotions")
        .select("*")
        .eq("active", true)
        .gte("valid_to", today);
      if (error) throw error;
      const map: Record<string, Array<{ id: string; promo_clave: string; promo_name: string; promo_weight_kg: number; promo_cost_with_iva: number }>> = {};
      for (const p of data ?? []) {
        if (!map[p.product_id]) map[p.product_id] = [];
        map[p.product_id].push(p);
      }
      return map;
    },
  });

  const { data: productDetail } = useQuery({
    queryKey: ["product-detail-popup", viewProductId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_products_with_stock")
        .select("*")
        .eq("id", viewProductId!)
        .single();
      if (error) throw error;
      return data as ProductDetail;
    },
    enabled: !!viewProductId,
  });

  // Dashboard: all stock entries with product info (for top products chart)
  const { data: allStockEntries } = useQuery({
    queryKey: ["all-stock-entries-with-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_entries")
        .select("delivery_id, product_id, quantity, products(clave, name)");
      if (error) throw error;
      return data as { delivery_id: string; product_id: string; quantity: number; products: { clave: string; name: string } | null }[];
    },
  });

  // Dashboard: SKUs with stock > 0
  const { data: skusWithStock = 0 } = useQuery({
    queryKey: ["skus-with-stock-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("v_products_with_stock")
        .select("id", { count: "exact", head: true })
        .gt("stock_actual", 0);
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Pending-recibo indicator — counts entradas whose slot_contents row
  // is still living in a recibo slot. Used by the "Asignar" chip next
  // to the page title so the user knows there's work waiting in the
  // warehouse map. Polled at 30s — fast enough to feel live, slow
  // enough to not spam the API.
  const { data: pendingRecibo = { lotes: 0, bultos: 0 } } = useQuery({
    queryKey: ["entradas-pending-recibo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("slot_contents")
        .select("quantity, warehouse_slots!inner(zone)")
        .eq("warehouse_slots.zone", "recibo");
      if (error) throw error;
      const lotes = data?.length ?? 0;
      const bultos = (data ?? []).reduce(
        (s: number, r: any) => s + (r.quantity ?? 0),
        0,
      );
      return { lotes, bultos };
    },
    refetchInterval: 30 * 1000,
    staleTime: 15 * 1000,
  });

  // Compute next E-code preview from latest delivery
  const nextDeliveryCode = useMemo(() => {
    if (!deliveries || deliveries.length === 0) return "E-0001";
    const latest = deliveries[0]?.delivery_code;
    if (!latest || typeof latest !== "string") return "E-0001";
    const num = parseInt(latest.replace("E-", "")) || 0;
    return `E-${String(num + 1).padStart(4, "0")}`;
  }, [deliveries]);


  // Derive unique suppliers from products (ADM and Malta Cleyton first)
  const suppliers = useMemo(() => {
    if (!products) return [];
    const unique = [...new Set(products.map(p => p.supplier).filter(Boolean))] as string[];
    const priority = ["ADM", "Malta Cleyton"];
    const top = priority.filter(s => unique.includes(s));
    const rest = unique.filter(s => !priority.includes(s)).sort();
    return [...top, ...rest];
  }, [products]);

  // Auto-convert Programado -> Recibido for deliveries dated today or earlier
  const autoConvertRan = useRef(false);
  useEffect(() => {
    if (!deliveries || autoConvertRan.current) return;
    autoConvertRan.current = true;
    const todayStr = todayMx();
    const toUpdate = deliveries.filter(d =>
      d.id && d.delivery_status === 'Programado' && d.delivery_date <= todayStr
    );
    if (toUpdate.length === 0) return;
    Promise.all(toUpdate.map(d =>
      supabase.from('stock_deliveries').update({ delivery_status: 'Recibido' }).eq('id', d.id)
    )).then((results) => {
      const failed = results.filter(r => r.error);
      if (failed.length === 0) {
        toast({ title: "Actualizado", description: `${toUpdate.length} entregas marcadas como Recibido` });
        queryClient.invalidateQueries({ queryKey: ['delivery-summary'] });
      }
    });
  }, [deliveries]);

  /* ---------------------------------------------------------------- */
  /*  Derived data                                                     */
  /* ---------------------------------------------------------------- */

  const sortedProducts = useMemo(() => sortProducts(products ?? []), [products]);

  const productsBySupplier = useMemo(() => {
    if (!sortedProducts.length) return {};
    const groups: Record<string, ProductOption[]> = {};
    sortedProducts.forEach(p => {
      if (!groups[p.supplier]) groups[p.supplier] = [];
      groups[p.supplier].push(p);
    });
    return groups;
  }, [sortedProducts]);

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return productsBySupplier;
    const q = productSearch.toLowerCase();
    const groups: Record<string, ProductOption[]> = {};
    Object.entries(productsBySupplier).forEach(([supplier, prods]) => {
      const matched = prods.filter(p =>
        p.clave.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
      );
      if (matched.length) groups[supplier] = matched;
    });
    return groups;
  }, [productsBySupplier, productSearch]);

  // Filtered deliveries
  const filtered = useMemo(() => {
    if (!deliveries) return [];
    return deliveries.filter(d => {
      if (statusFilter !== "all" && d.delivery_status !== statusFilter) return false;
      if (dateFrom && d.delivery_date < dateFrom) return false;
      if (dateTo && d.delivery_date > dateTo) return false;
      return true;
    });
  }, [deliveries, statusFilter, dateFrom, dateTo]);

  // Dashboard stats — derived from filtered deliveries
  const dashboardStats = useMemo(() => {
    if (!filtered) return null;
    const totalEntregas = filtered.length;
    const totalBultosAll = filtered.reduce((s, d) => s + (d.total_bultos ?? 0), 0);
    const lastDelivery = filtered.length > 0 ? filtered[0] : null;
    return { totalEntregas, totalBultosAll, lastDelivery };
  }, [filtered]);

  // Top products — filtered by same date range via delivery IDs
  const topProducts = useMemo(() => {
    if (!allStockEntries || !filtered) return [];
    const filteredDeliveryIds = new Set(filtered.map(d => d.id));
    const map = new Map<string, { clave: string; name: string; total: number }>();
    allStockEntries.forEach(e => {
      if (!filteredDeliveryIds.has(e.delivery_id)) return;
      const existing = map.get(e.product_id);
      if (existing) {
        existing.total += e.quantity ?? 0;
      } else {
        map.set(e.product_id, {
          clave: e.products?.clave ?? "",
          name: e.products?.name ?? "",
          total: e.quantity ?? 0,
        });
      }
    });
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 5);
  }, [allStockEntries, filtered]);

  /* ---------------------------------------------------------------- */
  /*  Expand / collapse                                                */
  /* ---------------------------------------------------------------- */

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  /* ---------------------------------------------------------------- */
  /*  Selection helpers                                                */
  /* ---------------------------------------------------------------- */

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(d => d.id)));
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Dialog openers                                                   */
  /* ---------------------------------------------------------------- */

  const openNewDialog = () => {
    setEditingDelivery(null);
    setFormDate(new Date());
    setFormStatus(deriveStatus(new Date()));
    setFormSupplier("");
    setFormReference("");
    setFormNotes("");
    setLineItems([]);
    setProductSearch("");
    setProductPopoverOpen(false);
    setPasteText("");
    setParsedRows([]);
    setDialogOpen(true);
  };

  const openEditDialog = async (delivery: DeliverySummary) => {
    setEditingDelivery(delivery);
    setFormDate(parseLocalDate(delivery.delivery_date));
    // Load the existing status — do NOT auto-derive here, otherwise
    // editing a past-dated "Programado" (delivery delayed, hasn't
    // arrived yet) would silently flip to Recibido on dialog open.
    setFormStatus((delivery.delivery_status as "Recibido" | "Programado") ?? "Recibido");
    setFormSupplier(delivery.supplier || "");
    setFormReference(delivery.reference || "");
    setFormNotes(delivery.notes || "");
    setProductSearch("");
    setProductPopoverOpen(false);
    setPasteText("");
    setParsedRows([]);

    // Load existing line items
    const { data: items } = await supabase
      .from("stock_entries")
      .select("*, products(clave, name, supplier)")
      .eq("delivery_id", delivery.id);

    if (items) {
      setLineItems(items.map((item: any) => ({
        product_id: item.product_id,
        clave: item.products?.clave || "",
        name: item.products?.name || "",
        quantity: item.quantity,
        notes: item.notes || "",
        promo_id: item.promo_id || null,
        effective_weight_kg: item.effective_weight_kg || 0,
        is_gifted: item.is_gifted ?? false,
        cost_with_iva: item.cost_with_iva ?? null,
        cost_without_iva: item.cost_without_iva ?? null,
      })));
    } else {
      setLineItems([]);
    }
    setDialogOpen(true);
  };

  /* ---------------------------------------------------------------- */
  /*  Product selection for line items                                 */
  /* ---------------------------------------------------------------- */

  const handleProductSelect = (productId: string) => {
    const product = products?.find(p => p.id === productId);
    if (!product) return;

    // Don't add duplicates
    if (lineItems.some(li => li.product_id === productId)) {
      toast({ title: "Aviso", description: "Este producto ya fue agregado", variant: "destructive" });
      setProductPopoverOpen(false);
      setProductSearch("");
      return;
    }

    setLineItems(prev => [...prev, {
      product_id: productId,
      clave: product.clave,
      name: product.name,
      quantity: 1,
      notes: "",
      promo_id: null,
      effective_weight_kg: product.weight_kg ?? 0,
      is_gifted: false,
      cost_with_iva: null,
      cost_without_iva: null,
    }]);
    setProductPopoverOpen(false);
    setProductSearch("");

    // Auto-fill supplier from first product if empty
    if (!formSupplier && product.supplier) {
      setFormSupplier(product.supplier);
    }
  };

  const updateLineItemQuantity = (index: number, qty: number) => {
    setLineItems(prev => prev.map((li, i) => i === index ? { ...li, quantity: Math.max(1, qty) } : li));
  };

  const updateLineItemNotes = (index: number, notes: string) => {
    setLineItems(prev => prev.map((li, i) => i === index ? { ...li, notes } : li));
  };

  const removeLineItem = (index: number) => {
    setLineItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateLineItemPromo = (index: number, promoId: string | null) => {
    setLineItems(prev => prev.map((li, i) => {
      if (i !== index) return li;
      if (!promoId || promoId === "__regular__") {
        const product = products?.find(p => p.id === li.product_id);
        return { ...li, promo_id: null, effective_weight_kg: product?.weight_kg ?? 0 };
      }
      const promos = promosByProduct[li.product_id] ?? [];
      const promo = promos.find(p => p.id === promoId);
      return { ...li, promo_id: promoId, effective_weight_kg: promo?.promo_weight_kg ?? li.effective_weight_kg };
    }));
  };

  const totalBultos = useMemo(() => lineItems.reduce((sum, li) => sum + li.quantity, 0), [lineItems]);

  /* ---------------------------------------------------------------- */
  /*  Save delivery                                                    */
  /* ---------------------------------------------------------------- */

  const handleSave = async () => {
    if (lineItems.length === 0) {
      toast({ title: "Error", description: "Agrega al menos un producto", variant: "destructive" });
      return;
    }

    setSaving(true);
    // formStatus is what the Select shows. It auto-syncs from the date
    // but the user can override (e.g. past-dated delivery that hasn't
    // arrived yet). Use it verbatim — don't re-derive here.
    const derivedStatus = formStatus;
    try {
      if (editingDelivery) {
        // Update delivery
        const { error: deliveryError } = await supabase
          .from("stock_deliveries")
          .update({
            delivery_date: format(formDate, "yyyy-MM-dd"),
            supplier: formSupplier || null,
            reference: formReference || null,
            delivery_status: derivedStatus,
            notes: formNotes || null,
          })
          .eq("id", editingDelivery.id);
        if (deliveryError) throw deliveryError;

        // Delete old entries and insert new ones
        const { error: deleteError } = await supabase
          .from("stock_entries")
          .delete()
          .eq("delivery_id", editingDelivery.id);
        if (deleteError) throw deleteError;

        const deliveryDateStr = format(formDate, "yyyy-MM-dd");
        const entryPayload = lineItems.map(li => ({
          delivery_id: editingDelivery.id,
          product_id: li.product_id,
          quantity: li.quantity,
          notes: li.notes || null,
          entry_date: deliveryDateStr,
          entry_status: derivedStatus,
          promo_id: li.promo_id || null,
          effective_weight_kg: li.effective_weight_kg || null,
          // Carry cortesía + per-row cost through the delete + re-insert
          // so editing the entrada doesn't silently wipe them.
          is_gifted: li.is_gifted,
          cost_with_iva: li.cost_with_iva,
          cost_without_iva: li.cost_without_iva,
        }));
        const { error: insertError } = await supabase.from("stock_entries").insert(entryPayload as any);
        if (insertError) throw insertError;

        toast({ title: "Actualizado", description: "Entrada actualizada correctamente" });
      } else {
        // Create new delivery
        const { data: newDelivery, error: deliveryError } = await supabase
          .from("stock_deliveries")
          .insert({
            delivery_date: format(formDate, "yyyy-MM-dd"),
            supplier: formSupplier || null,
            reference: formReference || null,
            delivery_status: derivedStatus,
            notes: formNotes || null,
          } as any)
          .select("id")
          .single();
        if (deliveryError) throw deliveryError;

        const newDateStr = format(formDate, "yyyy-MM-dd");
        const entryPayload = lineItems.map(li => ({
          delivery_id: newDelivery.id,
          product_id: li.product_id,
          quantity: li.quantity,
          notes: li.notes || null,
          entry_date: newDateStr,
          entry_status: derivedStatus,
          promo_id: li.promo_id || null,
          effective_weight_kg: li.effective_weight_kg || null,
          is_gifted: li.is_gifted,
          cost_with_iva: li.cost_with_iva,
          cost_without_iva: li.cost_without_iva,
        }));
        const { error: insertError } = await supabase.from("stock_entries").insert(entryPayload as any);
        if (insertError) throw insertError;

        toast({ title: "Guardado", description: "Nueva entrada registrada" });
      }

      await queryClient.invalidateQueries({ queryKey: ["delivery-summary"] });
      setDialogOpen(false);
      setEditingDelivery(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Error al guardar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Delete delivery                                                  */
  /* ---------------------------------------------------------------- */

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      // Delete entries first (FK), then the delivery
      const { error: entriesError } = await supabase.from("stock_entries").delete().eq("delivery_id", deleteId);
      if (entriesError) throw entriesError;
      const { error: deliveryError } = await supabase.from("stock_deliveries").delete().eq("id", deleteId);
      if (deliveryError) throw deliveryError;
      toast({ title: "Eliminado", description: "Entrada eliminada correctamente" });
      queryClient.invalidateQueries({ queryKey: ["delivery-summary"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Error al eliminar", variant: "destructive" });
    } finally {
      setDeleteId(null);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Bulk actions                                                     */
  /* ---------------------------------------------------------------- */

  const handleBulkStatusChange = async () => {
    setBulkProcessing(true);
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase.from("stock_deliveries").update({ delivery_status: bulkStatus }).in("id", ids);
      if (error) throw error;
      toast({ title: "Actualizado", description: `${ids.length} entregas cambiadas a ${bulkStatus}.` });
      setSelectedIds(new Set());
      setBulkAction(null);
      queryClient.invalidateQueries({ queryKey: ["delivery-summary"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkDateChange = async () => {
    setBulkProcessing(true);
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase.from("stock_deliveries").update({ delivery_date: format(bulkDate, "yyyy-MM-dd") }).in("id", ids);
      if (error) throw error;
      toast({ title: "Actualizado", description: `Fecha cambiada en ${ids.length} entregas.` });
      setSelectedIds(new Set());
      setBulkAction(null);
      queryClient.invalidateQueries({ queryKey: ["delivery-summary"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkDelete = async () => {
    setBulkProcessing(true);
    try {
      const ids = Array.from(selectedIds);
      // Delete entries first, then deliveries
      for (const id of ids) {
        await supabase.from("stock_entries").delete().eq("delivery_id", id);
      }
      const { error } = await supabase.from("stock_deliveries").delete().in("id", ids);
      if (error) throw error;
      toast({ title: "Eliminado", description: `${ids.length} entregas eliminadas` });
      setSelectedIds(new Set());
      setBulkAction(null);
      queryClient.invalidateQueries({ queryKey: ["delivery-summary"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setBulkProcessing(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Paste tab                                                        */
  /* ---------------------------------------------------------------- */

  const handleDetectEntries = () => {
    if (!pasteText.trim()) return;
    const lines = pasteText.split("\n").filter(l => l.trim());
    const detected: ParsedRow[] = lines.map(line => {
      const parts = line.split("\t");
      const clave = parts[0]?.trim() || parts[1]?.trim() || "";
      const quantity = parseInt(parts[1]?.trim() || parts[3]?.trim() || "0") || 0;
      const supplier = parts[2]?.trim() || parts[4]?.trim() || "";

      // Try to find by clave first column, then second
      let product = sortedProducts.find(p => p.clave === clave);
      if (!product) {
        const altClave = parts[1]?.trim() || "";
        product = sortedProducts.find(p => p.clave === altClave);
      }
      // If found by alt, re-parse quantity
      const finalQty = product
        ? (parseInt(parts[product.clave === (parts[1]?.trim() || "") ? 3 : 1]?.trim() || "0") || quantity)
        : quantity;

      return {
        clave: product?.clave || clave,
        productName: product ? `${product.clave} — ${product.name}` : clave,
        productId: product?.id || null,
        quantity: finalQty || 1,
        supplier: product?.supplier || supplier,
        found: !!product,
      };
    });
    setParsedRows(detected);
  };

  const handleBulkSave = async () => {
    const validRows = parsedRows.filter(r => r.found && r.productId && r.quantity > 0);
    if (validRows.length === 0) {
      toast({ title: "Error", description: "No hay entradas válidas para guardar", variant: "destructive" });
      return;
    }
    setSaving(true);
    const derivedStatus = formStatus;
    try {
      // Create a single delivery for all pasted rows
      const { data: newDelivery, error: deliveryError } = await supabase
        .from("stock_deliveries")
        .insert({
          delivery_date: format(formDate, "yyyy-MM-dd"),
          supplier: formSupplier || validRows[0]?.supplier || null,
          reference: formReference || null,
          delivery_status: derivedStatus,
          notes: formNotes || null,
        } as any)
        .select("id")
        .single();
      if (deliveryError) throw deliveryError;

      const bulkDateStr = format(formDate, "yyyy-MM-dd");
      const entryPayload = validRows.map(r => ({
        delivery_id: newDelivery.id,
        product_id: r.productId!,
        quantity: r.quantity,
        notes: null as string | null,
        entry_date: bulkDateStr,
        entry_status: derivedStatus,
      }));
      const { error: insertError } = await supabase.from("stock_entries").insert(entryPayload);
      if (insertError) throw insertError;

      toast({ title: "Guardado", description: `${validRows.length} productos registrados en nueva entrada` });
      queryClient.invalidateQueries({ queryKey: ["delivery-summary"] });
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Error al guardar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Expanded row sub-component                                       */
  /* ---------------------------------------------------------------- */

  function DeliveryExpandedRow({ deliveryId }: { deliveryId: string }) {
    const { data: items, isLoading } = useQuery({
      queryKey: ["delivery-items", deliveryId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from("stock_entries")
          .select("*, products(clave, name, supplier, image_url)")
          .eq("delivery_id", deliveryId);
        if (error) throw error;
        return data as DeliveryItem[];
      },
    });

    if (isLoading) {
      return (
        <div className="space-y-2 p-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-4 w-full bg-muted" />)}
        </div>
      );
    }

    if (!items || items.length === 0) {
      return <p className="text-sm text-muted-foreground p-2">Sin productos en esta entrada.</p>;
    }

    return (
      <Table>
        <TableHeader>
          <TableRow className="border-border">
            <TableHead className="text-foreground font-semibold text-xs">Producto</TableHead>
            <TableHead className="text-foreground font-semibold text-xs text-right">Bultos</TableHead>
            <TableHead className="text-foreground font-semibold text-xs">Notas</TableHead>
            <TableHead className="text-foreground font-semibold text-xs text-right w-[120px]">Posición</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map(item => (
            <TableRow key={item.id} className="border-border">
              <TableCell>
                <button
                  className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); setViewProductId(item.product_id); }}
                >
                  <ProductThumb src={item.products?.image_url ?? null} size="sm" />
                  <div>
                    <span className="font-mono text-blue-400 hover:underline">{item.products?.clave}</span>
                    <span className="text-muted-foreground ml-2 hover:text-blue-400 transition-colors">{item.products?.name}</span>
                  </div>
                </button>
              </TableCell>
              <TableCell className="text-foreground text-right font-semibold">{item.quantity}</TableCell>
              <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{item.notes || "\u2014"}</TableCell>
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); setPlacementItem(item); }}
                  className="h-8 gap-1.5"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  Colocar
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Product dropdown (used in dialog)                                */
  /* ---------------------------------------------------------------- */

  const productDropdown = (
    <div className="relative">
      <Button
        variant="outline"
        className="w-full justify-between font-normal h-9"
        onClick={() => setProductPopoverOpen(!productPopoverOpen)}
      >
        <span className="text-muted-foreground">Seleccionar producto...</span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
      {productPopoverOpen && (
        <div className="absolute left-0 right-0 top-[40px] z-50 rounded-md border border-border bg-popover shadow-lg">
          <Input
            placeholder="Buscar por clave o nombre..."
            value={productSearch}
            onChange={e => setProductSearch(e.target.value)}
            autoFocus
            className="border-0 border-b border-border rounded-none focus-visible:ring-0"
          />
          <div className="max-h-[250px] overflow-y-auto">
            {Object.keys(filteredProducts).length === 0 ? (
              <p className="text-sm text-muted-foreground p-3">Sin resultados</p>
            ) : (
              Object.entries(filteredProducts).map(([supplier, prods]) => (
                <div key={supplier}>
                  <p className="text-xs font-semibold text-muted-foreground px-3 py-1.5 bg-muted/50">{supplier}</p>
                  {prods.map(p => {
                    const alreadyAdded = lineItems.some(li => li.product_id === p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={cn(
                          "w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-accent cursor-pointer",
                          alreadyAdded && "opacity-40"
                        )}
                        onClick={() => handleProductSelect(p.id)}
                      >
                        <Check className={cn("h-4 w-4 shrink-0", alreadyAdded ? "opacity-100" : "opacity-0")} />
                        <ProductThumb src={p.image_url} size="sm" />
                        <span className="font-mono text-blue-400">{p.clave}</span>
                        <span className="ml-1 truncate">{p.name}</span>
                        {promosByProduct[p.id] && (
                          <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">Promo</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Dialog: manual tab                                               */
  /* ---------------------------------------------------------------- */

  const manualForm = (
    <div className="space-y-4 min-h-0 md:min-h-[420px]">
      {/* Horizontal layout: info left, products right */}
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">

        {/* LEFT: Delivery info */}
        <div className="border border-border rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Información</h3>
          <div className="space-y-2.5">
            <div className="space-y-1">
              <Label className="text-xs">Fecha</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal h-9">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(formDate, "dd/MM/yy", { locale: dateLocale })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formDate}
                    onSelect={d => { if (d) { setFormDate(d); setFormStatus(deriveStatus(d)); } }}
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Estado</Label>
              <Select value={formStatus} onValueChange={(v) => setFormStatus(v as "Recibido" | "Programado")}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Programado">Programado (aún no llega)</SelectItem>
                  <SelectItem value="Recibido">Recibido (ya en bodega)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground leading-tight">
                Por defecto se calcula desde la fecha. Cambia aquí si la entrada física no coincide.
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Proveedor</Label>
              <Select value={formSupplier || "__none__"} onValueChange={v => setFormSupplier(v === "__none__" ? "" : v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Seleccionar proveedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Seleccionar —</SelectItem>
                  {suppliers.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Referencia</Label>
              <Input
                placeholder="Ej: Factura, guía, etc."
                value={formReference}
                onChange={e => setFormReference(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notas</Label>
              <Textarea
                placeholder="Notas opcionales..."
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
        </div>

        {/* RIGHT: Products */}
        <div className="border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Productos</h3>
            {lineItems.length > 0 && (
              <span className="text-sm text-muted-foreground">
                Total: <span className="font-bold text-foreground">{totalBultos}</span> bultos
              </span>
            )}
          </div>

          {productDropdown}

          {lineItems.length > 0 && (
            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="text-foreground font-semibold text-xs">Producto</TableHead>
                    <TableHead className="text-foreground font-semibold text-xs w-[90px]">Bultos</TableHead>
                    <TableHead className="text-foreground font-semibold text-xs">Notas</TableHead>
                    <TableHead className="text-foreground font-semibold text-xs w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems.map((li, i) => (
                    <TableRow key={li.product_id} className="border-border">
                      <TableCell className="py-1.5">
                        <span className="font-mono text-blue-400 text-xs">{li.clave}</span>
                        <span className="text-muted-foreground ml-2 text-sm">{li.name}</span>
                      </TableCell>
                      <TableCell className="py-1.5">
                        <Input
                          type="number"
                          min={1}
                          value={li.quantity}
                          onChange={e => updateLineItemQuantity(i, parseInt(e.target.value) || 1)}
                          className="h-7 w-[75px]"
                        />
                      </TableCell>
                      <TableCell className="py-1.5">
                        <Input
                          value={li.notes}
                          onChange={e => updateLineItemNotes(i, e.target.value)}
                          placeholder="Notas..."
                          className="h-7"
                        />
                      </TableCell>
                      <TableCell className="py-1.5">
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-300" onClick={() => removeLineItem(i)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Save button */}
      <Button onClick={handleSave} disabled={saving || lineItems.length === 0} className="w-full h-10 gradient-button text-white">
        {saving ? "Guardando..." : editingDelivery ? "Actualizar entrada" : "Guardar entrada"}
      </Button>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Dialog: paste tab                                                */
  /* ---------------------------------------------------------------- */

  const pasteTab = (
    <div className="space-y-4 min-h-[420px] flex flex-col">
      {/* Paste area — fills space */}
      <div className="border border-border rounded-lg p-4 space-y-3 flex-1 flex flex-col">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Pegar datos</h3>
        <p className="text-xs text-muted-foreground">Pega filas con formato: <span className="font-mono">CLAVE  CANTIDAD  PROVEEDOR</span></p>
        <Textarea
          placeholder={"MX011069\t375\tADM\nMX011070\t200\tADM"}
          value={pasteText}
          onChange={e => setPasteText(e.target.value)}
          className="font-mono text-xs flex-1 min-h-[180px] resize-none"
        />
        <Button onClick={handleDetectEntries} variant="outline" className="gap-2 self-start">
          <ClipboardPaste className="h-4 w-4" /> Detectar productos
        </Button>
      </div>

      {parsedRows.length > 0 && (
        <div className="space-y-3">
          <div className="border border-border rounded-lg p-3 flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Fecha de entrada</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[180px] justify-start text-left font-normal h-9">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(formDate, "dd/MM/yy", { locale: dateLocale })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formDate}
                    onSelect={d => { if (d) { setFormDate(d); setFormStatus(deriveStatus(d)); } }}
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1 flex-1 min-w-[160px]">
              <Label className="text-xs">Proveedor</Label>
              <Select value={formSupplier || "__none__"} onValueChange={v => setFormSupplier(v === "__none__" ? "" : v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Seleccionar proveedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Sin proveedor —</SelectItem>
                  {suppliers.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="overflow-x-auto rounded-md border border-border max-h-[200px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-foreground font-semibold text-xs">Clave</TableHead>
                  <TableHead className="text-foreground font-semibold text-xs">Producto</TableHead>
                  <TableHead className="text-foreground font-semibold text-xs text-right">Bultos</TableHead>
                  <TableHead className="text-foreground font-semibold text-xs">Proveedor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsedRows.map((row, i) => (
                  <TableRow
                    key={i}
                    className={cn(
                      "border-border",
                      !row.found && "bg-red-500/10"
                    )}
                  >
                    <TableCell className="font-mono text-blue-400 text-xs py-1.5">{row.clave}</TableCell>
                    <TableCell className="text-xs py-1.5">
                      {row.found
                        ? <span className="text-foreground">{row.productName}</span>
                        : <span className="text-red-500 font-medium">Producto no encontrado</span>
                      }
                    </TableCell>
                    <TableCell className="text-right text-xs font-semibold text-foreground py-1.5">{row.quantity}</TableCell>
                    <TableCell className="text-xs text-muted-foreground py-1.5">{row.supplier}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {parsedRows.filter(r => r.found).length} productos válidos • Total: {parsedRows.filter(r => r.found).reduce((s, r) => s + r.quantity, 0)} bultos
            </span>
          </div>
          <Button
            onClick={handleBulkSave}
            disabled={saving || parsedRows.filter(r => r.found).length === 0}
            className="w-full h-10 gradient-button text-white"
          >
            {saving ? "Guardando..." : `Guardar ${parsedRows.filter(r => r.found).length} productos como nueva entrada`}
          </Button>
        </div>
      )}
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="relative min-h-screen bg-background" onPointerMove={handlePointerMove}>
      <AnimatedGridPattern className="inset-x-0 inset-y-[-40%] h-[220%] [mask-image:radial-gradient(900px_circle_at_center,white,transparent_85%)]" />

      <div className="relative z-10 p-4 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground">Entradas de inventario</h1>
            {/* Pending-recibo chip — only shows when there are lotes
                waiting in the warehouse Recibo zone. Linkable so a
                tap takes the user straight to /almacen where the
                Recibo block is glowing too. Subtle amber breathe
                matches the warehouse map for visual consistency. */}
            {pendingRecibo.lotes > 0 && (
              <a
                href="/almacen"
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition warehouse-breathe",
                  "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/60 hover:bg-amber-500/25",
                )}
                title="Hay entradas en Recibo esperando a ser asignadas a posiciones de almacenamiento"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inset-0 rounded-full bg-amber-500 animate-ping opacity-60"></span>
                  <span className="relative rounded-full bg-amber-500 h-2 w-2"></span>
                </span>
                <span className="tabular-nums">
                  {pendingRecibo.lotes} lote{pendingRecibo.lotes === 1 ? "" : "s"} en Recibo
                </span>
                <span className="opacity-60">·</span>
                <span className="tabular-nums opacity-90">
                  {pendingRecibo.bultos.toLocaleString("es-MX")} bultos
                </span>
                <span className="opacity-60 ml-0.5">→ Asignar</span>
              </a>
            )}
          </div>
          <Button onClick={openNewDialog} className="gap-2">
            <Plus className="h-4 w-4" /> Nueva entrada
          </Button>
        </div>

        {/* Date filter + Status — applies to dashboard AND table */}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <div className="flex gap-1">
            <Button size="sm" variant={!dateFrom && !dateTo ? "default" : "outline"} onClick={setAllTime}>
              Todo el tiempo
            </Button>
            <Button size="sm" variant={dateFrom === getFirstOfMonth() && !dateTo ? "default" : "outline"} onClick={setThisMonth}>
              Este mes
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Desde</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1 text-xs font-normal">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {dateFrom ? format(parseLocalDate(dateFrom), "dd/MM/yy") : "Seleccionar"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  locale={es}
                  selected={dateFrom ? parseLocalDate(dateFrom) : undefined}
                  onSelect={d => { if (d) { setDateFrom(calendarDateToString(d)); } }}
                />
              </PopoverContent>
            </Popover>
            <span className="text-xs text-muted-foreground">Hasta</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1 text-xs font-normal">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {dateTo ? format(parseLocalDate(dateTo), "dd/MM/yy") : "Seleccionar"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  locale={es}
                  selected={dateTo ? parseLocalDate(dateTo) : undefined}
                  onSelect={d => { if (d) { setDateTo(calendarDateToString(d)); } }}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex gap-1">
            {(["all", "Recibido", "Programado"] as const).map(s => (
              <Button
                key={s}
                variant={statusFilter === s ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(s)}
              >
                {s === "all" ? "Todos" : s}
              </Button>
            ))}
          </div>
          {(dateFrom || dateTo || statusFilter !== "all") && (
            <Button variant="ghost" size="sm" onClick={() => { setAllTime(); setStatusFilter("all"); }}>
              Limpiar
            </Button>
          )}
        </div>

        {/* Dashboard Stats */}
        {dashboardStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="border border-border rounded-lg p-4 bg-card/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Truck className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{dashboardStats.totalEntregas}</p>
                  <p className="text-xs text-muted-foreground">Total entregas</p>
                </div>
              </div>
            </div>
            <div className="border border-border rounded-lg p-4 bg-card/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Package className="h-5 w-5 text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{dashboardStats.totalBultosAll.toLocaleString("es-MX")}</p>
                  <p className="text-xs text-muted-foreground">Bultos recibidos</p>
                </div>
              </div>
            </div>
            <div className="border border-border rounded-lg p-4 bg-card/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <BarChart3 className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{skusWithStock}</p>
                  <p className="text-xs text-muted-foreground">SKUs con stock</p>
                </div>
              </div>
            </div>
            <div className="border border-border rounded-lg p-4 bg-card/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Clock className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">
                    {dashboardStats.lastDelivery ? fmtDate(dashboardStats.lastDelivery.delivery_date) : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Última entrada{dashboardStats.lastDelivery ? ` (${dashboardStats.lastDelivery.delivery_code})` : ""}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Top 5 productos por volumen */}
        {topProducts.length > 0 && (() => {
          const maxTotal = topProducts[0].total;
          return (
            <div className="border border-border rounded-lg bg-card/50 overflow-hidden">
              <div className="px-5 pt-4 pb-2 flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground">Top 5 productos por volumen recibido</h3>
                <span className="text-xs text-muted-foreground">{dashboardStats?.totalBultosAll.toLocaleString("es-MX")} bultos total</span>
              </div>
              <div className="px-5 pb-4 pt-1 space-y-3">
                {topProducts.map((p, i) => {
                  const pct = maxTotal > 0 ? (p.total / maxTotal) * 100 : 0;
                  return (
                    <div key={p.clave} className="group">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: "linear-gradient(135deg, #3b82f6, #60a5fa)" }}>
                            {i + 1}
                          </div>
                          <span className="text-sm truncate text-foreground">{p.name}</span>
                        </div>
                        <span className="text-sm font-bold text-foreground tabular-nums ml-3 shrink-0">{p.total.toLocaleString("es-MX")}</span>
                      </div>
                      <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(59,130,246,0.1)" }}>
                        <div
                          className="h-full rounded-full animate-bar-grow"
                          style={{
                            width: `${barsAnimated ? pct : 0}%`,
                            background: "linear-gradient(90deg, #3b82f6, #60a5fa)",
                            boxShadow: "0 0 12px rgba(96,165,250,0.5), 0 0 4px rgba(59,130,246,0.3)",
                            transition: `width 1s cubic-bezier(0.22, 1, 0.36, 1) ${i * 0.12}s`,
                          }}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">{p.clave}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Bulk action bar */}
        <div className="hidden md:flex flex-col sm:flex-row items-start sm:items-center gap-3 px-3 rounded-lg border border-border min-h-[48px]">
          <span className="text-sm font-medium text-foreground">{selectedIds.size} seleccionadas</span>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => { setBulkStatus("Recibido"); setBulkAction("status"); }} disabled={selectedIds.size === 0}>
              Cambiar estado
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setBulkDate(new Date()); setBulkAction("date"); }} disabled={selectedIds.size === 0}>
              Cambiar fecha
            </Button>
            <Button size="sm" variant="outline" className="text-red-400 hover:text-red-300" onClick={() => setBulkAction("delete")} disabled={selectedIds.size === 0}>
              <Trash2 className="h-4 w-4 mr-1" /> Eliminar
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} disabled={selectedIds.size === 0}>
            Deseleccionar
          </Button>
        </div>

        {/* Mobile card view */}
        <div className="space-y-3 md:hidden">
          {deliveriesLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <GlowCard key={i} className="p-4">
                <Skeleton className="h-4 w-3/4 bg-muted mb-2" />
                <Skeleton className="h-3 w-1/2 bg-muted" />
              </GlowCard>
            ))
          ) : filtered.length === 0 ? (
            <GlowCard className="p-6 text-center text-muted-foreground">
              No hay entregas que coincidan con los filtros.
            </GlowCard>
          ) : (
            filtered.map(delivery => (
              <GlowCard
                key={delivery.id}
                className={cn("p-4 cursor-pointer", selectedIds.has(delivery.id) && "ring-1 ring-primary/40")}
                onClick={() => toggleExpand(delivery.id)}
              >
                {/* Row 1: Delivery code + status badge */}
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-blue-400 font-bold text-sm">{delivery.delivery_code}</span>
                  <Badge className={cn(
                    "text-xs",
                    delivery.delivery_status === "Recibido"
                      ? "bg-green-500/20 text-green-400 border-green-500/30"
                      : "bg-amber-500/20 text-amber-400 border-amber-500/30"
                  )}>
                    {delivery.delivery_status}
                  </Badge>
                </div>

                {/* Row 2: Supplier + date */}
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-foreground truncate mr-2">{delivery.supplier || "—"}</span>
                  <span className="text-muted-foreground text-xs shrink-0">{fmtDate(delivery.delivery_date)}</span>
                </div>

                {/* Row 3: Grid with items count, total bultos, reference */}
                <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                  <div className="bg-muted/40 rounded px-2 py-1.5">
                    <span className="text-muted-foreground block">SKUs</span>
                    <span className="text-foreground font-semibold">{delivery.line_items}</span>
                  </div>
                  <div className="bg-muted/40 rounded px-2 py-1.5">
                    <span className="text-muted-foreground block">Bultos</span>
                    <span className="text-foreground font-semibold">{delivery.total_bultos}</span>
                  </div>
                  {delivery.reference ? (
                    <div className="bg-muted/40 rounded px-2 py-1.5">
                      <span className="text-muted-foreground block">Ref</span>
                      <span className="text-foreground font-semibold truncate block">{delivery.reference}</span>
                    </div>
                  ) : (
                    <div />
                  )}
                </div>

                {/* Row 4: Notes (if exists, truncated) */}
                {delivery.notes && (
                  <p className="text-xs text-muted-foreground truncate mb-1.5">{delivery.notes}</p>
                )}

                {/* Row 5: Top product name */}
                {delivery.top_product_name && (
                  <p className="text-xs text-muted-foreground truncate">
                    {delivery.top_product_name}
                    {delivery.line_items > 1 && <span className="ml-1">+{delivery.line_items - 1} más</span>}
                  </p>
                )}

                {/* Expanded content */}
                {expandedIds.has(delivery.id) && (
                  <div className="mt-3 pt-3 border-t border-border" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-end gap-1 mb-2">
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(delivery)} className="h-8 w-8">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteId(delivery.id)} className="h-8 w-8 text-red-400 hover:text-red-300">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <DeliveryExpandedRow deliveryId={delivery.id} />
                  </div>
                )}
              </GlowCard>
            ))
          )}
        </div>

        {/* Desktop table */}
        <GlowCard className="overflow-hidden hidden md:block">
          <div className="overflow-x-auto" style={{ scrollbarGutter: "stable" }}>
            <Table style={{ tableLayout: "fixed", width: "100%" }}>
              <colgroup>
                <col style={{ width: 40 }} />
                <col style={{ width: 40 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 120 }} />
                <col />
                <col style={{ width: 70 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 100 }} />
              </colgroup>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="hidden md:table-cell">
                    <Checkbox
                      checked={filtered.length > 0 && selectedIds.size === filtered.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="hidden md:table-cell"></TableHead>
                  <TableHead className="text-foreground font-semibold">Entrada</TableHead>
                  <TableHead className="text-foreground font-semibold">Fecha</TableHead>
                  <TableHead className="text-foreground font-semibold hidden md:table-cell">Proveedor</TableHead>
                  <TableHead className="text-foreground font-semibold hidden lg:table-cell">Productos</TableHead>
                  <TableHead className="text-foreground font-semibold text-right hidden lg:table-cell">SKUs</TableHead>
                  <TableHead className="text-foreground font-semibold text-right">Total Bultos</TableHead>
                  <TableHead className="text-foreground font-semibold">Estado</TableHead>
                  <TableHead className="text-foreground font-semibold text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveriesLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full bg-muted" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      No hay entregas que coincidan con los filtros.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(delivery => (
                    <React.Fragment key={delivery.id}>
                      <TableRow
                        className={cn("border-border hover:bg-muted/50 cursor-pointer", selectedIds.has(delivery.id) && "bg-muted/30")}
                        onClick={() => toggleExpand(delivery.id)}
                      >
                        <TableCell className="hidden md:table-cell" onClick={e => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(delivery.id)}
                            onCheckedChange={() => toggleSelect(delivery.id)}
                          />
                        </TableCell>
                        <TableCell className="hidden md:table-cell px-1" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleExpand(delivery.id)}>
                            {expandedIds.has(delivery.id)
                              ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          </Button>
                        </TableCell>
                        <TableCell className="font-mono text-blue-400 font-medium">{delivery.delivery_code}</TableCell>
                        <TableCell className="text-foreground">{fmtDate(delivery.delivery_date)}</TableCell>
                        <TableCell className="hidden md:table-cell text-foreground truncate">{delivery.supplier || "—"}</TableCell>
                        <TableCell className="hidden lg:table-cell text-muted-foreground text-sm truncate">
                          {delivery.top_product_name
                            ? <>{delivery.top_product_name}{delivery.line_items > 1 && <span className="text-xs ml-1">+{delivery.line_items - 1} más</span>}</>
                            : "—"
                          }
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-foreground text-right">{delivery.line_items}</TableCell>
                        <TableCell className="text-foreground text-right font-semibold">{delivery.total_bultos}</TableCell>
                        <TableCell>
                          <Badge className={cn(
                            "text-xs",
                            delivery.delivery_status === "Recibido"
                              ? "bg-green-500/20 text-green-400 border-green-500/30"
                              : "bg-amber-500/20 text-amber-400 border-amber-500/30"
                          )}>
                            {delivery.delivery_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            {delivery.adm_proof_path && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  const { data } = supabase.storage
                                    .from("stock-delivery-documents")
                                    .getPublicUrl(delivery.adm_proof_path!);
                                  window.open(data.publicUrl, "_blank", "noopener,noreferrer");
                                }}
                                className="h-8 w-8 text-blue-400 hover:text-blue-300"
                                title="Descargar comprobante del proveedor"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => openEditDialog(delivery)} className="h-8 w-8">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteId(delivery.id)} className="h-8 w-8 text-red-400 hover:text-red-300">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandedIds.has(delivery.id) && (
                        <TableRow key={`${delivery.id}-expanded`} className="bg-muted/20">
                          <TableCell colSpan={10} className="p-4 overflow-hidden" style={{ maxWidth: 0 }}>
                            <DeliveryExpandedRow deliveryId={delivery.id} />
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </GlowCard>
      </div>

      {/* New/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[96vw] sm:max-w-6xl max-h-[92vh] overflow-y-auto p-0">
          <DialogHeader className="px-4 sm:px-6 pt-6 pb-0">
            <DialogTitle className="text-xl">
              {editingDelivery
                ? `Editar entrada ${editingDelivery.delivery_code}`
                : `Nueva entrada — ${nextDeliveryCode}`}
            </DialogTitle>
            <DialogDescription>
              {editingDelivery ? "Modifica los datos de la entrada y sus productos." : "Registra una nueva entrada con uno o más productos."}
            </DialogDescription>
          </DialogHeader>

          <div className="px-4 sm:px-6 pb-6 mt-4">
            {editingDelivery ? (
              manualForm
            ) : (
              <Tabs defaultValue="image" className="w-full">
                <TabsList className="w-full">
                  <TabsTrigger value="image" className="flex-1 gap-2">
                    <Camera className="h-3.5 w-3.5" /> Imagen del proveedor
                  </TabsTrigger>
                  <TabsTrigger value="manual" className="flex-1">Manual</TabsTrigger>
                  <TabsTrigger value="paste" className="flex-1 gap-2">
                    <ClipboardPaste className="h-3.5 w-3.5" /> Pegar datos
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="image">
                  <EntradaImageImport
                    onSaved={() => {
                      queryClient.invalidateQueries({ queryKey: ["delivery-summary"] });
                      setDialogOpen(false);
                    }}
                  />
                </TabsContent>
                <TabsContent value="manual">{manualForm}</TabsContent>
                <TabsContent value="paste">{pasteTab}</TabsContent>
              </Tabs>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk status change dialog */}
      <Dialog open={bulkAction === "status"} onOpenChange={open => !open && setBulkAction(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cambiar estado ({selectedIds.size} entregas)</DialogTitle>
            <DialogDescription>Selecciona el nuevo estado para las entregas seleccionadas.</DialogDescription>
          </DialogHeader>
          <Select value={bulkStatus} onValueChange={setBulkStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Recibido">Recibido</SelectItem>
              <SelectItem value="Programado">Programado</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleBulkStatusChange} disabled={bulkProcessing} className="w-full gradient-button text-white">
            {bulkProcessing ? "Aplicando..." : `Cambiar a ${bulkStatus}`}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Bulk date change dialog */}
      <Dialog open={bulkAction === "date"} onOpenChange={open => !open && setBulkAction(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cambiar fecha ({selectedIds.size} entregas)</DialogTitle>
            <DialogDescription>Selecciona la nueva fecha para las entregas seleccionadas.</DialogDescription>
          </DialogHeader>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(bulkDate, "dd/MM/yy", { locale: dateLocale })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={bulkDate}
                onSelect={d => { if (d) { setBulkDate(d); } }}
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          <Button onClick={handleBulkDateChange} disabled={bulkProcessing} className="w-full gradient-button text-white">
            {bulkProcessing ? "Aplicando..." : "Aplicar fecha"}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Bulk delete confirmation */}
      <AlertDialog open={bulkAction === "delete"} onOpenChange={open => !open && setBulkAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar {selectedIds.size} entregas</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminarán las entregas y todos sus productos asociados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} disabled={bulkProcessing} className="bg-red-600 hover:bg-red-700">
              {bulkProcessing ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar entrada</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará la entrada y todos sus productos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Product Detail Popup */}
      <Dialog open={!!viewProductId} onOpenChange={(open) => { if (!open) setViewProductId(null); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="px-4 sm:px-6 pt-6 pb-0">
            <DialogTitle className="text-xl">
              {productDetail ? `${productDetail.clave} \u2014 ${productDetail.name}` : "Cargando..."}
            </DialogTitle>
          </DialogHeader>

          {productDetail ? (
            <div className="px-4 sm:px-6 pb-6 mt-4 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                {/* LEFT: Product Info */}
                <div className="border border-border rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Información del producto</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Clave / SKU</span>
                      <span className="font-mono text-blue-400">{productDetail.clave}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Nombre</span>
                      <span className="text-right max-w-[250px] font-medium">{productDetail.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Marca</span>
                      <span>{productDetail.brand || "\u2014"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Proveedor</span>
                      <span>{productDetail.supplier || "\u2014"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Peso</span>
                      <span>{productDetail.weight_kg ? `${productDetail.weight_kg} kg` : "\u2014"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Estado</span>
                      <Badge className={cn("text-xs", productDetail.active ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-muted text-muted-foreground border-border")}>
                        {productDetail.active ? "Activo" : "Inactivo"}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* RIGHT: Pricing */}
                <div className="border border-border rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Precios y márgenes</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Precio venta (con IVA)</span>
                      <span className="font-bold text-green-400">{productDetail.sale_price_with_iva != null ? `$${productDetail.sale_price_with_iva.toLocaleString("es-MX")}` : "\u2014"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Precio venta (sin IVA)</span>
                      <span>{productDetail.sale_price_without_iva != null ? `$${productDetail.sale_price_without_iva.toLocaleString("es-MX", { minimumFractionDigits: 2 })}` : "\u2014"}</span>
                    </div>
                    <div className="border-t border-border/50 my-1" />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Costo (sin IVA)</span>
                      <span>{productDetail.cost_without_iva != null ? `$${productDetail.cost_without_iva.toLocaleString("es-MX", { minimumFractionDigits: 2 })}` : "\u2014"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Costo (con IVA)</span>
                      <span>{productDetail.cost_with_iva != null ? `$${productDetail.cost_with_iva.toLocaleString("es-MX", { minimumFractionDigits: 2 })}` : "\u2014"}</span>
                    </div>
                    <div className="border-t border-border/50 my-1" />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Margen normal</span>
                      <span className={cn("font-bold", (productDetail.margin_pct_normal ?? 0) >= 0 ? "text-green-400" : "text-red-400")}>
                        {productDetail.margin_pct_normal != null ? `${productDetail.margin_pct_normal.toFixed(1)}%` : "\u2014"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Bonificación</span>
                      <span>{productDetail.bonificacion_pct != null ? `${(productDetail.bonificacion_pct * 100).toFixed(0)}%` : "\u2014"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Costo con bonificación</span>
                      <span>{productDetail.cost_bonificacion_without_iva != null ? `$${productDetail.cost_bonificacion_without_iva.toLocaleString("es-MX", { minimumFractionDigits: 2 })}` : "\u2014"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Margen con bonificación</span>
                      <span className={cn("font-bold", (productDetail.margin_pct_bonificacion ?? 0) >= 0 ? "text-green-400" : "text-red-400")}>
                        {productDetail.margin_pct_bonificacion != null ? `${productDetail.margin_pct_bonificacion.toFixed(1)}%` : "\u2014"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stock section - full width */}
              <div className="border border-border rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Inventario</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-amber-400">{(productDetail.stock_actual ?? 0) + (productDetail.stock_committed ?? 0)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Stock total</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-400">{productDetail.stock_actual ?? 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">Stock actual</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-400">{productDetail.stock_committed ?? 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">Comprometido</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="px-4 sm:px-6 pb-6 space-y-4 mt-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Placement suggestion dialog — opens from "Colocar" button on
          any expanded delivery line item. Suggests warehouse slots
          based on existing stock, upcoming pedidos, and access_type. */}
      {placementItem && (
        <PlacementSuggestionDialog
          open={!!placementItem}
          onOpenChange={(o) => { if (!o) setPlacementItem(null); }}
          productId={placementItem.product_id}
          productClave={placementItem.products?.clave ?? ""}
          productName={placementItem.products?.name ?? ""}
          productImageUrl={placementItem.products?.image_url ?? null}
          totalQuantity={placementItem.quantity}
          stockEntryId={placementItem.id}
        />
      )}
    </div>
  );
}
