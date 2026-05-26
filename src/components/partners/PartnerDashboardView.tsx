/**
 * PartnerDashboardView
 *
 * Renders the dashboard content when the user filters by Tamemes or
 * GDL. Pulls partner-specific data (shipments, settlements,
 * bonificación) and computes the KPIs that actually matter for the
 * partner channel — no inventory / warehouse cards, since ADM ships
 * directly to them.
 *
 * Date filtering follows the same dateFrom / dateTo strings the
 * ChronoBar emits. Empty = no bound on that side.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@/lib/router-compat";
import { GlowCard } from "@/components/ui/spotlight-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Truck, TrendingUp, Gift, Clock, CheckCircle2, Package,
  ArrowRight, FileSpreadsheet, DollarSign, Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es as esLocale } from "date-fns/locale";

interface Props {
  /** Partner code — "TAM" or "GDL". */
  partnerCode: "TAM" | "GDL";
  dateFrom: string;
  dateTo: string;
}

const mxnFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const fmtMXN = (v: number | null | undefined) => v == null ? "$0" : mxnFmt.format(v);

interface Partner {
  id: string;
  code: string;
  name: string;
  settlement_model: "monthly_split" | "per_shipment_markup";
}

interface Shipment {
  id: string;
  shipment_code: string;
  shipment_date: string;
  adm_total_cost: number | null;
  charged_to_partner: number | null;
  partner_paid_at: string | null;
}

interface ShipmentItem { quantity: number; }

interface Settlement {
  id: string;
  period_month: string;
  reported_revenue: number | null;
  cost_basis: number | null;
  gross_profit: number | null;
  our_share: number | null;
  settled_at: string | null;
}

interface Bonificacion {
  id: string;
  period_month: string;
  naucalpan_amount: number;
  tamemes_amount: number;
  gdl_amount: number;
  tamemes_settled_at: string | null;
  gdl_settled_at: string | null;
}

