/**
 * AgendaTimelineView (single-day view) + AgendaDayBlock (one day's
 * timeline panel, reusable for the week stack).
 *
 * Renders the "Agenda" tab of Maniobra: hour axis + truck rows + window
 * bars + pickup strip. Day view wraps a single AgendaDayBlock with a
 * stat strip; week view (AgendaWeekView) uses 6 AgendaDayBlocks instead.
 *
 * Layout per row (inside AgendaDayBlock):
 *   [ Transporte gutter ][ 07:00 ─── timeline ─── 20:00 ][ Sin horario tail ]
 *        168px                  13h × 60px                       220px
 *
 * Highlights & badges:
 *   * Tight windows (<3h span) get a red border.
 *   * Overlapping windows on the same truck get a red ring + a "N
 *     solapados" badge in the gutter. The truck physically can't be
 *     in two places at once, so the conflict is unmistakable.
 *   * Pickup orders sit outside the timeline (no truck, no route) —
 *     PickupStrip renders them as purple chips below the panel.
 *   * Orders without a captured window land in the "Sin horario" tail
 *     since they have no time position. Capturing windows is the C/A/B
 *     "B" leg — the chip emptiness drives that work.
 *
 * No layout shift discipline: all sizes are constants, lane assignment
 * is deterministic, every row reserves its minimum height even with
 * zero bars. Switching between day/week or between dates only changes
 * the bar contents, never the panel's outer geometry.
 */

import { useMemo } from "react";
import type { ManiobraOrder, AssignedTruck } from "@/components/maniobra-page";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Truck, Clock, AlertTriangle, Hand, CalendarClock, HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  /** Today's delivery orders, already fetched by Maniobra */
  orders: ManiobraOrder[];
  /** Assigned trucks (with order_id lists) */
  assignedTrucks: AssignedTruck[];
  /** Order IDs marked as pickup (client comes to us — no delivery) */
  pickupOrderIds: Set<string>;
  /** The date being viewed (Mon-Sat working day) */
  date: Date;
  /** Loading state — Maniobra already fetches orders, just relay it */
  isLoading: boolean;
  /** Optional click handler so Maniobra can drill into the order */
  onOrderClick?: (orderId: string) => void;
}

/* ── Timeline geometry (shared across day + week views) ────────── */
export const HOUR_PX = 60;            // pixels per hour on the x-axis
export const START_HR = 7;            // 07:00
export const END_HR = 20;             // 20:00
export const HOURS = END_HR - START_HR;        // 13
export const TIMELINE_W = HOURS * HOUR_PX;     // 780
export const GUTTER_W = 168;          // left "truck name" gutter
export const FLEX_W = 220;            // right "sin horario" tail
const BAR_H = 38;              // height of one bar (one lane)
const LANE_GAP = 4;            // gap between stacked lanes within a row
const ROW_PADDING_Y = 8;       // vertical padding around the bar stack
const TIGHT_THRESHOLD_MIN = 3 * 60;     // window shorter than this = "ajustada"

/** Parse "HH:MM" / "HH:MM:SS" → minutes since midnight (or null). */
export function hhmmToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t));
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  return h * 60 + mm;
}

/** Clamp a minute value to the visible axis range and return its px offset. */
function minToOffsetPx(min: number): number {
  const startMin = START_HR * 60;
  const endMin = END_HR * 60;
  const clamped = Math.max(startMin, Math.min(endMin, min));
  return ((clamped - startMin) / 60) * HOUR_PX;
}

interface TimedOrder {
  order: ManiobraOrder;
  startMin: number;
  endMin: number;
  tight: boolean;
}

// findConflicts() was deleted (user feedback): two clients receiving
// at the same hour isn't actually a conflict — the truck can hit
// either one in either order. The big red warning was noise. Lane
// stacking still handles the visual layout when windows overlap.

/** Classic interval-partitioning: assign each order to the lowest lane
 *  whose last-end is ≤ this order's start. New lane if none fit. */
function assignLanes(timed: TimedOrder[]): { laneByOrder: Map<string, number>; laneCount: number } {
  const sorted = [...timed].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const laneEnds: number[] = [];
  const laneByOrder = new Map<string, number>();
  for (const t of sorted) {
    let lane = laneEnds.findIndex((end) => end <= t.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(t.endMin);
    } else {
      laneEnds[lane] = t.endMin;
    }
    laneByOrder.set(t.order.order_id, lane);
  }
  return { laneByOrder, laneCount: laneEnds.length };
}

