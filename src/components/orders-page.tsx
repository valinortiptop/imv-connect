// @ts-nocheck
import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/orders/StatusBadge";
import { NewOrderDialog } from "@/components/orders/NewOrderDialog";
import { OrderDetailSheet } from "@/components/orders/OrderDetailSheet";
import { DeliveryWindowChip } from "@/components/clients/DeliveryWindowChip";
import { EditOrderSheet } from "@/components/orders/EditOrderSheet";
import { DeleteOrderDialog } from "@/components/orders/DeleteOrderDialog";
import { OrderRowActions } from "@/components/orders/OrderRowActions";
import { CotizacionesTab } from "@/components/orders/CotizacionesTab";
import { ORDER_STATUSES, STATUS_LABELS, fmtMXN } from "@/types/orders";
import type { OrderSummaryRow } from "@/types/orders";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { parseLocalDate } from "@/lib/date-utils";
import { useNavigate } from "@/lib/router-compat";
import { Plus, Search, ShoppingCart, DollarSign, TruckIcon, Clock, Download, AlertOctagon, Eye, Copy, CheckCircle2, ArrowUp, ArrowDown, ArrowUpDown, RotateCcw, Pin } from "lucide-react";
import { exportOrderAsImage } from "@/components/orders/SingleOrderImageCard";
import { ChronoBar } from "@/components/ChronoBar";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

/**
 * Click-to-sort table header. Renders the column label + a chevron
 * icon. Active column gets a primary-colored ▲/▼ chevron; inactive
 * columns get a faint up-down icon (signals the affordance without
 * the row screaming with arrows everywhere). Click cycles asc → desc.
 */
function SortableTableHead<K extends string>({
  sortKey,
  currentSort,
  onClick,
  children,
  className,
  align = "left",
}: {
  sortKey: K;
  currentSort: { key: K; dir: "asc" | "desc" };
  onClick: (k: K) => void;
  children: React.ReactNode;
  className?: string;
  align?: "left" | "right";
}) {
  const active = currentSort.key === sortKey;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 -mx-1 px-1 py-0.5 rounded hover:bg-muted/50 transition-colors group",
          align === "right" && "ml-auto",
          active ? "text-primary font-semibold" : "text-muted-foreground",
        )}
      >
        <span>{children}</span>
        {active ? (
          currentSort.dir === "asc"
            ? <ArrowUp className="h-3.5 w-3.5" />
            : <ArrowDown className="h-3.5 w-3.5" />
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-30 group-hover:opacity-60 transition-opacity" />
        )}
      </button>
    </TableHead>
  );
}

