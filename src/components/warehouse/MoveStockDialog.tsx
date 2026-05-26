// @ts-nocheck
/**
 * MoveStockDialog
 *
 * Opens from the Almacén slot drawer with a "Mover" button next to each
 * lote row. Mirrors PlacementSuggestionDialog: surfaces the same ranked
 * suggestions (close to Embarque when a pedido is coming, same block as
 * the SKU for FIFO grouping, or any empty matching-access slot), lets
 * the worker pick one or override with a free picker, and on confirm
 * calls `move_stock_between_slots` which atomically:
 *
 *   • decrements / deletes the source slot_contents row
 *   • inserts or tops up the destination row (same SKU + lote)
 *   • writes two Kardex movements with reason='reubicacion'
 *     (−N on the source slot, +N on the destination)
 *
 * Suggestions for the source slot itself are filtered out client-side
 * so we never propose moving to the place we started from.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductThumb } from "@/components/ui/product-thumb";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Truck,
  Package,
  Loader2,
  MapPin,
  ArrowRight,
  MoveRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PlacementSuggestion {
  slot_id: string;
  slot_code: string;
  block: number | null;
  row_letter: string | null;
  pos: number | null;
  access_type: string;
  rank: number;
  reason: "close_to_embarque" | "same_block_as_sku" | "empty_matching_access";
  reason_text: string;
}

interface AnySlot {
  id: string;
  code: string;
  zone: "storage" | "recibo" | "embarque";
  blocked: boolean;
  access_type: string;
  block: number | null;
  row_letter: string | null;
  position: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;

  /** The slot_contents row we are moving from */
  sourceContentId: string;
  sourceSlotId: string;
  sourceSlotCode: string;
  sourceQuantity: number;

  /** Product details for header + suggestion lookup */
  productId: string | null;
  productClave: string | null;
  productName: string | null;
  productImageUrl: string | null;

  /** Lote metadata — display-only, the RPC reads it off the source row */
  lote: string | null;
  expirationDate: string | null;
}

const REASON_META: Record<
  PlacementSuggestion["reason"],
  { label: string; icon: React.ReactNode; chip: string }
> = {
  close_to_embarque: {
    label: "Cerca de Embarque",
    icon: <Truck className="h-3.5 w-3.5" />,
    chip: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40",
  },
  same_block_as_sku: {
    label: "Mismo bloque (FIFO)",
    icon: <Package className="h-3.5 w-3.5" />,
    chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
  },
  empty_matching_access: {
    label: "Posición vacía",
    icon: <MapPin className="h-3.5 w-3.5" />,
    chip: "bg-gray-500/15 text-gray-700 dark:text-gray-300 border-gray-500/40",
  },
};