interface TimelineRow {
  key: string;
  label: string;
  icon: React.ReactNode;
  sublabel: string;
  timed: TimedOrder[];
  flex: ManiobraOrder[];
  truckColor: string;
}

/** Day stats — used by both AgendaTimelineView (single day) and
 *  AgendaWeekView (computed per day, then aggregated). Exported so
 *  the week aggregator can reuse the same shape. */
export interface DayStats {
  deliveries: number;
  pickups: number;
  withWindow: number;
  flex: number;
  tight: number;
  total: number;
}

export function computeDayStats(orders: ManiobraOrder[], pickupOrderIds: Set<string>): DayStats {
  let deliveries = 0, pickups = 0, withWindow = 0, flex = 0, tight = 0;
  for (const o of orders) {
    const isPickup = pickupOrderIds.has(o.order_id) || o.fulfillment_method === "pickup";
    if (isPickup) {
      pickups++;
      continue;
    }
    deliveries++;
    const a = hhmmToMinutes(o.delivery_window_from);
    const b = hhmmToMinutes(o.delivery_window_until);
    if (a != null && b != null) {
      withWindow++;
      if (b - a < TIGHT_THRESHOLD_MIN) tight++;
    } else {
      flex++;
    }
  }
  return { deliveries, pickups, withWindow, flex, tight, total: orders.length };
}

/* ─────────────────────────────────────────────────────────────────
 * AgendaTimelineView — single-day view (Maniobra default)
 * ───────────────────────────────────────────────────────────────── */
