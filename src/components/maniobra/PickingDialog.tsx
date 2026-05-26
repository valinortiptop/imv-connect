/**
 * PickingDialog — decrement warehouse slots for an order being loaded.
 *
 * For each line item in the order:
 *   - Find every slot holding that product
 *   - Sort FIFO (oldest expiration_date first; nulls last)
 *   - Pre-allocate the required quantity across slots in that order
 *   - Worker can override per-slot quantities (e.g. if the oldest
 *     lote is physically blocked, drag from the next one)
 *
 * Submit calls the `pick_from_slot` RPC once per non-zero allocation.
 * Each call atomically decrements the slot and writes a Kardex row
 * with reason='pedido' + order_id. Single transaction per allocation;
 * if one fails, the rest still go through (we report which succeeded).
 *
 * UI rules (per CLAUDE.md):
 *   - Wide dialog (sm:max-w-5xl), sectioned cards
 *   - Zero layout shift: skeleton rows match final dimensions during
 *     the slot-availability fetch
 *   - Header sticky, body scrollable, footer sticky with totals
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductThumb } from "@/components/ui/product-thumb";
import { Loader2, Package, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { parseLocalDate } from "@/lib/date-utils";
import { toast } from "sonner";

interface OrderLineInput {
  product_id: string;
  product_clave: string;
  product_name: string;
  image_url: string | null;
  quantity: number;             // required quantity for this line
}

interface SlotAvailability {
  slot_content_id: string;
  slot_id: string;
  slot_code: string;
  product_id: string;
  lote: string | null;
  quantity: number;
  expiration_date: string | null;
}

interface Props {
  orderId: string;
  orderCode: string;
  clientName: string;
  lines: OrderLineInput[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone?: () => void;
}

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try { return format(parseLocalDate(d), "dd/MM/yy"); } catch { return d; }
};

export function PickingDialog({
  orderId, orderCode, clientName, lines, open, onOpenChange, onDone,
}: Props) {
  const qc = useQueryClient();
  const productIds = useMemo(() => lines.map(l => l.product_id), [lines]);
  const productIdsKey = productIds.join(",");

  // Pull slot_contents for every product in the order, sorted FIFO.
  // Includes the parent slot's code so we can show "202-A-01".
  const { data: availability = [], isLoading } = useQuery({
    queryKey: ["picking-availability", productIdsKey],
    queryFn: async () => {
      if (productIds.length === 0) return [] as SlotAvailability[];
      const { data, error } = await (supabase as any)
        .from("slot_contents")
        .select("id, slot_id, product_id, lote, quantity, expiration_date, warehouse_slots(code)")
        .in("product_id", productIds)
        .gt("quantity", 0)
        .order("expiration_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []).map((r: any): SlotAvailability => ({
        slot_content_id: r.id,
        slot_id: r.slot_id,
        slot_code: r.warehouse_slots?.code ?? "—",
        product_id: r.product_id,
        lote: r.lote,
        quantity: r.quantity,
        expiration_date: r.expiration_date,
      }));
    },
    enabled: open && productIds.length > 0,
    staleTime: 30 * 1000,
  });

  // Allocations: per (slot_content_id) → how many bultos we'll pick.
  // Auto-FIFO on first load; user can edit.
  const [alloc, setAlloc] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

  // Auto-allocate FIFO whenever the slot availability finishes loading
  useEffect(() => {
    if (!open || isLoading) return;
    const next: Record<string, number> = {};
    for (const line of lines) {
      let remaining = line.quantity;
      // Slots for this product, already sorted FIFO from the query
      const lineSlots = availability.filter(a => a.product_id === line.product_id);
      for (const s of lineSlots) {
        if (remaining <= 0) break;
        const take = Math.min(s.quantity, remaining);
        next[s.slot_content_id] = take;
        remaining -= take;
      }
    }
    setAlloc(next);
  }, [open, isLoading, availability, lines]);

  // Derived: per-line totals + per-line shortage
  const lineSummaries = useMemo(() => {
    return lines.map(line => {
      const lineSlots = availability.filter(a => a.product_id === line.product_id);
      const allocated = lineSlots.reduce((sum, s) => sum + (alloc[s.slot_content_id] ?? 0), 0);
      const totalAvailable = lineSlots.reduce((sum, s) => sum + s.quantity, 0);
      return {
        line,
        slots: lineSlots,
        allocated,
        totalAvailable,
        shortage: Math.max(0, line.quantity - allocated),
        overpicked: Math.max(0, allocated - line.quantity),
      };
    });
  }, [lines, availability, alloc]);

  const totalRequired = lines.reduce((s, l) => s + l.quantity, 0);
  const totalAllocated = Object.values(alloc).reduce((s, v) => s + (v || 0), 0);
  const anyShortage = lineSummaries.some(l => l.shortage > 0);
  const anyOverpick = lineSummaries.some(l => l.overpicked > 0);
  const canSubmit = !submitting && totalAllocated > 0 && !anyOverpick;

  const updateAlloc = (slot_content_id: string, value: string, max: number) => {
    const n = Math.max(0, Math.min(max, Math.floor(Number(value) || 0)));
    setAlloc(prev => ({ ...prev, [slot_content_id]: n }));
  };

  const submit = async () => {
    setSubmitting(true);
    let okCount = 0, failCount = 0;
    const errors: string[] = [];
    try {
      for (const [scId, qty] of Object.entries(alloc)) {
        if (!qty || qty <= 0) continue;
        const { error } = await (supabase.rpc as any)("pick_from_slot", {
          p_slot_content_id: scId,
          p_quantity: qty,
          p_order_id: orderId,
          p_note: `Picking ${orderCode}`,
        });
        if (error) {
          failCount++;
          errors.push(error.message ?? "Error desconocido");
        } else {
          okCount++;
        }
      }
      if (okCount > 0) {
        toast.success(`Picking registrado: ${okCount} ${okCount === 1 ? "posición" : "posiciones"}`);
      }
      if (failCount > 0) {
        toast.error(`${failCount} fallaron: ${errors[0]}`);
      }
      qc.invalidateQueries({ queryKey: ["warehouse-contents"] });
      qc.invalidateQueries({ queryKey: ["picking-availability"] });
      qc.invalidateQueries({ queryKey: ["maniobra-orders"] });
      if (failCount === 0) {
        onOpenChange(false);
        onDone?.();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl w-[96vw] max-h-[92vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="text-xl flex items-center gap-2 flex-wrap">
            <Package className="h-5 w-5" />
            Picking · <span className="font-mono">{orderCode}</span>
            <span className="text-sm font-normal text-muted-foreground">{clientName}</span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Sugerencia FIFO (lote más viejo primero). Ajusta las cantidades si el lote no está accesible.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {lineSummaries.map(({ line, slots, allocated, totalAvailable, shortage, overpicked }) => (
            <div key={line.product_id} className="rounded-lg border bg-card p-4 space-y-3">
              {/* Line header */}
              <div className="flex items-start gap-3">
                <ProductThumb src={line.image_url} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-mono text-xs text-primary">{line.product_clave}</span>
                    <span className="font-semibold text-sm">{line.product_name}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Requerido: <span className="font-bold text-foreground tabular-nums">{line.quantity}</span> bultos
                    {" · "}
                    Disponible total: <span className="font-bold text-foreground tabular-nums">{totalAvailable}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] uppercase font-semibold text-muted-foreground">Asignado</div>
                  <div className={cn(
                    "text-lg font-bold tabular-nums",
                    shortage > 0 ? "text-amber-600" : overpicked > 0 ? "text-red-600" : "text-emerald-600",
                  )}>
                    {allocated} / {line.quantity}
                  </div>
                </div>
              </div>

              {/* Per-slot allocation table — always rendered, skeletons during load */}
              <div className="overflow-x-auto -mx-4 px-4">
                <table className="w-full text-sm min-h-[40px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b">
                      <th className="text-left py-1.5 pr-3">Posición</th>
                      <th className="text-left py-1.5 pr-3">Lote</th>
                      <th className="text-left py-1.5 pr-3">Caducidad</th>
                      <th className="text-right py-1.5 pr-3">Disp.</th>
                      <th className="text-right py-1.5 w-28">Tomar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {isLoading
                      ? Array.from({ length: 2 }).map((_, i) => (
                          <tr key={`sk-${i}`}>
                            <td className="py-2 pr-3"><Skeleton className="h-4 w-16" /></td>
                            <td className="py-2 pr-3"><Skeleton className="h-4 w-20" /></td>
                            <td className="py-2 pr-3"><Skeleton className="h-4 w-14" /></td>
                            <td className="py-2 pr-3 text-right"><Skeleton className="h-4 w-8 ml-auto" /></td>
                            <td className="py-2 text-right"><Skeleton className="h-9 w-20 ml-auto" /></td>
                          </tr>
                        ))
                      : slots.length === 0
                      ? (
                        <tr>
                          <td colSpan={5} className="py-3 text-center text-sm text-amber-600 italic">
                            <AlertTriangle className="h-4 w-4 inline mr-1" />
                            Sin posiciones con stock de este producto
                          </td>
                        </tr>
                      )
                      : slots.map((s, idx) => (
                          <tr key={s.slot_content_id} className="hover:bg-muted/20">
                            <td className="py-2 pr-3 font-mono text-xs">{s.slot_code}</td>
                            <td className="py-2 pr-3 font-mono text-xs">{s.lote ?? "—"}</td>
                            <td className="py-2 pr-3 text-xs">
                              {fmtDate(s.expiration_date)}
                              {idx === 0 && s.expiration_date && (
                                <Badge variant="outline" className="ml-1 text-[9px] bg-amber-500/10 text-amber-600 border-amber-500/30">
                                  más viejo
                                </Badge>
                              )}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums">{s.quantity}</td>
                            <td className="py-2 text-right">
                              <Input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                max={s.quantity}
                                value={alloc[s.slot_content_id] ?? 0}
                                onChange={(e) => updateAlloc(s.slot_content_id, e.target.value, s.quantity)}
                                className="h-9 w-20 ml-auto text-right tabular-nums"
                                disabled={submitting}
                              />
                            </td>
                          </tr>
                        ))}
                  </tbody>
                </table>
              </div>

              {/* Per-line warnings */}
              {shortage > 0 && !isLoading && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs px-3 py-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Faltan {shortage} bultos · este producto no se puede surtir completo desde almacén
                </div>
              )}
              {overpicked > 0 && (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300 text-xs px-3 py-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Sobrante: estás tomando {overpicked} bultos más de los requeridos
                </div>
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="px-6 py-3 border-t shrink-0 sm:justify-between gap-3 flex-wrap">
          <div className="text-sm">
            <span className="text-muted-foreground">Total asignado: </span>
            <span className={cn(
              "font-bold tabular-nums",
              totalAllocated < totalRequired ? "text-amber-600" : "text-emerald-600",
            )}>
              {totalAllocated} / {totalRequired}
            </span>
            {anyShortage && (
              <span className="ml-3 text-amber-600 text-xs">
                <AlertTriangle className="h-3 w-3 inline mr-0.5" />
                Faltante — se registrará lo que sí está disponible
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
            <Button onClick={submit} disabled={!canSubmit} className="min-w-[160px]">
              {submitting
                ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Registrando…</>
                : <><CheckCircle2 className="h-4 w-4 mr-1.5" /> Confirmar picking</>}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
