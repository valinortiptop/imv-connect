// @ts-nocheck
import React, { useState, useMemo, useRef } from "react";
import { useNavigate } from "@/lib/router-compat";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GlowCard } from "@/components/ui/spotlight-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/orders/StatusBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle, Package, Search, ChevronDown, ChevronRight,
  ShoppingCart, Truck, DollarSign, CalendarIcon, ExternalLink, Info, Download, FileSpreadsheet
} from "lucide-react";
import { format } from "date-fns";
import { parseLocalDate } from "@/lib/date-utils";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx-js-style";
import { toast } from "sonner";
import { PurchaseOrderDialog } from "@/components/PurchaseOrderDialog";
import { SuppliersImportDialog } from "@/components/SuppliersImportDialog";
import { ProductThumb } from "@/components/ui/product-thumb";
import { cn } from "@/lib/utils";

const mxnFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const fmtMXN = (v: number | null) => v == null ? "$0" : mxnFmt.format(v);
const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try { return format(parseLocalDate(d), "dd/MM/yy"); } catch { return d; }
};

interface OrderLine {
  // 'order' for confirmed pedidos; 'quote' for open cotizaciones (only
  // returned by v_purchase_by_order_with_quotes when the toggle is on).
  source_type?: "order" | "quote";
  order_id: string;
  order_code: string;
  status: string;
  delivery_date: string | null;
  client_name: string;
  product_id: string;
  clave: string;
  product_name: string;
  supplier: string;
  bultos_pedido: number;
  stock_fisico: number;
  total_committed_all_orders: number;
  units_incoming: number;
  product_units_short: number;
  cost_with_iva: number;
  shared_orders_count: number;
  next_incoming_date: string | null;
  next_incoming_qty: number | null;
}

interface OrderGroup {
  source_type: "order" | "quote";
  order_id: string;
  order_code: string;
  status: string;
  delivery_date: string | null;
  client_name: string;
  lines: OrderLine[];
  skusAtRisk: number;
  totalBultosShort: number;
  totalEstimatedCost: number;
  hasRisk: boolean;
}

