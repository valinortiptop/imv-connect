/**
 * MonthlyBonificacionesTab
 *
 * The "Bonificaciones" section inside /partners. Shows every monthly
 * bonificación entry: the 3-way ADM split (Naucalpan / Tamemes / GDL),
 * the live calculation of "what we keep" vs "what we owe each partner",
 * and the settlement status (received from ADM ✓ / paid to Tam ☐ / paid
 * to GDL ☐).
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
  Gift, Building2, CheckCircle2, Clock, Download, Pencil, TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import type { BonificacionRow } from "@/components/partners/MonthlyBonificacionDialog";
import { BackfillMonthsBanner } from "@/components/partners/BackfillMonthsBanner";

const mxnFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const mxnFmtPrecise = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
const fmtMXN = (v: number | null | undefined) => v == null ? "—" : mxnFmt.format(v);
const fmtMXNPrecise = (v: number | null | undefined) => v == null ? "—" : mxnFmtPrecise.format(v);
const fmtMonth = (d: string) => {
  try { return format(new Date(d + "T00:00:00"), "MMMM yyyy", { locale: esLocale }); } catch { return d; }
};

interface Props {
  /** YYYY-MM-DD lower bound (inclusive) — "" = no lower bound. */
  dateFrom: string;
  /** YYYY-MM-DD upper bound (inclusive) — "" = no upper bound. */
  dateTo: string;
  /** Called when the user clicks a row or the pencil — parent owns the
   *  dialog state. */
  onEditRow: (row: BonificacionRow) => void;
  /** Called when the user clicks a missing-month chip in the backfill
   *  banner. Parent opens the dialog pre-seeded to that month. */
  onPickMonth: (date: Date) => void;
}

