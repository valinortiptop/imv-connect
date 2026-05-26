// @ts-nocheck
/**
 * RecentMovementsDialog (originally a Sheet — converted to a horizontal
 * Dialog per the brand rule "no side panels, always Dialog").
 *
 * Opens from the Almacén header ("Historial reciente" button). Lists
 * the last N relocations + entradas + pedidos with a Deshacer/Revertir
 * action per card. Cards laid out in a responsive grid (2 cols lg+)
 * so the data has horizontal room to breathe — no tiny vertical list.
 *
 *   Within 30 min  → "Deshacer" (real undo: erases the Kardex pair)
 *   Older          → "Revertir" (audit-preserving reverse)
 *
 * Recent (≤30 min) cards get an amber border so they're visually
 * obvious. Each card colors the reason badge using the same Kardex
 * palette used throughout the app.
 *
 * (File name + export kept for backwards-compat with the import in
 * Warehouse.tsx.)
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductThumb } from "@/components/ui/product-thumb";
import { Undo2, RotateCcw, MoveRight, History, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface RecentMovement {
  id: string;
  created_at: string;
  minutes_ago: number;
  quantity: number;
  source_slot_code: string;
  dest_slot_code: string;
  product_clave: string | null;
  product_name: string | null;
  product_image_url: string | null;
  lote: string | null;
  description: string | null;
  note: string | null;
  user_id: string | null;
  can_undo: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

function fmtAgo(min: number): string {
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${Math.round(min)} min`;
  if (min < 60 * 24) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / (60 * 24))} d`;
}

export function RecentMovementsSheet({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [pendingAction, setPendingAction] = useState<
    | { kind: "undo" | "revert"; movement: RecentMovement }
    | null
  >(null);
  const [actionRunning, setActionRunning] = useState(false);

  const { data: movements = [], isLoading, refetch } = useQuery({
    queryKey: ["recent-reubicaciones"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "list_recent_reubicaciones",
        { p_limit: 30 },
      );
      if (error) throw error;
      return (data ?? []) as RecentMovement[];
    },
    staleTime: 15 * 1000,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["warehouse-contents"] });
    qc.invalidateQueries({ queryKey: ["warehouse-slots"] });
    qc.invalidateQueries({ queryKey: ["warehouse-latest-movement-by-slot"] });
    qc.invalidateQueries({ queryKey: ["slot-movements"] });
    refetch();
  };

  const handleUndo = (m: RecentMovement) => setPendingAction({ kind: "undo", movement: m });
  const handleRevert = (m: RecentMovement) => setPendingAction({ kind: "revert", movement: m });

  const runPending = async () => {
    if (!pendingAction) return;
    setActionRunning(true);
    try {
      const rpc = pendingAction.kind === "undo" ? "undo_movement" : "revert_movement";
      const args = pendingAction.kind === "undo"
        ? { p_movement_id: pendingAction.movement.id }
        : { p_movement_id: pendingAction.movement.id, p_note: "Revertido desde Historial reciente" };
      const { error } = await (supabase as any).rpc(rpc, args);
      if (error) throw error;
      invalidateAll();
      toast.success(pendingAction.kind === "undo" ? "Movimiento deshecho" : "Movimiento revertido");
      setPendingAction(null);
    } catch (err: any) {
      toast.error((pendingAction.kind === "undo" ? "Error al deshacer: " : "Error al revertir: ") + (err.message ?? "desconocido"));
    } finally {
      setActionRunning(false);
    }
  };

  const recentCount = movements.filter(m => m.can_undo).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl w-[96vw] max-h-[90vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="text-xl flex items-center gap-3 flex-wrap">
            <History className="h-5 w-5 text-purple-500" />
            Historial reciente de reubicaciones
            {recentCount > 0 && (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/40 text-[10px] font-semibold">
                {recentCount} reciente{recentCount !== 1 ? "s" : ""} (≤30 min)
              </Badge>
            )}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Deshacer (≤30 min) borra el rastro en Kardex; Revertir mantiene el historial con un movimiento compensatorio.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full rounded-lg" />
              ))}
            </div>
          ) : movements.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground italic flex flex-col items-center gap-3">
              <History className="h-8 w-8 opacity-30" />
              No hay reubicaciones recientes.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {movements.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "rounded-lg border bg-card p-3.5 space-y-2.5 transition-colors",
                    m.can_undo
                      ? "border-amber-500/40 ring-1 ring-amber-500/20 hover:border-amber-500/70"
                      : "hover:bg-muted/30",
                  )}
                >
                  {/* Top row: product info + qty */}
                  <div className="flex items-start gap-3">
                    <ProductThumb src={m.product_image_url} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[11px] text-primary">
                        {m.product_clave ?? "—"}
                      </div>
                      <div className="text-sm font-semibold leading-tight line-clamp-2">
                        {m.product_name ?? m.description ?? "—"}
                      </div>
                      {m.lote && (
                        <div className="text-[10px] text-muted-foreground font-mono truncate">
                          Lote {m.lote}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400 leading-none">
                        {m.quantity}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        bultos
                      </div>
                    </div>
                  </div>

                  {/* Slot flow visualization */}
                  <div className="rounded-md bg-muted/30 px-3 py-2 flex items-center justify-center gap-2 flex-wrap text-xs">
                    <span className="font-mono font-bold text-foreground">{m.source_slot_code}</span>
                    <MoveRight className="h-3.5 w-3.5 text-purple-500" />
                    <span className="font-mono font-bold text-foreground">{m.dest_slot_code}</span>
                  </div>

                  {/* Time + note */}
                  <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                    <span>{fmtAgo(m.minutes_ago)}</span>
                    <span className="tabular-nums">
                      {format(new Date(m.created_at), "dd MMM HH:mm", { locale: es })}
                    </span>
                  </div>

                  {m.note && (
                    <div className="text-[10px] text-muted-foreground italic truncate border-t pt-1.5">
                      {m.note}
                    </div>
                  )}

                  {/* Action button */}
                  <div className="pt-1">
                    {m.can_undo ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUndo(m)}
                        className="w-full h-8 gap-1.5 text-xs border-amber-500/60 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                        Deshacer (borra Kardex)
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRevert(m)}
                        className="w-full h-8 gap-1.5 text-xs"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Revertir (con auditoría)
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>

      {/* Branded confirmation (replaces window.confirm). Renders on top
          of the Historial reciente dialog when the user clicks Deshacer
          or Revertir on a card. */}
      <AlertDialog
        open={!!pendingAction}
        onOpenChange={(o) => { if (!o && !actionRunning) setPendingAction(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {pendingAction?.kind === "undo" ? (
                <><Undo2 className="h-5 w-5 text-amber-500" /> Deshacer movimiento</>
              ) : (
                <><RotateCcw className="h-5 w-5" /> Revertir movimiento</>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction && (
                <>
                  <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {pendingAction.movement.quantity}
                  </span>{" "}
                  bultos de{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {pendingAction.movement.product_clave ?? "—"}
                  </span>
                  {" "}volverán de{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {pendingAction.movement.dest_slot_code}
                  </span>
                  {" "}a{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {pendingAction.movement.source_slot_code}
                  </span>
                  .
                  {" "}
                  {pendingAction.kind === "undo"
                    ? "El registro se borrará por completo del Kardex."
                    : "El movimiento original y la reversión quedarán visibles en Kardex."}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionRunning}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={runPending}
              disabled={actionRunning}
              className={cn(
                "gap-1.5",
                pendingAction?.kind === "undo" && "bg-amber-500 hover:bg-amber-600 text-white",
              )}
            >
              {actionRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {pendingAction?.kind === "undo" ? "Sí, deshacer" : "Sí, revertir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
