import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { GlowCard } from "@/components/ui/spotlight-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/orders/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  RefreshCw, AlertTriangle, Package, Truck, TruckIcon, AlertCircle,
  DollarSign, BoxesIcon, TrendingUp, Warehouse, ShoppingCart, Users, BarChart3, ArrowRight
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern";
import { ChronoBar } from "@/components/ChronoBar";
import { PartnerDashboardView } from "@/components/partners/PartnerDashboardView";
import { ChannelsSummaryStrip } from "@/components/partners/ChannelsSummaryStrip";
import { useLanguage } from "@/hooks/use-language";
import { parseLocalDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

const mxnFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const fmtMXN = (v: number | null) => {
  if (v == null) return "$0";
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  return mxnFmt.format(v);
};
const fmtMXNFull = (v: number | null) => {
  if (v == null) return "$0";
  return mxnFmt.format(v);
};
const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try { return format(parseLocalDate(d), "dd/MM/yy"); } catch { return d; }
};
const isUrgent = (dateStr: string | null) => {
  if (!dateStr) return false;
  try { return differenceInDays(parseLocalDate(dateStr), new Date()) <= 2; } catch { return false; }
};

const STATUS_COLORS: Record<string, string> = {
  Nuevo: "#3b82f6",
  Confirmado: "#8b5cf6",
  "En preparacion": "#f59e0b",
  "En ruta": "#f97316",
  Entregado: "#22c55e",
};

