/**
 * AgendaWeekView — Mon-Sat stack of AgendaDayBlock panels.
 *
 * Renders 6 working days (Mon-Sat) starting from the Monday of
 * `weekStart`. Each day reuses AgendaDayBlock so the timeline, lane
 * assignment, conflict detection, and pickup logic stay identical to
 * the single-day view.
 *
 * Across the top:
 *   * Aggregate stat strip — sums over all 6 days so Rodrigo can see
 *     "the week has 23 deliveries, 4 with tight windows, 3 pickups"
 *     at a glance.
 *
 * Below:
 *   * 6 day blocks stacked vertically (Lun → Sáb). Today's block is
 *     ring-highlighted blue.
 *
 * No layout shift: every block reserves min-height even when its day
 * is empty. Stat tiles are always rendered (skeleton during load).
 */

import { useMemo } from "react";
import type { ManiobraOrder, AssignedTruck } from "@/components/maniobra-page";
import {
  AgendaDayBlock,
  computeDayStats,
  type DayStats,
} from "./AgendaTimelineView";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarClock, Clock, AlertTriangle, Hand } from "lucide-react";
import { cn } from "@/lib/utils";

/** One day's already-fetched data, supplied by Maniobra. */
export interface WeekDayData {
  date: Date;
  dateStr: string;          // YYYY-MM-DD (for keying)
  isToday: boolean;
  orders: ManiobraOrder[];
  assignedTrucks: AssignedTruck[];
  pickupOrderIds: Set<string>;
}

interface Props {
  /** Six working-day buckets (Lun → Sáb), in chronological order. */
  weekDays: WeekDayData[];
  /** Loading state — relayed from Maniobra's week query. */
  isLoading: boolean;
  /** Optional click handler so Maniobra can drill into the order */
  onOrderClick?: (orderId: string) => void;
}

export function AgendaWeekView({ weekDays, isLoading, onOrderClick }: Props) {
  // Aggregate stats across all 6 days
  const aggregate = useMemo<DayStats>(() => {
    let deliveries = 0, pickups = 0, withWindow = 0, flex = 0, tight = 0, total = 0;
    for (const day of weekDays) {
      const s = computeDayStats(day.orders, day.pickupOrderIds);
      deliveries += s.deliveries;
      pickups += s.pickups;
      withWindow += s.withWindow;
      flex += s.flex;
      tight += s.tight;
      total += s.total;
    }
    return { deliveries, pickups, withWindow, flex, tight, total };
  }, [weekDays]);

  return (
    <div className="space-y-5">
      {/* Aggregate stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <WeekStat icon={<CalendarClock className="h-4 w-4 text-blue-500" />} label="Entregas (sem.)" value={aggregate.deliveries} loading={isLoading} />
        <WeekStat
          icon={<Clock className="h-4 w-4 text-emerald-500" />}
          label="Con ventana"
          value={aggregate.withWindow}
          loading={isLoading}
          hint={aggregate.deliveries > 0 ? `${Math.round((aggregate.withWindow / aggregate.deliveries) * 100)}%` : null}
        />
        <WeekStat
          icon={<Clock className="h-4 w-4 text-amber-500" />}
          label="Sin horario (flex)"
          value={aggregate.flex}
          loading={isLoading}
          tone={aggregate.flex > 0 ? "amber" : undefined}
        />
        <WeekStat
          icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
          label="Ventana ajustada"
          value={aggregate.tight}
          loading={isLoading}
          tone={aggregate.tight > 0 ? "red" : undefined}
          hint="< 3h"
        />
        <WeekStat icon={<Hand className="h-4 w-4 text-purple-500" />} label="Pickup" value={aggregate.pickups} loading={isLoading} />
      </div>

      {/* 6 day blocks stacked vertically. Today is ring-highlighted. */}
      <div className="space-y-4">
        {weekDays.map((d, i) => (
          <AgendaDayBlock
            key={d.dateStr}
            date={d.date}
            orders={d.orders}
            assignedTrucks={d.assignedTrucks}
            pickupOrderIds={d.pickupOrderIds}
            onOrderClick={onOrderClick}
            isLoading={isLoading}
            // Only the first block shows the legend so the page isn't repetitive
            showLegend={i === 0}
            highlight={d.isToday}
            compactHeader
          />
        ))}
      </div>
    </div>
  );
}

/* ── Stat card (week aggregate) ── */
function WeekStat({
  icon, label, value, loading, hint, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  loading?: boolean;
  hint?: string | null;
  tone?: "amber" | "red";
}) {
  const toneClass =
    tone === "red" ? "border-red-500/30 bg-red-500/5"
    : tone === "amber" ? "border-amber-500/30 bg-amber-500/5"
    : "";
  return (
    <div className={cn("rounded-xl border bg-card p-3 flex items-center gap-3 min-h-[64px]", toneClass)}>
      <div className="p-2 rounded-lg bg-muted/50 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground truncate">{label}</div>
        {loading ? (
          <Skeleton className="h-7 w-12 mt-0.5" />
        ) : (
          <div className="flex items-baseline gap-1.5">
            <div className="text-xl font-bold tabular-nums">{value}</div>
            {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