export function PartnerDashboardView({ partnerCode, dateFrom, dateTo }: Props) {
  const navigate = useNavigate();

  // 1. Get the partner record itself
  const { data: partner } = useQuery({
    queryKey: ["partner-by-code", partnerCode],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("partners")
        .select("id, code, name, settlement_model")
        .eq("code", partnerCode)
        .single();
      if (error) throw error;
      return data as Partner;
    },
  });

  // 2. Shipments in the visible range, with line items so we can sum bultos
  const { data: shipments = [], isLoading: shipmentsLoading } = useQuery({
    queryKey: ["partner-dashboard-shipments", partner?.id, dateFrom, dateTo],
    queryFn: async () => {
      if (!partner) return [] as (Shipment & { items: ShipmentItem[] })[];
      let q = (supabase as any)
        .from("partner_shipments")
        .select("id, shipment_code, shipment_date, adm_total_cost, charged_to_partner, partner_paid_at, items:partner_shipment_items(quantity)")
        .eq("partner_id", partner.id)
        .order("shipment_date", { ascending: false });
      if (dateFrom) q = q.gte("shipment_date", dateFrom);
      if (dateTo) q = q.lte("shipment_date", dateTo);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as (Shipment & { items: ShipmentItem[] })[];
    },
    enabled: !!partner,
  });

  // 3. Settlements (Tamemes only — GDL doesn't have them)
  const { data: settlements = [] } = useQuery({
    queryKey: ["partner-dashboard-settlements", partner?.id, dateFrom, dateTo],
    queryFn: async () => {
      if (!partner) return [] as Settlement[];
      let q = (supabase as any)
        .from("partner_monthly_settlements")
        .select("id, period_month, reported_revenue, cost_basis, gross_profit, our_share, settled_at")
        .eq("partner_id", partner.id)
        .order("period_month", { ascending: false });
      if (dateFrom) q = q.gte("period_month", dateFrom);
      if (dateTo) q = q.lte("period_month", dateTo);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Settlement[];
    },
    enabled: !!partner && partner.settlement_model === "monthly_split",
  });

  // 4. Bonificaciones in the visible range (we filter the partner's
  //    column client-side)
  const { data: bonifs = [] } = useQuery({
    queryKey: ["partner-dashboard-bonifs", dateFrom, dateTo],
    queryFn: async () => {
      let q = (supabase as any)
        .from("monthly_bonificaciones")
        .select("id, period_month, naucalpan_amount, tamemes_amount, gdl_amount, tamemes_settled_at, gdl_settled_at")
        .order("period_month", { ascending: false });
      if (dateFrom) q = q.gte("period_month", dateFrom);
      if (dateTo) q = q.lte("period_month", dateTo);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Bonificacion[];
    },
  });

  // ── KPIs ─────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalShipments = shipments.length;
    const totalBultos = shipments.reduce(
      (s, x) => s + (x.items ?? []).reduce((ss, i) => ss + (i.quantity ?? 0), 0),
      0,
    );
    const totalAdmCost = shipments.reduce((s, x) => s + (Number(x.adm_total_cost) || 0), 0);
    const totalCharged = shipments.reduce((s, x) => s + (Number(x.charged_to_partner) || 0), 0);

    // For GDL the markup = charged − ADM cost (100% ours, no split).
    // For TAM the difference is usually 0 (sold at cost); the real profit
    // comes from settlements.
    const totalMarkup = totalCharged - totalAdmCost;
    const pendingPayment = shipments.filter(s => !s.partner_paid_at).length;
    const pendingPaymentMoney = shipments
      .filter(s => !s.partner_paid_at)
      .reduce((s, x) => s + (Number(x.charged_to_partner) || 0), 0);

    // Settlements (Tamemes)
    const settledRevenue = settlements.reduce((s, x) => s + (Number(x.reported_revenue) || 0), 0);
    const settledProfit = settlements.reduce((s, x) => s + (Number(x.gross_profit) || 0), 0);
    const ourSettledShare = settlements.reduce((s, x) => s + (Number(x.our_share) || 0), 0);
    const pendingSettlement = settlements.filter(s => !s.settled_at).length;
    const pendingSettlementMoney = settlements
      .filter(s => !s.settled_at)
      .reduce((s, x) => s + (Number(x.our_share) || 0), 0);

    // Bonificación (partner-specific column)
    const bonifKey = partnerCode === "TAM" ? "tamemes_amount" : "gdl_amount";
    const settledKey = partnerCode === "TAM" ? "tamemes_settled_at" : "gdl_settled_at";
    const totalBonif = bonifs.reduce((s, x) => s + (Number(x[bonifKey]) || 0), 0);
    const ourBonifShare = totalBonif * 0.5;
    const pendingBonif = bonifs
      .filter(b => !b[settledKey] && (Number(b[bonifKey]) || 0) > 0)
      .reduce((s, x) => s + (Number(x[bonifKey]) || 0) * 0.5, 0);

    // Our grand total = markup (GDL only, since TAM markup ≈ 0) +
    //                    settled profit (TAM only) + bonif share
    const grandOurs = partnerCode === "GDL"
      ? totalMarkup + ourBonifShare
      : ourSettledShare + ourBonifShare;

    return {
      totalShipments, totalBultos, totalAdmCost, totalCharged, totalMarkup,
      pendingPayment, pendingPaymentMoney,
      settledRevenue, settledProfit, ourSettledShare,
      pendingSettlement, pendingSettlementMoney,
      totalBonif, ourBonifShare, pendingBonif,
      grandOurs,
    };
  }, [shipments, settlements, bonifs, partnerCode]);

  const isTam = partnerCode === "TAM";

  return (
    <div className="space-y-6">
      {/* ── Row 1: Hero — Grand total + bultos/embarques + markup or settled ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Grand total to us */}
        <GlowCard>
          <div className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="h-4 w-4 text-emerald-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tu total · {partner?.name ?? partnerCode}</span>
            </div>
            {shipmentsLoading ? <Skeleton className="h-10 w-32 bg-muted" /> : (
              <>
                <p className="text-2xl sm:text-3xl font-bold text-emerald-500 tracking-tight">{fmtMXN(kpis.grandOurs)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {isTam
                    ? `${fmtMXN(kpis.ourSettledShare)} liquidación + ${fmtMXN(kpis.ourBonifShare)} bonif`
                    : `${fmtMXN(kpis.totalMarkup)} markup + ${fmtMXN(kpis.ourBonifShare)} bonif`}
                </p>
              </>
            )}
          </div>
        </GlowCard>

        {/* Bultos shipped */}
        <GlowCard>
          <div
            className="p-5 cursor-pointer hover:bg-muted/30 transition-all rounded-lg"
            onClick={() => navigate("/partners")}
          >
            <div className="flex items-center gap-2 mb-3">
              <Package className="h-4 w-4 text-blue-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Embarques</span>
            </div>
            {shipmentsLoading ? <Skeleton className="h-10 w-32 bg-muted" /> : (
              <>
                <p className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">{kpis.totalBultos.toLocaleString("es-MX")}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {kpis.totalShipments} embarque{kpis.totalShipments === 1 ? "" : "s"} · {fmtMXN(kpis.totalAdmCost)} costo ADM
                </p>
              </>
            )}
          </div>
        </GlowCard>

        {/* Markup (GDL) or Reported revenue (Tamemes) */}
        <GlowCard>
          <div
            className="p-5 cursor-pointer hover:bg-muted/30 transition-all rounded-lg"
            onClick={() => navigate("/partners")}
          >
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-cyan-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {isTam ? "Reportado vendido" : "Markup acumulado"}
              </span>
            </div>
            {shipmentsLoading ? <Skeleton className="h-10 w-32 bg-muted" /> : isTam ? (
              <>
                <p className="text-2xl font-bold text-foreground tracking-tight">{fmtMXN(kpis.settledRevenue)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {fmtMXN(kpis.settledProfit)} utilidad · {kpis.settledRevenue > 0 ? ((kpis.settledProfit / kpis.settledRevenue) * 100).toFixed(2) : "0"}% margen
                </p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-emerald-500 tracking-tight">{fmtMXN(kpis.totalMarkup)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Cobrado {fmtMXN(kpis.totalCharged)} − Costo {fmtMXN(kpis.totalAdmCost)}
                </p>
              </>
            )}
          </div>
        </GlowCard>

        {/* Bonificación */}
        <GlowCard>
          <div
            className="p-5 cursor-pointer hover:bg-muted/30 transition-all rounded-lg"
            onClick={() => navigate("/partners")}
          >
            <div className="flex items-center gap-2 mb-3">
              <Gift className="h-4 w-4 text-purple-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bonificación</span>
            </div>
            {shipmentsLoading ? <Skeleton className="h-10 w-32 bg-muted" /> : (
              <>
                <p className="text-2xl font-bold text-foreground tracking-tight">{fmtMXN(kpis.ourBonifShare)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Tu 50% de {fmtMXN(kpis.totalBonif)} · {fmtMXN(kpis.pendingBonif)} por cobrar
                </p>
              </>
            )}
          </div>
        </GlowCard>
      </div>

      {/* ── Row 2: Pending alerts ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GlowCard>
          <div
            className="p-4 cursor-pointer hover:bg-muted/30 transition-all rounded-lg flex items-center gap-3"
            onClick={() => navigate("/partners")}
          >
            <div className={cn(
              "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
              kpis.pendingPayment > 0 ? "bg-amber-500/15 text-amber-500" : "bg-emerald-500/15 text-emerald-500",
            )}>
              {kpis.pendingPayment > 0 ? <Clock className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">
                {kpis.pendingPayment} pago{kpis.pendingPayment === 1 ? "" : "s"} pendiente{kpis.pendingPayment === 1 ? "" : "s"}
              </div>
              <div className="text-xs text-muted-foreground">
                {kpis.pendingPayment > 0
                  ? `${fmtMXN(kpis.pendingPaymentMoney)} sin cobrar de ${partner?.name ?? partnerCode}`
                  : "Todos los embarques cobrados"}
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </GlowCard>

        <GlowCard>
          {isTam ? (
            <div
              className="p-4 cursor-pointer hover:bg-muted/30 transition-all rounded-lg flex items-center gap-3"
              onClick={() => navigate("/partners")}
            >
              <div className={cn(
                "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                kpis.pendingSettlement > 0 ? "bg-amber-500/15 text-amber-500" : "bg-emerald-500/15 text-emerald-500",
              )}>
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">
                  {kpis.pendingSettlement} liquidación{kpis.pendingSettlement === 1 ? "" : "es"} pendiente{kpis.pendingSettlement === 1 ? "" : "s"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {kpis.pendingSettlement > 0
                    ? `${fmtMXN(kpis.pendingSettlementMoney)} sin liquidar (tu 50%)`
                    : "Cierres al día"}
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
          ) : (
            <div
              className="p-4 cursor-pointer hover:bg-muted/30 transition-all rounded-lg flex items-center gap-3"
              onClick={() => navigate("/partners")}
            >
              <div className={cn(
                "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                kpis.pendingBonif > 0 ? "bg-amber-500/15 text-amber-500" : "bg-emerald-500/15 text-emerald-500",
              )}>
                <Gift className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">
                  {fmtMXN(kpis.pendingBonif)} en bonificación por liquidar
                </div>
                <div className="text-xs text-muted-foreground">
                  Tu 50% de las bonificaciones aún no pagadas a {partner?.name ?? partnerCode}
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </GlowCard>
      </div>

      {/* ── Row 3: Recent shipments ── */}
      <GlowCard>
        <div className="p-4 md:p-6 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Truck className="h-4 w-4" />
                Embarques recientes · {partner?.name ?? partnerCode}
              </h2>
              <p className="text-xs text-muted-foreground">
                Últimos {Math.min(shipments.length, 10)} embarques en el período seleccionado
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/partners")} className="gap-1.5">
              Ver todos <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          {shipmentsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : shipments.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <Truck className="h-8 w-8 mx-auto opacity-30 mb-1" />
              Sin embarques en este período.
            </div>
          ) : (
            <div className="space-y-1">
              {shipments.slice(0, 10).map(s => {
                const markup = (Number(s.charged_to_partner) || 0) - (Number(s.adm_total_cost) || 0);
                return (
                  <div
                    key={s.id}
                    onClick={() => navigate("/partners")}
                    className="flex items-center gap-3 py-2 px-2 rounded-md hover:bg-muted/30 cursor-pointer"
                  >
                    <span className="font-mono text-xs text-blue-400 w-24 shrink-0">{s.shipment_code}</span>
                    <span className="text-xs text-muted-foreground w-16 shrink-0 tabular-nums">
                      {format(new Date(s.shipment_date + "T00:00:00"), "dd/MM/yy", { locale: esLocale })}
                    </span>
                    <span className="text-xs flex-1">
                      <span className="text-muted-foreground">ADM </span>
                      <span className="tabular-nums">{fmtMXN(s.adm_total_cost)}</span>
                      <span className="text-muted-foreground"> · cobrado </span>
                      <span className="tabular-nums font-medium">{fmtMXN(s.charged_to_partner)}</span>
                    </span>
                    {markup !== 0 && (
                      <Badge variant="outline" className={cn(
                        "text-[10px] tabular-nums",
                        markup > 0
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/40"
                          : "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/40",
                      )}>
                        {markup > 0 ? "+" : ""}{fmtMXN(markup)}
                      </Badge>
                    )}
                    <Badge variant="outline" className={cn(
                      "text-[10px]",
                      s.partner_paid_at
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/40"
                        : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/40",
                    )}>
                      {s.partner_paid_at ? "Pagado" : "Pendiente"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </GlowCard>

      {/* Tamemes only: settlements summary */}
      {isTam && settlements.length > 0 && (
        <GlowCard>
          <div className="p-4 md:p-6 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-blue-500" />
                  Liquidaciones mensuales
                </h2>
                <p className="text-xs text-muted-foreground">Cierre 50/50 con Tamemes — utilidad + bonif</p>
              </div>
            </div>
            <div className="space-y-1">
              {settlements.slice(0, 6).map(s => (
                <div
                  key={s.id}
                  onClick={() => navigate("/partners")}
                  className="flex items-center gap-3 py-2 px-2 rounded-md hover:bg-muted/30 cursor-pointer"
                >
                  <span className="text-xs font-semibold capitalize w-32 shrink-0">
                    {format(new Date(s.period_month + "T00:00:00"), "MMMM yyyy", { locale: esLocale })}
                  </span>
                  <span className="text-xs flex-1">
                    <span className="text-muted-foreground">Ventas </span>
                    <span className="tabular-nums">{fmtMXN(s.reported_revenue)}</span>
                    <span className="text-muted-foreground"> · utilidad </span>
                    <span className="tabular-nums font-medium">{fmtMXN(s.gross_profit)}</span>
                  </span>
                  <span className="text-xs tabular-nums font-bold text-emerald-500">
                    {fmtMXN(s.our_share)} <span className="text-muted-foreground font-normal">tu 50%</span>
                  </span>
                  <Badge variant="outline" className={cn(
                    "text-[10px]",
                    s.settled_at
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/40"
                      : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/40",
                  )}>
                    {s.settled_at ? format(new Date(s.settled_at), "dd/MM/yy", { locale: esLocale }) : "Pendiente"}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </GlowCard>
      )}

      {/* Subtle footer hint about scope */}
      <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground flex items-start gap-2">
        <Building2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <div>
          Esta vista muestra solo el canal <span className="font-semibold text-foreground">{partner?.name ?? partnerCode}</span>.
          ADM envía directo al partner, así que no afecta tu inventario ni los pedidos directos de Naucalpan.
        </div>
      </div>
    </div>
  );
}
