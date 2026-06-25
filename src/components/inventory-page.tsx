import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GlowCard } from "@/components/ui/spotlight-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern";
import { ProductThumb } from "@/components/ui/product-thumb";
import {
  Search, Package, AlertTriangle, CalendarIcon,
  ArrowUpDown, ArrowUp, ArrowDown, DollarSign, Boxes, SlidersHorizontal,
  Download, Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StockAdjustmentDialog } from "@/components/StockAdjustmentDialog";
import { MarkAsDamagedDialog } from "@/components/MarkAsDamagedDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { format, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { parseLocalDate, todayMx } from "@/lib/date-utils";
import { MoreVertical, AlertOctagon } from "lucide-react";
import { downloadInventoryExcel } from "@/lib/inventory-excel-export";
import { toast } from "sonner";
import { Product360Drawer } from "@/components/catalog/Product360Drawer";
import { InventoryImportDialog } from "@/components/inventory/InventoryImportDialog";
import { Upload } from "lucide-react";


const mxnFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const fmtMXN = (v: number | null) => v == null ? "$0" : mxnFmt.format(v);

interface InventoryItem {
  id: string;
  clave: string;
  name: string;
  supplier: string;
  brand: string;
  weight_kg: number;
  cost_with_iva: number;
  cost_without_iva: number;
  bonificacion_pct: number;
  sale_price_with_iva: number;
  image_url: string | null;
  stock_actual: number;
  stock_committed: number;
  stock_incoming: number;
  stock_disponible: number;
  active: boolean;
}

type SortKey = "clave" | "name" | "supplier" | "stock_actual" | "disponible" | "stock_committed" | "stock_incoming" | "valor";
type SortDir = "asc" | "desc";
type StockFilter = "all" | "disponible" | "low_stock" | "committed";

