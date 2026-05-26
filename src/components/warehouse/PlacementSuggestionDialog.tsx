// @ts-nocheck
/**
 * PlacementSuggestionDialog
 *
 * Opens from a Stock Entry line item with a "Colocar" button. The
 * entrada is already sitting in a Recibo slot (auto-placed by the
 * stock_entries AFTER INSERT trigger). This dialog lets the worker
 * REUBICATE those bultos from Recibo to a real storage slot. The
 * `suggest_slots_for_placement` RPC ranks up to 3 candidates (close
 * to Embarque, same block as SKU, or any empty matching-access).
 *
 * If a `stockEntryId` is provided, the move uses
 * `move_entry_from_recibo_to_slot` (preserves the entry → slot link
 * via slot_contents.stock_entry_id, writes a reubicacion Kardex pair).
 * For ad-hoc placements without an entry (rare — manual fills) we fall
 * back to the legacy `place_stock_in_slot` so nothing on the call site
 * breaks.
 *
 * Brand: horizontal sm:max-w-6xl, 2-col layout, fixed heights, no
 * shifting. Suggestions on the left next to product info; visual slot
 * grid on the right. Confirm button colored by intent.
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
import { Truck, Package, Loader2, MapPin, ArrowRight, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PlacementSuggestion {
  slot_id: string;
  slot_code: string;
  block: number | null;
  row_letter: string | null;
  position: number | null;
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

  /** Product details for the suggestion + placement */
  productId: string;
  productClave: string;
  productName: string;
  productImageUrl: string | null;

  /** Total bultos to place (the dialog also lets the worker split if they want) */
  totalQuantity: number;

  /** Optional lote / barcode / expiration hints the worker can edit */
  defaultLote?: string;
  defaultBarcode?: string;
  defaultExpirationDate?: string;

  /** Stock entry id so the Kardex note can reference the receipt */
  stockEntryId?: string;
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

