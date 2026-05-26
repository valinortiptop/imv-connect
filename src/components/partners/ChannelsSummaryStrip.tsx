/**
 * ChannelsSummaryStrip
 *
 * Rendered at the top of the Dashboard when "Todo" is selected. Three
 * cards side-by-side — Naucalpan, Tamemes, GDL — each showing the
 * single most important number for that channel during the visible
 * period, with a "ver detalle" link to drill in.
 *
 * Keeps the Dashboard from going matrix-mode by:
 *   • NOT trying to render two full PartnerDashboardViews at once.
 *   • Using the same GlowCard / p-5 / typography as the Naucalpan
 *     hero row, so all three cards line up cleanly.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { GlowCard } from "@/components/ui/spotlight-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Truck, ArrowRight } from "lucide-react";

interface Props {
  dateFrom: string;
  dateTo: string;
  /** The pStart / pEnd the Dashboard already computes for its
   *  dashboard_kpis_for_range RPC — passed in so the Naucalpan card
   *  on this strip shows the SAME number as the main Dashboard hero
   *  card (date-aware, not the hardcoded current-month v_dashboard_kpis). */
  pStart: string;
  pEnd: string;
  /** When the user clicks a partner card, flip the business filter
   *  rather than navigating to /partners — keeps them on the dashboard
   *  in the partner view. */
  onPickChannel: (view: "naucalpan" | "tamemes" | "gdl") => void;
}

const mxnFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const fmtMXN = (v: number | null | undefined) => v == null ? "$0" : mxnFmt.format(v);