export default function Dashboard() {
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // ── Date filter ──
  const getFirstOfMonth = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  };
  const getNextMonth = (from: string) => {
    const d = parseLocalDate(from);
    d.setMonth(d.getMonth() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  };
  const [dateFrom, setDateFrom] = useState(getFirstOfMonth());
  const [dateTo, setDateTo] = useState("");

  // Business-unit filter at the top of the dashboard.
  //   - "naucalpan" → the existing direct-sales dashboard (unchanged)
  //   - "tamemes" / "gdl" → PartnerDashboardView for that partner
  //   - "all"      → Naucalpan dashboard + a partners-summary strip
  //                  at the top so totals are visible side-by-side.
  const [businessView, setBusinessView] = useState<"all" | "naucalpan" | "tamemes" | "gdl">("naucalpan");

  // Compute p_start / p_end for the RPC (p_end is exclusive)
  const pStart = dateFrom || "2020-01-01";
  const pEnd = useMemo(() => {
    if (dateTo) {
      const d = parseLocalDate(dateTo);
      d.setDate(d.getDate() + 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    if (dateFrom && dateFrom !== "2020-01-01") return getNextMonth(dateFrom);
    return "2099-12-31";
  }, [dateFrom, dateTo]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    el.style.setProperty("--x", `${e.clientX}px`);
    el.style.setProperty("--y", `${e.clientY}px`);
  }, []);

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return t("greeting_morning");
    if (h < 19) return t("greeting_afternoon");
    return t("greeting_evening");
  };

  // ── Queries ──

  // Date-dependent KPIs, top clients, top products — single RPC call
  const rangeData = useQuery({
    queryKey: ["dashboard-range", pStart, pEnd],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_kpis_for_range", { p_start: pStart, p_end: pEnd });
      if (error) throw error;
      setLastUpdated(new Date());
      return data as any;
    },
  });

  // Alias for backward compat with existing template
  const kpis = { data: rangeData.data, isLoading: rangeData.isLoading, isFetching: rangeData.isFetching };
  const topClientsData: any[] = rangeData.data?.top_clients ?? [];
  const topProductsData: any[] = rangeData.data?.top_products ?? [];

  // Dashboard warehouse chips are labeled from the default empresa's almacenes
  // (Configuración → Empresas). Falls back to generic "Almacén N" if no
  // empresa/almacenes are configured yet. Keys stay stable so downstream
  // partner-dashboard wiring (tamemes/gdl) is unchanged.
  const almacenesEmpresa = useQuery({
    queryKey: ["dashboard-almacenes"],
    queryFn: async () => {
      const { data: emp } = await supabase
        .from("empresas" as any)
        .select("id, is_default, nombre_comercial, razon_social")
        .eq("active", true)
        .order("is_default", { ascending: false })
        .order("razon_social")
        .limit(1);
      const empresa: any = Array.isArray(emp) && emp.length > 0 ? emp[0] : null;
      if (!empresa) return [] as { nombre: string; direccion: string | null }[];
      const { data } = await supabase
        .from("almacenes")
        .select("nombre, direccion, principal")
        .eq("empresa_id", empresa.id)
        .eq("activo", true)
        .order("principal", { ascending: false })
        .order("nombre");
      return (data ?? []) as { nombre: string; direccion: string | null }[];
    },
  });

  // Non-date-dependent queries (always current state)
  const openOrders = useQuery({
    queryKey: ["dashboard-open-orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_open_orders").select("*").order("delivery_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const purchaseNeeds = useQuery({
    queryKey: ["dashboard-purchase-needs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_purchase_needs").select("*");
      if (error) throw error;
      return (data ?? []).filter((r: any) => r.units_to_buy != null && Number(r.units_to_buy) > 0);
    },
  });

  const warehouseValue = useQuery({
    queryKey: ["dashboard-warehouse-value"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_products_with_stock")
        .select("stock_actual, cost_with_iva, active")
        .eq("active", true);
      if (error) throw error;
      return (data ?? []).reduce(
        (s: number, p: any) => s + (Number(p.stock_actual) || 0) * (Number(p.cost_with_iva) || 0),
        0
      );
    },
  });

  // Bultos programados a llegar en los próximos 7 días
  const incoming7d = useQuery({
    queryKey: ["dashboard-incoming-7d"],
    queryFn: async () => {
      const today = new Date();
      const in7 = new Date();
      in7.setDate(in7.getDate() + 7);
      const ymd = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const { data, error } = await (supabase as any)
        .from("stock_entries")
        .select("quantity, delivery:stock_deliveries!inner(delivery_date, delivery_status)")
        .eq("delivery.delivery_status", "Programado")
        .gte("delivery.delivery_date", ymd(today))
        .lte("delivery.delivery_date", ymd(in7));
      if (error) throw error;
      return (data ?? []).reduce((s: number, r: any) => s + Number(r.quantity ?? 0), 0);
    },
  });

  const purchaseByOrder = useQuery({
    queryKey: ["dashboard-purchase-by-order"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_purchase_by_order").select("*");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Necesidades de compra summary
  const purchaseSummary = useMemo(() => {
    const rows = purchaseByOrder.data ?? [];
    const shortRows = rows.filter((r: any) => r.product_units_short > 0);

    // Unique SKUs con faltante
    const skuSet = new Set(shortRows.map((r: any) => r.product_id));
    const skusConFaltante = skuSet.size;

    // Total bultos a comprar (unique per product — take max shortage across orders)
    const skuShortMap = new Map<string, number>();
    for (const r of shortRows) {
      const current = skuShortMap.get(r.product_id) ?? 0;
      if (r.product_units_short > current) skuShortMap.set(r.product_id, r.product_units_short);
    }
    const bultosAComprar = Array.from(skuShortMap.values()).reduce((s, v) => s + v, 0);

    // Inversión estimada
    const skuCostMap = new Map<string, { short: number; cost: number }>();
    for (const r of shortRows) {
      const current = skuCostMap.get(r.product_id);
      if (!current || r.product_units_short > current.short) {
        skuCostMap.set(r.product_id, { short: r.product_units_short, cost: r.cost_with_iva ?? 0 });
      }
    }
    const inversionEstimada = Array.from(skuCostMap.values()).reduce((s, v) => s + v.short * v.cost, 0);

    // Orders at risk with delivery dates, sorted by nearest date
    const orderMap = new Map<string, { order_code: string; client_name: string; delivery_date: string | null; skusShort: number; bultosShort: number }>();
    for (const r of shortRows) {
      let o = orderMap.get(r.order_id);
      if (!o) {
        o = { order_code: r.order_code, client_name: r.client_name, delivery_date: r.delivery_date, skusShort: 0, bultosShort: 0 };
        orderMap.set(r.order_id, o);
      }
      o.skusShort++;
      o.bultosShort += r.product_units_short;
    }
    const ordersAtRisk = Array.from(orderMap.values()).sort((a, b) => {
      if (!a.delivery_date && !b.delivery_date) return 0;
      if (!a.delivery_date) return 1;
      if (!b.delivery_date) return -1;
      return a.delivery_date.localeCompare(b.delivery_date);
    });

    return { skusConFaltante, bultosAComprar, inversionEstimada, ordersAtRisk };
  }, [purchaseByOrder.data]);

  const refetchAll = () => {
    rangeData.refetch();
    openOrders.refetch();
    purchaseNeeds.refetch();
    purchaseByOrder.refetch();
    warehouseValue.refetch();
  };

  const dateLocale = lang === "en" ? enUS : es;
  // Compute the 5 operational-pulse KPIs client-side from data we already
  // have. The dashboard_kpis_for_range RPC doesn't include them, but the
  // numbers we need are sitting in openOrders + ordersAtRisk + incoming7d.
  const operationalKpis = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isSameDay = (iso: string | null | undefined, ref: Date) => {
      if (!iso) return false;
      const d = new Date(iso + "T12:00:00");
      return d.getFullYear() === ref.getFullYear() &&
        d.getMonth() === ref.getMonth() &&
        d.getDate() === ref.getDate();
    };
    const open = (openOrders.data ?? []) as any[];
    return {
      open_orders: open.length,
      due_today: open.filter((o) => isSameDay(o.delivery_date, today)).length,
      due_tomorrow: open.filter((o) => isSameDay(o.delivery_date, tomorrow)).length,
      orders_at_risk: purchaseSummary.ordersAtRisk?.length ?? 0,
      bultos_incoming_7d: incoming7d.data ?? 0,
    };
  }, [openOrders.data, purchaseSummary.ordersAtRisk, incoming7d.data]);

  const d = { ...(kpis.data ?? {}), ...operationalKpis } as any;

  // ── Pie chart data ──
  const pieData = useMemo(() => {
    if (!d) return [];
    const entries = [
      { label: "Nuevo", count: d.status_nuevo ?? 0, color: STATUS_COLORS.Nuevo },
      { label: "Confirmado", count: d.status_confirmado ?? 0, color: STATUS_COLORS.Confirmado },
      { label: "En preparación", count: d.status_en_prep ?? 0, color: STATUS_COLORS["En preparacion"] },
      { label: "En ruta", count: d.status_en_ruta ?? 0, color: STATUS_COLORS["En ruta"] },
      { label: "Entregado", count: d.status_entregado ?? 0, color: STATUS_COLORS.Entregado },
    ].filter(e => e.count > 0);
    const total = entries.reduce((s, e) => s + e.count, 0);
    if (total === 0) return [];
    let start = 0;
    return entries.map(e => {
      const pct = (e.count / total) * 100;
      const seg = { ...e, pct, start, end: start + pct };
      start += pct;
      return seg;
    });
  }, [d]);

  const conicGradient = pieData.map(s => `${s.color} ${s.start}% ${s.end}%`).join(", ");
  const totalOrders = pieData.reduce((s, e) => s + e.count, 0);

  // ── Bar chart helpers ──
  const clientMax = topClientsData.length > 0 ? Math.max(...topClientsData.map((c: any) => c.total_sales)) : 1;
  const productMax = topProductsData.length > 0 ? Math.max(...topProductsData.map((p: any) => p.total_bultos)) : 1;

  return (
    <div className="relative bg-background" onPointerMove={handlePointerMove}>
      <AnimatedGridPattern
        className="inset-x-0 inset-y-[-40%] h-[220%] [mask-image:radial-gradient(900px_circle_at_center,white,transparent_85%)]"
      />

      <div className="relative z-10 p-3 sm:p-4 md:p-8 space-y-4 sm:space-y-6 overflow-x-hidden">
        {/* ── Header ── */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-xl sm:text-2xl md:text-3xl font-bold text-foreground tracking-tight">
              {getGreeting()}
            </h1>
            <p className="text-[11px] sm:text-sm text-muted-foreground capitalize truncate">
              {format(new Date(), "EEEE d 'de' MMMM, yyyy", { locale: dateLocale })}
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {lastUpdated && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {format(lastUpdated, "HH:mm:ss")}
              </span>
            )}
            <Button
              variant="outline" size="sm" onClick={refetchAll} disabled={kpis.isFetching}
              className="border-border text-foreground hover:bg-muted transition-all"
            >
              <RefreshCw className={`h-4 w-4 sm:mr-2 ${kpis.isFetching ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{t("refresh")}</span>
            </Button>
          </div>
        </div>

        {/* Date filter */}
        <ChronoBar
          dateFrom={dateFrom}
          dateTo={dateTo}
          onChange={(from, to) => { setDateFrom(from); setDateTo(to); }}
          allTimeFrom="2020-01-01"
          compact
        />

        {/* Business-unit filter — labels are driven by the default empresa's almacenes.
            Configure in Configuración → Empresas → Almacenes. */}
        <div className="-mx-3 px-3 sm:mx-0 sm:px-0 flex gap-1.5 overflow-x-auto sm:flex-wrap sm:overflow-visible pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">

          {(() => {
            const alms = almacenesEmpresa.data ?? [];
            const n = (i: number, fallback: string) => alms[i]?.nombre?.trim() || fallback;
            const d = (i: number, fallback: string) => alms[i]?.direccion?.trim() || fallback;
            const chips = [
              { key: "all" as const,       label: "Todo",              sub: `${n(0, "Almacén 1")} + Partners` },
              { key: "naucalpan" as const, label: n(0, "Almacén 1"),   sub: d(0, "Ventas directas") },
              { key: "tamemes" as const,   label: n(1, "Almacén 2"),   sub: d(1, "Liquidación mensual") },
              { key: "gdl" as const,       label: n(2, "Almacén 3"),   sub: d(2, "Markup por embarque") },
            ];
            return chips.map(v => {
              const isActive = businessView === v.key;
              return (
                <button
                  key={v.key}
                  onClick={() => setBusinessView(v.key)}
                  className={cn(
                    "shrink-0 px-3 py-2 rounded-lg text-xs font-medium border transition-colors text-left",
                    isActive
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-foreground border-border hover:border-primary/50 hover:bg-muted/40",
                  )}
                >
                  <div className="font-semibold">{v.label}</div>
                  <div className={cn("text-[10px] font-normal", isActive ? "opacity-80" : "text-muted-foreground")}>
                    {v.sub}
                  </div>
                </button>
              );
            });
          })()}
        </div>


        {/* Conditional content based on business view */}
        {businessView === "tamemes" && (
          <PartnerDashboardView partnerCode="TAM" dateFrom={dateFrom} dateTo={dateTo} />
        )}
        {businessView === "gdl" && (
          <PartnerDashboardView partnerCode="GDL" dateFrom={dateFrom} dateTo={dateTo} />
        )}

        {/* For "all" + "naucalpan" we keep the original Naucalpan dashboard
            below this point. "all" additionally shows a clean 3-channel
            summary strip — one card per channel — instead of stacking the
            full partner dashboards (that was visually chaotic). */}
        {businessView === "all" && (
          <ChannelsSummaryStrip
            dateFrom={dateFrom}
            dateTo={dateTo}
            pStart={pStart}
            pEnd={pEnd}
            onPickChannel={setBusinessView}
          />
        )}

        {(businessView === "naucalpan" || businessView === "all") && (
        <>

        {/* ── Row 1: Hero KPIs (4 large cards) ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
          {/* Ventas del mes */}
          <GlowCard>
            <div
              className="p-3.5 sm:p-5 cursor-pointer hover:bg-muted/30 transition-all rounded-lg"
              onClick={() => navigate("/admin/pedidos")}
            >
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="h-4 w-4 text-green-500" />
                <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground leading-tight">Ventas del mes</span>
              </div>
              {kpis.isLoading ? <Skeleton className="h-10 w-32 bg-muted" /> : (
                <p className="text-xl sm:text-3xl font-bold text-foreground tracking-tight break-words">{fmtMXNFull(d?.ventas_mes_iva ?? 0)}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">Total con IVA · pedidos del mes</p>
            </div>
          </GlowCard>

          {/* Utilidad del mes */}
          <GlowCard>
            <div
              className="p-3.5 sm:p-5 cursor-pointer hover:bg-muted/30 transition-all rounded-lg"
              onClick={() => navigate("/admin/pedidos")}
            >
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground leading-tight">Utilidad del mes</span>
              </div>
              {kpis.isLoading ? <Skeleton className="h-10 w-32 bg-muted" /> : (
                <div className="space-y-1">
                  <div className="flex items-baseline gap-2">
                    <p className="text-xl sm:text-2xl font-bold text-foreground tracking-tight break-words">{fmtMXNFull(d?.realized_profit ?? 0)}</p>
                    <span className="text-xs text-muted-foreground">realizada</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <p className="text-base sm:text-lg font-semibold text-muted-foreground break-words">{fmtMXNFull(d?.implied_profit ?? 0)}</p>
                    <span className="text-xs text-muted-foreground">implicada</span>
                  </div>
                </div>
              )}
            </div>
          </GlowCard>

          {/* Utilidad con bonificación */}
          <GlowCard>
            <div
              className="p-3.5 sm:p-5 cursor-pointer hover:bg-muted/30 transition-all rounded-lg"
              onClick={() => navigate("/admin/pedidos")}
            >
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-cyan-500" />
                <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground leading-tight">Utilidad c/ bonificación</span>
              </div>
              {kpis.isLoading ? <Skeleton className="h-10 w-32 bg-muted" /> : (
                <div className="space-y-1">
                  <div className="flex items-baseline gap-2">
                    <p className="text-xl sm:text-2xl font-bold text-foreground tracking-tight break-words">{fmtMXNFull(d?.realized_profit_bonif ?? 0)}</p>
                    <span className="text-xs text-muted-foreground">realizada</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <p className="text-base sm:text-lg font-semibold text-muted-foreground break-words">{fmtMXNFull(d?.implied_profit_bonif ?? 0)}</p>
                    <span className="text-xs text-muted-foreground">implicada</span>
                  </div>
                </div>
              )}
            </div>
          </GlowCard>

          {/* Valor en bodega */}
          <GlowCard>
            <div
              className="p-3.5 sm:p-5 cursor-pointer hover:bg-muted/30 transition-all rounded-lg"
              onClick={() => navigate("/admin/productos")}
            >
              <div className="flex items-center gap-2 mb-3">
                <Warehouse className="h-4 w-4 text-violet-500" />
                <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground leading-tight">Valor en bodega</span>
              </div>
              {warehouseValue.isLoading ? <Skeleton className="h-10 w-32 bg-muted" /> : (
                <p className="text-xl sm:text-3xl font-bold text-foreground tracking-tight break-words">{fmtMXN(warehouseValue.data ?? 0)}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">Inventario valorizado a costo</p>
            </div>
          </GlowCard>
        </div>

        {/* ── Row 2: Operational pulse (5 compact cards) ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
          {[
            { key: "open_orders", label: "Pedidos abiertos", icon: Package, color: "text-blue-500", border: "border-blue-500", to: "/admin/pedidos" },
            { key: "due_today", label: "Entrega hoy", icon: Truck, color: "text-amber-500", border: "border-amber-500", to: "/admin/pedidos" },
            { key: "due_tomorrow", label: "Entrega mañana", icon: TruckIcon, color: "text-orange-500", border: "border-orange-500", to: "/admin/pedidos" },
            { key: "orders_at_risk", label: "Riesgo de stock", icon: AlertCircle, color: "text-red-500", border: "border-red-500", to: "/admin/productos" },
            { key: "bultos_incoming_7d", label: "Stock entrante 7d", icon: BoxesIcon, color: "text-purple-500", border: "border-purple-500", to: "/admin/entradas" },
          ].map((kpi) => (
            <GlowCard key={kpi.key}>
              <div
                className={`p-3 sm:p-4 flex flex-col justify-between gap-1.5 min-h-[86px] sm:min-h-[100px] border-l-4 ${kpi.border} rounded-l cursor-pointer hover:bg-muted/30 transition-all`}
                onClick={() => navigate(kpi.to)}
              >
                <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                {kpis.isLoading ? <Skeleton className="h-7 w-12 bg-muted" /> : (
                  <p className="text-2xl font-bold text-foreground tracking-tight">
                    {d?.[kpi.key] ?? 0}
                  </p>
                )}
                <span className="text-xs text-muted-foreground font-medium">{kpi.label}</span>
              </div>
            </GlowCard>
          ))}
        </div>

        {/* ── Row 3: Top clients + Top products ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
          {/* Top 5 clients */}
          <GlowCard>
            <div
              className="p-3.5 sm:p-5 cursor-pointer hover:bg-muted/30 transition-all rounded-lg"
              onClick={() => navigate("/admin/clientes")}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-emerald-500" />
                  <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground leading-tight">Top 5 clientes por ventas</span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
              {rangeData.isLoading ? (
                <div className="space-y-3">
                  {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-8 w-full bg-muted" />)}
                </div>
              ) : topClientsData.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">Sin datos</p>
              ) : (
                <div className="space-y-3">
                  {topClientsData.map((c: any, i: number) => (
                    <div key={i}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-foreground truncate mr-2">{c.client_name}</span>
                        <span className="font-semibold text-foreground tabular-nums">{fmtMXNFull(c.total_sales)}</span>
                      </div>
                      <div className="w-full bg-muted/50 rounded-full h-2">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
                          style={{ width: `${(c.total_sales / clientMax) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </GlowCard>

          {/* Top 5 products by bultos */}
          <GlowCard>
            <div
              className="p-3.5 sm:p-5 cursor-pointer hover:bg-muted/30 transition-all rounded-lg"
              onClick={() => navigate("/admin/productos")}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-violet-500" />
                  <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground leading-tight">Top 5 productos por bultos</span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
              {rangeData.isLoading ? (
                <div className="space-y-3">
                  {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-8 w-full bg-muted" />)}
                </div>
              ) : topProductsData.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">Sin datos</p>
              ) : (
                <div className="space-y-3">
                  {topProductsData.map((p: any, i: number) => (
                    <div key={i}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-foreground truncate mr-2">
                          <span className="font-mono text-xs text-primary mr-1">{p.clave}</span>
                          {p.product_name}
                        </span>
                        <span className="font-semibold text-foreground tabular-nums whitespace-nowrap">{p.total_bultos} bultos</span>
                      </div>
                      <div className="w-full bg-muted/50 rounded-full h-2">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-violet-400 transition-all"
                          style={{ width: `${(p.total_bultos / productMax) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </GlowCard>
        </div>

        {/* ── Row 4: Pie chart + Necesidades de compra ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
          {/* Order status pie */}
          <GlowCard>
            <div
              className="p-3.5 sm:p-5 cursor-pointer hover:bg-muted/30 transition-all rounded-lg"
              onClick={() => navigate("/admin/pedidos")}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4 text-blue-500" />
                  <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground leading-tight">Pedidos del mes por estado</span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
              {kpis.isLoading ? (
                <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
                  <Skeleton className="w-28 h-28 rounded-full bg-muted" />
                  <div className="space-y-2 flex-1">
                    {[1,2,3].map(i => <Skeleton key={i} className="h-4 w-full bg-muted" />)}
                  </div>
                </div>
              ) : pieData.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">Sin pedidos este mes</p>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
                  <div className="relative">
                    <div
                      className="w-28 h-28 rounded-full"
                      style={{ background: `conic-gradient(${conicGradient})` }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-16 h-16 rounded-full bg-card flex items-center justify-center">
                        <span className="text-lg font-bold text-foreground">{totalOrders}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 space-y-2">
                    {pieData.map(s => (
                      <div key={s.label} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: s.color }} />
                          <span className="text-foreground">{s.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">{s.count}</span>
                          <span className="text-muted-foreground text-xs">({s.pct.toFixed(0)}%)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </GlowCard>

          {/* Necesidades de compra */}
          <GlowCard className="h-full">
            <div
              className="p-5 cursor-pointer hover:bg-muted/30 transition-all rounded-lg h-full flex flex-col"
              onClick={() => navigate("/admin/necesidades")}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground leading-tight">Necesidades de compra</span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
              {purchaseByOrder.isLoading ? (
                <div className="space-y-3 flex-1">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full bg-muted" />)}
                </div>
              ) : purchaseSummary.ordersAtRisk.length === 0 ? (
                <p className="text-green-500 text-sm text-center flex-1 flex items-center justify-center">Todo cubierto — sin faltantes</p>
              ) : (
                <div className="flex flex-col flex-1">
                  {/* Summary stats */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="text-center">
                      <p className="text-xl font-bold text-foreground">{purchaseSummary.skusConFaltante}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">SKUs</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-bold text-red-500">{purchaseSummary.bultosAComprar.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Bultos</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-bold text-foreground">{fmtMXN(purchaseSummary.inversionEstimada)}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Inversión</p>
                    </div>
                  </div>
                  {/* Orders sorted by delivery date */}
                  <div className="flex-1 flex flex-col justify-evenly">
                    {purchaseSummary.ordersAtRisk.slice(0, 5).map((o, i) => {
                      const urgent = isUrgent(o.delivery_date);
                      const overdue = o.delivery_date ? parseLocalDate(o.delivery_date) < new Date() : false;
                      return (
                        <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-border/30 last:border-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono text-xs text-blue-400">{o.order_code}</span>
                            <span className="text-foreground truncate">{o.client_name}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-xs font-medium tabular-nums ${overdue ? "text-red-500" : urgent ? "text-amber-500" : "text-muted-foreground"}`}>
                              {o.delivery_date ? fmtDate(o.delivery_date) : "Sin fecha"}
                            </span>
                            <span className="text-xs font-bold text-red-500">{o.bultosShort}</span>
                          </div>
                        </div>
                      );
                    })}
                    {purchaseSummary.ordersAtRisk.length > 5 && (
                      <p className="text-xs text-muted-foreground text-center pt-1">
                        +{purchaseSummary.ordersAtRisk.length - 5} más
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </GlowCard>
        </div>

        {/* ── Row 5: Open Orders table ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{t("openOrders")}</h2>
              <div className="h-0.5 w-12 bg-blue-500 rounded mt-1" />
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin/pedidos")} className="text-muted-foreground hover:text-foreground">
              Ver todos <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
          <GlowCard>
            <div className="p-1">
              {openOrders.isLoading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full bg-muted" />)}
                </div>
              ) : (openOrders.data?.length ?? 0) === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">{t("noOpenOrders")}</p>
              ) : (
                <div className="w-full overflow-x-auto"><Table className="min-w-[640px]">
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-foreground font-semibold">{t("thOrder")}</TableHead>
                      <TableHead className="text-foreground font-semibold">{t("thClient")}</TableHead>
                      <TableHead className="text-foreground font-semibold">{t("thOrderDate")}</TableHead>
                      <TableHead className="text-foreground font-semibold">{t("thDeliveryDate")}</TableHead>
                      <TableHead className="text-foreground font-semibold">{t("thStatus")}</TableHead>
                      <TableHead className="text-foreground font-semibold text-right">{t("thTotal")}</TableHead>
                      <TableHead className="text-foreground font-semibold text-center">{t("thRisk")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {openOrders.data?.map((o: any) => (
                      <TableRow
                        key={o.id}
                        className="border-border hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => navigate(`/admin/pedidos?openOrderId=${o.id}`)}
                      >
                        <TableCell className="font-mono font-medium text-blue-400">{o.order_code ?? "—"}</TableCell>
                        <TableCell className="text-foreground">{o.client_name ?? "—"}</TableCell>
                        <TableCell className="text-foreground">{fmtDate(o.order_date)}</TableCell>
                        <TableCell className="text-foreground">{fmtDate(o.delivery_date)}</TableCell>
                        <TableCell><StatusBadge status={o.status} /></TableCell>
                        <TableCell className="text-right font-medium text-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>
                          {fmtMXN(o.total_with_iva as number | null)}
                        </TableCell>
                        <TableCell className="text-center">
                          {o.has_stock_risk && <AlertTriangle className="h-4 w-4 text-red-500 inline animate-pulse" />}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table></div>
              )}
            </div>
          </GlowCard>
        </div>

        {/* ── Row 6: Purchase Needs table ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{t("purchaseNeeds")}</h2>
              <div className="h-0.5 w-12 bg-amber-500 rounded mt-1" />
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin/productos")} className="text-muted-foreground hover:text-foreground">
              Ver productos <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
          <GlowCard>
            <div className="p-1">
              {purchaseNeeds.isLoading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full bg-muted" />)}
                </div>
              ) : (purchaseNeeds.data?.length ?? 0) === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">{t("noPurchaseNeeds")}</p>
              ) : (
                <div className="w-full overflow-x-auto"><Table className="min-w-[640px]">
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-foreground font-semibold">{t("thClave")}</TableHead>
                      <TableHead className="text-foreground font-semibold">{t("thProduct")}</TableHead>
                      <TableHead className="text-foreground font-semibold">{t("thSupplier")}</TableHead>
                      <TableHead className="text-foreground font-semibold text-right">{t("thToBuy")}</TableHead>
                      <TableHead className="text-foreground font-semibold text-right">{t("thCommitted")}</TableHead>
                      <TableHead className="text-foreground font-semibold text-right">{t("thIncoming")}</TableHead>
                      <TableHead className="text-foreground font-semibold">{t("thOrderBy")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchaseNeeds.data?.map((r: any, i: number) => (
                      <TableRow key={i} className="border-border hover:bg-muted/50 transition-colors">
                        <TableCell className="font-mono font-medium text-blue-400">{r.clave ?? "—"}</TableCell>
                        <TableCell className="text-foreground">{r.product_name ?? "—"}</TableCell>
                        <TableCell className="text-foreground">{r.supplier ?? "—"}</TableCell>
                        <TableCell className="text-right text-lg font-bold text-red-500">{r.units_to_buy ?? 0}</TableCell>
                        <TableCell className="text-right text-foreground">{r.units_committed ?? 0}</TableCell>
                        <TableCell className="text-right text-foreground">{r.units_incoming ?? 0}</TableCell>
                        <TableCell>
                          {r.order_by_date ? (
                            isUrgent(r.order_by_date) ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                {fmtDate(r.order_by_date)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">{fmtDate(r.order_by_date)}</span>
                            )
                          ) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table></div>
              )}
            </div>
          </GlowCard>
        </div>
        </>
        )}
        {/* end naucalpan/all wrapper */}
      </div>
    </div>
  );
}
