/**
 * HistoricalInventoryDialog — "Almacén pasado"
 *
 * Read-only time-travel for the Almacén map. Opens from the
 * "Almacén pasado" button on the warehouse header. The user either:
 *   • picks a date from the native input → we load the closest
 *     snapshot whose taken_at ≤ that day at 23:59 local time, or
 *   • clicks a specific snapshot row (pre/post import, daily, manual)
 *     to load that exact moment, or
 *   • uses one of the shortcut chips (hoy / ayer / hace 7 días).
 *
 * Restore is intentionally NOT implemented — the user explicitly asked
 * for read-only. The parent component receives a Date back via
 * `onSelect` and switches the page into time-travel mode.
 *
 * Brand:
 *   • Wide horizontal Dialog (sm:max-w-5xl). No side sheets.
 *   • 2-col grid: LEFT card = date + shortcuts + descriptive footer.
 *     RIGHT card = bordered snapshot list, taller, more padding,
 *     each row has its own KPI chips for filas + bultos.
 *   • Fixed inner heights so swapping snapshots never shifts the
 *     dialog around.
 *   • Spanish copy throughout.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Calendar,
  Camera,
  FileSpreadsheet,
  History,
  Layers,
  Boxes,
  CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface SnapshotRow {
  id: string;
  taken_at: string;
  reason: "pre_import" | "post_import" | "daily" | "manual";
  row_count: number;
  total_bultos: number;
  taken_by_email: string | null;
}

const REASON_META: Record<
  SnapshotRow["reason"],
  { label: string; chip: string; ring: string }
> = {
  pre_import: {
    label: "Antes de importar",
    chip: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40",
    ring: "bg-amber-500/10 text-amber-500",
  },
  post_import: {
    label: "Después de importar",
    chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40",
    ring: "bg-emerald-500/10 text-emerald-500",
  },
  daily: {
    label: "Diario 23:00",
    chip: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/40",
    ring: "bg-blue-500/10 text-blue-500",
  },
  manual: {
    label: "Manual",
    chip: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/40",
    ring: "bg-purple-500/10 text-purple-500",
  },
};

// date-fns es outputs lowercase month abbreviations — title-case the
// first letter to match the rest of the app.
function fmtLong(iso: string): string {
  try {
    const raw = format(new Date(iso), "EEEE dd 'de' MMMM yyyy, HH:mm", { locale: es });
    return raw.replace(/(^|\s)([a-záéíóúñ])/g, (_, b: string, c: string) => b + c.toUpperCase());
  } catch {
    return iso;
  }
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  currentValue: Date | null;
  onSelect: (asOf: Date | null) => void;
}

export function HistoricalInventoryDialog({
  open, onOpenChange, currentValue, onSelect,
}: Props) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [dateIso, setDateIso] = useState<string>(
    currentValue ? new Date(currentValue.getTime()).toISOString().slice(0, 10) : todayIso,
  );

  const { data: snapshots = [], isLoading } = useQuery({
    queryKey: ["inventory-snapshots"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "list_inventory_snapshots",
        { p_limit: 60 },
      );
      if (error) throw error;
      return (data ?? []) as SnapshotRow[];
    },
    staleTime: 60 * 1000,
  });

  const pick = (asOf: Date | null) => {
    onSelect(asOf);
    onOpenChange(false);
  };

  const dateAt2359 = (yyyyMmDd: string): Date => {
    const [y, m, d] = yyyyMmDd.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59);
  };

  const totalBultos = snapshots.reduce((s, r) => s + r.total_bultos, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl w-[96vw] max-h-[92vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="text-xl flex items-center gap-3 flex-wrap">
            <History className="h-5 w-5 text-purple-500" />
            <span>Almacén pasado</span>
            <Badge variant="outline" className="text-[10px] bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/40">
              Solo lectura
            </Badge>
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Carga el snapshot más cercano a la fecha que elijas. El mapa queda en modo lectura — no se pueden mover ni ajustar bultos.
          </p>
        </DialogHeader>

        {/* Body: 2-col horizontal layout. Left = date controls. Right
            = snapshot list. Both columns are min-h-[420px] so the
            dialog doesn't squeeze when the list is short. */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1.4fr] gap-5">
            {/* LEFT — date picker card */}
            <div className="rounded-xl border bg-card p-5 space-y-5 min-h-[420px] flex flex-col">
              <div>
                <div className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground flex items-center gap-1.5 mb-2">
                  <Calendar className="h-3.5 w-3.5" />
                  Elegir fecha
                </div>
                <Input
                  type="date"
                  value={dateIso}
                  max={todayIso}
                  onChange={(e) => setDateIso(e.target.value)}
                  className="font-mono text-base h-11"
                />
                <p className="text-[11px] text-muted-foreground mt-2">
                  Carga el snapshot más reciente con fecha ≤ el día elegido (23:59 hora local).
                </p>
              </div>

              <div>
                <div className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground mb-2">
                  Atajos
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <ShortcutButton onClick={() => pick(null)} active={!currentValue}>
                    Hoy (en vivo)
                  </ShortcutButton>
                  <ShortcutButton
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() - 1);
                      d.setHours(23, 59, 59);
                      pick(d);
                    }}
                  >
                    Ayer
                  </ShortcutButton>
                  <ShortcutButton
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() - 7);
                      d.setHours(23, 59, 59);
                      pick(d);
                    }}
                  >
                    Hace 7 días
                  </ShortcutButton>
                  <ShortcutButton
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() - 30);
                      d.setHours(23, 59, 59);
                      pick(d);
                    }}
                  >
                    Hace 30 días
                  </ShortcutButton>
                </div>
              </div>

              {/* Currently-active indicator. Shows what the parent is
                  showing right now so the user has context before they
                  pick a different date. */}
              <div className="mt-auto rounded-lg border bg-muted/40 p-3 text-xs space-y-1">
                <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
                  Estado actual del mapa
                </div>
                {currentValue ? (
                  <>
                    <div className="font-semibold text-purple-700 dark:text-purple-400">
                      {fmtLong(currentValue.toISOString())}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Modo histórico activo
                    </div>
                  </>
                ) : (
                  <>
                    <div className="font-semibold flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      En vivo
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Estás viendo el inventario actual
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* RIGHT — snapshot list */}
            <div className="rounded-xl border bg-card flex flex-col min-h-[420px]">
              <div className="px-4 py-3 border-b flex items-center gap-2">
                <Camera className="h-4 w-4 text-muted-foreground" />
                <div className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">
                  Snapshots guardados
                </div>
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 ml-auto">
                  {snapshots.length}
                </Badge>
                {snapshots.length > 0 && (
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 tabular-nums">
                    {totalBultos.toLocaleString("es-MX")} bultos
                  </Badge>
                )}
              </div>
              <div className="flex-1 overflow-y-auto divide-y max-h-[420px]">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="p-3">
                      <Skeleton className="h-12 w-full" />
                    </div>
                  ))
                ) : snapshots.length === 0 ? (
                  <div className="p-10 text-center text-xs text-muted-foreground italic flex flex-col items-center gap-2">
                    <Camera className="h-8 w-8 opacity-30" />
                    Todavía no hay snapshots. Se generan automáticamente al importar Excel y diariamente a las 23:00.
                  </div>
                ) : (
                  snapshots.map((s) => {
                    const meta = REASON_META[s.reason];
                    const dt = new Date(s.taken_at);
                    const isCurrent = currentValue && Math.abs(currentValue.getTime() - dt.getTime()) < 60 * 1000;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => pick(dt)}
                        className={cn(
                          "w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors flex items-center gap-3",
                          isCurrent && "bg-purple-500/10 ring-1 ring-inset ring-purple-500/30",
                        )}
                      >
                        <div className={cn("rounded-lg p-2 shrink-0", meta.ring)}>
                          <FileSpreadsheet className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="text-sm font-semibold leading-tight truncate">
                            {fmtLong(s.taken_at)}
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant="outline" className={cn("text-[10px] py-0 px-1.5", meta.chip)}>
                              {meta.label}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 gap-1 font-normal">
                              <Layers className="h-2.5 w-2.5" />
                              <span className="tabular-nums">{s.row_count.toLocaleString("es-MX")} filas</span>
                            </Badge>
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 gap-1 font-normal">
                              <Boxes className="h-2.5 w-2.5" />
                              <span className="tabular-nums">{s.total_bultos.toLocaleString("es-MX")} bultos</span>
                            </Badge>
                          </div>
                          {s.taken_by_email && (
                            <div className="text-[10px] text-muted-foreground/80 truncate">
                              {s.taken_by_email}
                            </div>
                          )}
                        </div>
                        {isCurrent && (
                          <CheckCircle2 className="h-4 w-4 text-purple-500 shrink-0" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t shrink-0 gap-2">
          {currentValue && (
            <Button
              variant="outline"
              onClick={() => pick(null)}
              className="mr-auto gap-1.5"
              title="Salir del modo histórico y volver al estado en vivo"
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Volver al presente
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => pick(dateAt2359(dateIso))}
            className="gap-1.5 bg-purple-500 hover:bg-purple-600 text-white"
          >
            <History className="h-4 w-4" />
            Ver al {dateIso}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShortcutButton({
  onClick, active, children,
}: {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition active:scale-[0.97]",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "border-border text-muted-foreground hover:bg-muted/30",
      )}
    >
      {children}
    </button>
  );
}