export function PlacementSuggestionDialog({
  open,
  onOpenChange,
  productId,
  productClave,
  productName,
  productImageUrl,
  totalQuantity,
  defaultLote,
  defaultBarcode,
  defaultExpirationDate,
  stockEntryId,
}: Props) {
  const qc = useQueryClient();

  // Editable placement form fields
  const [quantity, setQuantity] = useState(totalQuantity);
  const [lote, setLote] = useState(defaultLote ?? "");
  const [barcode, setBarcode] = useState(defaultBarcode ?? "");
  const [expirationDate, setExpirationDate] = useState(defaultExpirationDate ?? "");
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [manualSlotId, setManualSlotId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Reset state when the dialog re-opens for a different entry
  useEffect(() => {
    if (open) {
      setQuantity(totalQuantity);
      setLote(defaultLote ?? "");
      setBarcode(defaultBarcode ?? "");
      setExpirationDate(defaultExpirationDate ?? "");
      setSelectedSlotId(null);
      setManualSlotId("");
    }
  }, [open, totalQuantity, defaultLote, defaultBarcode, defaultExpirationDate]);

  // Pull the ranked suggestions from the RPC
  const { data: suggestions = [], isLoading: suggestionsLoading } = useQuery({
    queryKey: ["placement-suggestions", productId, totalQuantity],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("suggest_slots_for_placement", {
        p_product_id: productId,
        p_quantity: totalQuantity,
        p_days_window: 3,
      });
      if (error) throw error;
      return (data ?? []) as PlacementSuggestion[];
    },
    enabled: open && !!productId,
    staleTime: 30 * 1000,
  });

  // Full slot list (for the manual override picker). We restrict to
  // STORAGE zones only — placing bultos into RECIBO or EMBARQUE from
  // this dialog never makes sense (those are workflow zones, not
  // storage destinations). The user explicitly called this out as
  // confusing in the old layout.
  const { data: emptySlots = [], isLoading: slotsLoading } = useQuery({
    queryKey: ["empty-slots-for-placement"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("warehouse_slots")
        .select("id, code, zone, blocked, access_type, block, row_letter, position")
        .eq("active", true)
        .eq("blocked", false)
        .eq("zone", "storage")
        .order("block").order("row_letter").order("position");
      if (error) throw error;
      const all = (data ?? []) as AnySlot[];
      // Filter out slots that already have contents
      const { data: occupied } = await (supabase as any)
        .from("slot_contents")
        .select("slot_id");
      const occSet = new Set(((occupied ?? []) as { slot_id: string }[]).map(o => o.slot_id));
      return all.filter(s => !occSet.has(s.id));
    },
    enabled: open,
    staleTime: 30 * 1000,
  });

  // Group suggestions by reason so each appears as its own labeled card
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
      toast.error("Selecciona una posición");
      return;
    }
    if (quantity <= 0) {
      toast.error("Cantidad debe ser mayor a 0");
      return;
    }
    setSubmitting(true);
    try {
      // If we have an entry id, the bultos are sitting in Recibo —
      // we move them. Otherwise (rare ad-hoc fill) fall back to the
      // legacy create-in-slot RPC.
      if (stockEntryId) {
        const { error } = await (supabase as any).rpc(
          "move_entry_from_recibo_to_slot",
          {
            p_entry_id:     stockEntryId,
            p_dest_slot_id: finalSlotId,
            p_quantity:     quantity,
            p_note:         `Colocación desde Recibo · Entrada ${stockEntryId.slice(0, 8)}`,
          },
        );
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).rpc("place_stock_in_slot", {
          p_slot_id: finalSlotId,
          p_product_id: productId,
          p_quantity: quantity,
          p_lote: lote || null,
          p_barcode: barcode || null,
          p_expiration_date: expirationDate || null,
          p_description: null,
          p_note: null,
        });
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ["warehouse-contents"] });
      qc.invalidateQueries({ queryKey: ["warehouse-slots"] });
      qc.invalidateQueries({ queryKey: ["warehouse-latest-movement-by-slot"] });
      qc.invalidateQueries({ queryKey: ["placement-suggestions"] });
      qc.invalidateQueries({ queryKey: ["empty-slots-for-placement"] });
      qc.invalidateQueries({ queryKey: ["entradas-pending-recibo"] });
      const placedSlot = [...suggestions, ...emptySlots].find(
        (s: any) => (s.slot_id ?? s.id) === finalSlotId
      ) as PlacementSuggestion | AnySlot | undefined;
      const code =
        (placedSlot as PlacementSuggestion)?.slot_code ??
        (placedSlot as AnySlot)?.code ??
        "posición";
      toast.success(
        stockEntryId
          ? `${quantity} bultos movidos de Recibo → ${code}`
          : `${quantity} bultos colocados en ${code}`,
      );
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Error al colocar: " + (err.message ?? "desconocido"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl w-[96vw] max-h-[92vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="text-xl flex items-center gap-3 flex-wrap">
            <PackagePlus className="h-5 w-5 text-emerald-500" />
            <span>{stockEntryId ? "Colocar desde Recibo" : "Sugerir ubicación"}</span>
            <span className="text-sm font-normal text-muted-foreground">
              · {productClave} · {totalQuantity} bultos
            </span>
          </DialogTitle>
          {stockEntryId && (
            <p className="text-xs text-muted-foreground">
              Estos bultos están en Recibo esperando asignación. Elige la posición de almacenamiento — el movimiento queda registrado en Kardex.
            </p>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Top row: 2-col horizontal layout. Left = product header +
              lote inputs; right = ranked suggestions ONLY. The visual
              slot grid moved to a full-width section below so the two
              top cards stay balanced in height (the map used to bloat
              the right column and leave dead space on the left). */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
            <div className="space-y-4 min-w-0 flex flex-col">
              {/* Product summary card — auto-height, sits at the top
                  of the left column with the lote inputs section
                  flex-growing below it to match the right column. */}
              <div className="rounded-xl border bg-card p-3 flex items-center gap-3 shrink-0">
                <ProductThumb src={productImageUrl} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs text-primary">{productClave}</div>
                  <div className="font-medium text-sm leading-tight line-clamp-2">{productName}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                    {stockEntryId ? "En Recibo" : "Por colocar"}
                  </div>
                  <div className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400 leading-none">
                    {totalQuantity}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">bultos</div>
                </div>
              </div>

              {/* Lote / barcode / expiration — grows to fill remaining
                  left-column height so it visually balances the
                  sugerencias card on the right. */}
              <section className="rounded-xl border bg-card p-4 space-y-3 flex-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Datos del lote
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                      Cantidad
                    </Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={totalQuantity}
                      value={quantity}
                      onChange={e => setQuantity(Math.max(1, Math.min(totalQuantity, Number(e.target.value) || 0)))}
                      className="h-9 text-sm tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                      Lote
                    </Label>
                    <Input
                      value={lote}
                      onChange={e => setLote(e.target.value)}
                      className="h-9 text-sm font-mono"
                      placeholder="F2014616V1"
                      disabled={!!stockEntryId}
                      title={stockEntryId ? "El lote viene de la entrada y no se edita en este paso" : ""}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                      Cód. barras
                    </Label>
                    <Input
                      value={barcode}
                      onChange={e => setBarcode(e.target.value)}
                      className="h-9 text-sm font-mono"
                      placeholder="7502..."
                      disabled={!!stockEntryId}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                      Caducidad
                    </Label>
                    <Input
                      type="date"
                      value={expirationDate}
                      onChange={e => setExpirationDate(e.target.value)}
                      className="h-9 text-sm"
                      disabled={!!stockEntryId}
                    />
                  </div>
                </div>
                {stockEntryId && (
                  <p className="text-[10px] text-muted-foreground italic">
                    Lote / código / caducidad se guardan al recibir la entrada. Para corregirlos, edita la entrada directamente.
                  </p>
                )}
              </section>
            </div>

            {/* Right column: ranked suggestions. Stretches to match
                the left column's height via flex-1 so the visual
                balance stays even regardless of how many suggestion
                groups come back. */}
            <div className="space-y-4 min-w-0 flex flex-col">

          {/* Suggestions */}
          <section className="rounded-xl border bg-card p-4 space-y-3 flex-1 flex flex-col">
            <div className="flex items-baseline justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Sugerencias
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
                        {group.map(s => {
                          const isSelected = selectedSlotId === s.slot_id && !manualSlotId;
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
                                <span className="font-mono font-bold text-sm">{s.slot_code}</span>
                                {isSelected && <ArrowRight className="h-3.5 w-3.5 text-primary" />}
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

            </div>{/* /right column (suggestions only) */}
          </div>{/* /2-col grid */}

          {/* Full-width visual slot grid — the user can click any empty
              storage position directly. Suggested slots from above
              carry over their rank colors so the "smart picks" remain
              obvious here too. Storage zone only (no RECIBO / EMBARQUE
              to avoid confusion). */}
          <section className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-baseline justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Mapa de posiciones vacías · Almacenamiento
              </h3>
              <span className="text-[11px] text-muted-foreground">
                {slotsLoading ? "Cargando..." : `${emptySlots.length} disponibles`}
              </span>
            </div>
            <PlacementSlotGrid
              slots={emptySlots}
              loading={slotsLoading}
              selectedSlotId={manualSlotId}
              suggestionRankBySlotId={(() => {
                const m = new Map<string, number>();
                for (const s of suggestions) {
                  const existing = m.get(s.slot_id);
                  if (existing === undefined || existing > s.rank) m.set(s.slot_id, s.rank);
                }
                return m;
              })()}
              onSelect={(id) => {
                setManualSlotId(id);
                setSelectedSlotId(null);
              }}
            />
          </section>
        </div>{/* /body */}

        <DialogFooter className="px-6 py-3 border-t shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !finalSlotId || quantity <= 0}
            className={cn(
              "min-w-[180px] gap-1.5",
              stockEntryId && "bg-emerald-500 hover:bg-emerald-600 text-white",
            )}
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> {stockEntryId ? "Moviendo..." : "Colocando..."}</>
            ) : stockEntryId ? (
              <><ArrowRight className="h-4 w-4" /> Mover {quantity} bultos a posición</>
            ) : (
              <>Colocar {quantity} bultos</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Visual grid of empty storage / transit slots grouped by floor.
 *  Suggested slots inherit the same blue/emerald rings as the
 *  suggestion chips above, so the user can see at a glance which
 *  positions the system recommends and which are just "valid." */
function PlacementSlotGrid({
  slots, loading, selectedSlotId, suggestionRankBySlotId, onSelect,
}: {
  slots: AnySlot[];
  loading: boolean;
  selectedSlotId: string;
  suggestionRankBySlotId: Map<string, number>;
  onSelect: (slotId: string) => void;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-8 sm:grid-cols-12 gap-1.5">
        {Array.from({ length: 24 }).map((_, i) => (
          <Skeleton key={i} className="h-9 rounded" />
        ))}
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground italic">
        Todas las posiciones están ocupadas
      </div>
    );
  }

  // Group by floor letter for storage; transit zones (recibo / embarque)
  // get their own group at the bottom.
  const groups = new Map<string, AnySlot[]>();
  for (const s of slots) {
    const key =
      s.zone === "storage"
        ? `Planta ${s.row_letter}`
        : s.zone === "recibo"
          ? "Recibo"
          : "Embarque";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  // Order: Planta A, B, C, Recibo, Embarque
  const orderedKeys = [...groups.keys()].sort((a, b) => {
    const order = ["Planta A", "Planta B", "Planta C", "Recibo", "Embarque"];
    return order.indexOf(a) - order.indexOf(b);
  });

  const tileClass = (slotId: string) => {
    const isSelected = slotId === selectedSlotId;
    const rank = suggestionRankBySlotId.get(slotId);
    if (isSelected) {
      return "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-[0_0_14px_rgba(99,102,241,0.7)] bg-primary/15 text-primary-foreground brightness-125 z-10";
    }
    if (rank === 1) {
      return "ring-2 ring-blue-500 ring-offset-1 shadow-[0_0_10px_rgba(59,130,246,0.5)] bg-blue-500/15 text-blue-700 dark:text-blue-300";
    }
    if (rank === 2) {
      return "ring-2 ring-emerald-500 ring-offset-1 shadow-[0_0_10px_rgba(16,185,129,0.5)] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    }
    return "ring-1 ring-cyan-400 bg-cyan-400/10 text-foreground hover:bg-cyan-400/20 hover:brightness-110";
  };

  return (
    <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
      {orderedKeys.map((groupKey) => {
        const groupSlots = groups.get(groupKey)!;
        return (
          <div key={groupKey} className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <h4 className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
                {groupKey}
              </h4>
              <span className="text-[10px] text-muted-foreground">
                {groupSlots.length}
              </span>
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-8 lg:grid-cols-10 gap-1.5">
              {groupSlots.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelect(s.id)}
                  className={cn(
                    "rounded border px-1 py-1 text-[10px] font-mono font-medium text-center transition active:scale-[0.96]",
                    tileClass(s.id),
                  )}
                  title={`${s.code}${s.access_type ? " · " + s.access_type : ""}`}
                >
                  {s.code}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
