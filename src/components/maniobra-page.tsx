// @ts-nocheck
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Link } from "@/lib/router-compat";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PickingDialog } from "@/components/maniobra/PickingDialog";
import { AgendaTimelineView } from "@/components/maniobra/AgendaTimelineView";
import { AgendaWeekView, type WeekDayData } from "@/components/maniobra/AgendaWeekView";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import {
  CalendarIcon, Download, Truck, Car, Package, ArrowDown, ArrowRight,
  Warehouse, AlertTriangle, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Plus, X, Wand2, Settings2, Trash2, HandHelping, Link as LinkIcon, Copy, Printer, Eye, KeyRound,
  ShieldCheck,
} from "lucide-react";
import { ManiobraAccessPanel } from "@/components/maniobra/ManiobraAccessPanel";
import { DeliveryWindowChip } from "@/components/clients/DeliveryWindowChip";
import { QRCodeSVG } from "qrcode.react";
import { format, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { DescargaImageCard } from "@/components/maniobra/DescargaImageCard";
import { CargaImageCard } from "@/components/maniobra/CargaImageCard";
import ManiobraPortal from "@/components/maniobra-portal-page";
import { useAuth } from "@/hooks/use-auth";
import { ProductThumb } from "@/components/ui/product-thumb";

/* ── Helpers ── */

function dateToString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Get next business day (skip Sat/Sun) */
/** Monday of the ISO week containing `date`. Used to anchor the
 *  agenda's "Semana" view so Mon→Sat always aligns with calendar
 *  weeks, regardless of which day the user has selected. */
function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const dow = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const delta = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + delta);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Six working days (Mon → Sat) starting from `monday`. */
function getWeekDays(monday: Date): Date[] {
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function getNextBusinessDay(): Date {
  const now = new Date();
  const day = now.getDay();
  if (day === 6) return addDays(now, 2); // Saturday → Monday
  if (day === 0) return addDays(now, 1); // Sunday → Monday
  return now;
}

/** Move to next/prev day, skipping weekends */
function shiftBusinessDay(d: Date, direction: 1 | -1): Date {
  let next = addDays(d, direction);
  while (next.getDay() === 0 || next.getDay() === 6) {
    next = addDays(next, direction);
  }
  return next;
}

const STORAGE_KEY = "maniobra-state";

/** Pick icon based on transport name */
function TransportIcon({ name, className }: { name: string; className?: string }) {
  const lower = name.toLowerCase();
  if (lower.includes("camioneta") || lower.includes("van")) return <Car className={className} />;
  return <Truck className={className} />;
}

/* ── Types ── */

export interface ManiobraProduct {
  product_id: string;
  product_name: string;
  product_clave: string;
  image_url: string | null;
  quantity: number;
}

export interface ManiobraOrderItem extends ManiobraProduct {}

export interface ManiobraOrder {
  order_id: string;
  order_code: string;
  client_name: string;
  client_address: string;
  total_bultos: number;
  items: ManiobraOrderItem[];
  /** Pre-existing token for /entrega/<token>. Null if no one has
   *  generated a delivery link for this order yet. The "Órdenes a
   *  entregar" list lazy-mints one when the user clicks 👁 / 📋. */
  signature_token: string | null;
  /** Recepción window from the client profile. NULL when never
   *  captured — the UI renders a "Sin horario" warning chip. */
  delivery_window_from?: string | null;
  delivery_window_until?: string | null;
  delivery_notes?: string | null;
  fulfillment_method?: string | null;
}

export interface AssignedTruck {
  id: string;
  transport_name: string;
  capacity_bultos: number;
  label: string;
  order_ids: string[];
}

export interface ManiobraDescarga {
  delivery_id: string;
  delivery_code: string;
  total_bultos: number;
  items: (ManiobraProduct & { destination: "warehouse" | string })[];
}

interface TransportType {
  id: string;
  name: string;
  capacity_bultos: number;
}

interface SavedState {
  trucks: AssignedTruck[];
  pickupOrderIds: string[];
}

/* ── Component ── */

export default function Maniobra() {
  const { lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // Maniobra page nav. Was Plan/Live; now also Pedidos (ops view of
  // orders without prices, with status change) and Directorio (read-only
  // client contacts). Lets warehouse_mgr (Rodrigo Bautista) live entirely
  // inside this page for his daily work without exposing /pedidos
  // (price-sensitive) or /clients (sales totals).
  const [mode, setMode] = useState<"plan" | "live" | "pedidos" | "directorio" | "agenda">("plan");
  // Agenda has its own internal Día/Semana switch. Defaults to Día so
  // single-day users aren't surprised by a 6-block stack on first load.
  const [agendaRange, setAgendaRange] = useState<"day" | "week">("day");
  const [selectedDate, setSelectedDate] = useState<Date>(getNextBusinessDay);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [assignedTrucks, setAssignedTrucks] = useState<AssignedTruck[]>([]);
  const [pickupOrderIds, setPickupOrderIds] = useState<Set<string>>(new Set());
  const [showTransports, setShowTransports] = useState(false);
  // Toggles the Acceso al portal panel that holds the daily-rotating
  // gate PIN, trusted-device manager, and the relocated Abrir /
  // Compartir portal quick actions. Defaults closed so the page looks
  // identical to before for users who don't open it.
  const [showAccessPanel, setShowAccessPanel] = useState(false);
  const [newTransportName, setNewTransportName] = useState("");
  const [newTransportCapacity, setNewTransportCapacity] = useState("");
  const [customTruckName, setCustomTruckName] = useState("");
  const [customTruckCapacity, setCustomTruckCapacity] = useState("");
  const [showCustomDialog, setShowCustomDialog] = useState(false);
  const [portalDialogOpen, setPortalDialogOpen] = useState(false);

  const dateStr = dateToString(selectedDate);

  // ── Persistence: load from DB (with localStorage fallback for offline) ──
  // The DB row is the source of truth so the public portal can render the
  // same plan. localStorage stays as a write-through cache and a fallback
  // when the network blips during edits.
  //
  // ⚠ Race-condition guard:
  //   When the user navigates from one date to another, BOTH effects below
  //   fire on the same render — load and save. The save effect captures a
  //   stale `planLoaded=true` (from the previous date) along with stale
  //   `assignedTrucks` (also previous date), and would happily upsert
  //   them into the NEW date's row before the load finished. That's how
  //   Wed (2026-05-06) got clobbered with `trucks: []`.
  //
  //   Fix: track which date the local state actually belongs to via a
  //   ref. The save effect only runs when ref === current dateStr; the
  //   load effect sets the ref AFTER the fetch completes. The narrow
  //   window where dateStr has changed but state still belongs to the
  //   previous date is now correctly skipped.
  const [planLoaded, setPlanLoaded] = useState(false);
  const stateForDateRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setPlanLoaded(false);
    // Drop the ref proactively so any save fired in the small window
    // between this effect starting and the fetch completing is bailed.
    stateForDateRef.current = null;
    const targetDate = dateStr;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("maniobra_plans")
          .select("trucks, pickup_order_ids")
          .eq("plan_date", targetDate)
          .maybeSingle();
        if (cancelled) return;
        if (!error && data) {
          setAssignedTrucks((data.trucks as any) ?? []);
          setPickupOrderIds(new Set((data.pickup_order_ids as any) ?? []));
        } else {
          // Fallback to localStorage if the row is missing.
          const raw = localStorage.getItem(`${STORAGE_KEY}-${targetDate}`);
          if (raw) {
            const saved: SavedState = JSON.parse(raw);
            setAssignedTrucks(saved.trucks ?? []);
            setPickupOrderIds(new Set(saved.pickupOrderIds ?? []));
          } else {
            setAssignedTrucks([]);
            setPickupOrderIds(new Set());
          }
        }
      } catch {
        setAssignedTrucks([]);
        setPickupOrderIds(new Set());
      } finally {
        if (!cancelled) {
          stateForDateRef.current = targetDate;
          setPlanLoaded(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [dateStr]);

  // ── Persistence: write-through to DB + localStorage ──
  useEffect(() => {
    if (!planLoaded) return; // initial load hasn't landed yet
    // The current local state belongs to whichever date stateForDateRef
    // points at. If that's not the date we're about to save TO, the user
    // just navigated and the load hasn't finished — skip this save so we
    // don't clobber the new date with the previous date's plan.
    if (stateForDateRef.current !== dateStr) return;
    const state: SavedState = { trucks: assignedTrucks, pickupOrderIds: [...pickupOrderIds] };
    localStorage.setItem(`${STORAGE_KEY}-${dateStr}`, JSON.stringify(state));
    // Debounce DB writes so rapid edits coalesce.
    const t = setTimeout(() => {
      supabase
        .from("maniobra_plans")
        .upsert(
          {
            plan_date: dateStr,
            trucks: state.trucks as any,
            pickup_order_ids: state.pickupOrderIds as any,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "plan_date" },
        )
        .then(({ error }) => {
          if (error) console.warn("maniobra plan persist failed", error);
        });
    }, 600);
    return () => clearTimeout(t);
  }, [assignedTrucks, pickupOrderIds, dateStr, planLoaded]);

  // ── Day navigation ──
  const goDay = (dir: 1 | -1) => setSelectedDate((d) => shiftBusinessDay(d, dir));

  // ── Fetch transport types ──
  const { data: transportTypes = [] } = useQuery({
    queryKey: ["transport-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transport_types")
        .select("*")
        .order("capacity_bultos", { ascending: true });
      if (error) throw error;
      return data as TransportType[];
    },
  });

  // ── Fetch orders for this date ──
  const ACTIVE_STATUSES = ["Nuevo", "Confirmado", "En preparacion"];
  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["maniobra-orders", dateStr],
    queryFn: async () => {
      const { data: rawOrders, error: ordErr } = await (supabase as any)
        .from("orders")
        .select("id, order_code, delivery_date, status, client_id, signature_token, fulfillment_method, clients(name, address, delivery_window_from, delivery_window_until, delivery_notes)")
        .eq("delivery_date", dateStr)
        .in("status", ACTIVE_STATUSES)
        .order("order_code", { ascending: true });
      if (ordErr) throw ordErr;
      if (!rawOrders?.length) return [];

      const orderIds = rawOrders.map((o) => o.id);
      const { data: items, error: itemErr } = await supabase
        .from("order_items")
        .select("order_id, product_id, quantity, products(id, clave, name, image_url)")
        .in("order_id", orderIds);
      if (itemErr) throw itemErr;

      const itemsByOrder = new Map<string, typeof items>();
      for (const item of items ?? []) {
        const arr = itemsByOrder.get(item.order_id) ?? [];
        arr.push(item);
        itemsByOrder.set(item.order_id, arr);
      }

      return rawOrders.map((o: any): ManiobraOrder => {
        const orderItems = (itemsByOrder.get(o.id) ?? []).map((i: any) => ({
          product_id: i.products?.id ?? i.product_id,
          product_name: i.products?.name ?? "",
          product_clave: i.products?.clave ?? "",
          image_url: i.products?.image_url ?? null,
          quantity: Number(i.quantity) || 0,
        }));
        return {
          order_id: o.id,
          order_code: o.order_code,
          client_name: (o.clients as any)?.name ?? "Sin cliente",
          client_address: (o.clients as any)?.address ?? "",
          delivery_window_from:  (o.clients as any)?.delivery_window_from  ?? null,
          delivery_window_until: (o.clients as any)?.delivery_window_until ?? null,
          delivery_notes:        (o.clients as any)?.delivery_notes        ?? null,
          fulfillment_method:    o.fulfillment_method ?? null,
          total_bultos: orderItems.reduce((s, i) => s + i.quantity, 0),
          items: orderItems,
          signature_token: o.signature_token ?? null,
        };
      });
    },
  });

  // ── Agenda week view — fetch 6 working days at once ──
  // Only fires when the Agenda tab is in "Semana" mode. We pull all
  // orders for the Mon→Sat range, plus the maniobra_plans for those
  // dates (so each day gets its own truck assignments + pickup set).
  // Client-side, we group everything by delivery_date into WeekDayData[].
  const weekStart = useMemo(() => getMondayOf(selectedDate), [selectedDate]);
  const weekDates = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const weekStartStr = dateToString(weekStart);
  const weekEndStr = dateToString(weekDates[weekDates.length - 1]);
  const weekEnabled = mode === "agenda" && agendaRange === "week";

  const { data: weekOrders = [], isLoading: weekOrdersLoading } = useQuery({
    queryKey: ["maniobra-week-orders", weekStartStr, weekEndStr],
    enabled: weekEnabled,
    queryFn: async () => {
      const { data: rawOrders, error: ordErr } = await (supabase as any)
        .from("orders")
        .select("id, order_code, delivery_date, status, client_id, signature_token, fulfillment_method, clients(name, address, delivery_window_from, delivery_window_until, delivery_notes)")
        .gte("delivery_date", weekStartStr)
        .lte("delivery_date", weekEndStr)
        .in("status", ACTIVE_STATUSES)
        .order("delivery_date", { ascending: true })
        .order("order_code", { ascending: true });
      if (ordErr) throw ordErr;
      if (!rawOrders?.length) return [] as Array<ManiobraOrder & { delivery_date: string }>;

      const orderIds = rawOrders.map((o) => o.id);
      const { data: items, error: itemErr } = await supabase
        .from("order_items")
        .select("order_id, product_id, quantity, products(id, clave, name, image_url)")
        .in("order_id", orderIds);
      if (itemErr) throw itemErr;
      const itemsByOrder = new Map<string, typeof items>();
      for (const item of items ?? []) {
        const arr = itemsByOrder.get(item.order_id) ?? [];
        arr.push(item);
        itemsByOrder.set(item.order_id, arr);
      }

      return rawOrders.map((o: any) => {
        const orderItems = (itemsByOrder.get(o.id) ?? []).map((i: any) => ({
          product_id: i.products?.id ?? i.product_id,
          product_name: i.products?.name ?? "",
          product_clave: i.products?.clave ?? "",
          image_url: i.products?.image_url ?? null,
          quantity: Number(i.quantity) || 0,
        }));
        return {
          order_id: o.id,
          order_code: o.order_code,
          client_name: (o.clients as any)?.name ?? "Sin cliente",
          client_address: (o.clients as any)?.address ?? "",
          delivery_window_from: (o.clients as any)?.delivery_window_from ?? null,
          delivery_window_until: (o.clients as any)?.delivery_window_until ?? null,
          delivery_notes: (o.clients as any)?.delivery_notes ?? null,
          fulfillment_method: o.fulfillment_method ?? null,
          total_bultos: orderItems.reduce((s, i) => s + i.quantity, 0),
          items: orderItems,
          signature_token: o.signature_token ?? null,
          delivery_date: o.delivery_date,
        };
      });
    },
  });

  const { data: weekPlans = [], isLoading: weekPlansLoading } = useQuery({
    queryKey: ["maniobra-week-plans", weekStartStr, weekEndStr],
    enabled: weekEnabled,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("maniobra_plans")
        .select("plan_date, trucks, pickup_order_ids")
        .gte("plan_date", weekStartStr)
        .lte("plan_date", weekEndStr);
      if (error) throw error;
      return (data ?? []) as Array<{ plan_date: string; trucks: AssignedTruck[]; pickup_order_ids: string[] }>;
    },
  });

  // Group week orders + plans into one bucket per day so AgendaWeekView
  // can render them as 6 stacked AgendaDayBlocks.
  const weekDayData = useMemo<WeekDayData[]>(() => {
    const todayStr = dateToString(new Date());
    const ordersByDate = new Map<string, ManiobraOrder[]>();
    for (const o of weekOrders) {
      const arr = ordersByDate.get(o.delivery_date) ?? [];
      arr.push(o);
      ordersByDate.set(o.delivery_date, arr);
    }
    const plansByDate = new Map<string, { trucks: AssignedTruck[]; pickup_order_ids: string[] }>();
    for (const p of weekPlans) {
      plansByDate.set(p.plan_date, { trucks: p.trucks ?? [], pickup_order_ids: p.pickup_order_ids ?? [] });
    }
    return weekDates.map((d) => {
      const ds = dateToString(d);
      const plan = plansByDate.get(ds);
      return {
        date: d,
        dateStr: ds,
        isToday: ds === todayStr,
        orders: ordersByDate.get(ds) ?? [],
        assignedTrucks: plan?.trucks ?? [],
        pickupOrderIds: new Set(plan?.pickup_order_ids ?? []),
      };
    });
  }, [weekOrders, weekPlans, weekDates]);

  const weekIsLoading = weekOrdersLoading || weekPlansLoading;

  // Stops per order (for the truck-card "Ruta" Maps button + future
  // multi-stop UX). Keyed by order_id, sorted by stop_index.
  const { data: orderStopsByOrder = new Map<string, Array<{ address: string; manual_maps_url: string | null }>>() } = useQuery({
    queryKey: ["maniobra-order-stops", dateStr, orders.length],
    enabled: orders.length > 0,
    queryFn: async () => {
      const ids = orders.map((o) => o.order_id);
      if (ids.length === 0) return new Map();
      const { data, error } = await (supabase as any)
        .from("order_stops")
        .select("order_id, stop_index, address, manual_maps_url")
        .in("order_id", ids)
        .order("stop_index");
      if (error) throw error;
      const map = new Map<string, Array<{ address: string; manual_maps_url: string | null }>>();
      for (const row of data ?? []) {
        const arr = map.get(row.order_id) ?? [];
        arr.push({ address: row.address, manual_maps_url: row.manual_maps_url });
        map.set(row.order_id, arr);
      }
      return map;
    },
  });

  // ── Fetch current stock for shortage detection (real inventory system) ──
  const allProductIds = useMemo(() => {
    const ids = new Set<string>();
    for (const o of orders) for (const i of o.items) ids.add(i.product_id);
    return [...ids];
  }, [orders]);

  const { data: stockMap = new Map<string, { actual: number; disponible: number; incoming: number }>() } = useQuery({
    queryKey: ["maniobra-stock", allProductIds],
    enabled: allProductIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_products_with_stock")
        .select("id, stock_actual, stock_disponible, stock_incoming")
        .in("id", allProductIds);
      if (error) throw error;
      const map = new Map<string, { actual: number; disponible: number; incoming: number }>();
      for (const row of data ?? []) {
        if (row.id) map.set(row.id, {
          actual: Number(row.stock_actual) || 0,
          disponible: Number(row.stock_disponible) || 0,
          incoming: Number(row.stock_incoming) || 0,
        });
      }
      return map;
    },
  });

  // ── Fetch incoming stock deliveries for this date ──
  const { data: rawDeliveries = [], isLoading: deliveriesLoading } = useQuery({
    queryKey: ["maniobra-deliveries", dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_deliveries")
        .select("id, delivery_code, delivery_date")
        .eq("delivery_date", dateStr);
      if (error) throw error;
      return data ?? [];
    },
  });

  const deliveryIds = rawDeliveries.map((d) => d.id);
  const { data: rawEntryItems = [], isLoading: entriesLoading } = useQuery({
    queryKey: ["maniobra-entry-items", deliveryIds],
    enabled: deliveryIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_entries")
        .select("delivery_id, product_id, quantity, products(id, clave, name, image_url)")
        .in("delivery_id", deliveryIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Incoming quantities by product ──
  const incomingByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of rawEntryItems) {
      const pid = (e.products as any)?.id ?? e.product_id;
      map.set(pid, (map.get(pid) ?? 0) + (Number(e.quantity) || 0));
    }
    return map;
  }, [rawEntryItems]);

  // ── Shortage detection: stock_disponible from v_products_with_stock ──
  // stock_disponible = stock_actual - stock_committed (all active orders)
  // If negative, we're globally short of that product
  const shortageMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const [pid] of new Set(orders.flatMap((o) => o.items.map((i) => i.product_id)))) {
      const stock = stockMap.get(pid);
      if (!stock) {
        // Product not found in stock view — treat as fully missing
        const needed = orders.reduce((sum, o) => sum + o.items.filter((i) => i.product_id === pid).reduce((s, i) => s + i.quantity, 0), 0);
        if (needed > 0) map.set(pid, needed);
        continue;
      }
      // stock_disponible is already stock_actual minus ALL committed orders
      // If negative, that's how many bultos we're short globally
      if (stock.disponible < 0) {
        map.set(pid, Math.abs(stock.disponible));
      }
    }
    return map;
  }, [orders, stockMap]);

  // ── Derived: which orders are unassigned (not in any truck AND not pickup) ──
  const assignedOrderIds = useMemo(() => {
    const set = new Set<string>();
    for (const truck of assignedTrucks) for (const oid of truck.order_ids) set.add(oid);
    return set;
  }, [assignedTrucks]);

  const unassignedOrders = useMemo(
    () => orders.filter((o) => !assignedOrderIds.has(o.order_id) && !pickupOrderIds.has(o.order_id)),
    [orders, assignedOrderIds, pickupOrderIds]
  );

  const pickupOrders = useMemo(
    () => orders.filter((o) => pickupOrderIds.has(o.order_id)),
    [orders, pickupOrderIds]
  );

  // ── "Órdenes a entregar" rows ──
  // Flat list of every order being delivered today, with the truck (or
  // "Sin asignar" / "Pickup") it's slotted into. Rendered above the
  // truck cards as the per-order action surface — same eye/copy/download
  // icons as the Pedidos table. Order: unassigned first (so missing
  // assignments are loud), then by the truck's index in assignedTrucks
  // (matches the loading sequence below), then pickup last.
  const deliveryRows = useMemo(() => {
    const truckIndexById = new Map<string, number>();
    assignedTrucks.forEach((t, i) => truckIndexById.set(t.id, i));

    const orderTruck = new Map<string, { label: string; truckIdx: number }>();
    for (const t of assignedTrucks) {
      for (const oid of t.order_ids) {
        orderTruck.set(oid, { label: t.label, truckIdx: truckIndexById.get(t.id) ?? 999 });
      }
    }

    type Row = {
      order: ManiobraOrder;
      kind: "unassigned" | "truck" | "pickup";
      truckLabel: string | null;
      sortKey: number;
    };
    const rows: Row[] = orders.map((o) => {
      if (pickupOrderIds.has(o.order_id)) {
        return { order: o, kind: "pickup", truckLabel: null, sortKey: 9999 };
      }
      const t = orderTruck.get(o.order_id);
      if (t) {
        // truck rows: ordered by truck index (1000 + idx) so they sit
        // between unassigned (0–999) and pickup (9999)
        return { order: o, kind: "truck", truckLabel: t.label, sortKey: 1000 + t.truckIdx };
      }
      return { order: o, kind: "unassigned", truckLabel: null, sortKey: 0 };
    });
    rows.sort((a, b) => a.sortKey - b.sortKey || a.order.order_code.localeCompare(b.order.order_code));
    return rows;
  }, [orders, assignedTrucks, pickupOrderIds]);

  // ── Truck helpers ──
  const addTruck = (transportName: string, capacity: number) => {
    const count = assignedTrucks.filter((t) => t.transport_name === transportName).length;
    const label = `${transportName} ${count + 1}`;
    setAssignedTrucks((prev) => [
      ...prev,
      { id: crypto.randomUUID(), transport_name: transportName, capacity_bultos: capacity, label, order_ids: [] },
    ]);
  };

  const removeTruck = (truckId: string) => {
    setAssignedTrucks((prev) => prev.filter((t) => t.id !== truckId));
  };

  const assignOrderToTruck = (orderId: string, truckId: string) => {
    // Remove from pickup if it was there
    setPickupOrderIds((prev) => { const s = new Set(prev); s.delete(orderId); return s; });
    setAssignedTrucks((prev) =>
      prev.map((t) => t.id === truckId ? { ...t, order_ids: [...t.order_ids, orderId] } : t)
    );
  };

  const unassignOrder = (orderId: string, truckId: string) => {
    setAssignedTrucks((prev) =>
      prev.map((t) => t.id === truckId ? { ...t, order_ids: t.order_ids.filter((id) => id !== orderId) } : t)
    );
  };

  const markPickup = (orderId: string) => {
    // Remove from any truck first
    setAssignedTrucks((prev) =>
      prev.map((t) => ({ ...t, order_ids: t.order_ids.filter((id) => id !== orderId) }))
    );
    setPickupOrderIds((prev) => new Set(prev).add(orderId));
  };

  const unmarkPickup = (orderId: string) => {
    setPickupOrderIds((prev) => { const s = new Set(prev); s.delete(orderId); return s; });
  };

  const moveTruck = (truckId: string, direction: "up" | "down") => {
    setAssignedTrucks((prev) => {
      const idx = prev.findIndex((t) => t.id === truckId);
      if (idx < 0) return prev;
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[swapIdx]] = [copy[swapIdx], copy[idx]];
      return copy;
    });
  };

  // ── Auto-assign ──
  const autoAssign = () => {
    const toAssign = orders.filter((o) => !pickupOrderIds.has(o.order_id));
    const sorted = [...toAssign].sort((a, b) => b.total_bultos - a.total_bultos);
    const defaultTransport = transportTypes.length > 0
      ? transportTypes[transportTypes.length - 1]
      : { name: "Camión", capacity_bultos: 700 };

    const newTrucks: AssignedTruck[] = [];
    const typeCounts: Record<string, number> = {};

    for (const order of sorted) {
      let placed = false;
      for (const truck of newTrucks) {
        const currentBultos = toAssign
          .filter((o) => truck.order_ids.includes(o.order_id))
          .reduce((s, o) => s + o.total_bultos, 0);
        if (currentBultos + order.total_bultos <= truck.capacity_bultos) {
          truck.order_ids.push(order.order_id);
          placed = true;
          break;
        }
      }
      if (!placed) {
        const transport = transportTypes.find((t) => t.capacity_bultos >= order.total_bultos) ?? defaultTransport;
        typeCounts[transport.name] = (typeCounts[transport.name] ?? 0) + 1;
        newTrucks.push({
          id: crypto.randomUUID(),
          transport_name: transport.name,
          capacity_bultos: transport.capacity_bultos,
          label: `${transport.name} ${typeCounts[transport.name]}`,
          order_ids: [order.order_id],
        });
      }
    }
    setAssignedTrucks(newTrucks);
  };

  // ── Delivery-link helpers for the "Órdenes a entregar" list ──
  // Lazy-mints a readable signature_token when the user first taps the
  // eye / copy icons. Mirrors the same flow as OrderDetailSheet's
  // ensureToken so a token only exists when there's intent to share.
  const ALPHABET_TOKEN = "abcdefghjkmnpqrstuvwxyz23456789";
  const ensureSignatureToken = useCallback(async (orderId: string, orderCode: string, currentToken: string | null): Promise<string | null> => {
    if (currentToken && currentToken.startsWith(`${orderCode}-`)) return currentToken;
    const random4 = Array.from({ length: 4 }, () =>
      ALPHABET_TOKEN[Math.floor(Math.random() * ALPHABET_TOKEN.length)],
    ).join("");
    const newToken = `${orderCode}-${random4}`;
    const { error } = await (supabase as any)
      .from("orders")
      .update({ signature_token: newToken })
      .eq("id", orderId);
    if (error) {
      toast({ title: "No se pudo generar el link", description: error.message, variant: "destructive" });
      return null;
    }
    // Refresh local cache so subsequent clicks reuse the same token
    queryClient.invalidateQueries({ queryKey: ["maniobra-orders", dateStr] });
    return newToken;
  }, [dateStr, queryClient, toast]);

  const handlePreviewSignature = useCallback(async (order: ManiobraOrder) => {
    const token = await ensureSignatureToken(order.order_id, order.order_code, order.signature_token);
    if (!token) return;
    window.open(`${window.location.origin}/entrega/${token}`, "_blank", "noopener,noreferrer");
  }, [ensureSignatureToken]);

  const handleCopySignatureLink = useCallback(async (order: ManiobraOrder) => {
    const token = await ensureSignatureToken(order.order_id, order.order_code, order.signature_token);
    if (!token) return;
    const url = `${window.location.origin}/entrega/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copiado", description: order.order_code });
    } catch {
      toast({ title: "No se pudo copiar", variant: "destructive" });
    }
  }, [ensureSignatureToken, toast]);

  const handleDownloadOrderPng = useCallback(async (orderId: string) => {
    const { exportOrderAsImage } = await import("@/components/orders/SingleOrderImageCard");
    // Driver-facing handout: strip every $ value (unit price, subtotal,
    // total, discount). Keeps products + bulto counts only — user
    // doesn't want money on the printout the driver sees.
    await exportOrderAsImage(orderId, { hideMoney: true });
  }, []);

  // For the inline-expand row: track which orders are open
  const [expandedDeliveryRows, setExpandedDeliveryRows] = useState<Set<string>>(new Set());
  const toggleDeliveryRow = (orderId: string) => {
    setExpandedDeliveryRows((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  // ── Enriched trucks for display/PNG ──
  const enrichedTrucks = useMemo(() => {
    return assignedTrucks.map((truck) => {
      const truckOrders = truck.order_ids
        .map((oid) => orders.find((o) => o.order_id === oid))
        .filter(Boolean) as ManiobraOrder[];
      const totalBultos = truckOrders.reduce((s, o) => s + o.total_bultos, 0);
      const over = totalBultos - truck.capacity_bultos;
      return { ...truck, orders: truckOrders, totalBultos, over };
    });
  }, [assignedTrucks, orders]);

  // ── Cross-dock from assigned trucks ──
  const outgoingNeeds = useMemo(() => {
    const map = new Map<string, { truck_label: string; client_names: string[]; quantity: number }[]>();
    for (const truck of enrichedTrucks) {
      for (const order of truck.orders) {
        for (const item of order.items) {
          const arr = map.get(item.product_id) ?? [];
          arr.push({ truck_label: truck.label, client_names: truck.orders.map((o) => o.client_name), quantity: item.quantity });
          map.set(item.product_id, arr);
        }
      }
    }
    return map;
  }, [enrichedTrucks]);

  const descargas: ManiobraDescarga[] = useMemo(() => {
    return rawDeliveries.map((del: any) => {
      const entryItems = rawEntryItems.filter((e: any) => e.delivery_id === del.id);
      const items: ManiobraDescarga["items"] = [];

      for (const entry of entryItems) {
        const p = entry.products as any;
        if (!p) continue;
        const productId = p.id;
        const totalIncoming = Number(entry.quantity) || 0;
        const needs = outgoingNeeds.get(productId) ?? [];

        let remaining = totalIncoming;
        for (const need of needs) {
          if (remaining <= 0) break;
          const crossDock = Math.min(remaining, need.quantity);
          if (crossDock > 0) {
            items.push({
              product_id: productId, product_name: p.name ?? "", product_clave: p.clave ?? "",
              image_url: p.image_url ?? null, quantity: crossDock,
              destination: need.truck_label,
            });
            remaining -= crossDock;
          }
        }
        if (remaining > 0) {
          items.push({
            product_id: productId, product_name: p.name ?? "", product_clave: p.clave ?? "",
            image_url: p.image_url ?? null, quantity: remaining, destination: "warehouse",
          });
        }
      }

      return { delivery_id: del.id, delivery_code: del.delivery_code, total_bultos: items.reduce((s, i) => s + i.quantity, 0), items };
    });
  }, [rawDeliveries, rawEntryItems, outgoingNeeds]);

  // ── Client names per truck label (for PNG) ──
  const truckClientNames = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const t of enrichedTrucks) {
      map.set(t.label, t.orders.map((o) => o.client_name));
    }
    return map;
  }, [enrichedTrucks]);

  // ── Transport management ──
  const addTransportType = async () => {
    if (!newTransportName.trim() || !newTransportCapacity.trim()) return;
    const { error } = await supabase.from("transport_types").insert({
      name: newTransportName.trim(), capacity_bultos: parseInt(newTransportCapacity) || 0,
    } as any);
    if (error) { toast({ title: "Error", description: error.message }); return; }
    queryClient.invalidateQueries({ queryKey: ["transport-types"] });
    setNewTransportName(""); setNewTransportCapacity("");
    toast({ title: "Transporte agregado" });
  };

  const deleteTransportType = async (id: string) => {
    const { error } = await supabase.from("transport_types").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message }); return; }
    queryClient.invalidateQueries({ queryKey: ["transport-types"] });
    toast({ title: "Transporte eliminado" });
  };

  // ── PNG Export ──
  const exportPng = async (type: "descarga" | "carga", index?: number) => {
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { createRoot } = await import("react-dom/client");
      const React = await import("react");
      const { loadImageAsDataUrl } = await import("@/lib/load-image-as-data-url");

      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      const Component = type === "descarga" ? DescargaImageCard : CargaImageCard;

      // Pre-encode every product thumbnail to a data URL so html2canvas
      // doesn't have to fetch images during the snapshot — those lazy
      // network loads frequently fail under CORS or timing and the
      // image silently falls back to the 📦 placeholder.
      let props: any;
      if (type === "descarga") {
        const d = descargas[index ?? 0];
        const dataItems = await Promise.all(
          (d?.items ?? []).map(async (it: any) => ({
            ...it,
            image_url: (await loadImageAsDataUrl(it.image_url)) ?? it.image_url,
          })),
        );
        props = {
          descarga: { ...d, items: dataItems },
          date: dateStr,
          truckClientNames,
        };
      } else {
        const dataTrucks = await Promise.all(
          enrichedTrucks.map(async (t: any) => ({
            ...t,
            items: await Promise.all(
              (t.items ?? []).map(async (it: any) => ({
                ...it,
                image_url: (await loadImageAsDataUrl(it.image_url)) ?? it.image_url,
              })),
            ),
          })),
        );
        props = { trucks: dataTrucks, date: dateStr };
      }

      await new Promise<void>((resolve) => {
        root.render(
          React.createElement(Component as any, {
            ...props,
            ref: (node: HTMLElement | null) => { if (node) setTimeout(resolve, 100); },
          })
        );
      });

      if (document.fonts?.ready) await document.fonts.ready;
      const node = container.firstElementChild as HTMLElement | null;
      if (!node) throw new Error("Render failed");

      const height = node.scrollHeight || 900;
      const width = 600;
      const canvas = await html2canvas(node, {
        backgroundColor: "#ffffff", scale: 2, useCORS: true, allowTaint: true,
        logging: false, width, height, windowWidth: width, windowHeight: height,
      });

      const dataUrl = canvas.toDataURL("image/png");
      const fileName = type === "descarga" ? `descarga_${dateStr}.png` : `carga_${dateStr}.png`;
      const link = document.createElement("a");
      link.download = fileName; link.href = dataUrl; link.click();

      root.unmount(); container.remove();
      toast({ title: "PNG descargado", description: fileName });
    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: "No se pudo generar la imagen" });
    }
  };

  // ── Summary stats ──
  const totalOrders = orders.length;
  const totalTrucks = assignedTrucks.length;
  const totalBultos = orders.reduce((s, o) => s + o.total_bultos, 0);
  const unassignedBultos = unassignedOrders.reduce((s, o) => s + o.total_bultos, 0);

  const isLoading = ordersLoading || deliveriesLoading || entriesLoading;
  const hasDescargas = descargas.length > 0 && descargas.some((d) => d.items.length > 0);
  const dateLabel = format(selectedDate, "EEEE d 'de' MMMM", { locale: es });

  return (
    <div className="flex-1 flex flex-col gap-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Fixed min-width so the toggle never shifts when the subtitle
              length changes between Plan and Live. */}
          <div className="min-w-[260px]">
            <h1 className="text-2xl font-bold tracking-tight">Maniobra</h1>
            <p className="text-sm text-muted-foreground">
              {mode === "plan" && "Plan de carga y descarga diario"}
              {mode === "live" && "Conteo en vivo · espejo del portal"}
              {mode === "pedidos" && "Pedidos del día · vista operativa"}
              {mode === "directorio" && "Directorio de clientes"}
              {mode === "agenda" && "Agenda del día · ventanas de entrega"}
            </p>
          </div>
          {/* 4-way segmented control: Directorio / Pedidos / Plan / Live */}
          <div className="inline-flex rounded-lg border bg-muted p-0.5 flex-wrap">
            <button
              onClick={() => setMode("directorio")}
              className={cn(
                "px-3 py-1.5 text-sm font-semibold rounded-md transition",
                mode === "directorio" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Directorio
            </button>
            <button
              onClick={() => setMode("pedidos")}
              className={cn(
                "px-3 py-1.5 text-sm font-semibold rounded-md transition",
                mode === "pedidos" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Pedidos
            </button>
            <button
              onClick={() => setMode("agenda")}
              className={cn(
                "px-3 py-1.5 text-sm font-semibold rounded-md transition",
                mode === "agenda" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Agenda
            </button>
            <button
              onClick={() => setMode("plan")}
              className={cn(
                "px-3 py-1.5 text-sm font-semibold rounded-md transition",
                mode === "plan" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Plan
            </button>
            <button
              onClick={() => setMode("live")}
              className={cn(
                "px-3 py-1.5 text-sm font-semibold rounded-md transition flex items-center gap-1.5",
                mode === "live" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", mode === "live" ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40")} />
              Live
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Abrir / Compartir portal were standalone header buttons.
              Now they live inside the Acceso al portal panel (toggled
              by the button below) so all portal-related controls sit
              together with the daily PIN + trusted-device manager. */}
          <Button
            variant={showAccessPanel ? "default" : "outline"}
            size="sm"
            className="gap-2"
            onClick={() => setShowAccessPanel(!showAccessPanel)}
          >
            <KeyRound className="h-4 w-4" />
            Portal
          </Button>
          <Button variant={showTransports ? "default" : "outline"} size="sm" className="gap-2"
            onClick={() => setShowTransports(!showTransports)}>
            <Settings2 className="h-4 w-4" /> Transportes
          </Button>
          {/* Selfies-de-entrega audit — opens the security review panel
              where admin can browse every reveal-selfie taken from
              every signature link. */}
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <Link to="/maniobra/selfies">
              <ShieldCheck className="h-4 w-4" /> Selfies
            </Link>
          </Button>

          {/* Day arrows + calendar */}
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => goDay(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2 min-w-[200px]">
                  <CalendarIcon className="h-4 w-4" />
                  <span className="capitalize">{dateLabel}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar mode="single" selected={selectedDate}
                  onSelect={(d) => { if (d) { setSelectedDate(d); setCalendarOpen(false); } }}
                  locale={es} />
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => goDay(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Live mode — mirror of the manager portal (Bautista-equivalent power) */}
      {mode === "live" && (
        <ManiobraPortal
          embedded
          embedDate={selectedDate}
          embedRole="warehouse_mgr"
          embedActor={user?.email ? `${user.email.split("@")[0]} (admin)` : "admin"}
        />
      )}

      {/* Pedidos sub-tab — operations view of orders without prices.
          Status-change allowed (warehouse_mgr's job); item edits are not. */}
      {mode === "pedidos" && (
        <PedidosOpsView selectedDate={selectedDate} />
      )}

      {/* Directorio sub-tab — read-only client contacts. */}
      {mode === "directorio" && (
        <DirectorioView />
      )}

      {/* Agenda sub-tab — delivery-window timeline for Rodrigo's daily
          route planning. Internal Día/Semana switch: Día = the single
          selectedDate timeline; Semana = 6 stacked Mon-Sat blocks. */}
      {mode === "agenda" && (
        <div className="space-y-4">
          {/* Día / Semana toggle */}
          <div className="inline-flex rounded-lg border bg-muted p-0.5">
            <button
              onClick={() => setAgendaRange("day")}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-md transition",
                agendaRange === "day" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Día
            </button>
            <button
              onClick={() => setAgendaRange("week")}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-md transition",
                agendaRange === "week" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Semana
            </button>
          </div>

          {agendaRange === "day" ? (
            <AgendaTimelineView
              orders={orders}
              assignedTrucks={assignedTrucks}
              pickupOrderIds={pickupOrderIds}
              date={selectedDate}
              isLoading={ordersLoading}
              onOrderClick={(orderId) => {
                setMode("pedidos");
                window.location.hash = `order-${orderId}`;
              }}
            />
          ) : (
            <AgendaWeekView
              weekDays={weekDayData}
              isLoading={weekIsLoading}
              onOrderClick={(orderId) => {
                setMode("pedidos");
                window.location.hash = `order-${orderId}`;
              }}
            />
          )}
        </div>
      )}

      {/* Plan mode — everything below only renders when in plan view */}
      {mode === "plan" && (<>
      {/* Acceso al portal — collapsible card holding the daily PIN
          gate controls, trusted-device manager, and the relocated
          Abrir / Compartir portal quick actions. Sits above the
          Transportes panel so portal-related controls stay together.
          Default closed. Header changes nothing when closed. */}
      {showAccessPanel && (
        <ManiobraAccessPanel
          onOpenPortal={() => window.open("/portalmaniobra", "_blank", "noopener,noreferrer")}
          onSharePortal={() => setPortalDialogOpen(true)}
        />
      )}

      {/* Transport Management Panel */}
      {showTransports && (
        <div className="border rounded-lg p-4 bg-card space-y-3">
          <h3 className="font-semibold text-sm">Tipos de Transporte</h3>
          <div className="space-y-2">
            {transportTypes.map((tt) => (
              <div key={tt.id} className="flex items-center justify-between text-sm py-1.5 px-2 rounded hover:bg-muted/50">
                <div className="flex items-center gap-3">
                  <TransportIcon name={tt.name} className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{tt.name}</span>
                  <Badge variant="secondary" className="text-xs">{tt.capacity_bultos} bultos</Badge>
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteTransportType(tt.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Input placeholder="Nombre..." value={newTransportName} onChange={(e) => setNewTransportName(e.target.value)} className="h-8 text-sm flex-1" />
            <Input placeholder="Bultos" type="number" value={newTransportCapacity} onChange={(e) => setNewTransportCapacity(e.target.value)} className="h-8 text-sm w-24" />
            <Button size="sm" className="h-8" onClick={addTransportType}><Plus className="h-3.5 w-3.5 mr-1" /> Agregar</Button>
          </div>
        </div>
      )}

      {isLoading && <div className="space-y-4"><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" /></div>}

      {/* Summary Bar */}
      {!isLoading && orders.length > 0 && (
        <div className="border rounded-lg bg-card px-6 py-3 flex items-center justify-between gap-6 text-sm">
          <div className="flex items-center gap-8">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Pedidos</div>
              <div className="text-lg font-bold tabular-nums">{totalOrders}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Camiones</div>
              <div className="text-lg font-bold tabular-nums">{totalTrucks}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Bultos Total</div>
              <div className="text-lg font-bold tabular-nums">{totalBultos}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Sin Asignar</div>
              <div className={cn("text-lg font-bold tabular-nums", unassignedBultos > 0 ? "text-amber-500" : "text-green-500")}>{unassignedBultos}</div>
            </div>
            {pickupOrders.length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Pickup</div>
                <div className="text-lg font-bold tabular-nums">{pickupOrders.length}</div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unassignedOrders.length > 0 && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={autoAssign}>
                <Wand2 className="h-3.5 w-3.5" /> Asignar todo
              </Button>
            )}
          </div>
        </div>
      )}

      {!isLoading && orders.length === 0 && !hasDescargas && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
          <Package className="h-12 w-12 opacity-40" />
          <p className="text-lg font-medium">Sin maniobra programada</p>
          <p className="text-sm">No hay pedidos ni entradas de stock para {dateLabel}</p>
        </div>
      )}

      {/* ── DESCARGA section ── */}
      {hasDescargas && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ArrowDown className="h-5 w-5 text-orange-500" />
              <h2 className="text-lg font-semibold">Descarga</h2>
              <Badge variant="outline">{descargas.reduce((s, d) => s + d.total_bultos, 0)} bultos</Badge>
            </div>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => exportPng("descarga", 0)}>
              <Download className="h-4 w-4" /> Descargar PNG
            </Button>
          </div>

          {descargas.map((desc) => {
            const crossDockItems = desc.items.filter((i) => i.destination !== "warehouse");
            const warehouseItems = desc.items.filter((i) => i.destination === "warehouse");
            const crossDockByTruck = new Map<string, typeof crossDockItems>();
            for (const item of crossDockItems) {
              const arr = crossDockByTruck.get(item.destination) ?? [];
              arr.push(item);
              crossDockByTruck.set(item.destination, arr);
            }

            return (
              <div key={desc.delivery_id} className="border rounded-lg p-4 space-y-4 bg-card">
                <div className="flex items-center gap-3">
                  <Truck className="h-5 w-5 text-muted-foreground" />
                  <p className="font-medium">{desc.delivery_code}</p>
                  <Badge className="ml-auto">{desc.total_bultos} bultos</Badge>
                </div>

                {crossDockByTruck.size > 0 && (
                  <div className="border border-amber-300 dark:border-amber-700 rounded-lg p-3 bg-amber-50/50 dark:bg-amber-950/20">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">TRASPALEAR — PASA DIRECTO AL CAMIÓN</span>
                    </div>
                    {[...crossDockByTruck.entries()].map(([truckLabel, items]) => {
                      const clients = truckClientNames.get(truckLabel) ?? [];
                      return (
                        <div key={truckLabel} className="mb-3 last:mb-0">
                          <div className="flex items-center gap-1 mb-1">
                            <ArrowRight className="h-3.5 w-3.5 text-amber-600" />
                            <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                              {truckLabel}{clients.length > 0 && ` · ${clients.join(", ")}`}
                            </span>
                            <span className="text-xs text-amber-600 ml-1">({items.reduce((s, i) => s + i.quantity, 0)} bultos)</span>
                          </div>
                          <div className="space-y-1 ml-5">
                            {items.map((item, j) => <ProductRow key={j} item={item} />)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {warehouseItems.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Warehouse className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium text-green-700 dark:text-green-400">
                        {crossDockByTruck.size > 0 ? "RESTO → ALMACÉN" : "BAJAR TODO AL ALMACÉN"}
                      </span>
                      <span className="text-xs text-muted-foreground">({warehouseItems.reduce((s, i) => s + i.quantity, 0)} bultos)</span>
                    </div>
                    <div className="space-y-1 ml-6">
                      {warehouseItems.map((item, j) => <ProductRow key={j} item={item} />)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* ── ÓRDENES A ENTREGAR section ──
          Per-order action surface (eye / copy / download) for every
          order being delivered today. Mirrors the icons in /pedidos so
          muscle memory transfers. Click a row body to expand inline
          and see line items + truck assignment. Truck cards below stay
          dedicated to LOADING SEQUENCE — no per-order icons there. */}
      {!isLoading && deliveryRows.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Truck className="h-5 w-5 text-blue-500" />
            <h2 className="text-lg font-semibold">Órdenes a entregar ({deliveryRows.length})</h2>
          </div>
          <div className="border rounded-lg bg-card divide-y overflow-hidden">
            {deliveryRows.map(({ order, kind, truckLabel }) => {
              const expanded = expandedDeliveryRows.has(order.order_id);
              return (
                <div key={order.order_id}>
                  {/* Row header — clickable to expand */}
                  <div
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 cursor-pointer transition-colors"
                    onClick={(e) => {
                      // ignore clicks inside the action buttons cluster
                      if ((e.target as HTMLElement).closest("[data-row-actions]")) return;
                      toggleDeliveryRow(order.order_id);
                    }}
                  >
                    <ChevronRight className={cn("h-4 w-4 text-muted-foreground shrink-0 transition-transform", expanded && "rotate-90")} />
                    <span className="font-mono text-sm font-semibold text-blue-500 shrink-0">{order.order_code}</span>
                    <span className="text-sm truncate flex-1">{order.client_name}</span>
                    <DeliveryWindowChip
                      from={order.delivery_window_from}
                      until={order.delivery_window_until}
                      notes={order.delivery_notes}
                      isPickup={order.fulfillment_method === "pickup"}
                      className="shrink-0"
                    />
                    <span className="text-sm font-semibold tabular-nums shrink-0">
                      {order.total_bultos} <span className="text-xs font-normal text-muted-foreground">bultos</span>
                    </span>
                    {kind === "truck" && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 shrink-0">
                        <Truck className="h-3 w-3" /> {truckLabel}
                      </span>
                    )}
                    {kind === "pickup" && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 shrink-0">
                        <HandHelping className="h-3 w-3" /> Pickup
                      </span>
                    )}
                    {kind === "unassigned" && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/40 shrink-0">
                        <AlertTriangle className="h-3 w-3" /> Sin asignar
                      </span>
                    )}
                    {/* Action icons — same pattern as the Pedidos table */}
                    <div data-row-actions className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => handlePreviewSignature(order)}
                        className="p-1.5 rounded hover:bg-muted text-blue-600"
                        title="Ver página de firma"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopySignatureLink(order)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                        title="Copiar link de firma"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadOrderPng(order.order_id)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                        title="Descargar resumen del pedido (PNG)"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded body — same row style as the truck cards
                      so the page reads as one design language. Reuses
                      ProductRow (md thumb, clave under name, plain bold
                      `x{qty}` instead of pill badges). */}
                  {expanded && (
                    <div className="px-4 py-3 bg-muted/20 border-t space-y-2">
                      {order.client_address && (
                        <p className="text-xs text-muted-foreground">📍 {order.client_address}</p>
                      )}
                      <div className="space-y-1.5">
                        {order.items.map((it, j) => (
                          <ProductRow key={j} item={it} showClave />
                        ))}
                      </div>
                      {kind === "truck" && truckLabel && (
                        <p className="text-xs text-muted-foreground pt-1">
                          Asignado a <span className="font-semibold text-blue-600 dark:text-blue-400">{truckLabel}</span> — ver abajo en la sección Carga.
                        </p>
                      )}
                      {kind === "unassigned" && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 pt-1">
                          ⚠ Este pedido no está asignado a ningún camión. Asígnalo abajo en Pedidos sin asignar.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── CARGA section ── */}
      {!isLoading && orders.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ArrowRight className="h-5 w-5 text-blue-500" />
              <h2 className="text-lg font-semibold">Carga</h2>
            </div>
            <div className="flex items-center gap-2">
              {enrichedTrucks.length > 0 && (
                <Button size="sm" variant="outline" className="gap-2" onClick={() => exportPng("carga")}>
                  <Download className="h-4 w-4" /> Descargar PNG
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" /> Agregar camión</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {transportTypes.map((tt) => (
                    <DropdownMenuItem key={tt.id} onClick={() => addTruck(tt.name, tt.capacity_bultos)}>
                      <TransportIcon name={tt.name} className="h-4 w-4 mr-2" /> {tt.name} <span className="text-muted-foreground ml-2">({tt.capacity_bultos} bultos)</span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setShowCustomDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" /> Transporte personalizado
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Unassigned orders */}
          {unassignedOrders.length > 0 && (
            <div className="mb-4">
              <p className="text-sm font-medium text-muted-foreground mb-2">Pedidos sin asignar ({unassignedOrders.length})</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {unassignedOrders.map((order) => (
                  <div key={order.order_id} className="border rounded-lg p-3 bg-card hover:border-primary/50 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-sm font-semibold text-blue-500">{order.order_code}</span>
                      <Badge variant="outline" className="text-xs">{order.total_bultos} bultos</Badge>
                    </div>
                    <p className="text-sm truncate">{order.client_name}</p>
                    <div className="mt-1">
                      <DeliveryWindowChip
                        from={order.delivery_window_from}
                        until={order.delivery_window_until}
                        notes={order.delivery_notes}
                        isPickup={order.fulfillment_method === "pickup"}
                      />
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {assignedTrucks.map((truck) => (
                        <Button key={truck.id} size="sm" variant="outline" className="h-6 text-xs px-2"
                          onClick={() => assignOrderToTruck(order.order_id, truck.id)}>
                          → {truck.label}
                        </Button>
                      ))}
                      <Button size="sm" variant="outline" className="h-6 text-xs px-2 text-purple-600 border-purple-300"
                        onClick={() => markPickup(order.order_id)}>
                        Pickup
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pickup orders */}
          {pickupOrders.length > 0 && (
            <div className="mb-4 border border-purple-300 dark:border-purple-700 rounded-lg p-3 bg-purple-50/50 dark:bg-purple-950/20">
              <div className="flex items-center gap-2 mb-2">
                <HandHelping className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-semibold text-purple-700 dark:text-purple-400">Pickup — Cliente recoge en almacén</span>
              </div>
              <div className="space-y-1.5">
                {pickupOrders.map((order) => (
                  <div key={order.order_id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-purple-600">{order.order_code}</span>
                      <span className="text-muted-foreground">· {order.client_name}</span>
                      <Badge variant="outline" className="text-xs">{order.total_bultos} bultos</Badge>
                    </div>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => unmarkPickup(order.order_id)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Assigned trucks */}
          <div className="space-y-4">
            {enrichedTrucks.map((truck, idx) => {
              const priorityLabel = idx === 0 ? "CARGAR PRIMERO" : idx === 1 ? "CARGAR SEGUNDO" : idx === 2 ? "CARGAR TERCERO" : `CARGAR #${idx + 1}`;

              return (
                <div key={truck.id} className={cn("border rounded-lg p-4 bg-card", idx === 0 && truck.orders.length > 0 && "border-blue-500/50")}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        {idx === 0 && truck.orders.length > 0 && <span className="text-amber-500">★</span>}
                        <h3 className="font-semibold text-lg">{truck.label}</h3>
                        {truck.orders.length > 0 && (
                          <span className={cn("text-xs font-bold uppercase tracking-wide", idx === 0 ? "text-blue-600" : "text-muted-foreground")}>
                            {priorityLabel}
                          </span>
                        )}
                        {truck.over > 0 && (
                          <Badge variant="outline" className="text-xs text-orange-500 border-orange-300">+{truck.over}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {truck.totalBultos} / {truck.capacity_bultos} bultos
                        {truck.orders.length > 0 && ` · ${truck.orders.map((o) => o.client_name).join(", ")}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {/* Maps batch route — opens Google Maps with all
                          this truck's delivery stops as waypoints, in
                          order assignment + stop_index sequence. Driver
                          gets a single tap → ready-to-go nav. */}
                      {truck.orders.length > 0 && (() => {
                        const addrs: string[] = [];
                        for (const ord of truck.orders) {
                          const stops = orderStopsByOrder.get(ord.order_id) ?? [];
                          if (stops.length === 0) {
                            // Fallback for orders without explicit stops
                            // (legacy — backfill should cover all)
                            if (ord.client_address) addrs.push(ord.client_address);
                            continue;
                          }
                          for (const s of stops) {
                            // Prefer the manual maps URL if it's a real
                            // place (driver-friendly). Otherwise the
                            // raw address — Maps geocodes either way.
                            addrs.push(s.address);
                          }
                        }
                        if (addrs.length === 0) return null;
                        // Google Maps multi-waypoint URL
                        const dirParts = addrs.map((a) => encodeURIComponent(a)).join("/");
                        const url = `https://www.google.com/maps/dir/${dirParts}`;
                        return (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 hover:bg-blue-500/20"
                            title={`Ruta con ${addrs.length} parada${addrs.length === 1 ? "" : "s"}`}
                          >
                            🗺 Ruta
                          </a>
                        );
                      })()}
                      <div className="flex flex-col gap-0.5">
                        <Button size="icon" variant="ghost" className="h-6 w-6" disabled={idx === 0} onClick={() => moveTruck(truck.id, "up")}><ChevronUp className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6" disabled={idx === enrichedTrucks.length - 1} onClick={() => moveTruck(truck.id, "down")}><ChevronDown className="h-4 w-4" /></Button>
                      </div>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => removeTruck(truck.id)}><X className="h-4 w-4" /></Button>
                    </div>
                  </div>

                  {truck.orders.length === 0 && (
                    <p className="text-sm text-muted-foreground py-4 text-center">Asigna pedidos a este camión</p>
                  )}

                  {truck.orders.map((order) => (
                    <div key={order.order_id} className="border rounded-md p-3 mb-2 last:mb-0">
                      <div className="flex items-center justify-between mb-2 gap-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="font-mono text-sm font-semibold text-blue-500">{order.order_code}</span>
                          <span className="text-sm text-muted-foreground">· {order.client_name}</span>
                          <Badge variant="outline" className="text-xs">{order.total_bultos} bultos</Badge>
                          <DeliveryWindowChip
                            from={order.delivery_window_from}
                            until={order.delivery_window_until}
                            notes={order.delivery_notes}
                            isPickup={order.fulfillment_method === "pickup"}
                          />
                        </div>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => unassignOrder(order.order_id, truck.id)}><X className="h-3.5 w-3.5" /></Button>
                      </div>
                      <div className="space-y-1">
                        {order.items.map((item, j) => {
                          const shortage = shortageMap.get(item.product_id) ?? 0;
                          return <ProductRow key={j} item={item} showClave shortage={shortage > 0 ? shortage : undefined} />;
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      )}

      </>)}

      {/* Custom truck dialog */}
      <Dialog open={showCustomDialog} onOpenChange={setShowCustomDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Transporte personalizado</DialogTitle>
            <DialogDescription>Solo para esta sesión</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Nombre (ej: Camión cliente)" value={customTruckName} onChange={(e) => setCustomTruckName(e.target.value)} />
            <Input placeholder="Capacidad en bultos" type="number" value={customTruckCapacity} onChange={(e) => setCustomTruckCapacity(e.target.value)} />
            <Button className="w-full" onClick={() => {
              if (customTruckName.trim() && customTruckCapacity.trim()) {
                addTruck(customTruckName.trim(), parseInt(customTruckCapacity) || 0);
                setCustomTruckName(""); setCustomTruckCapacity(""); setShowCustomDialog(false);
              }
            }}>Agregar camión</Button>
          </div>
        </DialogContent>
      </Dialog>

      <PortalShareDialog open={portalDialogOpen} onOpenChange={setPortalDialogOpen} />
    </div>
  );
}

/* ── Manager PIN settings (inside the share dialog) ─────────────────────── */

/* ───────────────────────── Pedidos ops view ─────────────────────────
 * Operations-friendly orders list for warehouse_mgr (Rodrigo). Hides
 * pricing, totals, payment method, discounts, anything sales-y. Shows
 * everything he needs: code, client + phone, address, bultos, items,
 * status (with quick-change), urgency, fulfillment, notes. Click row
 * to expand line items.
 *
 * Filtered to selectedDate by default but with a "todos" toggle for
 * picking up orders that may have been created for other days.
 */
function PedidosOpsView({ selectedDate }: { selectedDate: Date }) {
  const dateStr = dateToString(selectedDate);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [scope, setScope] = useState<"day" | "all">("day");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Picking dialog state — which order is currently in the picker
  const [pickingOrder, setPickingOrder] = useState<any | null>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["maniobra-pedidos-ops", scope === "day" ? dateStr : "all"],
    queryFn: async () => {
      // 14-day window when scope=all so the page doesn't fetch every
      // order ever placed. Past 7 + future 7 covers what the warehouse
      // manager actually needs to see (recent + upcoming).
      const today = new Date();
      const minDate = new Date(today); minDate.setDate(today.getDate() - 7);
      const maxDate = new Date(today); maxDate.setDate(today.getDate() + 7);
      let q = (supabase as any)
        .from("orders")
        .select("id, order_code, status, delivery_date, order_date, urgency, notes, fulfillment_method, payment_method, signature_token, signed_at, client_id, clients(name, company, phone, address, central, delivery_window_from, delivery_window_until, delivery_notes)")
        .neq("status", "Cancelado")
        .order("delivery_date", { ascending: true })
        .order("order_code", { ascending: false });
      if (scope === "day") {
        q = q.eq("delivery_date", dateStr);
      } else {
        q = q.gte("delivery_date", dateToString(minDate)).lte("delivery_date", dateToString(maxDate));
      }
      const { data, error } = await q;
      if (error) throw error;
      const ordersRaw = data ?? [];
      if (ordersRaw.length === 0) return [];
      const orderIds = ordersRaw.map((o: any) => o.id);
      const { data: items } = await (supabase as any)
        .from("order_items")
        .select("id, order_id, product_id, quantity, unit_price_override, products(clave, name, image_url)")
        .in("order_id", orderIds);
      const itemsByOrder = new Map<string, any[]>();
      for (const it of items ?? []) {
        const arr = itemsByOrder.get(it.order_id) ?? [];
        arr.push(it);
        itemsByOrder.set(it.order_id, arr);
      }
      // Fetch stops + per-stop allocations for these orders
      const { data: stopsData } = await (supabase as any)
        .from("order_stops")
        .select("id, order_id, stop_index, address, client_label, contact_name, contact_phone, notes, manual_maps_url, signed_at, signed_by_name, order_stop_items(order_item_id, quantity)")
        .in("order_id", orderIds)
        .order("stop_index");
      const stopsByOrder = new Map<string, any[]>();
      for (const s of stopsData ?? []) {
        const arr = stopsByOrder.get(s.order_id) ?? [];
        arr.push(s);
        stopsByOrder.set(s.order_id, arr);
      }
      return ordersRaw.map((o: any) => ({
        ...o,
        items: itemsByOrder.get(o.id) ?? [],
        stops: stopsByOrder.get(o.id) ?? [],
        total_bultos: (itemsByOrder.get(o.id) ?? []).reduce((s: number, it: any) => s + (it.quantity ?? 0), 0),
      }));
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return orders;
    const s = search.toLowerCase();
    return orders.filter((o: any) =>
      (o.order_code ?? "").toLowerCase().includes(s) ||
      (o.clients?.name ?? "").toLowerCase().includes(s) ||
      (o.clients?.company ?? "").toLowerCase().includes(s) ||
      (o.clients?.address ?? "").toLowerCase().includes(s) ||
      // Also search the per-order stop addresses — when a client has
      // two delivery locations (central + bodega, for example), the
      // override lives on order_stops.address, not clients.address.
      (o.stops ?? []).some((st: any) =>
        (st.address ?? "").toLowerCase().includes(s),
      ),
    );
  }, [orders, search]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const updateStatusMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("orders").update({ status: status as any }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, { id, status }) => {
      toast({ title: "Estado actualizado", description: status });
      queryClient.invalidateQueries({ queryKey: ["maniobra-pedidos-ops"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["maniobra-orders"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Lazy-mint signature token on demand (same pattern as everywhere else)
  const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
  const ensureToken = useCallback(async (orderId: string, orderCode: string, currentToken: string | null): Promise<string | null> => {
    if (currentToken && currentToken.startsWith(`${orderCode}-`)) return currentToken;
    const random4 = Array.from({ length: 4 }, () =>
      ALPHABET[Math.floor(Math.random() * ALPHABET.length)],
    ).join("");
    const newToken = `${orderCode}-${random4}`;
    const { error } = await (supabase as any).from("orders").update({ signature_token: newToken }).eq("id", orderId);
    if (error) { toast({ title: "Error generando link", description: error.message, variant: "destructive" }); return null; }
    queryClient.invalidateQueries({ queryKey: ["maniobra-pedidos-ops"] });
    return newToken;
  }, [queryClient, toast]);

  const handlePreview = async (o: any) => {
    const token = await ensureToken(o.id, o.order_code, o.signature_token);
    if (!token) return;
    window.open(`${window.location.origin}/entrega/${token}`, "_blank", "noopener,noreferrer");
  };
  const handleCopyLink = async (o: any) => {
    const token = await ensureToken(o.id, o.order_code, o.signature_token);
    if (!token) return;
    try { await navigator.clipboard.writeText(`${window.location.origin}/entrega/${token}`); toast({ title: "Link copiado", description: o.order_code }); } catch { /* ignore */ }
  };

  return (
    <section className="space-y-3">
      {/* Filters strip */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border bg-muted p-0.5">
          <button
            onClick={() => setScope("day")}
            className={cn("px-3 py-1.5 text-sm font-semibold rounded-md transition", scope === "day" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}
          >
            Solo este día
          </button>
          <button
            onClick={() => setScope("all")}
            className={cn("px-3 py-1.5 text-sm font-semibold rounded-md transition", scope === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}
          >
            ±7 días
          </button>
        </div>
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Input
            placeholder="Buscar por pedido, cliente, dirección…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-3"
          />
        </div>
      </div>

      {/* Orders list */}
      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border rounded-lg bg-card">
          {scope === "day" ? "Sin pedidos para este día." : "Sin pedidos en el rango."}
        </div>
      ) : (
        <div className="border rounded-lg bg-card divide-y overflow-hidden">
          {filtered.map((o: any) => {
            const isExpanded = expanded.has(o.id);
            const c = o.clients;
            // Delivery address resolution: the order's stop address
            // (set in EditOrderSheet → DeliveryStopsEditor) ALWAYS
            // wins over the client's default. Clients with multiple
            // shipping locations rely on this override — without it
            // we'd hand the driver the wrong direccion. Legacy orders
            // with no stops fall back to the client default.
            const stopAddr = (o.stops?.[0]?.address ?? "").trim();
            const displayAddress = stopAddr || c?.address || "";
            const addressIsOverride =
              stopAddr && c?.address && stopAddr !== c.address;
            return (
              <div key={o.id}>
                {/* Row */}
                <div
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 cursor-pointer transition-colors"
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("[data-row-actions], [data-row-status]")) return;
                    toggleExpand(o.id);
                  }}
                >
                  <ChevronRight className={cn("h-4 w-4 text-muted-foreground shrink-0 transition-transform", isExpanded && "rotate-90")} />
                  <span className="font-mono text-sm font-semibold text-blue-500 shrink-0 w-[80px]">{o.order_code}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate flex items-center gap-2">
                      <span className="truncate">
                        {c?.name ?? "Sin cliente"}
                        {c?.company && <span className="text-muted-foreground font-normal"> · {c.company}</span>}
                      </span>
                      <DeliveryWindowChip
                        from={c?.delivery_window_from}
                        until={c?.delivery_window_until}
                        notes={c?.delivery_notes}
                        isPickup={o.fulfillment_method === "pickup"}
                        className="shrink-0"
                      />
                    </div>
                    {displayAddress && (
                      <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                        <span>📍 {displayAddress}</span>
                        {addressIsOverride && (
                          <span
                            className="px-1 py-0 rounded text-[9px] font-semibold bg-blue-500/15 text-blue-500 border border-blue-500/30 shrink-0"
                            title="Esta entrega usa una dirección distinta a la del cliente"
                          >
                            específica
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Right-edge metrics + actions. Layout is intentionally
                      stable: paradas badge → bultos → status → side
                      badges → fixed-width action cluster. The action
                      cluster's fixed width means partial icon sets
                      don't shift the status dropdown left or right
                      between rows. */}
                  {o.stops && o.stops.length > 1 && (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/15 text-blue-500 border border-blue-500/30 shrink-0"
                      title="Pedido con múltiples paradas de entrega"
                    >
                      📍 {o.stops.length} paradas
                    </span>
                  )}
                  <span className="text-sm font-semibold tabular-nums shrink-0 w-[90px] text-right">
                    {o.total_bultos} <span className="text-xs font-normal text-muted-foreground">bultos</span>
                  </span>
                  {/* Status quick-change — sits adjacent to bultos for fast scanning.
                      Restricted to "Confirmado and onwards" for warehouse_mgr — Rodrigo
                      doesn't approve orders or move them between Pendiente / Reservado
                      / Nuevo. He picks up the workflow once an order is confirmed. */}
                  <div data-row-status onClick={(e) => e.stopPropagation()} className="shrink-0">
                    <Select
                      value={o.status}
                      onValueChange={(v) => updateStatusMut.mutate({ id: o.id, status: v })}
                    >
                      <SelectTrigger className="h-8 w-[140px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["Confirmado", "En preparacion", "En ruta", "Entregado"].map((s) => (
                          <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Side flags — wrap if cramped, never push status left */}
                  <div className="flex items-center gap-1 shrink-0 flex-wrap">
                    {o.urgency && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500/15 text-red-500 border border-red-500/30">
                        Urgente
                      </span>
                    )}
                    {o.fulfillment_method === "pickup" && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-500/15 text-purple-500 border border-purple-500/30">
                        <HandHelping className="h-3 w-3" />
                        Pickup
                      </span>
                    )}
                    {o.signed_at && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                        ✓ Firmado
                      </span>
                    )}
                  </div>
                  {/* Actions — fixed width so missing icons don't pull
                      the status dropdown around between rows */}
                  <div data-row-actions className="flex items-center justify-end gap-1 shrink-0 w-[160px]" onClick={(e) => e.stopPropagation()}>
                    {c?.phone ? (
                      <a href={`tel:${c.phone}`} className="p-1.5 rounded hover:bg-muted text-blue-600" title="Llamar">📞</a>
                    ) : <span className="w-7" aria-hidden />}
                    {c?.phone ? (
                      <a href={`https://wa.me/${c.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="p-1.5 rounded hover:bg-muted text-green-600" title="WhatsApp">💬</a>
                    ) : <span className="w-7" aria-hidden />}
                    {/* Maps link uses the same resolved address as the
                        row text — order-specific override wins so the
                        driver navigates to the right place. Prefer
                        manual_maps_url if the user pasted a Plus Code
                        / shareable link on the stop. */}
                    {(o.stops?.[0]?.manual_maps_url || displayAddress) ? (
                      <a
                        href={
                          o.stops?.[0]?.manual_maps_url
                          ?? `https://maps.google.com/?q=${encodeURIComponent(displayAddress)}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded hover:bg-muted text-red-500"
                        title={addressIsOverride ? "Maps (dirección específica del pedido)" : "Maps"}
                      >📍</a>
                    ) : <span className="w-7" aria-hidden />}
                    <button onClick={() => handlePreview(o)} className="p-1.5 rounded hover:bg-muted text-blue-600" title="Ver firma"><Eye className="h-4 w-4" /></button>
                    <button onClick={() => handleCopyLink(o)} className="p-1.5 rounded hover:bg-muted text-muted-foreground" title="Copiar link de firma"><LinkIcon className="h-4 w-4" /></button>
                  </div>
                </div>

                {/* Expanded body */}
                {isExpanded && (
                  <div className="px-4 py-3 bg-muted/20 border-t space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs flex-1">
                        <div>
                          <div className="text-muted-foreground uppercase tracking-wider text-[10px]">Fecha pedido</div>
                          <div className="font-medium">{o.order_date}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground uppercase tracking-wider text-[10px]">Fecha entrega</div>
                          <div className="font-medium">{o.delivery_date}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground uppercase tracking-wider text-[10px]">Central</div>
                          <div className="font-medium">{c?.central ?? "—"}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground uppercase tracking-wider text-[10px]">Teléfono</div>
                          <div className="font-medium">{c?.phone ?? "—"}</div>
                        </div>
                      </div>
                      {/* Picking action — opens the FIFO slot picker dialog */}
                      <Button
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); setPickingOrder(o); }}
                        disabled={!o.items || o.items.length === 0}
                        className="gap-1.5 shrink-0"
                      >
                        <Package className="h-4 w-4" />
                        Picking · {o.total_bultos} bultos
                      </Button>
                    </div>
                    {o.notes && (
                      <div className="text-xs">
                        <span className="text-muted-foreground uppercase tracking-wider text-[10px]">Notas:</span>{" "}
                        <span>{o.notes}</span>
                      </div>
                    )}
                    {/* Stops view — for single-stop orders, show items
                        flat (just like before). For multi-stop, group
                        items under each stop's header so Rodrigo can
                        see what goes where. */}
                    {o.stops && o.stops.length > 1 ? (
                      <div className="space-y-3 pt-2">
                        {o.stops.map((stop: any) => {
                          const stopItemsMap = new Map<string, number>();
                          for (const si of stop.order_stop_items ?? []) {
                            stopItemsMap.set(si.order_item_id, si.quantity);
                          }
                          const stopItems = o.items.filter((it: any) => stopItemsMap.has(it.id));
                          const stopBultos = [...stopItemsMap.values()].reduce((s, q) => s + q, 0);
                          return (
                            <div key={stop.id} className="border rounded-lg p-3 bg-card">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 text-xs font-bold">
                                  {stop.stop_index}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-semibold truncate">
                                    {stop.client_label && <span className="opacity-70">{stop.client_label} · </span>}
                                    {stop.address}
                                  </div>
                                  <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                                    {stop.contact_name && <span>👤 {stop.contact_name}</span>}
                                    {stop.contact_phone && <span>📞 {stop.contact_phone}</span>}
                                    <span className="font-semibold">{stopBultos} bultos</span>
                                    {stop.signed_at && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                                        ✓ Firmado
                                      </span>
                                    )}
                                  </div>
                                  {stop.notes && (
                                    <div className="text-[11px] text-muted-foreground italic mt-0.5">{stop.notes}</div>
                                  )}
                                </div>
                                {stop.address && (
                                  <a
                                    href={stop.manual_maps_url ?? `https://maps.google.com/?q=${encodeURIComponent(stop.address)}`}
                                    target="_blank" rel="noreferrer"
                                    className="p-1.5 rounded hover:bg-muted text-red-500 shrink-0"
                                    title="Maps"
                                  >
                                    📍
                                  </a>
                                )}
                              </div>
                              <div className="space-y-1 pl-8">
                                {stopItems.map((it: any) => (
                                  <div key={it.id} className="flex items-center gap-3 text-sm">
                                    <ProductThumb src={it.products?.image_url ?? null} size="sm" />
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium truncate">{it.products?.name ?? "—"}</div>
                                      <div className="text-xs text-muted-foreground font-mono">{it.products?.clave ?? ""}</div>
                                    </div>
                                    <span className="font-semibold tabular-nums">x{stopItemsMap.get(it.id) ?? 0}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="space-y-1.5 pt-2">
                        {o.items.map((it: any, j: number) => (
                          <div key={j} className="flex items-center gap-3 text-sm">
                            <ProductThumb src={it.products?.image_url ?? null} size="sm" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{it.products?.name ?? "—"}</div>
                              <div className="text-xs text-muted-foreground font-mono">{it.products?.clave ?? ""}</div>
                            </div>
                            <span className="font-semibold tabular-nums">x{it.quantity}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Picking dialog — opens when user taps "Picking" inside any
          expanded order row. FIFO-suggests slots, lets worker confirm. */}
      {pickingOrder && (
        <PickingDialog
          orderId={pickingOrder.id}
          orderCode={pickingOrder.order_code ?? ""}
          clientName={pickingOrder.clients?.name ?? "Sin cliente"}
          lines={(pickingOrder.items ?? []).map((it: any) => ({
            product_id: it.product_id,
            product_clave: it.products?.clave ?? "",
            product_name: it.products?.name ?? "",
            image_url: it.products?.image_url ?? null,
            quantity: Number(it.quantity) || 0,
          }))}
          open={!!pickingOrder}
          onOpenChange={(o) => { if (!o) setPickingOrder(null); }}
          onDone={() => {
            queryClient.invalidateQueries({ queryKey: ["maniobra-pedidos-ops"] });
          }}
        />
      )}
    </section>
  );
}

/* ───────────────────────── Directorio (read-only client contacts) ─────────────────────────
 * Contact-book view for warehouse_mgr. Search by name/phone/central,
 * tap-through to call/whatsapp/maps. NO sales totals, NO RFC, NO
 * payment terms — strictly the data needed to direct trucks and
 * coordinate handoffs.
 */
function DirectorioView() {
  const [search, setSearch] = useState("");
  const [centralFilter, setCentralFilter] = useState<string>("all");

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["maniobra-directorio-clients"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("clients")
        .select("id, name, company, phone, address, central, payment_method, delivery_window_from, delivery_window_until, delivery_notes")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const centrales = useMemo(() => {
    const set = new Set<string>();
    for (const c of clients) if (c.central) set.add(c.central);
    return [...set].sort();
  }, [clients]);

  const filtered = useMemo(() => {
    let out = clients;
    if (centralFilter !== "all") out = out.filter((c: any) => c.central === centralFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      out = out.filter((c: any) =>
        (c.name ?? "").toLowerCase().includes(s) ||
        (c.company ?? "").toLowerCase().includes(s) ||
        (c.phone ?? "").includes(s) ||
        (c.address ?? "").toLowerCase().includes(s),
      );
    }
    return out;
  }, [clients, search, centralFilter]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Buscar por nombre, teléfono, dirección…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />
        <Select value={centralFilter} onValueChange={setCentralFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las centrales</SelectItem>
            {centrales.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{filtered.length} clientes</span>
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border rounded-lg bg-card">Sin clientes.</div>
      ) : (
        <div className="border rounded-lg bg-card divide-y overflow-hidden">
          {filtered.map((c: any) => (
            <div key={c.id} className="px-4 py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate flex items-center gap-2">
                  <span className="truncate">
                    {c.name}
                    {c.company && <span className="text-muted-foreground font-normal"> · {c.company}</span>}
                  </span>
                  <DeliveryWindowChip
                    from={c.delivery_window_from}
                    until={c.delivery_window_until}
                    notes={c.delivery_notes}
                    className="shrink-0"
                  />
                </div>
                <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground mt-0.5">
                  {c.phone && <span>📞 {c.phone}</span>}
                  {c.central && <span>🏢 {c.central}</span>}
                </div>
                {c.address && <div className="text-xs text-muted-foreground truncate mt-0.5">📍 {c.address}</div>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {c.phone && (
                  <a href={`tel:${c.phone}`} className="p-2 rounded hover:bg-muted text-blue-600" title="Llamar">📞</a>
                )}
                {c.phone && (
                  <a href={`https://wa.me/${c.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="p-2 rounded hover:bg-muted text-green-600" title="WhatsApp">💬</a>
                )}
                {c.address && (
                  <a href={`https://maps.google.com/?q=${encodeURIComponent(c.address)}`} target="_blank" rel="noreferrer" className="p-2 rounded hover:bg-muted text-red-500" title="Maps">📍</a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PinSettingsSection() {
  const { toast } = useToast();
  const [pins, setPins] = useState<{ role: string; display_name: string; updated_at: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [newPin, setNewPin] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("maniobra_pins")
      .select("role, display_name, updated_at")
      .order("role");
    if (!error) setPins(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const savePin = async (role: string) => {
    if (!/^\d{4,6}$/.test(newPin)) {
      toast({ title: "PIN inválido", description: "Usa 4 a 6 dígitos.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("maniobra_portal_set_pin", { p_role: role, p_pin: newPin });
      if (error) throw error;
      toast({ title: "PIN actualizado" });
      setEditing(null);
      setNewPin("");
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton className="h-20 w-full" />;

  return (
    <div className="space-y-2 border-t pt-4">
      <h3 className="text-sm font-semibold">PIN de manager</h3>
      <p className="text-[11px] text-muted-foreground">
        Cada manager tiene su propio PIN para desbloquear el portal en su teléfono.
      </p>
      {pins.map((p) => (
        <div key={p.role} className="flex items-center justify-between gap-2 p-2 rounded border">
          <div>
            <div className="text-sm font-medium">{p.display_name}</div>
            <div className="text-[10px] text-muted-foreground">
              {p.role === "contador"
                ? "Contadores · cuentan bultos (compartido entre los 2)"
                : p.role === "cargador_mgr"
                  ? "Manager de cargadores · ve la próxima semana"
                  : "Manager de almacén · acceso completo"}
            </div>
          </div>
          {editing === p.role ? (
            <div className="flex items-center gap-1">
              <Input
                type="number"
                inputMode="numeric"
                placeholder="••••"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                className="h-8 w-24 text-center font-mono"
                autoFocus
              />
              <Button size="sm" onClick={() => savePin(p.role)} disabled={saving}>OK</Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(null); setNewPin(""); }}>X</Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => { setEditing(p.role); setNewPin(""); }}>
              Cambiar PIN
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Portal Share Dialog ────────────────────────────────────────────────
   Public fixed URL for the Maniobra portal. Shows a printable QR code and
   a copy-link button. */

function PortalShareDialog({
  open, onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const portalUrl = `${window.location.origin}/portalmaniobra`;

  const copyLink = async () => {
    await navigator.clipboard.writeText(portalUrl);
    toast({ title: "Copiado", description: portalUrl });
  };

  const printQR = () => {
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    w.document.write(`
      <html><head><title>Portal Maniobra QR</title>
      <style>
        body { font-family: system-ui, sans-serif; text-align: center; padding: 60px 20px; }
        h1 { font-size: 32px; margin-bottom: 8px; }
        p { color: #555; margin: 4px 0; }
        .url { font-family: monospace; font-size: 14px; word-break: break-all; margin-top: 20px; }
        svg { margin: 30px auto; display: block; }
      </style>
      </head><body>
      <h1>Portal Maniobra</h1>
      <p>Escanea para ver el plan del día</p>
      ${document.getElementById("portal-qr-svg")?.outerHTML ?? ""}
      <p class="url">${portalUrl}</p>
      </body></html>
    `);
    w.document.close();
    setTimeout(() => w.print(), 250);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Compartir portal</DialogTitle>
          <DialogDescription>
            Link público para que el almacén y los cargadores vean el plan en vivo.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-6 items-start">
          {/* Left: QR code */}
          <div className="flex flex-col items-center gap-2">
            <div className="bg-white p-3 rounded-lg border">
              <QRCodeSVG id="portal-qr-svg" value={portalUrl} size={200} level="M" />
            </div>
            <Button variant="outline" size="sm" className="gap-2 w-full" onClick={printQR}>
              <Printer className="h-4 w-4" /> Imprimir QR
            </Button>
          </div>

          {/* Right: URL + actions + helper text */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Link del portal</label>
              <div className="flex items-center gap-2 mt-1">
                <Input value={portalUrl} readOnly className="font-mono text-xs" onClick={(e) => (e.target as HTMLInputElement).select()} />
                <Button size="icon" variant="outline" onClick={copyLink} title="Copiar link">
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  size="icon" variant="outline"
                  onClick={() => window.open(portalUrl, "_blank", "noopener,noreferrer")}
                  title="Abrir portal"
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              El link es fijo y público. Imprime el QR una vez y pégalo en la bodega.
              Cualquiera con el link puede ver el plan; las acciones de contar y editar requieren un PIN.
            </p>
          </div>
        </div>

        <PinSettingsSection />
      </DialogContent>
    </Dialog>
  );
}

/* ── Shared product row ── */
function ProductRow({ item, showClave, shortage }: { item: ManiobraProduct; showClave?: boolean; shortage?: number }) {
  return (
    <div className={cn(
      "flex items-center gap-3 text-sm py-0.5",
      shortage && "border border-red-400 rounded-md px-2 py-1 bg-red-50/50 dark:bg-red-950/20"
    )}>
      <ProductThumb src={item.image_url} size="md" />
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{item.product_name}</p>
        {showClave && <p className="text-xs text-muted-foreground">{item.product_clave}</p>}
      </div>
      <span className="font-semibold tabular-nums">x{item.quantity}</span>
      {shortage && (
        <span className="text-xs font-semibold text-red-500 whitespace-nowrap">Faltan {shortage}</span>
      )}
    </div>
  );
}
