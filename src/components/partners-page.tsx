/**
 * Partners (`/partners`)
 *
 * Top-level page for the two ADM partner business lines:
 *   • Tamemes — Iztapalapa, sells at cost, settles monthly (50/50 split
 *     on profit + bonificación).
 *   • Guadalajara — pre-pays per shipment with markup baked in; the
 *     markup is 100% ours, bonificación split 50/50 at month-end.
 *
 * ADM ships directly to each partner — we never touch the product. So
 * everything on this page is read/written against the partner_*
 * tables and has ZERO effect on inventory, orders, almacén, dashboard.
 *
 * Layout (matches the rest of the app):
 *   • AnimatedGridPattern background
 *   • Centered max-width column with relative z-10
 *   • Page title at top-left, "Nuevo Pedido ADM" button top-right
 *   • Pill switcher under header to flip between partners
 *   • Shipments table per partner (similar shape to Entradas list)
 */

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GlowCard } from "@/components/ui/spotlight-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Download, Truck, MapPin, TrendingUp, CalendarClock, CheckCircle2, Clock, Package, Receipt, Pencil, Gift, FileSpreadsheet, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import { parseLocalDate, getFirstOfMonth } from "@/lib/date-utils";
import { PartnerShipmentImport } from "@/components/partners/PartnerShipmentImport";
import { PartnerShipmentDetailSheet } from "@/components/partners/PartnerShipmentDetailSheet";
import { MonthlyBonificacionesTab } from "@/components/partners/MonthlyBonificacionesTab";
import { MonthlyBonificacionDialog, type BonificacionRow } from "@/components/partners/MonthlyBonificacionDialog";
import { TamemesLiquidacionDialog, type SettlementRow } from "@/components/partners/TamemesLiquidacionDialog";
import { TamemesLiquidacionesTab } from "@/components/partners/TamemesLiquidacionesTab";
import { PartnersAnalisisTab } from "@/components/partners/PartnersAnalisisTab";
import { ChronoBar } from "@/components/ChronoBar";

interface Partner {
  id: string;
  code: string;
  name: string;
  city: string | null;
  settlement_model: "monthly_split" | "per_shipment_markup";
  profit_split_pct: number;
  bonificacion_split_pct: number;
  active: boolean;
  notes: string | null;
}

interface ShipmentSummary {
  id: string;
  shipment_code: string;
  shipment_date: string;
  adm_proof_path: string | null;
  adm_total_cost: number | null;
  charged_to_partner: number | null;
  partner_paid_at: string | null;
  notes: string | null;
  payment_proof_path: string | null;
  payment_reference: string | null;
  payment_bank: string | null;
  items_count: number;
  total_piezas: number;
}

const mxnFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const mxnFmtPrecise = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
const fmtMXN = (v: number | null | undefined) => v == null ? "—" : mxnFmt.format(v);
const fmtMXNPrecise = (v: number | null | undefined) => v == null ? "—" : mxnFmtPrecise.format(v);
const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try { return format(parseLocalDate(d), "dd/MM/yy", { locale: esLocale }); } catch { return d; }
};

