import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GlowCard } from "@/components/ui/spotlight-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProductThumb } from "@/components/ui/product-thumb";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern";
import { ChronoBar } from "@/components/ChronoBar";
import {
  DollarSign, TrendingUp, ShoppingCart, Receipt, CalendarIcon,
  Users, Package, BarChart3, ClipboardList, ShoppingBag, Clock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

/* ── Helpers ── */

const mxnFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const mxnFmt2 = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
const pctFmt = (n: number) => `${n.toFixed(1)}%`;

function parseLocalDate(d: string) {
  return new Date(d + "T12:00:00");
}
function dateToString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function getFirstOfMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}
function getLastOfMonth() {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return dateToString(last);
}
function getPrevMonthRange(): [string, string] {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last = new Date(now.getFullYear(), now.getMonth(), 0);
  return [dateToString(first), dateToString(last)];
}

/* ── Types ── */

interface SaleItem {
  order_id: string;
  order_code: string;
  order_date: string;
  delivery_date: string | null;
  status: string;
  client_name: string;
  client_id: string;
  product_id: string;
  product_clave: string;
  product_name: string;
  product_brand: string;
  product_image_url: string | null;
  quantity: number;
  unit_price: number;          // actual sale price per unit (with IVA)
  venta_sin_iva: number;       // unit_price / 1.16 × qty
  costo_sin_iva: number;       // cost_without_iva × qty
  costo_bonif_sin_iva: number; // cost_without_iva × (1 - bonif) × qty
  profit: number;              // venta_sin_iva - costo_sin_iva
  profit_bonif: number;        // venta_sin_iva - costo_bonif_sin_iva
  revenue: number;             // unit_price × qty (with IVA, for display)
}

/* ── Component ── */

