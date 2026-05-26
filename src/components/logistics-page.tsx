import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GlowCard } from "@/components/ui/spotlight-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ProductThumb } from "@/components/ui/product-thumb";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Truck, CalendarIcon, Users, Package, ChevronLeft, ChevronRight, DollarSign, Phone, Contact,
  AlertTriangle, CheckCircle2, MapPin, Clock, Loader2, GripVertical
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, addWeeks, addMonths, subWeeks, subMonths, isSameMonth, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, type CollisionDetection, type DragStartEvent, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

/* ── Helpers ── */

const mxnFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

function parseLocalDate(d: string) {
  return new Date(d + "T12:00:00");
}
function dateToString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ── Truck & Staff Data ── */

interface TruckOption {
  provider: string;
  type: string;
  tons: number;
  bultos: number;
  price: number;
  units: number;
}

const TRUCKS: TruckOption[] = [
  { provider: "Fernando", type: "Camioneta", tons: 6, bultos: 300, price: 3000, units: 1 },
  { provider: "Rodolfo", type: "Rabón", tons: 8, bultos: 400, price: 3000, units: 1 },
  { provider: "Rodolfo", type: "Tortón", tons: 14, bultos: 700, price: 3400, units: 2 },
  { provider: "Fernando", type: "Tortón", tons: 14, bultos: 700, price: 4000, units: 1 },
  { provider: "Rodolfo", type: "Tráiler", tons: 22, bultos: 1100, price: 7000, units: 1 },
].sort((a, b) => a.bultos - b.bultos);

const BULTOS_PER_PERSON = 225;
const MANAGER_COST = 700;
const EXTRA_PERSON_COST = 500;

function calcStaffCost(people: number): number {
  if (people <= 0) return 0;
  return MANAGER_COST + Math.max(0, people - 1) * EXTRA_PERSON_COST;
}

function recommendTruck(bultos: number): TruckOption {
  return TRUCKS.find(t => t.bultos >= bultos) ?? TRUCKS[TRUCKS.length - 1];
}

function recommendTruckMulti(bultos: number): { trucks: TruckOption[]; totalPrice: number } {
  // Greedy: fill with largest trucks first, then fit remainder
  let remaining = bultos;
  const used: TruckOption[] = [];
  const sorted = [...TRUCKS].sort((a, b) => b.bultos - a.bultos);
  for (const t of sorted) {
    while (remaining > 0 && used.filter(u => u.type === t.type && u.provider === t.provider).length < t.units) {
      if (remaining <= 0) break;
      // Only use this truck if it makes sense (remaining is more than half its capacity, or it's the smallest available)
      used.push(t);
      remaining -= t.bultos;
    }
  }
  // Optimize: try to remove trucks that aren't needed
  used.sort((a, b) => a.price - b.price);
  const optimized: TruckOption[] = [];
  let needed = bultos;
  // Re-pick from largest to smallest for best fit
  const picked = [...used].sort((a, b) => b.bultos - a.bultos);
  for (const t of picked) {
    if (needed > 0) {
      optimized.push(t);
      needed -= t.bultos;
    }
  }
  return { trucks: optimized, totalPrice: optimized.reduce((s, t) => s + t.price, 0) };
}

/* ── Types ── */

interface OrderDay {
  order_id: string;
  order_code: string;
  delivery_date: string;
  client_name: string;
  client_address: string;
  status: string;
  bultos: number;
  items: { product_name: string; product_clave: string; quantity: number; unit_price: number; image_url: string | null }[];
  revenue: number;
}

/* ── Component ── */

/* ── Contacts Directory ── */

interface DirectoryContact {
  name: string;
  phone: string;
  role: string;
}

const TRUCK_CONTACTS: DirectoryContact[] = [
  { name: "Rodolfo", phone: "+52 1 55 7144 0965", role: "4 unidades" },
  { name: "Fernando", phone: "+52 1 55 2947 5022", role: "2 unidades" },
];

const STAFF_CONTACTS: DirectoryContact[] = [
  { name: "Juan", phone: "+52 55 3117 7570", role: "Encargado — $700/día" },
];

/* ── Auto-split helper ── */
/* Skip weekends: returns the nth business day from a base date */
function addBusinessDays(base: Date, n: number): Date {
  let d = new Date(base);
  let added = 0;
  while (added < n) {
    d = addDays(d, 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) added++;
  }
  return d;
}

function autoSplitOrder(bultos: number, items: { product_clave: string; product_name: string; quantity: number; unit_price: number }[], trucks: TruckOption[]) {
  const maxTruck = trucks[trucks.length - 1]; // largest truck
  if (bultos <= maxTruck.bultos) return null; // no split needed

  const trips: { truck: TruckOption; items: { product_clave: string; product_name: string; quantity: number }[]; totalBultos: number }[] = [];

  // Track how many units of each truck type have been used (across trips)
  const usedUnits = new Map<string, number>();
  const truckKey = (t: TruckOption) => `${t.provider}-${t.type}`;

  // Work with remaining quantities
  const remaining = items.map(i => ({ ...i, left: i.quantity }));
  let totalLeft = bultos;

  while (totalLeft > 0) {
    // Pick the best available truck for remaining (respecting unit limits)
    const sorted = [...trucks].sort((a, b) => b.bultos - a.bultos);
    let truck: TruckOption | null = null;
    for (const t of sorted) {
      const used = usedUnits.get(truckKey(t)) ?? 0;
      if (used >= t.units) continue; // no more of this truck available
      if (totalLeft > t.bultos || t.bultos >= totalLeft) {
        truck = t;
        break;
      }
    }
    // Fallback: if all large trucks exhausted, pick any available truck
    if (!truck) {
      for (const t of sorted) {
        const used = usedUnits.get(truckKey(t)) ?? 0;
        if (used < t.units) { truck = t; break; }
      }
    }
    if (!truck) break; // no trucks available at all

    usedUnits.set(truckKey(truck), (usedUnits.get(truckKey(truck)) ?? 0) + 1);
    let tripCapacity = truck.bultos;
    const tripItems: { product_clave: string; product_name: string; quantity: number }[] = [];
    let tripBultos = 0;

    for (const item of remaining) {
      if (item.left <= 0 || tripCapacity <= 0) continue;
      const take = Math.min(item.left, tripCapacity);
      tripItems.push({ product_clave: item.product_clave, product_name: item.product_name, quantity: take });
      item.left -= take;
      tripCapacity -= take;
      tripBultos += take;
      totalLeft -= take;
    }

    if (tripBultos > 0) {
      trips.push({ truck, items: tripItems, totalBultos: tripBultos });
    } else {
      break; // safety
    }
  }

  return trips;
}