export default function Inventory() {
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("stock_actual");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [dayFilter, setDayFilter] = useState<"all" | string>("all");
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [adjustProduct, setAdjustProduct] = useState<{
    id: string; clave: string; name: string; image_url: string | null;
    stock_actual: number; stock_disponible: number;
  } | null>(null);
  const [damagedProduct, setDamagedProduct] = useState<{
    id: string; clave: string; name: string; image_url: string | null;
    cost_with_iva: number; cost_without_iva: number; bonificacion_pct: number;
    sale_price_with_iva: number; stock_actual: number;
  } | null>(null);

  const today = todayMx();

  // Day chips: next 7 days
  const dayOptions = useMemo(() => {
    const base = parseLocalDate(today);
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(base, i);
      const val = format(d, "yyyy-MM-dd");
      const dayName = format(d, "EEE", { locale: es });
      const dayNum = format(d, "d/MM");
      return { value: val, dayName: dayName.charAt(0).toUpperCase() + dayName.slice(1), dayNum, isToday: i === 0 };
    });
  }, [today]);

  const isProjected = dayFilter !== "all";

  const { data: rawItems = [], isLoading } = useQuery({
    queryKey: ["inventory-stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_products_with_stock")
        .select("id, clave, name, supplier, brand, weight_kg, cost_with_iva, cost_without_iva, bonificacion_pct, sale_price_with_iva, image_url, stock_actual, stock_committed, stock_incoming, stock_disponible, active")
        .eq("active", true)
        .or("stock_actual.gt.0,stock_committed.gt.0,stock_incoming.gt.0")
        .order("clave");
      if (error) throw error;
      return (data ?? []) as InventoryItem[];
    },
  });

  // Fetch damaged bultos per product (disponible status only) to show badge
  const { data: damagedByProduct = {} } = useQuery({
    queryKey: ["damaged-by-product"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("damaged_batches")
        .select("product_id, remaining_quantity")
        .eq("status", "disponible")
        .gt("remaining_quantity", 0);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of data ?? []) {
        map[row.product_id] = (map[row.product_id] ?? 0) + row.remaining_quantity;
      }
      return map;
    },
  });

  // Fetch order data for projection — split into consumed (before day) and committed (on day)
  const { data: orderProjection = { consumed: {}, committed: {} }, isFetching: fetchingOrders } = useQuery({
    queryKey: ["inventory-order-projection", dayFilter],
    queryFn: async () => {
      if (dayFilter === "all") return { consumed: {}, committed: {} };
      // Get all non-delivered/cancelled orders delivering on or before selected day
      const { data, error } = await supabase
        .from("orders")
        .select("id, delivery_date, status, order_items(product_id, quantity)")
        .lte("delivery_date", dayFilter)
        .not("status", "in", "(Entregado,Cancelado)");
      if (error) throw error;

      const consumed: Record<string, number> = {};  // orders delivering BEFORE selected day (assumed fulfilled)
      const committed: Record<string, number> = {}; // orders delivering ON selected day (still pending)

      for (const order of data ?? []) {
        const target = order.delivery_date < dayFilter ? consumed : committed;
        for (const item of (order.order_items ?? []) as { product_id: string; quantity: number }[]) {
          target[item.product_id] = (target[item.product_id] ?? 0) + item.quantity;
        }
      }
      return { consumed, committed };
    },
    enabled: dayFilter !== "all",
  });

  // Fetch incoming stock entries — split into "before or on D" (for stock projection)
  // and "exactly on D" (for the Llegando column)
  const { data: incomingData = { beforeOrOn: {}, onDay: {} }, isFetching: fetchingIncoming } = useQuery({
    queryKey: ["inventory-incoming-by-day", dayFilter],
    queryFn: async () => {
      if (dayFilter === "all") return { beforeOrOn: {}, onDay: {} };
      const { data, error } = await supabase
        .from("stock_deliveries")
        .select("id, delivery_date, stock_entries(product_id, quantity)")
        .eq("delivery_status", "Programado")
        .lte("delivery_date", dayFilter);
      if (error) throw error;

      const beforeOrOn: Record<string, number> = {};
      const onDay: Record<string, number> = {};
      for (const delivery of data ?? []) {
        const entries = (delivery.stock_entries ?? []) as { product_id: string; quantity: number }[];
        const isOnDay = delivery.delivery_date === dayFilter;
        for (const entry of entries) {
          beforeOrOn[entry.product_id] = (beforeOrOn[entry.product_id] ?? 0) + entry.quantity;
          if (isOnDay) {
            onDay[entry.product_id] = (onDay[entry.product_id] ?? 0) + entry.quantity;
          }
        }
      }
      return { beforeOrOn, onDay };
    },
    enabled: dayFilter !== "all",
  });

  const incomingByProduct = incomingData.beforeOrOn;
  const arrivingOnDay = incomingData.onDay;

  const projectionLoading = isProjected && (fetchingOrders || fetchingIncoming);

  // Compute projected values per item
  const projectedItems = useMemo(() => {
    if (!isProjected) return rawItems;

    return rawItems.map(item => {
      const consumedBefore = orderProjection.consumed[item.id] ?? 0; // delivered before this day — stock left
      const committedOnDay = orderProjection.committed[item.id] ?? 0; // delivering this day — still pending
      const incomingBeforeOrOn = incomingByProduct[item.id] ?? 0;     // everything arriving ≤ day D (affects stock projection)
      const incomingOnDay = arrivingOnDay[item.id] ?? 0;              // only arriving ON day D (shown as "Llegando")

      // Projected stock = current physical - consumed by earlier orders + everything arriving by this day
      const projectedActual = item.stock_actual - consumedBefore + incomingBeforeOrOn;
      const projDisponible = projectedActual - committedOnDay;

      return {
        ...item,
        stock_actual: projectedActual,
        stock_committed: committedOnDay,
        stock_incoming: incomingOnDay, // only stock arriving on the selected day
        stock_disponible: projDisponible,
      };
    });
  }, [rawItems, isProjected, orderProjection, incomingByProduct, arrivingOnDay]);

  const suppliers = useMemo(() => {
    const set = new Set(rawItems.map(i => i.supplier).filter(Boolean));
    return Array.from(set).sort();
  }, [rawItems]);

  const items = useMemo(() => {
    let list = projectedItems;

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        i.clave.toLowerCase().includes(q) ||
        i.name.toLowerCase().includes(q) ||
        i.brand?.toLowerCase().includes(q)
      );
    }

    if (supplierFilter !== "all") {
      list = list.filter(i => i.supplier === supplierFilter);
    }

    if (stockFilter === "disponible") list = list.filter(i => i.stock_disponible > 0);
    else if (stockFilter === "low_stock") list = list.filter(i => i.stock_committed > 0 && i.stock_actual <= i.stock_committed);
    else if (stockFilter === "committed") list = list.filter(i => i.stock_committed > 0);

    list = [...list].sort((a, b) => {
      let va: number | string = 0, vb: number | string = 0;
      switch (sortKey) {
        case "clave": va = a.clave; vb = b.clave; break;
        case "name": va = a.name; vb = b.name; break;
        case "supplier": va = a.supplier; vb = b.supplier; break;
        case "stock_actual": va = a.stock_actual; vb = b.stock_actual; break;
        case "disponible": va = a.stock_disponible; vb = b.stock_disponible; break;
        case "stock_committed": va = a.stock_committed; vb = b.stock_committed; break;
        case "stock_incoming": va = a.stock_incoming; vb = b.stock_incoming; break;
        case "valor": va = a.stock_actual * a.cost_with_iva; vb = b.stock_actual * b.cost_with_iva; break;
      }
      if (typeof va === "string") {
        const cmp = va.localeCompare(vb as string);
        return sortDir === "asc" ? cmp : -cmp;
      }
      return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });

    return list;
  }, [projectedItems, search, supplierFilter, stockFilter, sortKey, sortDir]);

  // Stats — use projected items
  const stats = useMemo(() => {
    const src = projectedItems;
    const totalBultos = src.reduce((s, i) => s + i.stock_actual, 0);
    const totalValue = src.reduce((s, i) => s + i.stock_actual * i.cost_with_iva, 0);
    const totalCommitted = src.reduce((s, i) => s + i.stock_committed, 0);
    const totalDisponible = src.reduce((s, i) => s + Math.max(0, i.stock_disponible), 0);
    return { skusInStock: src.length, totalBultos, totalValue, totalCommitted, totalDisponible };
  }, [projectedItems]);

  // Projected day label
  const projectedLabel = useMemo(() => {
    if (!isProjected) return null;
    try {
      const d = parseLocalDate(dayFilter);
      return format(d, "EEEE d 'de' MMMM", { locale: es });
    } catch {
      return dayFilter;
    }
  }, [dayFilter, isProjected]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  return (
    <div className="relative min-h-screen">
      <AnimatedGridPattern className="fixed inset-0 opacity-20 pointer-events-none" />
      <div className="relative z-10 space-y-6 p-4 md:p-6 max-w-[1600px] mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Inventario</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isProjected
                ? `Proyección para ${projectedLabel}`
                : "Stock actual en bodega"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (items.length === 0) {
                toast("No hay productos para exportar");
                return;
              }
              try {
                setExporting({ done: 0, total: items.length });
                await downloadInventoryExcel(
                  items.map(it => ({
                    clave: it.clave,
                    name: it.name,
                    supplier: it.supplier ?? null,
                    image_url: it.image_url,
                    stock_actual: it.stock_actual,
                    stock_committed: it.stock_committed,
                    stock_disponible: it.stock_disponible,
                    stock_incoming: it.stock_incoming,
                  })),
                  {
                    fileLabel: (isProjected ? projectedLabel : todayMx()) ?? undefined,
                    onProgress: (done, total) => setExporting({ done, total }),
                  },
                );
                toast.success(`Excel descargado (${items.length} productos)`);
              } catch (err: any) {
                toast.error("Error al exportar: " + (err?.message ?? "desconocido"));
              } finally {
                setExporting(null);
              }
            }}
            disabled={exporting !== null || items.length === 0}
            className="gap-2"
          >
            {exporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Descargando… {exporting.done}/{exporting.total}
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Descargar Excel
              </>
            )}
          </Button>
        </div>

        {/* Day filter chips */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setDayFilter("all")}
            className={cn(
              "shrink-0 px-3 py-2 rounded-lg text-xs font-medium border whitespace-nowrap transition-colors",
              dayFilter === "all"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:text-foreground"
            )}
          >
            Hoy (todo)
          </button>
          {dayOptions.map(d => {
            const isActive = dayFilter === d.value;
            return (
              <button
                key={d.value}
                onClick={() => setDayFilter(isActive ? "all" : d.value)}
                className={cn(
                  "shrink-0 px-3 py-2 rounded-lg text-xs font-medium border whitespace-nowrap transition-colors text-left",
                  isActive
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:text-foreground"
                )}
              >
                <div className="font-semibold">{d.dayName}</div>
                <div className={cn("text-[10px]", isActive ? "opacity-90" : "opacity-70")}>{d.dayNum}</div>
              </button>
            );
          })}
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <GlowCard>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Package className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">SKUs en stock</span>
              </div>
              {isLoading ? <Skeleton className="h-8 w-20 bg-muted" /> : (
                <p className="text-2xl font-bold text-foreground">{stats.skusInStock}</p>
              )}
            </div>
          </GlowCard>
          <GlowCard>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Boxes className="h-4 w-4 text-green-500" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  {isProjected ? "Disponible proyectado" : "Bultos en bodega"}
                </span>
              </div>
              {(isLoading || projectionLoading) ? <Skeleton className="h-8 w-20 bg-muted" /> : (
                <p className="text-2xl font-bold text-foreground">
                  {isProjected
                    ? stats.totalDisponible.toLocaleString()
                    : stats.totalBultos.toLocaleString()}
                </p>
              )}
            </div>
          </GlowCard>
          <GlowCard>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  {isProjected ? "Pedidos del día" : "Comprometido"}
                </span>
              </div>
              {(isLoading || projectionLoading) ? <Skeleton className="h-8 w-20 bg-muted" /> : (
                <p className="text-2xl font-bold text-amber-400">{stats.totalCommitted.toLocaleString()}</p>
              )}
            </div>
          </GlowCard>
          <GlowCard>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-4 w-4 text-green-500" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Valor inventario</span>
              </div>
              {(isLoading || projectionLoading) ? <Skeleton className="h-8 w-20 bg-muted" /> : (
                <p className="text-2xl font-bold text-foreground">{fmtMXN(stats.totalValue)}</p>
              )}
            </div>
          </GlowCard>
        </div>

        {/* Filters */}
        <GlowCard>
          <div className="p-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por SKU, producto o marca..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-background"
              />
            </div>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="w-full sm:w-[180px] bg-background">
                <SelectValue placeholder="Proveedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los proveedores</SelectItem>
                {suppliers.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={stockFilter} onValueChange={(v) => setStockFilter(v as StockFilter)}>
              <SelectTrigger className="w-full sm:w-[180px] bg-background">
                <SelectValue placeholder="Estado de stock" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="disponible">Disponible</SelectItem>
                <SelectItem value="low_stock">Stock ajustado</SelectItem>
                <SelectItem value="committed">Con comprometido</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">{items.length} productos</span>
          </div>
        </GlowCard>

        {/* Mobile Card View */}
        <div className="space-y-3 md:hidden">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <GlowCard key={i}>
                <div className="p-4 space-y-3">
                  <Skeleton className="h-5 w-3/4 bg-muted" />
                  <Skeleton className="h-4 w-1/2 bg-muted" />
                  <div className="grid grid-cols-2 gap-2">
                    <Skeleton className="h-10 bg-muted" />
                    <Skeleton className="h-10 bg-muted" />
                    <Skeleton className="h-10 bg-muted" />
                    <Skeleton className="h-10 bg-muted" />
                  </div>
                </div>
              </GlowCard>
            ))
          ) : items.length === 0 ? (
            <GlowCard>
              <div className="text-center py-12 text-muted-foreground">Sin resultados</div>
            </GlowCard>
          ) : (
            items.map((item) => {
              const disponible = item.stock_disponible;
              const valor = item.stock_actual * item.cost_with_iva;
              const isTight = item.stock_committed > 0 && item.stock_actual <= item.stock_committed;
              const damagedCount = damagedByProduct[item.id] ?? 0;

              return (
                <GlowCard key={item.id}>
                  <div className={cn("p-4 space-y-3 rounded-lg", isTight && "bg-amber-500/5")}>
                    <div className="flex items-start gap-3">
                      <ProductThumb src={item.image_url} size="md" />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-medium text-primary">{item.clave}</span>
                            {damagedCount > 0 && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-500/15 text-orange-500 border border-orange-500/30">
                                <AlertOctagon className="h-2.5 w-2.5" />
                                {damagedCount} {damagedCount === 1 ? "dañado" : "dañados"}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">{item.supplier}</span>
                        </div>
                        <div className="text-sm text-foreground">{item.name}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-muted/50 rounded-md px-3 py-2">
                        <div className="text-[11px] text-muted-foreground">Stock actual</div>
                        <div className="text-sm font-semibold tabular-nums text-foreground">
                          {item.stock_actual.toLocaleString()}
                        </div>
                      </div>
                      <div className="bg-muted/50 rounded-md px-3 py-2">
                        <div className="text-[11px] text-muted-foreground">
                          {isProjected ? "Pedidos del día" : "Comprometido"}
                        </div>
                        <div className={cn(
                          "text-sm tabular-nums",
                          item.stock_committed > 0 ? "text-amber-400 font-medium" : "text-muted-foreground"
                        )}>
                          {item.stock_committed > 0 ? item.stock_committed.toLocaleString() : "—"}
                        </div>
                      </div>
                      <div className="bg-muted/50 rounded-md px-3 py-2">
                        <div className="text-[11px] text-muted-foreground">
                          {isProjected ? "Disponible proyectado" : "Disponible"}
                        </div>
                        <div className={cn(
                          "text-sm font-semibold tabular-nums",
                          disponible <= 0 ? "text-red-500" : disponible === 0 ? "text-muted-foreground" : "text-green-500"
                        )}>
                          {disponible.toLocaleString()}
                        </div>
                      </div>
                      <div className="bg-muted/50 rounded-md px-3 py-2">
                        <div className="text-[11px] text-muted-foreground">
                          {isProjected ? "Llegando al día" : "En camino"}
                        </div>
                        <div className={cn(
                          "text-sm tabular-nums",
                          item.stock_incoming > 0 ? "text-blue-400 font-medium" : "text-muted-foreground"
                        )}>
                          {item.stock_incoming > 0 ? item.stock_incoming.toLocaleString() : "—"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-border">
                      <span className="text-xs text-muted-foreground">Valor</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm tabular-nums text-foreground">
                          {valor > 0 ? fmtMXN(valor) : "—"}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                              title="Acciones"
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setAdjustProduct({
                                id: item.id, clave: item.clave, name: item.name,
                                image_url: item.image_url, stock_actual: item.stock_actual,
                                stock_disponible: item.stock_disponible,
                              })}
                            >
                              <SlidersHorizontal className="h-4 w-4 mr-2" />
                              Ajustar inventario
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={item.stock_actual <= 0}
                              onClick={() => setDamagedProduct({
                                id: item.id, clave: item.clave, name: item.name,
                                image_url: item.image_url, stock_actual: item.stock_actual,
                                cost_with_iva: item.cost_with_iva,
                                cost_without_iva: item.cost_without_iva,
                                bonificacion_pct: item.bonificacion_pct,
                                sale_price_with_iva: item.sale_price_with_iva,
                              })}
                              className="text-orange-500 focus:text-orange-500"
                            >
                              <AlertOctagon className="h-4 w-4 mr-2" />
                              Marcar como dañado
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                </GlowCard>
              );
            })
          )}
        </div>

        {/* Table */}
        <div className="hidden md:block">
        <GlowCard>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="w-[100px] cursor-pointer select-none" onClick={() => toggleSort("clave")}>
                    <div className="flex items-center gap-1">SKU <SortIcon col="clave" /></div>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("name")}>
                    <div className="flex items-center gap-1">Producto <SortIcon col="name" /></div>
                  </TableHead>
                  <TableHead className="w-[120px] cursor-pointer select-none hidden md:table-cell" onClick={() => toggleSort("supplier")}>
                    <div className="flex items-center gap-1">Proveedor <SortIcon col="supplier" /></div>
                  </TableHead>
                  <TableHead className="text-right cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort("stock_actual")}>
                    <div className="flex items-center justify-end gap-1">{isProjected ? "Stock proy." : "Stock"} <SortIcon col="stock_actual" /></div>
                  </TableHead>
                  <TableHead className="text-right cursor-pointer select-none hidden lg:table-cell whitespace-nowrap" onClick={() => toggleSort("stock_committed")}>
                    <div className="flex items-center justify-end gap-1">
                      {isProjected ? "Pedidos del día" : "Comprometido"} <SortIcon col="stock_committed" />
                    </div>
                  </TableHead>
                  <TableHead className="text-right cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort("disponible")}>
                    <div className="flex items-center justify-end gap-1">Disponible <SortIcon col="disponible" /></div>
                  </TableHead>
                  <TableHead className="text-right cursor-pointer select-none hidden md:table-cell whitespace-nowrap" onClick={() => toggleSort("stock_incoming")}>
                    <div className="flex items-center justify-end gap-1">
                      {isProjected ? "Llegando" : "En camino"} <SortIcon col="stock_incoming" />
                    </div>
                  </TableHead>
                  <TableHead className="text-right cursor-pointer select-none hidden lg:table-cell whitespace-nowrap" onClick={() => toggleSort("valor")}>
                    <div className="flex items-center justify-end gap-1">Valor <SortIcon col="valor" /></div>
                  </TableHead>
                  <TableHead className="w-[44px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i} className="border-border">
                      {Array.from({ length: 9 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-5 w-full bg-muted" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                      Sin resultados
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => {
                    const disponible = item.stock_disponible;
                    const valor = item.stock_actual * item.cost_with_iva;
                    const isTight = item.stock_committed > 0 && item.stock_actual <= item.stock_committed;
                    const damagedCount = damagedByProduct[item.id] ?? 0;

                    return (
                      <TableRow
                        key={item.id}
                        className={cn(
                          "border-border transition-colors",
                          isTight && "bg-amber-500/5"
                        )}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setDrawerId(item.id)}>
                            <ProductThumb src={item.image_url} size="sm" />
                            <div className="flex flex-col">
                              <span className="font-mono text-sm font-medium text-primary hover:underline">{item.clave}</span>
                              {damagedCount > 0 && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-orange-500" title={`${damagedCount} bultos dañados disponibles`}>
                                  <AlertOctagon className="h-2.5 w-2.5" />
                                  {damagedCount} {damagedCount === 1 ? "dañado" : "dañados"}
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-foreground text-sm">{item.name}</span>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm hidden md:table-cell max-w-[120px] truncate">{item.supplier}</TableCell>
                        <TableCell className="text-right">
                          <span className="text-sm font-semibold tabular-nums text-foreground">
                            {item.stock_actual.toLocaleString()}
                          </span>
                        </TableCell>
                        <TableCell className="text-right hidden lg:table-cell">
                          <span className={cn(
                            "text-sm tabular-nums",
                            item.stock_committed > 0 ? "text-amber-400 font-medium" : "text-muted-foreground"
                          )}>
                            {item.stock_committed > 0 ? item.stock_committed.toLocaleString() : "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={cn(
                            "text-sm font-semibold tabular-nums",
                            disponible < 0 ? "text-red-500" : disponible === 0 ? "text-muted-foreground" : "text-green-500"
                          )}>
                            {disponible.toLocaleString()}
                          </span>
                        </TableCell>
                        <TableCell className="text-right hidden md:table-cell">
                          <span className={cn(
                            "text-sm tabular-nums",
                            item.stock_incoming > 0 ? "text-blue-400 font-medium" : "text-muted-foreground"
                          )}>
                            {item.stock_incoming > 0 ? item.stock_incoming.toLocaleString() : "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right hidden lg:table-cell">
                          <span className="text-sm tabular-nums text-foreground">
                            {valor > 0 ? fmtMXN(valor) : "—"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                title="Acciones"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => setAdjustProduct({
                                  id: item.id, clave: item.clave, name: item.name,
                                  image_url: item.image_url, stock_actual: item.stock_actual,
                                  stock_disponible: item.stock_disponible,
                                })}
                              >
                                <SlidersHorizontal className="h-4 w-4 mr-2" />
                                Ajustar inventario
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={item.stock_actual <= 0}
                                onClick={() => setDamagedProduct({
                                  id: item.id, clave: item.clave, name: item.name,
                                  image_url: item.image_url, stock_actual: item.stock_actual,
                                  cost_with_iva: item.cost_with_iva,
                                  cost_without_iva: item.cost_without_iva,
                                  bonificacion_pct: item.bonificacion_pct,
                                  sale_price_with_iva: item.sale_price_with_iva,
                                })}
                                className="text-orange-500 focus:text-orange-500"
                              >
                                <AlertOctagon className="h-4 w-4 mr-2" />
                                Marcar como dañado
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </GlowCard>
        </div>

        {/* Stock Adjustment Dialog */}
        <StockAdjustmentDialog
          open={!!adjustProduct}
          onOpenChange={(open) => { if (!open) setAdjustProduct(null); }}
          product={adjustProduct}
        />

        {/* Mark as Damaged Dialog */}
        <MarkAsDamagedDialog
          open={!!damagedProduct}
          onOpenChange={(open) => { if (!open) setDamagedProduct(null); }}
          product={damagedProduct}
        />

        <Product360Drawer
          productId={drawerId}
          open={!!drawerId}
          onOpenChange={(o) => !o && setDrawerId(null)}
        />
      </div>
    </div>
  );
}
