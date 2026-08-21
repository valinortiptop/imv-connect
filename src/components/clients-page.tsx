// @ts-nocheck
import React, { useState, useMemo, useCallback, useEffect, useDeferredValue } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate, Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { GlowCard } from "@/components/ui/spotlight-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProductThumb } from "@/components/ui/product-thumb";
import { ClientTypeBadge } from "@/components/ui/client-type-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { TimePicker } from "@/components/ui/time-picker";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern";
import { ChronoBar } from "@/components/ChronoBar";
import { Search, Pencil, Plus, Trash2, ChevronRight, ChevronDown, Loader2, DollarSign, Users, ShoppingCart, Crown, Download, Upload, FileText, X, CheckCircle2, Eye, Wand2, MapPin } from "lucide-react";
import { parseCfdiPdf, type CfdiData } from "@/lib/cfdi-parser";
import html2canvas from "html2canvas";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { parseLocalDate } from "@/lib/date-utils";
import { StatusBadge } from "@/components/orders/StatusBadge";
import { OrderDetailSheet } from "@/components/orders/OrderDetailSheet";
import { exportOrderAsImage } from "@/components/orders/SingleOrderImageCard";
import { Client360Drawer } from "@/components/clients/Client360Drawer";
import { ClientsImportDialog } from "@/components/clients/ClientsImportDialog";
import { ClientsMapView } from "@/components/clients/ClientsMapView";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { useRoles } from "@/lib/use-roles";
import { stripVmPrefix, isVmClient, isGenericRfc, GENERIC_RFC } from "@/lib/vm-client";


type ClientType = "mayoreo" | "menudeo";

type Client = {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  address: string | null;
  central: string | null;
  rfc: string | null;
  razon_social: string | null;
  curp: string | null;
  codigo_postal: string | null;
  nombre_cfdi: string | null;
  payment_method: string | null;
  cfdi_pdf_path: string | null;
  active: boolean;
  client_type: ClientType;
  created_at: string;
  delivery_window_from: string | null;
  delivery_window_until: string | null;
  delivery_notes: string | null;
  lat: number | null;
  lng: number | null;
  google_place_id: string | null;
  contact: string | null;
  representante_id: string | null;
  representante_nombre: string | null;
  parent_cliente_id: string | null;
  parent_name: string | null;
};

type ClientForm = {
  name: string;
  company: string;
  phone: string;
  address: string;
  central: string;
  rfc: string;
  razon_social: string;
  curp: string;
  codigo_postal: string;
  nombre_cfdi: string;
  payment_method: string;
  active: boolean;
  price_list_id: string | null;
  client_type: ClientType;
  delivery_window_from: string;
  delivery_window_until: string;
  delivery_notes: string;
  lat: number | null;
  lng: number | null;
  google_place_id: string | null;
};

const emptyForm: ClientForm = {
  name: "",
  company: "",
  phone: "",
  address: "",
  central: "",
  rfc: "",
  razon_social: "",
  curp: "",
  codigo_postal: "",
  nombre_cfdi: "",
  payment_method: "Transferencia",
  active: true,
  price_list_id: null,
  client_type: "mayoreo",
  delivery_window_from: "",
  delivery_window_until: "",
  delivery_notes: "",
  lat: null,
  lng: null,
  google_place_id: null,
};

const mxnFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const CLIENTS_PAGE_SIZE = 100;
const EXPANDED_CLIENT_ORDERS_LIMIT = 50;

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try { return format(parseLocalDate(d), "dd/MM/yy"); } catch { return d; }
};

