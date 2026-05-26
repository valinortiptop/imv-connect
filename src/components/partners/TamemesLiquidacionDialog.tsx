/**
 * TamemesLiquidacionDialog
 *
 * End-of-month reconciliation for Tamemes. They tell us how much
 * they sold in retail, we already know what we shipped them at
 * cost, the system computes the gross profit and the 50/50 split,
 * and we tack on the bonificación split for that month so the user
 * sees the full picture before settling.
 *
 *   Costo base   = SUM(partner_shipments.adm_total_cost) for the
 *                  month and partner_id=Tamemes.
 *   Ingresos     = what Tamemes reports they sold (user input).
 *   Utilidad     = ingresos − costo_base.
 *   Tu 50%       = utilidad × 0.5.
 *   Su 50%       = utilidad × 0.5.
 *   Bonif TAM    = monthly_bonificaciones.tamemes_amount × 0.5
 *                  (pulled from the same period, read-only here —
 *                  managed on the Bonificaciones tab).
 *
 *   Total a recibir/pagar = display, not stored (live computed).
 *
 * Saves into partner_monthly_settlements. UNIQUE(partner_id,
 * period_month) means trying to add the same month twice will
 * gracefully UPSERT.
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CurrencyInput } from "@/components/partners/CurrencyInput";
import {
  AlertTriangle, Loader2, Save, Trash2, FileSpreadsheet, CheckCircle2, Clock,
  ChevronLeft, ChevronRight, Truck, Gift, TrendingUp, CalendarIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es as esLocale } from "date-fns/locale";

export interface SettlementRow {
  id: string;
  partner_id: string;
  period_month: string;
  reported_revenue: number | null;
  cost_basis: number | null;
  gross_profit: number | null;
  our_share: number | null;
  partner_share: number | null;
  settled_at: string | null;
  notes: string | null;
}

interface Partner {
  id: string;
  code: string;
  name: string;
  profit_split_pct: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partner: Partner | null;
  editing: SettlementRow | null;
  /** Pre-fill the month when creating a new entry. Used by the backfill
   *  banner. Ignored when editing != null. */
  defaultMonth?: Date | null;
}

const mxnFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });
const fmtMXN = (v: number | null | undefined) => v == null ? "—" : mxnFmt.format(v);

