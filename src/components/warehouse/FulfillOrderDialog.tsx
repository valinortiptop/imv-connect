/**
 * FulfillOrderDialog
 *
 * Surtir + Despachar workflow for one order. Opens from the
 * OrdersToFulfillPanel on /almacen. Per the user brief:
 *   - App SUGGESTS source slots (FIFO by caducidad, then small piles
 *     first via suggest_source_slots_for_picking RPC), but the worker
 *     picks manually.
 *   - Partial picks are allowed; remaining bultos surface as "Faltante."
 *   - Once at least some bultos sit in embarque, the worker can hit
 *     Despachar (delivery) or Entregar (pickup) to mark the bultos as
 *     "left the warehouse" — that writes the Kardex 'pedido' rows,
 *     deletes the embarque slot_contents, and flips order status.
 *
 * Brand:
 *   - sm:max-w-6xl horizontal dialog. No side panels.
 *   - Brand stat tiles (icon chip left, tabular value right) for the
 *     order KPI strip.
 *   - Per-line cards stack vertically inside the scroll area; each card
 *     has its own 2-col inner layout (product info | source picker).
 *   - All confirms via AlertDialog (no window.confirm).
 *   - Destructive Despachar button is emerald (positive operation), the
 *     pickup variant is purple to mark the workflow difference.
 */

import { useEffect, useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductThumb } from "@/components/ui/product-thumb";
import {
  Package,
  Truck,
  Hand,
  Loader2,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  CalendarClock,
  Layers,
  MapPin,
  Boxes,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DeliveryWindowChip } from "@/components/clients/DeliveryWindowChip";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface LineState {
  order_item_id: string;
  product_id: string;
  product_clave: string;
  product_name: string;
  product_image_url: string | null;
  qty_needed: number;
  qty_in_embarque: number;
  qty_remaining: number;
  embarque_slots: Array<{
    slot_code: string;
    quantity: number;
    lote: string | null;
    content_id: string;
  }>;
}

interface SourceSuggestion {
  slot_content_id: string;
  slot_id: string;
  slot_code: string;
  quantity: number;
  lote: string | null;
  expiration_date: string | null;
  rank: number;
  reason_text: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  order: {
    id: string;
    order_code: string;
    client_name: string | null;
    delivery_date: string | null;
    status: string;
    fulfillment_method: string | null;
    urgency: boolean;
    delivery_window_from?: string | null;
    delivery_window_until?: string | null;
    delivery_notes?: string | null;
  } | null;
}

function fmtFullDate(d: string | null): string {
  if (!d) return "Sin fecha";
  try {
    return format(new Date(d + "T00:00:00"), "dd 'de' MMMM yyyy", { locale: es })
      .replace(/ ([a-záéíóúñ])/g, (_, c: string) => " " + c.toUpperCase());
  } catch {
    return d;
  }
}

