/**
 * TamemesLiquidacionesTab
 *
 * The third tab on /partners — Tamemes monthly settlement history.
 * Shows KPI tiles + a table of every cierre. Row click / pencil
 * opens the edit dialog (state lives in Partners.tsx).
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GlowCard } from "@/components/ui/spotlight-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  FileSpreadsheet, CheckCircle2, Clock, Pencil, TrendingUp, Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import type { SettlementRow } from "@/components/partners/TamemesLiquidacionDialog";
import { BackfillMonthsBanner } from "@/components/partners/BackfillMonthsBanner";

interface Partner {
  id: string;
  code: string;
  name: string;
}

interface Props {
  partner: Partner | null;
  dateFrom: string;
  dateTo: string;
  onEditRow: (row: SettlementRow) => void;
  onPickMonth: (date: Date) => void;
}

const mxnFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const mxnFmtPrecise = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
const fmtMXN = (v: number | null | undefined) => v == null ? "—" : mxnFmt.format(v);
const fmtMXNPrecise = (v: number | null | undefined) => v == null ? "—" : mxnFmtPrecise.format(v);
const fmtMonth = (d: string) => {
  try { return format(new Date(d + "T00:00:00"), "MMMM yyyy", { locale: esLocale }); } catch { return d; }
};

export function TamemesLiquidacionesTab({ partner, dateFrom, dateTo, onEditRow, onPickMonth }: Props) {
  const { data: allRows = [], isLoading } = useQuery({
    queryKey: ["partner-settlements", partner?.id],
    queryFn: async () => {
      if (!partner) return [] as SettlementRow[];
      const { data, error } = await (supabase as any)
        .from("partner_monthly_settlements")
        .select("*")
        .eq("partner_id", partner.id)
        .order("period_month", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SettlementRow[];
    },
    enabled: !!partner,
    staleTime: 30 * 1000,
  });

  // Filter by chrono-bar range (inclusive)
  const rows = useMemo(() => {
    return allRows.filter(r => {
      if (dateFrom && r.period_month < dateFrom) return false;
      if (dateTo && r.period_month > dateTo) return false;
      return true;
    });
  }, [allRows, dateFrom, dateTo]);

  // KPIs across visible rows
  const kpis = useMemo(() => {
    let totalRevenue = 0;
    let totalCost = 0;
    let totalProfit = 0;
    let ourTotal = 0;
    let settled = 0;
    let pending = 0;
    let pendingMoney = 0;
    for (const r of rows) {
      totalRevenue += Number(r.reported_revenue) || 0;
      totalCost += Number(r.cost_basis) || 0;
      totalProfit += Number(r.gross_profit) || 0;
      ourTotal += Number(r.our_share) || 0;
      if (r.settled_at) settled++;
      else {
        pending++;
        pendingMoney += Number(r.our_share) || 0;
      }
    }
    const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    return { totalRevenue, totalCost, totalProfit, ourTotal, settled, pending, pendingMoney, avgMargin };
  }, [rows]);

  if (!partner) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <FileSpreadsheet className="h-10 w-10 mx-auto opacity-30 mb-2" />
        <p className="text-sm text-muted-foreground">Cargando partner…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-blue-500" />
          Liquidaciones mensuales · {partner.name}
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Cierre mensual con {partner.name}: ellos reportan ingresos, partimos 50/50 sobre la utilidad y sumamos la mitad de la bonificación del mes.
        </p>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <GlowCard>
          <div className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Building2 className="h-3.5 w-3.5" /> Ingresos reportados
            </div>
            <div className="text-2xl font-bold tabular-nums">{fmtMXN(kpis.totalRevenue)}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{rows.length} mes{rows.length === 1 ? "" : "es"}</div>
          </div>
        </GlowCard>
        <GlowCard>
          <div className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <TrendingUp className="h-3.5 w-3.5" /> Utilidad bruta
            </div>
            <div className={cn(
              "text-2xl font-bold tabular-nums",
              kpis.totalProfit > 0 ? "text-emerald-500" : kpis.totalProfit < 0 ? "text-red-500" : "text-foreground",
            )}>
              {fmtMXN(kpis.totalProfit)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {kpis.avgMargin.toFixed(2)}% margen promedio
            </div>
          </div>
        </GlowCard>
        <GlowCard>
          <div className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <TrendingUp className="h-3.5 w-3.5" /> Tu 50% acumulado
            </div>
            <div className="text-2xl font-bold tabular-nums text-emerald-500">{fmtMXN(kpis.ourTotal)}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Solo utilidad (sin bonificación)</div>
          </div>
        </GlowCard>
        <GlowCard>
          <div className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Clock className="h-3.5 w-3.5" /> Sin liquidar
            </div>
            <div className={cn(
              "text-2xl font-bold tabular-nums",
              kpis.pending > 0 ? "text-amber-500" : "text-emerald-500",
            )}>
              {kpis.pending}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {kpis.pending > 0 ? `${fmtMXN(kpis.pendingMoney)} pendiente cobrar` : "Todo al día"}
            </div>
          </div>
        </GlowCard>
      </div>

      {/* Backfill banner — surfaces last-12-months without a Tamemes
          settlement, regardless of the ChronoBar filter. Click jumps
          straight into the dialog pre-seeded for that month. */}
      <BackfillMonthsBanner
        existingPeriodMonths={allRows.map(r => r.period_month)}
        title="Liquidaciones por cerrar"
        chipLabel="Cerrar mes"
        onPick={onPickMonth}
      />

      {/* Table */}
      <GlowCard>
        <div className="p-4 md:p-6 space-y-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">Historial</h3>
            <p className="text-xs text-muted-foreground">
              Click en cualquier fila para abrir y editar. Marca "Liquidado el" cuando recibas el pago.
            </p>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <FileSpreadsheet className="h-10 w-10 mx-auto opacity-30 mb-2" />
              <p className="text-sm text-muted-foreground">
                Aún no hay liquidaciones registradas para {partner.name}.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Click en "Nueva liquidación" arriba para capturar el primer cierre.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-semibold text-xs">Mes</TableHead>
                    <TableHead className="font-semibold text-xs text-right">Ingresos</TableHead>
                    <TableHead className="font-semibold text-xs text-right">Costo base</TableHead>
                    <TableHead className="font-semibold text-xs text-right">Utilidad</TableHead>
                    <TableHead className="font-semibold text-xs text-right">Margen</TableHead>
                    <TableHead className="font-semibold text-xs text-right">Tu 50%</TableHead>
                    <TableHead className="font-semibold text-xs">Estado</TableHead>
                    <TableHead className="font-semibold text-xs text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(r => {
                    const rev = Number(r.reported_revenue) || 0;
                    const cost = Number(r.cost_basis) || 0;
                    const profit = Number(r.gross_profit) || 0;
                    const margin = rev > 0 ? (profit / rev) * 100 : 0;
                    return (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer hover:bg-muted/30"
                        onClick={() => onEditRow(r)}
                      >
                        <TableCell className="font-medium capitalize">{fmtMonth(r.period_month)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMXNPrecise(rev)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{fmtMXNPrecise(cost)}</TableCell>
                        <TableCell className={cn(
                          "text-right tabular-nums font-semibold",
                          profit > 0 ? "text-emerald-500" : profit < 0 ? "text-red-500" : "text-muted-foreground",
                        )}>
                          {fmtMXNPrecise(profit)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {rev > 0 ? `${margin.toFixed(2)}%` : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-bold text-emerald-500">{fmtMXNPrecise(Number(r.our_share) || 0)}</TableCell>
                        <TableCell>
                          {r.settled_at ? (
                            <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 gap-1 text-[10px]">
                              <CheckCircle2 className="h-3 w-3" />
                              {format(new Date(r.settled_at), "dd/MM/yy", { locale: esLocale })}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40 gap-1 text-[10px]">
                              <Clock className="h-3 w-3" />
                              Pendiente
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onEditRow(r)}
                            className="h-8 w-8"
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </GlowCard>
    </div>
  );
}