export default function Sales() {
  const [dateFrom, setDateFrom] = useState(getFirstOfMonth());
  const [dateTo, setDateTo] = useState(getLastOfMonth());
  const setThisMonth = () => { setDateFrom(getFirstOfMonth()); setDateTo(getLastOfMonth()); };
  const setAllTime = () => { setDateFrom(""); setDateTo(""); };
  const [tab, setTab] = useState("overview");

  // Fetch all non-cancelled orders with items and product/margin info
  const { data: saleItems = [], isLoading } = useQuery({
    queryKey: ["sales-data"],
    queryFn: async () => {
      // Get non-cancelled orders with client name + discount fields. The
      // order-level discount has to be allocated across line items
      // proportionally so revenue/profit aggregates (by client, product,
      // brand, day, etc.) all stay accurate.
      const { data: orders, error: ordErr } = await (supabase as any)
        .from("orders")
        .select("id, order_code, order_date, delivery_date, status, client_id, discount_amount, clients(name)")
        .neq("status", "Cancelado")
        .order("delivery_date", { ascending: false });
      if (ordErr) throw ordErr;
      if (!orders?.length) return [];

      // Get all order items
      const orderIds = orders.map((o: any) => o.id);
      const { data: items, error: itemErr } = await supabase
        .from("order_items")
        .select("order_id, product_id, quantity, unit_price_override, products(clave, name, brand, sale_price_with_iva, image_url)")
        .in("order_id", orderIds);
      if (itemErr) throw itemErr;

      // Get cost & bonificación from margins table (matches dashboard logic)
      const { data: marginData, error: marginErr } = await supabase
        .from("margins")
        .select("product_id, cost_without_iva, bonificacion_pct");
      if (marginErr) throw marginErr;
      const marginMap = new Map((marginData ?? []).map((m: any) => [m.product_id, { cost: Number(m.cost_without_iva) || 0, bonif: Number(m.bonificacion_pct) || 0 }]));

      const orderMap = new Map(orders.map((o: any) => [o.id, o]));

      // Pre-compute each order's gross subtotal so we can allocate the
      // discount across lines proportionally. Without this, a single
      // discount applied at the order level would be invisible in
      // by-product / by-client / daily-trend aggregations.
      const orderSubtotals = new Map<string, number>();
      for (const item of (items ?? []) as any[]) {
        const unitPrice = Number(item.unit_price_override ?? item.products?.sale_price_with_iva) || 0;
        const qty = Number(item.quantity) || 0;
        orderSubtotals.set(item.order_id, (orderSubtotals.get(item.order_id) ?? 0) + unitPrice * qty);
      }

      return (items ?? []).map((item: any) => {
        const order = orderMap.get(item.order_id)! as any;
        const unitPrice = Number(item.unit_price_override ?? item.products?.sale_price_with_iva) || 0;
        const qty = Number(item.quantity) || 0;
        const margin = marginMap.get(item.product_id) ?? { cost: 0, bonif: 0 };
        const lineGrossRevenue = unitPrice * qty;

        // Allocate the order-level discount proportionally to this line.
        // Cap at the order's gross subtotal so we never go negative.
        const orderSubtotal = orderSubtotals.get(item.order_id) ?? 0;
        const orderDiscount = Math.min(Number(order.discount_amount) || 0, orderSubtotal);
        const lineDiscount = orderSubtotal > 0
          ? orderDiscount * (lineGrossRevenue / orderSubtotal)
          : 0;
        const lineDiscountSinIva = lineDiscount / 1.16;

        // Net values: discount removed proportionally. profit and
        // profit_bonif both drop by the discount-without-IVA since the
        // discount comes out of margin, not cost.
        const ventaSinIva = (lineGrossRevenue / 1.16) - lineDiscountSinIva;
        const costoSinIva = margin.cost * qty;
        const costoBonifSinIva = margin.cost * (1 - margin.bonif) * qty;
        return {
          order_id: item.order_id,
          order_code: order.order_code,
          order_date: order.order_date,
          delivery_date: order.delivery_date,
          status: order.status,
          client_name: (order as any).clients?.name ?? "Sin cliente",
          client_id: order.client_id,
          product_id: item.product_id,
          product_clave: item.products?.clave ?? "",
          product_name: item.products?.name ?? "",
          product_brand: item.products?.brand ?? "Sin marca",
          product_image_url: item.products?.image_url ?? null,
          quantity: qty,
          unit_price: unitPrice,
          venta_sin_iva: ventaSinIva,
          costo_sin_iva: costoSinIva,
          costo_bonif_sin_iva: costoBonifSinIva,
          profit: ventaSinIva - costoSinIva,
          profit_bonif: ventaSinIva - costoBonifSinIva,
          revenue: lineGrossRevenue - lineDiscount,
        } as SaleItem;
      });
    },
  });

  // Filter by date range (all non-cancelled orders in range)
  const filtered = useMemo(() => {
    return saleItems.filter(s => {
      // Bucket by ORDER date — "April sales" = sold in April, regardless
      // of when delivery is scheduled. Delivery date stays in the model
      // for logistics/scheduling but is no longer the revenue clock.
      const d = s.order_date;
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
  }, [saleItems, dateFrom, dateTo]);

  // Delivered only (for "realizada")
  const delivered = useMemo(() => filtered.filter(s => s.status === "Entregado"), [filtered]);

  // Pending (not delivered, not cancelled)
  const pending = useMemo(() => filtered.filter(s => s.status !== "Entregado"), [filtered]);
  const pendingKpis = useMemo(() => {
    const orders = new Set(pending.map(s => s.order_id)).size;
    const revenue = pending.reduce((s, i) => s + i.revenue, 0);
    const profit = pending.reduce((s, i) => s + i.profit, 0);
    return { orders, revenue, profit };
  }, [pending]);

  // Previous month data for comparison
  const prevMonthData = useMemo(() => {
    const [pFrom, pTo] = getPrevMonthRange();
    return saleItems.filter(s => {
      // Bucket by ORDER date — "April sales" = sold in April, regardless
      // of when delivery is scheduled. Delivery date stays in the model
      // for logistics/scheduling but is no longer the revenue clock.
      const d = s.order_date;
      return d >= pFrom && d <= pTo;
    });
  }, [saleItems]);

  // ── KPIs ──
  const kpis = useMemo(() => {
    // Realized = delivered only
    const realizedProfit = delivered.reduce((s, i) => s + i.profit, 0);
    const realizedProfitBonif = delivered.reduce((s, i) => s + i.profit_bonif, 0);
    // Implied = all non-cancelled in range
    const impliedProfit = filtered.reduce((s, i) => s + i.profit, 0);
    const impliedProfitBonif = filtered.reduce((s, i) => s + i.profit_bonif, 0);
    // Revenue & general stats from delivered
    const totalRevenue = delivered.reduce((s, i) => s + i.revenue, 0);
    const totalCost = delivered.reduce((s, i) => s + i.costo_sin_iva, 0);
    const totalVentaSinIva = delivered.reduce((s, i) => s + i.venta_sin_iva, 0);
    const marginPct = totalVentaSinIva > 0 ? (realizedProfit / totalVentaSinIva) * 100 : 0;
    const marginBonifPct = totalVentaSinIva > 0 ? (realizedProfitBonif / totalVentaSinIva) * 100 : 0;
    const uniqueOrders = new Set(delivered.map(i => i.order_id)).size;
    const avgTicket = uniqueOrders > 0 ? totalRevenue / uniqueOrders : 0;
    const totalUnits = delivered.reduce((s, i) => s + i.quantity, 0);
    return { totalRevenue, totalCost, totalVentaSinIva, realizedProfit, realizedProfitBonif, impliedProfit, impliedProfitBonif, marginPct, marginBonifPct, uniqueOrders, avgTicket, totalUnits };
  }, [filtered, delivered]);

  // Previous month KPIs for comparison
  const prevKpis = useMemo(() => {
    const prevDelivered = prevMonthData.filter(s => s.status === "Entregado");
    const realizedProfit = prevDelivered.reduce((s, i) => s + i.profit, 0);
    const realizedProfitBonif = prevDelivered.reduce((s, i) => s + i.profit_bonif, 0);
    const totalRevenue = prevDelivered.reduce((s, i) => s + i.revenue, 0);
    return { totalRevenue, realizedProfit, realizedProfitBonif };
  }, [prevMonthData]);

  // ── By Client ──
  const byClient = useMemo(() => {
    const map = new Map<string, { name: string; orders: Set<string>; revenue: number; ventaSinIva: number; costoSinIva: number; profit: number; profitBonif: number; units: number }>();
    for (const s of delivered) {
      const entry = map.get(s.client_id) ?? { name: s.client_name, orders: new Set(), revenue: 0, ventaSinIva: 0, costoSinIva: 0, profit: 0, profitBonif: 0, units: 0 };
      entry.orders.add(s.order_id);
      entry.revenue += s.revenue;
      entry.ventaSinIva += s.venta_sin_iva;
      entry.costoSinIva += s.costo_sin_iva;
      entry.profit += s.profit;
      entry.profitBonif += s.profit_bonif;
      entry.units += s.quantity;
      map.set(s.client_id, entry);
    }
    return [...map.entries()]
      .map(([id, d]) => ({ id, name: d.name, orders: d.orders.size, revenue: d.revenue, profit: d.profit, profitBonif: d.profitBonif, marginPct: d.ventaSinIva > 0 ? (d.profit / d.ventaSinIva) * 100 : 0, marginBonifPct: d.ventaSinIva > 0 ? (d.profitBonif / d.ventaSinIva) * 100 : 0, units: d.units }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [delivered]);

  // ── By Product ──
  const byProduct = useMemo(() => {
    const map = new Map<string, { clave: string; name: string; brand: string; image_url: string | null; revenue: number; ventaSinIva: number; profit: number; profitBonif: number; units: number }>();
    for (const s of delivered) {
      const entry = map.get(s.product_id) ?? { clave: s.product_clave, name: s.product_name, brand: s.product_brand, image_url: s.product_image_url, revenue: 0, ventaSinIva: 0, profit: 0, profitBonif: 0, units: 0 };
      entry.revenue += s.revenue;
      entry.ventaSinIva += s.venta_sin_iva;
      entry.profit += s.profit;
      entry.profitBonif += s.profit_bonif;
      entry.units += s.quantity;
      map.set(s.product_id, entry);
    }
    return [...map.entries()]
      .map(([id, d]) => ({ id, ...d, marginPct: d.ventaSinIva > 0 ? (d.profit / d.ventaSinIva) * 100 : 0, marginBonifPct: d.ventaSinIva > 0 ? (d.profitBonif / d.ventaSinIva) * 100 : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [delivered]);

  // ── By Brand ──
  const byBrand = useMemo(() => {
    const map = new Map<string, { revenue: number; ventaSinIva: number; profit: number; profitBonif: number; units: number; skus: Set<string> }>();
    for (const s of delivered) {
      const entry = map.get(s.product_brand) ?? { revenue: 0, ventaSinIva: 0, profit: 0, profitBonif: 0, units: 0, skus: new Set() };
      entry.revenue += s.revenue;
      entry.ventaSinIva += s.venta_sin_iva;
      entry.profit += s.profit;
      entry.profitBonif += s.profit_bonif;
      entry.units += s.quantity;
      entry.skus.add(s.product_id);
      map.set(s.product_brand, entry);
    }
    return [...map.entries()]
      .map(([name, d]) => ({ name, revenue: d.revenue, profit: d.profit, profitBonif: d.profitBonif, marginPct: d.ventaSinIva > 0 ? (d.profit / d.ventaSinIva) * 100 : 0, marginBonifPct: d.ventaSinIva > 0 ? (d.profitBonif / d.ventaSinIva) * 100 : 0, units: d.units, skus: d.skus.size }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [delivered]);

  // ── By Order ──
  const byOrder = useMemo(() => {
    const map = new Map<string, { code: string; date: string; clientName: string; revenue: number; ventaSinIva: number; profit: number; profitBonif: number; units: number; items: number }>();
    for (const s of delivered) {
      const entry = map.get(s.order_id) ?? { code: s.order_code, date: s.order_date, clientName: s.client_name, revenue: 0, ventaSinIva: 0, profit: 0, profitBonif: 0, units: 0, items: 0 };
      entry.revenue += s.revenue;
      entry.ventaSinIva += s.venta_sin_iva;
      entry.profit += s.profit;
      entry.profitBonif += s.profit_bonif;
      entry.units += s.quantity;
      entry.items += 1;
      map.set(s.order_id, entry);
    }
    return [...map.entries()]
      .map(([id, d]) => ({ id, ...d, marginPct: d.ventaSinIva > 0 ? (d.profit / d.ventaSinIva) * 100 : 0, marginBonifPct: d.ventaSinIva > 0 ? (d.profitBonif / d.ventaSinIva) * 100 : 0 }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [delivered]);

  // ── Daily trend ──
  const dailyTrend = useMemo(() => {
    const map = new Map<string, { revenue: number; profit: number; profitBonif: number; orders: Set<string> }>();
    for (const s of delivered) {
      // Bucket by ORDER date — "April sales" = sold in April, regardless
      // of when delivery is scheduled. Delivery date stays in the model
      // for logistics/scheduling but is no longer the revenue clock.
      const d = s.order_date;
      const entry = map.get(d) ?? { revenue: 0, profit: 0, profitBonif: 0, orders: new Set() };
      entry.revenue += s.revenue;
      entry.profit += s.profit;
      entry.profitBonif += s.profit_bonif;
      entry.orders.add(s.order_id);
      map.set(d, entry);
    }
    return [...map.entries()]
      .map(([date, d]) => ({ date, revenue: d.revenue, profit: d.profit, profitBonif: d.profitBonif, orders: d.orders.size }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [delivered]);

  // Comparison deltas
  const deltaRevenue = prevKpis.totalRevenue > 0 ? ((kpis.totalRevenue - prevKpis.totalRevenue) / prevKpis.totalRevenue) * 100 : 0;

  const maxDailyRevenue = dailyTrend.reduce((m, d) => Math.max(m, d.revenue), 0);

  // Brand distribution colors
  const brandColors = ["#3b82f6", "#a855f7", "#f59e0b", "#10b981", "#ef4444", "#6366f1", "#ec4899", "#14b8a6", "#f97316", "#8b5cf6", "#06b6d4", "#84cc16", "#e11d48", "#0ea5e9", "#d946ef", "#facc15"];

  return (
    <div className="min-h-screen bg-background relative">
      <AnimatedGridPattern className="fixed inset-0 opacity-30" />
      <div className="relative z-10 space-y-6 p-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Ventas</h1>
          <p className="text-sm text-muted-foreground">Análisis de ventas, utilidades y márgenes</p>
        </div>

        {/* Date filter */}
        <ChronoBar
          dateFrom={dateFrom}
          dateTo={dateTo}
          onChange={(from, to) => { setDateFrom(from); setDateTo(to); }}
        />

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {/* Ventas totales */}
          <GlowCard>
            <div className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="h-4 w-4 text-green-500" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ventas totales</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{mxnFmt.format(kpis.totalRevenue)}</p>
              <p className="text-xs text-muted-foreground mt-1">{kpis.uniqueOrders} pedidos · Ticket prom. {mxnFmt.format(kpis.avgTicket)}</p>
              {dateFrom === getFirstOfMonth() && deltaRevenue !== 0 && (
                <p className={cn("text-xs font-medium mt-1", deltaRevenue > 0 ? "text-green-400" : "text-red-400")}>
                  {deltaRevenue > 0 ? "+" : ""}{deltaRevenue.toFixed(1)}% vs mes anterior
                </p>
              )}
            </div>
          </GlowCard>

          {/* Utilidad */}
          <GlowCard>
            <div className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Utilidad</span>
              </div>
              <div className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold text-foreground">{mxnFmt.format(kpis.realizedProfit)}</p>
                  <span className="text-xs text-muted-foreground">realizada</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <p className="text-lg font-semibold text-muted-foreground">{mxnFmt.format(kpis.impliedProfit)}</p>
                  <span className="text-xs text-muted-foreground">implicada</span>
                </div>
              </div>
            </div>
          </GlowCard>

          {/* Utilidad c/ bonificación */}
          <GlowCard>
            <div className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-cyan-500" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Utilidad c/ bonificación</span>
              </div>
              <div className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold text-foreground">{mxnFmt.format(kpis.realizedProfitBonif)}</p>
                  <span className="text-xs text-muted-foreground">realizada</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <p className="text-lg font-semibold text-muted-foreground">{mxnFmt.format(kpis.impliedProfitBonif)}</p>
                  <span className="text-xs text-muted-foreground">implicada</span>
                </div>
              </div>
            </div>
          </GlowCard>

          {/* Ventas por cerrar */}
          <GlowCard>
            <div className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-amber-500" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ventas por cerrar</span>
              </div>
              <div className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold text-foreground">{pendingKpis.orders}</p>
                  <span className="text-xs text-muted-foreground">{pendingKpis.orders === 1 ? "pedido" : "pedidos"}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <p className="text-lg font-semibold text-muted-foreground">{mxnFmt.format(pendingKpis.revenue)}</p>
                  <span className="text-xs text-muted-foreground">valor</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <p className="text-lg font-semibold text-green-400">{mxnFmt.format(pendingKpis.profit)}</p>
                  <span className="text-xs text-muted-foreground">utilidad estimada</span>
                </div>
              </div>
            </div>
          </GlowCard>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="overview" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" />Resumen</TabsTrigger>
            <TabsTrigger value="clients" className="gap-1.5"><Users className="h-3.5 w-3.5" />Por cliente</TabsTrigger>
            <TabsTrigger value="orders" className="gap-1.5"><ClipboardList className="h-3.5 w-3.5" />Por pedido</TabsTrigger>
            <TabsTrigger value="products" className="gap-1.5"><Package className="h-3.5 w-3.5" />Por producto</TabsTrigger>
            <TabsTrigger value="brands" className="gap-1.5"><ShoppingBag className="h-3.5 w-3.5" />Por marca</TabsTrigger>
          </TabsList>

          {/* ─── OVERVIEW TAB ─── */}
          <TabsContent value="overview" className="space-y-6 mt-4">
            {isLoading ? (
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full bg-muted" />)}</div>
            ) : (
              <>
                {/* Trend line chart */}
                {dailyTrend.length > 0 && (() => {
                  const chartW = 700, chartH = 180;
                  const padL = 60, padR = 16, padT = 16, padB = 32;
                  const plotW = chartW - padL - padR;
                  const plotH = chartH - padT - padB;
                  const maxRev = maxDailyRevenue || 1;
                  const rawStep = maxRev / 4;
                  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
                  const step = Math.ceil(rawStep / mag) * mag;
                  const yMax = Math.ceil(maxRev / step) * step;
                  const yTicks = Array.from({ length: Math.ceil(yMax / step) + 1 }, (_, i) => i * step);
                  const points = dailyTrend.map((d, i) => ({
                    x: padL + (dailyTrend.length > 1 ? (i / (dailyTrend.length - 1)) * plotW : plotW / 2),
                    y: padT + plotH - (d.revenue / yMax) * plotH,
                    ...d,
                  }));
                  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
                  return (
                    <GlowCard>
                      <div className="p-5">
                        <h3 className="text-sm font-medium text-muted-foreground mb-4">Tendencia diaria de ventas</h3>
                        <div className="w-full relative" data-chart-wrap="1">
                          <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full" style={{ minWidth: 400 }}>
                            <defs>
                              <clipPath id="line-reveal">
                                <rect x="0" y="0" width={chartW} height={chartH}>
                                  <animate attributeName="width" from="0" to={chartW} dur="1s" fill="freeze" calcMode="spline" keySplines="0.25 0.1 0.25 1" keyTimes="0;1" />
                                </rect>
                              </clipPath>
                            </defs>
                            {yTicks.map(tick => {
                              const y = padT + plotH - (tick / yMax) * plotH;
                              return (
                                <g key={tick}>
                                  <line x1={padL} x2={chartW - padR} y1={y} y2={y} stroke="hsl(var(--border))" strokeWidth="0.5" strokeDasharray="4 3" />
                                  <text x={padL - 6} y={y + 3} textAnchor="end" className="fill-muted-foreground" style={{ fontSize: 10 }}>
                                    {tick >= 1000 ? `$${(tick / 1000).toFixed(0)}k` : `$${tick}`}
                                  </text>
                                </g>
                              );
                            })}
                            <g clipPath="url(#line-reveal)">
                              <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
                              {points.map((p, i) => {
                                const delay = points.length > 1 ? (i / (points.length - 1)) * 0.8 : 0;
                                return (
                                  <g key={p.date}>
                                    <circle cx={p.x} cy={p.y} r={3} fill="#3b82f6" stroke="hsl(var(--background))" strokeWidth="1.5" opacity="0">
                                      <animate attributeName="opacity" from="0" to="1" dur="0.3s" begin={`${delay + 0.2}s`} fill="freeze" />
                                    </circle>
                                    {(dailyTrend.length <= 15 || i % Math.ceil(dailyTrend.length / 12) === 0) && (
                                      <text x={p.x} y={chartH - 6} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 9 }} opacity="0">
                                        <animate attributeName="opacity" from="0" to="1" dur="0.3s" begin={`${delay + 0.2}s`} fill="freeze" />
                                        {format(parseLocalDate(p.date), "dd MMM", { locale: es })}
                                      </text>
                                    )}
                                  </g>
                                );
                              })}
                            </g>
                            {/* Full-height column hover zones */}
                            {points.map((p, i) => {
                              const colW = points.length > 1 ? plotW / (points.length - 1) : plotW;
                              const x0 = i === 0 ? padL : p.x - colW / 2;
                              const x1 = i === points.length - 1 ? chartW - padR : p.x + colW / 2;
                              return (
                                <rect key={`h-${p.date}`} x={x0} y={0} width={x1 - x0} height={chartH} fill="transparent" className="cursor-default"
                                  onMouseEnter={(e) => {
                                    const wrap = (e.currentTarget.closest('[data-chart-wrap]') as HTMLElement);
                                    const tip = wrap?.querySelector(`[data-tip="${p.date}"]`) as HTMLElement;
                                    if (tip) tip.style.display = 'block';
                                  }}
                                  onMouseLeave={(e) => {
                                    const wrap = (e.currentTarget.closest('[data-chart-wrap]') as HTMLElement);
                                    const tip = wrap?.querySelector(`[data-tip="${p.date}"]`) as HTMLElement;
                                    if (tip) tip.style.display = 'none';
                                  }}
                                />
                              );
                            })}
                          </svg>
                          {/* HTML tooltips */}
                          {points.map((p) => {
                            const nearTop = (p.y / chartH) < 0.35;
                            return (
                              <div key={`t-${p.date}`} data-tip={p.date}
                                style={{ display: 'none', left: `${(p.x / chartW) * 100}%`, top: `${(p.y / chartH) * 100}%` }}
                                className={`absolute z-50 -translate-x-1/2 pointer-events-none ${nearTop ? 'mt-3' : '-translate-y-full -mt-3'}`}>
                                <div className="bg-popover border rounded-lg shadow-lg px-5 py-3 whitespace-nowrap">
                                  <p className="font-semibold text-base">{format(parseLocalDate(p.date), "dd MMM yyyy", { locale: es })}</p>
                                  <p className="text-sm mt-1 flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" />Venta: <span className="text-blue-500 font-semibold">{mxnFmt.format(p.revenue)}</span></p>
                                  <p className="text-sm flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />Utilidad: <span className="text-emerald-500 font-semibold">{mxnFmt.format(p.profit)}</span></p>
                                  <p className="text-sm flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" /><span className="text-amber-500 font-semibold">{p.orders}</span> {p.orders === 1 ? "pedido" : "pedidos"}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-1.5 text-xs"><div className="h-2 w-2 rounded-full bg-blue-500" /><span className="text-muted-foreground">Ventas diarias</span></div>
                          <span className="text-xs text-muted-foreground">{dailyTrend.length} días</span>
                        </div>
                      </div>
                    </GlowCard>
                  );
                })()}

                {/* Top 5 clients + brand distribution side by side */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Top 5 clients */}
                  <GlowCard>
                    <div className="p-5">
                      <h3 className="text-sm font-medium text-muted-foreground mb-3">Top 5 clientes por ventas</h3>
                      <div className="space-y-3">
                        {byClient.slice(0, 5).map((c, i) => {
                          const maxRev = byClient[0]?.revenue || 1;
                          const pct = (c.revenue / maxRev) * 100;
                          return (
                            <div key={c.id}>
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: "linear-gradient(135deg, #3b82f6, #60a5fa)" }}>{i + 1}</div>
                                  <span className="text-sm truncate text-foreground">{c.name}</span>
                                </div>
                                <div className="text-right shrink-0 ml-2">
                                  <span className="text-sm font-medium text-foreground">{mxnFmt.format(c.revenue)}</span>
                                  <span className="text-xs text-green-400 ml-2">+{mxnFmt.format(c.profit)}</span>
                                </div>
                              </div>
                              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg, #3b82f6, #60a5fa)" }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </GlowCard>

                  {/* Brand distribution */}
                  <GlowCard>
                    <div className="p-5">
                      <h3 className="text-sm font-medium text-muted-foreground mb-3">Ventas por marca</h3>
                      {byBrand.length > 0 && (() => {
                        const totalRev = byBrand.reduce((s, b) => s + b.revenue, 0);
                        const size = 200;
                        const cx = size / 2, cy = size / 2;
                        const outerR = 80, innerR = 48;
                        let cumAngle = -Math.PI / 2;
                        const slices = byBrand.map((b, i) => {
                          const pct = totalRev > 0 ? b.revenue / totalRev : 0;
                          const angle = pct * 2 * Math.PI;
                          const startAngle = cumAngle;
                          cumAngle += angle;
                          const endAngle = cumAngle;
                          const midAngle = startAngle + angle / 2;
                          const largeArc = angle > Math.PI ? 1 : 0;
                          // Outer arc
                          const ox1 = cx + outerR * Math.cos(startAngle);
                          const oy1 = cy + outerR * Math.sin(startAngle);
                          const ox2 = cx + outerR * Math.cos(endAngle);
                          const oy2 = cy + outerR * Math.sin(endAngle);
                          // Inner arc
                          const ix1 = cx + innerR * Math.cos(endAngle);
                          const iy1 = cy + innerR * Math.sin(endAngle);
                          const ix2 = cx + innerR * Math.cos(startAngle);
                          const iy2 = cy + innerR * Math.sin(startAngle);
                          const d = pct >= 0.999
                            ? `M ${cx} ${cy - outerR} A ${outerR} ${outerR} 0 1 1 ${cx - 0.01} ${cy - outerR} L ${cx - 0.01} ${cy - innerR} A ${innerR} ${innerR} 0 1 0 ${cx} ${cy - innerR} Z`
                            : `M ${ox1} ${oy1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${ox2} ${oy2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2} Z`;
                          // Label line points
                          const labelR = outerR + 14;
                          const labelX = cx + labelR * Math.cos(midAngle);
                          const labelY = cy + labelR * Math.sin(midAngle);
                          return { ...b, d, color: brandColors[i % brandColors.length], pct, midAngle, labelX, labelY };
                        });
                        return (
                          <div className="flex items-start gap-6">
                            <svg width={size} height={size} className="shrink-0">
                              {slices.map(s => s.pct > 0.005 && (
                                <path key={s.name} d={s.d} fill={s.color} stroke="hsl(var(--background))" strokeWidth="2" className="hover:opacity-80 transition-opacity cursor-default" />
                              ))}
                            </svg>
                            <div className="flex flex-col min-w-0 py-1">
                              <p className="text-xl font-bold text-foreground">{mxnFmt.format(totalRev)}</p>
                              <p className="text-xs text-muted-foreground mb-3">Total ventas por marca</p>
                              <div className="flex flex-col gap-2">
                                {byBrand.map((b, i) => {
                                  const pct = totalRev > 0 ? (b.revenue / totalRev) * 100 : 0;
                                  return (
                                    <div key={b.name} className="flex items-center gap-2.5">
                                      <div className="h-3 w-3 rounded shrink-0" style={{ backgroundColor: brandColors[i % brandColors.length] }} />
                                      <span className="text-sm text-foreground font-medium truncate">{b.name}</span>
                                      <span className="text-sm text-muted-foreground whitespace-nowrap ml-auto tabular-nums">{pct.toFixed(0)}%</span>
                                      <span className="text-sm font-medium text-foreground whitespace-nowrap tabular-nums">{mxnFmt.format(b.revenue)}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </GlowCard>
                </div>

                {/* Top 5 products */}
                <GlowCard>
                  <div className="p-5">
                    <h3 className="text-sm font-medium text-muted-foreground mb-3">Top 5 productos por ventas</h3>
                    <div className="space-y-3">
                      {byProduct.slice(0, 5).map((p, i) => {
                        const maxRev = byProduct[0]?.revenue || 1;
                        const pct = (p.revenue / maxRev) * 100;
                        return (
                          <div key={p.id}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: "linear-gradient(135deg, #10b981, #34d399)" }}>{i + 1}</div>
                                <ProductThumb src={p.image_url} size="xs" />
                                <span className="font-mono text-xs text-primary mr-1">{p.clave}</span>
                                <span className="text-sm truncate text-foreground">{p.name}</span>
                              </div>
                              <div className="text-right shrink-0 ml-2">
                                <span className="text-sm font-medium text-foreground">{mxnFmt.format(p.revenue)}</span>
                                <span className="text-xs text-green-400 ml-2">+{mxnFmt.format(p.profit)}</span>
                              </div>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg, #10b981, #34d399)" }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </GlowCard>
              </>
            )}
          </TabsContent>

          {/* ─── BY CLIENT TAB ─── */}
          <TabsContent value="clients" className="mt-4">
            <GlowCard className="overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      <TableHead className="text-muted-foreground">Cliente</TableHead>
                      <TableHead className="text-muted-foreground text-center w-[80px]">Pedidos</TableHead>
                      <TableHead className="text-muted-foreground text-center w-[80px]">Bultos</TableHead>
                      <TableHead className="text-muted-foreground text-right w-[120px]">Ventas</TableHead>
                      <TableHead className="text-muted-foreground text-right w-[120px]">Utilidad</TableHead>
                      <TableHead className="text-muted-foreground text-right w-[120px]">Utilidad c/B</TableHead>
                      <TableHead className="text-muted-foreground text-center w-[80px]">Margen</TableHead>
                      <TableHead className="text-muted-foreground text-center w-[80px]">Margen c/B</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i} className="border-border">
                          {Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full bg-muted" /></TableCell>)}
                        </TableRow>
                      ))
                    ) : byClient.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No hay ventas en este período</TableCell></TableRow>
                    ) : (
                      <>
                        <TableRow className="border-border bg-muted/30 font-semibold">
                          <TableCell className="text-foreground text-sm">Total</TableCell>
                          <TableCell className="text-center tabular-nums text-sm">{kpis.uniqueOrders}</TableCell>
                          <TableCell className="text-center tabular-nums text-sm">{kpis.totalUnits}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{mxnFmt.format(kpis.totalRevenue)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm text-green-400">{mxnFmt.format(kpis.realizedProfit)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm text-cyan-400">{mxnFmt.format(kpis.realizedProfitBonif)}</TableCell>
                          <TableCell className="text-center"><Badge variant="secondary" className="text-xs">{pctFmt(kpis.marginPct)}</Badge></TableCell>
                          <TableCell className="text-center"><Badge variant="secondary" className="text-xs">{pctFmt(kpis.marginBonifPct)}</Badge></TableCell>
                        </TableRow>
                        {byClient.map(c => (
                          <TableRow key={c.id} className="border-border">
                            <TableCell className="font-medium text-foreground text-sm">{c.name}</TableCell>
                            <TableCell className="text-center tabular-nums text-sm">{c.orders}</TableCell>
                            <TableCell className="text-center tabular-nums text-sm">{c.units}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm font-medium">{mxnFmt.format(c.revenue)}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm font-medium text-green-400">{mxnFmt.format(c.profit)}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm font-medium text-cyan-400">{mxnFmt.format(c.profitBonif)}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary" className={cn("text-xs", c.marginPct >= 8 ? "text-green-400" : c.marginPct >= 5 ? "text-amber-400" : "text-red-400")}>
                                {pctFmt(c.marginPct)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary" className={cn("text-xs", c.marginBonifPct >= 8 ? "text-cyan-400" : c.marginBonifPct >= 5 ? "text-amber-400" : "text-red-400")}>
                                {pctFmt(c.marginBonifPct)}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>
            </GlowCard>
          </TabsContent>

          {/* ─── BY PRODUCT TAB ─── */}
          <TabsContent value="products" className="mt-4">
            <GlowCard className="overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      <TableHead className="text-muted-foreground w-[90px]">SKU</TableHead>
                      <TableHead className="text-muted-foreground">Producto</TableHead>
                      <TableHead className="text-muted-foreground w-[100px]">Marca</TableHead>
                      <TableHead className="text-muted-foreground text-center w-[80px]">Bultos</TableHead>
                      <TableHead className="text-muted-foreground text-right w-[120px]">Ventas</TableHead>
                      <TableHead className="text-muted-foreground text-right w-[120px]">Utilidad</TableHead>
                      <TableHead className="text-muted-foreground text-right w-[120px]">Utilidad c/B</TableHead>
                      <TableHead className="text-muted-foreground text-center w-[80px]">Margen</TableHead>
                      <TableHead className="text-muted-foreground text-center w-[80px]">Margen c/B</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i} className="border-border">
                          {Array.from({ length: 9 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full bg-muted" /></TableCell>)}
                        </TableRow>
                      ))
                    ) : byProduct.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">No hay ventas en este período</TableCell></TableRow>
                    ) : (
                      <>
                        <TableRow className="border-border bg-muted/30 font-semibold">
                          <TableCell colSpan={3} className="text-foreground text-sm">Total</TableCell>
                          <TableCell className="text-center tabular-nums text-sm">{kpis.totalUnits}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{mxnFmt.format(kpis.totalRevenue)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm text-green-400">{mxnFmt.format(kpis.realizedProfit)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm text-cyan-400">{mxnFmt.format(kpis.realizedProfitBonif)}</TableCell>
                          <TableCell className="text-center"><Badge variant="secondary" className="text-xs">{pctFmt(kpis.marginPct)}</Badge></TableCell>
                          <TableCell className="text-center"><Badge variant="secondary" className="text-xs">{pctFmt(kpis.marginBonifPct)}</Badge></TableCell>
                        </TableRow>
                        {byProduct.map(p => (
                          <TableRow key={p.id} className="border-border">
                            <TableCell className="font-mono text-primary font-medium text-sm">{p.clave}</TableCell>
                            <TableCell className="text-foreground text-sm max-w-[280px]">
                              <div className="flex items-center gap-2">
                                <ProductThumb src={p.image_url} size="sm" />
                                <span className="truncate">{p.name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">{p.brand}</TableCell>
                            <TableCell className="text-center tabular-nums text-sm">{p.units}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm font-medium">{mxnFmt.format(p.revenue)}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm font-medium text-green-400">{mxnFmt.format(p.profit)}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm font-medium text-cyan-400">{mxnFmt.format(p.profitBonif)}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary" className={cn("text-xs", p.marginPct >= 8 ? "text-green-400" : p.marginPct >= 5 ? "text-amber-400" : "text-red-400")}>
                                {pctFmt(p.marginPct)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary" className={cn("text-xs", p.marginBonifPct >= 8 ? "text-cyan-400" : p.marginBonifPct >= 5 ? "text-amber-400" : "text-red-400")}>
                                {pctFmt(p.marginBonifPct)}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>
            </GlowCard>
          </TabsContent>

          {/* ─── BY BRAND TAB ─── */}
          <TabsContent value="brands" className="mt-4">
            <GlowCard className="overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      <TableHead className="text-muted-foreground">Marca</TableHead>
                      <TableHead className="text-muted-foreground text-center w-[80px]">SKUs</TableHead>
                      <TableHead className="text-muted-foreground text-center w-[80px]">Bultos</TableHead>
                      <TableHead className="text-muted-foreground text-right w-[120px]">Ventas</TableHead>
                      <TableHead className="text-muted-foreground text-right w-[120px]">Utilidad</TableHead>
                      <TableHead className="text-muted-foreground text-right w-[120px]">Utilidad c/B</TableHead>
                      <TableHead className="text-muted-foreground text-center w-[80px]">Margen</TableHead>
                      <TableHead className="text-muted-foreground text-center w-[80px]">Margen c/B</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={i} className="border-border">
                          {Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full bg-muted" /></TableCell>)}
                        </TableRow>
                      ))
                    ) : byBrand.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No hay ventas en este período</TableCell></TableRow>
                    ) : (
                      <>
                        <TableRow className="border-border bg-muted/30 font-semibold">
                          <TableCell className="text-foreground text-sm">Total</TableCell>
                          <TableCell className="text-center tabular-nums text-sm">{byBrand.reduce((s, b) => s + b.skus, 0)}</TableCell>
                          <TableCell className="text-center tabular-nums text-sm">{kpis.totalUnits}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{mxnFmt.format(kpis.totalRevenue)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm text-green-400">{mxnFmt.format(kpis.realizedProfit)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm text-cyan-400">{mxnFmt.format(kpis.realizedProfitBonif)}</TableCell>
                          <TableCell className="text-center"><Badge variant="secondary" className="text-xs">{pctFmt(kpis.marginPct)}</Badge></TableCell>
                          <TableCell className="text-center"><Badge variant="secondary" className="text-xs">{pctFmt(kpis.marginBonifPct)}</Badge></TableCell>
                        </TableRow>
                        {byBrand.map((b, i) => (
                          <TableRow key={b.name} className="border-border">
                            <TableCell className="text-foreground text-sm font-medium">
                              <div className="flex items-center gap-2">
                                <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: brandColors[i % brandColors.length] }} />
                                {b.name}
                              </div>
                            </TableCell>
                            <TableCell className="text-center tabular-nums text-sm">{b.skus}</TableCell>
                            <TableCell className="text-center tabular-nums text-sm">{b.units}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm font-medium">{mxnFmt.format(b.revenue)}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm font-medium text-green-400">{mxnFmt.format(b.profit)}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm font-medium text-cyan-400">{mxnFmt.format(b.profitBonif)}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary" className={cn("text-xs", b.marginPct >= 8 ? "text-green-400" : b.marginPct >= 5 ? "text-amber-400" : "text-red-400")}>
                                {pctFmt(b.marginPct)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary" className={cn("text-xs", b.marginBonifPct >= 8 ? "text-cyan-400" : b.marginBonifPct >= 5 ? "text-amber-400" : "text-red-400")}>
                                {pctFmt(b.marginBonifPct)}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>
            </GlowCard>
          </TabsContent>

          {/* ─── BY ORDER TAB ─── */}
          <TabsContent value="orders" className="mt-4">
            <GlowCard className="overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      <TableHead className="text-muted-foreground w-[100px]">Pedido</TableHead>
                      <TableHead className="text-muted-foreground w-[100px]">Fecha</TableHead>
                      <TableHead className="text-muted-foreground">Cliente</TableHead>
                      <TableHead className="text-muted-foreground text-center w-[70px]">Líneas</TableHead>
                      <TableHead className="text-muted-foreground text-center w-[80px]">Bultos</TableHead>
                      <TableHead className="text-muted-foreground text-right w-[120px]">Ventas</TableHead>
                      <TableHead className="text-muted-foreground text-right w-[120px]">Utilidad</TableHead>
                      <TableHead className="text-muted-foreground text-right w-[120px]">Utilidad c/B</TableHead>
                      <TableHead className="text-muted-foreground text-center w-[80px]">Margen</TableHead>
                      <TableHead className="text-muted-foreground text-center w-[80px]">Margen c/B</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i} className="border-border">
                          {Array.from({ length: 10 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full bg-muted" /></TableCell>)}
                        </TableRow>
                      ))
                    ) : byOrder.length === 0 ? (
                      <TableRow><TableCell colSpan={10} className="text-center py-12 text-muted-foreground">No hay pedidos en este período</TableCell></TableRow>
                    ) : (
                      <>
                        <TableRow className="border-border bg-muted/30 font-semibold">
                          <TableCell className="text-foreground text-sm">Total</TableCell>
                          <TableCell />
                          <TableCell />
                          <TableCell />
                          <TableCell className="text-center tabular-nums text-sm">{kpis.totalUnits}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{mxnFmt.format(kpis.totalRevenue)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm text-green-400">{mxnFmt.format(kpis.realizedProfit)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm text-cyan-400">{mxnFmt.format(kpis.realizedProfitBonif)}</TableCell>
                          <TableCell className="text-center"><Badge variant="secondary" className="text-xs">{pctFmt(kpis.marginPct)}</Badge></TableCell>
                          <TableCell className="text-center"><Badge variant="secondary" className="text-xs">{pctFmt(kpis.marginBonifPct)}</Badge></TableCell>
                        </TableRow>
                        {byOrder.map(o => (
                          <TableRow key={o.id} className="border-border">
                            <TableCell className="font-mono font-semibold text-foreground text-sm">{o.code}</TableCell>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{format(parseLocalDate(o.date), "dd MMM yyyy", { locale: es })}</TableCell>
                            <TableCell className="font-medium text-foreground text-sm">{o.clientName}</TableCell>
                            <TableCell className="text-center tabular-nums text-sm">{o.items}</TableCell>
                            <TableCell className="text-center tabular-nums text-sm">{o.units}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm font-medium">{mxnFmt.format(o.revenue)}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm font-medium text-green-400">{mxnFmt.format(o.profit)}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm font-medium text-cyan-400">{mxnFmt.format(o.profitBonif)}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary" className={cn("text-xs", o.marginPct >= 8 ? "text-green-400" : o.marginPct >= 5 ? "text-amber-400" : "text-red-400")}>
                                {pctFmt(o.marginPct)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary" className={cn("text-xs", o.marginBonifPct >= 8 ? "text-cyan-400" : o.marginBonifPct >= 5 ? "text-amber-400" : "text-red-400")}>
                                {pctFmt(o.marginBonifPct)}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>
            </GlowCard>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
