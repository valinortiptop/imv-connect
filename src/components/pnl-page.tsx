// @ts-nocheck
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GlowCard } from "@/components/ui/spotlight-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern";
import { ChronoBar } from "@/components/ChronoBar";
import {
  TrendingUp, Users, BarChart3,
  ArrowUp, ArrowDown, ArrowUpDown, Receipt, Wallet, PieChart, FileBarChart, Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { NominaTab } from "@/components/pnl/NominaTab";
import { BonificacionTab } from "@/components/pnl/BonificacionTab";
import { GastosTab } from "@/components/pnl/GastosTab";
import { AnalisisTab, type PnlSnapshot } from "@/components/pnl/AnalisisTab";
import { EntradasBultoTab } from "@/components/pnl/EntradasBultoTab";
import { IngresosVsEgresos, type IngresoRow, type EgresoRow } from "@/components/pnl/IngresosVsEgresos";
import { previousPeriod } from "@/components/pnl/pnlHelpers";
import { HistoricalSalesPanel } from "@/components/sales/HistoricalSalesPanel";

/* ── Helpers ── */
const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const pct = (n: number) => `${n.toFixed(1)}%`;

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function firstOfMonth() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-01`;
}
function lastOfMonth() {
  const n = new Date();
  return dateStr(new Date(n.getFullYear(), n.getMonth() + 1, 0));
}
function monthLabel(d: string) {
  return format(new Date(d + "T12:00:00"), "MMMM yyyy", { locale: es });
}

/* ── Types ── */
interface LineItem {
  order_id: string;
  order_code: string;
  order_date: string;
  delivery_date: string | null;
  status: string;
  client_name: string;
  client_id: string;
  product_id: string;
  product_name: string;
  product_brand: string;
  quantity: number;
  unit_price: number;
  revenue: number;
  venta_sin_iva: number;
  costo_sin_iva: number;
  costo_bonif: number;
  profit: number;
  profit_bonif: number;
  /** Price list applied on the order ("Mayoreo" when the order has none). */
  price_list_label: string;
}

interface TripCost { trip_id: string; trip_date: string; truck_cost: number; staff_cost: number; order_ids: string[] }
interface Expense { id: string; name: string; category: string; amount: number; frequency: string; month: string; notes: string | null }

type SortDir = "asc" | "desc";

export default function PnL() {
  const [dateFrom, setDateFrom] = useState(firstOfMonth());
  const [dateTo, setDateTo] = useState(lastOfMonth());
  const [tab, setTab] = useState("resumen");

  /* ── Data fetch ── */
  const { data: lineItems = [], isLoading } = useQuery({
    queryKey: ["pnl-data"],
    queryFn: async () => {
      const { data: orders } = await (supabase as any)
        .from("orders")
        .select("id, order_code, order_date, delivery_date, status, client_id, price_list_id, discount_amount, clients(name), price_lists(name)")
        .neq("status", "Cancelado")
        .order("delivery_date", { ascending: false });
      if (!orders?.length) return [];

      const ids = orders.map((o: any) => o.id);
      const { data: items } = await supabase
        .from("order_items")
        .select("order_id, product_id, quantity, unit_price_override, products(name, brand, sale_price_with_iva)")
        .in("order_id", ids);

      const { data: margins } = await supabase.from("margins").select("product_id, cost_without_iva, bonificacion_pct");
      const mMap = new Map((margins ?? []).map((m: any) => [m.product_id, { cost: Number(m.cost_without_iva) || 0, bonif: Number(m.bonificacion_pct) || 0 }]));
      const oMap = new Map(orders.map((o: any) => [o.id, o]));

      // Pre-compute each order's subtotal so we can allocate the discount
      // proportionally across line items. Without this, an order-level
      // discount is invisible in by-product/by-day P&L breakdowns.
      const orderSubtotals = new Map<string, number>();
      for (const i of (items ?? []) as any[]) {
        const up = Number(i.unit_price_override ?? i.products?.sale_price_with_iva) || 0;
        const q = Number(i.quantity) || 0;
        orderSubtotals.set(i.order_id, (orderSubtotals.get(i.order_id) ?? 0) + up * q);
      }

      return (items ?? []).map((i: any) => {
        const o = oMap.get(i.order_id)! as any;
        const up = Number(i.unit_price_override ?? i.products?.sale_price_with_iva) || 0;
        const q = Number(i.quantity) || 0;
        const m = mMap.get(i.product_id) ?? { cost: 0, bonif: 0 };
        const lineGross = up * q;

        // Allocate the order-level discount onto this line proportionally
        const orderSubtotal = orderSubtotals.get(i.order_id) ?? 0;
        const orderDiscount = Math.min(Number(o.discount_amount) || 0, orderSubtotal);
        const lineDiscount = orderSubtotal > 0 ? orderDiscount * (lineGross / orderSubtotal) : 0;
        const lineDiscountSinIva = lineDiscount / 1.16;

        // Net values: discount comes out of margin (revenue and profit), cost untouched
        const vsi = (lineGross / 1.16) - lineDiscountSinIva;
        const csi = m.cost * q;
        const cb = m.cost * (1 - m.bonif) * q;
        return {
          order_id: i.order_id, order_code: o.order_code, order_date: o.order_date,
          delivery_date: o.delivery_date, status: o.status,
          client_name: (o as any).clients?.name ?? "—", client_id: o.client_id,
          product_id: i.product_id, product_name: i.products?.name ?? "", product_brand: i.products?.brand ?? "",
          quantity: q, unit_price: up, revenue: lineGross - lineDiscount,
          venta_sin_iva: vsi, costo_sin_iva: csi, costo_bonif: cb,
          profit: vsi - csi, profit_bonif: vsi - cb,
          price_list_label: (o as any).price_lists?.name ?? "Mayoreo",
        } as LineItem;
      });
    },
  });

  const { data: tripCosts = [] } = useQuery({
    queryKey: ["pnl-trips"],
    queryFn: async () => {
      const { data: trips } = await supabase.from("delivery_trips").select("id, trip_date, truck_cost, staff_cost");
      const { data: tripItems } = await supabase.from("delivery_trip_items").select("trip_id, order_id");
      const itemsByTrip = new Map<string, string[]>();
      for (const ti of (tripItems ?? [])) {
        const arr = itemsByTrip.get(ti.trip_id) ?? [];
        if (!arr.includes(ti.order_id)) arr.push(ti.order_id);
        itemsByTrip.set(ti.trip_id, arr);
      }
      return (trips ?? []).map(t => ({
        trip_id: t.id, trip_date: t.trip_date,
        truck_cost: Number(t.truck_cost) || 0, staff_cost: Number(t.staff_cost) || 0,
        order_ids: itemsByTrip.get(t.id) ?? [],
      })) as TripCost[];
    },
  });

  const { data: expenses = [], isLoading: expLoading } = useQuery({
    queryKey: ["pnl-expenses"],
    queryFn: async () => {
      const { data } = await supabase.from("fixed_expenses").select("*").order("month", { ascending: false });
      return (data ?? []) as Expense[];
    },
  });

  /* ── Extra data: bonificación received, employees, payroll, stock entries, system rates ── */
  const { data: bonifReceived = [] } = useQuery({
    queryKey: ["pnl-bonif-received-summary"],
    queryFn: async () => {
      const { data } = await supabase.from("bonifications_received").select("month, amount");
      return (data ?? []) as { month: string; amount: number }[];
    },
  });

  const { data: payrollAll = [] } = useQuery({
    queryKey: ["pnl-payroll-summary"],
    queryFn: async () => {
      const { data } = await supabase.from("payroll_payments").select("payment_date, amount");
      return (data ?? []) as { payment_date: string; amount: number }[];
    },
  });

  const { data: stockEntries = [] } = useQuery({
    queryKey: ["pnl-stock-entries-summary"],
    queryFn: async () => {
      const { data } = await supabase.from("stock_entries").select("entry_date, quantity");
      return (data ?? []) as { entry_date: string; quantity: number }[];
    },
  });

  const { data: systemConfig = [] } = useQuery({
    queryKey: ["pnl-system-config"],
    queryFn: async () => {
      const { data } = await supabase.from("system_config").select("key, value");
      return (data ?? []) as { key: string; value: string }[];
    },
  });

  /* ── Rates from system_config (with sensible fallbacks) ── */
  const rates = useMemo(() => {
    const m = new Map(systemConfig.map(c => [c.key, Number(c.value) || 0]));
    return {
      bultoRateOut: m.get("bulto_rate_central_out") || 3.5,
      bultoRateIn: m.get("bulto_rate_factory_in") || 3.5,
      maniobraRate: m.get("maniobra_rate_per_person") || 600,
      maniobraCrewDefault: m.get("maniobra_crew_per_torton") || 6,
    };
  }, [systemConfig]);

  /* ── Logistics cost per order ── */
  const logisticsByOrder = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tripCosts) {
      if (t.order_ids.length === 0) continue;
      const totalCost = t.truck_cost + t.staff_cost;
      const perOrder = totalCost / t.order_ids.length;
      for (const oid of t.order_ids) {
        map.set(oid, (map.get(oid) ?? 0) + perOrder);
      }
    }
    return map;
  }, [tripCosts]);

  /* ── Filtered data ── */
  const filtered = useMemo(() => lineItems.filter(s => {
    // Order date — revenue/profit recognized when the deal closes,
    // not when goods ship. Matches the Sales and Ventas dashboards.
    const d = s.order_date;
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  }), [lineItems, dateFrom, dateTo]);

  const delivered = useMemo(() => filtered.filter(s => s.status === "Entregado"), [filtered]);

  /* ── KPIs ── */
  const kpis = useMemo(() => {
    const revenue = delivered.reduce((s, i) => s + i.revenue, 0);
    const ventaSinIva = delivered.reduce((s, i) => s + i.venta_sin_iva, 0);
    const cogs = delivered.reduce((s, i) => s + i.costo_sin_iva, 0);
    const cogsBonif = delivered.reduce((s, i) => s + i.costo_bonif, 0);
    const grossProfit = ventaSinIva - cogs;
    const grossProfitBonif = ventaSinIva - cogsBonif;

    const orderIds = new Set(delivered.map(i => i.order_id));
    let totalLogistics = 0;
    for (const oid of orderIds) totalLogistics += logisticsByOrder.get(oid) ?? 0;

    // e.month is stored as YYYY-MM-01; comparing with YYYY-MM via string order
    // is wrong (lexicographically "2026-04-01" > "2026-04"), so we slice both
    // sides to a YYYY-MM key.
    const filteredExpenses = expenses.filter(e => {
      const k = e.month.slice(0, 7);
      if (dateFrom && k < dateFrom.slice(0, 7)) return false;
      if (dateTo && k > dateTo.slice(0, 7)) return false;
      return true;
    });
    const totalFixed = filteredExpenses.reduce((s, e) => s + e.amount, 0);

    const netProfit = grossProfit - totalLogistics - totalFixed;
    const netProfitBonif = grossProfitBonif - totalLogistics - totalFixed;
    const marginPct = ventaSinIva > 0 ? (grossProfit / ventaSinIva) * 100 : 0;
    const marginBonifPct = ventaSinIva > 0 ? (grossProfitBonif / ventaSinIva) * 100 : 0;
    const netMarginPct = ventaSinIva > 0 ? (netProfit / ventaSinIva) * 100 : 0;
    const netMarginBonifPct = ventaSinIva > 0 ? (netProfitBonif / ventaSinIva) * 100 : 0;
    const units = delivered.reduce((s, i) => s + i.quantity, 0);

    return { revenue, ventaSinIva, cogs, cogsBonif, grossProfit, grossProfitBonif, totalLogistics, totalFixed, netProfit, netProfitBonif, marginPct, marginBonifPct, netMarginPct, netMarginBonifPct, orders: orderIds.size, units };
  }, [delivered, logisticsByOrder, expenses, dateFrom, dateTo]);

  /* ── Per-price-list breakdown (Mayoreo / Menudeo / Habid …) ── */
  const byPriceList = useMemo(() => {
    type Bucket = {
      label: string;
      revenue: number;
      ventaSinIva: number;
      profit: number;
      profitBonif: number;
      orderIds: Set<string>;
      units: number;
    };
    const buckets = new Map<string, Bucket>();
    for (const i of delivered) {
      const key = i.price_list_label || "Mayoreo";
      let b = buckets.get(key);
      if (!b) {
        b = { label: key, revenue: 0, ventaSinIva: 0, profit: 0, profitBonif: 0, orderIds: new Set(), units: 0 };
        buckets.set(key, b);
      }
      b.revenue += i.revenue;
      b.ventaSinIva += i.venta_sin_iva;
      b.profit += i.profit;
      b.profitBonif += i.profit_bonif;
      b.orderIds.add(i.order_id);
      b.units += i.quantity;
    }
    return [...buckets.values()]
      .map(b => ({
        label: b.label,
        revenue: b.revenue,
        ventaSinIva: b.ventaSinIva,
        profit: b.profit,
        profitBonif: b.profitBonif,
        orders: b.orderIds.size,
        units: b.units,
        marginPct: b.ventaSinIva > 0 ? (b.profit / b.ventaSinIva) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [delivered]);

  /* ── Extended KPIs: bonif received, nomina, bulto economics ── */
  const orderBultosByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of delivered) {
      const d = i.order_date;
      m.set(d, (m.get(d) ?? 0) + i.quantity);
    }
    return m;
  }, [delivered]);

  const extKpis = useMemo(() => {
    const fromMonth = dateFrom.slice(0, 7);
    const toMonth = dateTo.slice(0, 7);

    const bonifReceivedPeriod = bonifReceived
      .filter(b => b.month.slice(0, 7) >= fromMonth && b.month.slice(0, 7) <= toMonth)
      .reduce((s, b) => s + Number(b.amount), 0);

    const nominaPeriod = payrollAll
      .filter(p => p.payment_date >= dateFrom && p.payment_date <= dateTo)
      .reduce((s, p) => s + Number(p.amount), 0);

    // Bulto economics
    const bultosInPeriod = stockEntries
      .filter(e => e.entry_date >= dateFrom && e.entry_date <= dateTo)
      .reduce((s, e) => s + Number(e.quantity), 0);
    const factoryReimbursement = bultosInPeriod * rates.bultoRateIn;

    const bultosOutPeriod = kpis.units;
    const centralManiobra = bultosOutPeriod * rates.bultoRateOut;

    // Recurring expenses only (for break-even monthly burn)
    // Recurring fixed expenses IN PERIOD only (date-filtered) so it matches the
    // rest of the PnL math. Previously this summed across all months which
    // badly inflated "Gastos recurrentes".
    type ExtExp = { frequency?: string; amount: number | string; month: string };
    const fromMonthPrefix = dateFrom.slice(0, 7);
    const toMonthPrefix = dateTo.slice(0, 7);
    const recurringFixed = (expenses as ExtExp[])
      .filter(e => {
        if (e.frequency !== "Mensual") return false;
        const k = e.month.slice(0, 7);
        return k >= fromMonthPrefix && k <= toMonthPrefix;
      })
      .reduce((s, e) => s + Number(e.amount), 0);

    // Break-even uses the current month's normalized recurring burn. We take the
    // max monthly recurring total over the period so multi-month ranges still
    // reflect a per-month figure (not a sum).
    const recurringByMonth = new Map<string, number>();
    for (const e of expenses as ExtExp[]) {
      if (e.frequency !== "Mensual") continue;
      const k = e.month.slice(0, 7);
      if (k < fromMonthPrefix || k > toMonthPrefix) continue;
      recurringByMonth.set(k, (recurringByMonth.get(k) ?? 0) + Number(e.amount));
    }
    const fixedMonthlyBurn = recurringByMonth.size > 0
      ? Math.max(...recurringByMonth.values())
      : 0;

    // Net profit with all extras included (this is the truthful PnL)
    const realNetProfit =
      kpis.ventaSinIva - kpis.cogsBonif + bonifReceivedPeriod - kpis.cogsBonif + kpis.cogsBonif
      - kpis.totalLogistics - kpis.totalFixed - nominaPeriod - centralManiobra + factoryReimbursement;

    // The line above reduces to: ventaSinIva - cogsBonif + bonifReceived - logistics - fixed - nomina - centralManiobra + factoryReimb
    // Written clearly:
    const realNet =
      kpis.ventaSinIva
      - kpis.cogsBonif
      + (bonifReceivedPeriod - (kpis.cogs - kpis.cogsBonif))  // delta between real bonif and platform-estimated
      - kpis.totalLogistics
      - kpis.totalFixed
      - nominaPeriod
      - centralManiobra
      + factoryReimbursement;

    const realNetMarginPct = kpis.ventaSinIva > 0 ? (realNet / kpis.ventaSinIva) * 100 : 0;

    return {
      bonifReceivedPeriod,
      bonifExpected: kpis.cogs - kpis.cogsBonif,
      nominaPeriod,
      bultosInPeriod,
      bultosOutPeriod,
      factoryReimbursement,
      centralManiobra,
      bultoNet: factoryReimbursement - centralManiobra,
      recurringFixed,
      fixedMonthlyBurn,
      realNet,
      realNetMarginPct,
    };
  }, [bonifReceived, payrollAll, stockEntries, rates, kpis, dateFrom, dateTo, expenses]);

  /* ── Snapshots for Análisis tab (current + previous period) ── */
  const snapshot = useMemo<PnlSnapshot>(() => ({
    ingresos: kpis.revenue,
    ingresosSinIva: kpis.ventaSinIva,
    cogs: kpis.cogs,
    cogsBonif: kpis.cogsBonif,
    bonificacionRecibida: extKpis.bonifReceivedPeriod,
    logistica: kpis.totalLogistics,
    maniobraCentralOut: extKpis.centralManiobra,
    maniobraFactoryIn: extKpis.factoryReimbursement,
    nomina: extKpis.nominaPeriod,
    gastosRecurrentes: extKpis.recurringFixed,
    gastosOneTime: kpis.totalFixed - extKpis.recurringFixed,
    utilidadBruta: kpis.grossProfitBonif,
    utilidadNeta: extKpis.realNet,
  }), [kpis, extKpis]);

  /* Previous period snapshot for compare */
  const prevRange = useMemo(() => previousPeriod(dateFrom, dateTo), [dateFrom, dateTo]);

  const prevSnapshot = useMemo<PnlSnapshot>(() => {
    const prevDelivered = lineItems.filter(i => {
      const d = i.order_date;
      return d >= prevRange.from && d <= prevRange.to && i.status === "Entregado";
    });
    const vsi = prevDelivered.reduce((s, i) => s + i.venta_sin_iva, 0);
    const cogs = prevDelivered.reduce((s, i) => s + i.costo_sin_iva, 0);
    const cogsB = prevDelivered.reduce((s, i) => s + i.costo_bonif, 0);
    const orderIds = new Set(prevDelivered.map(i => i.order_id));
    let log = 0;
    for (const oid of orderIds) log += logisticsByOrder.get(oid) ?? 0;
    const prevBonif = bonifReceived
      .filter(b => b.month.slice(0, 7) >= prevRange.from.slice(0, 7) && b.month.slice(0, 7) <= prevRange.to.slice(0, 7))
      .reduce((s, b) => s + Number(b.amount), 0);
    const prevNomina = payrollAll
      .filter(p => p.payment_date >= prevRange.from && p.payment_date <= prevRange.to)
      .reduce((s, p) => s + Number(p.amount), 0);
    const prevFromMonth = prevRange.from.slice(0, 7);
    const prevToMonth = prevRange.to.slice(0, 7);
    const prevFixed = expenses
      .filter(e => {
        const k = e.month.slice(0, 7);
        return k >= prevFromMonth && k <= prevToMonth;
      })
      .reduce((s, e) => s + Number(e.amount), 0);
    const prevRecurring = (expenses as Expense[])
      .filter(e => {
        const k = e.month.slice(0, 7);
        return k >= prevFromMonth && k <= prevToMonth && (e as unknown as { frequency?: string }).frequency === "Mensual";
      })
      .reduce((s, e) => s + Number(e.amount), 0);
    const prevBultosIn = stockEntries
      .filter(e => e.entry_date >= prevRange.from && e.entry_date <= prevRange.to)
      .reduce((s, e) => s + Number(e.quantity), 0);
    const prevBultosOut = prevDelivered.reduce((s, i) => s + i.quantity, 0);
    const prevFactoryIn = prevBultosIn * rates.bultoRateIn;
    const prevCentralOut = prevBultosOut * rates.bultoRateOut;
    const prevRealNet = vsi - cogsB + (prevBonif - (cogs - cogsB)) - log - prevFixed - prevNomina - prevCentralOut + prevFactoryIn;
    return {
      ingresos: prevDelivered.reduce((s, i) => s + i.revenue, 0),
      ingresosSinIva: vsi,
      cogs, cogsBonif: cogsB,
      bonificacionRecibida: prevBonif,
      logistica: log,
      maniobraCentralOut: prevCentralOut,
      maniobraFactoryIn: prevFactoryIn,
      nomina: prevNomina,
      gastosRecurrentes: prevRecurring,
      gastosOneTime: prevFixed - prevRecurring,
      utilidadBruta: vsi - cogsB,
      utilidadNeta: prevRealNet,
    };
  }, [lineItems, prevRange, logisticsByOrder, bonifReceived, payrollAll, expenses, stockEntries, rates]);

  /* Ingresos vs Egresos rows built from snapshot.
   * Use GROSS cogs (not cogsBonif) so bonificación real shows up as a real
   * positive inflow — same pattern as maniobra central vs reembolso fábrica. */
  const ingresosRows = useMemo<IngresoRow[]>(() => [
    { label: "Ventas (s/IVA)", amount: snapshot.ingresosSinIva, hint: "Facturación neta de IVA" },
    { label: "Bonificación recibida", amount: snapshot.bonificacionRecibida, hint: "Reembolso real de fábrica por producto" },
    { label: "Reembolso fábrica (maniobra)", amount: snapshot.maniobraFactoryIn, hint: "Cobro por maniobra a fábrica" },
  ].filter(r => r.amount > 0), [snapshot]);

  const egresosRows = useMemo<EgresoRow[]>(() => [
    { label: "COGS (costo producto)", amount: snapshot.cogs, hint: "Costo bruto sin bonificación" },
    { label: "Logística (viajes)", amount: snapshot.logistica },
    { label: "Maniobra central (pago)", amount: snapshot.maniobraCentralOut, hint: "Pago a Rodrigo y equipo" },
    { label: "Nómina", amount: snapshot.nomina },
    { label: "Gastos recurrentes", amount: snapshot.gastosRecurrentes, hint: "Renta, servicios, etc." },
    { label: "Gastos una vez", amount: snapshot.gastosOneTime },
  ].filter(r => r.amount > 0), [snapshot]);

  /* ── By Order ── */
  const [orderSort, setOrderSort] = useState<{ key: string; dir: SortDir }>({ key: "date", dir: "desc" });
  const byOrder = useMemo(() => {
    const map = new Map<string, { code: string; client: string; date: string; revenue: number; vsi: number; cogs: number; cogsBonif: number; logistics: number; units: number }>();
    for (const i of delivered) {
      const e = map.get(i.order_id) ?? { code: i.order_code, client: i.client_name, date: i.order_date, revenue: 0, vsi: 0, cogs: 0, cogsBonif: 0, logistics: logisticsByOrder.get(i.order_id) ?? 0, units: 0 };
      e.revenue += i.revenue; e.vsi += i.venta_sin_iva; e.cogs += i.costo_sin_iva; e.cogsBonif += i.costo_bonif; e.units += i.quantity;
      map.set(i.order_id, e);
    }
    const arr = [...map.entries()].map(([id, d]) => ({
      id, ...d,
      grossProfit: d.vsi - d.cogs, grossProfitBonif: d.vsi - d.cogsBonif,
      netProfit: d.vsi - d.cogs - d.logistics, netProfitBonif: d.vsi - d.cogsBonif - d.logistics,
      marginPct: d.vsi > 0 ? ((d.vsi - d.cogs) / d.vsi) * 100 : 0,
      marginBonifPct: d.vsi > 0 ? ((d.vsi - d.cogsBonif) / d.vsi) * 100 : 0,
      netMarginPct: d.vsi > 0 ? ((d.vsi - d.cogs - d.logistics) / d.vsi) * 100 : 0,
      netMarginBonifPct: d.vsi > 0 ? ((d.vsi - d.cogsBonif - d.logistics) / d.vsi) * 100 : 0,
    }));
    const k = orderSort.key;
    arr.sort((a, b) => {
      const va = (a as any)[k] ?? 0, vb = (b as any)[k] ?? 0;
      return orderSort.dir === "asc" ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
    return arr;
  }, [delivered, logisticsByOrder, orderSort]);

  /* ── Order totals ── */
  const orderTotals = useMemo(() => ({
    revenue: byOrder.reduce((s, o) => s + o.revenue, 0),
    cogs: byOrder.reduce((s, o) => s + o.cogs, 0),
    cogsBonif: byOrder.reduce((s, o) => s + o.cogsBonif, 0),
    logistics: byOrder.reduce((s, o) => s + o.logistics, 0),
    netProfit: byOrder.reduce((s, o) => s + o.netProfit, 0),
    netProfitBonif: byOrder.reduce((s, o) => s + o.netProfitBonif, 0),
    units: byOrder.reduce((s, o) => s + o.units, 0),
  }), [byOrder]);

  /* ── By Client ── */
  const [clientSort, setClientSort] = useState<{ key: string; dir: SortDir }>({ key: "revenue", dir: "desc" });
  const byClient = useMemo(() => {
    const map = new Map<string, { name: string; orders: Set<string>; revenue: number; vsi: number; cogs: number; cogsBonif: number; logistics: number; units: number }>();
    for (const i of delivered) {
      const e = map.get(i.client_id) ?? { name: i.client_name, orders: new Set(), revenue: 0, vsi: 0, cogs: 0, cogsBonif: 0, logistics: 0, units: 0 };
      e.orders.add(i.order_id); e.revenue += i.revenue; e.vsi += i.venta_sin_iva; e.cogs += i.costo_sin_iva; e.cogsBonif += i.costo_bonif; e.units += i.quantity;
      e.logistics = [...e.orders].reduce((s, oid) => s + (logisticsByOrder.get(oid) ?? 0), 0);
      map.set(i.client_id, e);
    }
    const arr = [...map.entries()].map(([id, d]) => ({
      id, name: d.name, orders: d.orders.size, revenue: d.revenue, units: d.units,
      grossProfit: d.vsi - d.cogs, grossProfitBonif: d.vsi - d.cogsBonif,
      netProfit: d.vsi - d.cogs - d.logistics, netProfitBonif: d.vsi - d.cogsBonif - d.logistics,
      logistics: d.logistics,
      marginPct: d.vsi > 0 ? ((d.vsi - d.cogs) / d.vsi) * 100 : 0,
      marginBonifPct: d.vsi > 0 ? ((d.vsi - d.cogsBonif) / d.vsi) * 100 : 0,
      netMarginPct: d.vsi > 0 ? ((d.vsi - d.cogs - d.logistics) / d.vsi) * 100 : 0,
      netMarginBonifPct: d.vsi > 0 ? ((d.vsi - d.cogsBonif - d.logistics) / d.vsi) * 100 : 0,
    }));
    const k = clientSort.key;
    arr.sort((a, b) => {
      const va = (a as any)[k] ?? 0, vb = (b as any)[k] ?? 0;
      return clientSort.dir === "asc" ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
    return arr;
  }, [delivered, logisticsByOrder, clientSort]);

  /* ── Client totals ── */
  const clientTotals = useMemo(() => ({
    orders: byClient.reduce((s, c) => s + c.orders, 0),
    units: byClient.reduce((s, c) => s + c.units, 0),
    revenue: byClient.reduce((s, c) => s + c.revenue, 0),
    grossProfit: byClient.reduce((s, c) => s + c.grossProfit, 0),
    grossProfitBonif: byClient.reduce((s, c) => s + c.grossProfitBonif, 0),
    logistics: byClient.reduce((s, c) => s + c.logistics, 0),
    netProfit: byClient.reduce((s, c) => s + c.netProfit, 0),
    netProfitBonif: byClient.reduce((s, c) => s + c.netProfitBonif, 0),
  }), [byClient]);

  /* ── By Product ── */
  const [prodSort, setProdSort] = useState<{ key: string; dir: SortDir }>({ key: "revenue", dir: "desc" });
  const byProduct = useMemo(() => {
    const map = new Map<string, { name: string; brand: string; revenue: number; vsi: number; cogs: number; cogsBonif: number; units: number }>();
    for (const i of delivered) {
      const e = map.get(i.product_id) ?? { name: i.product_name, brand: i.product_brand, revenue: 0, vsi: 0, cogs: 0, cogsBonif: 0, units: 0 };
      e.revenue += i.revenue; e.vsi += i.venta_sin_iva; e.cogs += i.costo_sin_iva; e.cogsBonif += i.costo_bonif; e.units += i.quantity;
      map.set(i.product_id, e);
    }
    const arr = [...map.entries()].map(([id, d]) => ({
      id, name: d.name, brand: d.brand, revenue: d.revenue, units: d.units,
      grossProfit: d.vsi - d.cogs, grossProfitBonif: d.vsi - d.cogsBonif,
      marginPct: d.vsi > 0 ? ((d.vsi - d.cogs) / d.vsi) * 100 : 0,
      marginBonifPct: d.vsi > 0 ? ((d.vsi - d.cogsBonif) / d.vsi) * 100 : 0,
    }));
    const k = prodSort.key;
    arr.sort((a, b) => {
      const va = (a as any)[k] ?? 0, vb = (b as any)[k] ?? 0;
      return prodSort.dir === "asc" ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
    return arr;
  }, [delivered, prodSort]);

  /* ── Product totals ── */
  const prodTotals = useMemo(() => ({
    units: byProduct.reduce((s, p) => s + p.units, 0),
    revenue: byProduct.reduce((s, p) => s + p.revenue, 0),
    grossProfit: byProduct.reduce((s, p) => s + p.grossProfit, 0),
    grossProfitBonif: byProduct.reduce((s, p) => s + p.grossProfitBonif, 0),
  }), [byProduct]);

  /* ── Sort helper ── */
  function SortHeader({ label, sortKey: sk, current, setCurrent }: { label: string; sortKey: string; current: { key: string; dir: SortDir }; setCurrent: (v: { key: string; dir: SortDir }) => void }) {
    const active = current.key === sk;
    return (
      <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => setCurrent({ key: sk, dir: active && current.dir === "desc" ? "asc" : "desc" })}>
        {label}
        {active ? (current.dir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    );
  }

  if (isLoading) return <div className="p-6 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;

  return (
    <div className="p-4 md:p-6 space-y-6 relative overflow-hidden">
      <AnimatedGridPattern className="absolute inset-0 opacity-[0.03] pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">P&L</h1>
          <p className="text-sm text-muted-foreground">Profit & Loss — solo pedidos entregados</p>
        </div>
        <ChronoBar
          dateFrom={dateFrom}
          dateTo={dateTo}
          onChange={(from, to) => { setDateFrom(from); setDateTo(to); }}
        />
      </div>

      {/* KPI cards — company-wide view including bonificación received + bulto economics + payroll */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <GlowCard>
          <div className="p-4 space-y-1">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1 uppercase tracking-wide"><Receipt className="h-3 w-3" /> Ingresos</p>
            <p className="text-xl font-bold tabular-nums">{mxn.format(kpis.revenue)}</p>
            <p className="text-[11px] text-muted-foreground">{kpis.orders} pedidos · {kpis.units.toLocaleString()} bultos</p>
          </div>
        </GlowCard>
        <GlowCard>
          <div className="p-4 space-y-1">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1 uppercase tracking-wide"><TrendingUp className="h-3 w-3" /> Utilidad Bruta</p>
            <p className={cn("text-xl font-bold tabular-nums", kpis.grossProfitBonif >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(kpis.grossProfitBonif)}</p>
            <p className="text-[11px] text-muted-foreground">Margen {pct(kpis.marginBonifPct)}</p>
          </div>
        </GlowCard>
        <GlowCard>
          <div className="p-4 space-y-1">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1 uppercase tracking-wide"><Wallet className="h-3 w-3" /> Gastos operativos</p>
            <p className="text-xl font-bold tabular-nums">{mxn.format(kpis.totalLogistics + extKpis.nominaPeriod + extKpis.centralManiobra + kpis.totalFixed - extKpis.factoryReimbursement)}</p>
            <p className="text-[11px] text-muted-foreground">Log + nómina + maniobra − reembolso</p>
          </div>
        </GlowCard>
        <GlowCard>
          <div className="p-4 space-y-1">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1 uppercase tracking-wide"><BarChart3 className="h-3 w-3" /> Utilidad Neta</p>
            <p className={cn("text-xl font-bold tabular-nums", extKpis.realNet >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(extKpis.realNet)}</p>
            <p className="text-[11px] text-muted-foreground">Margen neto {pct(extKpis.realNetMarginPct)}</p>
          </div>
        </GlowCard>
        <GlowCard>
          <div className="p-4 space-y-1">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1 uppercase tracking-wide"><TrendingUp className="h-3 w-3" /> Bonif real</p>
            <p className="text-xl font-bold tabular-nums text-green-500">{mxn.format(extKpis.bonifReceivedPeriod)}</p>
            <p className="text-[11px] text-muted-foreground">Esperado {mxn.format(extKpis.bonifExpected)}</p>
          </div>
        </GlowCard>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="overflow-x-auto">
          <TabsTrigger value="resumen"><PieChart className="h-3.5 w-3.5 mr-1" />Resumen</TabsTrigger>
          <TabsTrigger value="gastos"><Wallet className="h-3.5 w-3.5 mr-1" />Gastos</TabsTrigger>
          <TabsTrigger value="nomina"><Users className="h-3.5 w-3.5 mr-1" />Nómina</TabsTrigger>
          <TabsTrigger value="bonificacion"><TrendingUp className="h-3.5 w-3.5 mr-1" />Bonificación</TabsTrigger>
          <TabsTrigger value="entradas"><Package className="h-3.5 w-3.5 mr-1" />Entradas</TabsTrigger>
          <TabsTrigger value="analisis"><FileBarChart className="h-3.5 w-3.5 mr-1" />Análisis</TabsTrigger>
          <TabsTrigger value="orders">Por Pedido</TabsTrigger>
          <TabsTrigger value="clients">Por Cliente</TabsTrigger>
          <TabsTrigger value="products">Por Producto</TabsTrigger>
          <TabsTrigger value="company">P&L Detalle</TabsTrigger>
        </TabsList>

        {/* ── Tab: Resumen (KPIs + waterfall + break-even headline) ── */}
        <TabsContent value="resumen">
          <div className="space-y-6">
            <div className="rounded-xl border p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Ingresos vs Egresos — {monthLabel(dateFrom)}</p>
                  <p className="text-xs text-muted-foreground">Todo lo que entra contra todo lo que sale, con la utilidad neta al final</p>
                </div>
              </div>
              <IngresosVsEgresos ingresos={ingresosRows} egresos={egresosRows} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border p-5 space-y-3">
                <p className="text-sm font-semibold">Composición de gastos</p>
                {[
                  { label: "Logística (viajes)", amount: kpis.totalLogistics },
                  { label: "Maniobra central (salida)", amount: extKpis.centralManiobra },
                  { label: "(−) Reembolso fábrica (entrada)", amount: -extKpis.factoryReimbursement, muted: true },
                  { label: "Nómina", amount: extKpis.nominaPeriod },
                  { label: "Gastos recurrentes", amount: extKpis.recurringFixed },
                  { label: "Gastos una vez", amount: kpis.totalFixed - extKpis.recurringFixed },
                ].map((r) => {
                  const total = kpis.totalLogistics + extKpis.centralManiobra + extKpis.nominaPeriod + kpis.totalFixed;
                  const p = total > 0 ? Math.abs(r.amount) / total * 100 : 0;
                  return (
                    <div key={r.label} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className={cn(r.muted && "text-muted-foreground")}>{r.label}</span>
                        <span className="tabular-nums font-medium">{mxn.format(r.amount)}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={cn("h-full", r.amount < 0 ? "bg-green-500" : "bg-red-500/70")} style={{ width: `${p}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-xl border p-5 space-y-3">
                <p className="text-sm font-semibold">Reconciliación bonificación</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Esperado (plataforma)</span>
                    <span className="tabular-nums">{mxn.format(extKpis.bonifExpected)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Recibido (real)</span>
                    <span className="tabular-nums text-green-500">{mxn.format(extKpis.bonifReceivedPeriod)}</span>
                  </div>
                  <div className={cn("flex justify-between text-sm font-semibold border-t pt-2",
                    extKpis.bonifReceivedPeriod - extKpis.bonifExpected >= 0 ? "text-green-500" : "text-orange-500")}>
                    <span>Diferencia</span>
                    <span className="tabular-nums">
                      {extKpis.bonifReceivedPeriod - extKpis.bonifExpected >= 0 ? "+" : ""}
                      {mxn.format(extKpis.bonifReceivedPeriod - extKpis.bonifExpected)}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground pt-2 border-t">
                  Burn fijo mensual: <span className="font-semibold text-foreground">{mxn.format(extKpis.fixedMonthlyBurn)}</span>
                  {" · "}
                  Bulto neto período: <span className={cn("font-semibold", extKpis.bultoNet >= 0 ? "text-green-500" : "text-orange-500")}>
                    {extKpis.bultoNet >= 0 ? "+" : ""}{mxn.format(extKpis.bultoNet)}
                  </span>
                </p>
              </div>
            </div>

            {/* ── Por lista de precios (Mayoreo / Menudeo / Habid …) ── */}
            {byPriceList.length > 0 && (
              <div className="rounded-xl border p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Por lista de precios</p>
                  <p className="text-xs text-muted-foreground">Solo pedidos entregados</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b">
                        <th className="text-left py-2 font-medium">Lista</th>
                        <th className="text-right py-2 font-medium">Pedidos</th>
                        <th className="text-right py-2 font-medium">Bultos</th>
                        <th className="text-right py-2 font-medium">Ingresos c/IVA</th>
                        <th className="text-right py-2 font-medium">Ingresos s/IVA</th>
                        <th className="text-right py-2 font-medium">Utilidad</th>
                        <th className="text-right py-2 font-medium">Margen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byPriceList.map((b) => (
                        <tr key={b.label} className="border-b last:border-0">
                          <td className="py-2 font-medium">{b.label}</td>
                          <td className="text-right tabular-nums">{b.orders}</td>
                          <td className="text-right tabular-nums">{b.units}</td>
                          <td className="text-right tabular-nums">{mxn.format(b.revenue)}</td>
                          <td className="text-right tabular-nums">{mxn.format(b.ventaSinIva)}</td>
                          <td className={cn(
                            "text-right tabular-nums font-semibold",
                            b.profit >= 0 ? "text-green-500" : "text-red-500"
                          )}>
                            {mxn.format(b.profit)}
                          </td>
                          <td className="text-right tabular-nums">{pct(b.marginPct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Tab: Gastos (new, from GastosTab component) ── */}
        <TabsContent value="gastos">
          <GastosTab dateFrom={dateFrom} dateTo={dateTo} />
        </TabsContent>

        {/* ── Tab: Nómina ── */}
        <TabsContent value="nomina">
          <NominaTab dateFrom={dateFrom} dateTo={dateTo} />
        </TabsContent>

        {/* ── Tab: Bonificación ── */}
        <TabsContent value="bonificacion">
          <BonificacionTab dateFrom={dateFrom} dateTo={dateTo} expectedBonifPeriod={extKpis.bonifExpected} />
        </TabsContent>

        {/* ── Tab: Entradas (bulto economics) ── */}
        <TabsContent value="entradas">
          <EntradasBultoTab
            dateFrom={dateFrom} dateTo={dateTo}
            rateIn={rates.bultoRateIn} rateOut={rates.bultoRateOut}
            crewDefault={rates.maniobraCrewDefault} rateManiobra={rates.maniobraRate}
            orderBultosByDate={orderBultosByDate}
          />
        </TabsContent>

        {/* ── Tab: Análisis (what-if + compare + break-even) ── */}
        <TabsContent value="analisis">
          <AnalisisTab
            snapshot={snapshot}
            previous={prevSnapshot}
            dateFrom={dateFrom} dateTo={dateTo}
            fixedMonthlyBurn={extKpis.fixedMonthlyBurn}
          />
        </TabsContent>

        {/* ── Tab: By Order ── */}
        <TabsContent value="orders">
          {/* Mobile summary card */}
          {byOrder.length > 0 && (
            <div className="md:hidden rounded-xl border bg-muted/40 p-4 mb-4 space-y-2">
              <p className="text-sm font-bold">Total ({byOrder.length} pedidos)</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums">
                <span className="text-muted-foreground">Bultos</span><span className="text-right">{orderTotals.units.toLocaleString()}</span>
                <span className="text-muted-foreground">Ingresos</span><span className="text-right">{mxn.format(orderTotals.revenue)}</span>
                <span className="text-muted-foreground">COGS</span><span className="text-right">{mxn.format(orderTotals.cogs)}</span>
                <span className="text-muted-foreground">Logistica</span><span className="text-right">{mxn.format(orderTotals.logistics)}</span>
                <span className="text-muted-foreground">Utilidad</span><span className={cn("text-right", orderTotals.netProfit >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(orderTotals.netProfit)}</span>
                <span className="text-muted-foreground">Util Bonif</span><span className={cn("text-right", orderTotals.netProfitBonif >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(orderTotals.netProfitBonif)}</span>
              </div>
            </div>
          )}
          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {byOrder.map(o => (
              <div key={o.id} className="rounded-xl border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-medium text-blue-400">{o.code}</span>
                  <span className="text-xs text-muted-foreground">{format(new Date(o.date + "T12:00:00"), "dd MMM yy", { locale: es })}</span>
                </div>
                <p className="text-sm font-medium truncate">{o.client}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums">
                  <div><span className="text-muted-foreground text-xs">Bultos</span><p>{o.units.toLocaleString()}</p></div>
                  <div><span className="text-muted-foreground text-xs">Ingresos</span><p className="text-green-500">{mxn.format(o.revenue)}</p></div>
                  <div><span className="text-muted-foreground text-xs">COGS</span><p>{mxn.format(o.cogs)}</p></div>
                  <div><span className="text-muted-foreground text-xs">Logistica</span><p>{o.logistics > 0 ? mxn.format(o.logistics) : "—"}</p></div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums border-t pt-2">
                  <div><span className="text-muted-foreground text-xs">Utilidad</span><p className={cn("font-medium", o.netProfit >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(o.netProfit)}</p></div>
                  <div><span className="text-muted-foreground text-xs">Margen</span><p className={cn(o.netMarginPct >= 0 ? "text-green-500" : "text-red-500")}>{pct(o.netMarginPct)}</p></div>
                  <div><span className="text-muted-foreground text-xs">Util Bonif</span><p className={cn("font-medium", o.netProfitBonif >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(o.netProfitBonif)}</p></div>
                  <div><span className="text-muted-foreground text-xs">Margen Bonif</span><p className={cn(o.netMarginBonifPct >= 0 ? "text-green-500" : "text-red-500")}>{pct(o.netMarginBonifPct)}</p></div>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop table */}
          <div className="hidden md:block rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead><SortHeader label="Pedido" sortKey="code" current={orderSort} setCurrent={setOrderSort} /></TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead><SortHeader label="Fecha" sortKey="date" current={orderSort} setCurrent={setOrderSort} /></TableHead>
                  <TableHead className="text-right"><SortHeader label="Bultos" sortKey="units" current={orderSort} setCurrent={setOrderSort} /></TableHead>
                  <TableHead className="text-right"><SortHeader label="Ingresos" sortKey="revenue" current={orderSort} setCurrent={setOrderSort} /></TableHead>
                  <TableHead className="text-right"><SortHeader label="COGS" sortKey="cogs" current={orderSort} setCurrent={setOrderSort} /></TableHead>
                  <TableHead className="text-right"><SortHeader label="Logística" sortKey="logistics" current={orderSort} setCurrent={setOrderSort} /></TableHead>
                  <TableHead className="text-right"><SortHeader label="Utilidad" sortKey="netProfit" current={orderSort} setCurrent={setOrderSort} /></TableHead>
                  <TableHead className="text-right"><SortHeader label="Margen" sortKey="netMarginPct" current={orderSort} setCurrent={setOrderSort} /></TableHead>
                  <TableHead className="text-right"><SortHeader label="Util Bonif" sortKey="netProfitBonif" current={orderSort} setCurrent={setOrderSort} /></TableHead>
                  <TableHead className="text-right"><SortHeader label="Margen Bonif" sortKey="netMarginBonifPct" current={orderSort} setCurrent={setOrderSort} /></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byOrder.length > 0 && (
                  <TableRow className="border-b-2 bg-muted/40 font-bold">
                    <TableCell colSpan={3}>Total ({byOrder.length} pedidos)</TableCell>
                    <TableCell className="text-right tabular-nums">{orderTotals.units.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{mxn.format(orderTotals.revenue)}</TableCell>
                    <TableCell className="text-right tabular-nums">{mxn.format(orderTotals.cogs)}</TableCell>
                    <TableCell className="text-right tabular-nums">{mxn.format(orderTotals.logistics)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", orderTotals.netProfit >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(orderTotals.netProfit)}</TableCell>
                    <TableCell />
                    <TableCell className={cn("text-right tabular-nums", orderTotals.netProfitBonif >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(orderTotals.netProfitBonif)}</TableCell>
                    <TableCell />
                  </TableRow>
                )}
                {byOrder.map(o => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium text-blue-400">{o.code}</TableCell>
                    <TableCell>{o.client}</TableCell>
                    <TableCell className="text-muted-foreground">{format(new Date(o.date + "T12:00:00"), "dd MMM yy", { locale: es })}</TableCell>
                    <TableCell className="text-right tabular-nums">{o.units.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{mxn.format(o.revenue)}</TableCell>
                    <TableCell className="text-right tabular-nums">{mxn.format(o.cogs)}</TableCell>
                    <TableCell className="text-right tabular-nums">{o.logistics > 0 ? mxn.format(o.logistics) : "—"}</TableCell>
                    <TableCell className={cn("text-right tabular-nums font-medium", o.netProfit >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(o.netProfit)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", o.netMarginPct >= 0 ? "text-green-500" : "text-red-500")}>{pct(o.netMarginPct)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums font-medium", o.netProfitBonif >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(o.netProfitBonif)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", o.netMarginBonifPct >= 0 ? "text-green-500" : "text-red-500")}>{pct(o.netMarginBonifPct)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Tab: By Client ── */}
        <TabsContent value="clients">
          {/* Mobile summary card */}
          {byClient.length > 0 && (
            <div className="md:hidden rounded-xl border bg-muted/40 p-4 mb-4 space-y-2">
              <p className="text-sm font-bold">Total ({byClient.length} clientes)</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums">
                <span className="text-muted-foreground">Pedidos</span><span className="text-right">{clientTotals.orders}</span>
                <span className="text-muted-foreground">Bultos</span><span className="text-right">{clientTotals.units.toLocaleString()}</span>
                <span className="text-muted-foreground">Ingresos</span><span className="text-right">{mxn.format(clientTotals.revenue)}</span>
                <span className="text-muted-foreground">Logistica</span><span className="text-right">{mxn.format(clientTotals.logistics)}</span>
                <span className="text-muted-foreground">Util Neta</span><span className={cn("text-right", clientTotals.netProfit >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(clientTotals.netProfit)}</span>
                <span className="text-muted-foreground">Neta Bonif</span><span className={cn("text-right", clientTotals.netProfitBonif >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(clientTotals.netProfitBonif)}</span>
              </div>
            </div>
          )}
          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {byClient.map(c => (
              <div key={c.id} className="rounded-xl border p-4 space-y-2">
                <p className="text-sm font-bold truncate">{c.name}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{c.orders} pedidos</span>
                  <span>{c.units.toLocaleString()} bultos</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums">
                  <div><span className="text-muted-foreground text-xs">Ingresos</span><p>{mxn.format(c.revenue)}</p></div>
                  <div><span className="text-muted-foreground text-xs">Util Bruta</span><p className={cn(c.grossProfit >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(c.grossProfit)}</p></div>
                  <div><span className="text-muted-foreground text-xs">Util Bonif</span><p className={cn(c.grossProfitBonif >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(c.grossProfitBonif)}</p></div>
                  <div><span className="text-muted-foreground text-xs">Logistica</span><p>{c.logistics > 0 ? mxn.format(c.logistics) : "—"}</p></div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums border-t pt-2">
                  <div><span className="text-muted-foreground text-xs">Util Neta</span><p className={cn("font-medium", c.netProfit >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(c.netProfit)}</p></div>
                  <div><span className="text-muted-foreground text-xs">Margen</span><p className={cn(c.netMarginPct >= 0 ? "text-green-500" : "text-red-500")}>{pct(c.netMarginPct)}</p></div>
                  <div><span className="text-muted-foreground text-xs">Neta Bonif</span><p className={cn("font-medium", c.netProfitBonif >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(c.netProfitBonif)}</p></div>
                  <div><span className="text-muted-foreground text-xs">Margen Bonif</span><p className={cn(c.netMarginBonifPct >= 0 ? "text-green-500" : "text-red-500")}>{pct(c.netMarginBonifPct)}</p></div>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop table */}
          <div className="hidden md:block rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead><SortHeader label="Cliente" sortKey="name" current={clientSort} setCurrent={setClientSort} /></TableHead>
                  <TableHead className="text-right"><SortHeader label="Pedidos" sortKey="orders" current={clientSort} setCurrent={setClientSort} /></TableHead>
                  <TableHead className="text-right"><SortHeader label="Bultos" sortKey="units" current={clientSort} setCurrent={setClientSort} /></TableHead>
                  <TableHead className="text-right"><SortHeader label="Ingresos" sortKey="revenue" current={clientSort} setCurrent={setClientSort} /></TableHead>
                  <TableHead className="text-right"><SortHeader label="Util Bruta" sortKey="grossProfit" current={clientSort} setCurrent={setClientSort} /></TableHead>
                  <TableHead className="text-right"><SortHeader label="Util Bonif" sortKey="grossProfitBonif" current={clientSort} setCurrent={setClientSort} /></TableHead>
                  <TableHead className="text-right"><SortHeader label="Logística" sortKey="logistics" current={clientSort} setCurrent={setClientSort} /></TableHead>
                  <TableHead className="text-right"><SortHeader label="Util Neta" sortKey="netProfit" current={clientSort} setCurrent={setClientSort} /></TableHead>
                  <TableHead className="text-right"><SortHeader label="Margen" sortKey="netMarginPct" current={clientSort} setCurrent={setClientSort} /></TableHead>
                  <TableHead className="text-right"><SortHeader label="Neta Bonif" sortKey="netProfitBonif" current={clientSort} setCurrent={setClientSort} /></TableHead>
                  <TableHead className="text-right"><SortHeader label="Margen Bonif" sortKey="netMarginBonifPct" current={clientSort} setCurrent={setClientSort} /></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byClient.length > 0 && (
                  <TableRow className="border-b-2 bg-muted/40 font-bold">
                    <TableCell>Total ({byClient.length} clientes)</TableCell>
                    <TableCell className="text-right tabular-nums">{clientTotals.orders}</TableCell>
                    <TableCell className="text-right tabular-nums">{clientTotals.units.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{mxn.format(clientTotals.revenue)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", clientTotals.grossProfit >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(clientTotals.grossProfit)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", clientTotals.grossProfitBonif >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(clientTotals.grossProfitBonif)}</TableCell>
                    <TableCell className="text-right tabular-nums">{mxn.format(clientTotals.logistics)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", clientTotals.netProfit >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(clientTotals.netProfit)}</TableCell>
                    <TableCell />
                    <TableCell className={cn("text-right tabular-nums", clientTotals.netProfitBonif >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(clientTotals.netProfitBonif)}</TableCell>
                    <TableCell />
                  </TableRow>
                )}
                {byClient.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.orders}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.units.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{mxn.format(c.revenue)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", c.grossProfit >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(c.grossProfit)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", c.grossProfitBonif >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(c.grossProfitBonif)}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.logistics > 0 ? mxn.format(c.logistics) : "—"}</TableCell>
                    <TableCell className={cn("text-right tabular-nums font-medium", c.netProfit >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(c.netProfit)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", c.netMarginPct >= 0 ? "text-green-500" : "text-red-500")}>{pct(c.netMarginPct)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums font-medium", c.netProfitBonif >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(c.netProfitBonif)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", c.netMarginBonifPct >= 0 ? "text-green-500" : "text-red-500")}>{pct(c.netMarginBonifPct)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Tab: By Product ── */}
        <TabsContent value="products">
          {/* Mobile summary card */}
          {byProduct.length > 0 && (
            <div className="md:hidden rounded-xl border bg-muted/40 p-4 mb-4 space-y-2">
              <p className="text-sm font-bold">Total ({byProduct.length} productos)</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums">
                <span className="text-muted-foreground">Bultos</span><span className="text-right">{prodTotals.units.toLocaleString()}</span>
                <span className="text-muted-foreground">Ingresos</span><span className="text-right">{mxn.format(prodTotals.revenue)}</span>
                <span className="text-muted-foreground">Utilidad</span><span className={cn("text-right", prodTotals.grossProfit >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(prodTotals.grossProfit)}</span>
                <span className="text-muted-foreground">Util Bonif</span><span className={cn("text-right", prodTotals.grossProfitBonif >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(prodTotals.grossProfitBonif)}</span>
              </div>
            </div>
          )}
          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {byProduct.map(p => (
              <div key={p.id} className="rounded-xl border p-4 space-y-2">
                <p className="text-sm font-bold truncate">{p.name}</p>
                <div className="flex items-center gap-3 text-xs">
                  <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{p.brand}</span>
                  <span className="text-muted-foreground">{p.units.toLocaleString()} bultos</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums">
                  <div><span className="text-muted-foreground text-xs">Ingresos</span><p>{mxn.format(p.revenue)}</p></div>
                  <div><span className="text-muted-foreground text-xs">Utilidad</span><p className={cn(p.grossProfit >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(p.grossProfit)}</p></div>
                  <div><span className="text-muted-foreground text-xs">Margen</span><p className={cn(p.marginPct >= 0 ? "text-green-500" : "text-red-500")}>{pct(p.marginPct)}</p></div>
                  <div><span className="text-muted-foreground text-xs">Util Bonif</span><p className={cn(p.grossProfitBonif >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(p.grossProfitBonif)}</p></div>
                  <div><span className="text-muted-foreground text-xs">Margen Bonif</span><p className={cn(p.marginBonifPct >= 0 ? "text-green-500" : "text-red-500")}>{pct(p.marginBonifPct)}</p></div>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop table */}
          <div className="hidden md:block rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead><SortHeader label="Producto" sortKey="name" current={prodSort} setCurrent={setProdSort} /></TableHead>
                  <TableHead><SortHeader label="Marca" sortKey="brand" current={prodSort} setCurrent={setProdSort} /></TableHead>
                  <TableHead className="text-right"><SortHeader label="Bultos" sortKey="units" current={prodSort} setCurrent={setProdSort} /></TableHead>
                  <TableHead className="text-right"><SortHeader label="Ingresos" sortKey="revenue" current={prodSort} setCurrent={setProdSort} /></TableHead>
                  <TableHead className="text-right"><SortHeader label="Utilidad" sortKey="grossProfit" current={prodSort} setCurrent={setProdSort} /></TableHead>
                  <TableHead className="text-right"><SortHeader label="Margen" sortKey="marginPct" current={prodSort} setCurrent={setProdSort} /></TableHead>
                  <TableHead className="text-right"><SortHeader label="Util Bonif" sortKey="grossProfitBonif" current={prodSort} setCurrent={setProdSort} /></TableHead>
                  <TableHead className="text-right"><SortHeader label="Margen Bonif" sortKey="marginBonifPct" current={prodSort} setCurrent={setProdSort} /></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byProduct.length > 0 && (
                  <TableRow className="border-b-2 bg-muted/40 font-bold">
                    <TableCell colSpan={2}>Total ({byProduct.length} productos)</TableCell>
                    <TableCell className="text-right tabular-nums">{prodTotals.units.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{mxn.format(prodTotals.revenue)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", prodTotals.grossProfit >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(prodTotals.grossProfit)}</TableCell>
                    <TableCell />
                    <TableCell className={cn("text-right tabular-nums", prodTotals.grossProfitBonif >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(prodTotals.grossProfitBonif)}</TableCell>
                    <TableCell />
                  </TableRow>
                )}
                {byProduct.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium max-w-[250px] truncate">{p.name}</TableCell>
                    <TableCell className="text-muted-foreground">{p.brand}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.units.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{mxn.format(p.revenue)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", p.grossProfit >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(p.grossProfit)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", p.marginPct >= 0 ? "text-green-500" : "text-red-500")}>{pct(p.marginPct)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", p.grossProfitBonif >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(p.grossProfitBonif)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", p.marginBonifPct >= 0 ? "text-green-500" : "text-red-500")}>{pct(p.marginBonifPct)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Tab: Company P&L ── */}
        <TabsContent value="company">
          <div className="max-w-3xl">
            <div className="rounded-xl border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[300px]">Concepto</TableHead>
                    <TableHead className="text-right">Normal</TableHead>
                    <TableHead className="text-right">Con Bonificación</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow><TableCell>Ingresos (con IVA)</TableCell><TableCell className="text-right tabular-nums font-medium">{mxn.format(kpis.revenue)}</TableCell><TableCell className="text-right tabular-nums font-medium">{mxn.format(kpis.revenue)}</TableCell></TableRow>
                  <TableRow><TableCell>Ingresos (sin IVA)</TableCell><TableCell className="text-right tabular-nums">{mxn.format(kpis.ventaSinIva)}</TableCell><TableCell className="text-right tabular-nums">{mxn.format(kpis.ventaSinIva)}</TableCell></TableRow>
                  <TableRow className="border-t"><TableCell className="text-muted-foreground">(-) Costo de venta (COGS)</TableCell><TableCell className="text-right tabular-nums text-red-400">{mxn.format(kpis.cogs)}</TableCell><TableCell className="text-right tabular-nums text-red-400">{mxn.format(kpis.cogsBonif)}</TableCell></TableRow>
                  <TableRow className="border-t bg-muted/30"><TableCell className="font-semibold">= Utilidad Bruta</TableCell><TableCell className={cn("text-right tabular-nums font-semibold", kpis.grossProfit >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(kpis.grossProfit)}</TableCell><TableCell className={cn("text-right tabular-nums font-semibold", kpis.grossProfitBonif >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(kpis.grossProfitBonif)}</TableCell></TableRow>
                  <TableRow><TableCell className="text-muted-foreground text-xs pl-8">Margen bruto</TableCell><TableCell className="text-right tabular-nums text-xs text-muted-foreground">{pct(kpis.marginPct)}</TableCell><TableCell className="text-right tabular-nums text-xs text-muted-foreground">{pct(kpis.marginBonifPct)}</TableCell></TableRow>
                  <TableRow className="border-t"><TableCell className="text-muted-foreground">(-) Logística</TableCell><TableCell className="text-right tabular-nums text-red-400">{mxn.format(kpis.totalLogistics)}</TableCell><TableCell className="text-right tabular-nums text-red-400">{mxn.format(kpis.totalLogistics)}</TableCell></TableRow>
                  <TableRow><TableCell className="text-muted-foreground">(-) Gastos fijos</TableCell><TableCell className="text-right tabular-nums text-red-400">{mxn.format(kpis.totalFixed)}</TableCell><TableCell className="text-right tabular-nums text-red-400">{mxn.format(kpis.totalFixed)}</TableCell></TableRow>
                  {(() => {
                    const fromK = dateFrom.slice(0, 7);
                    const toK = dateTo.slice(0, 7);
                    const inRange = expenses.filter(e => {
                      const k = e.month.slice(0, 7);
                      return k >= fromK && k <= toK;
                    });
                    if (inRange.length === 0) return null;
                    const cats = [...new Set(inRange.map(e => e.category))];
                    return cats.map(cat => {
                      const catTotal = inRange.filter(e => e.category === cat).reduce((s, e) => s + Number(e.amount), 0);
                      return (
                        <TableRow key={cat}><TableCell className="text-muted-foreground text-xs pl-8">{cat}</TableCell><TableCell className="text-right tabular-nums text-xs text-muted-foreground">{mxn.format(catTotal)}</TableCell><TableCell className="text-right tabular-nums text-xs text-muted-foreground">{mxn.format(catTotal)}</TableCell></TableRow>
                      );
                    });
                  })()}
                  <TableRow className="border-t-2 bg-muted/30"><TableCell className="font-bold text-base">= Utilidad Neta</TableCell><TableCell className={cn("text-right tabular-nums font-bold text-base", kpis.netProfit >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(kpis.netProfit)}</TableCell><TableCell className={cn("text-right tabular-nums font-bold text-base", kpis.netProfitBonif >= 0 ? "text-green-500" : "text-red-500")}>{mxn.format(kpis.netProfitBonif)}</TableCell></TableRow>
                  <TableRow><TableCell className="text-muted-foreground text-xs pl-8">Margen neto</TableCell><TableCell className="text-right tabular-nums text-xs text-muted-foreground">{pct(kpis.netMarginPct)}</TableCell><TableCell className="text-right tabular-nums text-xs text-muted-foreground">{pct(kpis.netMarginBonifPct)}</TableCell></TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

      </Tabs>
    </div>
  );
}
