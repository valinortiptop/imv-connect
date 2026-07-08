// @ts-nocheck
/**
 * OrdersToFulfillPanel
 *
 * Renders the "Órdenes por surtir" block on /almacen. Picks a single
 * day at a time (Maniobra-style chevron / calendar header) so the
 * worker isn't overwhelmed by everything-at-once. Three quick filter
 * chips switch between Hoy / Mañana / Todos (next 7 days).
 *
 * Each row shows:
 *   • order_code · client · delivery day chip
 *   • fulfillment method (Reparto / Pickup) + urgency chip
 *   • progress: X de Y bultos surtidos, with a small bar
 *   • single CTA on the right that flips between "Surtir" / "Despachar"
 *     / "Entregar" based on remaining qty + fulfillment method
 *
 * Brand: chevron-left / calendar popover / chevron-right pattern
 * borrowed from the Maniobra page (same Popover + Calendar component
 * the user already knows). Fixed row heights so the panel doesn't
 * dance as picks resolve.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ClipboardList,
  Truck,
  Package,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  Hand,
  Calendar as CalendarIcon,
  CheckCircle2,
} from "lucide-react";
import { format, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { DeliveryWindowChip } from "@/components/clients/DeliveryWindowChip";

export interface OrderToFulfill {
  id: string;
  order_code: string;
  client_id: string;
  client_name: string | null;
  delivery_date: string | null;
  status: string;
  fulfillment_method: string | null;
  urgency: boolean;
  total_bultos_needed: number;
  total_bultos_in_embarque: number;
  item_count: number;
  delivery_offset_days: number;
  delivery_window_from?: string | null;
  delivery_window_until?: string | null;
  delivery_notes?: string | null;
}

interface Props {
  onSelectOrder: (order: OrderToFulfill) => void;
  /** When true, suspends interaction (used during time-travel mode on
   *  /almacen). The panel still renders so the worker sees pending
   *  work but the action buttons grey out. */
  readOnly?: boolean;
}

type ViewMode = "today" | "tomorrow" | "all";

function fmtDayLabel(d: Date): string {
  // "Miércoles 14 de Mayo"
  const raw = format(d, "EEEE d 'de' MMMM", { locale: es });
  return raw.replace(/(^|\s)([a-záéíóúñ])/g, (_, b: string, c: string) => b + c.toUpperCase());
}