export default function Logistics() {
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<"week" | "month">("month");
  const [pageView, setPageView] = useState<"calendar" | "directory">("calendar");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [multiDelivery, setMultiDelivery] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderDay | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [scheduling, setScheduling] = useState(false);
  const [expandedTrips, setExpandedTrips] = useState<Set<string>>(new Set());
  const [customTripDates, setCustomTripDates] = useState<Record<number, string>>({});
  const [customTripTrucks, setCustomTripTrucks] = useState<Record<number, TruckOption>>({});
  const queryClient = useQueryClient();

  // Date range based on view
  const viewRange = useMemo(() => {
    if (dateFrom && dateTo) return { start: dateFrom, end: dateTo };
    if (viewMode === "week") {
      const s = startOfWeek(currentDate, { weekStartsOn: 1 });
      const e = endOfWeek(currentDate, { weekStartsOn: 1 });
      return { start: dateToString(s), end: dateToString(e) };
    }
    const s = startOfMonth(currentDate);
    const e = endOfMonth(currentDate);
    return { start: dateToString(s), end: dateToString(e) };
  }, [viewMode, currentDate, dateFrom, dateTo]);

  // Fetch orders with items
  const { data: orderDays = [], isLoading } = useQuery({
    queryKey: ["logistics-orders", viewRange.start, viewRange.end],
    queryFn: async () => {
      const { data: orders, error: ordErr } = await (supabase as any)
        .from("orders")
        .select("id, order_code, delivery_date, status, client_id, discount_amount, clients(name, address)")
        .neq("status", "Cancelado")
        .gte("delivery_date", viewRange.start)
        .lte("delivery_date", viewRange.end)
        .order("delivery_date", { ascending: true });
      if (ordErr) throw ordErr;
      if (!orders?.length) return [];

      const orderIds = orders.map(o => o.id);
      const { data: items, error: itemErr } = await supabase
        .from("order_items")
        .select("order_id, product_id, quantity, unit_price_override, products(clave, name, sale_price_with_iva, image_url)")
        .in("order_id", orderIds);
      if (itemErr) throw itemErr;

      const itemsByOrder = new Map<string, typeof items>();
      for (const item of items ?? []) {
        const arr = itemsByOrder.get(item.order_id) ?? [];
        arr.push(item);
        itemsByOrder.set(item.order_id, arr);
      }

      return orders.map((o: any) => {
        const orderItems = (itemsByOrder.get(o.id) ?? []).map((i: any) => ({
          product_name: i.products?.name ?? "",
          product_clave: i.products?.clave ?? "",
          quantity: Number(i.quantity) || 0,
          unit_price: Number(i.unit_price_override ?? i.products?.sale_price_with_iva) || 0,
          image_url: i.products?.image_url ?? null,
        }));
        const bultos = orderItems.reduce((s, i) => s + i.quantity, 0);
        const grossRevenue = orderItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);
        const discount = Math.min(Number(o.discount_amount) || 0, grossRevenue);
        const revenue = Math.max(0, grossRevenue - discount);
        return {
          order_id: o.id,
          order_code: o.order_code,
          delivery_date: o.delivery_date,
          client_name: o.clients?.name ?? "Sin cliente",
          client_address: o.clients?.address ?? "",
          status: o.status,
          bultos,
          items: orderItems,
          revenue,
        } as OrderDay;
      });
    },
  });

  // Group orders by date
  const ordersByDate = useMemo(() => {
    const map = new Map<string, OrderDay[]>();
    for (const o of orderDays) {
      const arr = map.get(o.delivery_date) ?? [];
      arr.push(o);
      map.set(o.delivery_date, arr);
    }
    return map;
  }, [orderDays]);

  // Fetch last seen timestamp
  const { data: lastSeen } = useQuery({
    queryKey: ["logistics-last-seen"],
    queryFn: async () => {
      const { data } = await supabase.from("logistics_last_seen").select("last_checked_at").eq("id", 1).single();
      return data?.last_checked_at ?? new Date().toISOString();
    },
  });

  // Fetch unread changes
  const { data: changes = [], refetch: refetchChanges } = useQuery({
    queryKey: ["order-changes", lastSeen],
    queryFn: async () => {
      if (!lastSeen) return [];
      const { data, error } = await supabase
        .from("order_changes")
        .select("id, created_at, table_name, operation, order_id, field_name, old_value, new_value, summary")
        .gt("created_at", lastSeen)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!lastSeen,
  });

  // Map changes to delivery dates (via order_id → orderDays)
  const changedDates = useMemo(() => {
    const dates = new Set<string>();
    for (const c of changes) {
      const order = orderDays.find(o => o.order_id === c.order_id);
      if (order) dates.add(order.delivery_date);
    }
    return dates;
  }, [changes, orderDays]);

  // Fetch scheduled delivery trips for the calendar view
  const { data: calendarTrips = [] } = useQuery({
    queryKey: ["calendar-trips", viewRange.start, viewRange.end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_trips")
        .select("id, trip_date, truck_provider, truck_type, truck_capacity_bultos, status, delivery_trip_items(order_id, quantity, orders(order_code, client_id, clients(name)))")
        .gte("trip_date", viewRange.start)
        .lte("trip_date", viewRange.end)
        .order("trip_date", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((t: any) => {
        const items = t.delivery_trip_items ?? [];
        return {
          id: t.id,
          trip_date: t.trip_date,
          truck_provider: t.truck_provider,
          truck_type: t.truck_type,
          status: t.status,
          bultos: items.reduce((s: number, i: any) => s + (i.quantity || 0), 0),
          order_code: items[0]?.orders?.order_code ?? "—",
          client_name: items[0]?.orders?.clients?.name ?? "—",
          order_ids: [...new Set(items.map((i: any) => i.order_id).filter(Boolean))] as string[],
        };
      }).filter(t => t.bultos > 0);
    },
  });

  // Group trips by date
  const tripsByDate = useMemo(() => {
    const map = new Map<string, typeof calendarTrips>();
    for (const t of calendarTrips) {
      const arr = map.get(t.trip_date) ?? [];
      arr.push(t);
      map.set(t.trip_date, arr);
    }
    return map;
  }, [calendarTrips]);

  // Set of order_ids that already have scheduled trips (to avoid duplicate cards)
  const ordersWithTrips = useMemo(() => {
    const ids = new Set<string>();
    for (const t of calendarTrips) {
      for (const oid of t.order_ids) ids.add(oid);
    }
    return ids;
  }, [calendarTrips]);

  // Trip numbering: "1/2", "2/2" for multi-trip orders
  const tripLabels = useMemo(() => {
    const byOrder = new Map<string, typeof calendarTrips>();
    for (const t of calendarTrips) {
      for (const oid of t.order_ids) {
        const arr = byOrder.get(oid) ?? [];
        arr.push(t);
        byOrder.set(oid, arr);
      }
    }
    const labels = new Map<string, string>();
    for (const [, trips] of byOrder) {
      if (trips.length <= 1) continue;
      const sorted = [...trips].sort((a, b) => (a.trip_date ?? "").localeCompare(b.trip_date ?? ""));
      sorted.forEach((t, i) => labels.set(t.id, `${i + 1}/${sorted.length}`));
    }
    return labels;
  }, [calendarTrips]);

  // Update trip date handler
  const handleUpdateTripDate = async (tripId: string, newDate: string) => {
    const { error } = await supabase.from("delivery_trips").update({ trip_date: newDate }).eq("id", tripId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      // Also sync orders.delivery_date for associated orders
      const trip = calendarTrips.find(t => t.id === tripId);
      if (trip && trip.order_ids?.length > 0) {
        await supabase.from("orders").update({ delivery_date: newDate }).in("id", trip.order_ids);
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: ["logistics-orders"] });
      }
      setSelectedDay(null); // close dialog so stale data isn't shown
      queryClient.invalidateQueries({ queryKey: ["calendar-trips"] });
      queryClient.invalidateQueries({ queryKey: ["order-trips"] });
      toast({ title: "Fecha actualizada" });
    }
  };


  // Fetch existing trips for selected order
  const { data: orderTrips = [], refetch: refetchOrderTrips } = useQuery({
    queryKey: ["order-trips", selectedOrder?.order_id],
    queryFn: async () => {
      if (!selectedOrder) return [];
      const { data, error } = await supabase
        .from("delivery_trip_items")
        .select("quantity, delivery_trips(id, trip_date, truck_provider, truck_type, truck_capacity_bultos, status)")
        .eq("order_id", selectedOrder.order_id);
      if (error) throw error;
      // Group by trip
      const tripMap = new Map<string, { trip: any; totalBultos: number }>();
      for (const item of data ?? []) {
        const trip = (item as any).delivery_trips;
        if (!trip) continue;
        if (!tripMap.has(trip.id)) tripMap.set(trip.id, { trip, totalBultos: 0 });
        tripMap.get(trip.id)!.totalBultos += item.quantity;
      }
      return [...tripMap.values()].sort((a, b) => (a.trip.trip_date ?? "").localeCompare(b.trip.trip_date ?? ""));
    },
    enabled: !!selectedOrder,
  });

  // Auto-schedule trips for an order
  const handleAutoSchedule = async (order: OrderDay) => {
    const split = autoSplitOrder(order.bultos, order.items, TRUCKS);
    if (!split) return;

    setScheduling(true);
    try {
      const baseDate = parseLocalDate(order.delivery_date);
      for (let i = 0; i < split.length; i++) {
        const trip = split[i];
        const truck = customTripTrucks[i] || trip.truck;
        const tripDate = customTripDates[i] || dateToString(i === 0 ? baseDate : addBusinessDays(baseDate, i));
        const people = Math.ceil(trip.totalBultos / BULTOS_PER_PERSON);
        const staffCost = calcStaffCost(people);

        // Create trip
        const { data: newTrip, error: tripErr } = await supabase
          .from("delivery_trips")
          .insert({
            trip_date: tripDate,
            truck_provider: truck.provider,
            truck_type: truck.type,
            truck_capacity_bultos: truck.bultos,
            truck_cost: truck.price,
            staff_count: people,
            staff_cost: staffCost,
          })
          .select("id")
          .single();
        if (tripErr) throw tripErr;

        // Get product_ids from order items
        const orderItemsData = await supabase
          .from("order_items")
          .select("product_id, products(clave)")
          .eq("order_id", order.order_id);

        // Map clave to product_id
        const claveToProductId = new Map<string, string>();
        for (const oi of orderItemsData.data ?? []) {
          claveToProductId.set((oi as any).products?.clave ?? "", oi.product_id);
        }

        // Insert trip items
        const tripItems = trip.items
          .map(item => ({
            trip_id: newTrip.id,
            order_id: order.order_id,
            product_id: claveToProductId.get(item.product_clave) ?? "",
            quantity: item.quantity,
          }))
          .filter(ti => ti.product_id);

        if (tripItems.length > 0) {
          const { error: itemsErr } = await supabase.from("delivery_trip_items").insert(tripItems);
          if (itemsErr) throw itemsErr;
        }
      }

      toast({ title: `${split.length} viajes programados automáticamente` });
      refetchOrderTrips();
      queryClient.invalidateQueries({ queryKey: ["calendar-trips"] });
      queryClient.invalidateQueries({ queryKey: ["logistics-orders"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setScheduling(false);
    }
  };

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const start = parseLocalDate(viewRange.start);
    const end = parseLocalDate(viewRange.end);
    const days: string[] = [];
    let d = start;
    while (d <= end) {
      days.push(dateToString(d));
      d = addDays(d, 1);
    }
    return days;
  }, [viewRange]);

  // Summary KPIs for the range
  const summary = useMemo(() => {
    let totalBultos = 0;
    let totalTruckCost = 0;
    let totalStaffCost = 0;
    const activeDays = new Set<string>();

    // 1. Count scheduled trips (already have assigned trucks)
    for (const t of calendarTrips) {
      totalBultos += t.bultos;
      activeDays.add(t.trip_date);
      const truck = TRUCKS.find(tr => tr.type === t.truck_type && tr.provider === t.truck_provider);
      if (truck) totalTruckCost += truck.price;
    }

    // 2. Count orders WITHOUT trips
    for (const [date, orders] of ordersByDate) {
      const visibleOrders = orders.filter(o => !ordersWithTrips.has(o.order_id));
      const dayBultos = visibleOrders.reduce((s, o) => s + o.bultos, 0);
      totalBultos += dayBultos;

      if (dayBultos > 0) {
        activeDays.add(date);
        if (multiDelivery) {
          const truck = recommendTruck(dayBultos);
          if (dayBultos > truck.bultos) {
            totalTruckCost += recommendTruckMulti(dayBultos).totalPrice;
          } else {
            totalTruckCost += truck.price;
          }
        } else {
          const maxCap = TRUCKS[TRUCKS.length - 1].bultos;
          for (const o of visibleOrders) {
            if (o.bultos <= 0) continue;
            if (o.bultos > maxCap) {
              const split = autoSplitOrder(o.bultos, o.items, TRUCKS);
              if (split) {
                split.forEach(trip => { totalTruckCost += trip.truck.price; });
              }
            } else {
              totalTruckCost += recommendTruck(o.bultos).price;
            }
          }
        }
      }
    }

    // 3. Staff cost per active day (based on bultos that day)
    for (const day of activeDays) {
      const orderBultos = (ordersByDate.get(day) ?? [])
        .filter(o => !ordersWithTrips.has(o.order_id))
        .reduce((s, o) => s + o.bultos, 0);
      const tripBultos = (tripsByDate.get(day) ?? []).reduce((s, t) => s + t.bultos, 0);
      const dayTotal = orderBultos + tripBultos;
      if (dayTotal > 0) {
        const people = Math.ceil(dayTotal / BULTOS_PER_PERSON);
        totalStaffCost += calcStaffCost(people);
      }
    }

    return { totalBultos, totalTruckCost, totalStaffCost, totalCost: totalTruckCost + totalStaffCost, deliveryDays: activeDays.size, totalOrders: orderDays.length };
  }, [ordersByDate, orderDays, multiDelivery, calendarTrips, tripsByDate, ordersWithTrips]);

  // Navigation
  const goBack = () => {
    if (dateFrom) return;
    setCurrentDate(viewMode === "week" ? subWeeks(currentDate, 1) : subMonths(currentDate, 1));
  };
  const goForward = () => {
    if (dateFrom) return;
    setCurrentDate(viewMode === "week" ? addWeeks(currentDate, 1) : addMonths(currentDate, 1));
  };
  const goToday = () => {
    setDateFrom("");
    setDateTo("");
    setCurrentDate(new Date());
  };

  // Drag state
  const [activeDrag, setActiveDrag] = useState<{ type: "order" | "trip" | "day"; id: string; label: string; bultos: number; count?: number } | null>(null);
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);
  const pointerPosRef = useRef<{ x: number; y: number } | null>(null);

  // Track pointer while dragging so the ghost follows the cursor
  useEffect(() => {
    if (!activeDrag) { setPointerPos(null); pointerPosRef.current = null; return; }
    const onMove = (e: PointerEvent) => {
      const p = { x: e.clientX, y: e.clientY };
      pointerPosRef.current = p;
      setPointerPos(p);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [activeDrag]);

  // Custom collision detection: find droppables whose rect contains the cursor.
  // This is independent of the dnd-kit active draggable rect, so it works even
  // when dropping onto a day that already contains many trip rows.
  const cursorCollision = useCallback<CollisionDetection>((args) => {
    const p = pointerPosRef.current;
    if (!p) return [];
    const hits = [] as { id: string | number; data: { droppableContainer: any; value: number } }[];
    for (const c of args.droppableContainers) {
      const r = c.rect.current;
      if (!r) continue;
      if (p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom) {
        hits.push({ id: c.id, data: { droppableContainer: c, value: 0 } });
      }
    }
    return hits;
  }, []);

  // DnD sensors — require 8px movement before drag starts (so clicks still work)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // Handle drag start
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as any;
    if (data) setActiveDrag({ type: data.type, id: data.id, label: data.label, bultos: data.bultos, count: data.count });
  }, []);

  // Handle drag end — optimistic update: move card in UI instantly, sync DB in background
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;
    const targetDate = over.id as string;
    const d = parseLocalDate(targetDate);
    if (d.getDay() === 0 || d.getDay() === 6) {
      toast({ title: "No se puede entregar en fin de semana", variant: "destructive" });
      return;
    }
    const data = active.data.current as any;
    if (!data) return;

    const dateLabel = format(d, "EEE dd MMM", { locale: es });

    if (data.type === "order") {
      // Optimistic: update cache immediately
      queryClient.setQueryData(["logistics-orders", viewRange.start, viewRange.end], (old: OrderDay[] | undefined) =>
        (old ?? []).map(o => o.order_id === data.id ? { ...o, delivery_date: targetDate } : o)
      );
      toast({ title: `${data.label} → ${dateLabel}` });
      // DB sync
      const { error } = await supabase.from("orders").update({ delivery_date: targetDate }).eq("id", data.id);
      if (error) {
        queryClient.invalidateQueries({ queryKey: ["logistics-orders"] });
        toast({ title: "Error al mover", variant: "destructive" });
      } else {
        queryClient.invalidateQueries({ queryKey: ["orders"] });
      }

    } else if (data.type === "trip") {
      const orderIds: string[] = data.order_ids ?? [];
      // Optimistic: update trip cache
      queryClient.setQueryData(["calendar-trips", viewRange.start, viewRange.end], (old: any[] | undefined) =>
        (old ?? []).map((t: any) => t.id === data.id ? { ...t, trip_date: targetDate } : t)
      );
      // Optimistic: update orders cache so Orders tab reflects new date
      if (orderIds.length > 0) {
        const idSet = new Set(orderIds);
        queryClient.setQueryData(["logistics-orders", viewRange.start, viewRange.end], (old: OrderDay[] | undefined) =>
          (old ?? []).map(o => idSet.has(o.order_id) ? { ...o, delivery_date: targetDate } : o)
        );
      }
      toast({ title: `Viaje → ${dateLabel}` });
      // DB sync: update trip_date
      const { error } = await supabase.from("delivery_trips").update({ trip_date: targetDate }).eq("id", data.id);
      if (error) {
        queryClient.invalidateQueries({ queryKey: ["calendar-trips"] });
        toast({ title: "Error al mover", variant: "destructive" });
      }
      // DB sync: update orders.delivery_date so Orders tab stays in sync
      if (orderIds.length > 0) {
        await supabase.from("orders").update({ delivery_date: targetDate }).in("id", orderIds);
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: ["logistics-orders"] });
      }

    } else if (data.type === "day") {
      const sourceDate = data.id as string;
      const srcOrders = (ordersByDate.get(sourceDate) ?? []).filter(o => !ordersWithTrips.has(o.order_id));
      const srcTrips = tripsByDate.get(sourceDate) ?? [];
      const total = srcOrders.length + srcTrips.length;

      // Optimistic updates first
      if (srcOrders.length > 0) {
        const ids = new Set(srcOrders.map(o => o.order_id));
        queryClient.setQueryData(["logistics-orders", viewRange.start, viewRange.end], (old: OrderDay[] | undefined) =>
          (old ?? []).map(o => ids.has(o.order_id) ? { ...o, delivery_date: targetDate } : o)
        );
      }
      if (srcTrips.length > 0) {
        const tripIds = new Set(srcTrips.map(t => t.id));
        queryClient.setQueryData(["calendar-trips", viewRange.start, viewRange.end], (old: any[] | undefined) =>
          (old ?? []).map((t: any) => tripIds.has(t.id) ? { ...t, trip_date: targetDate } : t)
        );
      }
      toast({ title: `${total} ${total === 1 ? "entrega" : "entregas"} → ${dateLabel}` });

      // DB sync
      if (srcOrders.length > 0) {
        const ids = srcOrders.map(o => o.order_id);
        const { error } = await supabase.from("orders").update({ delivery_date: targetDate }).in("id", ids);
        if (error) queryClient.invalidateQueries({ queryKey: ["logistics-orders"] });
        else queryClient.invalidateQueries({ queryKey: ["orders"] });
      }
      if (srcTrips.length > 0) {
        const tripIds = srcTrips.map(t => t.id);
        const { error } = await supabase.from("delivery_trips").update({ trip_date: targetDate }).in("id", tripIds);
        if (error) queryClient.invalidateQueries({ queryKey: ["calendar-trips"] });
        // Also update orders.delivery_date for all orders associated with these trips
        const tripOrderIds = [...new Set(srcTrips.flatMap(t => t.order_ids ?? []))];
        if (tripOrderIds.length > 0) {
          await supabase.from("orders").update({ delivery_date: targetDate }).in("id", tripOrderIds);
          queryClient.invalidateQueries({ queryKey: ["orders"] });
          queryClient.invalidateQueries({ queryKey: ["logistics-orders"] });
        }
      }
    }
  }, [queryClient, toast, ordersByDate, tripsByDate, ordersWithTrips, viewRange]);

  // Draggable components are hoisted below the Logistics function (outside this
  // scope) to keep stable component identities across re-renders — otherwise
  // dnd-kit remounts nodes mid-drag and the transform animation breaks.

  // Day card renderer
  function DayCard({ date }: { date: string }) {
    const orders = ordersByDate.get(date) ?? [];
    const dayTrips = tripsByDate.get(date) ?? [];
    const visibleOrders = orders.filter(o => !ordersWithTrips.has(o.order_id));
    const tripBultos = dayTrips.reduce((s, t) => s + t.bultos, 0);
    const orderBultos = visibleOrders.reduce((s, o) => s + o.bultos, 0);
    const dayBultos = orderBultos + tripBultos;
    const people = dayBultos > 0 ? Math.ceil(dayBultos / BULTOS_PER_PERSON) : 0;
    const staffCost = calcStaffCost(people);
    const d = parseLocalDate(date);
    const today = isToday(d);

    // Truck recommendation
    let truckLabel = "";
    let truckCost = 0;
    const truckLabelsArr: string[] = [];
    // Trips already have assigned trucks
    for (const t of dayTrips) {
      const truck = TRUCKS.find(tr => tr.type === t.truck_type && tr.provider === t.truck_provider);
      if (truck) {
        truckCost += truck.price;
        truckLabelsArr.push(`${truck.type}`);
      }
    }
    // Visible orders (without trips)
    if (orderBultos > 0) {
      if (multiDelivery) {
        const truck = recommendTruck(orderBultos);
        if (orderBultos > truck.bultos) {
          const multi = recommendTruckMulti(orderBultos);
          truckLabelsArr.push(...multi.trucks.map(t => t.type));
          truckCost += multi.totalPrice;
        } else {
          truckLabelsArr.push(`${truck.type} (${truck.provider})`);
          truckCost += truck.price;
        }
      } else {
        const maxCap = TRUCKS[TRUCKS.length - 1].bultos;
        for (const o of visibleOrders) {
          if (o.bultos <= 0) continue;
          if (o.bultos > maxCap) {
            const split = autoSplitOrder(o.bultos, o.items, TRUCKS);
            if (split) {
              split.forEach(trip => { truckCost += trip.truck.price; truckLabelsArr.push(trip.truck.type); });
            }
          } else {
            const t = recommendTruck(o.bultos);
            truckCost += t.price;
            truckLabelsArr.push(`${t.type} (${t.provider})`);
          }
        }
      }
    }
    if (truckLabelsArr.length === 1) truckLabel = truckLabelsArr[0];
    else if (truckLabelsArr.length > 1) truckLabel = `${truckLabelsArr.length} camiones`;

    const totalDayCost = truckCost + staffCost;
    const isEmpty = visibleOrders.length === 0 && dayTrips.length === 0;
    const maxTruckCap = TRUCKS[TRUCKS.length - 1].bultos;
    // Only orange if there are unscheduled over-capacity orders
    const hasOverCapacity = visibleOrders.some(o => o.bultos > maxTruckCap);

    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const { setNodeRef: setDropRef, isOver } = useDroppable({ id: date, disabled: isWeekend });
    const itemCount = visibleOrders.length + dayTrips.length;

    return (
      <div
        ref={setDropRef}
        onClick={() => !isEmpty && !activeDrag && setSelectedDay(date)}
        className={cn(
          "rounded-lg border p-3 h-auto md:h-[200px] flex flex-col overflow-hidden transition-all",
          isEmpty ? "border-border/40"
            : hasOverCapacity ? "border-orange-400/40 bg-orange-500/10 cursor-pointer hover:bg-orange-500/15"
            : "border-blue-400/30 bg-blue-500/10 cursor-pointer hover:bg-blue-500/15",
          today && !isEmpty && (hasOverCapacity ? "ring-2 ring-orange-500/50" : "ring-2 ring-blue-500/50"),
          today && isEmpty && "border-blue-500/50",
          isOver && !isWeekend && "ring-2 ring-green-500/70 bg-green-500/10 border-green-400/50 scale-[1.02]",
          isOver && isWeekend && "ring-2 ring-red-500/70 bg-red-500/10 border-red-400/50 scale-[0.98]",
        )}>
        {/* Date header */}
        <div className="flex items-center justify-between mb-2 shrink-0">
          <span className={cn("text-xs font-medium flex items-center gap-1", today ? "text-blue-700" : "text-muted-foreground")}>
            <span className="hidden md:inline">{format(d, "EEE dd", { locale: es })}</span>
            <span className="md:hidden">{format(d, "EEEE dd MMM", { locale: es })}</span>
            {changedDates.has(date) && <span className="h-2.5 w-2.5 rounded-full bg-orange-500 animate-pulse shadow-[0_0_6px_rgba(249,115,22,0.6)]" />}
          </span>
          {dayBultos > 0 && (
            <Badge variant="secondary" className={cn("text-[10px] px-1.5 py-0", hasOverCapacity ? "bg-orange-500/20 text-orange-700 border-orange-400/30" : "bg-blue-500/20 text-blue-700 border-blue-400/30")}>
              {dayBultos} bultos
            </Badge>
          )}
        </div>

        {isEmpty ? (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-xs text-muted-foreground/40">Sin entregas</span>
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-1 min-h-0">
            {/* Truck & Staff & Cost in one compact row */}
            <div className="shrink-0 flex flex-col gap-0.5">
              <div className="flex items-center gap-1 text-[11px]">
                <Truck className="h-3 w-3 shrink-0 text-blue-700" />
                <span className="text-blue-700 truncate">{truckLabel}</span>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3 shrink-0 text-teal-700" />
                  <span className="text-teal-700">{people}p</span>
                </span>
                <span className="flex items-center gap-1">
                  <DollarSign className="h-3 w-3 shrink-0 text-emerald-700" />
                  <span className="text-emerald-700">{mxnFmt.format(totalDayCost)}</span>
                </span>
              </div>
            </div>

            {/* Orders — scrollable (hide orders that have scheduled trips) */}
            <div className="mt-0.5 space-y-1 flex-1 min-h-0 overflow-y-auto scrollbar-thin">
              {orders.filter(o => !ordersWithTrips.has(o.order_id)).map(o => (
                <DraggableOrderCard key={o.order_id} order={o} maxTruckCap={maxTruckCap} />
              ))}
              {/* Scheduled trips */}
              {dayTrips.map(t => (
                <DraggableTripCard key={t.id} trip={t} tripLabel={tripLabels.get(t.id)} />
              ))}
            </div>
            {/* Day-level drag handle — pinned at bottom, outside scroll */}
            {itemCount > 1 && (
              <DraggableDayHandle date={date} bultos={dayBultos} count={itemCount} />
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full p-4 md:p-8 overflow-auto">
      <AnimatedGridPattern className="absolute inset-0 opacity-20" />
      <div className="relative z-10 max-w-[1400px] mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Logística</h1>
            <p className="text-sm text-muted-foreground mt-1">Planificación de camiones, personal y entregas</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant={pageView === "directory" ? "default" : "outline"}
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setPageView(pageView === "calendar" ? "directory" : "calendar")}
            >
              <Contact className="h-3.5 w-3.5" />
              Directorio
            </Button>
            {/* Date pickers */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {dateFrom ? format(parseLocalDate(dateFrom), "dd MMM", { locale: es }) : "Desde"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar mode="single" selected={dateFrom ? parseLocalDate(dateFrom) : undefined}
                  onSelect={(d) => d && setDateFrom(dateToString(d))} locale={es} />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {dateTo ? format(parseLocalDate(dateTo), "dd MMM", { locale: es }) : "Hasta"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar mode="single" selected={dateTo ? parseLocalDate(dateTo) : undefined}
                  onSelect={(d) => d && setDateTo(dateToString(d))} locale={es} />
              </PopoverContent>
            </Popover>
            {(dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setDateFrom(""); setDateTo(""); }}>Limpiar</Button>
            )}
          </div>
        </div>

        {/* Controls bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={goBack}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" className="text-xs" onClick={goToday}>Hoy</Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={goForward}><ChevronRight className="h-4 w-4" /></Button>
            <span className="text-sm font-medium text-foreground ml-2 capitalize">
              {dateFrom && dateTo
                ? `${format(parseLocalDate(dateFrom), "dd MMM", { locale: es })} – ${format(parseLocalDate(dateTo), "dd MMM yyyy", { locale: es })}`
                : viewMode === "week"
                  ? `${format(parseLocalDate(viewRange.start), "dd MMM", { locale: es })} – ${format(parseLocalDate(viewRange.end), "dd MMM yyyy", { locale: es })}`
                  : format(currentDate, "MMMM yyyy", { locale: es })
              }
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Entregas compartidas</span>
              <Switch checked={multiDelivery} onCheckedChange={setMultiDelivery} />
            </div>
            <div className="flex items-center rounded-md border border-border">
              <button onClick={() => setViewMode("week")} className={cn("px-3 py-1.5 text-xs font-medium transition-colors rounded-l-md", viewMode === "week" ? "bg-blue-500/20 text-blue-700" : "text-muted-foreground hover:text-foreground")}>
                Semana
              </button>
              <button onClick={() => setViewMode("month")} className={cn("px-3 py-1.5 text-xs font-medium transition-colors rounded-r-md", viewMode === "month" ? "bg-blue-500/20 text-blue-700" : "text-muted-foreground hover:text-foreground")}>
                Mes
              </button>
            </div>
          </div>
        </div>

        {pageView === "directory" ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
            {/* Truck providers — left */}
            <div className="rounded-lg border border-border p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-blue-700" />
                <h2 className="text-lg font-semibold text-foreground">Proveedores de camiones</h2>
              </div>

              {/* Contact cards */}
              {TRUCK_CONTACTS.map(c => (
                <div key={c.name} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{c.role}</p>
                  </div>
                  <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="flex items-center gap-2 text-sm font-medium text-blue-700 hover:underline">
                    <Phone className="h-4 w-4" />
                    {c.phone}
                  </a>
                </div>
              ))}

              {/* Single unified pricing table */}
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="text-muted-foreground w-[120px]">Proveedor</TableHead>
                    <TableHead className="text-muted-foreground w-[100px]">Tipo</TableHead>
                    <TableHead className="text-muted-foreground text-center w-[80px]">Ton</TableHead>
                    <TableHead className="text-muted-foreground text-center w-[80px]">Bultos</TableHead>
                    <TableHead className="text-muted-foreground text-center w-[70px]">Uds</TableHead>
                    <TableHead className="text-muted-foreground text-right w-[90px]">Precio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...TRUCKS].sort((a, b) => a.bultos - b.bultos).map((t, i) => (
                    <TableRow key={`${t.provider}-${t.type}-${i}`} className="border-border">
                      <TableCell className="text-sm">{t.provider}</TableCell>
                      <TableCell className="text-sm font-medium">{t.type}</TableCell>
                      <TableCell className="text-center tabular-nums text-sm">{t.tons}t</TableCell>
                      <TableCell className="text-center tabular-nums text-sm">{t.bultos}</TableCell>
                      <TableCell className="text-center tabular-nums text-sm">{t.units}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm font-semibold text-blue-700">{mxnFmt.format(t.price)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </div>

            {/* Staff — right */}
            <div className="rounded-lg border border-border p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-teal-700" />
                <h2 className="text-lg font-semibold text-foreground">Personal</h2>
              </div>

              {STAFF_CONTACTS.map(c => (
                <div key={c.name} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{c.role}</p>
                  </div>
                  <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="flex items-center gap-2 text-sm font-medium text-teal-700 hover:underline">
                    <Phone className="h-4 w-4" />
                    {c.phone}
                  </a>
                </div>
              ))}

              <p className="text-sm font-semibold text-foreground">Tabla de costos</p>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="text-muted-foreground w-[120px]">Personas</TableHead>
                    <TableHead className="text-muted-foreground text-center w-[100px]">Capacidad</TableHead>
                    <TableHead className="text-muted-foreground text-right w-[90px]">Costo/día</TableHead>
                    <TableHead className="text-muted-foreground text-right">Desglose</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[1, 2, 3, 4, 5].map(n => (
                    <TableRow key={n} className="border-border">
                      <TableCell className="text-sm font-medium">{n} {n === 1 ? "persona" : "personas"}</TableCell>
                      <TableCell className="text-center tabular-nums text-sm whitespace-nowrap">{n * BULTOS_PER_PERSON} bultos</TableCell>
                      <TableCell className="text-right tabular-nums text-sm font-semibold text-teal-700">{mxnFmt.format(calcStaffCost(n))}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                        {mxnFmt.format(MANAGER_COST)}{n > 1 ? ` + ${n - 1} × ${mxnFmt.format(EXTRA_PERSON_COST)}` : " (encargado)"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </div>
          </div>
        ) : (
        <>
        {/* Summary KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <GlowCard>
            <div className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Package className="h-4 w-4 text-blue-500" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pedidos</span>
              </div>
              <p className="text-3xl font-bold text-foreground tracking-tight">{summary.totalOrders}</p>
            </div>
          </GlowCard>
          <GlowCard>
            <div className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Truck className="h-4 w-4 text-indigo-500" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bultos</span>
              </div>
              <p className="text-3xl font-bold text-foreground tracking-tight">{summary.totalBultos.toLocaleString()}</p>
            </div>
          </GlowCard>
          <GlowCard>
            <div className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <CalendarIcon className="h-4 w-4 text-violet-500" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Días de entrega</span>
              </div>
              <p className="text-3xl font-bold text-foreground tracking-tight">{summary.deliveryDays}</p>
            </div>
          </GlowCard>
          <GlowCard>
            <div className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Truck className="h-4 w-4 text-blue-500" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Costo camiones</span>
              </div>
              <p className="text-3xl font-bold text-blue-500 tracking-tight">{mxnFmt.format(summary.totalTruckCost)}</p>
            </div>
          </GlowCard>
          <GlowCard>
            <div className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-teal-500" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Costo personal</span>
              </div>
              <p className="text-3xl font-bold text-teal-500 tracking-tight">{mxnFmt.format(summary.totalStaffCost)}</p>
            </div>
          </GlowCard>
          <GlowCard>
            <div className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="h-4 w-4 text-emerald-500" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Costo total</span>
              </div>
              <p className="text-3xl font-bold text-emerald-500 tracking-tight">{mxnFmt.format(summary.totalCost)}</p>
            </div>
          </GlowCard>
        </div>

        {/* Calendar Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {Array.from({ length: viewMode === "week" ? 7 : 28 }).map((_, i) => (
              <Skeleton key={i} className="h-40 bg-muted rounded-lg" />
            ))}
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={cursorCollision} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            {/* Day-of-week headers — hidden on mobile since day name is shown per card */}
            <div className="hidden md:grid grid-cols-7 gap-3">
              {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(d => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
              ))}
            </div>
            {/* Days — single column on mobile (only days with deliveries), 7-col grid on desktop */}
            <div className="hidden md:grid grid-cols-7 gap-3">
              {viewMode === "month" && (() => {
                // Pad start of month to align with weekday
                const firstDay = parseLocalDate(calendarDays[0]);
                const dow = (firstDay.getDay() + 6) % 7; // 0=Mon
                return Array.from({ length: dow }).map((_, i) => <div key={`pad-${i}`} />);
              })()}
              {calendarDays.map(date => (
                <DayCard key={date} date={date} />
              ))}
            </div>
            {/* Mobile: vertical list showing only days with deliveries */}
            <div className="flex flex-col gap-3 md:hidden">
              {calendarDays.filter(date => {
                const orders = ordersByDate.get(date) ?? [];
                const dayTrips = tripsByDate.get(date) ?? [];
                const visibleOrders = orders.filter(o => !ordersWithTrips.has(o.order_id));
                return visibleOrders.length > 0 || dayTrips.length > 0;
              }).map(date => (
                <DayCard key={date} date={date} />
              ))}
              {calendarDays.filter(date => {
                const orders = ordersByDate.get(date) ?? [];
                const dayTrips = tripsByDate.get(date) ?? [];
                const visibleOrders = orders.filter(o => !ordersWithTrips.has(o.order_id));
                return visibleOrders.length > 0 || dayTrips.length > 0;
              }).length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-8">Sin entregas en este período</div>
              )}
            </div>
          </DndContext>
        )}
        {activeDrag && pointerPos && createPortal(
          <div
            style={{
              position: "fixed",
              left: pointerPos.x,
              top: pointerPos.y,
              transform: "translate(-50%, -50%)",
              pointerEvents: "none",
              zIndex: 9999,
            }}
          >
            {activeDrag.type === "day" ? (
              <div className="rounded-lg px-3 py-2 text-xs border bg-card shadow-2xl shadow-blue-500/30 border-blue-400/60" style={{ width: 180 }}>
                <div className="flex items-center gap-2 font-semibold whitespace-nowrap">
                  <Package className="h-3.5 w-3.5 text-blue-700 shrink-0" />
                  <span>{activeDrag.count} {activeDrag.count === 1 ? "entrega" : "entregas"}</span>
                </div>
                <div className="text-muted-foreground mt-0.5">{activeDrag.bultos} bultos</div>
              </div>
            ) : (
              <div className="rounded-lg px-3 py-2 text-xs border bg-card shadow-2xl shadow-blue-500/30 border-blue-400/60" style={{ width: 200 }}>
                <div className="flex items-center gap-2 font-semibold whitespace-nowrap overflow-hidden">
                  {activeDrag.type === "trip" ? <Truck className="h-3.5 w-3.5 text-teal-700 shrink-0" /> : <Package className="h-3.5 w-3.5 text-blue-700 shrink-0" />}
                  <span className="font-mono truncate">{activeDrag.label}</span>
                </div>
                <span className="text-muted-foreground">{activeDrag.bultos} bultos</span>
              </div>
            )}
          </div>,
          document.body
        )}

        {/* Day Summary Dialog */}
        <Dialog open={!!selectedDay && !selectedOrder} onOpenChange={(open) => !open && setSelectedDay(null)}>
          <DialogContent className="max-w-[95vw] sm:max-w-5xl max-h-[90vh] overflow-y-auto">
            {selectedDay && (() => {
              const dayOrders = (ordersByDate.get(selectedDay) ?? []).filter(o => !ordersWithTrips.has(o.order_id));
              const dayTripsDialog = tripsByDate.get(selectedDay) ?? [];
              const orderBultos = dayOrders.reduce((s, o) => s + o.bultos, 0);
              const tripBultos = dayTripsDialog.reduce((s, t) => s + t.bultos, 0);
              const dayBultos = orderBultos + tripBultos;
              const dayRevenue = dayOrders.reduce((s, o) => s + o.revenue, 0);
              const people = Math.ceil(dayBultos / BULTOS_PER_PERSON);
              const staffCost = calcStaffCost(people);
              const d = parseLocalDate(selectedDay);
              const totalItems = dayOrders.length + dayTripsDialog.length;

              // Truck calculation — for orders only (trips already have their own trucks)
              let truckInfo: { label: string; cost: number; details: string[] } = { label: "", cost: 0, details: [] };
              // Trip truck costs
              for (const t of dayTripsDialog) {
                const truck = TRUCKS.find(tr => tr.type === t.truck_type && tr.provider === t.truck_provider);
                if (truck) {
                  truckInfo.cost += truck.price;
                  truckInfo.details.push(`${t.order_code}${tripLabels.get(t.id) ? ` (${tripLabels.get(t.id)})` : ""}: ${t.truck_type} — ${t.truck_provider} — ${mxnFmt.format(truck.price)}`);
                }
              }
              // Order truck costs
              if (multiDelivery && orderBultos > 0) {
                const truck = recommendTruck(orderBultos);
                if (orderBultos > truck.bultos) {
                  const multi = recommendTruckMulti(orderBultos);
                  truckInfo.cost += multi.totalPrice;
                  multi.trucks.forEach(t => truckInfo.details.push(`${t.type} — ${t.provider} — ${mxnFmt.format(t.price)}`));
                } else {
                  truckInfo.cost += truck.price;
                  truckInfo.details.push(`${truck.type} — ${truck.provider} — ${mxnFmt.format(truck.price)}`);
                }
              } else {
                const maxCap = TRUCKS[TRUCKS.length - 1].bultos;
                for (const o of dayOrders.filter(o => o.bultos > 0)) {
                  if (o.bultos > maxCap) {
                    const split = autoSplitOrder(o.bultos, o.items, TRUCKS);
                    if (split) {
                      split.forEach((trip, i) => {
                        truckInfo.cost += trip.truck.price;
                        truckInfo.details.push(`${o.order_code} (${i + 1}/${split.length}): ${trip.truck.type} — ${trip.truck.provider} — ${mxnFmt.format(trip.truck.price)}`);
                      });
                    } else {
                      const multi = recommendTruckMulti(o.bultos);
                      truckInfo.cost += multi.totalPrice;
                      multi.trucks.forEach(t => truckInfo.details.push(`${o.order_code}: ${t.type} — ${t.provider} — ${mxnFmt.format(t.price)}`));
                    }
                  } else {
                    const t = recommendTruck(o.bultos);
                    truckInfo.cost += t.price;
                    truckInfo.details.push(`${o.order_code}: ${t.type} — ${t.provider} — ${mxnFmt.format(t.price)}`);
                  }
                }
              }
              truckInfo.label = truckInfo.details.length === 1 ? truckInfo.details[0] : `${truckInfo.details.length} camiones`;
              const totalDayCost = truckInfo.cost + staffCost;

              return (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-3">
                      <CalendarIcon className="h-5 w-5 text-blue-700" />
                      <span className="capitalize">{format(d, "EEEE dd 'de' MMMM yyyy", { locale: es })}</span>
                      <Badge variant="secondary" className="text-xs bg-blue-500/15 text-blue-700 border-blue-400/30">
                        {totalItems} {totalItems === 1 ? "entrega" : "entregas"}
                      </Badge>
                    </DialogTitle>
                  </DialogHeader>

                  <div className="space-y-5 mt-3">
                    {/* KPI row */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                      <div className="rounded-lg border border-border p-3">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Entregas</span>
                        <p className="text-lg font-bold text-foreground mt-0.5">{totalItems}</p>
                      </div>
                      <div className="rounded-lg border border-border p-3">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Bultos</span>
                        <p className="text-lg font-bold text-foreground mt-0.5">{dayBultos.toLocaleString()}</p>
                      </div>
                      {dayBultos > 0 && (
                      <div className="rounded-lg border border-border p-3">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Personal</span>
                        <p className="text-lg font-bold text-teal-700 mt-0.5">{people} {people === 1 ? "persona" : "personas"}</p>
                      </div>
                      )}
                      {truckInfo.cost > 0 && (
                      <div className="rounded-lg border border-border p-3">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Costo camiones</span>
                        <p className="text-lg font-bold text-blue-700 mt-0.5">{mxnFmt.format(truckInfo.cost)}</p>
                      </div>
                      )}
                      {dayBultos > 0 && (
                      <div className="rounded-lg border border-border p-3">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Costo personal</span>
                        <p className="text-lg font-bold text-teal-700 mt-0.5">{mxnFmt.format(staffCost)}</p>
                      </div>
                      )}
                      {totalDayCost > 0 && (
                      <div className="rounded-lg border border-border p-3">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Costo total</span>
                        <p className="text-lg font-bold text-emerald-700 mt-0.5">{mxnFmt.format(totalDayCost)}</p>
                      </div>
                      )}
                    </div>

                    {/* Truck & Staff detail — only show when there's data */}
                    {(truckInfo.details.length > 0 || dayBultos > 0) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {truckInfo.details.length > 0 && (
                      <div className="rounded-lg border border-border p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Truck className="h-4 w-4 text-blue-700" />
                          <span className="text-sm font-semibold text-foreground">Camiones</span>
                        </div>
                        <div className="space-y-1">
                          {truckInfo.details.map((d, i) => (
                            <p key={i} className="text-sm text-muted-foreground">{d}</p>
                          ))}
                        </div>
                      </div>
                      )}
                      {dayBultos > 0 && (
                      <div className="rounded-lg border border-border p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Users className="h-4 w-4 text-teal-700" />
                          <span className="text-sm font-semibold text-foreground">Personal</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {people} {people === 1 ? "persona" : "personas"} para {dayBultos} bultos ({BULTOS_PER_PERSON} bultos/persona)
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Encargado: {mxnFmt.format(MANAGER_COST)} {people > 1 ? `+ ${people - 1} extra${people > 2 ? "s" : ""}: ${mxnFmt.format((people - 1) * EXTRA_PERSON_COST)}` : ""}
                        </p>
                      </div>
                      )}
                    </div>
                    )}

                    {/* Revenue summary — only show when there are orders with revenue */}
                    {dayRevenue > 0 && (
                    <div className="rounded-lg border border-border p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <DollarSign className="h-4 w-4 text-emerald-700" />
                        <span className="text-sm font-semibold text-foreground">Venta del día</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                        <div>
                          <span className="text-xs text-muted-foreground">Venta bruta</span>
                          <p className="text-lg font-bold text-foreground">{mxnFmt.format(dayRevenue)}</p>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground">Costo logístico</span>
                          <p className="text-lg font-bold text-red-500">{mxnFmt.format(totalDayCost)}</p>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground">% logístico</span>
                          <p className="text-lg font-bold text-foreground">{dayRevenue > 0 ? ((totalDayCost / dayRevenue) * 100).toFixed(1) : 0}%</p>
                        </div>
                      </div>
                    </div>
                    )}

                    {/* Over-capacity warning */}
                    {(() => {
                      const maxCap = TRUCKS[TRUCKS.length - 1].bultos;
                      const overOrders = dayOrders.filter(o => o.bultos > maxCap);
                      if (overOrders.length === 0) return null;
                      return (
                        <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-4 space-y-2">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-orange-500" />
                            <span className="text-sm font-semibold text-orange-700">
                              {overOrders.length === 1 ? "1 pedido excede" : `${overOrders.length} pedidos exceden`} la capacidad máxima ({maxCap} bultos)
                            </span>
                          </div>
                          {overOrders.map(o => {
                            const split = autoSplitOrder(o.bultos, o.items, TRUCKS);
                            const tripsNeeded = split ? split.length : Math.ceil(o.bultos / maxCap);
                            return (
                              <div key={o.order_id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded border border-orange-400/20 bg-card/50">
                                <div className="flex items-center gap-3 flex-wrap">
                                  <span className="font-mono text-sm font-semibold">{o.order_code}</span>
                                  <span className="text-sm text-muted-foreground">{o.client_name}</span>
                                  <Badge className="bg-orange-500/15 text-orange-500 border-orange-500/30 text-[10px]">{o.bultos} bultos</Badge>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">Necesita {tripsNeeded} viajes</span>
                                  <Button size="sm" variant="outline" className="h-7 text-xs border-orange-500/30 text-orange-700 hover:bg-orange-500/10" onClick={() => { setSelectedOrder(o); setCustomTripDates({}); setCustomTripTrucks({}); }}>
                                    Planificar entregas
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}

                    {/* Scheduled trips for this day */}
                    {dayTripsDialog.length > 0 && (
                      <div>
                        <span className="text-sm font-semibold text-foreground mb-2 block">Viajes programados</span>
                        <div className="space-y-2">
                          {dayTripsDialog.map(t => {
                            const label = tripLabels.get(t.id);
                            const statusColor = t.status === "Entregado"
                              ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                              : t.status === "En ruta"
                              ? "bg-blue-500/15 text-blue-600 border-blue-500/30"
                              : "bg-teal-500/15 text-teal-600 border-teal-500/30";
                            const isExpanded = expandedTrips.has(t.id);
                            const orderData = t.order_ids?.length ? orderDays.find(o => t.order_ids.includes(o.order_id)) : null;
                            return (
                              <div key={t.id} className="rounded-lg border border-border bg-card/50 overflow-hidden">
                                <div className="flex items-center gap-3 p-3 flex-wrap">
                                  <Truck className="h-4 w-4 text-teal-700 shrink-0" />
                                  <span className="font-mono text-sm font-semibold">{t.order_code}</span>
                                  {label && <Badge variant="secondary" className="text-[10px]">Viaje {label}</Badge>}
                                  <Badge className={cn("text-[10px]", statusColor)}>{t.status}</Badge>
                                  <span className="text-sm text-muted-foreground">{t.client_name}</span>
                                  <span className="text-sm font-medium">{t.bultos} bultos</span>
                                  <span className="text-sm text-muted-foreground">{t.truck_type} ({t.truck_provider})</span>
                                  <div className="flex items-center gap-1.5 ml-auto">
                                    {orderData && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs text-blue-700 hover:text-blue-800"
                                        onClick={() => setExpandedTrips(prev => {
                                          const next = new Set(prev);
                                          next.has(t.id) ? next.delete(t.id) : next.add(t.id);
                                          return next;
                                        })}
                                      >
                                        {isExpanded ? "Ocultar" : "Ver pedido"}
                                      </Button>
                                    )}
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                                          <CalendarIcon className="h-3 w-3" />
                                          Cambiar fecha
                                        </Button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-auto p-0" align="end">
                                        <Calendar
                                          mode="single"
                                          locale={es}
                                          selected={parseLocalDate(t.trip_date)}
                                          onSelect={(date) => {
                                            if (date) handleUpdateTripDate(t.id, dateToString(date));
                                          }}
                                          disabled={(date) => date.getDay() === 0 || date.getDay() === 6}
                                        />
                                      </PopoverContent>
                                    </Popover>
                                  </div>
                                </div>
                                {/* Collapsible order details */}
                                {isExpanded && orderData && (
                                  <div className="border-t border-border px-3 pb-3 pt-2 overflow-x-auto">
                                    <Table>
                                      <TableHeader>
                                        <TableRow className="border-border">
                                          <TableHead className="text-muted-foreground text-xs">Clave</TableHead>
                                          <TableHead className="text-muted-foreground text-xs">Producto</TableHead>
                                          <TableHead className="text-muted-foreground text-xs text-center w-[60px]">Cant.</TableHead>
                                          <TableHead className="text-muted-foreground text-xs text-right w-[90px]">Subtotal</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {orderData.items.map((item, i) => (
                                          <TableRow key={i} className="border-border">
                                            <TableCell className="font-mono text-xs">{item.product_clave}</TableCell>
                                            <TableCell className="text-xs">
                                              <div className="flex items-center gap-2 min-w-0">
                                                <ProductThumb src={item.image_url} size="xs" />
                                                <span className="truncate">{item.product_name}</span>
                                              </div>
                                            </TableCell>
                                            <TableCell className="text-center tabular-nums text-xs">{item.quantity}</TableCell>
                                            <TableCell className="text-right tabular-nums text-xs">{mxnFmt.format(item.quantity * item.unit_price)}</TableCell>
                                          </TableRow>
                                        ))}
                                        <TableRow className="border-border bg-muted/30 font-semibold">
                                          <TableCell colSpan={2} className="text-xs">Total</TableCell>
                                          <TableCell className="text-center tabular-nums text-xs">{orderData.bultos}</TableCell>
                                          <TableCell className="text-right tabular-nums text-xs">{mxnFmt.format(orderData.revenue)}</TableCell>
                                        </TableRow>
                                      </TableBody>
                                    </Table>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Orders list */}
                    {dayOrders.length > 0 && (
                    <div>
                      <span className="text-sm font-semibold text-foreground mb-2 block">Pedidos del día</span>
                      <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-border">
                            <TableHead className="text-muted-foreground">Pedido</TableHead>
                            <TableHead className="text-muted-foreground">Cliente</TableHead>
                            <TableHead className="text-muted-foreground">Estado</TableHead>
                            <TableHead className="text-muted-foreground text-center">Bultos</TableHead>
                            {!multiDelivery && <TableHead className="text-muted-foreground">Camión</TableHead>}
                            <TableHead className="text-muted-foreground text-right">Venta</TableHead>
                            <TableHead className="text-muted-foreground text-right w-[60px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dayOrders.map(o => {
                            const oTruck = recommendTruck(o.bultos);
                            return (
                              <TableRow key={o.order_id} className="border-border">
                                <TableCell className="font-mono text-sm font-semibold">{o.order_code}</TableCell>
                                <TableCell className="text-sm">{o.client_name}</TableCell>
                                <TableCell>
                                  <Badge variant={o.status === "Entregado" ? "default" : "secondary"} className="text-[10px]">{o.status}</Badge>
                                </TableCell>
                                <TableCell className="text-center tabular-nums text-sm">{o.bultos}</TableCell>
                                {!multiDelivery && <TableCell className="text-sm text-muted-foreground">{oTruck.type} ({oTruck.provider})</TableCell>}
                                <TableCell className="text-right tabular-nums text-sm font-medium">{mxnFmt.format(o.revenue)}</TableCell>
                                <TableCell className="text-right">
                                  <Button variant="ghost" size="sm" className="text-xs text-blue-700 hover:text-blue-800" onClick={() => { setSelectedOrder(o); setCustomTripDates({}); setCustomTripTrucks({}); }}>
                                    Ver
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          <TableRow className="border-border bg-muted/30 font-semibold">
                            <TableCell colSpan={2} className="text-sm">Total</TableCell>
                            <TableCell />
                            <TableCell className="text-center tabular-nums text-sm">{dayBultos}</TableCell>
                            {!multiDelivery && <TableCell />}
                            <TableCell className="text-right tabular-nums text-sm">{mxnFmt.format(dayRevenue)}</TableCell>
                            <TableCell />
                          </TableRow>
                        </TableBody>
                      </Table>
                      </div>
                    </div>
                    )}
                  </div>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Order Detail Dialog */}
        <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
          <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
            {selectedOrder && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3">
                    <span className="font-mono text-lg">{selectedOrder.order_code}</span>
                    <Badge variant={selectedOrder.status === "Entregado" ? "default" : "secondary"} className="text-xs">
                      {selectedOrder.status}
                    </Badge>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  {/* Order info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <span className="text-xs text-muted-foreground">Cliente</span>
                      <p className="text-sm font-medium">{selectedOrder.client_name}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Dirección</span>
                      <p className="text-sm font-medium">{selectedOrder.client_address || "—"}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Fecha de entrega</span>
                      <p className="text-sm font-medium">{format(parseLocalDate(selectedOrder.delivery_date), "dd MMM yyyy", { locale: es })}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Total</span>
                      <p className="text-sm font-semibold text-blue-700">{mxnFmt.format(selectedOrder.revenue)}</p>
                    </div>
                  </div>

                  {/* Logistics info + auto-split */}
                  {(() => {
                    const maxTruck = TRUCKS[TRUCKS.length - 1];
                    const needsSplit = selectedOrder.bultos > maxTruck.bultos;
                    const split = needsSplit ? autoSplitOrder(selectedOrder.bultos, selectedOrder.items, TRUCKS) : null;
                    const truck = recommendTruck(selectedOrder.bultos);
                    const people = Math.ceil(selectedOrder.bultos / BULTOS_PER_PERSON);
                    const staffCost = calcStaffCost(people);

                    return (
                      <>
                        {/* Basic logistics info */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-3 rounded-lg bg-muted/30 border border-border">
                          <div className="flex items-center gap-2">
                            <Truck className="h-4 w-4 text-blue-700" />
                            <div>
                              <p className="text-xs text-muted-foreground">{needsSplit ? "Camión más grande" : "Camión recomendado"}</p>
                              <p className="text-sm font-medium text-blue-700">
                                {needsSplit
                                  ? `${maxTruck.type} (${maxTruck.provider}) — ${maxTruck.bultos} bultos max`
                                  : `${truck.type} (${truck.provider}) — ${mxnFmt.format(truck.price)}`
                                }
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-teal-700" />
                            <div>
                              <p className="text-xs text-muted-foreground">Personal</p>
                              <p className="text-sm font-medium text-teal-700">{people} {people === 1 ? "persona" : "personas"} — {mxnFmt.format(staffCost)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 text-emerald-700" />
                            <div>
                              <p className="text-xs text-muted-foreground">Bultos</p>
                              <p className="text-sm font-medium text-emerald-700">{selectedOrder.bultos} bultos</p>
                            </div>
                          </div>
                        </div>

                        {/* Auto-split warning + recommendation */}
                        {needsSplit && split && orderTrips.length === 0 && (
                          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="h-5 w-5 text-amber-500" />
                              <span className="text-sm font-semibold text-amber-700">
                                Este pedido necesita {split.length} viajes
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {selectedOrder.bultos} bultos exceden la capacidad del camión más grande ({maxTruck.bultos} bultos).
                              Se recomienda dividir en {split.length} viajes. Puedes ajustar las fechas antes de programar.
                            </p>

                            {/* Split preview with date pickers */}
                            <div className="space-y-2">
                              {split.map((trip, i) => {
                                const base = parseLocalDate(selectedOrder.delivery_date);
                                const defaultDate = dateToString(i === 0 ? base : addBusinessDays(base, i));
                                const tripDate = customTripDates[i] || defaultDate;
                                const activeTruck = customTripTrucks[i] || trip.truck;
                                const truckValue = `${activeTruck.provider}|${activeTruck.type}`;
                                return (
                                  <div key={i} className="flex items-center gap-2 p-2 rounded border border-border/50 bg-card/50 text-sm flex-wrap">
                                    <Badge variant="secondary" className="text-[10px] shrink-0">Viaje {i + 1}</Badge>
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs font-normal">
                                          <CalendarIcon className="h-3 w-3" />
                                          {format(parseLocalDate(tripDate), "EEE dd MMM", { locale: es })}
                                        </Button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar
                                          mode="single"
                                          locale={es}
                                          selected={parseLocalDate(tripDate)}
                                          onSelect={(d) => {
                                            if (d) setCustomTripDates(prev => ({ ...prev, [i]: dateToString(d) }));
                                          }}
                                          disabled={(date) => date.getDay() === 0 || date.getDay() === 6}
                                        />
                                      </PopoverContent>
                                    </Popover>
                                    <Select
                                      value={truckValue}
                                      onValueChange={(v) => {
                                        const [prov, typ] = v.split("|");
                                        const t = TRUCKS.find(tr => tr.provider === prov && tr.type === typ);
                                        if (t) setCustomTripTrucks(prev => ({ ...prev, [i]: t }));
                                      }}
                                    >
                                      <SelectTrigger className="h-7 w-auto min-w-[180px] text-xs gap-1">
                                        <Truck className="h-3 w-3 text-blue-700 shrink-0" />
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {TRUCKS.map(t => (
                                          <SelectItem key={`${t.provider}|${t.type}`} value={`${t.provider}|${t.type}`}>
                                            {t.type} ({t.provider}) — {t.bultos} bultos — {mxnFmt.format(t.price)}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <span className="text-xs font-medium">{trip.totalBultos} bultos</span>
                                    <span className="text-xs text-muted-foreground ml-auto">{mxnFmt.format(activeTruck.price)}</span>
                                  </div>
                                );
                              })}
                              <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs">
                                <span className="font-medium">Costo total: {mxnFmt.format(split.reduce((s, t, i) => s + (customTripTrucks[i] || t.truck).price, 0))}</span>
                              </div>
                            </div>

                            <Button
                              onClick={() => handleAutoSchedule(selectedOrder)}
                              disabled={scheduling}
                              className="w-full gap-2"
                            >
                              {scheduling ? (
                                <><Loader2 className="h-4 w-4 animate-spin" /> Programando...</>
                              ) : (
                                <><Truck className="h-4 w-4" /> Programar {split.length} viajes automáticamente</>
                              )}
                            </Button>
                          </div>
                        )}

                        {/* Existing trips for this order */}
                        {orderTrips.length > 0 && (
                          <div className="rounded-lg border border-border p-4 space-y-3">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                              <span className="text-sm font-semibold">
                                {orderTrips.length} {orderTrips.length === 1 ? "viaje programado" : "viajes programados"}
                              </span>
                            </div>
                            <div className="space-y-2">
                              {orderTrips.map(({ trip, totalBultos }) => {
                                const statusIcon = trip.status === "Entregado"
                                  ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                  : trip.status === "En ruta"
                                  ? <MapPin className="h-4 w-4 text-blue-500" />
                                  : <Clock className="h-4 w-4 text-amber-500" />;
                                const statusColor = trip.status === "Entregado"
                                  ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                                  : trip.status === "En ruta"
                                  ? "bg-blue-500/15 text-blue-500 border-blue-500/30"
                                  : "bg-amber-500/15 text-amber-500 border-amber-500/30";

                                return (
                                  <div key={trip.id} className="flex items-center gap-3 p-2 rounded border border-border/50 bg-card/50">
                                    {statusIcon}
                                    <span className="text-sm">{format(parseLocalDate(trip.trip_date), "EEE dd MMM", { locale: es })}</span>
                                    <Badge className={cn("text-[10px]", statusColor)}>{trip.status}</Badge>
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                      <Truck className="h-3 w-3" /> {trip.truck_type} ({trip.truck_provider})
                                    </span>
                                    <span className="text-xs font-medium ml-auto">{totalBultos} bultos</span>
                                  </div>
                                );
                              })}
                              {/* Delivery progress */}
                              {(() => {
                                const delivered = orderTrips.filter(t => t.trip.status === "Entregado").reduce((s, t) => s + t.totalBultos, 0);
                                const assigned = orderTrips.reduce((s, t) => s + t.totalBultos, 0);
                                const pct = Math.round((delivered / selectedOrder.bultos) * 100);
                                return (
                                  <div className="pt-2 border-t border-border/50">
                                    <div className="flex justify-between text-xs mb-1">
                                      <span className="text-muted-foreground">Progreso de entrega</span>
                                      <span className="font-medium">{delivered} / {selectedOrder.bultos} bultos ({pct}%)</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                                      <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}

                  {/* Items table */}
                  <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border">
                        <TableHead className="text-muted-foreground">Clave</TableHead>
                        <TableHead className="text-muted-foreground">Producto</TableHead>
                        <TableHead className="text-muted-foreground text-center w-[80px]">Cantidad</TableHead>
                        <TableHead className="text-muted-foreground text-right w-[120px]">P. Unitario</TableHead>
                        <TableHead className="text-muted-foreground text-right w-[120px]">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedOrder.items.map((item, i) => (
                        <TableRow key={i} className="border-border">
                          <TableCell className="font-mono text-sm">{item.product_clave}</TableCell>
                          <TableCell className="text-sm">
                            <div className="flex items-center gap-2 min-w-0">
                              <ProductThumb src={item.image_url} size="sm" />
                              <span className="truncate">{item.product_name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center tabular-nums text-sm">{item.quantity}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{mxnFmt.format(item.unit_price)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm font-medium">{mxnFmt.format(item.quantity * item.unit_price)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="border-border bg-muted/30 font-semibold">
                        <TableCell colSpan={2} className="text-sm">Total</TableCell>
                        <TableCell className="text-center tabular-nums text-sm">{selectedOrder.bultos}</TableCell>
                        <TableCell />
                        <TableCell className="text-right tabular-nums text-sm">{mxnFmt.format(selectedOrder.revenue)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
        </>
        )}
      </div>
    </div>
  );
}

/* ── Hoisted draggable components (stable identities for dnd-kit) ── */
type TripForDrag = {
  id: string;
  trip_date: string;
  truck_provider: string | null;
  truck_type: string | null;
  status: string | null;
  bultos: number;
  order_code: string;
  client_name: string;
  order_ids: string[];
};

function DraggableOrderCard({ order: o, maxTruckCap }: { order: OrderDay; maxTruckCap: number }) {
  const overCap = o.bultos > maxTruckCap;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `order-${o.order_id}`,
    data: { type: "order", id: o.order_id, label: o.order_code, bultos: o.bultos },
  });
  const style: React.CSSProperties = {
    opacity: isDragging ? 0 : undefined,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "w-full text-left rounded px-2 py-1 text-[11px] border bg-card cursor-grab active:cursor-grabbing touch-none transition-opacity duration-200",
        overCap ? "border-orange-400/30" : "border-blue-400/20",
        isDragging && "opacity-30",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono font-semibold text-foreground flex items-center gap-1">
          <GripVertical className="h-3 w-3 text-muted-foreground/40 shrink-0" />
          {overCap && <AlertTriangle className="h-3 w-3 text-orange-500 shrink-0" />}
          {o.order_code}
        </span>
        <span className={overCap ? "text-orange-500 font-semibold" : "text-muted-foreground"}>{o.bultos}b</span>
      </div>
      <div className="text-muted-foreground truncate ml-4">{o.client_name}</div>
    </div>
  );
}

function DraggableTripCard({ trip: t, tripLabel }: { trip: TripForDrag; tripLabel?: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `trip-${t.id}`,
    data: { type: "trip", id: t.id, label: `${t.order_code}${tripLabel ? ` (${tripLabel})` : ""}`, bultos: t.bultos, order_ids: t.order_ids },
  });
  const style: React.CSSProperties = {
    opacity: isDragging ? 0 : undefined,
  };
  const statusColor = t.status === "Entregado"
    ? "border-emerald-400/40 bg-emerald-500/5"
    : t.status === "En ruta"
    ? "border-blue-400/40 bg-blue-500/5"
    : "border-teal-400/30 bg-teal-500/5";
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "w-full text-left rounded px-2 py-1 text-[11px] border cursor-grab active:cursor-grabbing touch-none transition-opacity duration-200",
        statusColor,
        isDragging && "opacity-30",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 font-semibold text-teal-700">
          <GripVertical className="h-3 w-3 text-muted-foreground/40 shrink-0" />
          {t.order_code}
          {tripLabel && <span className="text-[9px] font-normal text-teal-500">({tripLabel})</span>}
        </span>
        <span className="text-teal-600">{t.bultos}b</span>
      </div>
      <div className="text-muted-foreground truncate ml-4">{t.truck_type} · {t.client_name}</div>
    </div>
  );
}

function DraggableDayHandle({ date, bultos, count }: { date: string; bultos: number; count: number }) {
  const d = parseLocalDate(date);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `day-${date}`,
    data: { type: "day", id: date, label: format(d, "EEE dd", { locale: es }), bultos, count },
  });
  const style: React.CSSProperties = {
    opacity: isDragging ? 0 : undefined,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "w-full shrink-0 mt-0.5 rounded px-2 py-0.5 text-[9px] border border-dashed border-muted-foreground/15 bg-muted/10 cursor-grab active:cursor-grabbing touch-none transition-opacity duration-200 hover:border-muted-foreground/40 hover:bg-muted/30",
        isDragging && "opacity-30",
      )}
    >
      <div className="flex items-center justify-center gap-1 text-muted-foreground/50">
        <GripVertical className="h-2.5 w-2.5 shrink-0" />
        <span>Mover {count} entregas</span>
      </div>
    </div>
  );
}
