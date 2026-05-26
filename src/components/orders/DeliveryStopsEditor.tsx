// @ts-nocheck
/**
 * DeliveryStopsEditor — UI for splitting an order across multiple
 * delivery addresses. Shared between NewOrderDialog and EditOrderSheet
 * so the create/edit flows stay 1:1.
 *
 * Default: a single stop seeded with the client's address gets all the
 * items. The user clicks "+ Agregar parada" to split. With 2+ stops the
 * per-item allocation grid appears (rows = items, columns = stops, each
 * cell is a quantity input). Row totals must equal the order's item
 * quantity — UI shows red + disables the Save button if mismatched.
 *
 * Each line is keyed by `lineKey` (product_id during create, order_item_id
 * during edit). The parent decides what to use; the editor stays
 * agnostic. On save, the parent maps the editor's stops + per-line
 * allocations to real order_stops + order_stop_items rows.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { Plus, Trash2, MapPin, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface StopLine {
  /** Stable key for the line: product_id (new order) or order_item_id (edit). */
  lineKey: string;
  /** What the user sees ("Ganador Cachorro 20kg") */
  label: string;
  /** Total bultos for this line — must equal the sum of per-stop allocations. */
  totalQuantity: number;
}

export interface StopValue {
  /** 1-based delivery sequence; used for the "stop 1, stop 2" UX + map waypoint order. */
  stop_index: number;
  address: string;
  client_label: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  notes: string | null;
  manual_maps_url: string | null;
  /** Per-line allocation. Map: lineKey → quantity at this stop. */
  allocations: Record<string, number>;
}

export interface DeliveryStopsEditorProps {
  lines: StopLine[];
  /** Used to seed the very first stop's address when no value is set. */
  defaultAddress?: string | null;
  defaultContactName?: string | null;
  defaultContactPhone?: string | null;
  value: StopValue[];
  onChange: (next: StopValue[]) => void;
}

