import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/orders/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  RefreshCw, AlertTriangle, Package, Truck, TruckIcon, AlertCircle,
  DollarSign, BoxesIcon, TrendingUp, Warehouse, ShoppingCart, Users, BarChart3,
  ArrowRight, PlusCircle, Route, ClipboardList, Receipt, Boxes, Sparkles,
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { ChronoBar } from "@/components/ChronoBar";
import { PartnerDashboardView } from "@/components/partners/PartnerDashboardView";
import { ChannelsSummaryStrip } from "@/components/partners/ChannelsSummaryStrip";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { parseLocalDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import {
  Sparkline, MiniBars, Donut, RankRow, Panel, PanelEmpty, PanelLoading, QuickAction,
} from "@/components/dashboard/dashboard-widgets";

const mxnFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const fmtMXN = (v: number | null) => {
  if (v == null) return "$0";
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  return mxnFmt.format(v);
};
const fmtMXNFull = (v: number | null) => (v == null ? "$0" : mxnFmt.format(v));
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

/** Which dashboard blocks each role cares about. */
type Block = "finance" | "pulse" | "commercial" | "purchasing" | "warehouse" | "tables";
const ROLE_BLOCKS: Record<string, Block[]> = {
  admin: ["finance", "pulse", "commercial", "purchasing", "warehouse", "tables"],
  contabilidad: ["finance", "commercial", "tables"],
  facturacion: ["finance", "pulse", "commercial", "tables"],
  cobranza: ["finance", "commercial", "tables"],
  ventas: ["finance", "pulse", "commercial", "tables"],
  representante: ["pulse", "commercial"],
  compras: ["pulse", "purchasing", "warehouse", "tables"],
  almacen: ["pulse", "warehouse", "purchasing", "tables"],
  logistica: ["pulse", "warehouse", "tables"],
  viewer: ["pulse", "commercial"],
};

export default function Dashboard() {
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const { role } = useAuth();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const blocks = ROLE_BLOCKS[role ?? "admin"] ?? ROLE_BLOCKS.admin;
  const show = (b: Block) => blocks.includes(b);

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

  const [businessView, setBusinessView] = useState<"all" | "naucalpan" | "tamemes" | "gdl">("naucalpan");

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
  const rangeData = useQuery({
    queryKey: ["dashboard-range", pStart, pEnd],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_kpis_for_range", { p_start: pStart, p_end: pEnd });
      if (error) throw error;
      setLastUpdated(new Date());
      return data as any;
    },
  });

  const kpis = { data: rangeData.data, isLoading: rangeData.isLoading, isFetching: rangeData.isFetching };
  const topClientsData: any[] = rangeData.data?.top_clients ?? [];
  const topProductsData: any[] = rangeData.data?.top_products ?? [];

  // Last 30 days of orders — powers the hero trend chart
  const trend = useQuery({
    queryKey: ["dashboard-trend-30d"],
    queryFn: async () => {
      const from = new Date();
      from.setDate(from.getDate() - 29);
      const ymd = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const { data, error } = await supabase
        .from("orders")
        .select("order_date, total")
        .gte("order_date", ymd(from));
      if (error) throw error;
      const days: { day: string; total: number }[] = [];
      for (let i = 0; i < 30; i++) {
        const d = new Date(from);
        d.setDate(from.getDate() + i);
        days.push({ day: ymd(d), total: 0 });
      }
      const idx = new Map(days.map((d, i) => [d.day, i]));
      (data ?? []).forEach((r: any) => {
        const i = idx.get(String(r.order_date).slice(0, 10));
        if (i != null) days[i].total += Number(r.total ?? 0);
      });
      return days;
    },
  });

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

  const purchaseSummary = useMemo(() => {
    const rows = purchaseByOrder.data ?? [];
    const shortRows = rows.filter((r: any) => r.product_units_short > 0);
    const skusConFaltante = new Set(shortRows.map((r: any) => r.product_id)).size;

    const skuShortMap = new Map<string, number>();
    for (const r of shortRows) {
      const current = skuShortMap.get(r.product_id) ?? 0;
      if (r.product_units_short > current) skuShortMap.set(r.product_id, r.product_units_short);
    }
    const bultosAComprar = Array.from(skuShortMap.values()).reduce((s, v) => s + v, 0);

    const skuCostMap = new Map<string, { short: number; cost: number }>();
    for (const r of shortRows) {
      const current = skuCostMap.get(r.product_id);
      if (!current || r.product_units_short > current.short) {
        skuCostMap.set(r.product_id, { short: r.product_units_short, cost: r.cost_with_iva ?? 0 });
      }
    }
    const inversionEstimada = Array.from(skuCostMap.values()).reduce((s, v) => s + v.short * v.cost, 0);

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
    trend.refetch();
  };

  const dateLocale = lang === "en" ? enUS : es;

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

  const statusSegments = useMemo(() => {
    return [
      { label: "Nuevo", value: d?.status_nuevo ?? 0, color: STATUS_COLORS.Nuevo },
      { label: "Confirmado", value: d?.status_confirmado ?? 0, color: STATUS_COLORS.Confirmado },
      { label: "En preparación", value: d?.status_en_prep ?? 0, color: STATUS_COLORS["En preparacion"] },
      { label: "En ruta", value: d?.status_en_ruta ?? 0, color: STATUS_COLORS["En ruta"] },
      { label: "Entregado", value: d?.status_entregado ?? 0, color: STATUS_COLORS.Entregado },
    ].filter((s) => s.value > 0);
  }, [d]);
  const totalOrders = statusSegments.reduce((s, e) => s + e.value, 0);

  const trendDays = trend.data ?? [];
  const trendTotals = trendDays.map((x) => x.total);
  const last7 = trendTotals.slice(-7).reduce((s, v) => s + v, 0);
  const prev7 = trendTotals.slice(-14, -7).reduce((s, v) => s + v, 0);
  const deltaPct = prev7 > 0 ? ((last7 - prev7) / prev7) * 100 : last7 > 0 ? 100 : 0;

  const clientMax = topClientsData.length > 0 ? Math.max(...topClientsData.map((c: any) => c.total_sales)) : 1;
  const productMax = topProductsData.length > 0 ? Math.max(...topProductsData.map((p: any) => p.total_bultos)) : 1;

  const quickActions = useMemo(() => {
    const all = [
      { key: "pedido", icon: PlusCircle, label: "Nuevo pedido", to: "/admin/pedidos", blocks: ["commercial", "pulse"] },
      { key: "clientes", icon: Users, label: "Clientes", to: "/admin/clientes", blocks: ["commercial"] },
      { key: "rutas", icon: Route, label: "Panel Rep", to: "/rep", blocks: ["commercial"] },
      { key: "inventario", icon: Boxes, label: "Inventario", to: "/admin/inventario", blocks: ["warehouse"] },
      { key: "remisiones", icon: ClipboardList, label: "Remisiones", to: "/admin/almacen/remisiones", blocks: ["warehouse"] },
      { key: "compras", icon: ShoppingCart, label: "Compras", to: "/admin/compras", blocks: ["purchasing"] },
      { key: "facturas", icon: Receipt, label: "Facturas", to: "/admin/facturas", blocks: ["finance"] },
    ];
    return all.filter((a) => a.blocks.some((b) => show(b as Block)));
  }, [blocks]);

  return (
    <div className="relative bg-background" onPointerMove={handlePointerMove}>
      {/* soft ambient background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-70"
        style={{
          background:
            "radial-gradient(70% 100% at 20% 0%, color-mix(in oklab, var(--primary) 14%, transparent), transparent 70%), radial-gradient(60% 90% at 90% 0%, color-mix(in oklab, var(--primary) 8%, transparent), transparent 70%)",
        }}
      />

      <div className="relative z-10 space-y-4 overflow-x-hidden p-3 sm:space-y-5 sm:p-4 md:p-8">
        {/* ── Hero ── */}
        <section className="overflow-hidden rounded-2xl border border-border/70 bg-card/80 backdrop-blur-sm">
          <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-6">
            <div className="min-w-0">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-widest text-primary/80">
                    {role ? role : "IMV"}
                  </p>
                  <h1 className="truncate text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                    {getGreeting()}
                  </h1>
                  <p className="truncate text-[11px] capitalize text-muted-foreground sm:text-sm">
                    {format(new Date(), "EEEE d 'de' MMMM, yyyy", { locale: dateLocale })}
                    {lastUpdated && <span className="hidden sm:inline"> · {format(lastUpdated, "HH:mm")}</span>}
                  </p>
                </div>
                <Button
                  variant="outline" size="sm" onClick={refetchAll} disabled={kpis.isFetching}
                  className="shrink-0"
                >
                  <RefreshCw className={cn("h-4 w-4 sm:mr-2", kpis.isFetching && "animate-spin")} />
                  <span className="hidden sm:inline">{t("refresh")}</span>
                </Button>
              </div>

              <div className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ventas 7 días</p>
                  {trend.isLoading ? (
                    <Skeleton className="mt-1 h-8 w-28 bg-muted" />
                  ) : (
                    <div className="flex items-baseline gap-2">
                      <p className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{fmtMXN(last7)}</p>
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                          deltaPct >= 0 ? "bg-emerald-500/15 text-emerald-600" : "bg-red-500/15 text-red-600",
                        )}
                      >
                        {deltaPct >= 0 ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(0)}%
                      </span>
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground">vs. 7 días previos</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pedidos abiertos</p>
                  <p className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{d?.open_orders ?? 0}</p>
                  <p className="text-[11px] text-muted-foreground">{d?.due_today ?? 0} entregan hoy</p>
                </div>
              </div>
            </div>

            <div className="min-w-0">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Tendencia 30 días
              </p>
              {trend.isLoading ? (
                <Skeleton className="h-[86px] w-full bg-muted" />
              ) : (
                <Sparkline data={trendTotals} height={86} />
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex gap-2 overflow-x-auto border-t border-border/60 px-4 py-3 [scrollbar-width:none] sm:px-5 [&::-webkit-scrollbar]:hidden">
            {quickActions.map((a) => (
              <QuickAction key={a.key} icon={a.icon} label={a.label} onClick={() => navigate(a.to)} />
            ))}
          </div>
        </section>

        {/* Date filter */}
        <ChronoBar
          dateFrom={dateFrom}
          dateTo={dateTo}
          onChange={(from, to) => { setDateFrom(from); setDateTo(to); }}
          allTimeFrom="2020-01-01"
          compact
        />

        {/* Business-unit chips */}
        <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
          {(() => {
            const alms = almacenesEmpresa.data ?? [];
            const n = (i: number, fallback: string) => alms[i]?.nombre?.trim() || fallback;
            const dd = (i: number, fallback: string) => alms[i]?.direccion?.trim() || fallback;
            const chips = [
              { key: "all" as const,       label: "Todo",              sub: `${n(0, "Almacén 1")} + Partners` },
              { key: "naucalpan" as const, label: n(0, "Almacén 1"),   sub: dd(0, "Ventas directas") },
              { key: "tamemes" as const,   label: n(1, "Almacén 2"),   sub: dd(1, "Liquidación mensual") },
              { key: "gdl" as const,       label: n(2, "Almacén 3"),   sub: dd(2, "Markup por embarque") },
            ];
            return chips.map((v) => {
              const isActive = businessView === v.key;
              return (
                <button
                  key={v.key}
                  onClick={() => setBusinessView(v.key)}
                  className={cn(
                    "max-w-[70vw] shrink-0 rounded-xl border px-3 py-2 text-left text-xs font-medium transition-colors sm:max-w-none",
                    isActive
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:border-primary/50 hover:bg-muted/40",
                  )}
                >
                  <div className="truncate font-semibold">{v.label}</div>
                  <div className={cn("truncate text-[10px] font-normal", isActive ? "opacity-80" : "text-muted-foreground")}>
                    {v.sub}
                  </div>
                </button>
              );
            });
          })()}
        </div>

        {businessView === "tamemes" && (
          <PartnerDashboardView partnerCode="TAM" dateFrom={dateFrom} dateTo={dateTo} />
        )}
        {businessView === "gdl" && (
          <PartnerDashboardView partnerCode="GDL" dateFrom={dateFrom} dateTo={dateTo} />
        )}
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

        {/* ── Finance KPIs ── */}
        {show("finance") && (
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
            {[
              {
                key: "ventas",
                icon: DollarSign,
                tint: "text-emerald-500",
                ring: "bg-emerald-500/10",
                label: "Ventas del periodo",
                value: fmtMXNFull(d?.ventas_mes_iva ?? 0),
                sub: "Total con IVA",
                to: "/admin/pedidos",
                chart: <MiniBars data={trendTotals.slice(-14)} className="h-8 mt-2" />,
              },
              {
                key: "utilidad",
                icon: TrendingUp,
                tint: "text-cyan-500",
                ring: "bg-cyan-500/10",
                label: "Utilidad",
                value: fmtMXNFull(d?.realized_profit ?? 0),
                sub: `${fmtMXN(d?.implied_profit ?? 0)} implicada`,
                to: "/admin/pedidos",
              },
              {
                key: "bonif",
                icon: Sparkles,
                tint: "text-violet-500",
                ring: "bg-violet-500/10",
                label: "Utilidad c/ bonificación",
                value: fmtMXNFull(d?.realized_profit_bonif ?? 0),
                sub: `${fmtMXN(d?.implied_profit_bonif ?? 0)} implicada`,
                to: "/admin/pedidos",
              },
              {
                key: "bodega",
                icon: Warehouse,
                tint: "text-amber-500",
                ring: "bg-amber-500/10",
                label: "Valor en bodega",
                value: fmtMXN(warehouseValue.data ?? 0),
                sub: "Inventario a costo",
                to: "/admin/inventario",
              },
            ].map((c) => (
              <button
                key={c.key}
                onClick={() => navigate(c.to)}
                className="group min-w-0 rounded-2xl border border-border/70 bg-card/80 p-3.5 text-left backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 sm:p-5"
              >
                <div className="flex items-center gap-2">
                  <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg", c.ring)}>
                    <c.icon className={cn("h-4 w-4", c.tint)} />
                  </span>
                  <span className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-[11px]">
                    {c.label}
                  </span>
                </div>
                {kpis.isLoading ? (
                  <Skeleton className="mt-3 h-8 w-24 bg-muted" />
                ) : (
                  <p className="mt-2.5 break-words text-lg font-bold tracking-tight text-foreground sm:text-2xl">
                    {c.value}
                  </p>
                )}
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{c.sub}</p>
                {c.chart}
              </button>
            ))}
          </div>
        )}

        {/* ── Operational pulse ── */}
        {show("pulse") && (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
            {[
              { key: "open_orders", label: "Pedidos abiertos", icon: Package, tint: "text-blue-500", ring: "bg-blue-500/10", to: "/admin/pedidos" },
              { key: "due_today", label: "Entrega hoy", icon: Truck, tint: "text-amber-500", ring: "bg-amber-500/10", to: "/admin/pedidos" },
              { key: "due_tomorrow", label: "Entrega mañana", icon: TruckIcon, tint: "text-orange-500", ring: "bg-orange-500/10", to: "/admin/pedidos" },
              { key: "orders_at_risk", label: "Riesgo de stock", icon: AlertCircle, tint: "text-red-500", ring: "bg-red-500/10", to: "/admin/necesidades" },
              { key: "bultos_incoming_7d", label: "Stock entrante 7d", icon: BoxesIcon, tint: "text-violet-500", ring: "bg-violet-500/10", to: "/admin/entradas" },
            ].map((kpi) => (
              <button
                key={kpi.key}
                onClick={() => navigate(kpi.to)}
                className="flex min-w-0 items-center gap-3 rounded-2xl border border-border/70 bg-card/80 p-3 text-left backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 sm:p-4"
              >
                <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", kpi.ring)}>
                  <kpi.icon className={cn("h-4 w-4", kpi.tint)} />
                </span>
                <span className="min-w-0">
                  {openOrders.isLoading ? (
                    <Skeleton className="h-6 w-10 bg-muted" />
                  ) : (
                    <span className="block text-xl font-bold leading-none tracking-tight text-foreground sm:text-2xl">
                      {d?.[kpi.key] ?? 0}
                    </span>
                  )}
                  <span className="mt-1 block truncate text-[11px] font-medium text-muted-foreground">{kpi.label}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {/* ── Commercial: top clients + products ── */}
        {show("commercial") && (
          <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
            <Panel
              icon={Users}
              title="Top clientes por ventas"
              accent="text-emerald-500"
              hint="periodo seleccionado"
              onClick={() => navigate("/admin/clientes")}
            >
              {rangeData.isLoading ? <PanelLoading rows={5} /> :
                topClientsData.length === 0 ? <PanelEmpty>Sin datos</PanelEmpty> : (
                <div className="space-y-3">
                  {topClientsData.slice(0, 5).map((c: any, i: number) => (
                    <RankRow
                      key={i}
                      rank={i + 1}
                      name={c.client_name}
                      value={fmtMXN(c.total_sales)}
                      pct={(c.total_sales / clientMax) * 100}
                      gradient="from-emerald-500 to-emerald-400"
                    />
                  ))}
                </div>
              )}
            </Panel>

            <Panel
              icon={BarChart3}
              title="Top productos por bultos"
              accent="text-violet-500"
              onClick={() => navigate("/admin/inventario")}
            >
              {rangeData.isLoading ? <PanelLoading rows={5} /> :
                topProductsData.length === 0 ? <PanelEmpty>Sin datos</PanelEmpty> : (
                <div className="space-y-3">
                  {topProductsData.slice(0, 5).map((p: any, i: number) => (
                    <RankRow
                      key={i}
                      rank={i + 1}
                      name={p.product_name}
                      meta={p.clave}
                      value={`${p.total_bultos} bultos`}
                      pct={(p.total_bultos / productMax) * 100}
                      gradient="from-violet-500 to-violet-400"
                    />
                  ))}
                </div>
              )}
            </Panel>
          </div>
        )}

        {/* ── Status donut + purchase needs ── */}
        <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
          {show("commercial") && (
            <Panel
              icon={ShoppingCart}
              title="Pedidos por estado"
              accent="text-blue-500"
              onClick={() => navigate("/admin/pedidos")}
            >
              {kpis.isLoading ? <PanelLoading rows={4} /> :
                statusSegments.length === 0 ? <PanelEmpty>Sin pedidos en el periodo</PanelEmpty> : (
                <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
                  <Donut
                    segments={statusSegments}
                    label="Pedidos por estado"
                    center={
                      <>
                        <span className="text-2xl font-bold text-foreground">{totalOrders}</span>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">pedidos</span>
                      </>
                    }
                  />
                  <div className="w-full flex-1 space-y-2">
                    {statusSegments.map((s) => (
                      <div key={s.label} className="flex items-center justify-between gap-2 text-[13px]">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                          <span className="truncate text-foreground">{s.label}</span>
                        </div>
                        <div className="shrink-0 tabular-nums">
                          <span className="font-semibold text-foreground">{s.value}</span>
                          <span className="ml-1 text-[11px] text-muted-foreground">
                            ({((s.value / totalOrders) * 100).toFixed(0)}%)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Panel>
          )}

          {show("purchasing") && (
            <Panel
              icon={AlertTriangle}
              title="Necesidades de compra"
              accent="text-red-500"
              onClick={() => navigate("/admin/necesidades")}
            >
              {purchaseByOrder.isLoading ? <PanelLoading rows={4} /> :
                purchaseSummary.ordersAtRisk.length === 0 ? (
                  <PanelEmpty>
                    <span className="text-emerald-600">Todo cubierto — sin faltantes</span>
                  </PanelEmpty>
                ) : (
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { v: String(purchaseSummary.skusConFaltante), l: "SKUs", c: "text-foreground" },
                      { v: purchaseSummary.bultosAComprar.toLocaleString(), l: "Bultos", c: "text-red-500" },
                      { v: fmtMXN(purchaseSummary.inversionEstimada), l: "Inversión", c: "text-foreground" },
                    ].map((s) => (
                      <div key={s.l} className="rounded-xl bg-muted/40 p-2 text-center">
                        <p className={cn("truncate text-base font-bold sm:text-lg", s.c)}>{s.v}</p>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.l}</p>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1">
                    {purchaseSummary.ordersAtRisk.slice(0, 5).map((o, i) => {
                      const urgent = isUrgent(o.delivery_date);
                      const overdue = o.delivery_date ? parseLocalDate(o.delivery_date) < new Date() : false;
                      return (
                        <div key={i} className="flex items-center justify-between gap-2 border-b border-border/30 py-1.5 text-[13px] last:border-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="shrink-0 font-mono text-[11px] text-primary">{o.order_code}</span>
                            <span className="truncate text-foreground">{o.client_name}</span>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className={cn(
                              "text-[11px] font-medium tabular-nums",
                              overdue ? "text-red-500" : urgent ? "text-amber-500" : "text-muted-foreground",
                            )}>
                              {o.delivery_date ? fmtDate(o.delivery_date) : "Sin fecha"}
                            </span>
                            <span className="text-[11px] font-bold text-red-500">{o.bultosShort}</span>
                          </div>
                        </div>
                      );
                    })}
                    {purchaseSummary.ordersAtRisk.length > 5 && (
                      <p className="pt-1 text-center text-[11px] text-muted-foreground">
                        +{purchaseSummary.ordersAtRisk.length - 5} más
                      </p>
                    )}
                  </div>
                </div>
              )}
            </Panel>
          )}
        </div>

        {/* ── Tables ── */}
        {show("tables") && (
        <>
        <div className="space-y-3">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <h2 className="truncate text-base font-semibold text-foreground sm:text-lg">{t("openOrders")}</h2>
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin/pedidos")} className="shrink-0 text-muted-foreground hover:text-foreground">
              Ver todos <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card/80 backdrop-blur-sm">
            {openOrders.isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full bg-muted" />)}
              </div>
            ) : (openOrders.data?.length ?? 0) === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("noOpenOrders")}</p>
            ) : (
              <>
                {/* Mobile cards */}
                <ul className="divide-y divide-border/60 md:hidden">
                  {(openOrders.data ?? []).slice(0, 8).map((o: any) => (
                    <li
                      key={o.id}
                      className="cursor-pointer p-3 active:bg-muted/50"
                      onClick={() => navigate(`/admin/pedidos?openOrderId=${o.id}`)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-xs text-primary">{o.order_code ?? "—"}</span>
                        <StatusBadge status={o.status} />
                      </div>
                      <p className="mt-1 truncate text-sm font-medium text-foreground">{o.client_name ?? "—"}</p>
                      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span>Entrega {fmtDate(o.delivery_date)}</span>
                        <span className="font-semibold tabular-nums text-foreground">
                          {fmtMXN(o.total_with_iva as number | null)}
                          {o.has_stock_risk && <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-red-500" />}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
                {/* Desktop table */}
                <div className="hidden w-full overflow-x-auto md:block">
                  <Table className="min-w-[640px]">
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="font-semibold text-foreground">{t("thOrder")}</TableHead>
                        <TableHead className="font-semibold text-foreground">{t("thClient")}</TableHead>
                        <TableHead className="font-semibold text-foreground">{t("thOrderDate")}</TableHead>
                        <TableHead className="font-semibold text-foreground">{t("thDeliveryDate")}</TableHead>
                        <TableHead className="font-semibold text-foreground">{t("thStatus")}</TableHead>
                        <TableHead className="text-right font-semibold text-foreground">{t("thTotal")}</TableHead>
                        <TableHead className="text-center font-semibold text-foreground">{t("thRisk")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {openOrders.data?.map((o: any) => (
                        <TableRow
                          key={o.id}
                          className="cursor-pointer border-border transition-colors hover:bg-muted/50"
                          onClick={() => navigate(`/admin/pedidos?openOrderId=${o.id}`)}
                        >
                          <TableCell className="font-mono font-medium text-primary">{o.order_code ?? "—"}</TableCell>
                          <TableCell className="text-foreground">{o.client_name ?? "—"}</TableCell>
                          <TableCell className="text-foreground">{fmtDate(o.order_date)}</TableCell>
                          <TableCell className="text-foreground">{fmtDate(o.delivery_date)}</TableCell>
                          <TableCell><StatusBadge status={o.status} /></TableCell>
                          <TableCell className="text-right font-medium text-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>
                            {fmtMXN(o.total_with_iva as number | null)}
                          </TableCell>
                          <TableCell className="text-center">
                            {o.has_stock_risk && <AlertTriangle className="inline h-4 w-4 animate-pulse text-red-500" />}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>
        </div>

        {show("purchasing") && (
          <div className="space-y-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <h2 className="truncate text-base font-semibold text-foreground sm:text-lg">{t("purchaseNeeds")}</h2>
              <Button variant="ghost" size="sm" onClick={() => navigate("/admin/inventario")} className="shrink-0 text-muted-foreground hover:text-foreground">
                Ver productos <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
            <div className="rounded-2xl border border-border/70 bg-card/80 backdrop-blur-sm">
              {purchaseNeeds.isLoading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full bg-muted" />)}
                </div>
              ) : (purchaseNeeds.data?.length ?? 0) === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{t("noPurchaseNeeds")}</p>
              ) : (
                <>
                  <ul className="divide-y divide-border/60 md:hidden">
                    {(purchaseNeeds.data ?? []).slice(0, 8).map((r: any, i: number) => (
                      <li key={i} className="p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-mono text-xs text-primary">{r.clave ?? "—"}</span>
                          <span className="shrink-0 text-sm font-bold text-red-500">{r.units_to_buy ?? 0}</span>
                        </div>
                        <p className="mt-1 truncate text-sm text-foreground">{r.product_name ?? "—"}</p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {r.supplier ?? "Sin proveedor"} · pedir {r.order_by_date ? fmtDate(r.order_by_date) : "—"}
                        </p>
                      </li>
                    ))}
                  </ul>
                  <div className="hidden w-full overflow-x-auto md:block">
                    <Table className="min-w-[640px]">
                      <TableHeader>
                        <TableRow className="border-border hover:bg-transparent">
                          <TableHead className="font-semibold text-foreground">{t("thClave")}</TableHead>
                          <TableHead className="font-semibold text-foreground">{t("thProduct")}</TableHead>
                          <TableHead className="font-semibold text-foreground">{t("thSupplier")}</TableHead>
                          <TableHead className="text-right font-semibold text-foreground">{t("thToBuy")}</TableHead>
                          <TableHead className="text-right font-semibold text-foreground">{t("thCommitted")}</TableHead>
                          <TableHead className="text-right font-semibold text-foreground">{t("thIncoming")}</TableHead>
                          <TableHead className="font-semibold text-foreground">{t("thOrderBy")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {purchaseNeeds.data?.map((r: any, i: number) => (
                          <TableRow key={i} className="border-border transition-colors hover:bg-muted/50">
                            <TableCell className="font-mono font-medium text-primary">{r.clave ?? "—"}</TableCell>
                            <TableCell className="text-foreground">{r.product_name ?? "—"}</TableCell>
                            <TableCell className="text-foreground">{r.supplier ?? "—"}</TableCell>
                            <TableCell className="text-right text-lg font-bold text-red-500">{r.units_to_buy ?? 0}</TableCell>
                            <TableCell className="text-right text-foreground">{r.units_committed ?? 0}</TableCell>
                            <TableCell className="text-right text-foreground">{r.units_incoming ?? 0}</TableCell>
                            <TableCell>
                              {r.order_by_date ? (
                                isUrgent(r.order_by_date) ? (
                                  <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-600">
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
                    </Table>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        </>
        )}
        </>
        )}
      </div>
    </div>
  );
}