export default function Partners() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  /** Shipment row → detail dialog. Either null (closed) or the ID of
   *  the row the user clicked. */
  const [detailShipmentId, setDetailShipmentId] = useState<string | null>(null);
  /** True when the dialog was opened via the pencil icon (jumps
   *  straight into edit mode). */
  const [detailEditMode, setDetailEditMode] = useState(false);
  /** Top-level section tab — Pedidos / Bonificaciones / Liquidaciones / Análisis. */
  const [activeTab, setActiveTab] = useState<"pedidos" | "bonificaciones" | "liquidaciones" | "analisis">("pedidos");

  // Bonificación dialog state — lifted from MonthlyBonificacionesTab
  // so the "Nueva bonificación" button can live in the page header
  // (same place as "Nuevo Pedido ADM"). The tab pushes the row to
  // edit up via onEditRow.
  const [bonifDialogOpen, setBonifDialogOpen] = useState(false);
  const [editingBonif, setEditingBonif] = useState<BonificacionRow | null>(null);
  /** Used by the backfill banner — when the user clicks a missing
   *  month chip we open the dialog pre-seeded to that month. */
  const [bonifDefaultMonth, setBonifDefaultMonth] = useState<Date | null>(null);

  // Liquidación dialog state (same pattern). Only Tamemes runs monthly
  // settlements; GDL pays per-shipment so this tab is Tamemes-scoped.
  const [liquDialogOpen, setLiquDialogOpen] = useState(false);
  const [editingLiqu, setEditingLiqu] = useState<SettlementRow | null>(null);
  const [liquDefaultMonth, setLiquDefaultMonth] = useState<Date | null>(null);

  // Page-level date filter — uses the SAME ChronoBar component the
  // Dashboard uses so it looks identical. Default is the current
  // month (matches Dashboard / Sales / Orders / etc — "Este mes" is
  // the platform-wide default, not "Todo el tiempo").
  const [dateFrom, setDateFrom] = useState(getFirstOfMonth());
  const [dateTo, setDateTo] = useState("");

  const { data: partners = [], isLoading: partnersLoading } = useQuery({
    queryKey: ["partners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partners")
        .select("id, code, name, city, settlement_model, profit_split_pct, bonificacion_split_pct, active, notes")
        .eq("active", true)
        .order("code");
      if (error) throw error;
      return (data ?? []) as Partner[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const [activePartnerCode, setActivePartnerCode] = useState<string>("TAM");
  const activePartner = partners.find(p => p.code === activePartnerCode) ?? partners[0] ?? null;

  // Fetch shipments for the currently-active partner. Each row joins
  // a SUM of its items to give the line count + total piezas without
  // a second round-trip per row.
  const { data: shipments = [], isLoading: shipmentsLoading } = useQuery({
    queryKey: ["partner-shipments", activePartner?.id],
    queryFn: async () => {
      if (!activePartner) return [] as ShipmentSummary[];
      const { data, error } = await (supabase as any)
        .from("partner_shipments")
        .select(`
          id, shipment_code, shipment_date, adm_proof_path,
          adm_total_cost, charged_to_partner, partner_paid_at, notes,
          payment_proof_path, payment_reference, payment_bank,
          items:partner_shipment_items(quantity)
        `)
        .eq("partner_id", activePartner.id)
        .order("shipment_date", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        id: row.id,
        shipment_code: row.shipment_code,
        shipment_date: row.shipment_date,
        adm_proof_path: row.adm_proof_path,
        adm_total_cost: row.adm_total_cost,
        charged_to_partner: row.charged_to_partner,
        partner_paid_at: row.partner_paid_at,
        notes: row.notes,
        payment_proof_path: row.payment_proof_path,
        payment_reference: row.payment_reference,
        payment_bank: row.payment_bank,
        items_count: (row.items ?? []).length,
        total_piezas: (row.items ?? []).reduce((s: number, i: any) => s + (i.quantity ?? 0), 0),
      })) as ShipmentSummary[];
    },
    enabled: !!activePartner,
    staleTime: 30 * 1000,
  });

  // KPIs from the visible shipments.
  const kpis = useMemo(() => {
    const totalImportadoADM = shipments.reduce((s, x) => s + (x.adm_total_cost ?? 0), 0);
    const totalCobrado = shipments.reduce((s, x) => s + (x.charged_to_partner ?? 0), 0);
    const totalMarkup = totalCobrado - totalImportadoADM;
    const totalPiezas = shipments.reduce((s, x) => s + (x.total_piezas ?? 0), 0);
    const pendingPayment = shipments.filter(s => !s.partner_paid_at).length;
    return { totalImportadoADM, totalCobrado, totalMarkup, totalPiezas, pendingPayment, totalShipments: shipments.length };
  }, [shipments]);

  return (
    <div className="relative min-h-screen bg-background">
      <AnimatedGridPattern className="inset-x-0 inset-y-[-40%] h-[220%] [mask-image:radial-gradient(900px_circle_at_center,white,transparent_85%)]" />

      <div className="relative z-10 p-4 md:p-8 space-y-6 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Partners</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Tamemes + Guadalajara · ADM envía directo, nosotros somos intermediarios
            </p>
          </div>
          {activeTab === "pedidos" && (
            <Button
              onClick={() => setDialogOpen(true)}
              disabled={!activePartner}
              className="gap-2"
            >
              <Plus className="h-4 w-4" /> Nuevo Pedido ADM
            </Button>
          )}
          {activeTab === "bonificaciones" && (
            <Button
              onClick={() => { setEditingBonif(null); setBonifDialogOpen(true); }}
              className="gap-2"
            >
              <Plus className="h-4 w-4" /> Nueva bonificación
            </Button>
          )}
          {activeTab === "liquidaciones" && (
            <Button
              onClick={() => { setEditingLiqu(null); setLiquDialogOpen(true); }}
              className="gap-2"
            >
              <Plus className="h-4 w-4" /> Nueva liquidación
            </Button>
          )}
        </div>

        {/* Page-level chrono bar — same component the Dashboard uses
            ([Todo] [‹] [Month] [›] [Desde date] [Hasta date]). Applies
            to both Pedidos and Bonificaciones tabs. */}
        <ChronoBar
          dateFrom={dateFrom}
          dateTo={dateTo}
          onChange={(from, to) => { setDateFrom(from); setDateTo(to); }}
        />

        {/* Section tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full">
          <TabsList className="grid w-full grid-cols-4 max-w-3xl">
            <TabsTrigger value="pedidos" className="gap-2">
              <Truck className="h-3.5 w-3.5" /> Pedidos ADM
            </TabsTrigger>
            <TabsTrigger value="bonificaciones" className="gap-2">
              <Gift className="h-3.5 w-3.5" /> Bonificaciones
            </TabsTrigger>
            <TabsTrigger value="liquidaciones" className="gap-2">
              <FileSpreadsheet className="h-3.5 w-3.5" /> Liquidaciones
            </TabsTrigger>
            <TabsTrigger value="analisis" className="gap-2">
              <BarChart3 className="h-3.5 w-3.5" /> Análisis
            </TabsTrigger>
          </TabsList>

          {/* ════════════════════════════════════════════════════════ */}
          {/* PEDIDOS ADM tab                                          */}
          {/* ════════════════════════════════════════════════════════ */}
          <TabsContent value="pedidos" className="space-y-6 mt-6">

        {/* Partner switcher */}
        <div className="flex gap-2 flex-wrap">
          {partnersLoading && (
            <>
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-10 w-40" />
            </>
          )}
          {partners.map(p => {
            const isActive = p.code === activePartnerCode;
            return (
              <button
                key={p.id}
                onClick={() => setActivePartnerCode(p.code)}
                className={cn(
                  "shrink-0 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors text-left flex items-center gap-3",
                  isActive
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-foreground border-border hover:border-primary/50 hover:bg-muted/40",
                )}
              >
                <div className={cn(
                  "h-8 w-8 rounded-md flex items-center justify-center font-mono text-xs",
                  isActive ? "bg-primary-foreground/20" : "bg-muted",
                )}>
                  {p.code}
                </div>
                <div className="leading-tight">
                  <div className="text-sm">{p.name}</div>
                  <div className={cn("text-[10px] font-normal", isActive ? "opacity-80" : "text-muted-foreground")}>
                    {p.city ?? "—"} · {p.settlement_model === "monthly_split" ? "Liquida mensual" : "Pre-paga con markup"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* KPI tiles for active partner */}
        {activePartner && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <GlowCard>
              <div className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Truck className="h-3.5 w-3.5" /> Embarques
                </div>
                <div className="text-2xl font-bold tabular-nums">{kpis.totalShipments}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">{kpis.totalPiezas.toLocaleString("es-MX")} piezas</div>
              </div>
            </GlowCard>
            <GlowCard>
              <div className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Package className="h-3.5 w-3.5" /> Costo ADM
                </div>
                <div className="text-2xl font-bold tabular-nums text-foreground">{fmtMXN(kpis.totalImportadoADM)}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Lo que pagamos a ADM</div>
              </div>
            </GlowCard>
            <GlowCard>
              <div className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <TrendingUp className="h-3.5 w-3.5" /> Cobrado al partner
                </div>
                <div className="text-2xl font-bold tabular-nums text-foreground">{fmtMXN(kpis.totalCobrado)}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Lo que el partner nos paga</div>
              </div>
            </GlowCard>
            <GlowCard>
              <div className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <TrendingUp className="h-3.5 w-3.5" /> Markup acumulado
                </div>
                <div className={cn(
                  "text-2xl font-bold tabular-nums",
                  kpis.totalMarkup > 0 ? "text-emerald-500" : kpis.totalMarkup < 0 ? "text-red-500" : "text-foreground",
                )}>
                  {fmtMXN(kpis.totalMarkup)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {activePartner.settlement_model === "per_shipment_markup"
                    ? "Utilidad inmediata (sin split)"
                    : "Cobros sobre costo (poco común en Tamemes)"}
                </div>
              </div>
            </GlowCard>
            <GlowCard>
              <div className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Clock className="h-3.5 w-3.5" /> Pagos pendientes
                </div>
                <div className={cn(
                  "text-2xl font-bold tabular-nums",
                  kpis.pendingPayment > 0 ? "text-amber-500" : "text-emerald-500",
                )}>
                  {kpis.pendingPayment}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Embarques sin pago confirmado</div>
              </div>
            </GlowCard>
          </div>
        )}

        {/* Shipments table */}
        <GlowCard>
          <div className="p-4 md:p-6 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-base font-semibold text-foreground">Pedidos ADM</h2>
                <p className="text-xs text-muted-foreground">
                  Cada fila = un embarque ADM al partner. Click en el código para ver detalle. Click en el ícono de descarga para abrir la imagen original.
                </p>
              </div>
            </div>

            {shipmentsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : shipments.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <Truck className="h-10 w-10 mx-auto opacity-30 mb-2" />
                <p className="text-sm text-muted-foreground">
                  Aún no hay Pedidos ADM para <span className="font-semibold text-foreground">{activePartner?.name}</span>.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Click en "Nuevo Pedido ADM" arriba para registrar el primero.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-semibold text-xs">Código</TableHead>
                      <TableHead className="font-semibold text-xs">Fecha</TableHead>
                      <TableHead className="font-semibold text-xs text-right">Líneas</TableHead>
                      <TableHead className="font-semibold text-xs text-right">Piezas</TableHead>
                      <TableHead className="font-semibold text-xs text-right">Costo ADM</TableHead>
                      <TableHead className="font-semibold text-xs text-right">Cobrado</TableHead>
                      <TableHead className="font-semibold text-xs text-right">Markup</TableHead>
                      <TableHead className="font-semibold text-xs">Pago</TableHead>
                      <TableHead className="font-semibold text-xs text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shipments.map(s => {
                      const markup = (s.charged_to_partner ?? 0) - (s.adm_total_cost ?? 0);
                      const paid = !!s.partner_paid_at;
                      return (
                        <TableRow
                          key={s.id}
                          className="cursor-pointer hover:bg-muted/30"
                          onClick={() => { setDetailEditMode(false); setDetailShipmentId(s.id); }}
                        >
                          <TableCell className="font-mono text-blue-400 font-medium hover:underline">{s.shipment_code}</TableCell>
                          <TableCell className="text-muted-foreground tabular-nums">{fmtDate(s.shipment_date)}</TableCell>
                          <TableCell className="text-right tabular-nums">{s.items_count}</TableCell>
                          <TableCell className="text-right tabular-nums">{s.total_piezas.toLocaleString("es-MX")}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMXNPrecise(s.adm_total_cost)}</TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">{fmtMXNPrecise(s.charged_to_partner)}</TableCell>
                          <TableCell className={cn(
                            "text-right tabular-nums font-semibold",
                            markup > 0 ? "text-emerald-500" : markup < 0 ? "text-red-500" : "text-muted-foreground",
                          )}>
                            {fmtMXNPrecise(markup)}
                          </TableCell>
                          <TableCell>
                            {paid ? (
                              <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                {fmtDate(s.partner_paid_at)}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40 gap-1">
                                <Clock className="h-3 w-3" />
                                Pendiente
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end gap-1">
                              {s.adm_proof_path && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    const { data } = supabase.storage
                                      .from("stock-delivery-documents")
                                      .getPublicUrl(s.adm_proof_path!);
                                    window.open(data.publicUrl, "_blank", "noopener,noreferrer");
                                  }}
                                  className="h-8 w-8 text-blue-400 hover:text-blue-300"
                                  title="Descargar imagen ADM"
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                              )}
                              {s.payment_proof_path && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    const { data } = supabase.storage
                                      .from("stock-delivery-documents")
                                      .getPublicUrl(s.payment_proof_path!);
                                    window.open(data.publicUrl, "_blank", "noopener,noreferrer");
                                  }}
                                  className="h-8 w-8 text-emerald-400 hover:text-emerald-300"
                                  title={`Descargar comprobante de pago${s.payment_bank ? " · " + s.payment_bank : ""}${s.payment_reference ? " · Ref: " + s.payment_reference : ""}`}
                                >
                                  <Receipt className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => { setDetailEditMode(true); setDetailShipmentId(s.id); }}
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

        {/* Footer note */}
        {activePartner && (
          <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground flex items-start gap-2">
            <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold text-foreground">Recordatorio:</span> los Pedidos ADM de {activePartner.name} <span className="font-semibold">no</span> afectan tu inventario ni tu dashboard principal. ADM envía directo al partner. La bonificación y (si aplica) la liquidación mensual se manejan en otras secciones.
            </div>
          </div>
        )}
          </TabsContent>

          {/* ════════════════════════════════════════════════════════ */}
          {/* BONIFICACIONES tab                                       */}
          {/* ════════════════════════════════════════════════════════ */}
          <TabsContent value="bonificaciones" className="mt-6">
            <MonthlyBonificacionesTab
              dateFrom={dateFrom}
              dateTo={dateTo}
              onEditRow={(row) => { setEditingBonif(row); setBonifDialogOpen(true); }}
              onPickMonth={(date) => { setEditingBonif(null); setBonifDefaultMonth(date); setBonifDialogOpen(true); }}
            />
          </TabsContent>

          {/* ════════════════════════════════════════════════════════ */}
          {/* LIQUIDACIONES tab                                        */}
          {/* ════════════════════════════════════════════════════════ */}
          <TabsContent value="liquidaciones" className="mt-6">
            <TamemesLiquidacionesTab
              partner={partners.find(p => p.code === "TAM") ?? null}
              dateFrom={dateFrom}
              dateTo={dateTo}
              onEditRow={(row) => { setEditingLiqu(row); setLiquDialogOpen(true); }}
              onPickMonth={(date) => { setEditingLiqu(null); setLiquDefaultMonth(date); setLiquDialogOpen(true); }}
            />
          </TabsContent>

          {/* ════════════════════════════════════════════════════════ */}
          {/* ANÁLISIS tab — cross-channel SKU rollup                  */}
          {/* ════════════════════════════════════════════════════════ */}
          <TabsContent value="analisis" className="mt-6">
            <PartnersAnalisisTab dateFrom={dateFrom} dateTo={dateTo} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Nuevo Pedido ADM dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            qc.invalidateQueries({ queryKey: ["partner-shipments", activePartner?.id] });
          }
        }}
      >
        <DialogContent className="max-w-[96vw] sm:max-w-6xl max-h-[92vh] overflow-y-auto p-0">
          <DialogHeader className="px-4 sm:px-6 pt-6 pb-0">
            <DialogTitle className="text-xl flex items-center gap-3">
              <CalendarClock className="h-5 w-5" />
              Nuevo Pedido ADM
              {activePartner && (
                <span className="font-mono text-blue-400 text-base">{activePartner.code}</span>
              )}
            </DialogTitle>
            <DialogDescription>
              Arrastra la confirmación ADM, revisa los productos y registra cuánto cobraste a {activePartner?.name ?? "—"}.
            </DialogDescription>
          </DialogHeader>
          <div className="px-4 sm:px-6 py-4 sm:py-6">
            {activePartner && (
              <PartnerShipmentImport
                partner={activePartner}
                onSaved={() => {
                  setDialogOpen(false);
                  qc.invalidateQueries({ queryKey: ["partner-shipments", activePartner.id] });
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail dialog — click on a shipment_code OR the pencil icon.
          The pencil jumps directly into edit mode via initialEdit so
          there's no two-click "click pencil then click Editar" flow. */}
      <PartnerShipmentDetailSheet
        shipmentId={detailShipmentId}
        partner={activePartner}
        open={!!detailShipmentId}
        initialEdit={detailEditMode}
        onOpenChange={(open) => {
          if (!open) {
            setDetailShipmentId(null);
            setDetailEditMode(false);
          }
        }}
      />

      {/* Bonificación add/edit dialog — lifted from MonthlyBonificacionesTab
          so the "Nueva bonificación" button can live in the page header. */}
      <MonthlyBonificacionDialog
        open={bonifDialogOpen}
        editing={editingBonif}
        defaultMonth={bonifDefaultMonth}
        onOpenChange={(open) => {
          setBonifDialogOpen(open);
          if (!open) { setEditingBonif(null); setBonifDefaultMonth(null); }
        }}
      />

      {/* Liquidación Tamemes dialog — same lifting pattern. */}
      <TamemesLiquidacionDialog
        open={liquDialogOpen}
        partner={partners.find(p => p.code === "TAM") ?? null}
        editing={editingLiqu}
        defaultMonth={liquDefaultMonth}
        onOpenChange={(open) => {
          setLiquDialogOpen(open);
          if (!open) { setEditingLiqu(null); setLiquDefaultMonth(null); }
        }}
      />
    </div>
  );
}
