/**
 * ScannerPickDialog
 *
 * Opens when the BarcodeScannerDialog (Picar mode) returns a barcode
 * that resolves to one or more slot_contents rows. Lets the worker
 * choose a slot (FIFO-sorted by expiration when there are multiple)
 * and the quantity to subtract, then calls the
 * scanner_pick_from_slot RPC to write a Kardex 'pedido' row and
 * update slot_contents.
 *
 * Standalone — no Maniobra/order context. For order-driven picking
 * the Maniobra pedido flow is still the right tool; this is for ad-hoc
 * "let me grab N bultos of this product right now" sessions.
 */

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ProductThumb } from "@/components/ui/product-thumb";
import { PackageMinus, Loader2, ScanBarcode } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { parseLocalDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

interface ScannerPickCandidate {
  /** slot_contents.id — what the RPC operates on */
  id: string;
  /** Display info */
  slot_code: string;
  product_clave: string | null;
  product_name: string | null;
  product_image_url: string | null;
  lote: string | null;
  expiration_date: string | null;
  quantity: number;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** The barcode that triggered the open (shown for context) */
  scannedValue: string | null;
  /** All slot_contents rows that matched the scanned barcode. Already
   *  FIFO-sorted (oldest expiration first) by the caller. */
  candidates: ScannerPickCandidate[];
  /** Fired after a successful pick so the parent can re-open the
   *  scanner for the next item. */
  onPickComplete?: () => void;
}

export function ScannerPickDialog({
  open, onOpenChange, scannedValue, candidates, onPickComplete,
}: Props) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [qty, setQty] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  // Auto-select first candidate (oldest exp = best FIFO pick) when the
  // dialog opens or the candidate list changes.
  useEffect(() => {
    if (!open) return;
    if (candidates.length > 0) {
      setSelectedId(candidates[0].id);
      setQty(candidates[0].quantity);
    } else {
      setSelectedId(null);
      setQty(0);
    }
  }, [open, candidates]);

  const selected = useMemo(
    () => candidates.find((c) => c.id === selectedId) ?? null,
    [candidates, selectedId],
  );

  // Clamp qty when switching candidate
  useEffect(() => {
    if (selected && qty > selected.quantity) setQty(selected.quantity);
    if (selected && qty <= 0) setQty(selected.quantity);
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const fmtDate = (d: string | null) => {
    if (!d) return null;
    try { return format(parseLocalDate(d), "dd MMM yyyy", { locale: es }); }
    catch { return d; }
  };

  const handleSubmit = async () => {
    if (!selected) return;
    if (qty <= 0 || qty > selected.quantity) {
      toast.error(`Cantidad debe estar entre 1 y ${selected.quantity}`);
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await (supabase as any).rpc("scanner_pick_from_slot", {
        p_content_id: selected.id,
        p_quantity: qty,
        p_note: scannedValue ? `Scanner pick · ${scannedValue}` : "Scanner pick",
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["warehouse-contents"] });
      qc.invalidateQueries({ queryKey: ["warehouse-slots"] });
      qc.invalidateQueries({ queryKey: ["warehouse-latest-movement-by-slot"] });
      toast.success(
        `${qty} bultos de ${selected.product_clave ?? "—"} sacados de ${selected.slot_code}`,
      );
      onPickComplete?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Error al picar: " + (err.message ?? "desconocido"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md w-[96vw] p-0 overflow-hidden gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="text-lg flex items-center gap-2">
            <PackageMinus className="h-5 w-5 text-emerald-500" />
            Picar bultos
          </DialogTitle>
          {scannedValue && (
            <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
              <ScanBarcode className="h-3 w-3" />
              <span className="font-mono">{scannedValue}</span>
            </div>
          )}
        </DialogHeader>

        <div className="px-5 py-4 space-y-4">
          {candidates.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground italic">
              No se encontró ningún lote para este código
            </div>
          ) : (
            <>
              {/* Candidate list — FIFO sorted, multiple means user picks */}
              {candidates.length > 1 ? (
                <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                    Elige de qué posición picar
                  </Label>
                  {candidates.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(c.id);
                        setQty(c.quantity);
                      }}
                      className={cn(
                        "w-full rounded-lg border p-2.5 text-left flex items-center gap-2.5 transition",
                        c.id === selectedId
                          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                          : "border-border hover:bg-muted/40",
                      )}
                    >
                      <ProductThumb src={c.product_image_url} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-[10px] text-primary">
                          {c.product_clave ?? "—"}
                        </div>
                        <div className="text-xs font-medium truncate">
                          {c.product_name ?? "—"}
                        </div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                          <span className="font-mono">{c.slot_code}</span>
                          {c.lote && (
                            <span className="font-mono">Lote {c.lote}</span>
                          )}
                          {c.expiration_date && (
                            <span>Caduca {fmtDate(c.expiration_date)}</span>
                          )}
                        </div>
                      </div>
                      <div className="font-bold tabular-nums text-sm text-emerald-700 dark:text-emerald-400 shrink-0">
                        {c.quantity}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                /* Single candidate — compact summary */
                selected && (
                  <div className="rounded-lg border bg-card p-3 flex items-center gap-3">
                    <ProductThumb src={selected.product_image_url} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[11px] text-primary">
                        {selected.product_clave ?? "—"}
                      </div>
                      <div className="text-sm font-semibold truncate">
                        {selected.product_name ?? "—"}
                      </div>
                      <div className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5">
                        <span className="font-mono">{selected.slot_code}</span>
                        {selected.lote && (
                          <span className="font-mono">Lote {selected.lote}</span>
                        )}
                        {selected.expiration_date && (
                          <span>Caduca {fmtDate(selected.expiration_date)}</span>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/40 shrink-0">
                      {selected.quantity} disponibles
                    </Badge>
                  </div>
                )
              )}

              {/* Qty input */}
              {selected && (
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                    Cantidad a sacar
                  </Label>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-10 w-10"
                      onClick={() => setQty(Math.max(1, qty - 1))}
                      disabled={qty <= 1 || submitting}
                    >
                      −
                    </Button>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={selected.quantity}
                      value={qty}
                      onChange={(e) =>
                        setQty(
                          Math.max(
                            1,
                            Math.min(selected.quantity, Number(e.target.value) || 0),
                          ),
                        )
                      }
                      className="flex-1 h-10 text-center text-lg font-bold tabular-nums"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-10 w-10"
                      onClick={() =>
                        setQty(Math.min(selected.quantity, qty + 1))
                      }
                      disabled={qty >= selected.quantity || submitting}
                    >
                      +
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-10 px-3 text-xs"
                      onClick={() => setQty(selected.quantity)}
                      disabled={submitting}
                    >
                      Todo
                    </Button>
                  </div>
                  {qty < selected.quantity && (
                    <p className="text-[10px] text-muted-foreground">
                      Quedarán {selected.quantity - qty} bultos en{" "}
                      <span className="font-mono">{selected.slot_code}</span>
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="px-5 py-3 border-t">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selected || qty <= 0 || submitting}
            className="min-w-[160px]"
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Picando...</>
            ) : (
              <>Sacar {qty} bultos</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