export function MonthlyBonificacionesTab({ dateFrom, dateTo, onEditRow, onPickMonth }: Props) {
  const { data: allRows = [], isLoading } = useQuery({
    queryKey: ["monthly-bonificaciones"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("monthly_bonificaciones")
        .select("*")
        .order("period_month", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BonificacionRow[];
    },
    staleTime: 30 * 1000,
  });

  // Filter rows whose period_month falls inside [dateFrom, dateTo].
  // The chrono bar applies an inclusive range; bonificaciones are
  // monthly so we compare on the period_month date string directly.
  const rows = useMemo(() => {
    return allRows.filter(r => {
      if (dateFrom && r.period_month < dateFrom) return false;
      if (dateTo && r.period_month > dateTo) return false;
      return true;
    });
  }, [allRows, dateFrom, dateTo]);

  // KPIs across all visible rows
  const kpis = useMemo(() => {
    let totalAdm = 0;
    let ourTotal = 0;
    let owedTam = 0;
    let owedGdl = 0;
    let pendingTam = 0;
    let pendingGdl = 0;
    let pendingFromAdm = 0;
    for (const r of rows) {
      const n = Number(r.naucalpan_amount) || 0;
      const t = Number(r.tamemes_amount) || 0;
      const g = Number(r.gdl_amount) || 0;
      totalAdm += n + t + g;
      ourTotal += n + t * 0.5 + g * 0.5;
      owedTam += t * 0.5;
      owedGdl += g * 0.5;
      if (!r.received_at) pendingFromAdm += n + t + g;
      if (!r.tamemes_settled_at && t > 0) pendingTam += t * 0.5;
      if (!r.gdl_settled_at && g > 0) pendingGdl += g * 0.5;
    }
    return { totalAdm, ourTotal, owedTam, owedGdl, pendingTam, pendingGdl, pendingFromAdm };
  }, [rows]);

  const openProof = (path: string | null) => {
    if (!path) return;
    const { data } = supabase.storage.from("stock-delivery-documents").getPublicUrl(path);
    window.open(data.publicUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Gift className="h-5 w-5 text-purple-500" />
          Bonificaciones mensuales
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          ADM envía un reporte mensual con las bonificaciones. Naucalpan es 100% nuestra, los partners 50/50.
        </p>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <GlowCard>
          <div className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <TrendingUp className="h-3.5 w-3.5" /> Total recibido de ADM
            </div>
            <div className="text-2xl font-bold tabular-nums">{fmtMXN(kpis.totalAdm)}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{rows.length} mes{rows.length === 1 ? "" : "es"}</div>
          </div>
        </GlowCard>
        <GlowCard>
          <div className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Building2 className="h-3.5 w-3.5" /> A ti acumulado
            </div>
            <div className="text-2xl font-bold tabular-nums text-emerald-500">{fmtMXN(kpis.ourTotal)}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Naucalpan + 50% Tam + 50% GDL</div>
          </div>
        </GlowCard>
        <GlowCard>
          <div className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Clock className="h-3.5 w-3.5" /> Pendiente a Tamemes
            </div>
            <div className={cn(
              "text-2xl font-bold tabular-nums",
              kpis.pendingTam > 0 ? "text-amber-500" : "text-emerald-500",
            )}>
              {fmtMXN(kpis.pendingTam)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">De {fmtMXN(kpis.owedTam)} total</div>
          </div>
        </GlowCard>
        <GlowCard>
          <div className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Clock className="h-3.5 w-3.5" /> Pendiente a GDL
            </div>
            <div className={cn(
              "text-2xl font-bold tabular-nums",
              kpis.pendingGdl > 0 ? "text-amber-500" : "text-emerald-500",
            )}>
              {fmtMXN(kpis.pendingGdl)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">De {fmtMXN(kpis.owedGdl)} total</div>
          </div>
        </GlowCard>
      </div>

      {/* Backfill banner — surfaces last-12-months that have no
          entry yet, regardless of the ChronoBar filter. One click
          jumps straight into the dialog for that month. */}
      <BackfillMonthsBanner
        existingPeriodMonths={allRows.map(r => r.period_month)}
        title="Bonificaciones por capturar"
        chipLabel="Capturar"
        onPick={onPickMonth}
      />

      {/* Table */}
      <GlowCard>
        <div className="p-4 md:p-6 space-y-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">Historial</h3>
            <p className="text-xs text-muted-foreground">
              Click en el mes para abrir y editar. Click en el ícono de descarga para abrir la imagen original de ADM.
            </p>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <Gift className="h-10 w-10 mx-auto opacity-30 mb-2 text-purple-500" />
              <p className="text-sm text-muted-foreground">
                Aún no hay bonificaciones registradas.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Click en "Nueva bonificación" para capturar el reporte mensual de ADM.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-semibold text-xs">Mes</TableHead>
                    <TableHead className="font-semibold text-xs text-right">Naucalpan</TableHead>
                    <TableHead className="font-semibold text-xs text-right">Tamemes</TableHead>
                    <TableHead className="font-semibold text-xs text-right">GDL</TableHead>
                    <TableHead className="font-semibold text-xs text-right">Total ADM</TableHead>
                    <TableHead className="font-semibold text-xs text-right">A ti</TableHead>
                    <TableHead className="font-semibold text-xs">Estado</TableHead>
                    <TableHead className="font-semibold text-xs text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(r => {
                    const n = Number(r.naucalpan_amount) || 0;
                    const t = Number(r.tamemes_amount) || 0;
                    const g = Number(r.gdl_amount) || 0;
                    const totalAdm = n + t + g;
                    const ours = n + t * 0.5 + g * 0.5;
                    return (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer hover:bg-muted/30"
                        onClick={() => onEditRow(r)}
                      >
                        <TableCell className="font-medium capitalize">
                          {fmtMonth(r.period_month)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{t > 0 || g > 0 || n > 0 ? fmtMXNPrecise(n) : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{fmtMXNPrecise(t)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{fmtMXNPrecise(g)}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">{fmtMXNPrecise(totalAdm)}</TableCell>
                        <TableCell className="text-right tabular-nums font-bold text-emerald-500">{fmtMXNPrecise(ours)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 flex-wrap">
                            <Badge
                              variant="outline"
                              className={cn(
                                "gap-1 text-[10px]",
                                r.received_at
                                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40"
                                  : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
                              )}
                            >
                              {r.received_at ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                              ADM
                            </Badge>
                            {t > 0 && (
                              <Badge
                                variant="outline"
                                className={cn(
                                  "gap-1 text-[10px]",
                                  r.tamemes_settled_at
                                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40"
                                    : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
                                )}
                              >
                                {r.tamemes_settled_at ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                                TAM
                              </Badge>
                            )}
                            {g > 0 && (
                              <Badge
                                variant="outline"
                                className={cn(
                                  "gap-1 text-[10px]",
                                  r.gdl_settled_at
                                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40"
                                    : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
                                )}
                              >
                                {r.gdl_settled_at ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                                GDL
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            {r.adm_proof_path && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openProof(r.adm_proof_path)}
                                className="h-8 w-8 text-blue-400 hover:text-blue-300"
                                title="Abrir imagen ADM"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onEditRow(r)}
                              className="h-8 w-8"
                              title="Editar"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </div>
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