export default function Orders() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Pedidos / Cotizaciones toggle. URL-driven so deep-links work.
  const tabParam = searchParams.get("tab") === "cotizaciones" ? "cotizaciones" : "pedidos";
  const [tab, setTab] = useState<"pedidos" | "cotizaciones">(tabParam);
  const [newQuoteOpen, setNewQuoteOpen] = useState(false);
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (tab === "cotizaciones") next.set("tab", "cotizaciones"); else next.delete("tab");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  // Mayoreo / Menudeo segmentation — mirrors the Clients tab filter
  // 1:1 so the same mental model applies to pedidos. Default 'todos'
  // so the page lists everything until the user narrows it down.
  const [typeFilter, setTypeFilter] = useState<"todos" | "mayoreo" | "menudeo">("todos");

  // Sort key + direction. Default: order_code DESC (newest pedido first)
  // — matches the historical behavior. Persisted to localStorage so the
  // user's choice survives reloads. Visible cue: when the choice is
  // anything other than the default, a "Vista guardada" caption appears
  // above the table with a Restablecer link.
  type SortKey = "order_code" | "client_name" | "order_date" | "delivery_date" | "status" | "total_with_iva" | "line_items";
  type SortDir = "asc" | "desc";
  const SORT_STORAGE_KEY = "orders-sort-v1";
  const DEFAULT_SORT: { key: SortKey; dir: SortDir } = { key: "order_code", dir: "desc" };
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>(() => {
    try {
      const raw = localStorage.getItem(SORT_STORAGE_KEY);
      if (!raw) return DEFAULT_SORT;
      const parsed = JSON.parse(raw);
      if (parsed?.key && parsed?.dir) return parsed;
    } catch { /* ignore */ }
    return DEFAULT_SORT;
  });
  useEffect(() => {
    try { localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sort)); } catch { /* ignore */ }
  }, [sort]);
  const isDefaultSort = sort.key === DEFAULT_SORT.key && sort.dir === DEFAULT_SORT.dir;
  const cycleSort = (key: SortKey) => {
    setSort((prev) => {
      // Toggle dir if same column; pick a sensible default per column
      // when switching: dates/numbers default to "newest/biggest first"
      // (desc), text default to A→Z (asc).
      if (prev.key === key) {
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      const numericOrDate: SortKey[] = ["order_date", "delivery_date", "total_with_iva", "line_items"];
      return { key, dir: numericOrDate.includes(key) ? "desc" : "asc" };
    });
  };
  const resetSort = () => setSort(DEFAULT_SORT);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [editOrderId, setEditOrderId] = useState<string | null>(null);
  const [deleteOrder, setDeleteOrder] = useState<{ id: string; orderCode: string | null; clientName: string | null } | null>(null);
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"status" | "delete" | null>(null);
  const [bulkStatus, setBulkStatus] = useState<string>("Confirmado");
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // Date filter
  const getFirstOfMonth = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  };
  const [dateFrom, setDateFrom] = useState(getFirstOfMonth());
  const [dateTo, setDateTo] = useState("");
  const setThisMonth = () => { setDateFrom(getFirstOfMonth()); setDateTo(""); };
  const setAllTime = () => { setDateFrom(""); setDateTo(""); };

  useEffect(() => {
    const openOrderId = searchParams.get("openOrderId");
    if (openOrderId) {
      setSelectedOrderId(openOrderId);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("openOrderId");
        return next;
      }, { replace: true });
    }
  }, []);

  const { data: orders = [], isLoading, error } = useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_summary")
        .select("*")
        .order("order_code", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as OrderSummaryRow[];
    },
  });

  // Fetch damaged item counts per order (only orders with is_damaged items)
  const { data: damagedByOrder = {} } = useQuery({
    queryKey: ["orders-damaged-count"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("order_items")
        .select("order_id, quantity")
        .eq("is_damaged", true);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of data ?? []) {
        map[row.order_id] = (map[row.order_id] ?? 0) + (row.quantity ?? 0);
      }
      return map;
    },
    staleTime: 30 * 1000,
  });

  // Set of order IDs that have been signed via /entrega/:token. Used to
  // overlay a green checkmark on the Download icon so admin can scan
  // the table and see which orders have a comprobante firmado.
  const { data: signedOrderIds = new Set<string>() } = useQuery({
    queryKey: ["orders-signed"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("orders")
        .select("id")
        .not("signed_at", "is", null);
      if (error) throw error;
      return new Set<string>(((data ?? []) as { id: string }[]).map(r => r.id));
    },
    staleTime: 15 * 1000,
  });

  // Date-filtered orders (for dashboard)
  const dateFiltered = useMemo(() => {
    return orders.filter(o => {
      if (!o.order_date) return true;
      if (dateFrom && o.order_date < dateFrom) return false;
      if (dateTo && o.order_date > dateTo) return false;
      return true;
    });
  }, [orders, dateFrom, dateTo]);

  const filtered = useMemo(() => {
    let result = dateFiltered;

    if (statusFilter !== "all") {
      result = result.filter((o) => o.status === statusFilter);
    }

    // Mayoreo/Menudeo segmentation — driven from the order's client.
    // Treat null/missing client_type as 'mayoreo' so legacy orders
    // that predate the segmentation column don't disappear when the
    // user filters to Mayoreo.
    if (typeFilter === "mayoreo") {
      result = result.filter((o) => (o.client_type ?? "mayoreo") === "mayoreo");
    } else if (typeFilter === "menudeo") {
      result = result.filter((o) => o.client_type === "menudeo");
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((o) =>
        (o.client_name && o.client_name.toLowerCase().includes(q)) ||
        (o.order_code && o.order_code.toLowerCase().includes(q))
      );
    }

    // Sort by chosen column. Rules:
    //  - Nulls always go to the bottom regardless of direction (so when
    //    sorting "earliest delivery date first" the top row is always a
    //    real upcoming delivery, not 200 NULLs).
    //  - Tie-break by order_code desc within the same key value (so
    //    P-0048 + P-0043 both delivering Wed → newer code surfaces first).
    const cmp = (a: any, b: any, dir: SortDir): number => {
      const aNull = a == null || a === "";
      const bNull = b == null || b === "";
      if (aNull && bNull) return 0;
      if (aNull) return 1;   // a goes after
      if (bNull) return -1;  // a goes before
      let r = 0;
      if (typeof a === "number" && typeof b === "number") r = a - b;
      else r = String(a).localeCompare(String(b));
      return dir === "asc" ? r : -r;
    };
    const sorted = [...result].sort((a, b) => {
      const av = (a as any)[sort.key];
      const bv = (b as any)[sort.key];
      const primary = cmp(av, bv, sort.dir);
      if (primary !== 0) return primary;
      return cmp(a.order_code, b.order_code, "desc");
    });
    return sorted;
  }, [dateFiltered, statusFilter, typeFilter, search, sort]);

  // Dashboard stats
  const dashboardStats = useMemo(() => {
    if (orders.length === 0) return null;
    const nonCancelled = dateFiltered.filter(o => o.status !== "Cancelado");

    // Pedidos activos (not Entregado, not Cancelado)
    const activos = nonCancelled.filter(o => o.status !== "Entregado");
    const activosCount = activos.length;
    const activosBultos = activos.reduce((s, o) => s + (o.line_items ?? 0), 0);

    // Valor en tránsito (total of active orders)
    const valorTransito = activos.reduce((s, o) => s + (o.total_with_iva ?? 0), 0);

    // Entregados del periodo
    const entregados = nonCancelled.filter(o => o.status === "Entregado");
    const entregadosCount = entregados.length;

    // Tiempo promedio de entrega (days between order_date and delivery_date)
    let tiempoPromedio = 0;
    const deliveredWithDates = entregados.filter(o => o.order_date && o.delivery_date);
    if (deliveredWithDates.length > 0) {
      const totalDays = deliveredWithDates.reduce((s, o) => {
        const orderDate = parseLocalDate(o.order_date);
        const deliveryDate = parseLocalDate(o.delivery_date);
        return s + Math.max(0, (deliveryDate.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24));
      }, 0);
      tiempoPromedio = totalDays / deliveredWithDates.length;
    }

    return { activosCount, activosBultos, valorTransito, entregadosCount, tiempoPromedio };
  }, [orders, dateFiltered]);

  // Status distribution for pie chart
  const statusDistribution = useMemo(() => {
    const nonCancelled = dateFiltered.filter(o => o.status !== "Cancelado");
    const counts: Record<string, number> = {};
    for (const o of nonCancelled) {
      const s = o.status ?? "Nuevo";
      counts[s] = (counts[s] ?? 0) + 1;
    }
    const statusOrder = ["Pendiente portal", "Nuevo", "Confirmado", "En preparacion", "En ruta", "Entregado"];
    return statusOrder
      .filter(s => (counts[s] ?? 0) > 0)
      .map(s => ({ status: s, label: s === "En preparacion" ? "En preparación" : s, count: counts[s] ?? 0 }));
  }, [dateFiltered]);

  useEffect(() => {
    if (error) toast.error(t("ordersLoadError"));
  }, [error]);

  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    try { return format(parseLocalDate(d), "dd/MM/yy"); } catch { return d; }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    const validIds = filtered.filter(o => o.id).map(o => o.id!);
    if (selectedIds.size === validIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(validIds));
    }
  };

  const handleBulkStatusChange = async () => {
    setBulkProcessing(true);
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase.from("orders").update({ status: bulkStatus as any }).in("id", ids);
      if (error) throw error;
      toast.success(`${ids.length} pedidos actualizados`);
      setSelectedIds(new Set());
      setBulkAction(null);
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkDelete = async () => {
    setBulkProcessing(true);
    try {
      const ids = Array.from(selectedIds);
      const { error: itemsError } = await supabase.from("order_items").delete().in("order_id", ids);
      if (itemsError) throw itemsError;
      const { error: ordersError } = await supabase.from("orders").delete().in("id", ids);
      if (ordersError) throw ordersError;
      toast.success(`${ids.length} pedidos eliminados`);
      setSelectedIds(new Set());
      setBulkAction(null);
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleDeleteCompleted = () => {
    if (deleteOrder && selectedOrderId === deleteOrder.id) {
      setSelectedOrderId(null);
    }
    setDeleteOrder(null);
  };

  /**
   * Get-or-create the per-order signature token. Returns the public
   * URL for the /entrega/:token page in the readable
   * `<orderCode>-<4 char>` format (e.g. `P-0042-x7k2`).
   *
   * If a token already exists in the OLD UUID format (from before the
   * readable-format change), it gets auto-upgraded on first click —
   * the old UUID URL stops working at that point, but the dispatcher
   * gets a clean readable link going forward.
   */
  const getSignatureUrl = async (orderId: string): Promise<string | null> => {
    try {
      const { data, error } = await (supabase as any)
        .from("orders")
        .select("signature_token, order_code")
        .eq("id", orderId)
        .single();
      if (error) throw error;
      const orderCode = data?.order_code ?? "P";
      const existing: string | null = data?.signature_token ?? null;
      // Already in the readable format → just use it.
      if (existing && existing.startsWith(`${orderCode}-`)) {
        return `${window.location.origin}/entrega/${existing}`;
      }
      // Need to (re)generate. Alphabet excludes 0/O/1/l/I.
      const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
      const random4 = Array.from({ length: 4 }, () =>
        ALPHABET[Math.floor(Math.random() * ALPHABET.length)],
      ).join("");
      const token = `${orderCode}-${random4}`;
      const { error: upErr } = await (supabase as any)
        .from("orders")
        .update({ signature_token: token })
        .eq("id", orderId);
      if (upErr) throw upErr;
      return `${window.location.origin}/entrega/${token}`;
    } catch (err: any) {
      toast.error(err.message ?? "No se pudo generar el link");
      return null;
    }
  };

  const handlePreviewSignature = async (orderId: string) => {
    console.log("[pedidos] Eye click (async fallback)", orderId);
    const url = await getSignatureUrl(orderId);
    console.log("[pedidos] Eye url =", url);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleCopySignatureLink = async (orderId: string) => {
    console.log("[pedidos] Copy click (async fallback)", orderId);
    const url = await getSignatureUrl(orderId);
    console.log("[pedidos] Copy url =", url);
    if (!url) return;
    copyTextSync(url);
  };

  /**
   * Synchronous, iOS-bulletproof clipboard write. Uses a temporary
   * <textarea> + select() + document.execCommand("copy") — the only
   * mechanism iOS Safari reliably accepts from a click handler. Falls
   * back to navigator.clipboard.writeText for environments where
   * execCommand is disabled.
   */
  const copyTextSync = (text: string) => {
    let copied = false;
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.left = "0";
      ta.style.opacity = "0";
      ta.setAttribute("readonly", "");
      document.body.appendChild(ta);
      ta.focus({ preventScroll: true });
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      copied = document.execCommand("copy");
      document.body.removeChild(ta);
    } catch {
      copied = false;
    }
    if (copied) {
      toast.success("Link copiado");
      return;
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => toast.success("Link copiado"),
        () => toast.error("No se pudo copiar"),
      );
      return;
    }
    toast.error("No se pudo copiar");
  };

  // Eagerly fetch signature_token + order_code for every order in the
  // list so the Eye and Copy icons can use the URL synchronously inside
  // the click — required for iOS Safari to honor window.open and
  // navigator.clipboard. The bug we fixed: those handlers used to await
  // a Supabase round-trip BEFORE opening or copying, which iOS treats
  // as a programmatic popup / lost user gesture and blocks.
  const { data: tokenMap = {} } = useQuery({
    queryKey: ["orders-signature-tokens"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("orders")
        .select("id, signature_token, order_code")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const map: Record<string, { token: string | null; code: string | null }> = {};
      for (const o of (data ?? []) as { id: string; signature_token: string | null; order_code: string | null }[]) {
        map[o.id] = { token: o.signature_token, code: o.order_code };
      }
      return map;
    },
    staleTime: 60 * 1000,
  });

  /**
   * Returns the public /entrega/<token> URL for an order if the readable
   * token already exists. Returns null when the token is missing or in
   * the old UUID format (in that case the caller falls back to the
   * async create-and-redirect flow).
   */
  const knownSignatureUrl = (orderId: string): string | null => {
    const row = tokenMap[orderId];
    if (!row || !row.token || !row.code) return null;
    if (!row.token.startsWith(`${row.code}-`)) return null;
    return `${window.location.origin}/entrega/${row.token}`;
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("ordersTitle")}</h1>
            <p className="text-sm text-muted-foreground">{t("ordersSubtitle")}</p>
          </div>
          {/* Mayoreo / Menudeo / Todos — only meaningful on the Pedidos
              sub-tab. Hidden on Cotizaciones because quotes don't carry
              a client_type yet. Mirrors the Clients tab control 1:1. */}
          {tab === "pedidos" && (
            <div className="inline-flex rounded-lg border bg-muted p-0.5">
              {(["todos", "mayoreo", "menudeo"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
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
          )}
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          {/* Pedidos / Cotizaciones toggle */}
          <div className="inline-flex rounded-lg border bg-card p-1 text-sm">
            <button
              type="button"
              onClick={() => setTab("pedidos")}
              className={cn(
                "px-3 py-1.5 rounded-md font-medium transition-colors",
                tab === "pedidos" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Pedidos
            </button>
            <button
              type="button"
              onClick={() => setTab("cotizaciones")}
              className={cn(
                "px-3 py-1.5 rounded-md font-medium transition-colors",
                tab === "cotizaciones" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Cotizaciones
            </button>
          </div>
          {/* Single action button. min-w fixes the width so swapping
           * labels ("Nuevo Pedido" → "Nueva Cotización") doesn't change
           * the right edge of the row, which would otherwise push the
           * toggle to the left when on the Cotizaciones tab. */}
          <Button
            size="sm"
            className="gap-1.5 w-[200px] justify-center"
            onClick={() => {
              if (tab === "pedidos") setNewOrderOpen(true);
              else setNewQuoteOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            {tab === "pedidos" ? t("newOrder") : "Nueva Cotización"}
          </Button>
        </div>
      </div>

      {tab === "cotizaciones" && (
        <CotizacionesTab
          onConverted={(orderId) => { setTab("pedidos"); setEditOrderId(orderId); }}
          newOpen={newQuoteOpen}
          onNewOpenChange={setNewQuoteOpen}
        />
      )}

      {tab === "pedidos" && (<>
        {/* —— Pedidos tab content (everything below this line) —— */}

      {/* Date filter */}
      <ChronoBar
        dateFrom={dateFrom}
        dateTo={dateTo}
        onChange={(from, to) => { setDateFrom(from); setDateTo(to); }}
      />

      {/* Dashboard */}
      {dashboardStats && !isLoading && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 [&>div]:min-h-[120px]">
            {/* Pedidos activos — split card */}
            <div className="border border-border rounded-lg bg-card/50 flex flex-col text-center overflow-hidden">
              <div className="px-5 pt-4 pb-2 flex items-center justify-center gap-2">
                <div className="p-1.5 rounded-md bg-blue-500/10">
                  <ShoppingCart className="h-4 w-4 text-blue-400" />
                </div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pedidos activos</p>
              </div>
              <div className="flex items-stretch flex-1">
                <div className="flex-1 pb-4 pt-1 flex flex-col items-center justify-center">
                  <p className="text-2xl font-bold text-foreground">{dashboardStats.activosCount}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Pedidos</p>
                </div>
                <div className="w-px bg-border my-3" />
                <div className="flex-1 pb-4 pt-1 flex flex-col items-center justify-center">
                  <p className="text-2xl font-bold text-foreground">{dashboardStats.activosBultos.toLocaleString("es-MX")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">SKUs</p>
                </div>
              </div>
            </div>

            {/* Valor en tránsito */}
            <div className="border border-border rounded-lg bg-card/50 flex flex-col text-center overflow-hidden">
              <div className="px-5 pt-4 pb-2 flex items-center justify-center gap-2">
                <div className="p-1.5 rounded-md bg-amber-500/10">
                  <DollarSign className="h-4 w-4 text-amber-400" />
                </div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Valor en tránsito</p>
              </div>
              <div className="pb-4 pt-1 flex flex-col items-center justify-center">
                <p className="text-2xl font-bold text-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {fmtMXN(dashboardStats.valorTransito)}
                </p>
              </div>
            </div>

            {/* Entregados del periodo */}
            <div className="border border-border rounded-lg bg-card/50 flex flex-col text-center overflow-hidden">
              <div className="px-5 pt-4 pb-2 flex items-center justify-center gap-2">
                <div className="p-1.5 rounded-md bg-green-500/10">
                  <TruckIcon className="h-4 w-4 text-green-400" />
                </div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Entregados</p>
              </div>
              <div className="pb-4 pt-1 flex flex-col items-center justify-center">
                <p className="text-2xl font-bold text-foreground">{dashboardStats.entregadosCount}</p>
                <p className="text-xs text-muted-foreground mt-0.5">pedidos</p>
              </div>
            </div>

            {/* Tiempo promedio de entrega */}
            <div className="border border-border rounded-lg bg-card/50 flex flex-col text-center overflow-hidden">
              <div className="px-5 pt-4 pb-2 flex items-center justify-center gap-2">
                <div className="p-1.5 rounded-md bg-purple-500/10">
                  <Clock className="h-4 w-4 text-purple-400" />
                </div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tiempo promedio</p>
              </div>
              <div className="pb-4 pt-1 flex flex-col items-center justify-center">
                <p className="text-2xl font-bold text-foreground">{dashboardStats.tiempoPromedio.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">días de entrega</p>
              </div>
            </div>
          </div>

          {/* Status distribution pie chart — compact */}
          {statusDistribution.length > 0 && (() => {
            const total = statusDistribution.reduce((s, d) => s + d.count, 0);
            const colors: Record<string, string> = {
              "Pendiente portal": "#f59e0b",
              "Nuevo": "#3b82f6",
              "Confirmado": "#8b5cf6",
              "En preparacion": "#f97316",
              "En ruta": "#06b6d4",
              "Entregado": "#22c55e",
            };
            let accumulated = 0;
            const segments = statusDistribution.map(d => {
              const pct = (d.count / total) * 100;
              const start = accumulated;
              accumulated += pct;
              return { ...d, start, end: accumulated, color: colors[d.status] ?? "#6b7280" };
            });
            const conicGradient = segments.map(s => `${s.color} ${s.start}% ${s.end}%`).join(", ");

            return (
              <div className="w-full md:inline-flex md:w-auto max-w-full border border-border rounded-lg bg-card/50 overflow-hidden">
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
                  {/* Pie */}
                  <div className="relative shrink-0">
                    <div
                      className="w-28 h-28 rounded-full"
                      style={{
                        background: `conic-gradient(${conicGradient})`,
                        boxShadow: "0 0 20px rgba(59,130,246,0.15)",
                      }}
                    />
                    <div className="absolute inset-[10px] rounded-full bg-background flex flex-col items-center justify-center">
                      <p className="text-lg font-bold text-foreground">{total}</p>
                      <p className="text-[10px] text-muted-foreground">pedidos</p>
                    </div>
                  </div>
                  {/* Legend */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Distribución por estado</p>
                    {segments.map(s => (
                      <div key={s.status} className="flex items-center gap-3">
                        <div className="flex items-center gap-2 min-w-0 sm:min-w-[120px]">
                          <div className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
                          <span className="text-sm text-foreground">{s.label}</span>
                        </div>
                        <span className="text-sm font-bold text-foreground tabular-nums">{s.count}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">{((s.count / total) * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* Search + Status filter */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("searchOrderPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allStatuses")}</SelectItem>
            {ORDER_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Bulk action bar */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 px-3 rounded-lg border border-border min-h-[48px] hidden sm:flex">
        <span className="text-sm font-medium text-foreground">{selectedIds.size} seleccionados</span>
        <Button size="sm" variant="outline" onClick={() => setBulkAction("status")} disabled={bulkProcessing || selectedIds.size === 0}>
          Cambiar estado
        </Button>
        <Button size="sm" variant="destructive" onClick={() => setBulkAction("delete")} disabled={bulkProcessing || selectedIds.size === 0}>
          Eliminar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} disabled={selectedIds.size === 0}>Deseleccionar</Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <p className="text-muted-foreground">{t("noOrders")}</p>
          <Button variant="outline" onClick={() => setNewOrderOpen(true)}>{t("createFirstOrder")}</Button>
        </div>
      ) : (
        <>
          {/* Sort indicator — ALWAYS rendered (not conditional) so the
              row never shifts when the user toggles a column header.
              Default state = muted "Vista estándar" pill. Custom state
              = primary-colored "Vista guardada" pill with active column
              + direction and a Restablecer link. Same vertical
              footprint either way → no layout jank. */}
          <div className="flex items-center gap-2 text-xs">
            {isDefaultSort ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-border font-medium">
                <Pin className="h-3 w-3 opacity-50" />
                Vista estándar
              </span>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/30 font-medium">
                  <Pin className="h-3 w-3" />
                  Vista guardada
                  <span className="opacity-80">
                    · Orden:{" "}
                    {sort.key === "order_code" && "Pedido"}
                    {sort.key === "client_name" && "Cliente"}
                    {sort.key === "order_date" && "Fecha pedido"}
                    {sort.key === "delivery_date" && "Fecha entrega"}
                    {sort.key === "status" && "Estado"}
                    {sort.key === "total_with_iva" && "Total"}
                    {sort.key === "line_items" && "SKUs"}
                    {sort.dir === "asc" ? " ↑" : " ↓"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={resetSort}
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RotateCcw className="h-3 w-3" />
                  Restablecer
                </button>
              </>
            )}
          </div>

          {/* Mobile sort pill — cards don't have headers to click, so
              this dropdown gives mobile users the same access. Same
              options as desktop column headers. */}
          <div className="flex items-center justify-end md:hidden">
            <Select
              value={`${sort.key}|${sort.dir}`}
              onValueChange={(v) => {
                const [k, d] = v.split("|") as [SortKey, SortDir];
                setSort({ key: k, dir: d });
              }}
            >
              <SelectTrigger className="h-8 w-auto gap-1.5 text-xs">
                <ArrowUpDown className="h-3.5 w-3.5" />
                <SelectValue placeholder="Ordenar" />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="order_code|desc">Pedido (más nuevo)</SelectItem>
                <SelectItem value="order_code|asc">Pedido (más viejo)</SelectItem>
                <SelectItem value="delivery_date|asc">Fecha entrega (próxima)</SelectItem>
                <SelectItem value="delivery_date|desc">Fecha entrega (lejana)</SelectItem>
                <SelectItem value="order_date|desc">Fecha pedido (reciente)</SelectItem>
                <SelectItem value="order_date|asc">Fecha pedido (vieja)</SelectItem>
                <SelectItem value="client_name|asc">Cliente (A→Z)</SelectItem>
                <SelectItem value="client_name|desc">Cliente (Z→A)</SelectItem>
                <SelectItem value="status|asc">Estado (A→Z)</SelectItem>
                <SelectItem value="total_with_iva|desc">Total (mayor)</SelectItem>
                <SelectItem value="total_with_iva|asc">Total (menor)</SelectItem>
                <SelectItem value="line_items|desc">SKUs (más)</SelectItem>
                <SelectItem value="line_items|asc">SKUs (menos)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* ── Mobile: Card view ── */}
          <div className="space-y-3 md:hidden">
            {filtered.map((o) => (
              <div
                key={o.id}
                className="rounded-lg border bg-card p-4 space-y-3 cursor-pointer active:bg-muted/50 transition-colors"
                onClick={() => o.id && setSelectedOrderId(o.id)}
              >
                {/* Row 1: Code + Status */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-blue-400">{o.order_code ?? "—"}</span>
                    {o.status === "Pendiente portal" && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">Portal</span>
                    )}
                    {o.id && (damagedByOrder[o.id] ?? 0) > 0 && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-500/15 text-orange-500 border border-orange-500/30"
                        title={`${damagedByOrder[o.id]} bultos dañados`}
                      >
                        <AlertOctagon className="h-2.5 w-2.5" />
                        {damagedByOrder[o.id]} dañ.
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={o.status} />
                    {(() => {
                      // When the token is already known (common case), render
                      // a real <a> for Eye and a sync onClick for Copy — both
                      // are gesture-clean for iOS. Async fallback only fires
                      // when the token doesn't exist yet, which is rare.
                      const url = o.id ? knownSignatureUrl(o.id) : null;
                      return (
                        <>
                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground p-1"
                              onClick={(e) => e.stopPropagation()}
                              title="Ver/firmar entrega"
                              aria-label="Ver/firmar entrega"
                            >
                              <Eye className="h-4 w-4" />
                            </a>
                          ) : (
                            <button
                              className="text-muted-foreground hover:text-foreground p-1"
                              onClick={(e) => { e.stopPropagation(); o.id && handlePreviewSignature(o.id); }}
                              title="Ver/firmar entrega"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            className="text-muted-foreground hover:text-foreground p-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!o.id) return;
                              if (url) copyTextSync(url);
                              else handleCopySignatureLink(o.id);
                            }}
                            title="Copiar link de firma"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        </>
                      );
                    })()}
                    <button
                      className="relative text-muted-foreground hover:text-foreground p-1"
                      onClick={(e) => { e.stopPropagation(); o.id && exportOrderAsImage(o.id); }}
                      title={o.id && signedOrderIds.has(o.id) ? "Descargar comprobante firmado" : "Descargar PDF"}
                    >
                      <Download className="h-4 w-4" />
                      {o.id && signedOrderIds.has(o.id) && (
                        <CheckCircle2 className="h-3 w-3 text-emerald-500 absolute -bottom-0.5 -right-0.5 bg-background rounded-full" />
                      )}
                    </button>
                  </div>
                </div>
                {/* Row 2: Client */}
                <p className="text-sm text-foreground font-medium truncate">{o.client_name ?? "—"}</p>
                {/* Row 3: Details grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div>
                    <span className="text-muted-foreground">Pedido: </span>
                    <span className="text-foreground">{fmtDate(o.order_date)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-muted-foreground">Entrega: </span>
                    <span className="text-foreground">{fmtDate(o.delivery_date)}</span>
                    <DeliveryWindowChip
                      from={o.delivery_window_from}
                      until={o.delivery_window_until}
                      notes={o.delivery_notes}
                      isPickup={o.fulfillment_method === "pickup"}
                    />
                  </div>
                  <div>
                    <span className="text-muted-foreground">SKUs: </span>
                    <span className="text-foreground">{o.line_items ?? "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total: </span>
                    <span className="text-foreground font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>{fmtMXN(o.total_with_iva)}</span>
                    {Number(o.discount_amount ?? 0) > 0 && (
                      <span
                        className="ml-1.5 text-[10px] text-amber-500 font-medium"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                        title={`Subtotal ${fmtMXN(o.subtotal ?? 0)} − descuento ${fmtMXN(o.discount_amount ?? 0)}${o.discount_reason ? ` · ${o.discount_reason}` : ""}`}
                      >
                        (−{fmtMXN(o.discount_amount ?? 0)})
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {o.fulfillment_method === "pickup" && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                      📦 Pickup
                    </span>
                  )}
                  {o.needs_approval && (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-500 border border-amber-500/40"
                      title="El cliente pidió para antes de 3 días hábiles. Requiere tu aprobación."
                    >
                      ⚠ Aprobación
                    </span>
                  )}
                  {(o as any).price_list_name && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30">
                      {(o as any).price_list_name}
                    </span>
                  )}
                  {(o.manual_price_count ?? 0) > 0 && !(o as any).price_list_name && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                      {o.manual_price_count} precio manual
                    </span>
                  )}
                  {Number(o.discount_amount ?? 0) > 0 && (
                    <span
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30"
                      title={o.discount_reason ?? ""}
                    >
                      Descuento −{fmtMXN(o.discount_amount ?? 0)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* ── Desktop: Table view ── */}
          <div className="rounded-md border hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"><Checkbox checked={filtered.filter(o => o.id).length > 0 && selectedIds.size === filtered.filter(o => o.id).length} onCheckedChange={toggleSelectAll} /></TableHead>
                  {/* Sortable column headers — click toggles asc/desc.
                      Active column shows a colored chevron; inactive
                      columns show a faint up/down icon to advertise the
                      affordance without shouting. Persisted to
                      localStorage so the choice sticks across reloads. */}
                  <SortableTableHead className="w-[140px]" sortKey="order_code"   currentSort={sort} onClick={cycleSort}>{t("thOrder")}</SortableTableHead>
                  <SortableTableHead                       sortKey="client_name"  currentSort={sort} onClick={cycleSort}>{t("thClient")}</SortableTableHead>
                  <SortableTableHead                       sortKey="order_date"   currentSort={sort} onClick={cycleSort}>{t("thOrderDate")}</SortableTableHead>
                  <SortableTableHead                       sortKey="delivery_date" currentSort={sort} onClick={cycleSort}>{t("thDeliveryDate")}</SortableTableHead>
                  <SortableTableHead                       sortKey="status"        currentSort={sort} onClick={cycleSort}>{t("thStatus")}</SortableTableHead>
                  <SortableTableHead className="text-right" sortKey="total_with_iva" currentSort={sort} onClick={cycleSort} align="right">{t("thTotal")}</SortableTableHead>
                  <SortableTableHead className="text-right" sortKey="line_items"     currentSort={sort} onClick={cycleSort} align="right">SKUs</SortableTableHead>
                  <TableHead className="w-[40px]" />
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((o) => (
                  <TableRow
                    key={o.id}
                    className={cn("cursor-pointer", o.id && selectedIds.has(o.id) && "bg-muted/30")}
                    onClick={() => o.id && setSelectedOrderId(o.id)}
                  >
                    <TableCell onClick={e => e.stopPropagation()}><Checkbox checked={!!o.id && selectedIds.has(o.id)} onCheckedChange={() => o.id && toggleSelect(o.id)} /></TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <button
                          className="text-blue-400 hover:text-blue-300 hover:underline transition-colors"
                          onClick={(e) => { e.stopPropagation(); o.id && setSelectedOrderId(o.id); }}
                        >
                          {o.order_code ?? "—"}
                        </button>
                        {o.status === "Pendiente portal" && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                            Portal
                          </span>
                        )}
                        {o.id && (damagedByOrder[o.id] ?? 0) > 0 && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-500/15 text-orange-500 border border-orange-500/30"
                            title={`${damagedByOrder[o.id]} bultos dañados en este pedido`}
                          >
                            <AlertOctagon className="h-2.5 w-2.5" />
                            Dañados
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <button
                        className="text-foreground hover:text-blue-400 hover:underline transition-colors"
                        onClick={(e) => { e.stopPropagation(); if (o.client_id) navigate(`/clients?expandClient=${o.client_id}`); }}
                      >
                        {o.client_name ?? "—"}
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{fmtDate(o.order_date)}</TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span>{fmtDate(o.delivery_date)}</span>
                        <DeliveryWindowChip
                          from={o.delivery_window_from}
                          until={o.delivery_window_until}
                          notes={o.delivery_notes}
                          isPickup={o.fulfillment_method === "pickup"}
                        />
                      </div>
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()} className="w-[140px] min-w-[140px]">
                      <Select
                        value={o.status}
                        onValueChange={async (newStatus) => {
                          if (!o.id || newStatus === o.status) return;
                          const { error } = await supabase.from("orders").update({ status: newStatus as any }).eq("id", o.id);
                          if (error) { toast.error("Error al cambiar estado", { description: error.message }); return; }
                          toast.success(`${o.order_code ?? "Pedido"} → ${STATUS_LABELS[newStatus as keyof typeof STATUS_LABELS]}`);
                          queryClient.invalidateQueries({ queryKey: ["orders"] });
                        }}
                      >
                        <SelectTrigger className="h-7 w-[130px] border-0 bg-transparent p-0 shadow-none ring-0 focus:ring-0 focus:ring-offset-0 [&>svg]:hidden">
                          <StatusBadge status={o.status} />
                        </SelectTrigger>
                        <SelectContent>
                          {ORDER_STATUSES.map(s => (
                            <SelectItem key={s} value={s}><StatusBadge status={s} /></SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {/* Two-column layout: badges sit in their own
                          right-aligned column, price sits in a fixed-
                          width column to its right. The price's right
                          edge is constant across rows, which makes the
                          badges' right edges line up vertically too. */}
                      <div className="flex items-center justify-end gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          {o.fulfillment_method === "pickup" && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30"
                              title="Recoge en bodega"
                            >
                              📦 Pickup
                            </span>
                          )}
                          {o.needs_approval && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-500 border border-amber-500/40"
                              title="Pedido dentro de 3 días hábiles — requiere aprobación"
                            >
                              ⚠ Aprobación
                            </span>
                          )}
                          {(o as any).price_list_name && (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30"
                              title={`Lista de precios: ${(o as any).price_list_name}`}
                            >
                              {(o as any).price_list_name}
                            </span>
                          )}
                          {(o.manual_price_count ?? 0) > 0 && !(o as any).price_list_name && (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30"
                              title={`${o.manual_price_count} producto${(o.manual_price_count ?? 0) > 1 ? "s" : ""} con precio manual`}
                            >
                              {o.manual_price_count} manual
                            </span>
                          )}
                          {Number(o.discount_amount ?? 0) > 0 && (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30"
                              title={`Subtotal ${fmtMXN(o.subtotal ?? 0)} − descuento ${fmtMXN(o.discount_amount ?? 0)}${o.discount_reason ? ` · ${o.discount_reason}` : ""}`}
                            >
                              −{fmtMXN(o.discount_amount ?? 0)}
                            </span>
                          )}
                        </div>
                        <span className="inline-block min-w-[110px] text-right">
                          {fmtMXN(o.total_with_iva)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <button
                        className="hover:text-blue-400 hover:underline transition-colors"
                        onClick={(e) => { e.stopPropagation(); o.id && setSelectedOrderId(o.id); }}
                      >
                        {o.line_items ?? "—"}
                      </button>
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()} className="w-[120px]">
                      <div className="flex items-center gap-1">
                      {(() => {
                        const url = o.id ? knownSignatureUrl(o.id) : null;
                        return (
                          <>
                            {url ? (
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground transition-colors p-1"
                                title="Ver/firmar entrega"
                                aria-label="Ver/firmar entrega"
                              >
                                <Eye className="h-4 w-4" />
                              </a>
                            ) : (
                              <button
                                className="text-muted-foreground hover:text-foreground transition-colors p-1"
                                onClick={() => o.id && handlePreviewSignature(o.id)}
                                title="Ver/firmar entrega"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              className="text-muted-foreground hover:text-foreground transition-colors p-1"
                              onClick={() => {
                                if (!o.id) return;
                                if (url) copyTextSync(url);
                                else handleCopySignatureLink(o.id);
                              }}
                              title="Copiar link de firma"
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                          </>
                        );
                      })()}
                      <button
                        className="relative text-muted-foreground hover:text-foreground transition-colors p-1"
                        onClick={() => { console.log("[pedidos] Download click", o.id); o.id && exportOrderAsImage(o.id); }}
                        title={o.id && signedOrderIds.has(o.id) ? "Descargar comprobante firmado" : "Descargar PDF"}
                      >
                        <Download className="h-4 w-4" />
                        {o.id && signedOrderIds.has(o.id) && (
                          <CheckCircle2 className="h-3 w-3 text-emerald-500 absolute -bottom-0.5 -right-0.5 bg-background rounded-full" />
                        )}
                      </button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <OrderRowActions
                        onView={() => o.id && setSelectedOrderId(o.id)}
                        onEdit={() => o.id && setEditOrderId(o.id)}
                        onDelete={() => o.id && setDeleteOrder({ id: o.id, orderCode: o.order_code, clientName: o.client_name })}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <NewOrderDialog
        open={newOrderOpen}
        onOpenChange={setNewOrderOpen}
        onOrderCreated={(id) => setSelectedOrderId(id)}
      />

      <OrderDetailSheet
        orderId={selectedOrderId}
        open={!!selectedOrderId}
        onOpenChange={(open) => { if (!open) setSelectedOrderId(null); }}
        onEdit={(id) => setEditOrderId(id)}
        onDelete={(id, orderCode, clientName) => setDeleteOrder({ id, orderCode, clientName })}
      />

      <EditOrderSheet
        orderId={editOrderId}
        open={!!editOrderId}
        onOpenChange={(open) => { if (!open) setEditOrderId(null); }}
        onOrderUpdated={() => {}}
      />

      <DeleteOrderDialog
        orderId={deleteOrder?.id ?? null}
        orderNumber={deleteOrder?.orderCode ?? null}
        clientName={deleteOrder?.clientName ?? null}
        open={!!deleteOrder}
        onOpenChange={(open) => { if (!open) setDeleteOrder(null); }}
        onDeleted={handleDeleteCompleted}
      />

      {/* Bulk Status Dialog */}
      <Dialog open={bulkAction === "status"} onOpenChange={open => !open && setBulkAction(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cambiar estado</DialogTitle>
            <DialogDescription>Cambiar {selectedIds.size} pedidos a:</DialogDescription>
          </DialogHeader>
          <Select value={bulkStatus} onValueChange={setBulkStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ORDER_STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={handleBulkStatusChange} disabled={bulkProcessing} className="gradient-button text-white">
            {bulkProcessing ? "Actualizando..." : "Aplicar"}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkAction === "delete"} onOpenChange={open => !open && setBulkAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar {selectedIds.size} pedidos?</AlertDialogTitle>
            <AlertDialogDescription>Esta accion no se puede deshacer. Se eliminaran tambien los articulos asociados.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} disabled={bulkProcessing}>
              {bulkProcessing ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </>)}
    </div>
  );
}