export function ChannelsSummaryStrip({ dateFrom, dateTo, pStart, pEnd, onPickChannel }: Props) {
  // 1. Naucalpan profit (from orders, no bonificación discount).
  //    realized_profit_bonif in the RPC means "profit computed with
  //    cost discounted by the 7 % per-product bonificación_pct" —
  //    NOT "profit + actual ADM monthly bonificación". The user wants
  //    the latter: raw realized_profit + the Naucalpan amount ADM
  //    actually sent us this month. We compute it in two pieces.
  const { data: naucalpanKpi, isLoading: nLoading } = useQuery({
    queryKey: ["channels-summary-naucalpan", pStart, pEnd],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "dashboard_kpis_for_range",
        { p_start: pStart, p_end: pEnd },
      );
      if (error) throw error;
      return data as {
        realized_profit: number | null;
        realized_profit_bonif: number | null;
        ventas_mes_iva: number | null;
      } | null;
    },
  });

  // 2. Naucalpan slice of monthly_bonificaciones for the visible
  //    period. The user's number includes ADM's actual bonificación
  //    payment, not a derived per-order discount.
  const { data: naucalpanBonifSum = 0 } = useQuery({
    queryKey: ["channels-summary-naucalpan-bonif", dateFrom, dateTo],
    queryFn: async () => {
      let q = (supabase as any)
        .from("monthly_bonificaciones")
        .select("naucalpan_amount");
      if (dateFrom) q = q.gte("period_month", dateFrom);
      if (dateTo) q = q.lte("period_month", dateTo);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).reduce(
        (s: number, r: any) => s + (Number(r.naucalpan_amount) || 0),
        0,
      ) as number;
    },
  });

  // 2. Tamemes — settlements (our 50% utility) + half bonificación
  const { data: tamKpi } = useQuery({
    queryKey: ["channels-summary-tam", dateFrom, dateTo],
    queryFn: async () => {
      const { data: partner } = await (supabase as any)
        .from("partners").select("id").eq("code", "TAM").single();
      if (!partner) return { ours: 0, bultos: 0, revenue: 0 };
      let q1 = (supabase as any)
        .from("partner_monthly_settlements")
        .select("our_share, reported_revenue")
        .eq("partner_id", partner.id);
      if (dateFrom) q1 = q1.gte("period_month", dateFrom);
      if (dateTo) q1 = q1.lte("period_month", dateTo);
      const { data: setts } = await q1;
      const oursFromSetts = (setts ?? []).reduce(
        (s: number, r: any) => s + (Number(r.our_share) || 0),
        0,
      );
      const revenue = (setts ?? []).reduce(
        (s: number, r: any) => s + (Number(r.reported_revenue) || 0),
        0,
      );

      let q2 = (supabase as any)
        .from("monthly_bonificaciones")
        .select("tamemes_amount");
      if (dateFrom) q2 = q2.gte("period_month", dateFrom);
      if (dateTo) q2 = q2.lte("period_month", dateTo);
      const { data: bonifs } = await q2;
      const bonifShare = (bonifs ?? []).reduce(
        (s: number, r: any) => s + (Number(r.tamemes_amount) || 0) * 0.5,
        0,
      );

      let q3 = (supabase as any)
        .from("partner_shipments")
        .select("items:partner_shipment_items(quantity)")
        .eq("partner_id", partner.id);
      if (dateFrom) q3 = q3.gte("shipment_date", dateFrom);
      if (dateTo) q3 = q3.lte("shipment_date", dateTo);
      const { data: shipments } = await q3;
      const bultos = (shipments ?? []).reduce(
        (s: number, r: any) => s + (r.items ?? []).reduce((ss: number, i: any) => ss + (i.quantity ?? 0), 0),
        0,
      );

      return { ours: oursFromSetts + bonifShare, bultos, revenue };
    },
  });

  // 3. GDL — markup (charged − adm_cost) + half bonificación
  const { data: gdlKpi } = useQuery({
    queryKey: ["channels-summary-gdl", dateFrom, dateTo],
    queryFn: async () => {
      const { data: partner } = await (supabase as any)
        .from("partners").select("id").eq("code", "GDL").single();
      if (!partner) return { ours: 0, bultos: 0, revenue: 0 };
      let q1 = (supabase as any)
        .from("partner_shipments")
        .select("adm_total_cost, charged_to_partner, items:partner_shipment_items(quantity)")
        .eq("partner_id", partner.id);
      if (dateFrom) q1 = q1.gte("shipment_date", dateFrom);
      if (dateTo) q1 = q1.lte("shipment_date", dateTo);
      const { data: shipments } = await q1;
      const totalAdm = (shipments ?? []).reduce(
        (s: number, r: any) => s + (Number(r.adm_total_cost) || 0),
        0,
      );
      const totalCharged = (shipments ?? []).reduce(
        (s: number, r: any) => s + (Number(r.charged_to_partner) || 0),
        0,
      );
      const markup = totalCharged - totalAdm;
      const bultos = (shipments ?? []).reduce(
        (s: number, r: any) => s + (r.items ?? []).reduce((ss: number, i: any) => ss + (i.quantity ?? 0), 0),
        0,
      );

      let q2 = (supabase as any)
        .from("monthly_bonificaciones")
        .select("gdl_amount");
      if (dateFrom) q2 = q2.gte("period_month", dateFrom);
      if (dateTo) q2 = q2.lte("period_month", dateTo);
      const { data: bonifs } = await q2;
      const bonifShare = (bonifs ?? []).reduce(
        (s: number, r: any) => s + (Number(r.gdl_amount) || 0) * 0.5,
        0,
      );

      return { ours: markup + bonifShare, bultos, revenue: totalCharged };
    },
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {/* Naucalpan */}
      <GlowCard>
        <div
          className="p-5 cursor-pointer hover:bg-muted/30 transition-all rounded-lg"
          onClick={() => onPickChannel("naucalpan")}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Naucalpan</span>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          {nLoading ? <Skeleton className="h-10 w-32 bg-muted" /> : (() => {
            const profit = Number(naucalpanKpi?.realized_profit ?? 0);
            const bonif = Number(naucalpanBonifSum ?? 0);
            const total = profit + bonif;
            return (
              <>
                <p className="text-2xl sm:text-3xl font-bold text-emerald-500 tracking-tight">{fmtMXN(total)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {fmtMXN(profit)} utilidad + {fmtMXN(bonif)} bonificación
                </p>
              </>
            );
          })()}
        </div>
      </GlowCard>

      {/* Tamemes */}
      <GlowCard>
        <div
          className="p-5 cursor-pointer hover:bg-muted/30 transition-all rounded-lg"
          onClick={() => onPickChannel("tamemes")}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-purple-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tamemes</span>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-emerald-500 tracking-tight">{fmtMXN(tamKpi?.ours ?? 0)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Tu 50% + bonif · {(tamKpi?.bultos ?? 0).toLocaleString("es-MX")} bultos enviados
          </p>
        </div>
      </GlowCard>

      {/* GDL */}
      <GlowCard>
        <div
          className="p-5 cursor-pointer hover:bg-muted/30 transition-all rounded-lg"
          onClick={() => onPickChannel("gdl")}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-orange-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Guadalajara</span>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-emerald-500 tracking-tight">{fmtMXN(gdlKpi?.ours ?? 0)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Markup + bonif · {(gdlKpi?.bultos ?? 0).toLocaleString("es-MX")} bultos enviados
          </p>
        </div>
      </GlowCard>
    </div>
  );
}
