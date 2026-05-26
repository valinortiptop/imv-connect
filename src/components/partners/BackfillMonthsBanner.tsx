/**
 * BackfillMonthsBanner
 *
 * Surfaces which of the last N months have NO entry yet for a given
 * section (bonificación / liquidación). One-click chip per missing
 * month opens that section's dialog pre-filled for that period.
 *
 * Placed at the top of MonthlyBonificacionesTab and
 * TamemesLiquidacionesTab. Independent of the ChronoBar — the banner
 * always scans the last 12 months ending in the previous month
 * (current month is intentionally skipped: usually you don't capture
 * the bonificación until ADM sends the report a few days into the
 * next month).
 *
 * Empty state ("everything captured") is collapsed into a tiny
 * confirmation chip so it never takes much space when there's
 * nothing to do.
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, History, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es as esLocale } from "date-fns/locale";

interface Props {
  /** Existing entries the banner uses to detect gaps. Anything ending
   *  in `YYYY-MM` matching a month in the lookup range counts as
   *  "filled". */
  existingPeriodMonths: string[];  // "2026-05-01", etc.
  /** How many past months to consider. Default 12. Doesn't include
   *  the current month (likely not yet captured). */
  monthsBack?: number;
  /** Click handler — receives the first-of-month date for the missing
   *  month. Parent opens its dialog pre-filled for that period. */
  onPick: (date: Date) => void;
  /** Pretty title shown at the top of the banner. */
  title: string;
  /** Short label on each chip (e.g., "Capturar bonificación"). */
  chipLabel?: string;
}

export function BackfillMonthsBanner({
  existingPeriodMonths,
  monthsBack = 12,
  onPick,
  title,
  chipLabel = "Capturar",
}: Props) {
  const [expanded, setExpanded] = useState(false);

  // Build the list of past months we want to check
  const allMonths = useMemo(() => {
    const list: Date[] = [];
    const now = new Date();
    // Start at LAST month — current month often hasn't been reported yet
    for (let i = 1; i <= monthsBack; i++) {
      list.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
    }
    return list;
  }, [monthsBack]);

  // Convert existing periods into a Set of "YYYY-MM" for fast lookup
  const existingSet = useMemo(() => {
    const s = new Set<string>();
    for (const p of existingPeriodMonths) {
      if (typeof p === "string" && p.length >= 7) s.add(p.slice(0, 7));
    }
    return s;
  }, [existingPeriodMonths]);

  // Split into missing + present
  const { missing, present } = useMemo(() => {
    const m: Date[] = [];
    const p: Date[] = [];
    for (const d of allMonths) {
      const ym = format(d, "yyyy-MM");
      if (existingSet.has(ym)) p.push(d);
      else m.push(d);
    }
    return { missing: m, present: p };
  }, [allMonths, existingSet]);

  // Default to showing the 4 most-recent missing; the user can expand
  // to see the full 12-month tail.
  const visibleMissing = expanded ? missing : missing.slice(0, 4);
  const hiddenCount = missing.length - visibleMissing.length;

  if (missing.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 flex items-center gap-2 text-xs">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
        <span className="text-emerald-700 dark:text-emerald-300 font-semibold">{title}:</span>
        <span className="text-muted-foreground">todos los últimos {monthsBack} meses ya tienen datos.</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-2 text-xs flex-wrap">
        <History className="h-3.5 w-3.5 text-amber-500 shrink-0" />
        <span className="text-amber-700 dark:text-amber-300 font-semibold">{title}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">
          {missing.length} mes{missing.length === 1 ? "" : "es"} sin captura en los últimos {monthsBack}.
          {present.length > 0 && ` (${present.length} ya capturado${present.length === 1 ? "" : "s"}.)`}
        </span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {visibleMissing.map(d => (
          <Button
            key={format(d, "yyyy-MM")}
            variant="outline"
            size="sm"
            onClick={() => onPick(d)}
            className={cn(
              "h-7 gap-1 text-[11px] capitalize px-2",
              "bg-amber-500/10 text-amber-700 dark:text-amber-200 border-amber-500/40 hover:bg-amber-500/20",
            )}
            title={`${chipLabel} de ${format(d, "MMMM yyyy", { locale: esLocale })}`}
          >
            <Plus className="h-3 w-3" />
            {format(d, "MMM yyyy", { locale: esLocale })}
          </Button>
        ))}
        {hiddenCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(true)}
            className="h-7 text-[11px] gap-1"
          >
            <ChevronDown className="h-3 w-3" />
            +{hiddenCount} más
          </Button>
        )}
        {expanded && missing.length > 4 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(false)}
            className="h-7 text-[11px] gap-1"
          >
            <ChevronUp className="h-3 w-3" />
            Mostrar menos
          </Button>
        )}
      </div>
    </div>
  );
}