export function DeliveryStopsEditor({
  lines,
  defaultAddress,
  defaultContactName,
  defaultContactPhone,
  value,
  onChange,
}: DeliveryStopsEditorProps) {
  // Self-heal: if there's no value yet but we have lines, seed a single
  // stop with all items allocated so the editor is never in a "broken"
  // state where the order has items but no place to deliver them.
  useEffect(() => {
    if (value.length === 0 && lines.length > 0) {
      onChange([{
        stop_index: 1,
        address: defaultAddress ?? "",
        client_label: null,
        contact_name: defaultContactName ?? null,
        contact_phone: defaultContactPhone ?? null,
        notes: null,
        manual_maps_url: null,
        allocations: Object.fromEntries(lines.map((l) => [l.lineKey, l.totalQuantity])),
      }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines.length, value.length]);

  const addStop = useCallback(() => {
    const next: StopValue = {
      stop_index: value.length + 1,
      address: "",
      client_label: null,
      contact_name: null,
      contact_phone: null,
      notes: null,
      manual_maps_url: null,
      // New stops start with 0 allocation across all lines (user redistributes)
      allocations: Object.fromEntries(lines.map((l) => [l.lineKey, 0])),
    };
    onChange([...value, next]);
  }, [value, lines, onChange]);

  const removeStop = useCallback((idx: number) => {
    if (value.length <= 1) return;
    // When removing a stop, dump its allocations into stop 1 so the
    // total qty per line stays balanced.
    const removed = value[idx];
    const remaining = value.filter((_, i) => i !== idx).map((s, i) => ({ ...s, stop_index: i + 1 }));
    if (remaining.length > 0) {
      const first = { ...remaining[0], allocations: { ...remaining[0].allocations } };
      for (const [k, q] of Object.entries(removed.allocations)) {
        first.allocations[k] = (first.allocations[k] ?? 0) + q;
      }
      remaining[0] = first;
    }
    onChange(remaining);
  }, [value, onChange]);

  /** Swap a stop with its neighbour and re-sequence stop_index so the
   *  driver's route order matches the visible order. Allocations,
   *  addresses and contacts travel with the stop they belong to. */
  const moveStop = useCallback((idx: number, dir: "up" | "down") => {
    const target = dir === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next.map((s, i) => ({ ...s, stop_index: i + 1 })));
  }, [value, onChange]);

  const updateStop = useCallback((idx: number, patch: Partial<StopValue>) => {
    onChange(value.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }, [value, onChange]);

  /**
   * Set a quantity at one stop and AUTO-REBALANCE the remainder across
   * the other stops so the per-line total always stays equal to the
   * line's total (when possible). Behavior:
   *   - 2 stops: trivial — the other stop gets `total − newValue`
   *   - 3+ stops: distribute remainder proportionally to the other
   *     stops' current shares; if all others are 0, dump it on the
   *     last "other" stop
   *   - newValue > total: the entered cell goes red (handled in render);
   *     other stops are zeroed since there's nothing left to distribute
   * The user can still drag values around freely — auto-balance just
   * means the typical case "I typed 50 in stop 1" doesn't require a
   * manual second click in stop 2.
   */
  const updateAllocation = useCallback((stopIdx: number, lineKey: string, qty: number) => {
    const newValue = Math.max(0, Math.floor(qty || 0));
    const line = lines.find((l) => l.lineKey === lineKey);
    const totalQty = line?.totalQuantity ?? 0;

    // Single-stop edge case (shouldn't appear because grid is hidden,
    // but be safe): just write the value.
    if (value.length <= 1) {
      onChange(value.map((s, i) => (
        i === stopIdx ? { ...s, allocations: { ...s.allocations, [lineKey]: newValue } } : s
      )));
      return;
    }

    const remaining = Math.max(0, totalQty - newValue);
    // Snapshot the other stops' current values for this line
    const otherIndexes = value.map((_, i) => i).filter((i) => i !== stopIdx);
    const otherCurrent = otherIndexes.map((i) => value[i].allocations[lineKey] ?? 0);
    const otherSum = otherCurrent.reduce((s, n) => s + n, 0);

    // Decide how to spread `remaining` across other stops
    let nextOthers: number[];
    if (remaining === 0) {
      nextOthers = otherIndexes.map(() => 0);
    } else if (otherSum === 0) {
      // All others empty → dump the remainder onto the last "other"
      // stop so a 2-stop case lands at [newValue, remaining] cleanly.
      nextOthers = otherIndexes.map((_, idx) => (idx === otherIndexes.length - 1 ? remaining : 0));
    } else {
      // Proportional spread, last one absorbs rounding so the sum is exact
      let assigned = 0;
      nextOthers = otherIndexes.map((_, idx) => {
        if (idx === otherIndexes.length - 1) return remaining - assigned;
        const share = Math.floor((otherCurrent[idx] / otherSum) * remaining);
        assigned += share;
        return share;
      });
    }

    onChange(value.map((s, i) => {
      if (i === stopIdx) {
        return { ...s, allocations: { ...s.allocations, [lineKey]: newValue } };
      }
      const otherIdx = otherIndexes.indexOf(i);
      const next = otherIdx === -1 ? (s.allocations[lineKey] ?? 0) : nextOthers[otherIdx];
      return { ...s, allocations: { ...s.allocations, [lineKey]: next } };
    }));
  }, [value, lines, onChange]);

  // Per-line totals across all stops, for validation feedback
  const lineTotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of value) {
      for (const [k, q] of Object.entries(s.allocations)) {
        map[k] = (map[k] ?? 0) + q;
      }
    }
    return map;
  }, [value]);

  const isMultiStop = value.length > 1;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Direcciones de entrega ({value.length})</Label>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addStop}>
          <Plus className="h-3.5 w-3.5" />
          Agregar parada
        </Button>
      </div>

      <div className="space-y-3">
        {value.map((stop, idx) => (
          <div key={idx} className="border rounded-lg p-3 bg-muted/20 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-semibold">Parada {stop.stop_index}</span>
              </div>
              {/* Reorder + delete controls — stack same as the truck
                  reorder UI in /maniobra Plan view so the muscle memory
                  carries across pages. Up/down disabled at the bounds. */}
              {value.length > 1 && (
                <div className="flex items-center gap-1">
                  <div className="flex flex-col gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => moveStop(idx, "up")}
                      disabled={idx === 0}
                      title="Subir"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => moveStop(idx, "down")}
                      disabled={idx === value.length - 1}
                      title="Bajar"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => removeStop(idx)}
                    title="Eliminar parada"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="sm:col-span-2">
                <Label className="text-xs">Dirección *</Label>
                <Textarea
                  rows={2}
                  value={stop.address}
                  onChange={(e) => updateStop(idx, { address: e.target.value })}
                  placeholder="Calle, número, colonia, municipio…"
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Recibe (nombre)</Label>
                <Input
                  value={stop.contact_name ?? ""}
                  onChange={(e) => updateStop(idx, { contact_name: e.target.value || null })}
                  placeholder="Quién recibe"
                />
              </div>
              <div>
                <Label className="text-xs">Teléfono</Label>
                <Input
                  value={stop.contact_phone ?? ""}
                  onChange={(e) => updateStop(idx, { contact_phone: e.target.value || null })}
                  placeholder="55 1234 5678"
                />
              </div>
              <div>
                <Label className="text-xs">Etiqueta (opcional)</Label>
                <Input
                  value={stop.client_label ?? ""}
                  onChange={(e) => updateStop(idx, { client_label: e.target.value || null })}
                  placeholder='Ej. "Sucursal Iztapalapa"'
                />
              </div>
              <div>
                <Label className="text-xs">Maps URL (opcional)</Label>
                <Input
                  value={stop.manual_maps_url ?? ""}
                  onChange={(e) => updateStop(idx, { manual_maps_url: e.target.value || null })}
                  placeholder="https://maps.app.goo.gl/…"
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Notas para el chofer</Label>
                <Input
                  value={stop.notes ?? ""}
                  onChange={(e) => updateStop(idx, { notes: e.target.value || null })}
                  placeholder='Ej. "Tocar timbre 2 veces"'
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Per-item allocation grid — only when 2+ stops exist */}
      {isMultiStop && lines.length > 0 && (
        <div className="border rounded-lg p-3 bg-muted/20 space-y-2">
          <Label className="text-sm font-semibold">Asignación por producto</Label>
          <p className="text-xs text-muted-foreground">
            Escribe cuántos bultos van a una parada — la otra se ajusta sola. Si lo capturas en rojo, excede el total disponible.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left py-1.5 pr-2">Producto</th>
                  {value.map((s) => (
                    <th key={s.stop_index} className="text-center py-1.5 px-1.5 font-medium">
                      Parada {s.stop_index}
                    </th>
                  ))}
                  <th className="text-right py-1.5 pl-2 w-[80px]">Asig. / Total</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const allocated = lineTotals[line.lineKey] ?? 0;
                  const ok = allocated === line.totalQuantity;
                  return (
                    <tr key={line.lineKey} className="border-b last:border-b-0">
                      <td className="py-1.5 pr-2 truncate max-w-[200px]">{line.label}</td>
                      {value.map((s, sIdx) => {
                        const cellValue = s.allocations[line.lineKey] ?? 0;
                        // Cell is invalid when the value alone exceeds
                        // the line's total qty. Red border + red text
                        // makes it obvious without throwing the user
                        // out of the typing flow.
                        const cellOver = cellValue > line.totalQuantity;
                        return (
                          <td key={s.stop_index} className="py-1 px-1.5 text-center">
                            <Input
                              type="number"
                              min={0}
                              max={line.totalQuantity}
                              value={cellValue}
                              onChange={(e) => updateAllocation(sIdx, line.lineKey, Number(e.target.value))}
                              onFocus={(e) => e.currentTarget.select()}
                              className={cn(
                                "h-7 text-center w-16 mx-auto",
                                cellOver && "border-destructive text-destructive ring-2 ring-destructive/30 focus-visible:ring-destructive",
                              )}
                              title={cellOver ? `Máximo ${line.totalQuantity}` : undefined}
                            />
                          </td>
                        );
                      })}
                      <td className={cn(
                        "py-1.5 pl-2 text-right text-xs tabular-nums font-mono",
                        ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive font-bold",
                      )}>
                        {allocated} / {line.totalQuantity}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/** True when stops are valid for save: each stop has an address and the
 *  per-line totals equal each line's total quantity. */
export function validateStops(stops: StopValue[], lines: StopLine[]): { valid: boolean; reason?: string } {
  if (stops.length === 0) return { valid: false, reason: "Agrega al menos una dirección de entrega" };
  for (const s of stops) {
    if (!s.address.trim()) return { valid: false, reason: `La parada ${s.stop_index} necesita dirección` };
  }
  if (stops.length === 1) return { valid: true };
  for (const line of lines) {
    const sum = stops.reduce((acc, s) => acc + (s.allocations[line.lineKey] ?? 0), 0);
    if (sum !== line.totalQuantity) {
      return { valid: false, reason: `${line.label}: ${sum} asignados de ${line.totalQuantity}` };
    }
  }
  return { valid: true };
}