export function AgendaTimelineView({
  orders, assignedTrucks, pickupOrderIds, date, isLoading, onOrderClick,
}: Props) {
  const stats = useMemo(() => computeDayStats(orders, pickupOrderIds), [orders, pickupOrderIds]);

  return (
    <div className="space-y-5">
      <StatStrip stats={stats} loading={isLoading} />
      <AgendaDayBlock
        date={date}
        orders={orders}
        assignedTrucks={assignedTrucks}
        pickupOrderIds={pickupOrderIds}
        onOrderClick={onOrderClick}
        isLoading={isLoading}
        showLegend
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * AgendaDayBlock — timeline panel + pickup strip for ONE day. Reused
 * by AgendaWeekView which stacks 6 of these.
 * ───────────────────────────────────────────────────────────────── */
export function AgendaDayBlock({
  date, orders, assignedTrucks, pickupOrderIds, onOrderClick, isLoading,
  showLegend = false,
  highlight = false,
  compactHeader = false,
}: {
  date: Date;
  orders: ManiobraOrder[];
  assignedTrucks: AssignedTruck[];
  pickupOrderIds: Set<string>;
  onOrderClick?: (orderId: string) => void;
  isLoading: boolean;
  /** Show the color legend next to the date in the header (day view) */
  showLegend?: boolean;
  /** Highlight the day header (e.g. "today" in the week stack) */
  highlight?: boolean;
  /** Use a tighter header (for week stack) */
  compactHeader?: boolean;
}) {
  // Split orders into delivery vs pickup
  const { deliveryOrders, pickupOrders } = useMemo(() => {
    const dels: ManiobraOrder[] = [];
    const pks: ManiobraOrder[] = [];
    for (const o of orders) {
      if (pickupOrderIds.has(o.order_id) || o.fulfillment_method === "pickup") pks.push(o);
      else dels.push(o);
    }
    return { deliveryOrders: dels, pickupOrders: pks };
  }, [orders, pickupOrderIds]);

  // Build timeline rows: one per assigned truck, plus "Sin asignar"
  const rows = useMemo<TimelineRow[]>(() => {
    const orderById = new Map(deliveryOrders.map(o => [o.order_id, o]));
    const assignedSet = new Set<string>();

    const truckRows: TimelineRow[] = assignedTrucks.map((t) => {
      const truckOrders = t.order_ids
        .map(oid => orderById.get(oid))
        .filter(Boolean) as ManiobraOrder[];
      for (const o of truckOrders) assignedSet.add(o.order_id);
      return buildRow(t.id, t.label || t.transport_name, truckOrders, true);
    });

    const unassignedOrders = deliveryOrders.filter(o => !assignedSet.has(o.order_id));
    truckRows.push(buildRow("__unassigned__", "Sin asignar", unassignedOrders, false));

    return truckRows;
  }, [deliveryOrders, assignedTrucks]);

  const isEmpty = !isLoading && orders.length === 0;
  const totalDeliveries = deliveryOrders.length;

  return (
    <div className="space-y-3">
      {/* ── Timeline panel ── */}
      <div className={cn(
        "rounded-xl border bg-card overflow-hidden",
        highlight && "ring-2 ring-blue-500/30",
      )}>
        <div className={cn(
          "border-b flex items-center justify-between gap-2 flex-wrap",
          compactHeader ? "px-4 py-2" : "px-4 py-3",
        )}>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className={cn(
              "font-semibold uppercase tracking-wide text-muted-foreground",
              compactHeader ? "text-xs" : "text-sm",
            )}>
              {compactHeader
                ? <span className="capitalize">{date.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "short" })}</span>
                : "Línea de tiempo · 07:00 – 20:00"}
            </h2>
            {highlight && (
              <Badge variant="outline" className="bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40 text-[10px] py-0 px-1.5 font-semibold">
                Hoy
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {!compactHeader && (
              <span className="text-xs text-muted-foreground capitalize">
                {date.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}
              </span>
            )}
            {showLegend && <Legend />}
          </div>
        </div>

        <div className="overflow-x-auto">
          <div style={{ minWidth: GUTTER_W + TIMELINE_W + FLEX_W }}>
            <HourAxis />

            {isLoading ? (
              <div className="px-4 py-6 space-y-3" style={{ minHeight: 320 }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : isEmpty ? (
              <div className="flex flex-col items-center justify-center text-center px-6 py-12 text-muted-foreground" style={{ minHeight: compactHeader ? 160 : 320 }}>
                <CalendarClock className="h-10 w-10 opacity-30 mb-3" />
                <div className="font-medium text-sm">Sin pedidos</div>
              </div>
            ) : totalDeliveries === 0 ? (
              <div className="flex flex-col items-center justify-center text-center px-6 py-12 text-muted-foreground" style={{ minHeight: compactHeader ? 160 : 320 }}>
                <Hand className="h-10 w-10 opacity-30 mb-3" />
                <div className="font-medium text-sm">Sólo pickups este día</div>
              </div>
            ) : (
              <div>
                {rows.map((row) => (
                  <TimelineRowRender key={row.key} row={row} onOrderClick={onOrderClick} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Pickup strip ── */}
      {!isLoading && pickupOrders.length > 0 && (
        <PickupStrip orders={pickupOrders} onOrderClick={onOrderClick} />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * Sub-components
 * ───────────────────────────────────────────────────────────────── */

function StatStrip({ stats, loading }: { stats: DayStats; loading: boolean }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <Stat icon={<CalendarClock className="h-4 w-4 text-blue-500" />} label="Entregas" value={stats.deliveries} loading={loading} />
      <Stat
        icon={<Clock className="h-4 w-4 text-emerald-500" />}
        label="Con ventana"
        value={stats.withWindow}
        loading={loading}
        hint={stats.deliveries > 0 ? `${Math.round((stats.withWindow / stats.deliveries) * 100)}%` : null}
      />
      <Stat
        icon={<Clock className="h-4 w-4 text-amber-500" />}
        label="Sin horario (flex)"
        value={stats.flex}
        loading={loading}
        tone={stats.flex > 0 ? "amber" : undefined}
      />
      <Stat
        icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
        label="Ventana ajustada"
        value={stats.tight}
        loading={loading}
        tone={stats.tight > 0 ? "red" : undefined}
        hint="< 3h de margen"
      />
      <Stat icon={<Hand className="h-4 w-4 text-purple-500" />} label="Pickup" value={stats.pickups} loading={loading} />
    </div>
  );
}

/* ── Build one row ── */
function buildRow(
  key: string,
  label: string,
  orders: ManiobraOrder[],
  assigned: boolean,
): TimelineRow {
  const timed: TimedOrder[] = [];
  const flex: ManiobraOrder[] = [];
  for (const o of orders) {
    const a = hhmmToMinutes(o.delivery_window_from);
    const b = hhmmToMinutes(o.delivery_window_until);
    if (a != null && b != null && b > a) {
      timed.push({ order: o, startMin: a, endMin: b, tight: b - a < TIGHT_THRESHOLD_MIN });
    } else {
      flex.push(o);
    }
  }
  const totalBultos = orders.reduce((s, o) => s + o.total_bultos, 0);
  return {
    key,
    label,
    icon: assigned ? <Truck className="h-4 w-4" /> : <HelpCircle className="h-4 w-4" />,
    sublabel: `${orders.length} ${orders.length === 1 ? "pedido" : "pedidos"} · ${totalBultos} bultos`,
    timed,
    flex,
    truckColor: assigned ? "text-blue-600 dark:text-blue-400" : "text-amber-600 dark:text-amber-400",
  };
}

/* ── Hour axis header ── */
function HourAxis() {
  const ticks = Array.from({ length: HOURS + 1 }, (_, i) => START_HR + i);
  return (
    <div className="flex items-end border-b bg-muted/20" style={{ height: 32 }}>
      <div style={{ width: GUTTER_W }} className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold px-3 pb-1.5">
        Transporte
      </div>
      <div className="relative" style={{ width: TIMELINE_W, height: 32 }}>
        {ticks.map((h, i) => (
          <div
            key={h}
            className="absolute bottom-0 text-[10px] font-mono text-muted-foreground"
            style={{ left: i * HOUR_PX, transform: "translateX(-50%)" }}
          >
            {String(h).padStart(2, "0")}
          </div>
        ))}
      </div>
      <div style={{ width: FLEX_W }} className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold px-3 pb-1.5 border-l">
        Sin horario
      </div>
    </div>
  );
}

/* ── One row of the timeline ── */
function TimelineRowRender({
  row, onOrderClick,
}: { row: TimelineRow; onOrderClick?: (orderId: string) => void }) {
  const { laneByOrder, laneCount } = assignLanes(row.timed);
  const minRowH = BAR_H + 2 * ROW_PADDING_Y;
  const dynamicH = Math.max(minRowH, laneCount * BAR_H + Math.max(0, laneCount - 1) * LANE_GAP + 2 * ROW_PADDING_Y);
  const rowH = row.timed.length > 0 ? dynamicH : minRowH;

  return (
    <div
      className="flex items-stretch border-b last:border-b-0 transition-colors"
      style={{ minHeight: rowH }}
    >
      {/* Gutter */}
      <div
        style={{ width: GUTTER_W }}
        className="shrink-0 px-3 py-2 flex flex-col justify-center border-r"
      >
        <div className={cn("flex items-center gap-1.5 text-sm font-semibold", row.truckColor)}>
          {row.icon}
          <span className="truncate">{row.label}</span>
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          {row.sublabel}
        </div>
      </div>

      {/* Timeline area with vertical hour grid + positioned bars */}
      <div className="relative shrink-0" style={{ width: TIMELINE_W }}>
        {Array.from({ length: HOURS + 1 }, (_, i) => (
          <div
            key={i}
            className={cn("absolute top-0 bottom-0 border-l", i === 0 || i === HOURS ? "border-border" : "border-border/40")}
            style={{ left: i * HOUR_PX }}
            aria-hidden
          />
        ))}

        {row.timed.map(({ order, startMin, endMin, tight }) => {
          const left = minToOffsetPx(startMin);
          const right = minToOffsetPx(endMin);
          const width = Math.max(48, right - left);
          const lane = laneByOrder.get(order.order_id) ?? 0;
          const top = ROW_PADDING_Y + lane * (BAR_H + LANE_GAP);
          const fromHM = formatHHMM(order.delivery_window_from);
          const untilHM = formatHHMM(order.delivery_window_until);
          return (
            <button
              key={order.order_id}
              type="button"
              onClick={() => onOrderClick?.(order.order_id)}
              title={`${order.order_code} · ${order.client_name}\n${fromHM} – ${untilHM} · ${order.total_bultos} bultos${order.delivery_notes ? `\n${order.delivery_notes}` : ""}`}
              className={cn(
                "absolute rounded-md border-2 px-2 py-1 text-left overflow-hidden transition active:scale-[0.98] hover:shadow-md",
                tight
                  ? "bg-red-500/10 border-red-500/60 text-red-900 dark:text-red-200"
                  : "bg-blue-500/10 border-blue-500/50 text-blue-900 dark:text-blue-200",
              )}
              style={{ left, width, top, height: BAR_H }}
            >
              <div className="flex items-baseline gap-1.5 leading-tight">
                <span className="font-mono text-xs font-bold tabular-nums">{order.order_code}</span>
                {tight && (
                  <span className="text-[9px] font-bold uppercase tracking-wider text-red-700 dark:text-red-300">
                    ajustada
                  </span>
                )}
              </div>
              <div className="text-[10px] truncate opacity-80">
                {order.client_name}
              </div>
              <div className="text-[9px] font-mono tabular-nums opacity-60">
                {fromHM}–{untilHM} · {order.total_bultos}b
              </div>
            </button>
          );
        })}

        {row.timed.length === 0 && row.flex.length > 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] italic text-muted-foreground">
            sólo pedidos sin horario →
          </div>
        )}
        {row.timed.length === 0 && row.flex.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] italic text-muted-foreground/60">
            sin pedidos
          </div>
        )}
      </div>

      {/* Flex tail */}
      <div
        style={{ width: FLEX_W }}
        className="shrink-0 border-l px-2 py-2 flex flex-wrap gap-1 content-start"
      >
        {row.flex.length === 0 ? (
          <span className="text-[10px] italic text-muted-foreground/50 self-center">
            —
          </span>
        ) : (
          row.flex.map(o => (
            <button
              key={o.order_id}
              type="button"
              onClick={() => onOrderClick?.(o.order_id)}
              title={`${o.order_code} · ${o.client_name} · ${o.total_bultos} bultos\nSin horario capturado`}
              className="inline-flex items-center gap-1 rounded border border-dashed border-amber-500/40 bg-amber-500/5 px-1.5 py-0.5 text-[10px] font-mono text-amber-800 dark:text-amber-200 hover:bg-amber-500/15 transition active:scale-[0.97]"
            >
              <Clock className="h-2.5 w-2.5" />
              <span className="font-semibold">{o.order_code}</span>
              <span className="opacity-70 truncate max-w-[80px]">{o.client_name}</span>
              <span className="opacity-60 tabular-nums">·{o.total_bultos}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/* ── Pickup strip ── */
function PickupStrip({
  orders, onOrderClick,
}: { orders: ManiobraOrder[]; onOrderClick?: (orderId: string) => void }) {
  const totalBultos = orders.reduce((s, o) => s + o.total_bultos, 0);
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Hand className="h-4 w-4 text-purple-500" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Pickup · cliente recoge
          </h2>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {orders.length} {orders.length === 1 ? "pedido" : "pedidos"} · {totalBultos} bultos
        </span>
      </div>
      <div className="p-3 flex flex-wrap gap-2">
        {orders.map(o => {
          const fromHM = formatHHMM(o.delivery_window_from);
          const untilHM = formatHHMM(o.delivery_window_until);
          const hasWindow = fromHM !== "—" && untilHM !== "—";
          return (
            <button
              key={o.order_id}
              type="button"
              onClick={() => onOrderClick?.(o.order_id)}
              title={`${o.order_code} · ${o.client_name} · ${o.total_bultos} bultos${hasWindow ? `\nProgramado ${fromHM}–${untilHM}` : ""}${o.delivery_notes ? `\n${o.delivery_notes}` : ""}`}
              className="inline-flex items-center gap-2 rounded-lg border-2 border-purple-500/40 bg-purple-500/10 px-3 py-2 text-left text-purple-900 dark:text-purple-200 hover:bg-purple-500/15 transition active:scale-[0.97]"
            >
              <Hand className="h-3.5 w-3.5 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-xs font-bold tabular-nums">{o.order_code}</span>
                  {hasWindow && (
                    <span className="text-[10px] font-mono opacity-70 tabular-nums">
                      {fromHM}–{untilHM}
                    </span>
                  )}
                </div>
                <div className="text-[11px] truncate max-w-[180px] opacity-80">
                  {o.client_name}
                </div>
              </div>
              <span className="text-[10px] tabular-nums font-semibold opacity-70 shrink-0">
                ·{o.total_bultos}b
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Legend ── */
function Legend() {
  return (
    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
      <div className="flex items-center gap-1">
        <span className="w-2.5 h-2.5 rounded-sm bg-blue-500/20 border-2 border-blue-500/60" aria-hidden />
        <span>Normal</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="w-2.5 h-2.5 rounded-sm bg-red-500/20 border-2 border-red-500/60" aria-hidden />
        <span>Ajustada (&lt;3h)</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/10 border border-dashed border-amber-500/60" aria-hidden />
        <span>Sin horario</span>
      </div>
    </div>
  );
}

/** "HH:MM:SS" or "HH:MM" or null → "HH:MM" or "—" */
function formatHHMM(t: string | null | undefined): string {
  if (!t) return "—";
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t));
  if (!m) return "—";
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/* ── Stat card ── */
function Stat({
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