export function MoveStockDialog({
  open,
  onOpenChange,
  sourceContentId,
  sourceSlotId,
  sourceSlotCode,
  sourceQuantity,
  productId,
  productClave,
  productName,
  productImageUrl,
  lote,
  expirationDate,
}: Props) {
  const qc = useQueryClient();

  const [quantity, setQuantity] = useState(sourceQuantity);
  const [note, setNote] = useState("");
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [manualSlotId, setManualSlotId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Reset everything when the dialog reopens for a different lote
  useEffect(() => {
    if (open) {
      setQuantity(sourceQuantity);
      setNote("");
      setSelectedSlotId(null);
      setManualSlotId("");
    }
  }, [open, sourceContentId, sourceQuantity]);

  // Ranked suggestions from the same engine used by placement
  const { data: rawSuggestions = [], isLoading: suggestionsLoading } = useQuery({
    queryKey: ["move-suggestions", productId, sourceContentId, quantity],
    queryFn: async () => {
      if (!productId) return [] as PlacementSuggestion[];
      const { data, error } = await (supabase as any).rpc(
        "suggest_slots_for_placement",
        {
          p_product_id: productId,
          p_quantity: quantity,
          p_days_window: 3,
        },
      );
      if (error) throw error;
      return (data ?? []) as PlacementSuggestion[];
    },
    enabled: open && !!productId,
    staleTime: 30 * 1000,
  });

  // Never suggest moving back to ourselves
  const suggestions = useMemo(
    () => rawSuggestions.filter((s) => s.slot_id !== sourceSlotId),
    [rawSuggestions, sourceSlotId],
  );

  // Manual override picker — all empty storage slots except the source
  const { data: emptySlots = [], isLoading: slotsLoading } = useQuery({
    queryKey: ["empty-slots-for-move", sourceSlotId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("warehouse_slots")
        .select("id, code, zone, blocked, access_type, block, row_letter, position")
        .eq("active", true)
        .eq("blocked", false)
        .order("zone")
        .order("block")
        .order("row_letter")
        .order("position");
      if (error) throw error;
      const all = (data ?? []) as AnySlot[];
      const { data: occupied } = await (supabase as any)
        .from("slot_contents")
        .select("slot_id");
      const occSet = new Set(
        ((occupied ?? []) as { slot_id: string }[]).map((o) => o.slot_id),
      );
      return all.filter((s) => !occSet.has(s.id) && s.id !== sourceSlotId);
    },
    enabled: open,
    staleTime: 30 * 1000,
  });

  // Group suggestions by rank so each appears as its own labeled card
  const suggestionsByRank = useMemo(() => {
    const m = new Map<number, PlacementSuggestion[]>();
    for (const s of suggestions) {
      const arr = m.get(s.rank) ?? [];
      arr.push(s);
      m.set(s.rank, arr);
    }
    return [...m.entries()].sort(([a], [b]) => a - b);
  }, [suggestions]);

  const finalSlotId = manualSlotId || selectedSlotId;

  const handleSubmit = async () => {
    if (!finalSlotId) {
      toast.error("Selecciona una posición destino");
      return;
    }
    if (quantity <= 0 || quantity > sourceQuantity) {
      toast.error(`Cantidad debe estar entre 1 y ${sourceQuantity}`);
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await (supabase as any).rpc("move_stock_between_slots", {
        p_source_content_id: sourceContentId,
        p_dest_slot_id: finalSlotId,
        p_quantity: quantity,
        p_note: note.trim() || null,
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["warehouse-contents"] });
      qc.invalidateQueries({ queryKey: ["warehouse-slots"] });
      qc.invalidateQueries({ queryKey: ["slot-movements"] });
      // Critical: without this, the "Deshacer" banner on the slot panel
      // / drawer reads from a stale cache and won't reflect the move
      // that just happened — leaving the user with no visible undo
      // until they open Historial reciente.
      qc.invalidateQueries({ queryKey: ["warehouse-latest-movement-by-slot"] });
      qc.invalidateQueries({ queryKey: ["recent-reubicaciones"] });
      qc.invalidateQueries({ queryKey: ["empty-slots-for-move"] });
      qc.invalidateQueries({ queryKey: ["empty-slots-for-placement"] });
      const destSlot = [...suggestions, ...emptySlots].find(
        (s: any) => (s.slot_id ?? s.id) === finalSlotId,
      ) as PlacementSuggestion | AnySlot | undefined;
      const destCode =
        (destSlot as PlacementSuggestion)?.slot_code ??
        (destSlot as AnySlot)?.code ??
        "destino";
      toast.success(
        `${quantity} bultos movidos · ${sourceSlotCode} → ${destCode}`,
      );
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Error al mover: " + (err.message ?? "desconocido"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl w-[96vw] max-h-[92vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="text-xl flex items-center gap-3 flex-wrap">
            <MoveRight className="h-5 w-5 text-purple-500" />
            <span>Mover bultos</span>
            <span className="text-sm font-normal text-muted-foreground">
              · desde{" "}
              <span className="font-mono font-semibold text-foreground">
                {sourceSlotCode}
              </span>
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* What we're moving */}
          <div className="rounded-lg border bg-card p-3 flex items-center gap-3">
            <ProductThumb src={productImageUrl} size="md" />
            <div className="min-w-0 flex-1">
              <div className="font-mono text-xs text-primary">
                {productClave ?? "Sin SKU"}
              </div>
              <div className="font-medium text-sm truncate">
                {productName ?? "Sin producto"}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                {lote && (
                  <span className="font-mono">
                    Lote <span className="text-foreground">{lote}</span>
                  </span>
                )}
                {expirationDate && (
                  <span>
                    · Caduca{" "}
                    <span className="text-foreground">
                      {new Date(expirationDate).toLocaleDateString("es-MX")}
                    </span>
                  </span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                Disponible
              </div>
              <div className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {sourceQuantity}
              </div>
            </div>
          </div>

          {/* Quantity + optional note */}
          <section className="rounded-lg border bg-card p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Cantidad a mover
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                  Bultos
                </Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={sourceQuantity}
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(
                      Math.max(
                        1,
                        Math.min(sourceQuantity, Number(e.target.value) || 0),
                      ),
                    )
                  }
                  className="h-9 text-sm tabular-nums"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                  Nota (opcional)
                </Label>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ej. reorganización por pedido"
                  className="h-9 text-sm"
                />
              </div>
            </div>
            {quantity < sourceQuantity && (
              <p className="text-[11px] text-muted-foreground italic">
                Quedarán {sourceQuantity - quantity} bultos en{" "}
                <span className="font-mono">{sourceSlotCode}</span>.
              </p>
            )}
          </section>

          {/* Suggestions */}
          <section className="rounded-lg border bg-card p-4 space-y-3 min-h-[180px]">
            <div className="flex items-baseline justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Destinos sugeridos
              </h3>
              <span className="text-xs text-muted-foreground">
                Toca para seleccionar
              </span>
            </div>
            {suggestionsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : suggestionsByRank.length === 0 ? (
              <div className="text-sm text-muted-foreground italic py-4 text-center">
                No hay sugerencias automáticas — usa el selector manual abajo.
              </div>
            ) : (
              <div className="space-y-3">
                {suggestionsByRank.map(([rank, group]) => {
                  const meta = REASON_META[group[0].reason];
                  return (
                    <div key={rank} className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn("gap-1.5", meta.chip)}>
                          {meta.icon}
                          {meta.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground italic">
                          {group[0].reason_text}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {group.map((s) => {
                          const isSelected =
                            selectedSlotId === s.slot_id && !manualSlotId;
                          return (
                            <button
                              key={s.slot_id}
                              type="button"
                              onClick={() => {
                                setSelectedSlotId(s.slot_id);
                                setManualSlotId("");
                              }}
                              className={cn(
                                "rounded-lg border-2 p-2 text-left transition active:scale-[0.98]",
                                isSelected
                                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                                  : "border-border bg-card hover:bg-muted/30",
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono font-bold text-sm">
                                  {s.slot_code}
                                </span>
                                {isSelected && (
                                  <ArrowRight className="h-3.5 w-3.5 text-primary" />
                                )}
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                Bloque {s.block} · {s.access_type}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Manual override */}
          <section className="rounded-lg border bg-card p-4 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              O elige cualquier posición vacía
            </h3>
            <Select
              value={manualSlotId}
              onValueChange={(v) => {
                setManualSlotId(v);
                setSelectedSlotId(null);
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue
                  placeholder={
                    slotsLoading ? "Cargando..." : "Selecciona una posición..."
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {emptySlots.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="font-mono mr-2">{s.code}</span>
                    <span className="text-xs text-muted-foreground">
                      · {s.access_type}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>
        </div>

        <DialogFooter className="px-6 py-3 border-t shrink-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !finalSlotId || quantity <= 0}
            className="min-w-[180px]"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Moviendo...
              </>
            ) : (
              <>Mover {quantity} bultos</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