export function FulfillOrderDialog({ open, onOpenChange, order }: Props) {
  const qc = useQueryClient();
  const [pendingDispatch, setPendingDispatch] = useState(false);
  const [running, setRunning] = useState(false);

  const orderId = order?.id ?? null;
  const isPickup = order?.fulfillment_method === "pickup";

  const { data: state = [], isLoading, refetch } = useQuery({
    queryKey: ["order-fulfillment-state", orderId],
    enabled: open && !!orderId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "get_order_fulfillment_state",
        { p_order_id: orderId },
      );
      if (error) throw error;
      return (data ?? []) as LineState[];
    },
    staleTime: 5 * 1000,
  });

  const totals = useMemo(() => {
    const needed    = state.reduce((s, l) => s + l.qty_needed, 0);
    const picked    = state.reduce((s, l) => s + l.qty_in_embarque, 0);
    const remaining = state.reduce((s, l) => s + l.qty_remaining, 0);
    return { needed, picked, remaining };
  }, [state]);

  const fullyPicked  = totals.remaining === 0 && totals.needed > 0;
  const anyPicked    = totals.picked > 0;

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["order-fulfillment-state", orderId] });
    qc.invalidateQueries({ queryKey: ["orders-to-fulfill"] });
    qc.invalidateQueries({ queryKey: ["warehouse-contents"] });
    qc.invalidateQueries({ queryKey: ["warehouse-slots"] });
    qc.invalidateQueries({ queryKey: ["warehouse-latest-movement-by-slot"] });
    refetch();
  };

  const runDispatch = async () => {
    if (!orderId) return;
    setRunning(true);
    try {
      const rpc = isPickup ? "mark_pickup_delivered" : "dispatch_order";
      const { data, error } = await (supabase as any).rpc(rpc, { p_order_id: orderId });
      if (error) throw error;
      const s = data as any;
      toast.success(
        isPickup
          ? `Orden entregada · ${s?.shipped_bultos ?? totals.picked} bultos`
          : `Orden despachada · ${s?.shipped_bultos ?? totals.picked} bultos · estado: ${s?.new_status ?? "En ruta"}`,
      );
      invalidateAll();
      setPendingDispatch(false);
      onOpenChange(false);
    } catch (err: any) {
      toast.error((isPickup ? "Error al entregar: " : "Error al despachar: ") + (err.message ?? "desconocido"));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl w-[96vw] max-h-[92vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="text-xl flex items-center gap-3 flex-wrap">
            <ClipboardIcon />
            <span>Surtir orden</span>
            {order && (
              <>
                <span className="font-mono font-bold text-foreground">{order.order_code}</span>
                <Badge variant="outline" className="text-[10px]">
                  {order.status}
                </Badge>
                {isPickup ? (
                  <Badge variant="outline" className="text-[10px] bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/40 gap-1">
                    <Hand className="h-3 w-3" /> Pickup
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/40 gap-1">
                    <Truck className="h-3 w-3" /> Reparto
                  </Badge>
                )}
                {order.urgency && (
                  <Badge variant="outline" className="text-[10px] bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40">
                    Urgente
                  </Badge>
                )}
                <DeliveryWindowChip
                  from={order.delivery_window_from}
                  until={order.delivery_window_until}
                  notes={order.delivery_notes}
                  isPickup={isPickup}
                  size="md"
                />
              </>
            )}
          </DialogTitle>
          <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
            <span>{order?.client_name ?? "—"}</span>
            <span className="opacity-50">·</span>
            <span className="flex items-center gap-1">
              <CalendarClock className="h-3 w-3" />
              {fmtFullDate(order?.delivery_date ?? null)}
            </span>
            {order?.delivery_notes && (
              <>
                <span className="opacity-50">·</span>
                <span className="italic">📝 {order.delivery_notes}</span>
              </>
            )}
          </div>
        </DialogHeader>

        {/* KPI strip — fixed-height + tabular so it never shifts as
            picks update. */}
        <div className="px-6 py-3 border-b grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
          <Kpi icon={<Boxes className="h-4 w-4" />}   label="Bultos pedidos" value={totals.needed}    accent="blue" />
          <Kpi icon={<Layers className="h-4 w-4" />}  label="En embarque"    value={totals.picked}    accent="emerald" />
          <Kpi icon={<AlertTriangle className="h-4 w-4" />} label="Faltante"  value={totals.remaining} accent={totals.remaining > 0 ? "red" : "muted"} />
          <Kpi icon={<MapPin className="h-4 w-4" />}  label="Líneas"         value={state.length}     accent="purple" />
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full rounded-xl" />
            ))
          ) : state.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground italic">
              Esta orden no tiene líneas.
            </div>
          ) : (
            state.map((line) => (
              <LineCard
                key={line.order_item_id}
                line={line}
                onPicked={() => invalidateAll()}
                disabled={running || order?.status === "Entregado" || order?.status === "En ruta"}
              />
            ))
          )}
        </div>

        <DialogFooter className="px-6 py-3 border-t shrink-0 gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            Cerrar
          </Button>
          {totals.remaining > 0 && anyPicked && (
            <div className="text-xs text-amber-600 dark:text-amber-400 mr-auto self-center flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Faltan {totals.remaining.toLocaleString("es-MX")} bultos — puedes despachar parcial o seguir surtiendo
            </div>
          )}
          {totals.remaining === 0 && fullyPicked && (
            <div className="text-xs text-emerald-600 dark:text-emerald-400 mr-auto self-center flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Orden completa — lista para {isPickup ? "entregar" : "despachar"}
            </div>
          )}
          <Button
            onClick={() => setPendingDispatch(true)}
            disabled={running || !anyPicked}
            className={cn(
              "min-w-[200px] gap-1.5",
              isPickup
                ? "bg-purple-500 hover:bg-purple-600 text-white"
                : "bg-emerald-500 hover:bg-emerald-600 text-white",
            )}
          >
            {isPickup ? <Hand className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
            {isPickup ? "Entregar al cliente" : "Despachar (En ruta)"}
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog
        open={pendingDispatch}
        onOpenChange={(o) => { if (!o && !running) setPendingDispatch(false); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {isPickup
                ? <><Hand className="h-5 w-5 text-purple-500" /> Confirmar entrega</>
                : <><Truck className="h-5 w-5 text-emerald-500" /> Confirmar despacho</>}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-bold tabular-nums">{totals.picked.toLocaleString("es-MX")}</span> bultos saldrán del almacén ahora mismo
                  para la orden{" "}
                  <span className="font-mono font-semibold">{order?.order_code}</span>.
                </div>
                {totals.remaining > 0 && (
                  <div className="text-amber-600 dark:text-amber-400 font-medium">
                    Despacho parcial — faltan {totals.remaining.toLocaleString("es-MX")} bultos. Quedará marcado como "faltante" en el Kardex.
                  </div>
                )}
                <div className="text-muted-foreground">
                  Estado nuevo: <span className="font-semibold text-foreground">{isPickup ? "Entregado" : "En ruta"}</span>.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={running}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={runDispatch}
              disabled={running}
              className={cn(
                "gap-1.5",
                isPickup
                  ? "bg-purple-500 hover:bg-purple-600 text-white"
                  : "bg-emerald-500 hover:bg-emerald-600 text-white",
              )}
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isPickup ? "Sí, entregar" : "Sí, despachar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

// ----- Inline subcomponents ---------------------------------------

function ClipboardIcon() {
  // Lazy inline import to avoid yet-another-lucide-name shuffle
  return <Package className="h-5 w-5 text-blue-500" />;
}

function Kpi({
  icon, label, value, accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: "blue" | "emerald" | "red" | "amber" | "purple" | "muted";
}) {
  const styles = {
    blue:    { bg: "bg-blue-500/15",    text: "text-blue-500",    val: "text-foreground" },
    emerald: { bg: "bg-emerald-500/15", text: "text-emerald-500", val: "text-emerald-700 dark:text-emerald-400" },
    red:     { bg: "bg-red-500/15",     text: "text-red-500",     val: "text-red-700 dark:text-red-400" },
    amber:   { bg: "bg-amber-500/15",   text: "text-amber-500",   val: "text-amber-700 dark:text-amber-400" },
    purple:  { bg: "bg-purple-500/15",  text: "text-purple-500",  val: "text-purple-700 dark:text-purple-400" },
    muted:   { bg: "bg-muted/40",       text: "text-muted-foreground", val: "text-foreground" },
  }[accent];
  return (
    <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-3 min-w-0 h-full">
      <div className={cn("p-2 rounded-lg shrink-0", styles.bg, styles.text)}>{icon}</div>
      <div className="min-w-0">
        <div className={cn("text-xl font-bold tabular-nums leading-tight truncate", styles.val)}>
          {value.toLocaleString("es-MX")}
        </div>
        <div className="text-[11px] text-muted-foreground truncate">{label}</div>
      </div>
    </div>
  );
}

/** One row per order line. Brand 2-col inner layout: product info on
 *  the left, source-pick UI on the right. The line is "complete" when
 *  qty_remaining === 0 — that state gets a green ribbon. */
function LineCard({
  line, onPicked, disabled,
}: {
  line: LineState;
  onPicked: () => void;
  disabled?: boolean;
}) {
  const [pickQty, setPickQty]   = useState<number>(0);
  const [pickSource, setPickSource] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Source-slot suggestions for this product (FIFO by caducidad)
  const { data: sources = [], isLoading: sourcesLoading } = useQuery({
    queryKey: ["pick-sources", line.product_id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("suggest_source_slots_for_picking", {
        p_product_id: line.product_id,
        p_quantity: line.qty_remaining,
      });
      if (error) throw error;
      return (data ?? []) as SourceSuggestion[];
    },
    staleTime: 10 * 1000,
  });

  // Auto-select first suggestion when the line opens with no chosen source
  useEffect(() => {
    if (!pickSource && sources.length > 0) {
      setPickSource(sources[0].slot_content_id);
      // Suggest min(slot_qty, qty_remaining) so the worker can just hit Pick
      const s = sources[0];
      setPickQty(Math.min(s.quantity, line.qty_remaining));
    }
  }, [sources, pickSource, line.qty_remaining]);

  const selectedSource = useMemo(
    () => sources.find((s) => s.slot_content_id === pickSource) ?? null,
    [sources, pickSource],
  );
  const maxPick = selectedSource
    ? Math.min(selectedSource.quantity, line.qty_remaining)
    : line.qty_remaining;
  const canPick = !!selectedSource && pickQty > 0 && pickQty <= maxPick && line.qty_remaining > 0;

  const handlePick = async () => {
    if (!selectedSource || !canPick) return;
    setSubmitting(true);
    try {
      const { error } = await (supabase as any).rpc("pick_order_item_to_embarque", {
        p_order_item_id:     line.order_item_id,
        p_source_content_id: selectedSource.slot_content_id,
        p_quantity:          pickQty,
        p_note:              null,
      });
      if (error) throw error;
      toast.success(`${pickQty} bultos · ${selectedSource.slot_code} → Embarque`);
      setPickSource(null);
      setPickQty(0);
      onPicked();
    } catch (err: any) {
      toast.error("Error al surtir: " + (err.message ?? "desconocido"));
    } finally {
      setSubmitting(false);
    }
  };

  const lineDone = line.qty_remaining === 0;

  return (
    <div className={cn(
      "rounded-xl border bg-card overflow-hidden",
      lineDone && "border-emerald-500/40",
    )}>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1.4fr] gap-0 divide-y md:divide-y-0 md:divide-x">
        {/* Left: product info + per-line KPIs */}
        <div className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <ProductThumb src={line.product_image_url} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="font-mono text-xs text-primary">{line.product_clave}</div>
              <div className="font-semibold text-sm leading-tight line-clamp-2">{line.product_name}</div>
            </div>
            {lineDone && (
              <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 gap-1 shrink-0">
                <CheckCircle2 className="h-3 w-3" />
                Surtido
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <MiniStat label="Pedidos"      value={line.qty_needed}      tone="muted" />
            <MiniStat label="En embarque"  value={line.qty_in_embarque} tone="emerald" />
            <MiniStat label="Faltante"     value={line.qty_remaining}   tone={line.qty_remaining > 0 ? "red" : "muted"} />
          </div>

          {line.embarque_slots.length > 0 && (
            <div className="rounded-md bg-muted/30 p-2 space-y-1">
              <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
                En embarque
              </div>
              <div className="flex flex-wrap gap-1.5">
                {line.embarque_slots.map((s, i) => (
                  <Badge key={i} variant="outline" className="text-[10px] font-mono gap-1">
                    {s.slot_code}
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold tabular-nums">
                      ×{s.quantity}
                    </span>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: source slot picker + pick action */}
        <div className="p-4 space-y-3 min-w-0">
          <div className="flex items-baseline justify-between">
            <div className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">
              Surtir desde almacén
            </div>
            <span className="text-[10px] text-muted-foreground">
              Sugerencia: caducidad más cercana → menor cantidad
            </span>
          </div>

          {lineDone ? (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Línea completa. No falta nada por surtir.
            </div>
          ) : sourcesLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : sources.length === 0 ? (
            <div className="rounded-md border border-red-500/40 bg-red-500/5 p-3 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              No hay este producto en almacenamiento. Reabastece antes de surtir esta orden.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 max-h-[180px] overflow-y-auto pr-1">
                {sources.map((s) => {
                  const isSelected = pickSource === s.slot_content_id;
                  return (
                    <button
                      key={s.slot_content_id}
                      type="button"
                      disabled={disabled || submitting}
                      onClick={() => {
                        setPickSource(s.slot_content_id);
                        setPickQty(Math.min(s.quantity, line.qty_remaining));
                      }}
                      className={cn(
                        "rounded-lg border-2 p-2 text-left transition active:scale-[0.98]",
                        isSelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                          : "border-border bg-card hover:bg-muted/30",
                      )}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono font-bold text-xs">{s.slot_code}</span>
                        <span className="text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                          {s.quantity}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {s.reason_text}
                      </div>
                      {s.lote && (
                        <div className="text-[10px] font-mono text-muted-foreground/80 truncate">
                          Lote {s.lote}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
                  Picar
                </div>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={maxPick}
                  value={pickQty}
                  onChange={(e) => setPickQty(Math.max(0, Math.min(maxPick, Number(e.target.value) || 0)))}
                  className="h-8 w-20 text-sm tabular-nums"
                  disabled={disabled || submitting || !selectedSource}
                />
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  / max {maxPick}
                </span>
                <Button
                  size="sm"
                  onClick={handlePick}
                  disabled={!canPick || disabled || submitting}
                  className="gap-1 ml-auto"
                >
                  {submitting ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Surtiendo...</>
                  ) : (
                    <>
                      <ArrowRight className="h-3.5 w-3.5" />
                      Mover a Embarque
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  label, value, tone,
}: {
  label: string;
  value: number;
  tone: "muted" | "emerald" | "red";
}) {
  const cls = {
    muted:   "text-foreground",
    emerald: "text-emerald-700 dark:text-emerald-400",
    red:     "text-red-700 dark:text-red-400",
  }[tone];
  return (
    <div className="rounded-md bg-muted/30 px-2 py-1.5 text-center">
      <div className={cn("text-base font-bold tabular-nums leading-none", cls)}>
        {value.toLocaleString("es-MX")}
      </div>
      <div className="text-[9px] text-muted-foreground uppercase tracking-wide mt-0.5">
        {label}
      </div>
    </div>
  );
}