export default function PurchaseNeeds() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [dayFilter, setDayFilter] = useState<string | "all">("all");
  const purchaseImageRef = useRef<HTMLDivElement>(null);
  // When true, the per-product impact of open cotizaciones is appended
  // to each order line as an annotation ("+N en cotizaciones").
  const [includeQuotes, setIncludeQuotes] = useState(false);

  // Switch view based on the toggle. The "with quotes" view folds open
  // cotizaciones into the same FIFO-by-delivery_date allocation as pedidos.
  const { data: viewLines = [], isLoading } = useQuery({
    queryKey: ["purchase-by-order", includeQuotes ? "with-quotes" : "orders-only"],
    queryFn: async () => {
      const view = includeQuotes ? "v_purchase_by_order_with_quotes" : "v_purchase_by_order";
      const { data, error } = await (supabase as any).from(view).select("*");
      if (error) throw error;
      return (data ?? []) as OrderLine[];
    },
  });

  const { data: productWeights = {} } = useQuery({
    queryKey: ["products-weights"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("clave, weight_kg");
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const p of data ?? []) {
        if (p.clave) map[p.clave] = Number(p.weight_kg) || 0;
      }
      return map;
    },
  });

  const { data: allProducts = [] } = useQuery({
    queryKey: ["products-for-po"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("clave, name, supplier, image_url")
        .eq("active", true)
        .order("clave");
      if (error) throw error;
      return (data ?? []).map(p => ({
        clave: p.clave,
        product_name: p.name,
        supplier: p.supplier ?? "",
        image_url: p.image_url ?? null,
      }));
    },
  });

  // Lookup: clave → image_url. Used by the at-risk rows so each
  // expanded line shows its thumbnail next to the product name.
  const imageByClave = useMemo(() => {
    const m: Record<string, string | null> = {};
    for (const p of allProducts) m[p.clave] = p.image_url ?? null;
    return m;
  }, [allProducts]);

  const [poOpen, setPoOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // The view (v_purchase_by_order) now does the chronological burn-down server-side,
  // accounting for incoming Programado entradas per delivery_date. Trust it as-is.
  const rawLines = viewLines;

  // Group by source (order or quote). When the toggle is on, quote groups
  // appear alongside pedido groups in the same list.
  const orderGroups = useMemo(() => {
    const map = new Map<string, OrderGroup>();
    for (const line of rawLines) {
      let group = map.get(line.order_id);
      if (!group) {
        group = {
          source_type: line.source_type ?? "order",
          order_id: line.order_id,
          order_code: line.order_code,
          status: line.status,
          delivery_date: line.delivery_date,
          client_name: line.client_name,
          lines: [],
          skusAtRisk: 0,
          totalBultosShort: 0,
          totalEstimatedCost: 0,
          hasRisk: false,
        };
        map.set(line.order_id, group);
      }
      group.lines.push(line);
      if (line.product_units_short > 0) {
        group.skusAtRisk++;
        group.totalBultosShort += line.product_units_short;
        group.totalEstimatedCost += line.product_units_short * line.cost_with_iva;
        group.hasRisk = true;
      }
    }
    return Array.from(map.values());
  }, [rawLines]);

  // Small badge next to "Incluir cotizaciones": how many cotización groups
  // and how many bultos they add, derived from the view rows themselves.
  const quoteSummary = useMemo(() => {
    if (!includeQuotes) return { count: 0, bultos: 0 };
    const ids = new Set<string>();
    let bultos = 0;
    for (const g of orderGroups) {
      if (g.source_type === "quote") {
        ids.add(g.order_id);
        for (const l of g.lines) bultos += l.bultos_pedido;
      }
    }
    return { count: ids.size, bultos };
  }, [orderGroups, includeQuotes]);

  // Suppliers for filter
  const suppliers = useMemo(() => {
    const set = new Set(rawLines.map(r => r.supplier).filter(Boolean));
    return Array.from(set).sort();
  }, [rawLines]);

  // Filter
  const filtered = useMemo(() => {
    let result = orderGroups;
    if (supplierFilter !== "all") {
      result = result.filter(g => g.lines.some(l => l.supplier === supplierFilter));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(g =>
        g.order_code.toLowerCase().includes(q) ||
        g.client_name?.toLowerCase().includes(q) ||
        g.lines.some(l => l.clave.toLowerCase().includes(q) || l.product_name.toLowerCase().includes(q))
      );
    }
    if (dayFilter !== "all") {
      result = result.filter(g => g.delivery_date === dayFilter);
    }
    // Sort by earliest delivery_date ascending (nulls last)
    result = [...result].sort((a, b) => {
      if (!a.delivery_date && !b.delivery_date) return 0;
      if (!a.delivery_date) return 1;
      if (!b.delivery_date) return -1;
      return a.delivery_date.localeCompare(b.delivery_date);
    });
    return result;
  }, [orderGroups, supplierFilter, search, dayFilter]);

  const sortByDateAsc = (arr: OrderGroup[]) =>
    [...arr].sort((a, b) => {
      if (!a.delivery_date && !b.delivery_date) return 0;
      if (!a.delivery_date) return 1;
      if (!b.delivery_date) return -1;
      return a.delivery_date.localeCompare(b.delivery_date);
    });
  const atRisk = sortByDateAsc(filtered.filter(g => g.hasRisk));
  const covered = sortByDateAsc(filtered.filter(g => !g.hasRisk));

  // Per-day aggregates (for day chips). Only days with at least one at-risk order.
  const deliveryDays = useMemo(() => {
    // Start from the search/supplier-filtered set (but NOT day-filtered) so chips
    // always reflect all available days matching the current search/supplier.
    let base = orderGroups;
    if (supplierFilter !== "all") {
      base = base.filter(g => g.lines.some(l => l.supplier === supplierFilter));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      base = base.filter(g =>
        g.order_code.toLowerCase().includes(q) ||
        g.client_name?.toLowerCase().includes(q) ||
        g.lines.some(l => l.clave.toLowerCase().includes(q) || l.product_name.toLowerCase().includes(q))
      );
    }
    const map = new Map<string, { date: string; orders: number; atRiskOrders: number; bultosShort: number; cost: number }>();
    for (const g of base) {
      if (!g.delivery_date) continue;
      const cur = map.get(g.delivery_date) ?? { date: g.delivery_date, orders: 0, atRiskOrders: 0, bultosShort: 0, cost: 0 };
      cur.orders += 1;
      if (g.hasRisk) cur.atRiskOrders += 1;
      cur.bultosShort += g.totalBultosShort;
      cur.cost += g.totalEstimatedCost;
      map.set(g.delivery_date, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [orderGroups, supplierFilter, search]);

  const selectedDayAgg = useMemo(
    () => dayFilter === "all" ? null : deliveryDays.find(d => d.date === dayFilter) ?? null,
    [deliveryDays, dayFilter]
  );

  // Stats
  const stats = useMemo(() => {
    const pedidosRiesgo = orderGroups.filter(g => g.hasRisk).length;
    const skusFaltante = new Set(
      rawLines.filter(l => l.product_units_short > 0).map(l => l.clave)
    ).size;
    const totalBultos = orderGroups.reduce((s, g) => s + g.totalBultosShort, 0);
    const totalCost = orderGroups.reduce((s, g) => s + g.totalEstimatedCost, 0);
    return { pedidosRiesgo, skusFaltante, totalBultos, totalCost };
  }, [orderGroups, rawLines]);

  const toggleOrder = (orderId: string) => {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  // Rows for PDF export: aggregated per SKU, sorted by earliest delivery date ascending.
  // When a day filter is active, only lines for that delivery date are included.
  const shortageRows = useMemo(() => {
    const bySku = new Map<string, { delivery_date: string | null; clave: string; product_name: string; bultos: number; tons: number }>();
    for (const l of rawLines) {
      if (l.product_units_short <= 0) continue;
      if (dayFilter !== "all" && l.delivery_date !== dayFilter) continue;
      const existing = bySku.get(l.clave);
      const kg = productWeights[l.clave] ?? 0;
      if (existing) {
        existing.bultos += l.product_units_short;
        existing.tons = (existing.bultos * kg) / 1000;
        if (l.delivery_date && (!existing.delivery_date || l.delivery_date < existing.delivery_date)) {
          existing.delivery_date = l.delivery_date;
        }
      } else {
        bySku.set(l.clave, {
          delivery_date: l.delivery_date,
          clave: l.clave,
          product_name: l.product_name,
          bultos: l.product_units_short,
          tons: (l.product_units_short * kg) / 1000,
        });
      }
    }
    return Array.from(bySku.values()).sort((a, b) => {
      if (!a.delivery_date && !b.delivery_date) return 0;
      if (!a.delivery_date) return 1;
      if (!b.delivery_date) return -1;
      return a.delivery_date.localeCompare(b.delivery_date);
    });
  }, [rawLines, productWeights, dayFilter]);

  async function handleDownloadImage() {
    const node = purchaseImageRef.current;
    if (!node) { toast("Error al generar imagen"); return; }
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const isDark = document.documentElement.classList.contains("dark");
      const bg = isDark ? "#020817" : "#ffffff";
      const height = node.scrollHeight || 900;
      const canvas = await html2canvas(node, {
        backgroundColor: bg, scale: 2, useCORS: true,
        allowTaint: true, logging: false,
        width: 1200, height, windowWidth: 1200, windowHeight: height,
      });
      const dataUrl = canvas.toDataURL("image/png");
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, "0");
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const yy = String(now.getFullYear()).slice(-2);
      const link = document.createElement("a");
      const daySuffix = dayFilter !== "all"
        ? ` Entrega ${dayFilter.split("-").reverse().join("-")}`
        : "";
      link.download = `Necesidades de Compra${daySuffix} ${dd}-${mm}-${yy}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error(err);
      toast("Error al generar imagen");
    }
  }

  function handleDownloadExcel() {
    if (shortageRows.length === 0) { toast("Sin datos para exportar"); return; }
    try {
      const rows = shortageRows.map((r, i) => ({
        "#": i + 1,
        "Entrega": r.delivery_date ? r.delivery_date.split("-").reverse().join("/") : "—",
        "Clave": r.clave,
        "Producto": r.product_name,
        "Bultos faltantes": r.bultos,
        "Toneladas": Number(r.tons.toFixed(2)),
      }));
      const totalBultos = shortageRows.reduce((s, r) => s + r.bultos, 0);
      const totalTons = shortageRows.reduce((s, r) => s + r.tons, 0);
      rows.push({
        "#": "" as any, "Entrega": "", "Clave": "", "Producto": "TOTAL",
        "Bultos faltantes": totalBultos, "Toneladas": Number(totalTons.toFixed(2)),
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [{ wch: 4 }, { wch: 12 }, { wch: 14 }, { wch: 50 }, { wch: 16 }, { wch: 12 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Necesidades");
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, "0");
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const yy = String(now.getFullYear()).slice(-2);
      const daySuffix = dayFilter !== "all"
        ? ` Entrega ${dayFilter.split("-").reverse().join("-")}`
        : "";
      XLSX.writeFile(wb, `Necesidades de Compra${daySuffix} ${dd}-${mm}-${yy}.xlsx`);
    } catch (err) {
      console.error(err);
      toast("Error al generar Excel");
    }
  }

  const isOverdue = (dateStr: string | null) => {
    if (!dateStr) return false;
    return parseLocalDate(dateStr) <= new Date();
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Compras</h1>
          <p className="text-sm text-muted-foreground">
            Vista por pedido — stock disponible vs comprometido
          </p>
        </div>
        <div className="flex gap-3 items-center flex-wrap">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeQuotes}
              onChange={(e) => setIncludeQuotes(e.target.checked)}
              className="h-4 w-4"
            />
            Incluir cotizaciones
          </label>
          <Button
            size="sm"
            onClick={() => setPoOpen(true)}
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            Nueva Orden de Compra
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="h-4 w-4 mr-2" />
            Importar proveedores
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadExcel}
            disabled={shortageRows.length === 0}
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadImage}
            disabled={shortageRows.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Descargar PDF
          </Button>
        </div>
      </div>

      {importOpen && (
        <SuppliersImportDialog
          onClose={() => setImportOpen(false)}
          onSaved={() => setImportOpen(false)}
        />
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <GlowCard>
          <div className="p-4 border-l-4 border-red-500 rounded-l">
            <div className="flex items-center gap-2 mb-2">
              <ShoppingCart className="h-4 w-4 text-red-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pedidos en riesgo</span>
            </div>
            {isLoading ? <Skeleton className="h-8 w-16 bg-muted" /> : (
              <p className="text-2xl font-bold text-foreground">{stats.pedidosRiesgo}</p>
            )}
          </div>
        </GlowCard>

        <GlowCard>
          <div className="p-4 border-l-4 border-amber-500 rounded-l">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">SKUs con faltante</span>
            </div>
            {isLoading ? <Skeleton className="h-8 w-16 bg-muted" /> : (
              <p className="text-2xl font-bold text-foreground">{stats.skusFaltante}</p>
            )}
          </div>
        </GlowCard>

        <GlowCard>
          <div className="p-4 border-l-4 border-orange-500 rounded-l">
            <div className="flex items-center gap-2 mb-2">
              <Package className="h-4 w-4 text-orange-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bultos a comprar</span>
            </div>
            {isLoading ? <Skeleton className="h-8 w-16 bg-muted" /> : (
              <p className="text-2xl font-bold text-foreground">{stats.totalBultos.toLocaleString()}</p>
            )}
          </div>
        </GlowCard>

        <GlowCard>
          <div className="p-4 border-l-4 border-green-500 rounded-l">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-green-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Inversión estimada</span>
            </div>
            {isLoading ? <Skeleton className="h-8 w-16 bg-muted" /> : (
              <p className="text-2xl font-bold text-foreground">{fmtMXN(stats.totalCost)}</p>
            )}
          </div>
        </GlowCard>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar pedido, cliente o producto..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Proveedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los proveedores</SelectItem>
            {suppliers.map(s => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Delivery day selector */}
      {deliveryDays.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">Filtrar por día de entrega</h3>
            {selectedDayAgg && (
              <div className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{selectedDayAgg.bultosShort.toLocaleString()}</span> bultos faltantes
                {" · "}
                <span className="font-semibold text-foreground">{fmtMXN(selectedDayAgg.cost)}</span>
                {" · "}
                {selectedDayAgg.atRiskOrders}/{selectedDayAgg.orders} pedido{selectedDayAgg.orders !== 1 ? "s" : ""} en riesgo
              </div>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            <button
              onClick={() => setDayFilter("all")}
              className={`shrink-0 px-3 py-2 rounded-lg text-xs font-medium border whitespace-nowrap transition-colors ${
                dayFilter === "all"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              Todos los días
            </button>
            {deliveryDays.map(d => {
              const isActive = dayFilter === d.date;
              const hasRisk = d.atRiskOrders > 0;
              return (
                <button
                  key={d.date}
                  onClick={() => setDayFilter(isActive ? "all" : d.date)}
                  className={`shrink-0 px-3 py-2 rounded-lg text-xs font-medium border whitespace-nowrap transition-colors text-left ${
                    isActive
                      ? "bg-primary text-primary-foreground border-primary"
                      : hasRisk
                        ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900 hover:bg-red-100"
                        : "bg-card text-muted-foreground border-border hover:text-foreground"
                  }`}
                >
                  <div className="font-semibold">{fmtDate(d.date)}</div>
                  <div className={`text-[10px] ${isActive ? "opacity-90" : "opacity-70"}`}>
                    {d.bultosShort.toLocaleString()} bultos · {d.orders} ped.
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Orders at risk */}
      {atRisk.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <h2 className="text-lg font-semibold text-foreground">Pedidos en riesgo ({atRisk.length})</h2>
            {includeQuotes && quoteSummary.count > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-500 border border-amber-500/30 tabular-nums">
                +{quoteSummary.bultos} bultos · {quoteSummary.count} {quoteSummary.count === 1 ? "cotización" : "cotizaciones"}
              </span>
            )}
          </div>
          <GlowCard>
            <div className="p-1 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="w-8" />
                    <TableHead className="w-[100px] text-foreground font-semibold">Pedido</TableHead>
                    <TableHead className="w-[200px] text-foreground font-semibold">Cliente</TableHead>
                    <TableHead className="w-[130px] text-foreground font-semibold">Fecha entrega</TableHead>
                    <TableHead className="w-[100px] text-foreground font-semibold">Estado</TableHead>
                    <TableHead className="w-[120px] text-foreground font-semibold text-center">SKUs en riesgo</TableHead>
                    <TableHead className="w-[130px] text-foreground font-semibold text-right">Bultos faltantes</TableHead>
                    <TableHead className="w-[110px] text-foreground font-semibold text-right">Costo est.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {atRisk.map(group => (
                    <OrderRow
                      key={group.order_id}
                      group={group}
                      expanded={expandedOrders.has(group.order_id)}
                      onToggle={() => toggleOrder(group.order_id)}
                      onNavigate={navigate}
                      isOverdue={isOverdue}
                      supplierFilter={supplierFilter}
                      imageByClave={imageByClave}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </GlowCard>
        </div>
      )}

      {/* Covered orders */}
      {covered.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Package className="h-4 w-4 text-green-500" />
            <h2 className="text-lg font-semibold text-foreground">Pedidos cubiertos ({covered.length})</h2>
            {includeQuotes && quoteSummary.count > 0 && atRisk.length === 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-500 border border-amber-500/30 tabular-nums">
                +{quoteSummary.bultos} bultos · {quoteSummary.count} {quoteSummary.count === 1 ? "cotización" : "cotizaciones"}
              </span>
            )}
          </div>
          <GlowCard>
            <div className="p-1 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="w-8" />
                    <TableHead className="w-[100px] text-foreground font-semibold">Pedido</TableHead>
                    <TableHead className="w-[200px] text-foreground font-semibold">Cliente</TableHead>
                    <TableHead className="w-[130px] text-foreground font-semibold">Fecha entrega</TableHead>
                    <TableHead className="w-[100px] text-foreground font-semibold">Estado</TableHead>
                    <TableHead className="w-[120px] text-foreground font-semibold text-center">SKUs</TableHead>
                    <TableHead className="w-[130px] text-foreground font-semibold text-right">Bultos total</TableHead>
                    <TableHead className="w-[110px] text-foreground font-semibold text-right">Costo est.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {covered.map(group => (
                    <CoveredOrderRow
                      key={group.order_id}
                      group={group}
                      expanded={expandedOrders.has(group.order_id)}
                      onToggle={() => toggleOrder(group.order_id)}
                      onNavigate={navigate}
                      supplierFilter={supplierFilter}
                      imageByClave={imageByClave}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </GlowCard>
        </div>
      )}

      {/* Empty */}
      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16">
          <Package className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No hay pedidos abiertos</p>
        </div>
      )}

      {/* Offscreen PurchaseImageCard for export */}
      <PurchaseImageCard ref={purchaseImageRef} rows={shortageRows} selectedDay={dayFilter === "all" ? null : dayFilter} />

      {/* Purchase Order dialog */}
      <PurchaseOrderDialog
        open={poOpen}
        onOpenChange={setPoOpen}
        rawLines={rawLines}
        suppliers={suppliers}
        productWeights={productWeights}
        allProducts={allProducts}
        dayFilter={dayFilter}
      />
    </div>
  );
}

/* ── PurchaseImageCard (offscreen, for image export) ── */

type PurchaseImageRow = {
  delivery_date: string | null;
  clave: string;
  product_name: string;
  bultos: number;
  tons: number;
};

type PurchaseImageCardProps = {
  rows: PurchaseImageRow[];
  selectedDay?: string | null;
};

const PurchaseImageCard = React.forwardRef<HTMLDivElement, PurchaseImageCardProps>(
  ({ rows, selectedDay }, ref) => {
    const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

    const bg = isDark ? "#020817" : "#ffffff";
    const fg = isDark ? "#f8fafc" : "#020817";
    const muted = isDark ? "#94a3b8" : "#64748b";
    const accent = "#1e293b";
    const separatorColor = isDark ? "rgba(248,250,252,0.10)" : "rgba(2,8,23,0.10)";

    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;

    const tnum: React.CSSProperties = {
      fontVariantNumeric: "tabular-nums",
      fontFeatureSettings: '"tnum" 1, "lnum" 1',
    };

    const fmtRowDate = (d: string | null) => {
      if (!d) return "—";
      try {
        const parsed = parseLocalDate(d);
        return format(parsed, "dd/MM/yy");
      } catch {
        return d;
      }
    };

    const totalBultos = rows.reduce((s, r) => s + r.bultos, 0);
    const totalTons = rows.reduce((s, r) => s + r.tons, 0);
    const fmtTons = (t: number) => t.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const gridCols = "140px 130px minmax(0, 1fr) 120px 120px";

    return (
      <div
        ref={ref}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          transform: "translateX(-200vw)",
          pointerEvents: "none",
          zIndex: 0,
          width: 1200,
          minHeight: 900,
          backgroundColor: bg,
          color: fg,
          fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
          padding: 56,
          boxSizing: "border-box",
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.02em" }}>
            Necesidades de Compra
          </div>
          {selectedDay ? (
            <div style={{ fontSize: 20, color: fg, marginTop: 6, fontWeight: 600 }}>
              Entrega: {(() => { try { return format(parseLocalDate(selectedDay), "dd/MM/yyyy"); } catch { return selectedDay; } })()}
              <span style={{ fontSize: 16, color: muted, fontWeight: 400, marginLeft: 12 }}>· Generado {dateStr}</span>
            </div>
          ) : (
            <div style={{ fontSize: 18, color: muted, marginTop: 6 }}>{dateStr}</div>
          )}
        </div>

        <div style={{ height: 3, background: accent, borderRadius: 2, marginBottom: 28 }} />

        {/* Summary */}
        <div style={{ display: "flex", gap: 48, marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 13, color: muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>SKUs con faltante</div>
            <div style={{ fontSize: 32, fontWeight: 700, ...tnum }}>{rows.length}</div>
          </div>
          <div>
            <div style={{ fontSize: 13, color: muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Bultos a comprar</div>
            <div style={{ fontSize: 32, fontWeight: 700, ...tnum }}>{totalBultos.toLocaleString("es-MX")}</div>
          </div>
        </div>

        {/* Table header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: gridCols,
          columnGap: 20,
          fontSize: 13,
          color: muted,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          paddingBottom: 10,
          borderBottom: `1px solid ${separatorColor}`,
        }}>
          <div>Fecha entrega</div>
          <div>SKU</div>
          <div>Producto</div>
          <div style={{ textAlign: "right" }}>Bultos</div>
          <div style={{ textAlign: "right" }}>Toneladas</div>
        </div>

        {/* Rows */}
        {rows.map((r, i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: gridCols,
              columnGap: 20,
              fontSize: 15,
              paddingTop: 10,
              paddingBottom: 10,
              borderBottom: `1px solid ${separatorColor}`,
              alignItems: "center",
            }}
          >
            <div style={tnum}>{fmtRowDate(r.delivery_date)}</div>
            <div style={{ fontFamily: "'SF Mono', Menlo, monospace", fontWeight: 600 }}>{r.clave}</div>
            <div style={{ wordBreak: "break-word", lineHeight: 1.3 }}>{r.product_name || "—"}</div>
            <div style={{ textAlign: "right", fontWeight: 600, ...tnum }}>{r.bultos.toLocaleString("es-MX")}</div>
            <div style={{ textAlign: "right", fontWeight: 600, ...tnum }}>{fmtTons(r.tons)}</div>
          </div>
        ))}

        {rows.length > 0 && (
          <div style={{
            display: "grid",
            gridTemplateColumns: gridCols,
            columnGap: 20,
            fontSize: 16,
            paddingTop: 14,
            paddingBottom: 10,
            marginTop: 4,
            borderTop: `2px solid ${separatorColor}`,
            fontWeight: 700,
          }}>
            <div />
            <div />
            <div style={{ textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 13, color: muted }}>Total</div>
            <div style={{ textAlign: "right", ...tnum }}>{totalBultos.toLocaleString("es-MX")}</div>
            <div style={{ textAlign: "right", ...tnum }}>{fmtTons(totalTons)}</div>
          </div>
        )}

        {rows.length === 0 && (
          <div style={{ fontSize: 18, color: muted, marginTop: 24, fontStyle: "italic" }}>
            Sin faltantes
          </div>
        )}
      </div>
    );
  }
);
PurchaseImageCard.displayName = "PurchaseImageCard";

/* ── Order row (at risk) ── */
function OrderRow({
  group, expanded, onToggle, onNavigate, isOverdue, supplierFilter, imageByClave,
}: {
  group: OrderGroup;
  expanded: boolean;
  onToggle: () => void;
  onNavigate: (path: string) => void;
  isOverdue: (d: string | null) => boolean;
  supplierFilter: string;
  imageByClave: Record<string, string | null>;
}) {
  const overdue = isOverdue(group.delivery_date);
  const lines = supplierFilter === "all"
    ? group.lines
    : group.lines.filter(l => l.supplier === supplierFilter);

  return (
    <>
      <TableRow
        className={`border-border hover:bg-muted/50 transition-colors cursor-pointer ${group.source_type === "quote" ? "bg-amber-500/5" : ""}`}
        onClick={onToggle}
      >
        <TableCell className="w-8 px-2">
          {expanded
            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </TableCell>
        <TableCell>
          <span
            className={`font-mono font-medium hover:underline cursor-pointer ${group.source_type === "quote" ? "text-amber-400" : "text-blue-400"}`}
            onClick={(e) => {
              e.stopPropagation();
              if (group.source_type === "quote") {
                onNavigate(`/orders?tab=cotizaciones`);
              } else {
                onNavigate(`/orders?openOrderId=${group.order_id}`);
              }
            }}
          >
            {group.order_code}
          </span>
        </TableCell>
        <TableCell>
{group.client_name}
        </TableCell>
        <TableCell>
          {group.delivery_date ? (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              overdue
                ? "bg-red-500/20 text-red-400 border border-red-500/30"
                : "bg-muted text-foreground"
            }`}>
              <CalendarIcon className="h-3 w-3 mr-1" />
              {fmtDate(group.delivery_date)}
            </span>
          ) : (
            <span className="text-muted-foreground text-sm">Sin fecha</span>
          )}
        </TableCell>
        <TableCell>
          {group.source_type === "quote" ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
              Cotización
            </span>
          ) : (
            <StatusBadge status={group.status} />
          )}
        </TableCell>
        <TableCell className="text-center">
          <span className="inline-flex items-center justify-center min-w-[24px] px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">
            {group.skusAtRisk}
          </span>
        </TableCell>
        <TableCell className="text-right">
          <span className="text-lg font-bold text-red-500 tabular-nums">{group.totalBultosShort.toLocaleString()}</span>
        </TableCell>
        <TableCell className="text-right tabular-nums font-medium text-foreground">{fmtMXN(group.totalEstimatedCost)}</TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="bg-muted/20 border-border">
          <TableCell colSpan={8} className="p-0">
            <div className="px-6 py-4">
              <div className="grid grid-cols-[40px_auto_1fr_80px_100px_80px_80px_100px] gap-x-4 gap-y-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground pb-2 border-b border-border mb-1">
                <div />
                <div>SKU</div>
                <div>Producto</div>
                <div className="text-right">Stock</div>
                <div className="text-right">Comprometido</div>
                <div className="text-right">Pedido</div>
                <div className="text-right">Faltante</div>
                <div className="text-right">Costo est.</div>
              </div>
              {lines.map((line, i) => {
                const shortage = line.product_units_short;
                const hasShortage = shortage > 0;
                let reason: string | null = null;
                if (hasShortage) {
                  if (line.units_incoming > 0) {
                    reason = `Llega ${line.units_incoming} a tiempo, aún faltan ${shortage}`;
                  } else if (line.next_incoming_date) {
                    reason = `Entrada programada ${line.next_incoming_date.split("-").reverse().join("/")} (${line.next_incoming_qty ?? 0} bultos) — llega tarde`;
                  } else {
                    reason = "Sin entrada programada";
                  }
                }
                return (
                  <div
                    key={i}
                    className={`grid grid-cols-[40px_auto_1fr_80px_100px_80px_80px_100px] gap-x-4 items-center py-2.5 border-b border-border/30 ${hasShortage ? "bg-red-500/5" : ""}`}
                  >
                    <ProductThumb src={imageByClave[line.clave] ?? null} size="sm" />
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-primary">{line.clave}</span>
                      {line.shared_orders_count > 1 && (
                        <span className="inline-flex items-center gap-0.5 text-xs text-amber-400" title={`Compartido en ${line.shared_orders_count} pedidos`}>
                          <Info className="h-3 w-3" />
                          {line.shared_orders_count}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-foreground truncate">
                      {line.product_name}
                      {reason && (
                        <div className="text-[11px] text-amber-400/80 mt-0.5">{reason}</div>
                      )}
                    </div>
                    <div className="text-right text-sm tabular-nums text-foreground">{line.stock_fisico}</div>
                    <div className="text-right text-sm tabular-nums text-muted-foreground">{line.total_committed_all_orders}</div>
                    <div className="text-right text-sm tabular-nums text-foreground">{line.bultos_pedido}</div>
                    <div className="text-right">
                      {hasShortage ? (
                        <span className="text-sm font-bold text-red-500 tabular-nums">{shortage}</span>
                      ) : (
                        <span className="text-sm text-green-500 tabular-nums">0</span>
                      )}
                    </div>
                    <div className="text-right text-sm tabular-nums text-foreground">
                      {hasShortage ? fmtMXN(shortage * line.cost_with_iva) : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

/* ── Covered order row ── */
function CoveredOrderRow({
  group, expanded, onToggle, onNavigate, supplierFilter, imageByClave,
}: {
  group: OrderGroup;
  expanded: boolean;
  onToggle: () => void;
  onNavigate: (path: string) => void;
  supplierFilter: string;
  imageByClave: Record<string, string | null>;
}) {
  const totalBultos = group.lines.reduce((s, l) => s + l.bultos_pedido, 0);
  const lines = supplierFilter === "all"
    ? group.lines
    : group.lines.filter(l => l.supplier === supplierFilter);

  return (
    <>
      <TableRow
        className={`border-border hover:bg-muted/50 transition-colors cursor-pointer ${group.source_type === "quote" ? "bg-amber-500/5" : ""}`}
        onClick={onToggle}
      >
        <TableCell className="w-8 px-2">
          {expanded
            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </TableCell>
        <TableCell>
          <span
            className={`font-mono font-medium hover:underline cursor-pointer ${group.source_type === "quote" ? "text-amber-400" : "text-blue-400"}`}
            onClick={(e) => {
              e.stopPropagation();
              if (group.source_type === "quote") {
                onNavigate(`/orders?tab=cotizaciones`);
              } else {
                onNavigate(`/orders?openOrderId=${group.order_id}`);
              }
            }}
          >
            {group.order_code}
          </span>
        </TableCell>
        <TableCell>
{group.client_name}
        </TableCell>
        <TableCell className="text-muted-foreground">{fmtDate(group.delivery_date)}</TableCell>
        <TableCell>
          {group.source_type === "quote" ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
              Cotización
            </span>
          ) : (
            <StatusBadge status={group.status} />
          )}
        </TableCell>
        <TableCell className="text-center">
          <span className="inline-flex items-center justify-center min-w-[24px] px-2 py-0.5 rounded-full text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30">
            {group.lines.length}
          </span>
        </TableCell>
        <TableCell className="text-right tabular-nums font-medium text-foreground">{totalBultos.toLocaleString()}</TableCell>
        <TableCell className="text-right tabular-nums font-medium text-foreground">{fmtMXN(group.lines.reduce((s, l) => s + l.bultos_pedido * l.cost_with_iva, 0))}</TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="bg-muted/20 border-border">
          <TableCell colSpan={8} className="p-0">
            <div className="px-6 py-4">
              <div className="grid grid-cols-[40px_auto_1fr_80px_100px_80px_80px] gap-x-4 gap-y-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground pb-2 border-b border-border mb-1">
                <div />
                <div>SKU</div>
                <div>Producto</div>
                <div className="text-right">Stock</div>
                <div className="text-right">Comprometido</div>
                <div className="text-right">Pedido</div>
                <div className="text-right">Sobrante</div>
              </div>
              {lines.map((line, i) => {
                const surplus = line.stock_fisico - line.total_committed_all_orders;
                return (
                  <div
                    key={i}
                    className="grid grid-cols-[40px_auto_1fr_80px_100px_80px_80px] gap-x-4 items-center py-2.5 border-b border-border/30"
                  >
                    <ProductThumb src={imageByClave[line.clave] ?? null} size="sm" />
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-primary">{line.clave}</span>
                      {line.shared_orders_count > 1 && (
                        <span className="inline-flex items-center gap-0.5 text-xs text-amber-400" title={`Compartido en ${line.shared_orders_count} pedidos`}>
                          <Info className="h-3 w-3" />
                          {line.shared_orders_count}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-foreground truncate">{line.product_name}</div>
                    <div className="text-right text-sm tabular-nums text-foreground">{line.stock_fisico}</div>
                    <div className="text-right text-sm tabular-nums text-muted-foreground">{line.total_committed_all_orders}</div>
                    <div className="text-right text-sm tabular-nums text-foreground">{line.bultos_pedido}</div>
                    <div className="text-right">
                      <span className={`text-sm font-semibold tabular-nums ${surplus === 0 ? "text-amber-500" : surplus > 0 ? "text-green-500" : "text-red-500"}`}>
                        {surplus > 0 ? `+${surplus}` : surplus}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