/* ------------------------------------------------------------------ */
/*  Expanded row sub-component                                        */
/* ------------------------------------------------------------------ */
function getFirstOfMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function ClientExpandedRow({ client, onViewOrder, onNavigateProduct }: { client: Client; onViewOrder?: (orderId: string) => void; onNavigateProduct?: (clave: string) => void }) {
  const [dateFrom, setDateFrom] = useState<string>(getFirstOfMonth());
  const [dateTo, setDateTo] = useState<string>("");
  const [mobileTab, setMobileTab] = useState<"pedidos" | "productos">("pedidos");

  // Fetch orders for this client (incl. discount so totals subtract it)
  const { data: allOrders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["client-orders", client.id],
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("orders")
        .select("id, order_code, order_date, delivery_date, status, notes, discount_amount, discount_reason")
        .eq("client_id", client.id)
        .order("order_date", { ascending: false })
        .limit(EXPANDED_CLIENT_ORDERS_LIMIT);
      return data ?? [];
    },
  });

  const expandedOrderIds = useMemo(() => allOrders.map((o: any) => o.id), [allOrders]);

  // Fetch order items only for the visible recent orders. Expanding a row
  // should never pull a client's complete historical purchase record.
  const { data: orderItems = [] } = useQuery({
    queryKey: ["client-products", client.id, expandedOrderIds.join(",")],
    enabled: expandedOrderIds.length > 0,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const { data: items } = await supabase
        .from("order_items")
        .select("order_id, quantity, product_id, unit_price_override")
        .in("order_id", expandedOrderIds);
      if (!items?.length) return [];
      const productIds = [...new Set(items.map(i => i.product_id))];
      const { data: prods } = await supabase
        .from("products")
        .select("id, clave, name, sale_price_with_iva, image_url")
        .in("id", productIds);
      const pmap = new Map((prods ?? []).map(p => [p.id, p]));
      return items.map(i => ({ ...i, products: pmap.get(i.product_id) ?? null }));
    },
  });


  // Filter orders by date range
  const orders = useMemo(() => {
    return allOrders.filter(o => {
      if (!o.order_date) return true;
      if (dateFrom && o.order_date < dateFrom) return false;
      if (dateTo && o.order_date > dateTo) return false;
      return true;
    });
  }, [allOrders, dateFrom, dateTo]);

  const filteredOrderIds = useMemo(() => new Set(orders.map(o => o.id)), [orders]);

  // Compute per-order NET totals (filtered, discount applied)
  const orderTotalMap = useMemo(() => {
    // First pass: gross subtotal from line items
    const gross: Record<string, number> = {};
    for (const item of orderItems) {
      if (!filteredOrderIds.has(item.order_id)) continue;
      const price = item.unit_price_override ?? (item.products as any)?.sale_price_with_iva ?? 0;
      gross[item.order_id] = (gross[item.order_id] ?? 0) + price * item.quantity;
    }
    // Second pass: subtract each order's discount, floor at 0
    const map: Record<string, number> = {};
    for (const o of allOrders as any[]) {
      const subtotal = gross[o.id] ?? 0;
      if (subtotal === 0) continue;
      const discount = Math.min(Number(o.discount_amount) || 0, subtotal);
      map[o.id] = Math.max(0, subtotal - discount);
    }
    return map;
  }, [orderItems, filteredOrderIds, allOrders]);

  const totalRevenue = useMemo(() => Object.values(orderTotalMap).reduce((s, v) => s + v, 0), [orderTotalMap]);

  // Filter order items by date range
  const filteredItems = useMemo(() =>
    orderItems.filter(i => filteredOrderIds.has((i as any).order_id ?? "")),
  [orderItems, filteredOrderIds]);

  // Aggregate top products
  const topProducts = useMemo(() => {
    const agg: Record<string, { name: string; clave: string; image_url: string | null; totalQty: number }> = {};
    for (const item of filteredItems) {
      const prod = (item as any).products;
      const key = item.product_id;
      if (!agg[key]) {
        agg[key] = { name: prod?.name ?? "?", clave: prod?.clave ?? "", image_url: prod?.image_url ?? null, totalQty: 0 };
      }
      agg[key].totalQty += item.quantity;
    }
    return Object.values(agg).sort((a, b) => b.totalQty - a.totalQty).slice(0, 5);
  }, [filteredItems]);

  // Total bultos ordered
  const totalBultos = useMemo(() => filteredItems.reduce((s, i) => s + i.quantity, 0), [filteredItems]);

  // Monthly order data for current month
  const currentMonthOrders = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    return orders.filter(o => {
      if (!o.order_date) return false;
      const d = parseLocalDate(o.order_date);
      return d.getMonth() === month && d.getFullYear() === year;
    });
  }, [orders]);

  const currentMonthRevenue = useMemo(() =>
    currentMonthOrders.reduce((s, o) => s + (orderTotalMap[o.id] ?? 0), 0),
  [currentMonthOrders, orderTotalMap]);

  const dateLabel = useMemo(() => {
    if (!dateFrom && !dateTo) return "Todo el tiempo";
    if (dateFrom && dateTo) return `${dateFrom} — ${dateTo}`;
    if (dateFrom) return `Desde ${dateFrom}`;
    return `Hasta ${dateTo}`;
  }, [dateFrom, dateTo]);

  const setThisMonth = () => {
    const now = new Date();
    setDateFrom(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);
    setDateTo("");
  };

  const setLifetime = () => {
    setDateFrom("");
    setDateTo("");
  };


  return (
    <div className="space-y-4 py-2">
      {/* Date range filter */}
      <ChronoBar
        dateFrom={dateFrom}
        dateTo={dateTo}
        onChange={(from, to) => { setDateFrom(from); setDateTo(to); }}
      />

      {/* Top row: KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{orders.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Total pedidos</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <p className="text-2xl font-bold text-green-400">{mxnFmt.format(totalRevenue)}</p>
          <p className="text-xs text-muted-foreground mt-1">Total facturado</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <p className="text-2xl font-bold text-blue-400">{currentMonthOrders.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Pedidos este mes</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{totalBultos.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1">Bultos totales</p>
        </div>
      </div>

      {/* Bottom row: Fiscal info + Orders + Top Products */}

      {/* Información Fiscal card — always visible */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h4 className="text-sm font-semibold text-foreground border-b border-border pb-2">{"Información Fiscal"}</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{"Dirección"}</span>
            <span className="text-foreground text-right max-w-[200px]">{client.address || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">RFC</span>
            <span className="font-mono text-blue-400">{client.rfc || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">CURP</span>
            <span className="font-mono text-foreground text-xs">{client.curp || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{"Razón Social"}</span>
            <span className="text-foreground">{client.razon_social || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Nombre CFDI</span>
            <span className="text-foreground text-right max-w-[180px]">{client.nombre_cfdi || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{"Código Postal"}</span>
            <span className="text-foreground">{client.codigo_postal || "—"}</span>
          </div>
        </div>
      </div>

      {/* Mobile tab switcher — visible only on small screens */}
      <div className="flex md:hidden gap-1 rounded-lg border border-border bg-card p-1">
        <button
          className={cn(
            "flex-1 text-sm font-medium py-2 rounded-md transition-colors",
            mobileTab === "pedidos"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
          onClick={() => setMobileTab("pedidos")}
        >
          Pedidos
        </button>
        <button
          className={cn(
            "flex-1 text-sm font-medium py-2 rounded-md transition-colors",
            mobileTab === "productos"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
          onClick={() => setMobileTab("productos")}
        >
          Top Productos
        </button>
      </div>

      {/* Desktop: side-by-side grid; Mobile: only the active tab */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Historial de pedidos card */}
        <div className={cn(
          "rounded-lg border border-border bg-card p-4 space-y-3 min-w-0",
          mobileTab !== "pedidos" && "hidden md:block"
        )}>
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h4 className="text-sm font-semibold text-foreground">Historial de pedidos</h4>
            <span className="text-[10px] text-muted-foreground">{orders.length} pedidos{dateFrom || dateTo ? " (filtrado)" : ""}</span>
          </div>
          {ordersLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
            </div>
          ) : orders.length > 0 ? (
            <div className="max-h-[220px] overflow-y-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="text-muted-foreground text-xs border-b border-border/50">
                    <th className="text-left py-1.5">Pedido</th>
                    <th className="text-left py-1.5">Fecha</th>
                    <th className="text-left py-1.5">Estado</th>
                    <th className="text-right py-1.5">Total</th>
                    <th className="py-1.5 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id} className="border-t border-border/30 hover:bg-muted/30">
                      <td className="py-1.5 font-mono text-blue-400 text-xs">
                        <button
                          className="hover:underline hover:text-blue-300 transition-colors cursor-pointer"
                          onClick={() => onViewOrder?.(o.id)}
                        >
                          {o.order_code}
                        </button>
                      </td>
                      <td className="py-1.5 text-muted-foreground text-xs">{fmtDate(o.order_date)}</td>
                      <td className="py-1.5"><StatusBadge status={o.status} /></td>
                      <td className="py-1.5 text-right text-foreground text-xs">{mxnFmt.format(orderTotalMap[o.id] ?? 0)}</td>
                      <td className="py-1.5 text-right">
                        <button
                          className="text-muted-foreground hover:text-foreground transition-colors p-1"
                          onClick={(e) => { e.stopPropagation(); exportOrderAsImage(o.id); }}
                          title="Descargar PDF"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">Sin pedidos registrados.</p>
          )}
        </div>

        {/* Top products card */}
        <div className={cn(
          "rounded-lg border border-border bg-card p-4 space-y-3 min-w-0 overflow-hidden",
          mobileTab !== "productos" && "hidden md:block"
        )}>
          <h4 className="text-sm font-semibold text-foreground border-b border-border pb-2">{"Productos más pedidos"}</h4>
          {topProducts.length > 0 ? (
            <div className="space-y-2">
              {topProducts.map((p, i) => (
                <div key={p.clave} className="flex items-center gap-2 min-w-0">
                  <span className={cn(
                    "flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0",
                    i === 0 ? "bg-yellow-500/20 text-yellow-400" :
                    i === 1 ? "bg-gray-400/20 text-gray-400" :
                    i === 2 ? "bg-orange-500/20 text-orange-400" :
                    "bg-muted text-muted-foreground"
                  )}>{i + 1}</span>
                  <ProductThumb src={p.image_url} size="sm" />
                  <button
                    className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity cursor-pointer"
                    onClick={() => onNavigateProduct?.(p.clave)}
                  >
                    <p className="text-sm text-foreground truncate hover:text-blue-400 transition-colors">{p.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{p.clave}</p>
                  </button>
                  <span className="text-sm font-bold text-foreground whitespace-nowrap">{p.totalQty.toLocaleString()} bultos</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">Sin productos registrados.</p>
          )}
        </div>
      </div>

    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Clients page                                                 */
/* ------------------------------------------------------------------ */
export default function Clients({ restrictClientIds }: { restrictClientIds?: string[] | null } = {}) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const getFirstOfMonth = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  };
  const [dateFrom, setDateFrom] = useState(getFirstOfMonth());
  const [dateTo, setDateTo] = useState("");

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  // Mayoreo / Menudeo / Todos. Default 'todos' so the page always
  // opens with every client visible — the toggle is a filter, not a
  // gate. URL-synced so links survive a refresh.
  const [typeFilter, setTypeFilter] = useState<"mayoreo" | "menudeo" | "todos">(() => {
    const t = searchParams.get("type");
    return t === "mayoreo" || t === "menudeo" ? t : "todos";
  });
  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (typeFilter === "todos") next.delete("type"); // omit default
      else next.set("type", typeFilter);
      return next;
    }, { replace: true });
  }, [typeFilter, setSearchParams]);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState<ClientForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deactivateClient, setDeactivateClient] = useState<Client | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // B2: filter to clients missing their delivery window (either side
  // null OR same value, both flagged as broken/incomplete). Drives the
  // "Sin horario" chip + powers the bulk-capture flow.
  const [sinHorarioOnly, setSinHorarioOnly] = useState(false);
  // Bulk-window-capture modal state — controls visibility + form values.
  const [bulkWindowOpen, setBulkWindowOpen] = useState(false);
  const [bulkWindowFrom, setBulkWindowFrom] = useState("");
  const [bulkWindowUntil, setBulkWindowUntil] = useState("");
  const [bulkWindowNotes, setBulkWindowNotes] = useState("");
  const [bulkWindowSaving, setBulkWindowSaving] = useState(false);
  const [bulkAction, setBulkAction] = useState<"payment" | "active" | "delete" | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [viewOrderId, setViewOrderId] = useState<string | null>(null);
  const [client360Id, setClient360Id] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [page, setPage] = useState(1);
  const { isAdmin } = useRoles();

  const [cfdiUploading, setCfdiUploading] = useState(false);
  const [pendingCfdiFile, setPendingCfdiFile] = useState<File | null>(null);
  const [cfdiAutofill, setCfdiAutofill] = useState(true);
  const [cfdiParsing, setCfdiParsing] = useState(false);

  // Handle expandClient URL param (from Orders page cross-link)
  useEffect(() => {
    const expandClientId = searchParams.get("expandClient");
    if (expandClientId) {
      setExpandedIds(new Set([expandClientId]));
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("expandClient");
        return next;
      }, { replace: true });
      // No scroll — keep page static
    }
  }, []);

  const toggleExpand = (id: string, anchorEl?: HTMLElement | null) => {
    // Keep the clicked row visually anchored: remember its offset from the top
    // of the viewport and restore it after the expand/collapse re-render.
    const before = anchorEl?.getBoundingClientRect().top ?? null;
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    if (before != null && anchorEl) {
      requestAnimationFrame(() => {
        const after = anchorEl.getBoundingClientRect().top;
        const delta = after - before;
        if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: "instant" as ScrollBehavior });
      });
    }
  };


  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.style.setProperty("--x", `${e.clientX}px`);
    el.style.setProperty("--y", `${e.clientY}px`);
  }, []);

  const restrictKey = restrictClientIds ? [...restrictClientIds].sort().join(",") : null;
  const { data: clients, isLoading, error } = useQuery({
    queryKey: ["clients", restrictKey],
    queryFn: async () => {
      if (restrictClientIds && restrictClientIds.length === 0) return [] as Client[];
      const { fetchAllRows } = await import("@/lib/fetch-all");
      const [data, reps] = await Promise.all([
        fetchAllRows<any>(() => {
          let q = supabase.from("clients").select("*").order("name");
          if (restrictClientIds && restrictClientIds.length > 0) q = q.in("id", restrictClientIds);
          return q;
        }),
        (async () => (await supabase.from("representantes").select("id, nombre")).data ?? [])(),
      ]);
      const repMap = new Map((reps ?? []).map((r: any) => [r.id, r.nombre]));
      return data.map((c: any) => ({
        ...c,
        representante_nombre: (repMap.get((c as any).representante_id) as string | null) || c.contact || null,
      })) as Client[];
    },
  });

  // Available price lists — for the per-client default picker
  const { data: priceLists = [] } = useQuery({
    queryKey: ["price-lists-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("price_lists")
        .select("id, name, default_for_client_type")
        .eq("active", true)
        .order("name") as any;
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; default_for_client_type: "mayoreo" | "menudeo" | null }[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Dashboard stats are aggregated in Postgres. Pulling every order into the
  // browser was the main source of stalls on the clients page.
  const { data: dashboardPayload = null } = useQuery({
    queryKey: ["client-dashboard-stats", dateFrom || null, dateTo || null],
    enabled: !restrictClientIds,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("clients_dashboard_stats", {
        _date_from: dateFrom || null,
        _date_to: dateTo || null,
      });
      if (error) throw error;
      return data as any;
    },
  });

  const dashboardStats = useMemo(() => {
    if (!dashboardPayload) return null;
    return {
      ticketPromedio: Number(dashboardPayload.ticketPromedio ?? 0),
      pedidosPorCliente: Number(dashboardPayload.pedidosPorCliente ?? 0),
      topClient: dashboardPayload.topClient ?? null,
      totalClientes: Number(dashboardPayload.totalClientes ?? 0),
    };
  }, [dashboardPayload]);

  const topClientsBySales = useMemo(() => (
    Array.isArray(dashboardPayload?.topClientsBySales)
      ? dashboardPayload.topClientsBySales.map((c: any) => ({
          name: String(c.name ?? "Cliente"),
          total: Number(c.total ?? 0),
          orders: Number(c.orders ?? 0),
        }))
      : []
  ), [dashboardPayload]);

  const [barsAnimated, setBarsAnimated] = useState(false);
  useEffect(() => {
    if (topClientsBySales.length > 0) {
      const t = setTimeout(() => setBarsAnimated(true), 100);
      return () => clearTimeout(t);
    }
  }, [topClientsBySales]);

  if (error) {
    toast({ title: t("error"), description: t("clientsLoadError"), variant: "destructive" });
  }

  // Active clients without a complete delivery window — drives the
  // "Sin horario" chip count + (when toggled) filters the list.
  // A window is "complete" only when BOTH from AND until are set; that
  // matches the B1 form validation and is what Maniobra needs to
  // position the bar on the timeline.
  const sinHorarioCount = useMemo(() => {
    if (!clients) return 0;
    return clients.filter(c =>
      c.active && (!(c as any).delivery_window_from || !(c as any).delivery_window_until)
    ).length;
  }, [clients]);

  const filtered = useMemo(() => {
    if (!clients) return [];
    const out = clients.filter(c => {
      if (activeFilter === "active" && !c.active) return false;
      if (activeFilter === "inactive" && c.active) return false;
      if (typeFilter === "mayoreo" && c.client_type !== "mayoreo") return false;
      if (typeFilter === "menudeo" && c.client_type !== "menudeo") return false;
      if (sinHorarioOnly) {
        const a = (c as any).delivery_window_from;
        const b = (c as any).delivery_window_until;
        if (a && b) return false; // has complete window — exclude
      }
      if (deferredSearch.trim()) {
        const q = deferredSearch.toLowerCase();
        if (
          !c.name?.toLowerCase().includes(q) &&
          !c.company?.toLowerCase().includes(q) &&
          !c.phone?.toLowerCase().includes(q) &&
          !c.rfc?.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
    // In Todos view, group mayoreo first then menudeo, alphabetical
    // within each group. In single-type views the existing 'order by
    // name' from the SQL fetch already gives us alphabetical.
    if (typeFilter === "todos") {
      out.sort((a, b) => {
        if (a.client_type !== b.client_type) {
          return a.client_type === "mayoreo" ? -1 : 1;
        }
        return (a.name ?? "").localeCompare(b.name ?? "", "es");
      });
    }
    return out;
  }, [clients, deferredSearch, activeFilter, typeFilter, sinHorarioOnly]);

  useEffect(() => {
    setPage(1);
    setExpandedIds(new Set());
  }, [deferredSearch, activeFilter, typeFilter, sinHorarioOnly]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / CLIENTS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginatedClients = useMemo(() => {
    if (viewMode === "map") return filtered;
    const start = (currentPage - 1) * CLIENTS_PAGE_SIZE;
    return filtered.slice(start, start + CLIENTS_PAGE_SIZE);
  }, [filtered, currentPage, viewMode]);

  const pageStart = filtered.length === 0 ? 0 : (currentPage - 1) * CLIENTS_PAGE_SIZE + 1;
  const pageEnd = Math.min(filtered.length, currentPage * CLIENTS_PAGE_SIZE);

  const updateField = (field: keyof ClientForm, value: string | boolean | null) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const openEdit = (c: Client) => {
    setIsNew(false);
    setEditClient(c);
    // Postgres returns time as "HH:MM:SS" — strip the seconds for the
    // <input type="time"> picker so the field doesn't render "11:00:00".
    const trimSecs = (t: string | null | undefined) =>
      t ? String(t).slice(0, 5) : "";
    setForm({
      name: c.name ?? "",
      company: c.company ?? "",
      phone: c.phone ?? "",
      address: c.address ?? "",
      central: c.central ?? "",
      rfc: c.rfc ?? "",
      razon_social: c.razon_social ?? "",
      curp: c.curp ?? "",
      codigo_postal: c.codigo_postal ?? "",
      nombre_cfdi: c.nombre_cfdi ?? "",
      payment_method: c.payment_method ?? "Transferencia",
      active: c.active,
      price_list_id: (c as any).price_list_id ?? null,
      client_type: c.client_type ?? "mayoreo",
      delivery_window_from: trimSecs(c.delivery_window_from),
      delivery_window_until: trimSecs(c.delivery_window_until),
      delivery_notes: c.delivery_notes ?? "",
      lat: c.lat ?? null,
      lng: c.lng ?? null,
      google_place_id: c.google_place_id ?? null,
    });
  };

  const openNew = () => {
    setIsNew(true);
    setEditClient({ id: "" } as Client);
    // Default new clients to mayoreo regardless of which filter is
    // currently active (per product call — keeps data entry predictable
    // even when the user is viewing menudeo or todos).
    setForm({ ...emptyForm, client_type: "mayoreo" });
    // Defensive: clear any CFDI file that might have been staged in a
    // previous new-client session that didn't go through closeDialog.
    setPendingCfdiFile(null);
  };

  const closeDialog = () => {
    setEditClient(null);
    setIsNew(false);
    setPendingCfdiFile(null);
  };

  // Same validation used in the form below — Desde+Hasta must be a
  // complete pair, and Hasta must come after Desde. Centralized here
  // so the Save button can be disabled with the same rule the inline
  // error message displays.
  const computeWindowError = (): string | null => {
    const a = form.delivery_window_from.trim();
    const b = form.delivery_window_until.trim();
    if (a && !b) return "Falta la hora «Hasta». Captura ambas o limpia las dos.";
    if (!a && b) return "Falta la hora «Desde». Captura ambas o limpia las dos.";
    if (a && b && b <= a) return "La hora «Hasta» debe ser posterior a «Desde».";
    return null;
  };
  const windowFormError = computeWindowError();

  const handleSave = async () => {
    if (!form.name.trim()) return;
    if (windowFormError) {
      toast({ title: "Horario de recepción inválido", description: windowFormError, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      // Auto-resolve default price list for this client_type when the
      // user did not manually pick one — matches whichever list is marked
      // `default_for_client_type` in price_lists.
      let resolvedPriceListId = form.price_list_id;
      if (!resolvedPriceListId) {
        const { data: defList } = await (supabase as any)
          .from("price_lists")
          .select("id")
          .eq("default_for_client_type", form.client_type)
          .eq("active", true)
          .maybeSingle();
        if (defList?.id) resolvedPriceListId = defList.id;
      }

      const payload = {
        name: form.name.trim(),
        company: form.company.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        central: form.central.trim() || null,
        rfc: form.rfc.trim() || null,
        razon_social: form.razon_social.trim() || null,
        curp: form.curp.trim() || null,
        codigo_postal: form.codigo_postal.trim() || null,
        nombre_cfdi: form.nombre_cfdi.trim() || null,
        payment_method: form.payment_method.trim() || "Transferencia",
        active: form.active,
        price_list_id: resolvedPriceListId,
        client_type: form.client_type,
        // Delivery reception window — empty inputs → NULL, which the
        // app reads as "no capturado" + renders the dashed warning chip.
        delivery_window_from:  form.delivery_window_from.trim()  || null,
        delivery_window_until: form.delivery_window_until.trim() || null,
        delivery_notes:        form.delivery_notes.trim()        || null,
        lat: form.lat,
        lng: form.lng,
        google_place_id: form.google_place_id,
      };

      if (isNew) {
        const { data: newClient, error } = await supabase.from("clients").insert(payload as any).select("id").single();
        if (error) throw error;
        // Upload pending CFDI if one was staged
        if (pendingCfdiFile && newClient) {
          await handleCfdiUpload(newClient.id, pendingCfdiFile);
          setPendingCfdiFile(null);
        }
        toast({ title: t("saved"), description: t("clientCreated") });
      } else {
        const { error } = await supabase
          .from("clients")
          .update(payload as any)
          .eq("id", editClient!.id);
        if (error) throw error;
        toast({ title: t("updated"), description: t("clientUpdated") });
      }

      queryClient.invalidateQueries({ queryKey: ["clients"] });
      closeDialog();
    } catch (err: any) {
      toast({ title: t("error"), description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateClient) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("clients")
        .update({ active: false })
        .eq("id", deactivateClient.id);
      if (error) throw error;
      toast({ title: t("updated"), description: t("clientDeactivated") });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      setDeactivateClient(null);
    } catch (err: any) {
      toast({ title: t("error"), description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleCfdiUpload = async (clientId: string, file: File) => {
    setCfdiUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "pdf";
      const filePath = `cfdi/${clientId}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("cfdi-documents")
        .upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from("clients")
        .update({ cfdi_pdf_path: filePath })
        .eq("id", clientId);
      if (updateError) throw updateError;

      toast({ title: "CFDI subido", description: file.name });
      // Update local editClient state so the UI reflects the change immediately
      if (editClient && editClient.id === clientId) {
        setEditClient({ ...editClient, cfdi_pdf_path: filePath });
      }
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    } catch (err: any) {
      toast({ title: "Error al subir CFDI", description: err.message, variant: "destructive" });
    } finally {
      setCfdiUploading(false);
    }
  };

  const handleCfdiDelete = async (clientId: string, path: string) => {
    try {
      await supabase.storage.from("cfdi-documents").remove([path]);
      await supabase.from("clients").update({ cfdi_pdf_path: null }).eq("id", clientId);
      toast({ title: "CFDI eliminado" });
      if (editClient && editClient.id === clientId) {
        setEditClient({ ...editClient, cfdi_pdf_path: null });
      }
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    const visibleIds = viewMode === "map" ? filtered.map((e) => e.id) : paginatedClients.map((e) => e.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
    if (allVisibleSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const showPagination = viewMode === "list" && filtered.length > CLIENTS_PAGE_SIZE;
  const PaginationControls = () => {
    if (!showPagination) return null;
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card/50 px-3 py-2">
        <p className="text-xs text-muted-foreground">
          Mostrando {pageStart}-{pageEnd} de {filtered.length}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="gap-1"
          >
            <ChevronRight className="h-4 w-4 rotate-180" /> Anterior
          </Button>
          <span className="min-w-16 text-center text-xs font-medium text-muted-foreground">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="gap-1"
          >
            Siguiente <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  const handleBulkPaymentChange = async (method: string) => {
    setBulkProcessing(true);
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase.from("clients").update({ payment_method: method }).in("id", ids);
      if (error) throw error;
      toast({ title: t("updated"), description: `${ids.length} clientes actualizados` });
      setSelectedIds(new Set());
      setBulkAction(null);
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    } catch (err: any) {
      toast({ title: t("error"), description: err.message, variant: "destructive" });
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkActiveToggle = async (active: boolean) => {
    setBulkProcessing(true);
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase.from("clients").update({ active }).in("id", ids);
      if (error) throw error;
      toast({ title: t("updated"), description: `${ids.length} clientes actualizados` });
      setSelectedIds(new Set());
      setBulkAction(null);
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    } catch (err: any) {
      toast({ title: t("error"), description: err.message, variant: "destructive" });
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkDelete = async () => {
    setBulkProcessing(true);
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase.from("clients").delete().in("id", ids);
      if (error) throw error;
      toast({ title: t("updated"), description: `${ids.length} clientes eliminados` });
      setSelectedIds(new Set());
      setBulkAction(null);
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    } catch (err: any) {
      toast({ title: t("error"), description: err.message, variant: "destructive" });
    } finally {
      setBulkProcessing(false);
    }
  };

  // Compute the same Desde/Hasta validation we apply in the per-client
  // form, against the bulk-dialog values. Single source of truth so the
  // bulk flow can't sneak in invalid windows the per-client form would
  // reject.
  const bulkWindowError = (() => {
    const a = bulkWindowFrom.trim();
    const b = bulkWindowUntil.trim();
    if (!a || !b) return "Captura ambas horas «Desde» y «Hasta».";
    if (b <= a) return "La hora «Hasta» debe ser posterior a «Desde».";
    return null;
  })();

  const handleBulkWindowApply = async () => {
    if (bulkWindowError) {
      toast({ title: "Horario inválido", description: bulkWindowError, variant: "destructive" });
      return;
    }
    setBulkWindowSaving(true);
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase
        .from("clients")
        .update({
          delivery_window_from:  bulkWindowFrom.trim(),
          delivery_window_until: bulkWindowUntil.trim(),
          // Notes are optional; empty string → NULL so the chip's
          // tooltip stays clean.
          delivery_notes: bulkWindowNotes.trim() || null,
        } as any)
        .in("id", ids);
      if (error) throw error;
      toast({ title: "Horario aplicado", description: `${ids.length} cliente${ids.length === 1 ? "" : "s"} actualizado${ids.length === 1 ? "" : "s"}` });
      setBulkWindowOpen(false);
      setBulkWindowFrom("");
      setBulkWindowUntil("");
      setBulkWindowNotes("");
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    } catch (err: any) {
      toast({ title: t("error"), description: err.message, variant: "destructive" });
    } finally {
      setBulkWindowSaving(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-background" onPointerMove={handlePointerMove}>
      <AnimatedGridPattern className="inset-x-0 inset-y-[-40%] h-[220%] [mask-image:radial-gradient(900px_circle_at_center,white,transparent_85%)]" />

      <div className="relative z-10 p-4 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            {/* Locked-width title block so the toggle never shifts when
                the subtitle text changes width. */}
            <div className="w-[300px] shrink-0">
              <h1 className="text-2xl font-bold text-foreground">{t("clientsTitle")}</h1>
              <p className="text-sm text-muted-foreground truncate">{t("clientsSubtitle")}</p>
            </div>
            {/* Mayoreo / Menudeo / Todos */}
            <div className="inline-flex rounded-lg border bg-muted p-0.5">
              {(["todos", "mayoreo", "menudeo"] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setTypeFilter(opt)}
                  className={cn(
                    "px-3 py-1.5 text-sm font-semibold rounded-md transition capitalize",
                    typeFilter === opt
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 self-start sm:self-auto">
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="gap-1.5">
              <Upload className="h-4 w-4" />
              Importar Excel
            </Button>
            <Button size="sm" onClick={openNew} className="gap-1.5">
              <Plus className="h-4 w-4" />
              {t("newClient")}
            </Button>
          </div>
        </div>

        {/* Date filter */}
        <ChronoBar
          dateFrom={dateFrom}
          dateTo={dateTo}
          onChange={(from, to) => { setDateFrom(from); setDateTo(to); }}
        />

        {/* Dashboard */}
        {dashboardStats && !isLoading && (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Ticket promedio */}
              <div className="border border-border rounded-lg bg-card/50 flex flex-col text-center overflow-hidden">
                <div className="px-5 pt-4 pb-2 flex items-center justify-center gap-2">
                  <div className="p-1.5 rounded-md bg-green-500/10">
                    <DollarSign className="h-4 w-4 text-green-400" />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Ticket promedio</p>
                </div>
                <div className="pb-4 pt-1 flex flex-col items-center justify-center">
                  <p className="text-2xl font-bold text-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {mxnFmt.format(dashboardStats.ticketPromedio)}
                  </p>
                </div>
              </div>

              {/* Pedidos por cliente */}
              <div className="border border-border rounded-lg bg-card/50 flex flex-col text-center overflow-hidden">
                <div className="px-5 pt-4 pb-2 flex items-center justify-center gap-2">
                  <div className="p-1.5 rounded-md bg-blue-500/10">
                    <ShoppingCart className="h-4 w-4 text-blue-400" />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pedidos por cliente</p>
                </div>
                <div className="pb-4 pt-1 flex flex-col items-center justify-center">
                  <p className="text-2xl font-bold text-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {dashboardStats.pedidosPorCliente.toFixed(1)}
                  </p>
                </div>
              </div>

              {/* Cliente más frecuente */}
              <div className="border border-border rounded-lg bg-card/50 flex flex-col text-center overflow-hidden">
                <div className="px-5 pt-4 pb-2 flex items-center justify-center gap-2">
                  <div className="p-1.5 rounded-md bg-amber-500/10">
                    <Crown className="h-4 w-4 text-amber-400" />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cliente más frecuente</p>
                </div>
                <div className="pb-4 pt-1 flex flex-col items-center justify-center">
                  {dashboardStats.topClient ? (
                    <>
                      <p className="text-lg font-bold text-foreground">{dashboardStats.topClient.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{dashboardStats.topClient.count} pedidos</p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">—</p>
                  )}
                </div>
              </div>

              {/* Total clientes */}
              <div className="border border-border rounded-lg bg-card/50 flex flex-col text-center overflow-hidden">
                <div className="px-5 pt-4 pb-2 flex items-center justify-center gap-2">
                  <div className="p-1.5 rounded-md bg-purple-500/10">
                    <Users className="h-4 w-4 text-purple-400" />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total clientes</p>
                </div>
                <div className="pb-4 pt-1 flex flex-col items-center justify-center">
                  <p className="text-2xl font-bold text-foreground">{dashboardStats.totalClientes}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">activos</p>
                </div>
              </div>
            </div>

            {/* Top 5 clients by sales */}
            {topClientsBySales.length > 0 && (() => {
              const maxValue = topClientsBySales[0].total;
              const totalSales = topClientsBySales.reduce((s, c) => s + c.total, 0);
              return (
                <div className="border border-border rounded-lg bg-card/50 overflow-hidden">
                  <div className="px-5 pt-4 pb-2 flex items-center justify-between">
                    <h3 className="text-sm font-medium text-muted-foreground">Top 5 clientes por ventas</h3>
                    <span className="text-xs text-muted-foreground">{mxnFmt.format(totalSales)} total</span>
                  </div>
                  <div className="px-5 pb-4 pt-1 space-y-3">
                    {topClientsBySales.map((c, i) => {
                      const pct = maxValue > 0 ? (c.total / maxValue) * 100 : 0;
                      return (
                        <div key={`${c.name}-${i}`} className="group">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: "linear-gradient(135deg, #3b82f6, #60a5fa)" }}>
                                {i + 1}
                              </div>
                              <span className="text-sm truncate text-foreground">{c.name}</span>
                            </div>
                            <div className="flex items-center gap-3 ml-3 shrink-0">
                              <span className="text-xs text-muted-foreground">{c.orders} pedidos</span>
                              <span className="text-sm font-bold text-foreground tabular-nums">{mxnFmt.format(c.total)}</span>
                            </div>
                          </div>
                          <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(59,130,246,0.1)" }}>
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${barsAnimated ? pct : 0}%`,
                                background: "linear-gradient(90deg, #3b82f6, #60a5fa)",
                                boxShadow: "0 0 12px rgba(96,165,250,0.5), 0 0 4px rgba(59,130,246,0.3)",
                                transition: `width 1s cubic-bezier(0.22, 1, 0.36, 1) ${i * 0.12}s`,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-end gap-3">
          <div className="relative flex-1 w-full sm:w-auto max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("searchClientsPlaceholder")}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex gap-1">
            {(["all", "active", "inactive"] as const).map(s => (
              <Button
                key={s}
                variant={activeFilter === s ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveFilter(s)}
              >
                {s === "all" ? t("all") : s === "active" ? t("activeOnly") : t("inactiveOnly")}
              </Button>
            ))}
          </div>

          {/* "Sin horario" filter chip — shows how many active clients
              still need their delivery window captured. Clicking it
              toggles the filter; the count itself is always visible so
              the team sees the data-quality gap at a glance. */}
          <Button
            variant={sinHorarioOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setSinHorarioOnly(v => !v)}
            className={cn(
              "gap-1.5",
              sinHorarioOnly && "bg-amber-500 hover:bg-amber-600 text-white",
              !sinHorarioOnly && sinHorarioCount > 0 && "border-amber-500/40 text-amber-700 dark:text-amber-300",
            )}
            title="Filtra clientes activos sin horario de recepción capturado"
          >
            🕐 Sin horario
            <span className="tabular-nums font-bold">{sinHorarioCount}</span>
          </Button>

          {(search || activeFilter !== "all" || sinHorarioOnly) && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setActiveFilter("all"); setSinHorarioOnly(false); }}>
              {t("clean")}
            </Button>
          )}

          {/* View mode toggle — Lista vs Mapa */}
          <div className="ml-auto flex items-center rounded-md border border-border bg-card p-0.5">
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2.5"
              onClick={() => setViewMode("list")}
            >
              Lista
            </Button>
            <Button
              variant={viewMode === "map" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2.5"
              onClick={() => setViewMode("map")}
            >
              <MapPin className="size-3.5 mr-1" /> Mapa
            </Button>
          </div>

        </div>

        {/* Count */}
        <p className="text-xs text-muted-foreground">
          {viewMode === "list" && filtered.length > 0
            ? `${pageStart}-${pageEnd} de ${filtered.length}`
            : filtered.length} / {clients?.length ?? 0} {t("navClients").toLowerCase()}
        </p>

        <PaginationControls />

        {/* Bulk action bar */}
        <div className="flex flex-wrap items-center gap-3 px-3 rounded-lg border border-border min-h-[48px]">
          <span className="text-sm font-medium text-foreground">{selectedIds.size} seleccionados</span>
          <Button size="sm" variant="outline" onClick={() => handleBulkPaymentChange("Transferencia")} disabled={bulkProcessing || selectedIds.size === 0}>
            Transferencia
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleBulkPaymentChange("Depósito")} disabled={bulkProcessing || selectedIds.size === 0}>
            Depósito
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleBulkPaymentChange("Efectivo")} disabled={bulkProcessing || selectedIds.size === 0}>
            Efectivo
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleBulkActiveToggle(true)} disabled={bulkProcessing || selectedIds.size === 0}>
            Activar
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleBulkActiveToggle(false)} disabled={bulkProcessing || selectedIds.size === 0}>
            Desactivar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setBulkWindowOpen(true)}
            disabled={bulkProcessing || selectedIds.size === 0}
            className="gap-1.5"
          >
            🕐 Capturar horario
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setBulkAction("delete")} disabled={bulkProcessing || selectedIds.size === 0}>
            Eliminar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} disabled={selectedIds.size === 0}>Deseleccionar</Button>
        </div>

        {viewMode === "map" ? (
          <ClientsMapView
            clients={filtered.map((c) => ({
              id: c.id,
              name: c.name,
              address: c.address,
              phone: c.phone,
              client_type: c.client_type,
              lat: c.lat,
              lng: c.lng,
            }))}
            onSelect={(id) => setClient360Id(id)}
          />
        ) : (<>
        {/* Mobile Card View */}
        <div className="space-y-3 md:hidden">

          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-4 space-y-2">
                <Skeleton className="h-5 w-3/4 bg-muted" />
                <Skeleton className="h-4 w-1/2 bg-muted" />
                <Skeleton className="h-4 w-full bg-muted" />
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              {t("noClientsMatch")}
            </div>
          ) : (
            paginatedClients.map(c => (
              <div
                key={c.id}
                className={cn(
                  "rounded-lg border border-border bg-card overflow-hidden transition-colors",
                  !c.active && "opacity-50",
                  expandedIds.has(c.id) && "ring-1 ring-primary/30"
                )}
              >
                <div
                  className="p-4 cursor-pointer active:bg-muted/50"
                  onClick={() => setClient360Id(c.id)}
                >
                  {/* Row 1: Name + Active badge */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleExpand(c.id, (e.currentTarget as HTMLElement).closest("[data-client-row]") as HTMLElement | null ?? (e.currentTarget as HTMLElement)); }}
                        className="shrink-0"
                        aria-label="Expandir"
                      >
                        {expandedIds.has(c.id)
                          ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      </button>
                      <ClientTypeBadge
                        type={c.client_type}
                        invisible={typeFilter !== "todos"}
                      />
                      <span className="font-semibold text-foreground truncate">
                        {stripVmPrefix(c.name) || c.name}
                      </span>
                      {(c as any).parent_name && (
                        <Badge variant="outline" className="text-[10px] font-medium shrink-0 max-w-[220px] truncate" title={`Subcuenta de ${(c as any).parent_name}`}>
                          Subcuenta de {(c as any).parent_name}
                        </Badge>
                      )}
                      {isVmClient(c) && (
                        <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/40 text-[10px] font-semibold tracking-wide shrink-0" title="Venta Mostrador">
                          VM
                        </Badge>
                      )}
                      {isGenericRfc(c.rfc) && (
                        <Badge className="bg-purple-500/15 text-purple-700 border-purple-500/40 text-[10px] font-semibold tracking-wide shrink-0" title={`RFC genérico (${GENERIC_RFC})`}>
                          RFC genérico
                        </Badge>
                      )}
                    </div>
                    <Badge className={cn("text-xs shrink-0", c.active ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-muted text-muted-foreground border-border")}>
                      {c.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>

                  {/* Row 2: Company */}
                  {c.company && (
                    <p className="text-sm text-muted-foreground mt-1 ml-6 truncate">{c.company}</p>
                  )}

                  {/* Row 3: Grid with details */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 ml-6 text-xs">
                    {c.phone && (
                      <div>
                        <span className="text-muted-foreground">Tel: </span>
                        <span className="text-foreground">{c.phone}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">Pago: </span>
                      <Badge className={cn("text-[10px] px-1.5 py-0",
                        c.payment_method === "Efectivo" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" :
                        c.payment_method === "Depósito" ? "bg-purple-500/20 text-purple-400 border-purple-500/30" :
                        c.payment_method === "Otro" ? "bg-gray-500/20 text-gray-400 border-gray-500/30" :
                        "bg-blue-500/20 text-blue-400 border-blue-500/30"
                      )}>
                        {c.payment_method ?? "Transferencia"}
                      </Badge>
                    </div>
                    {c.representante_nombre && (
                      <div>
                        <span className="text-muted-foreground">Rep: </span>
                        <span className="text-foreground">{c.representante_nombre}</span>
                      </div>
                    )}
                    {c.rfc && (
                      <div>
                        <span className="text-muted-foreground">RFC: </span>
                        <span className="text-foreground font-mono">{c.rfc}</span>
                      </div>
                    )}
                  </div>

                  {/* Row 4: Address */}
                  {c.address && (
                    <p className="text-xs text-muted-foreground mt-1.5 ml-6 truncate">{c.address}</p>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1 px-4 pb-2" onClick={e => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => openEdit(c)}>
                    <Pencil className="h-3 w-3" /> Editar
                  </Button>
                  {c.active && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-red-400 hover:text-red-300 gap-1" onClick={() => setDeactivateClient(c)}>
                      <Trash2 className="h-3 w-3" /> Desactivar
                    </Button>
                  )}
                </div>

                {/* Expanded content */}
                <div
                  className="overflow-hidden transition-all duration-300 ease-in-out"
                  style={{ maxHeight: expandedIds.has(c.id) ? "800px" : "0px", opacity: expandedIds.has(c.id) ? 1 : 0 }}
                >
                  <div className="px-4 pb-4 border-t border-border">
                    {expandedIds.has(c.id) && (
                      <ClientExpandedRow
                        client={c}
                        onViewOrder={(orderId) => setViewOrderId(orderId)}
                        onNavigateProduct={(clave) => navigate(`/products?search=${encodeURIComponent(clave)}`)}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Table (desktop) */}
        <div className="hidden md:block">
        <GlowCard className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table style={{ tableLayout: "fixed", width: "100%" }}>
              <colgroup>
                <col className="hidden md:table-column" style={{ width: "40px" }} />
                <col style={{ width: "40px" }} />
                <col style={{ width: "18%" }} />
                <col className="hidden md:table-column" style={{ width: "14%" }} />
                <col className="hidden md:table-column" style={{ width: "12%" }} />
                <col className="hidden lg:table-column" style={{ width: "10%" }} />
                <col className="hidden lg:table-column" style={{ width: "12%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "80px" }} />
              </colgroup>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="w-10 hidden md:table-cell">
                    <Checkbox
                      checked={paginatedClients.length > 0 && paginatedClients.every((c) => selectedIds.has(c.id))}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="w-10" />
                  <TableHead className="text-foreground font-semibold whitespace-nowrap">{t("clientName")}</TableHead>
                  <TableHead className="text-foreground font-semibold whitespace-nowrap hidden md:table-cell">{t("clientCompany")}</TableHead>
                  <TableHead className="text-foreground font-semibold whitespace-nowrap hidden md:table-cell">{t("clientPhone")}</TableHead>
                  <TableHead className="text-foreground font-semibold hidden lg:table-cell align-top leading-tight min-w-[10rem]">{t("clientRep")}</TableHead>
                  <TableHead className="text-foreground font-semibold hidden lg:table-cell align-top leading-tight min-w-[8rem]">Método de pago</TableHead>
                  <TableHead className="text-foreground font-semibold whitespace-nowrap text-center">{t("thActive")}</TableHead>
                  <TableHead className="text-foreground font-semibold whitespace-nowrap w-20">{t("thActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 9 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-full bg-muted" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-full bg-muted" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-full bg-muted" /></TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-full bg-muted" /></TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-full bg-muted" /></TableCell>
                      <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-full bg-muted" /></TableCell>
                      <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-full bg-muted" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-full bg-muted" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-full bg-muted" /></TableCell>
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      {t("noClientsMatch")}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedClients.map(c => (
                    <React.Fragment key={c.id}>
                      <TableRow
                        id={`client-row-${c.id}`}
                        className={cn("border-border hover:bg-muted/50 cursor-pointer", !c.active && "opacity-50", selectedIds.has(c.id) && "bg-muted/30")}
                        onClick={() => setClient360Id(c.id)}
                      >
                        <TableCell className="hidden md:table-cell" onClick={e => e.stopPropagation()}><Checkbox checked={selectedIds.has(c.id)} onCheckedChange={() => toggleSelect(c.id)} /></TableCell>
                        <TableCell className="px-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); toggleExpand(c.id, (e.currentTarget as HTMLElement).closest("tr") as HTMLElement | null ?? (e.currentTarget as HTMLElement)); }}>
                            {expandedIds.has(c.id)
                              ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          </Button>
                        </TableCell>
                        <TableCell className="text-foreground font-medium align-top">
                          <div className="flex items-start gap-2 flex-wrap">
                            <ClientTypeBadge
                              type={c.client_type}
                              invisible={typeFilter !== "todos"}
                            />
                            <span
                              className="whitespace-normal break-words hover:underline hover:text-primary transition-colors"
                              title="Abrir vista 360"
                            >
                              {stripVmPrefix(c.name) || c.name}
                            </span>
                            {(c as any).parent_name && (
                              <Badge variant="outline" className="text-[10px] font-medium max-w-[220px] truncate" title={`Subcuenta de ${(c as any).parent_name}`}>
                                Subcuenta de {(c as any).parent_name}
                              </Badge>
                            )}
                            {isVmClient(c) && (
                              <Badge
                                className="bg-amber-500/15 text-amber-700 border-amber-500/40 text-[10px] font-semibold tracking-wide"
                                title="Venta Mostrador — no requiere factura oficial, solo nota o recibo"
                              >
                                VM
                              </Badge>
                            )}
                            {isGenericRfc(c.rfc) && (
                              <Badge
                                className="bg-purple-500/15 text-purple-700 border-purple-500/40 text-[10px] font-semibold tracking-wide"
                                title={`RFC genérico (${GENERIC_RFC}) — público en general, sin factura nominativa`}
                              >
                                RFC genérico
                              </Badge>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="text-muted-foreground text-sm hidden md:table-cell">{c.company ?? "---"}</TableCell>
                        <TableCell className="text-foreground text-sm hidden md:table-cell">{c.phone ?? "---"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm hidden lg:table-cell align-top whitespace-normal break-words">{c.representante_nombre ?? "---"}</TableCell>
                        <TableCell className="text-sm hidden lg:table-cell">
                          <Badge className={cn("text-xs",
                            c.payment_method === "Efectivo" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" :
                            c.payment_method === "Depósito" ? "bg-purple-500/20 text-purple-400 border-purple-500/30" :
                            c.payment_method === "Otro" ? "bg-gray-500/20 text-gray-400 border-gray-500/30" :
                            "bg-blue-500/20 text-blue-400 border-blue-500/30"
                          )}>
                            {c.payment_method ?? "Transferencia"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className={cn("text-xs", c.active ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-muted text-muted-foreground border-border")}>
                            {c.active ? "\u2713" : "\u2717"}
                          </Badge>
                        </TableCell>
                        <TableCell onClick={e => e.stopPropagation()}>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {c.active && (
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300" onClick={() => setDeactivateClient(c)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      <TableRow key={`${c.id}-expanded`} className="bg-muted/20">
                        <TableCell colSpan={9} className="!p-0">
                          <div
                            className="overflow-hidden transition-all duration-300 ease-in-out"
                            style={{ maxHeight: expandedIds.has(c.id) ? "800px" : "0px", opacity: expandedIds.has(c.id) ? 1 : 0 }}
                          >
                            <div className="p-4">
                              {expandedIds.has(c.id) && (
                                <ClientExpandedRow
                                  client={c}
                                  onViewOrder={(orderId) => setViewOrderId(orderId)}
                                  onNavigateProduct={(clave) => navigate(`/products?search=${encodeURIComponent(clave)}`)}
                                />
                              )}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </GlowCard>
        </div>
        <PaginationControls />
        </>)}
      </div>


      {/* Edit / New Dialog */}
      <Dialog open={!!editClient} onOpenChange={open => !open && closeDialog()}>
        <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNew ? t("newClient") : t("editClient")}</DialogTitle>
            <DialogDescription>{isNew ? t("newClientDesc") : t("editClientDesc")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("clientName")} *</Label>
                <Input value={form.name} onChange={e => updateField("name", e.target.value)} placeholder="Juan Perez" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("clientCompany")}</Label>
                <Input value={form.company} onChange={e => updateField("company", e.target.value)} placeholder="Empresa S.A." />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("clientPhone")}</Label>
                <Input value={form.phone} onChange={e => updateField("phone", e.target.value)} placeholder="55 1234 5678" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">{t("clientAddress")}</Label>
                <AddressAutocomplete
                  value={form.address}
                  onChange={(v) => updateField("address", v)}
                  onSelect={(r) => {
                    setForm((prev) => ({
                      ...prev,
                      address: r.address,
                      lat: r.lat,
                      lng: r.lng,
                      google_place_id: r.place_id,
                      codigo_postal: prev.codigo_postal || r.codigo_postal || "",
                    }));
                  }}
                  placeholder="Empieza a escribir la dirección…"
                />
                {form.lat != null && form.lng != null && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    📍 {form.lat.toFixed(5)}, {form.lng.toFixed(5)}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("clientCentral")}</Label>
                <Input value={form.central} onChange={e => updateField("central", e.target.value)} placeholder="Central" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("clientRfc")}</Label>
                <Input value={form.rfc} onChange={e => updateField("rfc", e.target.value)} placeholder="XAXX010101000" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("clientRazonSocial")}</Label>
                <Input value={form.razon_social} onChange={e => updateField("razon_social", e.target.value)} placeholder="Razon Social S.A. de C.V." />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("clientCurp")}</Label>
                <Input value={form.curp} onChange={e => updateField("curp", e.target.value)} placeholder="XXXX000000XXXXXX00" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("clientCodigoPostal")}</Label>
                <Input value={form.codigo_postal} onChange={e => updateField("codigo_postal", e.target.value)} placeholder="06600" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("clientNombreCfdi")}</Label>
                <Input value={form.nombre_cfdi} onChange={e => updateField("nombre_cfdi", e.target.value)} placeholder="Nombre para CFDI" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Método de pago</Label>
                <select
                  value={form.payment_method}
                  onChange={e => updateField("payment_method", e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="Transferencia">Transferencia</option>
                  <option value="Depósito">Depósito</option>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>

              {/* Mayoreo / Menudeo classification */}
              <div className="space-y-1">
                <Label className="text-xs">Tipo de cliente</Label>
                <div className="inline-flex w-full rounded-md border bg-muted p-0.5">
                  {(["mayoreo", "menudeo"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => updateField("client_type", opt)}
                      className={cn(
                        "flex-1 px-3 py-2 text-sm font-semibold rounded transition capitalize",
                        form.client_type === opt
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Lista de precios predeterminada</Label>
                <select
                  value={form.price_list_id ?? ""}
                  onChange={e => updateField("price_list_id", e.target.value || null)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="">
                    {(() => {
                      const def = priceLists.find(pl => pl.default_for_client_type === form.client_type);
                      return def
                        ? `Auto: ${def.name} (predeterminada ${form.client_type})`
                        : `Auto: ${form.client_type} (predeterminada)`;
                    })()}
                  </option>
                  {priceLists.map((pl) => (
                    <option key={pl.id} value={pl.id}>
                      {pl.name}{pl.default_for_client_type ? ` — default ${pl.default_for_client_type}` : ""}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  Si dejas "Auto", el sistema usa la lista marcada como predeterminada para clientes de tipo {form.client_type}.
                </p>
              </div>

            </div>

            {/* Recepción — delivery window. Captures when the client's
                business actually accepts deliveries so the planner
                doesn't dispatch trucks outside their open hours.
                NULL across all three = "no capturado" → app treats
                as open all day + renders a warning chip. */}
            <div className="rounded-lg border bg-card/40 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Recepción de entregas
                </span>
                <span className="text-[10px] text-muted-foreground italic">
                  Horas en las que el negocio acepta pedidos
                </span>
              </div>
              {/* Per-field error styling: highlight whichever field is
                  the missing/invalid one. windowFormError is computed
                  once at the component level. */}
              {(() => {
                const a = form.delivery_window_from.trim();
                const b = form.delivery_window_until.trim();
                const desdeBad = !!windowFormError && (!a || (!!a && !!b && b <= a));
                const hastaBad = !!windowFormError && (!b || (!!a && !!b && b <= a));
                return (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Desde</Label>
                        <TimePicker
                          value={form.delivery_window_from}
                          onChange={(v) => updateField("delivery_window_from", v)}
                          invalid={desdeBad}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Hasta</Label>
                        <TimePicker
                          value={form.delivery_window_until}
                          onChange={(v) => updateField("delivery_window_until", v)}
                          invalid={hastaBad}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Notas</Label>
                        <Input
                          value={form.delivery_notes}
                          onChange={e => updateField("delivery_notes", e.target.value)}
                          placeholder="13-16 cerrado · llamar antes · sólo previa cita"
                        />
                      </div>
                    </div>
                    {windowFormError && (
                      <div className="text-[11px] text-red-600 dark:text-red-400 font-medium flex items-center gap-1">
                        <span aria-hidden>⚠</span>
                        {windowFormError}
                      </div>
                    )}
                  </>
                );
              })()}
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[10px] text-muted-foreground self-center mr-1">Atajos:</span>
                {[
                  { label: "8 – 18",        from: "08:00", until: "18:00" },
                  { label: "9 – 19",        from: "09:00", until: "19:00" },
                  { label: "Sólo mañana",   from: "08:00", until: "13:00" },
                  { label: "Sólo tarde",    from: "14:00", until: "19:00" },
                  { label: "Limpiar",       from: "",      until: ""      },
                ].map(p => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      updateField("delivery_window_from", p.from);
                      updateField("delivery_window_until", p.until);
                    }}
                    className="rounded-full border px-2.5 py-1 text-[11px] font-medium hover:bg-muted/40 transition active:scale-[0.97]"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* CFDI Drag & Drop zone */}
            {editClient && (() => {
              const hasUploaded = !isNew && editClient.cfdi_pdf_path;
              const hasStaged = isNew && pendingCfdiFile;
              const showFile = hasUploaded || hasStaged;

              const applyAutofill = async (file: File) => {
                if (!cfdiAutofill) return;
                setCfdiParsing(true);
                try {
                  const data = await parseCfdiPdf(file);
                  setForm(prev => ({
                    ...prev,
                    // name: only fill when the user hasn't typed one yet —
                    // razón social is a sensible default display name and
                    // (more importantly) lets the Save button enable on
                    // new clients without a manual entry. CFDI for a
                    // person → "Juan Pérez García"; for a moral entity →
                    // the company's legal name.
                    name: prev.name.trim() || data.razonSocial || prev.name,
                    // company: only fill for moral entities (no CURP).
                    // Persons leave `company` alone — their company is
                    // independent of their fiscal name.
                    company: prev.company.trim() || (!data.curp && data.razonSocial ? data.razonSocial : prev.company),
                    rfc: data.rfc || prev.rfc,
                    curp: data.curp || prev.curp,
                    razon_social: data.razonSocial || prev.razon_social,
                    nombre_cfdi: data.razonSocial || prev.nombre_cfdi,
                    address: data.direccion || prev.address,
                    codigo_postal: data.codigoPostal || prev.codigo_postal,
                  }));
                  toast({ title: "Datos fiscales extraídos", description: "Revisa los campos autocompletados" });
                } catch (err) {
                  console.error("CFDI parse error:", err);
                  toast({ title: "No se pudo leer el PDF", description: "Completa los datos manualmente", variant: "destructive" });
                } finally {
                  setCfdiParsing(false);
                }
              };

              const onFile = async (file: File) => {
                if (isNew) {
                  setPendingCfdiFile(file);
                } else {
                  handleCfdiUpload(editClient.id, file);
                }
                await applyAutofill(file);
              };

              const fileName = hasStaged
                ? pendingCfdiFile!.name
                : editClient.cfdi_pdf_path?.split("/").pop() ?? "CFDI.pdf";
              const fileSize = hasStaged
                ? `${(pendingCfdiFile!.size / 1024).toFixed(0)} KB`
                : null;

              const handleView = () => {
                if (!isNew && editClient.cfdi_pdf_path) {
                  const { data } = supabase.storage.from("cfdi-documents").getPublicUrl(editClient.cfdi_pdf_path);
                  if (data?.publicUrl) window.open(data.publicUrl, "_blank");
                }
              };

              return (
                <div className="pt-2 border-t border-border">
                  <div className="flex items-center justify-between mb-1.5">
                    <Label className="text-xs">CFDI (PDF)</Label>
                    <button
                      type="button"
                      onClick={() => setCfdiAutofill(prev => !prev)}
                      className={cn(
                        "flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors",
                        cfdiAutofill
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Wand2 className="h-3 w-3" />
                      Autollenar {cfdiAutofill ? "ON" : "OFF"}
                    </button>
                  </div>
                  {showFile ? (
                    <div className="flex items-center gap-4 p-4 rounded-lg border border-green-500/30 bg-green-500/5 animate-in fade-in duration-300">
                      {/* PDF icon */}
                      <div className="relative shrink-0">
                        <div className="h-12 w-10 rounded bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                          <span className="text-[10px] font-bold text-red-500 tracking-wider">PDF</span>
                        </div>
                        <CheckCircle2 className="h-4 w-4 text-green-500 absolute -top-1.5 -right-1.5" />
                      </div>
                      {/* File info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{fileName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {fileSize && <span>{fileSize} · </span>}
                          <span className="text-green-500 font-medium">
                            {hasStaged ? "Listo para subir al guardar" : "Subido correctamente"}
                          </span>
                        </p>
                      </div>
                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {!isNew && editClient.cfdi_pdf_path && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleView} title="Ver CFDI">
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                          onClick={() => {
                            if (isNew) {
                              setPendingCfdiFile(null);
                            } else {
                              handleCfdiDelete(editClient.id, editClient.cfdi_pdf_path!);
                            }
                          }}
                          title="Eliminar CFDI"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <label
                      className={cn(
                        "flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed cursor-pointer transition-colors",
                        "border-border hover:border-primary/50 hover:bg-primary/5",
                        (cfdiUploading || cfdiParsing) && "pointer-events-none opacity-60"
                      )}
                      onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-primary", "bg-primary/10"); }}
                      onDragLeave={(e) => { e.currentTarget.classList.remove("border-primary", "bg-primary/10"); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove("border-primary", "bg-primary/10");
                        const file = e.dataTransfer.files?.[0];
                        if (file && file.type === "application/pdf") onFile(file);
                      }}
                    >
                      {(cfdiUploading || cfdiParsing) ? (
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      ) : (
                        <Upload className="h-8 w-8 text-muted-foreground" />
                      )}
                      <div className="text-center">
                        <p className="text-sm font-medium text-foreground">
                          {cfdiParsing ? "Leyendo datos fiscales..." : cfdiUploading ? "Subiendo..." : "Arrastra el CFDI aquí"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {cfdiAutofill ? "Se autocompletarán los datos fiscales · " : ""}Solo PDF
                        </p>
                      </div>
                      <input
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        disabled={cfdiUploading || cfdiParsing}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) onFile(file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
              );
            })()}

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div className="flex items-center gap-3">
                <Label>{t("clientActive")}</Label>
                <Switch checked={form.active} onCheckedChange={v => updateField("active", v)} />
              </div>
              <Button onClick={handleSave} disabled={saving || !form.name.trim() || !!windowFormError} className="gradient-button text-white px-8">
                {saving ? t("saving") : isNew ? t("save") : t("update")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkAction === "delete"} onOpenChange={open => !open && setBulkAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar {selectedIds.size} clientes?</AlertDialogTitle>
            <AlertDialogDescription>Esta accion no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} disabled={bulkProcessing}>
              {bulkProcessing ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Order Detail Popup (inline, no navigation) */}
      <OrderDetailSheet
        orderId={viewOrderId}
        open={!!viewOrderId}
        onOpenChange={(open) => { if (!open) setViewOrderId(null); }}
      />

      {/* Client 360 Drawer */}
      <Client360Drawer
        clientId={client360Id}
        open={!!client360Id}
        onOpenChange={(open) => { if (!open) setClient360Id(null); }}
        canEdit={isAdmin}
        onEdit={(id) => {
          const c = clients?.find((x) => x.id === id);
          if (c) openEdit(c);
        }}
      />


      {/* Import Excel Dialog */}
      {importOpen && (
        <ClientsImportDialog
          onClose={() => setImportOpen(false)}
          onSaved={() => {
            setImportOpen(false);
            queryClient.invalidateQueries({ queryKey: ["clients"] });
          }}
        />
      )}


      {/* Deactivate Confirmation Dialog */}
      <Dialog open={!!deactivateClient} onOpenChange={open => !open && setDeactivateClient(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("confirmDeactivate")}</DialogTitle>
            <DialogDescription>{t("confirmDeactivateDesc")}</DialogDescription>
          </DialogHeader>
          {deactivateClient && (
            <div className="space-y-4">
              <p className="text-sm text-foreground">
                <strong>{deactivateClient.name}</strong>
                {deactivateClient.company ? ` - ${deactivateClient.company}` : ""}
              </p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setDeactivateClient(null)}>{t("cancel")}</Button>
                <Button variant="destructive" onClick={handleDeactivate} disabled={saving}>
                  {saving ? t("saving") : t("deactivate")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* B2 — bulk delivery-window capture. Opens from the bulk-action
          bar when one or more clients are selected. Same validation as
          the per-client form (B1) so we never save half-windows. */}
      <Dialog open={bulkWindowOpen} onOpenChange={setBulkWindowOpen}>
        <DialogContent className="sm:max-w-md w-[96vw] p-0 flex flex-col gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle className="text-lg flex items-center gap-2">
              <span>🕐</span> Aplicar horario en lote
            </DialogTitle>
            <DialogDescription className="text-xs">
              Se actualizarán {selectedIds.size} cliente{selectedIds.size === 1 ? "" : "s"} con la misma ventana de recepción.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Desde</Label>
                <TimePicker
                  value={bulkWindowFrom}
                  onChange={setBulkWindowFrom}
                  invalid={!!bulkWindowError && !bulkWindowFrom.trim()}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hasta</Label>
                <TimePicker
                  value={bulkWindowUntil}
                  onChange={setBulkWindowUntil}
                  invalid={!!bulkWindowError && (!bulkWindowUntil.trim() || (!!bulkWindowFrom && !!bulkWindowUntil && bulkWindowUntil <= bulkWindowFrom))}
                />
              </div>
            </div>

            {/* Shortcut presets — same as the per-client form so the
                bulk flow feels consistent. */}
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[10px] text-muted-foreground self-center mr-1">Atajos:</span>
              {[
                { label: "8 – 18",       from: "08:00", until: "18:00" },
                { label: "9 – 19",       from: "09:00", until: "19:00" },
                { label: "Sólo mañana",  from: "08:00", until: "13:00" },
                { label: "Sólo tarde",   from: "14:00", until: "19:00" },
              ].map(p => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => { setBulkWindowFrom(p.from); setBulkWindowUntil(p.until); }}
                  className="rounded-full border px-2.5 py-1 text-[11px] font-medium hover:bg-muted/40 transition active:scale-[0.97]"
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Notas (opcional)</Label>
              <Input
                value={bulkWindowNotes}
                onChange={e => setBulkWindowNotes(e.target.value)}
                placeholder="13-16 cerrado · llamar antes · sólo previa cita"
              />
              <p className="text-[10px] text-muted-foreground italic">
                Aplica las mismas notas a todos los clientes seleccionados (sobrescribe lo que tenían).
              </p>
            </div>

            {bulkWindowError && (
              <div className="text-[11px] text-red-600 dark:text-red-400 font-medium flex items-center gap-1">
                <span aria-hidden>⚠</span>
                {bulkWindowError}
              </div>
            )}
          </div>

          <div className="px-6 py-3 border-t flex gap-2 justify-end shrink-0">
            <Button variant="outline" onClick={() => setBulkWindowOpen(false)} disabled={bulkWindowSaving}>
              Cancelar
            </Button>
            <Button
              onClick={handleBulkWindowApply}
              disabled={bulkWindowSaving || !!bulkWindowError || selectedIds.size === 0}
              className="min-w-[140px]"
            >
              {bulkWindowSaving ? "Aplicando..." : `Aplicar a ${selectedIds.size}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