export function TamemesLiquidacionDialog({ open, onOpenChange, partner, editing, defaultMonth }: Props) {
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [periodMonth, setPeriodMonth] = useState<Date>(new Date());
  const [reportedRevenue, setReportedRevenue] = useState("");
  const [settledAt, setSettledAt] = useState<Date | null>(null);
  const [notes, setNotes] = useState("");

  // Seed form on open / when editing changes
  useEffect(() => {
    if (editing) {
      setPeriodMonth(new Date(editing.period_month + "T00:00:00"));
      setReportedRevenue(editing.reported_revenue != null ? String(editing.reported_revenue) : "");
      setSettledAt(editing.settled_at ? new Date(editing.settled_at) : null);
      setNotes(editing.notes ?? "");
    } else if (open) {
      // Honor defaultMonth (backfill flow) or fall back to first-of-
      // previous-month (liquidaciones run after the month ends).
      let seed: Date;
      if (defaultMonth) {
        seed = new Date(defaultMonth.getFullYear(), defaultMonth.getMonth(), 1);
      } else {
        const now = new Date();
        seed = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      }
      setPeriodMonth(seed);
      setReportedRevenue("");
      setSettledAt(null);
      setNotes("");
    }
  }, [editing, open, defaultMonth]);

  const periodIso = format(periodMonth, "yyyy-MM-01");

  // ── Auto cost basis: sum of partner_shipments.adm_total_cost for
  //    Tamemes within the selected month. Filters by shipment_date
  //    so we count what we billed them that month. ─────────────────
  const { data: costBasisData } = useQuery({
    queryKey: ["tamemes-cost-basis", partner?.id, periodIso],
    queryFn: async () => {
      if (!partner) return { totalCost: 0, shipmentCount: 0 };
      const start = periodIso;
      // End-of-month is first-of-next-month exclusive
      const end = format(
        new Date(periodMonth.getFullYear(), periodMonth.getMonth() + 1, 1),
        "yyyy-MM-01",
      );
      const { data, error } = await (supabase as any)
        .from("partner_shipments")
        .select("id, adm_total_cost")
        .eq("partner_id", partner.id)
        .gte("shipment_date", start)
        .lt("shipment_date", end);
      if (error) throw error;
      const rows = (data ?? []) as Array<{ id: string; adm_total_cost: number | null }>;
      return {
        totalCost: rows.reduce((s, r) => s + (Number(r.adm_total_cost) || 0), 0),
        shipmentCount: rows.length,
      };
    },
    enabled: !!partner && open,
  });

  // ── Bonificación for the same month (read-only here — managed
  //    on the Bonificaciones tab). ───────────────────────────────
  const { data: bonifRow } = useQuery({
    queryKey: ["tamemes-bonif-for-month", periodIso],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("monthly_bonificaciones")
        .select("id, tamemes_amount, tamemes_settled_at")
        .eq("period_month", periodIso)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; tamemes_amount: number; tamemes_settled_at: string | null } | null;
    },
    enabled: open,
  });

  const costBasis = costBasisData?.totalCost ?? 0;
  const shipmentCount = costBasisData?.shipmentCount ?? 0;
  const revenueNum = parseFloat(reportedRevenue) || 0;
  const grossProfit = revenueNum - costBasis;
  const ourProfitShare = grossProfit * 0.5;
  const partnerProfitShare = grossProfit * 0.5;

  const bonifTamemes = Number(bonifRow?.tamemes_amount ?? 0);
  const ourBonifShare = bonifTamemes * 0.5;
  const partnerBonifShare = bonifTamemes * 0.5;

  const totalToUs = ourProfitShare + ourBonifShare;
  const totalToPartner = partnerProfitShare + partnerBonifShare;

  // ── Save ─────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!partner) return;
    if (revenueNum <= 0) {
      toast.error("Captura los ingresos reportados");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        partner_id: partner.id,
        period_month: periodIso,
        reported_revenue: revenueNum,
        cost_basis: costBasis,
        gross_profit: grossProfit,
        our_share: ourProfitShare,
        partner_share: partnerProfitShare,
        settled_at: settledAt ? settledAt.toISOString() : null,
        notes: notes.trim() || null,
      };
      if (editing) {
        const { error } = await (supabase as any)
          .from("partner_monthly_settlements")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        // UPSERT on (partner_id, period_month) so capturing twice
        // gracefully overwrites instead of erroring.
        const { error } = await (supabase as any)
          .from("partner_monthly_settlements")
          .upsert(payload, { onConflict: "partner_id,period_month" });
        if (error) throw error;
      }
      toast.success(editing ? "Liquidación actualizada" : "Liquidación registrada");
      qc.invalidateQueries({ queryKey: ["partner-settlements"] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Error al guardar: " + (err?.message ?? "desconocido"));
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error("Sin entry");
      const { error } = await (supabase as any)
        .from("partner_monthly_settlements")
        .delete()
        .eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Liquidación eliminada");
      qc.invalidateQueries({ queryKey: ["partner-settlements"] });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast.error("Error al eliminar: " + (err?.message ?? "desconocido"));
    },
  });

  const prevMonth = () => setPeriodMonth(new Date(periodMonth.getFullYear(), periodMonth.getMonth() - 1, 1));
  const nextMonth = () => setPeriodMonth(new Date(periodMonth.getFullYear(), periodMonth.getMonth() + 1, 1));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[96vw] sm:max-w-4xl max-h-[92vh] overflow-y-auto p-0">
          <DialogHeader className="px-4 sm:px-6 pt-6 pb-3 border-b">
            <DialogTitle className="text-xl flex items-center gap-3 flex-wrap">
              <FileSpreadsheet className="h-5 w-5 text-blue-500" />
              <span>{editing ? "Editar liquidación" : "Nueva liquidación"}</span>
              {partner && (
                <Badge variant="outline" className="bg-muted/40 font-mono">
                  {partner.code}
                </Badge>
              )}
              <Badge variant="outline" className="bg-muted/40 capitalize">
                {format(periodMonth, "MMMM yyyy", { locale: esLocale })}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              Cierre mensual con {partner?.name ?? "—"}. El sistema calcula el costo base de los embarques del mes;
              tú capturas lo que Tamemes reporta vendido; nosotros partimos la utilidad 50/50.
            </DialogDescription>
          </DialogHeader>

          <div className="px-4 sm:px-6 py-4 space-y-5">
            {/* Top row: Month + Settled date */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                  Mes
                </Label>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={prevMonth}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    className="h-9 flex-1 justify-center font-semibold capitalize tabular-nums"
                    onClick={() => {
                      const now = new Date();
                      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                      setPeriodMonth(prev);
                    }}
                    title="Mes pasado (típico para liquidaciones)"
                  >
                    {format(periodMonth, "MMMM yyyy", { locale: esLocale })}
                  </Button>
                  <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={nextMonth}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                  Liquidado el
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal h-9">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {settledAt ? format(settledAt, "dd/MM/yy", { locale: esLocale }) : "Pendiente"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={settledAt ?? undefined} onSelect={(d) => setSettledAt(d ?? null)} />
                    {settledAt && (
                      <div className="p-2 border-t">
                        <Button size="sm" variant="ghost" onClick={() => setSettledAt(null)} className="w-full text-xs">
                          Marcar como pendiente
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Embarques del mes — auto */}
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                  <Truck className="h-3.5 w-3.5" /> Embarques del mes (automático)
                </h3>
                <span className="text-[10px] text-muted-foreground">sumado de Pedidos ADM</span>
              </div>
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1">
                  <div className="text-sm font-semibold">{shipmentCount} embarque{shipmentCount === 1 ? "" : "s"}</div>
                  <div className="text-[11px] text-muted-foreground">Costo base que le facturamos a {partner?.name ?? "—"}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold tabular-nums">{fmtMXN(costBasis)}</div>
                </div>
              </div>
            </div>

            {/* Tamemes reported revenue */}
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Ingresos reportados por {partner?.name ?? "Tamemes"}
                </h3>
                <span className="text-[10px] text-muted-foreground">total vendido el mes</span>
              </div>
              <div className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 text-sm text-muted-foreground">
                  Pregúntale a {partner?.name ?? "Tamemes"} cuánto vendieron en total en {format(periodMonth, "MMMM", { locale: esLocale })}.
                </div>
                <CurrencyInput
                  value={reportedRevenue}
                  onChange={setReportedRevenue}
                  placeholder="0"
                  className="w-48"
                  inputClassName="h-10 text-base font-semibold"
                />
              </div>
            </div>

            {/* Live split */}
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-3.5 w-3.5" /> Cálculo del cierre
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Ingresos</div>
                  <div className="text-base font-semibold tabular-nums">{fmtMXN(revenueNum)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Costo base</div>
                  <div className="text-base font-semibold tabular-nums text-muted-foreground">{fmtMXN(costBasis)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Utilidad bruta</div>
                  <div className={cn(
                    "text-base font-bold tabular-nums",
                    grossProfit > 0 ? "text-emerald-600 dark:text-emerald-400"
                    : grossProfit < 0 ? "text-red-500"
                    : "text-muted-foreground",
                  )}>
                    {fmtMXN(grossProfit)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Margen</div>
                  <div className="text-base font-semibold tabular-nums">
                    {revenueNum > 0 ? `${((grossProfit / revenueNum) * 100).toFixed(2)}%` : "—"}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-emerald-500/30">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300 font-semibold">Tu 50% (utilidad)</div>
                  <div className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{fmtMXN(ourProfitShare)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{partner?.name ?? "Tamemes"} 50% (utilidad)</div>
                  <div className="text-lg font-bold tabular-nums">{fmtMXN(partnerProfitShare)}</div>
                </div>
              </div>
            </div>

            {/* Bonificación readout for the month */}
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                  <Gift className="h-3.5 w-3.5 text-purple-500" /> Bonificación de {format(periodMonth, "MMMM", { locale: esLocale })}
                </h3>
                <span className="text-[10px] text-muted-foreground">de pestaña Bonificaciones</span>
              </div>
              {bonifRow && bonifTamemes > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 px-4 py-3 text-sm">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Bonif TAM (ADM)</div>
                    <div className="text-base font-semibold tabular-nums">{fmtMXN(bonifTamemes)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300 font-semibold">Tu 50%</div>
                    <div className="text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{fmtMXN(ourBonifShare)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{partner?.name ?? "Tamemes"} 50%</div>
                    <div className="text-base font-semibold tabular-nums">{fmtMXN(partnerBonifShare)}</div>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-4 text-center text-sm text-muted-foreground">
                  Aún no hay bonificación capturada para este mes. Captura primero en{" "}
                  <span className="font-semibold text-foreground">Bonificaciones</span> para verla aquí.
                </div>
              )}
            </div>

            {/* Grand total */}
            <div className="rounded-xl border-2 border-blue-500/40 bg-blue-500/5 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Total del cierre (utilidad + bonificación)
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300 font-semibold">A ti</div>
                  <div className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{fmtMXN(totalToUs)}</div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    {fmtMXN(ourProfitShare)} utilidad + {fmtMXN(ourBonifShare)} bonif
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">A {partner?.name ?? "Tamemes"}</div>
                  <div className="text-2xl font-bold tabular-nums">{fmtMXN(totalToPartner)}</div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    {fmtMXN(partnerProfitShare)} utilidad + {fmtMXN(partnerBonifShare)} bonif
                  </div>
                </div>
              </div>
            </div>

            {/* Notas */}
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Notas</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas opcionales…" />
            </div>
          </div>

          <div className="px-4 sm:px-6 py-3 border-t bg-muted/20 flex items-center gap-2 justify-end">
            {editing && (
              <Button
                variant="outline"
                onClick={() => setConfirmDelete(true)}
                disabled={saving}
                className="gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 border-red-500/30 mr-auto"
              >
                <Trash2 className="h-4 w-4" />
                Eliminar
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || revenueNum <= 0} className="gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white">
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</>
              ) : (
                <><Save className="h-4 w-4" /> {editing ? "Guardar cambios" : "Registrar liquidación"}</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              ¿Eliminar esta liquidación?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se borrará el cierre de <span className="font-semibold capitalize">{format(periodMonth, "MMMM yyyy", { locale: esLocale })}</span>{" "}
              de {partner?.name ?? "—"} ({fmtMXN(revenueNum)} reportado). Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteEntry.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteEntry.mutate()}
              disabled={deleteEntry.isPending}
              className="bg-red-500 hover:bg-red-600 text-white gap-1.5"
            >
              {deleteEntry.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Eliminando…</>
              ) : (
                <><Trash2 className="h-4 w-4" /> Sí, eliminar</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