function dayChip(offset: number, deliveryDate: string | null): {
  label: string;
  chip: string;
} {
  if (deliveryDate == null) return { label: "Sin fecha", chip: "bg-gray-500/15 text-gray-600 border-gray-500/30" };
  if (offset < 0) return { label: `Vencida ${Math.abs(offset)} d`, chip: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40" };
  if (offset === 0) return { label: "Hoy", chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40" };
  if (offset === 1) return { label: "Mañana", chip: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40" };
  return { label: `En ${offset} d`, chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40" };
}

export function OrdersToFulfillPanel({
  onSelectOrder, readOnly,
}: Props) {
  // View mode determines what to show. "today" filters to delivery
  // date = today + overdue; "tomorrow" = exactly tomorrow; "all"
  // shows everything within the 7-day horizon.
  const [view, setView] = useState<ViewMode>("today");
  // Date for the calendar popover. Defaults to today. Changing it
  // switches view to "specific" without an explicit chip.
  const [specificDate, setSpecificDate] = useState<Date | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Always fetch a 30-day horizon so chevrons + the picker can jump
  // around without re-fetching, and pedidos scheduled a couple of
  // weeks out still show up. The RPC already orders by
  // delivery_date so we trust its sequencing.
  const HORIZON_DAYS = 30;
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders-to-fulfill", HORIZON_DAYS],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("list_orders_to_fulfill", {
        p_horizon_days: HORIZON_DAYS,
      });
      if (error) throw error;
      return (data ?? []) as OrderToFulfill[];
    },
    refetchInterval: 60 * 1000,
    staleTime: 30 * 1000,
  });

  // Map the view + specific date into a filter predicate. Returns
  // either a target offset (0=today, 1=tomorrow, etc.) OR null for
  // "show everything in horizon".
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const targetDate: Date | null = useMemo(() => {
    if (specificDate) return specificDate;
    if (view === "today") return today;
    if (view === "tomorrow") return addDays(today, 1);
    return null;
  }, [view, specificDate, today]);

  // Offset of targetDate from today (negative = past, positive = future)
  const targetOffset = useMemo(() => {
    if (!targetDate) return null;
    return Math.round((targetDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  }, [targetDate, today]);

  const visibleOrders = useMemo(() => {
    if (targetOffset == null) return orders;
    // For the "today" view, also include overdue orders so the worker
    // doesn't lose track of them. For other days, only that exact day.
    if (targetOffset === 0) {
      return orders.filter((o) => o.delivery_offset_days <= 0);
    }
    return orders.filter((o) => o.delivery_offset_days === targetOffset);
  }, [orders, targetOffset]);

  const totals = useMemo(() => {
    const today = visibleOrders.filter((o) => o.delivery_offset_days === 0).length;
    const overdue = visibleOrders.filter((o) => o.delivery_offset_days < 0 && o.delivery_date).length;
    const pickup = visibleOrders.filter((o) => o.fulfillment_method === "pickup").length;
    const needed = visibleOrders.reduce((s, o) => s + o.total_bultos_needed, 0);
    const picked = visibleOrders.reduce((s, o) => s + o.total_bultos_in_embarque, 0);
    return { today, overdue, pickup, needed, picked };
  }, [visibleOrders]);

  const goDay = (delta: number) => {
    const base = specificDate ?? targetDate ?? today;
    const next = addDays(base, delta);
    setSpecificDate(next);
    setView("all"); // mark we're in specific-date mode
  };

  const headerLabel = useMemo(() => {
    if (view === "all" && !specificDate) return "Todos · próximos 7 días";
    if (targetDate) return fmtDayLabel(targetDate);
    return "Selecciona un día";
  }, [view, specificDate, targetDate]);

  return (
    <section className="rounded-xl border bg-card">
      {/* Header row 1: title + global counts */}
      <div className="px-4 py-3 border-b flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 mr-auto">
          <ClipboardList className="h-4 w-4 text-blue-500" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
            Órdenes por surtir
          </h2>
          <Badge variant="outline" className="text-[10px] py-0 px-1.5">
            {visibleOrders.length} de {orders.length}
          </Badge>
        </div>
        {totals.overdue > 0 && (
          <Chip kind="red" icon={<AlertTriangle className="h-3 w-3" />}>
            {totals.overdue} vencida{totals.overdue === 1 ? "" : "s"}
          </Chip>
        )}
        {totals.pickup > 0 && (
          <Chip kind="purple" icon={<Hand className="h-3 w-3" />}>
            Pickup <span className="font-bold tabular-nums ml-1">{totals.pickup}</span>
          </Chip>
        )}
        <Chip kind="muted">
          <span className="tabular-nums">
            {totals.picked.toLocaleString("es-MX")}/{totals.needed.toLocaleString("es-MX")} bultos
          </span>
        </Chip>
      </div>

      {/* Header row 2: day picker chevrons + filter chips. Mirrors the
          Maniobra header pattern so the operator finds the controls
          where they expect. */}
      <div className="px-4 py-3 border-b flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => goDay(-1)}
            disabled={readOnly}
            title="Día anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 min-w-[240px] h-9">
                <CalendarIcon className="h-4 w-4" />
                <span className="capitalize">{headerLabel}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={specificDate ?? targetDate ?? undefined}
                onSelect={(d) => {
                  if (d) {
                    setSpecificDate(d);
                    setView("all");
                    setCalendarOpen(false);
                  }
                }}
                locale={es}
              />
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => goDay(1)}
            disabled={readOnly}
            title="Día siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Quick filter chips — reset specificDate when chosen */}
        <div className="flex items-center gap-1.5 ml-2 flex-wrap">
          <FilterChip
            active={view === "today" && !specificDate}
            onClick={() => { setView("today"); setSpecificDate(null); }}
          >
            Hoy
          </FilterChip>
          <FilterChip
            active={view === "tomorrow" && !specificDate}
            onClick={() => { setView("tomorrow"); setSpecificDate(null); }}
          >
            Mañana
          </FilterChip>
          <FilterChip
            active={view === "all" && !specificDate}
            onClick={() => { setView("all"); setSpecificDate(null); }}
          >
            Todos (7 días)
          </FilterChip>
        </div>
      </div>

      <div className="divide-y">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-4 py-3">
              <Skeleton className="h-14 w-full" />
            </div>
          ))
        ) : visibleOrders.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground italic flex flex-col items-center gap-2">
            <CheckCircle2 className="h-8 w-8 opacity-40 text-emerald-500" />
            No hay órdenes por surtir para {headerLabel.toLowerCase()}
          </div>
        ) : (
          visibleOrders.map((o) => {
            const pct = o.total_bultos_needed > 0
              ? Math.min(100, Math.round((o.total_bultos_in_embarque / o.total_bultos_needed) * 100))
              : 0;
            const remaining = Math.max(0, o.total_bultos_needed - o.total_bultos_in_embarque);
            const day = dayChip(o.delivery_offset_days, o.delivery_date);
            const isPickup = o.fulfillment_method === "pickup";
            const fullyPicked = remaining === 0 && o.total_bultos_needed > 0;
            const ctaText = fullyPicked
              ? isPickup ? "Entregar" : "Despachar"
              : "Surtir";
            const ctaClass = fullyPicked
              ? isPickup
                ? "bg-purple-500 hover:bg-purple-600 text-white"
                : "bg-emerald-500 hover:bg-emerald-600 text-white"
              : "";
            return (
              <div
                key={o.id}
                className="px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-sm">{o.order_code}</span>
                    <Badge variant="outline" className={cn("text-[10px] py-0 px-1.5", day.chip)}>
                      <CalendarIcon className="h-2.5 w-2.5 mr-1" />
                      {day.label}
                    </Badge>
                    {isPickup ? (
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/40">
                        <Hand className="h-2.5 w-2.5 mr-1" />
                        Pickup
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/40">
                        <Truck className="h-2.5 w-2.5 mr-1" />
                        Reparto
                      </Badge>
                    )}
                    <DeliveryWindowChip
                      from={o.delivery_window_from}
                      until={o.delivery_window_until}
                      notes={o.delivery_notes}
                      isPickup={isPickup}
                    />
                    {o.urgency && (
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40">
                        Urgente
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                      {o.status}
                    </Badge>
                  </div>
                  <div className="text-sm font-medium leading-tight truncate mt-0.5">
                    {o.client_name ?? "—"}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5">
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden max-w-[280px]">
                      <div
                        className={cn(
                          "h-full transition-all",
                          fullyPicked
                            ? "bg-emerald-500"
                            : pct >= 50
                              ? "bg-blue-500"
                              : "bg-amber-500",
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="text-[11px] tabular-nums text-muted-foreground shrink-0">
                      <span className="font-semibold text-foreground">
                        {o.total_bultos_in_embarque.toLocaleString("es-MX")}
                      </span>
                      /{o.total_bultos_needed.toLocaleString("es-MX")} bultos
                      {remaining > 0 && (
                        <span className="ml-2 text-red-600 dark:text-red-400 font-semibold">
                          · {remaining.toLocaleString("es-MX")} faltante{remaining === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => onSelectOrder(o)}
                  disabled={readOnly}
                  className={cn("gap-1 shrink-0", ctaClass)}
                >
                  <Package className="h-3.5 w-3.5" />
                  {ctaText}
                  <ChevronRight className="h-3.5 w-3.5 -mr-1" />
                </Button>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function Chip({
  kind, icon, children,
}: {
  kind: "emerald" | "blue" | "amber" | "red" | "purple" | "muted";
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const cls = {
    emerald: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
    blue:    "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40",
    amber:   "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
    red:     "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40",
    purple:  "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/40",
    muted:   "bg-muted/40 text-muted-foreground border-border",
  }[kind];
  return (
    <Badge variant="outline" className={cn("text-[10px] py-0.5 px-2 gap-1", cls)}>
      {icon}
      {children}
    </Badge>
  );
}

function FilterChip({
  active, onClick, children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition active:scale-[0.97]",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "border-border text-muted-foreground hover:bg-muted/30",
      )}
    >
      {children}
    </button>
  );
}
