/**
 * Warehouse / Kardex page (`/almacen`, legacy alias `/inventario` → redirect)
 *
 * Visual 2D map of the warehouse. Each block renders as a card with a
 * grid of slot tiles. Tap any tile → drawer with contents + recent
 * movements. Foundation for the Kardex; writes (ajustes, reubicación,
 * picking) come in follow-up commits.
 *
 * Data model (see migration 20260506120000_warehouse_kardex.sql):
 *   warehouse_slots   — physical addresses ("104-A-01")
 *   slot_contents     — what's currently in each slot (multi-SKU allowed)
 *   slot_movements    — every change to slot_contents = one row (Kardex)
 */

import { useMemo, useState, useEffect, useCallback, createContext, useContext } from "react";
import { Link } from "@/lib/router-compat";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProductThumb } from "@/components/ui/product-thumb";
import { Search, Lock, Package, PackageCheck, PackageOpen, Inbox, Truck, Pencil, Plus, Trash2, Download, FileSpreadsheet, Loader2, ScanLine, MoveRight, History, PackageX, XCircle, CheckCircle2, Layers, MapPin, CalendarClock, Undo2, RotateCcw, Hand } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { parseLocalDate } from "@/lib/date-utils";
import * as XLSX from "xlsx-js-style";
import { toast } from "sonner";
import { BarcodeScannerDialog, type ScannerMode } from "@/components/warehouse/BarcodeScannerDialog";
import { ImportInventoryDialog } from "@/components/warehouse/ImportInventoryDialog";
import { HistoricalInventoryDialog } from "@/components/warehouse/HistoricalInventoryDialog";
import { OrdersToFulfillPanel, type OrderToFulfill } from "@/components/warehouse/OrdersToFulfillPanel";
import { FulfillOrderDialog } from "@/components/warehouse/FulfillOrderDialog";
import { ScannerPickDialog } from "@/components/warehouse/ScannerPickDialog";
import { RecentMovementsSheet } from "@/components/warehouse/RecentMovementsSheet";

/** Human-readable labels for slot_movements.reason values shown in
 *  the Kardex column. "seed" is what the initial Excel import wrote;
 *  the customer-facing label needs to make sense to a warehouse
 *  manager, not to a developer. */
const REASON_LABELS: Record<string, string> = {
  seed: "Carga inicial",
  entrada: "Entrada",
  pedido: "Pedido",
  ajuste: "Ajuste",
  reubicacion: "Reubicación",
};

/** Color hint per reason for the Kardex badge. */
const REASON_BADGE_CLASS: Record<string, string> = {
  seed: "bg-gray-500/10 text-gray-600 border-gray-500/30",
  entrada: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  pedido: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  ajuste: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  reubicacion: "bg-purple-500/10 text-purple-600 border-purple-500/30",
};

interface Slot {
  id: string;
  code: string;
  block: number | null;
  row_letter: string | null;       // A / B / C — physical FLOOR
  position: number | null;          // 1 = left tarima, 2 = right
  zone: "storage" | "recibo" | "embarque";
  blocked: boolean;
  access_type: "apilador" | "patines" | "manual" | "damaged";
  active: boolean;
}

interface SlotContent {
  id: string;
  slot_id: string;
  product_id: string | null;
  description: string | null;
  lote: string | null;
  barcode: string | null;
  quantity: number;
  expiration_date: string | null;
  products: { clave: string; name: string; image_url: string | null } | null;
  /** Populated for slot_contents rows in an EMBARQUE slot that were
   *  picked for a specific order — lets the Zona de Embarque dialog
   *  group sub-slots per order. NULL elsewhere. */
  order_id?: string | null;
  order_item_id?: string | null;
  orders?: {
    order_code: string;
    status: string;
    fulfillment_method: string | null;
    delivery_date: string | null;
    urgency: boolean;
    clients: { name: string | null; razon_social: string | null } | null;
  } | null;
}

interface Movement {
  id: string;
  slot_id: string;
  product_id: string | null;
  description: string | null;
  lote: string | null;
  delta: number;
  reason: string;
  note: string | null;
  created_at: string;
  products: { clave: string; name: string } | null;
  /** For reason='reubicacion', the slot code on the OTHER half of the
   *  pair — i.e. where the bultos came from (when delta > 0) or where
   *  they went to (when delta < 0). NULL for non-reubicacion movements. */
  pair_slot_code?: string | null;
}

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try { return format(parseLocalDate(d), "dd/MM/yy"); } catch { return d; }
};

/** Latest movement for a slot — projected from a single upfront query so
 *  the right-hand SlotDetailPanel can render "Último movimiento" without
 *  firing a new request on every hover. */
interface LatestMovement {
  id: string;
  slot_id: string;
  created_at: string;
  reason: string;
  delta: number;
  lote: string | null;
  note: string | null;
  product_id: string | null;
  products: { clave: string; name: string } | null;
}

/** Tile-hover wiring — exposed via context so SlotTile (5 levels deep)
 *  doesn't have to thread enter/leave callbacks through every layer. */
interface TileHoverHandlers {
  enter: (slot: Slot) => void;
  leave: () => void;
}
const TileHoverContext = createContext<TileHoverHandlers | null>(null);


/* ── Move (Reubicación) mode types ──
 *
 * The user enters "move mode" from a slot's drawer by tapping Mover on a
 * lote row. The drawer closes, the map dims, the source tile pulses
 * purple, and suggestion ranks light up in blue/emerald/grey. Tapping any
 * non-source storage tile sets `pendingDest`, which renders a floating
 * confirm chip at the bottom of the page.
 */
interface MoveMode {
  source: SlotContent;
  sourceSlot: Slot;
}
interface PendingDest {
  destSlot: Slot;
  quantity: number;
}

/* ── Batch Mover mode types ──
 *
 * Top-level "Mover" header button starts a two-phase flow:
 *   1. selecting: user taps occupied storage tiles to add their lotes
 *      to the selection. Same tile tapped twice removes the slot's lotes.
 *   2. destination: user taps a Recibo or Embarque big tile; the system
 *      distributes selection across that zone's empty sub-positions and
 *      shows a confirm chip.
 *
 * The selected lotes are stored as their raw SlotContent rows so the
 * batch RPC has everything it needs without re-fetching.
 */
type BatchPhase = "selecting" | "destination";
interface BatchMode {
  phase: BatchPhase;
  selection: SlotContent[];
  pendingZone?: "recibo" | "embarque";
}

export default function Warehouse() {
  const [openSlotId, setOpenSlotId] = useState<string | null>(null);
  const [openZone, setOpenZone] = useState<"recibo" | "embarque" | null>(null);
  const [search, setSearch] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState<ScannerMode>("buscar");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pickPrompt, setPickPrompt] = useState<{
    barcode: string;
    candidates: Array<{
      id: string;
      slot_code: string;
      product_clave: string | null;
      product_name: string | null;
      product_image_url: string | null;
      lote: string | null;
      expiration_date: string | null;
      quantity: number;
    }>;
  } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [moveMode, setMoveMode] = useState<MoveMode | null>(null);
  const [pendingDest, setPendingDest] = useState<PendingDest | null>(null);
  const [committingMove, setCommittingMove] = useState(false);
  const [hoveredSlotId, setHoveredSlotId] = useState<string | null>(null);
  const [batchMode, setBatchMode] = useState<BatchMode | null>(null);
  const [committingBatch, setCommittingBatch] = useState(false);
  const queryClient = useQueryClient();

  // Sticky panel — once a tile is hovered we KEEP that selection in the
  // right-side detail panel forever. The panel only swaps when the user
  // hovers a different tile. This avoids the "panel goes empty when I
  // move my cursor off" complaint.
  const handleTileHoverEnter = useCallback((slot: Slot) => {
    setHoveredSlotId(slot.id);
  }, []);
  // Intentionally a no-op: leaving a tile no longer clears the panel.
  // Kept as a stable reference for the TileHoverContext consumer API.
  const handleTileHoverLeave = useCallback(() => {}, []);
  const tileHoverHandlers = useMemo<TileHoverHandlers>(
    () => ({ enter: handleTileHoverEnter, leave: handleTileHoverLeave }),
    [handleTileHoverEnter, handleTileHoverLeave],
  );

  // Resolve a scanned barcode -> open the matching slot.
  //   1. Try slot_contents.barcode (exact physical-label match)
  //   2. Try products.barcode / case_barcode (catalog match → first
  //      slot holding that product)
  //   3. Otherwise toast "no encontrado"
  const handleScan = async (raw: string, mode: ScannerMode) => {
    const value = raw.trim();
    if (!value) return;
    try {
      // Resolve the barcode → list of candidate slot_contents.
      // Direct slot_contents.barcode is the strongest hit (physical
      // label). Otherwise look up via products.barcode / case_barcode.
      let candidates = contents.filter(c => c.barcode === value);
      let resolvedProduct: { id: string; clave: string; name: string; image_url: string | null } | null = null;
      if (candidates.length === 0) {
        const { data: prods } = await (supabase as any)
          .from("products")
          .select("id, clave, name, image_url")
          .or(`barcode.eq.${value},case_barcode.eq.${value}`)
          .limit(1);
        resolvedProduct = (prods ?? [])[0] ?? null;
        if (resolvedProduct) {
          candidates = contents.filter(c => c.product_id === resolvedProduct!.id);
        }
      }

      if (candidates.length === 0) {
        toast.error(`Código ${value} no encontrado`);
        return;
      }

      if (mode === "buscar") {
        // Existing: open the first matching slot's drawer
        const slot = slots.find(s => s.id === candidates[0].slot_id);
        setOpenSlotId(candidates[0].slot_id);
        toast.success(
          resolvedProduct
            ? `${resolvedProduct.clave} en ${slot?.code ?? "posición"}`
            : "Posición encontrada",
        );
        return;
      }

      // PICAR — open the pick dialog with FIFO-sorted candidates
      const sorted = [...candidates].sort((a, b) => {
        if (!a.expiration_date && !b.expiration_date) return 0;
        if (!a.expiration_date) return 1;
        if (!b.expiration_date) return -1;
        return a.expiration_date.localeCompare(b.expiration_date);
      });
      const slotMap = new Map(slots.map(s => [s.id, s] as const));
      setPickPrompt({
        barcode: value,
        candidates: sorted.map(c => ({
          id: c.id,
          slot_code: slotMap.get(c.slot_id)?.code ?? "—",
          product_clave: c.products?.clave ?? resolvedProduct?.clave ?? null,
          product_name: c.products?.name ?? resolvedProduct?.name ?? c.description ?? null,
          product_image_url: c.products?.image_url ?? resolvedProduct?.image_url ?? null,
          lote: c.lote,
          expiration_date: c.expiration_date,
          quantity: c.quantity,
        })),
      });
    } catch (err: any) {
      toast.error("Error al buscar: " + (err.message ?? "desconocido"));
    }
  };

  const { data: slots = [], isLoading: slotsLoading } = useQuery({
    queryKey: ["warehouse-slots"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("warehouse_slots")
        .select("id, code, block, row_letter, position, zone, blocked, access_type, active")
        .eq("active", true)
        .order("zone").order("block").order("row_letter").order("position");
      if (error) throw error;
      return (data ?? []) as Slot[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Time-travel mode — when non-null the page shows a read-only view
  // of the warehouse at that point in time, driven by the snapshot
  // system. Write actions are disabled. See HistoricalInventoryDialog.
  const [viewAsOf, setViewAsOf] = useState<Date | null>(null);
  const [historicalOpen, setHistoricalOpen] = useState(false);
  const isHistorical = viewAsOf !== null;

  // Order fulfillment dialog — opens when the worker clicks "Surtir /
  // Despachar / Entregar" on the Órdenes por surtir panel above the
  // map. State is here so a single dialog instance is reused across
  // every order row and unmounts cleanly when closed.
  const [fulfillOrder, setFulfillOrder] = useState<OrderToFulfill | null>(null);

  const { data: rawContents = [], isLoading: contentsLoading } = useQuery({
    // viewAsOf is part of the cache key so toggling time-travel
    // automatically re-fetches the right data set.
    queryKey: ["warehouse-contents", isHistorical ? viewAsOf?.toISOString() : "live"],
    queryFn: async () => {
      if (!isHistorical) {
        // Embarque needs order_id + order_item_id so the Zona de
        // Embarque dialog can group sub-slots by order. Join orders
        // + clients in one round-trip so the dialog renders without
        // extra fetches when the user opens it.
        const { data, error } = await (supabase as any)
          .from("slot_contents")
          .select("id, slot_id, product_id, description, lote, barcode, quantity, expiration_date, order_id, order_item_id, products(clave, name, image_url), orders(order_code, status, fulfillment_method, delivery_date, urgency, clients(name, razon_social))")
          .order("expiration_date", { nullsFirst: false }) as any;
        if (error) throw error;
        return (data ?? []) as SlotContent[];
      }
      // Snapshot-mode: pull rows from get_inventory_at and project them
      // back into the SlotContent shape so every consumer down the
      // chain (map, KPI tiles, panel) keeps working unchanged. The
      // RPC gives us slot_code but not slot_id; we re-join against
      // the live slots map in a useMemo below.
      const { data, error } = await (supabase as any).rpc("get_inventory_at", {
        p_as_of: viewAsOf!.toISOString(),
      });
      if (error) throw error;
      type HistRow = {
        slot_code: string;
        product_clave: string | null;
        product_name: string | null;
        description: string | null;
        lote: string | null;
        barcode: string | null;
        quantity: number;
        expiration_date: string | null;
      };
      // slot_id + product_id are intentionally left blank — they're
      // looked up by code in a post-processing memo so this query
      // doesn't have to know about the slots array shape.
      return ((data ?? []) as HistRow[]).map((r, i) => ({
        id:              `hist-${i}`,
        slot_id:         r.slot_code, // resolved to real uuid in memo
        product_id:      null,
        description:     r.description ?? r.product_name,
        lote:            r.lote,
        barcode:         r.barcode,
        quantity:        r.quantity,
        expiration_date: r.expiration_date,
        products:        r.product_clave
          ? { clave: r.product_clave, name: r.product_name, image_url: null }
          : null,
        __slot_code:     r.slot_code,
      })) as unknown as SlotContent[];
    },
    staleTime: 60 * 1000,
  });

  // In time-travel mode the snapshot rows carry a slot_code (text)
  // instead of a slot_id (uuid). Resolve back to slot_id here so every
  // downstream consumer (contentsBySlot, stats, filterStats, panels)
  // continues working unchanged. If slots aren't loaded yet we return
  // an empty array — better than rendering ghost rows with text ids.
  const contents = useMemo(() => {
    if (!isHistorical) return rawContents;
    if (slots.length === 0) return [] as typeof rawContents;
    const slotByCodeMap = new Map(slots.map((s) => [s.code, s.id]));
    return rawContents.map((c) => {
      const sc = (c as any).__slot_code as string | undefined;
      if (!sc) return c;
      const id = slotByCodeMap.get(sc);
      return { ...c, slot_id: id ?? c.slot_id };
    });
  }, [rawContents, slots, isHistorical]);

  // Product catalog — used by the Excel import dialog to resolve SKU →
  // product_id and detect "Sobres" / loose-tarima rows whose clave
  // doesn't exist in the catalog. Cached aggressively since the catalog
  // changes rarely relative to the warehouse contents.
  const { data: productsCatalog = [] } = useQuery({
    queryKey: ["warehouse-products-catalog"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select("id, clave")
        .eq("active", true);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; clave: string }>;
    },
    staleTime: 10 * 60 * 1000,
  });

  // Latest movement per slot — projected from one upfront query so the
  // right-hand SlotDetailPanel can render "Último movimiento" without
  // firing a new request on every hover. With the current volume (<2k
  // movements) this is cheap; if it ever gets big we'd swap for a view
  // with DISTINCT ON. Limit guards against runaway growth.
  const { data: latestMovementBySlot } = useQuery({
    queryKey: ["warehouse-latest-movement-by-slot"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("slot_movements")
        .select(
          "id, slot_id, created_at, reason, delta, lote, note, product_id, products(clave, name)",
        )
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      const map = new Map<string, LatestMovement>();
      for (const m of (data ?? []) as LatestMovement[]) {
        if (!map.has(m.slot_id)) map.set(m.slot_id, m);
      }
      return map;
    },
    staleTime: 60 * 1000,
  });

  // Ranked destination suggestions for the current move-mode source.
  // Reuses the same suggestion engine as placement (close to Embarque if a
  // pedido is incoming, same block as SKU for FIFO, then any empty
  // matching-access slot).
  const { data: moveSuggestions = [] } = useQuery({
    queryKey: ["move-mode-suggestions", moveMode?.source.id, moveMode?.source.product_id, moveMode?.source.quantity],
    queryFn: async () => {
      if (!moveMode?.source.product_id) return [] as Array<{ slot_id: string; rank: number }>;
      const { data, error } = await (supabase as any).rpc("suggest_slots_for_placement", {
        p_product_id: moveMode.source.product_id,
        p_quantity: moveMode.source.quantity,
        p_days_window: 3,
      });
      if (error) throw error;
      return (data ?? []) as Array<{ slot_id: string; rank: number }>;
    },
    enabled: !!moveMode?.source.product_id,
    staleTime: 30 * 1000,
  });

  // Build {slot_id → SlotContent[]} for O(1) lookup in tiles + drawer
  const contentsBySlot = useMemo(() => {
    const m = new Map<string, SlotContent[]>();
    for (const c of contents) {
      const arr = m.get(c.slot_id) ?? [];
      arr.push(c);
      m.set(c.slot_id, arr);
    }
    return m;
  }, [contents]);

  // Index every slot by its `code` so the static rack layout (below) can
  // look it up in O(1). Transit slots are kept separate for the strip
  // above the storage map.
  const slotsByCode = useMemo(() => {
    const m = new Map<string, Slot>();
    for (const s of slots) m.set(s.code, s);
    return m;
  }, [slots]);

  const transitSlots = useMemo(() => {
    return slots
      .filter(s => s.zone !== "storage")
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [slots]);

  // Search → set of matching slot.ids. Layout stays stable; non-matching
  // tiles just get dimmed. `null` means no active search.
  const searchMatchIds = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.trim().toLowerCase();
    const set = new Set<string>();
    for (const s of slots) {
      if (s.code.toLowerCase().includes(q)) { set.add(s.id); continue; }
      const cs = contentsBySlot.get(s.id) ?? [];
      if (cs.some(c =>
        (c.products?.clave ?? "").toLowerCase().includes(q) ||
        (c.products?.name ?? c.description ?? "").toLowerCase().includes(q) ||
        (c.lote ?? "").toLowerCase().includes(q) ||
        (c.barcode ?? "").toLowerCase().includes(q)
      )) set.add(s.id);
    }
    return set;
  }, [slots, search, contentsBySlot]);

  /** Compute filter-result-specific stats when the user is searching.
   *  Returns null when no search is active (UI shows the disclaimer
   *  card at the same height instead). Pure derivation from already-
   *  loaded data — no extra queries.
   *
   *  Distance-to-Embarque ranking matches the placement RPC's heuristic:
   *  blocks closest to the Embarque dock get the lowest score. Transit
   *  slots themselves score -1 (already there, can't get closer). */
  const filterStats = useMemo(() => {
    if (!searchMatchIds || searchMatchIds.size === 0) return null;
    const q = search.trim().toLowerCase();
    // Collect all matching slot_contents rows (not just slots — we need
    // per-lote granularity for qty / expiration math)
    const matchingContents: SlotContent[] = [];
    const matchingSlotsList: Slot[] = [];
    for (const s of slots) {
      if (!searchMatchIds.has(s.id)) continue;
      matchingSlotsList.push(s);
      const cs = contentsBySlot.get(s.id) ?? [];
      for (const c of cs) {
        // Only count a lote if IT matches the query (slot might match by
        // code but the lote inside is a different SKU we don't want to
        // mix into the stats)
        if (
          (c.products?.clave ?? "").toLowerCase().includes(q) ||
          (c.products?.name ?? c.description ?? "").toLowerCase().includes(q) ||
          (c.lote ?? "").toLowerCase().includes(q) ||
          (c.barcode ?? "").toLowerCase().includes(q) ||
          s.code.toLowerCase().includes(q)
        ) {
          matchingContents.push(c);
        }
      }
    }

    if (matchingContents.length === 0) return null;

    // 1. Bultos totales
    const totalBultos = matchingContents.reduce((a, c) => a + (c.quantity || 0), 0);

    // 2. Posiciones (unique slot ids where matching contents are)
    const uniqueSlotIds = new Set(matchingContents.map(c => c.slot_id));
    const totalPositions = uniqueSlotIds.size;

    // 3. Lotes (distinct lote codes — treat empty/null lote as a single
    //    "sin lote" bucket so we don't over-count)
    const distinctLotes = new Set(
      matchingContents.map(c => `${c.product_id ?? "—"}::${c.lote ?? "—"}`),
    );
    const totalLotes = distinctLotes.size;

    // 4. Cerca de Embarque — pick the slot with the lowest distance score
    const distanceScore = (slot: Slot): number => {
      if (slot.zone === "embarque") return -2;
      if (slot.zone === "recibo")   return -1;
      const b = slot.block ?? 0;
      if (b >= 302 && b <= 310 && b % 2 === 0) return 0; // 302/304/306/308/310
      if (b >= 301 && b <= 309 && b % 2 === 1) return 1;
      if (b >= 202 && b <= 210 && b % 2 === 0) return 2;
      if (b >= 201 && b <= 209 && b % 2 === 1) return 3;
      return 4;
    };
    const closestSlot = [...uniqueSlotIds]
      .map(id => slots.find(s => s.id === id))
      .filter((s): s is Slot => !!s)
      .sort((a, b) => {
        const da = distanceScore(a), db = distanceScore(b);
        if (da !== db) return da - db;
        return a.code.localeCompare(b.code);
      })[0] ?? null;

    // 5. Próxima caducidad — earliest expiration_date across matching contents
    const dates = matchingContents
      .map(c => c.expiration_date)
      .filter((d): d is string => !!d)
      .sort();
    const earliestExpiry = dates[0] ?? null;

    // 6. Lote más viejo — proxy via earliest last_updated_at on the
    //    slot_contents row. (Real "first arrival" would need to query
    //    slot_movements; left as a future refinement.) Returns the
    //    lote code + arrival date so the user can FIFO-verify.
    const sortedByAge = [...matchingContents]
      .filter(c => !!c.lote)
      .sort((a, b) => {
        const aa = (a as any).last_updated_at ?? "";
        const bb = (b as any).last_updated_at ?? "";
        return aa.localeCompare(bb);
      });
    const oldestLote = sortedByAge[0] ?? null;

    return {
      totalBultos,
      totalPositions,
      totalLotes,
      closestSlot,
      earliestExpiry,
      oldestLote,
    };
  }, [searchMatchIds, search, slots, contentsBySlot]);

  // While moveMode is active, map each storage slot to its visual state.
  // Hierarchy (best first): source > rank 1 (close to Embarque) > rank 2
  // (same-block FIFO) > available (empty + matching access) > dim.
  // Rank 3 from the RPC is dropped — its purpose was "always show
  // something glowing" which the new white-ring "available" coverage
  // handles for every legal destination.
  const slotMoveStateById = useMemo(() => {
    if (!moveMode) return null;
    const m = new Map<string, "source" | "available" | "dim" | 1 | 2>();
    const sourceAccess = moveMode.sourceSlot.access_type;
    for (const s of slots) {
      if (s.zone !== "storage") {
        m.set(s.id, "dim");
        continue;
      }
      if (s.blocked || s.access_type === "damaged" || !s.active) {
        m.set(s.id, "dim");
        continue;
      }
      // Matching access + empty = available (white ring)
      const occupants = contentsBySlot.get(s.id) ?? [];
      const isEmpty = occupants.length === 0;
      const accessMatches = s.access_type === sourceAccess;
      if (isEmpty && accessMatches) {
        m.set(s.id, "available");
      } else {
        m.set(s.id, "dim");
      }
    }
    m.set(moveMode.sourceSlot.id, "source");
    // Upgrade any "available" / "dim" entry to its rank if the RPC has a
    // strong opinion. We never downgrade — source stays source.
    for (const sug of moveSuggestions) {
      if (sug.slot_id === moveMode.sourceSlot.id) continue;
      const rank = sug.rank as 1 | 2 | 3;
      if (rank > 2) continue; // rank 3 absorbed by "available"
      const existing = m.get(sug.slot_id);
      if (existing === "source") continue;
      if (existing === "available" || existing === "dim" ||
          (typeof existing === "number" && existing > rank)) {
        m.set(sug.slot_id, rank);
      }
    }
    return m;
  }, [moveMode, moveSuggestions, slots, contentsBySlot]);

  // Tile color logic. Border encodes ACCESS TYPE (apilador / patines /
  // manual), background encodes FILL (empty grey vs occupied green).
  // `blocked` and `damaged` are special — they paint the whole tile.
  // When move mode is active, additional ring + opacity classes layer
  // on top to indicate source / suggestion rank / dimmed.
  const tileClass = (slot: Slot, fillCount: number) => {
    // Compute the base visual first
    let base: string;
    if (!slot.active) {
      base = "bg-gray-200/40 dark:bg-gray-800/40 text-muted-foreground border-gray-200 dark:border-gray-800";
    } else if (slot.blocked) {
      base = "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/50";
    } else if (slot.access_type === "damaged") {
      base = "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/50";
    } else {
      const occupied = fillCount > 0;
      const fillBg = occupied
        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
        : "bg-gray-100 dark:bg-gray-800/60 text-gray-400";
      let border: string;
      if (slot.access_type === "patines") border = "border-amber-500/60 border-2";
      else if (slot.access_type === "manual") border = "border-purple-500/60 border-2";
      else border = occupied ? "border-emerald-500/40" : "border-gray-200 dark:border-gray-700";
      base = cn(fillBg, border);
    }

    // Batch mode visuals layer in BEFORE move-mode visuals (mutually
    // exclusive in practice — startBatchMode cancels any active move).
    //   selecting phase  → selected tiles glow emerald; ineligible dim
    //   destination phase → all storage tiles dim (only zone tiles target)
    if (batchMode) {
      const slotContents = contentsBySlot.get(slot.id) ?? [];
      const isSelected = batchMode.selection.some(c => c.slot_id === slot.id);
      if (isSelected) {
        return cn(
          base,
          "ring-2 ring-emerald-500 ring-offset-1 shadow-[0_0_12px_rgba(16,185,129,0.55)] brightness-110 z-10",
        );
      }
      if (batchMode.phase === "selecting") {
        const eligible = slot.zone === "storage" && !slot.blocked && slotContents.length > 0;
        if (eligible) {
          return cn(base, "ring-1 ring-foreground/30 hover:ring-foreground/70");
        }
        return cn(base, "opacity-50 saturate-50");
      }
      // destination phase — storage tiles aren't selectable, only zones
      return cn(base, "opacity-45 saturate-50");
    }

    // Layer move-mode highlights on top — these win over the base classes
    // for ring + glow + opacity. White ring marks every legal destination
    // (empty + matching access); blue/emerald halos mark "smart" picks
    // from the suggestion engine; purple marks the source.
    if (slotMoveStateById) {
      const state = slotMoveStateById.get(slot.id);
      const isPending = pendingDest?.destSlot.id === slot.id;
      if (isPending) {
        // Static strong indicator. The previous animate-pulse combined with
        // the global hover scale/brightness/shadow on tiles produced a
        // visually busy "flashing" effect.
        return cn(
          base,
          "ring-2 ring-primary ring-offset-2 ring-offset-background brightness-125 shadow-[0_0_22px_rgba(99,102,241,0.85)] z-10",
        );
      }
      if (state === "source") {
        // Slow "breathing" pulse — 3 s cycle, 0.78 → 1 opacity. Calmer
        // than Tailwind's animate-pulse (1 s / 0.5 → 1) which felt
        // violent. Kept the ring + halo + z-10 for instant recognition.
        return cn(
          base,
          "warehouse-breathe ring-2 ring-purple-500 ring-offset-2 ring-offset-background shadow-[0_0_22px_rgba(168,85,247,0.7)] z-10",
        );
      }
      if (state === 1) {
        // Rank 1 (close to Embarque) still pulses subtly to call attention.
        return cn(
          base,
          "ring-2 ring-blue-500 ring-offset-1 brightness-110 shadow-[0_0_16px_rgba(59,130,246,0.6)] animate-pulse",
        );
      }
      if (state === 2) {
        return cn(
          base,
          "ring-2 ring-emerald-500 ring-offset-1 brightness-105 shadow-[0_0_14px_rgba(16,185,129,0.55)]",
        );
      }
      if (state === "available") {
        // Cyan ring — distinct from rank-1 blue, clearly reads as
        // "available destination" rather than "muted."
        return cn(
          base,
          "ring-2 ring-cyan-400 brightness-105 shadow-[0_0_10px_rgba(34,211,238,0.45)] hover:brightness-115 transition",
        );
      }
      if (state === "dim") {
        // Subtle neutral grey-out for slots that aren't legal destinations
        // (occupied, wrong-access, transit, blocked). Visible enough to
        // keep the map context, dim enough to clearly say "not here."
        return cn(
          base,
          "opacity-60 saturate-50 ring-1 ring-muted-foreground/20",
        );
      }
      return cn(base, "opacity-60 saturate-50 ring-1 ring-muted-foreground/20");
    }

    return base;
  };

  const openSlot = openSlotId ? slots.find(s => s.id === openSlotId) ?? null : null;
  const openContents = openSlotId ? contentsBySlot.get(openSlotId) ?? [] : [];
  // Whatever's under the cursor right now, for the right-hand detail panel
  const hoveredSlot = hoveredSlotId ? slots.find(s => s.id === hoveredSlotId) ?? null : null;
  const hoveredContents = hoveredSlotId ? contentsBySlot.get(hoveredSlotId) ?? [] : [];
  const hoveredLatestMovement = hoveredSlotId
    ? latestMovementBySlot?.get(hoveredSlotId) ?? null
    : null;

  // Click router. In default mode tapping a tile opens the slot drawer.
  // In move mode it picks the destination — storage slots directly,
  // transit zones via the big Recibo/Embarque tiles (handleZoneClick).
  // In batch select mode it toggles the slot's lotes into the selection.
  const handleSlotClick = (id: string) => {
    // Batch SELECTING — toggle the slot's lotes in/out of selection
    if (batchMode?.phase === "selecting") {
      const slot = slots.find(s => s.id === id);
      if (!slot || slot.zone !== "storage" || slot.blocked) return;
      const slotContents = contentsBySlot.get(id) ?? [];
      if (slotContents.length === 0) return;
      const alreadyHas = batchMode.selection.some(c => c.slot_id === id);
      setBatchMode({
        ...batchMode,
        selection: alreadyHas
          ? batchMode.selection.filter(c => c.slot_id !== id)
          : [...batchMode.selection, ...slotContents],
      });
      return;
    }
    // Batch DESTINATION — storage tiles aren't valid targets for batch,
    // only zones are (handleZoneClick). Silently ignore.
    if (batchMode?.phase === "destination") return;

    // Single-source move flow (existing)
    if (moveMode) {
      if (id === moveMode.sourceSlot.id) return;
      const slot = slots.find(s => s.id === id);
      if (!slot) return;
      if (slot.blocked) return;
      setPendingDest({ destSlot: slot, quantity: pendingDest?.quantity ?? moveMode.source.quantity });
      return;
    }
    setOpenSlotId(id);
  };

  // Tapping the big Recibo or Embarque tile while in move mode auto-picks
  // the first empty sub-position in that zone as the destination. If the
  // zone is full we toast — otherwise the confirm chip pops at the bottom
  // just like a storage-slot pick.
  // In batch destination mode the click sets the pendingZone.
  const handleZoneClick = (zone: "recibo" | "embarque") => {
    // Batch DESTINATION — record the chosen zone for the confirm chip
    if (batchMode?.phase === "destination") {
      const free = slots.filter(
        s => s.zone === zone && !s.blocked && s.active && !contentsBySlot.get(s.id)?.length,
      ).length;
      if (free < batchMode.selection.length) {
        toast.error(
          `Sólo hay ${free} posiciones vacías en ${zone === "recibo" ? "Recibo" : "Embarque"}, se necesitan ${batchMode.selection.length}`,
        );
        return;
      }
      setBatchMode({ ...batchMode, pendingZone: zone });
      return;
    }
    // Batch SELECTING — clicking transit zones in selection phase is a
    // no-op for v1 (we only batch FROM storage). Ignore.
    if (batchMode?.phase === "selecting") return;

    // Single-source move into zone (existing — auto-picks first empty)
    if (moveMode) {
      const zoneSlots = slots
        .filter(s => s.zone === zone && !s.blocked && s.active)
        .sort((a, b) => a.code.localeCompare(b.code));
      const firstEmpty = zoneSlots.find(s => !contentsBySlot.get(s.id)?.length);
      if (!firstEmpty) {
        toast.error(
          `${zone === "recibo" ? "Recibo" : "Embarque"} no tiene posiciones disponibles`,
        );
        return;
      }
      setPendingDest({
        destSlot: firstEmpty,
        quantity: pendingDest?.quantity ?? moveMode.source.quantity,
      });
      return;
    }
    setOpenZone(zone);
  };

  // Batch flow control
  const startBatchMode = () => {
    if (moveMode) cancelMoveMode();
    setBatchMode({ phase: "selecting", selection: [] });
    setOpenSlotId(null);
  };
  const advanceBatchToDestination = () => {
    if (!batchMode || batchMode.selection.length === 0) return;
    setBatchMode({ ...batchMode, phase: "destination", pendingZone: undefined });
  };
  const cancelBatch = () => {
    setBatchMode(null);
    setCommittingBatch(false);
  };
  const removeBatchSelection = (contentId: string) => {
    if (!batchMode) return;
    setBatchMode({
      ...batchMode,
      selection: batchMode.selection.filter(c => c.id !== contentId),
    });
  };
  const commitBatch = async () => {
    if (!batchMode || !batchMode.pendingZone || batchMode.selection.length === 0) return;
    setCommittingBatch(true);
    try {
      const ids = batchMode.selection.map(c => c.id);
      const { error } = await (supabase as any).rpc("batch_move_to_zone", {
        p_content_ids: ids,
        p_zone: batchMode.pendingZone,
        p_note: "Mover en lote",
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["warehouse-contents"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-slots"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-latest-movement-by-slot"] });
      toast.success(
        `${ids.length} lotes movidos a ${batchMode.pendingZone === "recibo" ? "Recibo" : "Embarque"}`,
      );
      cancelBatch();
    } catch (err: any) {
      toast.error("Error al mover: " + (err.message ?? "desconocido"));
      setCommittingBatch(false);
    }
  };

  // User taps Mover on a lote row inside the slot drawer.
  const enterMoveMode = (content: SlotContent) => {
    if (!openSlot) return;
    setMoveMode({ source: content, sourceSlot: openSlot });
    setOpenSlotId(null);
    setPendingDest(null);
  };

  // User taps Mover on a lote row inside the right-side SlotDetailPanel
  // (no drawer involved — the panel takes its own slot reference).
  const enterMoveModeFromPanel = (slot: Slot, content: SlotContent) => {
    setMoveMode({ source: content, sourceSlot: slot });
    setOpenSlotId(null);
    setPendingDest(null);
  };

  // Confirm-and-act state for undo / revert. window.confirm is forbidden
  // by the brand guide — render a branded AlertDialog instead.
  const [pendingAction, setPendingAction] = useState<
    | { kind: "undo" | "revert"; movementId: string }
    | null
  >(null);
  const [actionRunning, setActionRunning] = useState(false);

  const invalidateAfterMovementChange = () => {
    queryClient.invalidateQueries({ queryKey: ["warehouse-contents"] });
    queryClient.invalidateQueries({ queryKey: ["warehouse-slots"] });
    queryClient.invalidateQueries({ queryKey: ["warehouse-latest-movement-by-slot"] });
    queryClient.invalidateQueries({ queryKey: ["recent-reubicaciones"] });
    queryClient.invalidateQueries({ queryKey: ["slot-movements"] });
  };

  // Step 1: just open the AlertDialog. The actual RPC runs on confirm.
  const handleUndoMovement = (movementId: string) => {
    setPendingAction({ kind: "undo", movementId });
  };
  const handleRevertMovement = (movementId: string) => {
    setPendingAction({ kind: "revert", movementId });
  };

  // Step 2: user clicks the AlertDialog's confirm action
  const runPendingAction = async () => {
    if (!pendingAction) return;
    setActionRunning(true);
    try {
      const rpc = pendingAction.kind === "undo" ? "undo_movement" : "revert_movement";
      const args = pendingAction.kind === "undo"
        ? { p_movement_id: pendingAction.movementId }
        : { p_movement_id: pendingAction.movementId, p_note: "Revertido" };
      const { error } = await (supabase as any).rpc(rpc, args);
      if (error) throw error;
      invalidateAfterMovementChange();
      toast.success(pendingAction.kind === "undo" ? "Movimiento deshecho" : "Movimiento revertido");
      setPendingAction(null);
    } catch (err: any) {
      toast.error((pendingAction.kind === "undo" ? "Error al deshacer: " : "Error al revertir: ") + (err.message ?? "desconocido"));
    } finally {
      setActionRunning(false);
    }
  };

  const cancelMoveMode = () => {
    setMoveMode(null);
    setPendingDest(null);
  };

  const commitMove = async () => {
    if (!moveMode || !pendingDest) return;
    setCommittingMove(true);
    try {
      const { error } = await (supabase as any).rpc("move_stock_between_slots", {
        p_source_content_id: moveMode.source.id,
        p_dest_slot_id: pendingDest.destSlot.id,
        p_quantity: pendingDest.quantity,
        p_note: null,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["warehouse-contents"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-slots"] });
      queryClient.invalidateQueries({ queryKey: ["slot-movements"] });
      toast.success(`${pendingDest.quantity} bultos · ${moveMode.sourceSlot.code} → ${pendingDest.destSlot.code}`);
      setMoveMode(null);
      setPendingDest(null);
    } catch (err: any) {
      toast.error("Error al mover: " + (err.message ?? "desconocido"));
    } finally {
      setCommittingMove(false);
    }
  };

  // KPIs — STORAGE-ONLY for capacity figures. The user pointed out the
  // legend was showing 160 (= 150 storage + 5 recibo + 5 embarque) when
  // the real warehouse capacity is 150 positions. Recibo and Embarque
  // are workflow zones and don't belong in the "Posiciones" count.
  //
  // totalBultos still aggregates EVERY zone so the "Bultos total" tile
  // reflects everything physically in the building (storage + recibo +
  // embarque), which is what the user expects to see.
  const stats = useMemo(() => {
    const storageSlots = slots.filter(s => s.zone === "storage");
    const storageIds = new Set(storageSlots.map(s => s.id));
    const occupied = new Set(
      contents
        .filter(c => storageIds.has(c.slot_id))
        .map(c => c.slot_id),
    ).size;
    const totalBultos = contents.reduce((s, c) => s + (c.quantity ?? 0), 0);
    const blocked = storageSlots.filter(s => s.blocked).length;
    return {
      total: storageSlots.length,
      occupied,
      empty: storageSlots.length - occupied - blocked,
      blocked,
      totalBultos,
    };
  }, [slots, contents]);

  // No early-return skeleton page — the final layout is rendered from
  // first paint; KPI numbers and grid cells become skeletons during
  // load. This is what the user has asked for repeatedly: zero shift.
  const isLoading = slotsLoading || contentsLoading;

  // Export current contents as the exact Excel layout the warehouse
  // team is already used to (same column order as their seed file).
  const exportExcel = () => {
    try {
      // Output every storage slot (so empty positions are visible too),
      // sorted by code. Multi-SKU slots get one row per (slot, sku, lote).
      const rows: any[] = [];
      const storageSlots = slots
        .filter(s => s.zone === "storage")
        .sort((a, b) => a.code.localeCompare(b.code));
      for (const s of storageSlots) {
        const cs = contents.filter(c => c.slot_id === s.id);
        if (cs.length === 0) {
          rows.push({
            UBICACION: s.code, SKU: "", "CODIGO DE BARRAS": "", DESCRIPCION: "",
            CANTIDAD: "", LOTE: "", "FECHA DE CAD.": "",
          });
        } else {
          for (const c of cs) {
            rows.push({
              UBICACION: s.code,
              SKU: c.products?.clave ?? "",
              "CODIGO DE BARRAS": c.barcode ?? "",
              DESCRIPCION: c.products?.name ?? c.description ?? "",
              CANTIDAD: c.quantity,
              LOTE: c.lote ?? "",
              "FECHA DE CAD.": c.expiration_date ?? "",
            });
          }
        }
      }
      // Transit zones too
      for (const s of slots.filter(t => t.zone !== "storage")) {
        const cs = contents.filter(c => c.slot_id === s.id);
        if (cs.length === 0) {
          rows.push({ UBICACION: s.code, SKU: "", "CODIGO DE BARRAS": "", DESCRIPCION: "", CANTIDAD: "", LOTE: "", "FECHA DE CAD.": "" });
        } else {
          for (const c of cs) {
            rows.push({
              UBICACION: s.code,
              SKU: c.products?.clave ?? "",
              "CODIGO DE BARRAS": c.barcode ?? "",
              DESCRIPCION: c.products?.name ?? c.description ?? "",
              CANTIDAD: c.quantity,
              LOTE: c.lote ?? "",
              "FECHA DE CAD.": c.expiration_date ?? "",
            });
          }
        }
      }
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [{ wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 50 }, { wch: 10 }, { wch: 14 }, { wch: 12 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "INVENTARIO");
      const today = new Date();
      const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      XLSX.writeFile(wb, `Inventario ${ymd}.xlsx`);
      toast.success("Inventario descargado");
    } catch (err: any) {
      toast.error("Error al exportar: " + (err.message ?? "desconocido"));
    }
  };

  return (
    <TileHoverContext.Provider value={tileHoverHandlers}>
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Time-travel banner — appears across the top when the user has
          selected a past date. Read-only mode, all write actions are
          disabled below. Sticky-ish: doesn't follow scroll but sits at
          the very top of the page so it's impossible to miss. */}
      {isHistorical && (
        <div className="rounded-xl border-2 border-purple-500/60 bg-purple-500/10 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <History className="h-5 w-5 text-purple-500 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-bold text-purple-700 dark:text-purple-300">
                Almacén pasado — solo lectura
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                Viendo el inventario al {format(viewAsOf!, "dd 'de' MMMM yyyy, HH:mm", { locale: es }).replace(/ ([a-záéíóúñ])/g, (_, c: string) => " " + c.toUpperCase())}
              </div>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => setViewAsOf(null)}
            className="bg-purple-500 hover:bg-purple-600 text-white gap-1.5"
          >
            <XCircle className="h-3.5 w-3.5" />
            Volver al presente
          </Button>
        </div>
      )}

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Almacén · Kardex</h1>
          <p className="text-sm text-muted-foreground">
            Mapa visual del almacén. Toca una posición para ver contenido y movimientos.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            onClick={() => setScannerOpen(true)}
            disabled={isHistorical}
            className="gap-1.5"
          >
            <ScanLine className="h-4 w-4" />
            Escanear
          </Button>
          <Button
            variant={batchMode ? "default" : "outline"}
            size="sm"
            onClick={batchMode ? cancelBatch : startBatchMode}
            disabled={isLoading || !!moveMode || isHistorical}
            className={cn(
              "gap-1.5",
              batchMode && "bg-emerald-500 hover:bg-emerald-600 text-white",
            )}
            title={batchMode ? "Cancelar selección" : "Selecciona varios lotes y muévelos en lote a Recibo o Embarque"}
          >
            <MoveRight className="h-4 w-4" />
            {batchMode ? "Cancelar" : "Mover lotes"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHistoryOpen(true)}
            disabled={isHistorical}
            className="gap-1.5"
            title="Reubicaciones recientes — deshacer mistakes o revertir con auditoría"
          >
            <Undo2 className="h-4 w-4" />
            Historial reciente
          </Button>
          <Button
            variant={isHistorical ? "default" : "outline"}
            size="sm"
            onClick={() => setHistoricalOpen(true)}
            className={cn(
              "gap-1.5",
              isHistorical && "bg-purple-500 hover:bg-purple-600 text-white",
            )}
            title="Ver el estado guardado del inventario en una fecha pasada"
          >
            <History className="h-4 w-4" />
            {isHistorical ? "Pasado activo" : "Almacén pasado"}
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link to="/kardex">
              <History className="h-4 w-4" />
              Kardex
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportExcel}
            disabled={isLoading}
            className="gap-1.5"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Exportar Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
            disabled={isLoading || isHistorical}
            className="gap-1.5"
          >
            <Download className="h-4 w-4 rotate-180" />
            Importar Excel
          </Button>
        </div>
      </div>

      {/* KPIs — always render the tiles; only the numbers swap to
          skeletons during load. Keeps layout fixed. Icon-chip-left
          brand pattern (see project_croquetapp_brand.md). */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat icon={<Package className="h-5 w-5" />}     label="Posiciones"   value={stats.total}                              loading={isLoading} accent="blue" />
        <Stat icon={<PackageCheck className="h-5 w-5" />} label="Ocupadas"     value={stats.occupied}                           loading={isLoading} accent="emerald" />
        <Stat icon={<PackageOpen className="h-5 w-5" />}  label="Vacías"       value={stats.empty}                              loading={isLoading} accent="gray" />
        <Stat icon={<Lock className="h-5 w-5" />}         label="Bloqueadas"   value={stats.blocked}                            loading={isLoading} accent="red" />
        <Stat icon={<Layers className="h-5 w-5" />}       label="Bultos total" value={stats.totalBultos.toLocaleString("es-MX")} loading={isLoading} accent="amber" />
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por posición, SKU, lote o producto..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Filter stats — fixed-height container so the layout never
          shifts. Disclaimer card when no search; 6 stat tiles when the
          search has matches. Uses the existing searchMatchIds dim
          behavior on the map below — no changes there. */}
      <FilterStatsBlock
        active={!!filterStats}
        stats={filterStats}
        searchTerm={search.trim()}
      />

      {/* Órdenes por surtir — today + tomorrow horizon. Sits above the
          map so the warehouse worker sees pending fulfillment work
          first. Clicking an order opens FulfillOrderDialog (mounted
          near the page bottom) for picking + dispatch. Time-travel
          mode disables all action buttons inside. */}
      <OrdersToFulfillPanel
        onSelectOrder={(o) => setFulfillOrder(o)}
        readOnly={isHistorical}
      />

      {/* Legend — colors / access types used on the map. Stays visible
          always so the user can decode what each tile means. The capacity
          chip on the right shows live occupied/total + %, color-coded by
          fullness (emerald < 70 %, amber 70-89 %, red ≥ 90 %). */}
      <MapLegend occupied={stats.occupied} total={stats.total} />

      {/* Storage map — the 3 physical floors stacked top to bottom (A, B, C)
          exactly like the customer's PDF. Each floor lives in its own
          bordered card and includes its own detail panel on the right.
          The panel is the SAME width and x-position across all three
          floors because the storage zone + (transit | invisible spacer)
          columns sum to the same total — so the eye never has to relocate
          to find slot data as it scrolls between floors.

          Per-floor sync: a panel only renders contents when the hovered
          slot belongs to that floor; otherwise it shows the idle hint.
          Hovering moves the "active" panel to whichever floor you're on. */}
      <div className="space-y-6">
        {FLOORS_LAYOUT.map((floor) => {
          const panelSlot =
            hoveredSlot && hoveredSlot.row_letter === floor.code ? hoveredSlot : null;
          const panelContents = panelSlot ? hoveredContents : [];
          const panelMovement = panelSlot ? hoveredLatestMovement : null;
          return (
            <div
              key={floor.code}
              className="rounded-xl border bg-card p-4 overflow-x-auto"
            >
              <FloorPlan
                floor={floor}
                isLoading={isLoading}
                slotsByCode={slotsByCode}
                transitSlots={transitSlots}
                contentsBySlot={contentsBySlot}
                tileClass={tileClass}
                onSlotClick={handleSlotClick}
                onZoneClick={handleZoneClick}
                searchMatchIds={searchMatchIds}
                transitTargetable={
                  // Move mode → either zone is a valid destination
                  moveMode && !pendingDest ? "both"
                  // Batch destination phase → both zones until one is picked
                  : (batchMode?.phase === "destination" && !batchMode.pendingZone) ? "both"
                  : null
                }
                transitSelected={
                  // Batch destination phase with a zone chosen → glow that one
                  batchMode?.pendingZone ?? null
                }
                rightContent={
                  <SlotDetailPanel
                    slot={panelSlot}
                    contents={panelContents}
                    latestMovement={panelMovement}
                    onMoveLote={enterMoveModeFromPanel}
                    onUndoMovement={handleUndoMovement}
                    onRevertMovement={handleRevertMovement}
                  />
                }
              />
            </div>
          );
        })}
      </div>

      {/* Slot detail drawer */}
      <SlotDrawer
        slot={openSlot}
        contents={openContents}
        open={!!openSlot}
        onOpenChange={(o) => { if (!o) setOpenSlotId(null); }}
        onMoveInit={enterMoveMode}
        onUndoMovement={handleUndoMovement}
        onRevertMovement={handleRevertMovement}
      />

      {/* Transit zone dialog — opens when user taps the big Recibo or
          Embarque block. Lists the 5 sub-positions; tap one to drill in. */}
      <TransitZoneDialog
        zone={openZone}
        slots={transitSlots}
        contentsBySlot={contentsBySlot}
        open={!!openZone}
        onOpenChange={(o) => { if (!o) setOpenZone(null); }}
        onSlotClick={(id) => { setOpenZone(null); setOpenSlotId(id); }}
      />

      {/* Barcode scanner — Buscar opens the matching slot's drawer,
          Picar resolves the code and opens ScannerPickDialog */}
      <BarcodeScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onScan={handleScan}
        mode={scannerMode}
        onModeChange={setScannerMode}
      />

      {/* Pick dialog opened from the scanner in Picar mode */}
      {pickPrompt && (
        <ScannerPickDialog
          open={!!pickPrompt}
          onOpenChange={(o) => { if (!o) setPickPrompt(null); }}
          scannedValue={pickPrompt.barcode}
          candidates={pickPrompt.candidates}
          onPickComplete={() => {
            // Re-open the scanner so the worker can keep picking
            setPickPrompt(null);
            setTimeout(() => setScannerOpen(true), 200);
          }}
        />
      )}

      {/* Recent relocations side sheet — Deshacer (≤30 min) / Revertir */}
      <RecentMovementsSheet open={historyOpen} onOpenChange={setHistoryOpen} />

      {/* Import an Excel snapshot — wipe-and-replace via the
          import_inventory_apply RPC (storage zones only). Snapshots
          are auto-taken pre and post for date-picker time travel. */}
      <ImportInventoryDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        slots={slots}
        contents={contents}
        products={productsCatalog}
      />

      {/* Time-travel — read-only view of the warehouse on a past day,
          driven by inventory_snapshots. Banner at top while active +
          all write actions disabled. */}
      <HistoricalInventoryDialog
        open={historicalOpen}
        onOpenChange={setHistoricalOpen}
        currentValue={viewAsOf}
        onSelect={(d) => setViewAsOf(d)}
      />

      {/* Surtir / Despachar — order fulfillment dialog. Mounted once
          here; the OrdersToFulfillPanel above the map drives selection
          via the fulfillOrder state. Closing returns null. */}
      <FulfillOrderDialog
        open={!!fulfillOrder}
        onOpenChange={(o) => { if (!o) setFulfillOrder(null); }}
        order={fulfillOrder}
      />

      {/* Move (Reubicación) mode UI — banner at the top while picking
          a destination, then a confirm chip at the bottom once a tile is
          picked. Both render as fixed overlays so they float above the
          map without disturbing its layout. */}
      {moveMode && !pendingDest && (
        <MoveModeBanner
          source={moveMode}
          onCancel={cancelMoveMode}
        />
      )}
      {moveMode && pendingDest && (
        <MoveConfirmChip
          source={moveMode}
          pending={pendingDest}
          submitting={committingMove}
          onQuantityChange={(q) => setPendingDest({ ...pendingDest, quantity: q })}
          onPickAnother={() => setPendingDest(null)}
          onCancel={cancelMoveMode}
          onConfirm={commitMove}
        />
      )}

      {/* Batch mover UI — selecting & destination phases share a fixed
          banner at the bottom; the side panel switches to a selection
          list while batch mode is active. */}
      {batchMode && (
        <BatchMoverBanner
          batch={batchMode}
          submitting={committingBatch}
          onContinue={advanceBatchToDestination}
          onConfirm={commitBatch}
          onCancel={cancelBatch}
          onRemove={removeBatchSelection}
        />
      )}

      {/* Branded confirmation dialog for Deshacer / Revertir. Replaces
          window.confirm() which renders as the ugly browser-native popup
          ("croquetapp.com says…"). Title + body + colored action button
          are all in Spanish and stay on brand. */}
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
              {pendingAction?.kind === "undo"
                ? "Los bultos volverán a su posición de origen. El registro de este movimiento se borrará por completo del Kardex — no quedará rastro."
                : "Los bultos volverán a su posición de origen. El movimiento original y la reversión quedarán visibles en Kardex para auditoría."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionRunning}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={runPendingAction}
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

    </div>
    </TileHoverContext.Provider>
  );
}

/** Sticky banner shown at the bottom of the viewport while in move mode
 *  and no destination is picked yet. Tells the worker what's moving +
 *  decodes the color glows in a small legend strip + exposes Cancelar. */
function MoveModeBanner({
  source, onCancel,
}: {
  source: MoveMode;
  onCancel: () => void;
}) {
  const c = source.source;
  const productLabel = c.products?.clave ?? c.description ?? "Producto";
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[min(96vw,780px)]">
      <div
        className="rounded-2xl border bg-card/95 backdrop-blur overflow-hidden"
        style={{
          // Layered shadow: soft white aura (pops on dark backgrounds, harmless on light)
          // + heavier drop-shadow for depth. Matches the "white glow" feel requested.
          boxShadow:
            "0 0 40px rgba(255, 255, 255, 0.18), 0 12px 32px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.06) inset",
        }}
      >
        <div className="px-5 sm:px-6 py-3.5 flex items-center gap-3">
          <span className="h-2.5 w-2.5 rounded-full bg-purple-500 animate-pulse shrink-0 shadow-[0_0_10px_rgba(168,85,247,0.7)]" />
          <div className="text-base flex-1 min-w-0 truncate">
            <span className="font-semibold">Moviendo </span>
            <span className="font-mono text-primary">{productLabel}</span>
            <span className="text-muted-foreground"> · </span>
            <span className="font-mono font-semibold">{source.sourceSlot.code}</span>
            <span className="text-muted-foreground"> → toca un destino</span>
          </div>
          <Button variant="ghost" size="sm" onClick={onCancel} className="shrink-0 h-8 px-3 text-xs">
            Cancelar
          </Button>
        </div>
        {/* Legend strip — decodes the color glows so the worker doesn't have
            to guess. Cyan = any legal destination, blue/emerald = "smart"
            picks from the suggestion engine, purple = origin. */}
        <div className="border-t bg-muted/30 px-5 sm:px-6 py-2 flex items-center gap-5 text-xs text-muted-foreground overflow-x-auto no-scrollbar">
          <span className="flex items-center gap-2 whitespace-nowrap">
            <span className="h-3 w-3 rounded-sm bg-cyan-400/30 ring-1 ring-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.5)]" />
            Disponible
          </span>
          <span className="flex items-center gap-2 whitespace-nowrap">
            <span className="h-3 w-3 rounded-sm bg-blue-500/30 ring-1 ring-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.5)]" />
            Pedido cerca de Embarque
          </span>
          <span className="flex items-center gap-2 whitespace-nowrap">
            <span className="h-3 w-3 rounded-sm bg-emerald-500/30 ring-1 ring-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
            Mismo bloque (FIFO)
          </span>
          <span className="flex items-center gap-2 whitespace-nowrap ml-auto">
            <span className="h-3 w-3 rounded-sm bg-purple-500/30 ring-1 ring-purple-500 animate-pulse shadow-[0_0_6px_rgba(168,85,247,0.6)]" />
            Origen
          </span>
        </div>
      </div>
    </div>
  );
}

/** Floating bottom card shown once a destination tile is tapped. Lets
 *  the worker adjust quantity, pick a different destination, or commit. */
function MoveConfirmChip({
  source, pending, submitting, onQuantityChange, onPickAnother, onCancel, onConfirm,
}: {
  source: MoveMode;
  pending: PendingDest;
  submitting: boolean;
  onQuantityChange: (q: number) => void;
  onPickAnother: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const maxQty = source.source.quantity;
  const dec = () => onQuantityChange(Math.max(1, pending.quantity - 1));
  const inc = () => onQuantityChange(Math.min(maxQty, pending.quantity + 1));
  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 w-[min(96vw,640px)]">
      <div className="rounded-2xl border bg-card/95 backdrop-blur shadow-xl p-3 sm:p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono font-bold text-sm truncate">{source.sourceSlot.code}</span>
            <MoveRight className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-mono font-bold text-sm text-primary truncate">{pending.destSlot.code}</span>
          </div>
          <button
            type="button"
            onClick={onPickAnother}
            className="text-[11px] underline text-muted-foreground hover:text-foreground shrink-0"
          >
            Otro destino
          </button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={dec}
              disabled={pending.quantity <= 1 || submitting}
              className="h-8 w-8 p-0"
            >
              −
            </Button>
            <Input
              type="number"
              min={1}
              max={maxQty}
              value={pending.quantity}
              onChange={(e) => onQuantityChange(Math.max(1, Math.min(maxQty, Number(e.target.value) || 1)))}
              className="h-8 w-20 text-center tabular-nums"
              disabled={submitting}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={inc}
              disabled={pending.quantity >= maxQty || submitting}
              className="h-8 w-8 p-0"
            >
              +
            </Button>
            <span className="text-[11px] text-muted-foreground ml-1">
              de {maxQty}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={onConfirm} disabled={submitting} className="min-w-[120px]">
              {submitting ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Moviendo</>
              ) : (
                <>Confirmar</>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Bottom banner + selection list for the batch Mover flow. Two-phase:
 *  picking sources, then picking a destination zone. Once a zone is set,
 *  the banner becomes a confirm chip. */
function BatchMoverBanner({
  batch, submitting, onContinue, onConfirm, onCancel, onRemove,
}: {
  batch: BatchMode;
  submitting: boolean;
  onContinue: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onRemove: (contentId: string) => void;
}) {
  const totalQty = batch.selection.reduce((s, c) => s + c.quantity, 0);
  const isSelecting = batch.phase === "selecting";
  const isDest = batch.phase === "destination" && !batch.pendingZone;
  const isConfirm = batch.phase === "destination" && !!batch.pendingZone;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[min(96vw,780px)]">
      <div
        className="rounded-2xl border bg-card/95 backdrop-blur overflow-hidden"
        style={{
          boxShadow:
            "0 0 40px rgba(16, 185, 129, 0.18), 0 12px 32px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.06) inset",
        }}
      >
        {/* Status row */}
        <div className="px-5 sm:px-6 py-3.5 flex items-center gap-3">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0 shadow-[0_0_10px_rgba(16,185,129,0.7)] warehouse-breathe" />
          <div className="text-base flex-1 min-w-0">
            {isSelecting && (
              <>
                <span className="font-semibold">Mover en lote </span>
                <span className="text-muted-foreground">·</span>{" "}
                <span className="font-mono font-semibold">{batch.selection.length}</span>{" "}
                <span className="text-muted-foreground">lotes</span>
                {totalQty > 0 && (
                  <>
                    {" "}
                    <span className="text-muted-foreground">·</span>{" "}
                    <span className="font-mono font-semibold">{totalQty}</span>{" "}
                    <span className="text-muted-foreground">bultos</span>
                  </>
                )}
                {batch.selection.length === 0 && (
                  <span className="text-muted-foreground italic"> · toca posiciones para añadir</span>
                )}
              </>
            )}
            {isDest && (
              <>
                <span className="font-semibold">Selecciona zona destino </span>
                <span className="text-muted-foreground">— toca Recibo o Embarque</span>
              </>
            )}
            {isConfirm && (
              <>
                <span className="font-mono font-semibold">{batch.selection.length}</span>{" "}
                <span>lotes</span>{" "}
                <span className="text-muted-foreground">→</span>{" "}
                <span className="font-semibold uppercase">{batch.pendingZone}</span>
              </>
            )}
          </div>
          {isSelecting && (
            <>
              <Button variant="ghost" size="sm" onClick={onCancel} className="shrink-0 h-8 px-3 text-xs">
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={onContinue}
                disabled={batch.selection.length === 0}
                className="shrink-0 h-8 px-3 text-xs gap-1"
              >
                Continuar
                <MoveRight className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {isDest && (
            <Button variant="ghost" size="sm" onClick={onCancel} className="shrink-0 h-8 px-3 text-xs">
              Cancelar
            </Button>
          )}
          {isConfirm && (
            <>
              <Button variant="ghost" size="sm" onClick={onCancel} className="shrink-0 h-8 px-3 text-xs" disabled={submitting}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={onConfirm}
                disabled={submitting}
                className="shrink-0 h-8 px-3 text-xs gap-1"
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Confirmar
              </Button>
            </>
          )}
        </div>

        {/* Selection list — only during selecting / dest phases (not while
            committing) so the user can audit + remove individual picks */}
        {batch.selection.length > 0 && !isConfirm && (
          <div className="border-t bg-muted/30 px-3 py-2 max-h-[140px] overflow-y-auto no-scrollbar">
            <div className="flex flex-wrap gap-1.5">
              {batch.selection.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onRemove(c.id)}
                  className="group inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-[11px] hover:border-red-500/60 hover:bg-red-500/10"
                  title="Quitar de la selección"
                >
                  <span className="font-mono text-primary">
                    {c.products?.clave ?? "—"}
                  </span>
                  {c.lote && (
                    <span className="text-muted-foreground font-mono">
                      Lote {c.lote}
                    </span>
                  )}
                  <span className="font-bold tabular-nums">{c.quantity}</span>
                  <XCircle className="h-3 w-3 text-muted-foreground group-hover:text-red-500" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Warehouse physical layout ─────────────────────────────────────
 *
 * Mirrors the customer's 3-page PDF top-down floor plan, rotated so
 * pasillos run vertically (left-to-right ordering across the floor):
 *
 *   ┌──────────────────────── ONE FLOOR ────────────────────────────┐
 *   │                                                                │
 *   │  WALK   COL 1   COL 2   WALK    COL 3   COL 4   WALK    COL 5   │  TRÁNSITO
 *   │  P.100                  P.200                   P.300            │
 *   │                                                                  │
 *   │  ┊┊┊┊  102-01  201-01  ┊┊┊┊   202-01  301-01  ┊┊┊┊  302-01      │  ┌──────┐
 *   │  ┊┊┊┊  102-02  201-02  ┊┊┊┊   202-02  301-02  ┊┊┊┊  302-02      │  │RECIBO│
 *   │  ┊┊┊┊  104-01  203-01  ┊┊┊┊   204-01  303-01  ┊┊┊┊  304-01      │  │      │
 *   │  ┊┊┊┊  104-02  203-02  ┊┊┊┊   204-02  303-02  ┊┊┊┊  304-02      │  │      │
 *   │  ┊┊┊┊  106-01  205-01  ┊┊┊┊   206-01  305-01  ┊┊┊┊  306-01      │  ├──────┤
 *   │  ┊┊┊┊  106-02  205-02  ┊┊┊┊   206-02  305-02  ┊┊┊┊  306-02      │  │EMBARQ│
 *   │  ┊┊┊┊  108-01  207-01  ┊┊┊┊   208-01  307-01  ┊┊┊┊  308-01      │  │      │
 *   │  ┊┊┊┊  108-02  207-02  ┊┊┊┊   208-02  307-02  ┊┊┊┊  308-02      │  │      │
 *   │  ┊┊┊┊  110-01  209-01  ┊┊┊┊   210-01  309-01  ┊┊┊┊  310-01      │  └──────┘
 *   │  ┊┊┊┊  110-02  209-02  ┊┊┊┊   210-02  309-02  ┊┊┊┊  310-02      │
 *   └────────────────────────────────────────────────────────────────┘
 *
 *  Each storage column = 5 blocks stacked vertically; each block = its
 *  2 tarimas (01 on top, 02 below). Walkways are vertical dashed strips
 *  with the pasillo name rotated 90°. Cols 1+2 are back-to-back (rack
 *  spine shared), same for cols 3+4. Pasillo 100 is the entrance lane
 *  on the far left; transit (Recibo + Embarque) on the far right.
 *
 *  The user scrolls vertically to flip between floors:
 *    A · Planta Baja   (top, ground floor, includes transit)
 *    B · Segundo Piso  (middle)
 *    C · Tercer Piso   (bottom)
 *
 * Sizing constants kept here so skeleton state and loaded state are
 * pixel-identical (no layout shift). */
const CELL_PX = 44;
const TARIMA_GAP = 3;         // gap between tile 01 and 02 within a block
const LABEL_W = 28;           // block-label gutter width (e.g., "102")
const LABEL_TILE_GAP = 4;     // gap between block label and its 2 tiles
const BLOCK_GAP = 6;          // gap between adjacent blocks in a column
const COL_GAP = 6;            // gap between adjacent columns / walkways
const WALKWAY_W = 36;         // vertical walkway strip width
const SECTION_GAP = 24;       // gap between storage area and transit
const TRANSIT_W = 88;         // width of one transit big tile

/** Per-block geometry */
const BLOCK_H = 2 * CELL_PX + TARIMA_GAP;       // 91 — label height matches this
const BLOCK_W = LABEL_W + LABEL_TILE_GAP + CELL_PX; // 76 — label + tile column

/** Per-column geometry (5 blocks stacked vertically) */
const COL_W = BLOCK_W;
const COL_H = 5 * BLOCK_H + 4 * BLOCK_GAP;      // 5*91 + 4*6 = 479

/** Full storage area width: 5 columns + 3 walkways + 7 gaps between them */
const STORAGE_W = 5 * COL_W + 3 * WALKWAY_W + 7 * COL_GAP;

type FloorSection =
  | { kind: "walkway"; label: string }
  | { kind: "column"; blocks: number[]; labelSide?: "left" | "right" };

/** Floor sections left→right, exactly as the customer specified.
 *  Cols 1+2 are flush (back-to-back rack), cols 3+4 same.
 *  Cols 2 and 4 carry their block labels on the RIGHT so the tarima
 *  tiles of cols 1+2 (and 3+4) sit visually flush, mirroring the
 *  physical back-to-back rack geometry. */
const FLOOR_SECTIONS: FloorSection[] = [
  { kind: "walkway", label: "Pasillo 100" },
  { kind: "column", blocks: [102, 104, 106, 108, 110], labelSide: "left" },
  { kind: "column", blocks: [201, 203, 205, 207, 209], labelSide: "right" },
  { kind: "walkway", label: "Pasillo 200" },
  { kind: "column", blocks: [202, 204, 206, 208, 210], labelSide: "left" },
  { kind: "column", blocks: [301, 303, 305, 307, 309], labelSide: "right" },
  { kind: "walkway", label: "Pasillo 300" },
  { kind: "column", blocks: [302, 304, 306, 308, 310], labelSide: "left" },
];

interface FloorDef {
  code: "A" | "B" | "C";
  title: string;
  hasTransit: boolean;
}

const FLOORS_LAYOUT: FloorDef[] = [
  { code: "A", title: "A · Planta Baja", hasTransit: true },
  { code: "B", title: "B · Segundo Piso", hasTransit: false },
  { code: "C", title: "C · Tercer Piso", hasTransit: false },
];


/** One floor = a title + the storage area (walkways + columns arranged
 *  left→right) + transit column (planta A only; an invisible spacer on
 *  B/C so the right-side detail panel column aligns across floors) +
 *  the floor's detail panel. */
function FloorPlan({
  floor, isLoading, slotsByCode, transitSlots, contentsBySlot,
  tileClass, onSlotClick, onZoneClick, searchMatchIds, rightContent,
  transitTargetable, transitSelected,
}: {
  floor: FloorDef;
  isLoading: boolean;
  slotsByCode: Map<string, Slot>;
  transitSlots: Slot[];
  contentsBySlot: Map<string, SlotContent[]>;
  tileClass: (s: Slot, fillCount: number) => string;
  onSlotClick: (id: string) => void;
  onZoneClick: (z: "recibo" | "embarque") => void;
  searchMatchIds: Set<string> | null;
  rightContent?: React.ReactNode;
  transitTargetable?: "recibo" | "embarque" | "both" | null;
  transitSelected?: "recibo" | "embarque" | null;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-bold uppercase tracking-wide pb-1.5 border-b">
        {floor.title}
      </h2>
      <div className="flex items-start" style={{ gap: SECTION_GAP }}>
        {/* Storage area: walkways + columns laid out left→right */}
        <div className="flex items-start shrink-0" style={{ gap: COL_GAP }}>
          {FLOOR_SECTIONS.map((section, i) => {
            if (section.kind === "walkway") {
              return <Walkway key={`w-${i}`} label={section.label} />;
            }
            return (
              <StorageColumn
                key={`c-${i}`}
                blocks={section.blocks}
                labelSide={section.labelSide ?? "left"}
                floor={floor.code}
                isLoading={isLoading}
                slotsByCode={slotsByCode}
                contentsBySlot={contentsBySlot}
                tileClass={tileClass}
                onSlotClick={onSlotClick}
                searchMatchIds={searchMatchIds}
              />
            );
          })}
        </div>

        {/* Recibo / Embarque on the far right, planta A only.
            On floors without transit we render an invisible spacer of the
            same width so the right-hand detail panel sits in the exact
            same x-position across all three floors. */}
        {floor.hasTransit ? (
          <TransitColumn
            transitSlots={transitSlots}
            contentsBySlot={contentsBySlot}
            isLoading={isLoading}
            onZoneClick={onZoneClick}
            targetableZone={transitTargetable}
            selectedZone={transitSelected}
          />
        ) : (
          <div className="shrink-0" style={{ width: TRANSIT_W, height: COL_H }} aria-hidden />
        )}

        {/* Floor's detail panel — fills remaining horizontal space inside
            the card. Min-width 420px so the data is readable even when
            the user has narrowed the viewport; in that case the card's
            overflow-x-auto scrolls horizontally instead of squishing.
            Same width on every floor because all preceding columns sum
            to the same total. */}
        {rightContent && (
          <div
            className="flex-1 min-w-[420px]"
            style={{ minHeight: COL_H }}
          >
            {rightContent}
          </div>
        )}
      </div>
    </section>
  );
}

/** Vertical walkway strip between storage columns. Dashed left+right
 *  borders + the pasillo name rotated 90° so it reads bottom-to-top
 *  along the strip — visually clear that this is the lane the apilador
 *  drives down. Spans the full column height. */
function Walkway({ label }: { label: string }) {
  return (
    <div
      style={{ width: WALKWAY_W, height: COL_H }}
      className="flex items-center justify-center border-x-2 border-dashed border-muted-foreground/30 bg-muted/30 shrink-0"
    >
      <span
        className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap"
        style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
      >
        {label}
      </span>
    </div>
  );
}

/** One storage column = 5 blocks stacked vertically (top→bottom). Each
 *  block renders as a label gutter + its 2-tile stack (01 on top, 02
 *  below). `labelSide` controls which side the label sits on so cols 2
 *  and 4 (which are back-to-back with cols 1 and 3) can have their
 *  labels on the OUTSIDE, keeping the tarimas flush across the spine. */
function StorageColumn({
  blocks, labelSide, floor, isLoading, slotsByCode, contentsBySlot, tileClass,
  onSlotClick, searchMatchIds,
}: {
  blocks: number[];
  labelSide: "left" | "right";
  floor: "A" | "B" | "C";
  isLoading: boolean;
  slotsByCode: Map<string, Slot>;
  contentsBySlot: Map<string, SlotContent[]>;
  tileClass: (s: Slot, fillCount: number) => string;
  onSlotClick: (id: string) => void;
  searchMatchIds: Set<string> | null;
}) {
  return (
    <div
      className="flex flex-col shrink-0"
      style={{ gap: BLOCK_GAP, width: COL_W }}
    >
      {blocks.map((block) => (
        <BlockUnit
          key={block}
          block={block}
          labelSide={labelSide}
          floor={floor}
          isLoading={isLoading}
          slotsByCode={slotsByCode}
          contentsBySlot={contentsBySlot}
          tileClass={tileClass}
          onSlotClick={onSlotClick}
          searchMatchIds={searchMatchIds}
        />
      ))}
    </div>
  );
}

/** One block unit = its number label + its 2 tarima tiles stacked
 *  vertically (01 on top, 02 below). `labelSide` places the label on
 *  the left or right of the tile-stack. */
function BlockUnit({
  block, labelSide, floor, isLoading, slotsByCode, contentsBySlot,
  tileClass, onSlotClick, searchMatchIds,
}: {
  block: number;
  labelSide: "left" | "right";
  floor: "A" | "B" | "C";
  isLoading: boolean;
  slotsByCode: Map<string, Slot>;
  contentsBySlot: Map<string, SlotContent[]>;
  tileClass: (s: Slot, fillCount: number) => string;
  onSlotClick: (id: string) => void;
  searchMatchIds: Set<string> | null;
}) {
  const label = (
    <div
      style={{ width: LABEL_W, height: BLOCK_H }}
      className="flex items-center justify-center text-[11px] font-mono font-bold text-muted-foreground"
    >
      {block}
    </div>
  );
  const tiles = (
    <div className="flex flex-col" style={{ gap: TARIMA_GAP }}>
      {([1, 2] as const).map((pos) => {
        const code = `${block}-${floor}-${String(pos).padStart(2, "0")}`;
        const slot = slotsByCode.get(code);
        return (
          <SlotTile
            key={pos}
            pos={pos}
            slot={slot ?? null}
            isLoading={isLoading}
            contentsBySlot={contentsBySlot}
            tileClass={tileClass}
            onClick={onSlotClick}
            dimmed={searchMatchIds ? !(slot && searchMatchIds.has(slot.id)) : false}
          />
        );
      })}
    </div>
  );
  return (
    <div className="flex items-center" style={{ gap: LABEL_TILE_GAP, height: BLOCK_H, width: BLOCK_W }}>
      {labelSide === "left" ? <>{label}{tiles}</> : <>{tiles}{label}</>}
    </div>
  );
}

/** One tile = one slot. Sized to CELL_PX × CELL_PX so the skeleton
 *  state matches the loaded state exactly. The position label (01/02)
 *  is shown small in the corner so the user can always verify which
 *  tarima they're looking at — both tarimas of a block are visible. */
function SlotTile({
  slot, isLoading, contentsBySlot, tileClass, onClick, dimmed, pos,
}: {
  slot: Slot | null;
  isLoading: boolean;
  contentsBySlot: Map<string, SlotContent[]>;
  tileClass: (s: Slot, fillCount: number) => string;
  onClick: (id: string) => void;
  dimmed?: boolean;
  pos: 1 | 2;
}) {
  if (isLoading) {
    return <Skeleton style={{ width: CELL_PX, height: CELL_PX }} className="rounded" />;
  }
  const posLabel = pos === 1 ? "01" : "02";
  if (!slot) {
    // Visible placeholder so missing-data slots are obvious rather
    // than blending in with the background.
    return (
      <div
        style={{ width: CELL_PX, height: CELL_PX }}
        className="rounded border border-dashed border-muted-foreground/30 bg-muted/20 flex items-center justify-center text-[9px] text-muted-foreground/60 font-mono"
      >
        {posLabel}
      </div>
    );
  }
  const cs = contentsBySlot.get(slot.id) ?? [];
  const fill = cs.reduce((sum, c) => sum + c.quantity, 0);
  const hover = useContext(TileHoverContext);
  return (
    <button
      type="button"
      onClick={() => onClick(slot.id)}
      onMouseEnter={() => hover?.enter(slot)}
      onMouseLeave={() => hover?.leave()}
      style={{ width: CELL_PX, height: CELL_PX }}
      className={cn(
        "relative rounded border text-[10px] font-medium flex items-center justify-center",
        // transition-all + hover scale + glow + z so the hovered tile pops
        // above neighbors with a clear "this is selected" indicator
        "transition-all duration-150 active:scale-[0.95]",
        "hover:scale-110 hover:z-20 hover:brightness-110",
        "hover:shadow-[0_0_14px_rgba(255,255,255,0.55)]",
        tileClass(slot, cs.length),
        dimmed && "opacity-25"
      )}
      title={slot.code}
    >
      {/* Position label in top-left corner — proves both 01 and 02 are
          rendered so the user can verify orientation. */}
      <span className="absolute top-0.5 left-1 text-[8px] font-mono opacity-60">
        {posLabel}
      </span>
      {slot.blocked ? (
        <Lock className="h-3.5 w-3.5" />
      ) : slot.access_type === "damaged" ? (
        <PackageX className="h-3.5 w-3.5" />
      ) : fill > 0 ? (
        <span className="font-bold tabular-nums text-sm">{fill}</span>
      ) : (
        <span className="opacity-40 text-sm">·</span>
      )}
    </button>
  );
}

/* ── SlotDetailPanel ──────────────────────────────────────────
 *
 * Static right-side panel that updates as the user hovers tiles. Anchored
 * in the same screen position across all three floors so the eye never
 * has to relocate to find the data. Shows thumbnail, slot code, every
 * lote in the slot (SKU / name / lote / barcode / qty / caducidad) and
 * the most recent Kardex movement.
 *
 * Empty/idle state shows a hint so the panel never looks broken.
 */
function SlotDetailPanel({
  slot, contents, latestMovement, onMoveLote, onUndoMovement, onRevertMovement,
}: {
  slot: Slot | null;
  contents: SlotContent[];
  latestMovement: LatestMovement | null;
  /** Fired when the user clicks the per-lote Mover button. Parent
   *  owns the move-mode state. */
  onMoveLote?: (slot: Slot, content: SlotContent) => void;
  /** Fired when the user clicks "Deshacer" on a recent reubicacion
   *  (< 30 min old). Real undo: erases the Kardex pair. */
  onUndoMovement?: (movementId: string) => void;
  /** Fired when the user clicks "Revertir" on an older reubicacion.
   *  Audit-preserving reverse: inserts a new compensating pair. */
  onRevertMovement?: (movementId: string) => void;
}) {
  if (!slot) {
    return (
      <div className="rounded-xl border bg-card/30 h-full text-center text-sm text-muted-foreground italic flex flex-col items-center justify-center gap-3 px-6 py-10">
        <Package className="h-10 w-10 opacity-25" />
        <div className="max-w-[260px]">
          Pasa el cursor sobre una posición de este nivel para ver su contenido
        </div>
      </div>
    );
  }

  const totalQty = contents.reduce((s, c) => s + c.quantity, 0);
  const totalLotes = contents.length;
  const firstImage = contents.find(c => c.products?.image_url)?.products?.image_url ?? null;

  // Access-type chip styling mirrors the slot drawer
  const accessChip = (() => {
    if (slot.blocked)
      return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30"><Lock className="h-3 w-3 mr-1" />Bloqueada</Badge>;
    if (slot.access_type === "damaged")
      return <Badge variant="outline" className="bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/40"><PackageX className="h-3 w-3 mr-1" />Dañados</Badge>;
    if (slot.access_type === "patines")
      return <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/40">Patines</Badge>;
    if (slot.access_type === "manual")
      return <Badge variant="outline" className="bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/40">Manual</Badge>;
    if (slot.zone === "recibo")
      return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30"><Inbox className="h-3 w-3 mr-1" />Recibo</Badge>;
    if (slot.zone === "embarque")
      return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30"><Truck className="h-3 w-3 mr-1" />Embarque</Badge>;
    return null;
  })();

  return (
    <div className="rounded-xl border bg-card overflow-hidden h-full flex flex-col">
      {/* Header — bigger thumbnail + slot code + chip */}
      <div className="p-4 border-b bg-muted/30 flex items-center gap-4">
        <ProductThumb src={firstImage} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-xl font-bold leading-tight">{slot.code}</div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {accessChip}
          </div>
          {slot.zone === "storage" && (
            <div className="text-xs text-muted-foreground mt-1">
              Bloque {slot.block} · Planta {slot.row_letter} · Tarima {slot.position === 1 ? "01" : "02"}
            </div>
          )}
        </div>
        {/* Big bultos display on the right */}
        <div className="text-right shrink-0 border-l pl-4">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
            Bultos
          </div>
          <div className="text-3xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400 leading-none mt-0.5">
            {totalQty.toLocaleString("es-MX")}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {totalLotes} {totalLotes === 1 ? "lote" : "lotes"}
          </div>
        </div>
      </div>

      {/* Recent-action banner — appears prominently RIGHT BELOW the header
          when the last touch on this slot is a recent (≤30 min) movement
          that can be undone. Impossible to miss. The user can also
          Revertir older movements from the same banner. */}
      {latestMovement && (latestMovement.reason === "reubicacion" || latestMovement.reason === "entrada" || latestMovement.reason === "pedido") && (onUndoMovement || onRevertMovement) && (() => {
        const ageMin = (Date.now() - new Date(latestMovement.created_at).getTime()) / 60000;
        const canUndo = ageMin <= 30;
        if (!canUndo && !onRevertMovement) return null;
        return (
          <div className={cn(
            "border-y px-4 py-2.5 flex items-center justify-between gap-3",
            canUndo ? "bg-amber-500/10 border-amber-500/30" : "bg-muted/30",
          )}>
            <div className="flex items-center gap-2 min-w-0">
              {canUndo ? <Undo2 className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" /> : <RotateCcw className="h-4 w-4 shrink-0" />}
              <div className="min-w-0 text-xs">
                <span className="font-semibold">
                  {canUndo ? "Acción reciente" : "Movimiento previo"}
                </span>
                <span className="text-muted-foreground"> · </span>
                <span>
                  {latestMovement.delta > 0 ? "+" : ""}{latestMovement.delta} bultos · {REASON_LABELS[latestMovement.reason] ?? latestMovement.reason}
                </span>
              </div>
            </div>
            {canUndo && onUndoMovement ? (
              <Button
                size="sm"
                onClick={() => onUndoMovement(latestMovement.id)}
                className="h-7 gap-1 text-xs shrink-0 bg-amber-500 hover:bg-amber-600 text-white"
              >
                <Undo2 className="h-3 w-3" />
                Deshacer
              </Button>
            ) : onRevertMovement ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRevertMovement(latestMovement.id)}
                className="h-7 gap-1 text-xs shrink-0"
              >
                <RotateCcw className="h-3 w-3" />
                Revertir
              </Button>
            ) : null}
          </div>
        );
      })()}

      {/* Contents — one block per lote, two-column grid for metadata */}
      <div className="flex-1 overflow-y-auto divide-y">
        {contents.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground italic">
            Posición vacía
          </div>
        ) : (
          contents.map((c) => {
            // Imported via Excel with a SKU that didn't exist in `products`
            // (or a true loose tarima without an SKU at all). Surface a
            // notice so the user knows the line item is not catalog-linked.
            const unmatchedSku = !c.products && !!c.description;
            return (
            <div key={c.id} className="p-3.5 space-y-2 group">
              <div className="flex items-center gap-3">
                <ProductThumb src={c.products?.image_url ?? null} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[11px] text-primary leading-tight">
                    {c.products?.clave ?? (unmatchedSku ? <span className="text-orange-600 dark:text-orange-400">— sin SKU</span> : "—")}
                  </div>
                  <div className="text-sm font-semibold leading-tight line-clamp-2">
                    {c.products?.name ?? c.description ?? "—"}
                  </div>
                  {unmatchedSku && (
                    <div className="text-[10px] text-orange-600 dark:text-orange-400 italic leading-tight mt-0.5">
                      ⚠︎ No vinculado al catálogo
                    </div>
                  )}
                </div>
                <div className="font-bold tabular-nums text-xl shrink-0 text-emerald-700 dark:text-emerald-400">
                  {c.quantity}
                </div>
              </div>
              <div className="grid grid-cols-[1fr_1fr] gap-x-3 gap-y-1 text-[11px] pl-[60px]">
                {c.lote && (
                  <div className="truncate">
                    <span className="opacity-60">Lote </span>
                    <span className="font-mono text-foreground">{c.lote}</span>
                  </div>
                )}
                {c.barcode && (
                  <div className="truncate">
                    <span className="opacity-60">Código </span>
                    <span className="font-mono text-foreground">{c.barcode}</span>
                  </div>
                )}
                {c.expiration_date && (
                  <div className="col-span-2">
                    <span className="opacity-60">Caduca </span>
                    <span className="text-foreground">{fmtDate(c.expiration_date)}</span>
                  </div>
                )}
              </div>
              {/* Per-lote Mover action — skipped for transit zones since
                  the move-mode entry point is moving FROM storage; if you
                  want to relocate from Recibo/Embarque, use the existing
                  drawer-based flow. */}
              {onMoveLote && slot.zone === "storage" && (
                <div className="pl-[60px]">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-[11px] px-2"
                    onClick={() => onMoveLote(slot, c)}
                  >
                    <MoveRight className="h-3 w-3" />
                    Mover
                  </Button>
                </div>
              )}
            </div>
            );
          })
        )}
      </div>

      {/* Last movement footer */}
      <div className="border-t p-3 bg-muted/20 shrink-0">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
          Último movimiento
        </div>
        {latestMovement ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] font-semibold whitespace-nowrap",
                  REASON_BADGE_CLASS[latestMovement.reason] ?? "",
                )}
              >
                {REASON_LABELS[latestMovement.reason] ?? latestMovement.reason}
              </Badge>
              <span
                className={cn(
                  "font-bold tabular-nums text-sm",
                  latestMovement.delta > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400",
                )}
              >
                {latestMovement.delta > 0 ? "+" : ""}
                {latestMovement.delta}
              </span>
              <span className="text-[10px] text-muted-foreground tabular-nums ml-auto whitespace-nowrap">
                {format(new Date(latestMovement.created_at), "dd MMM HH:mm", { locale: es })}
              </span>
            </div>
            {latestMovement.products && (
              <div className="text-[10px] text-muted-foreground">
                <span className="font-mono text-primary">{latestMovement.products.clave}</span>
                {latestMovement.lote && (
                  <> · <span className="font-mono">Lote {latestMovement.lote}</span></>
                )}
              </div>
            )}
            {latestMovement.note && (
              <div className="text-[10px] text-muted-foreground italic truncate">
                {latestMovement.note}
              </div>
            )}
            {/* Deshacer/Revertir promoted to a banner just below the
                header — see the conditional block above. Kept here as
                a deliberate empty space so the footer doesn't visually
                anchor an action the user has already seen at the top. */}
          </div>
        ) : (
          <div className="text-[10px] text-muted-foreground italic">
            Sin movimientos registrados
          </div>
        )}
      </div>
    </div>
  );
}

/** Transit column — sits to the right of the storage area, only on
 *  floor A. Renders ONE big tile per zone (Recibo + Embarque), exactly
 *  as the customer's PDF shows them. Tapping a big tile opens a dialog
 *  with the 5 individual sub-positions. Spans the full storage height
 *  so it visually aligns with all 5 rack rows + 3 walkways. */
function TransitColumn({
  transitSlots, contentsBySlot, isLoading, onZoneClick, targetableZone, selectedZone,
}: {
  transitSlots: Slot[];
  contentsBySlot: Map<string, SlotContent[]>;
  isLoading: boolean;
  onZoneClick: (z: "recibo" | "embarque") => void;
  /** When set, the matching zone tile pulses as a valid drop target
   *  (move mode + batch destination mode). */
  targetableZone?: "recibo" | "embarque" | "both" | null;
  /** When set, the matching zone tile is highlighted as the *chosen*
   *  destination (batch confirm). */
  selectedZone?: "recibo" | "embarque" | null;
}) {
  // Half-and-half split of the full column height. The BLOCK_GAP between
  // them keeps the boundary aligned with the storage columns visually.
  const totalH = COL_H;
  const halfH = (totalH - BLOCK_GAP) / 2;
  return (
    <div className="space-y-1.5 shrink-0">
      <h3 className="text-[11px] font-semibold text-center text-muted-foreground uppercase tracking-wide">
        Tránsito
      </h3>
      <div className="flex flex-col" style={{ gap: BLOCK_GAP }}>
        <TransitBigTile
          zone="recibo"
          height={halfH}
          transitSlots={transitSlots}
          contentsBySlot={contentsBySlot}
          isLoading={isLoading}
          onClick={() => onZoneClick("recibo")}
          targetable={targetableZone === "recibo" || targetableZone === "both"}
          selected={selectedZone === "recibo"}
        />
        <TransitBigTile
          zone="embarque"
          height={halfH}
          transitSlots={transitSlots}
          contentsBySlot={contentsBySlot}
          isLoading={isLoading}
          onClick={() => onZoneClick("embarque")}
          targetable={targetableZone === "embarque" || targetableZone === "both"}
          selected={selectedZone === "embarque"}
        />
      </div>
    </div>
  );
}

/** One big tile = one whole transit zone. Shows zone name + aggregate
 *  bultos. Tappable to drill into the sub-positions.
 *
 *  Recibo gets a subtle amber breathe + count chip when it has any
 *  pending entradas — the user explicitly asked for "a subtle but not
 *  annoying glow that tells the user he needs to assign those bultos
 *  into real warehouse slots." The animation reuses warehouse-breathe
 *  from the brand sheet (slow opacity pulse) so it doesn't compete
 *  with the bright green targetable state used during move mode. */
function TransitBigTile({
  zone, height, transitSlots, contentsBySlot, isLoading, onClick, targetable, selected,
}: {
  zone: "recibo" | "embarque";
  height: number;
  transitSlots: Slot[];
  contentsBySlot: Map<string, SlotContent[]>;
  isLoading: boolean;
  onClick: () => void;
  targetable?: boolean;
  selected?: boolean;
}) {
  if (isLoading) {
    return <Skeleton style={{ width: TRANSIT_W, height }} className="rounded-lg" />;
  }
  const zoneSlots = transitSlots.filter((s) => s.zone === zone);
  const totalBultos = zoneSlots.reduce((sum, s) => {
    const cs = contentsBySlot.get(s.id) ?? [];
    return sum + cs.reduce((a, c) => a + c.quantity, 0);
  }, 0);
  const lotes = zoneSlots.reduce((n, s) => n + (contentsBySlot.get(s.id)?.length ?? 0), 0);
  const Icon = zone === "recibo" ? Inbox : Truck;

  // Pending = recibo has unassigned entradas. Skips the visual when
  // the worker is already in move/batch mode — the green targetable
  // animation takes priority then.
  const pending = zone === "recibo" && totalBultos > 0 && !targetable && !selected;

  const bg = zone === "recibo"
    ? "bg-blue-500/10 border-blue-500/50 text-blue-700 dark:text-blue-300"
    : "bg-indigo-500/10 border-indigo-500/50 text-indigo-700 dark:text-indigo-300";
  const targetableClasses = "ring-2 ring-emerald-500 ring-offset-2 ring-offset-background shadow-[0_0_16px_rgba(16,185,129,0.55)] brightness-110 warehouse-breathe z-10";
  const selectedClasses    = "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-[0_0_18px_rgba(99,102,241,0.7)] brightness-115 z-10";
  const pendingClasses     = "ring-2 ring-amber-500/60 shadow-[0_0_14px_rgba(245,158,11,0.35)] warehouse-breathe";

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ width: TRANSIT_W, height }}
      className={cn(
        "relative rounded-lg border-2 flex flex-col items-center justify-center gap-1 transition active:scale-[0.97] p-1",
        bg,
        selected && selectedClasses,
        targetable && !selected && targetableClasses,
        pending && pendingClasses,
      )}
    >
      {/* Tiny "needs attention" chip when recibo has pending bultos.
          Sits at the top-right corner so it's visible without redrawing
          the layout. Hidden in move-mode states (handled by `pending`). */}
      {pending && (
        <span className="absolute -top-1.5 -right-1.5 rounded-full bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 tabular-nums shadow-md">
          {lotes}
        </span>
      )}
      <Icon className="h-4 w-4" />
      <div className="text-[10px] font-bold uppercase tracking-wide">
        {zone === "recibo" ? "Recibo" : "Embarque"}
      </div>
      <div className="text-lg font-bold tabular-nums leading-none">{totalBultos}</div>
      <div className="text-[9px] opacity-70 leading-tight text-center">
        {zoneSlots.length} pos · {lotes} lote{lotes === 1 ? "" : "s"}
      </div>
    </button>
  );
}

/** Dialog that opens when the user taps a big transit tile. Shows the
 *  5 sub-positions of the zone with their contents at a glance. Tap a
 *  sub-position to open the full slot drawer. */
function TransitZoneDialog({
  zone, slots, contentsBySlot, open, onOpenChange, onSlotClick,
}: {
  zone: "recibo" | "embarque" | null;
  slots: Slot[];
  contentsBySlot: Map<string, SlotContent[]>;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSlotClick: (id: string) => void;
}) {
  // Collect the order_ids visible in this dialog so we can fetch
  // their order_items totals once (used to display "X de Y bultos"
  // per order in the embarque branch).
  const zoneSlots = useMemo(() => {
    if (!zone) return [] as Slot[];
    return slots
      .filter((s) => s.zone === zone)
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [slots, zone]);

  const orderIdsInZone = useMemo(() => {
    if (zone !== "embarque") return [] as string[];
    const ids = new Set<string>();
    for (const s of zoneSlots) {
      for (const c of contentsBySlot.get(s.id) ?? []) {
        if (c.order_id) ids.add(c.order_id);
      }
    }
    return [...ids];
  }, [zone, zoneSlots, contentsBySlot]);

  const { data: orderTotals = {} } = useQuery({
    queryKey: ["embarque-order-totals", orderIdsInZone.sort().join(",")],
    enabled: open && zone === "embarque" && orderIdsInZone.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("order_items")
        .select("order_id, quantity")
        .in("order_id", orderIdsInZone);
      if (error) throw error;
      const acc: Record<string, number> = {};
      for (const r of (data ?? []) as { order_id: string; quantity: number }[]) {
        acc[r.order_id] = (acc[r.order_id] ?? 0) + r.quantity;
      }
      return acc;
    },
    staleTime: 30 * 1000,
  });

  if (!zone) return null;

  const Icon = zone === "recibo" ? Inbox : Truck;
  const title = zone === "recibo" ? "Zona de Recibo" : "Zona de Embarque";

  // ---- EMBARQUE: group sub-slots by order_id ----
  // Each group becomes one section in the dialog body. Slots without
  // an order_id fall into a "Sin asignar" group at the bottom.
  type OrderGroup = {
    key: string;
    order_id: string | null;
    order_code: string | null;
    client: string;
    fulfillment: string | null;
    status: string | null;
    urgency: boolean;
    slots: Array<{ slot: Slot; contents: SlotContent[]; total: number }>;
    picked: number;
    needed: number;
  };

  const embarqueGroups: OrderGroup[] = (() => {
    if (zone !== "embarque") return [];
    const byOrder = new Map<string, OrderGroup>();
    for (const slot of zoneSlots) {
      const cs = contentsBySlot.get(slot.id) ?? [];
      if (cs.length === 0) continue;  // skip empty slots
      // Each slot can technically hold multiple lotes from different orders
      // but in practice it's usually one. Group by the row's order_id.
      for (const c of cs) {
        const key = c.order_id ?? "__unassigned__";
        let g = byOrder.get(key);
        if (!g) {
          const o = c.orders;
          g = {
            key,
            order_id: c.order_id ?? null,
            order_code: o?.order_code ?? null,
            client: (o?.clients?.name?.trim() || o?.clients?.razon_social?.trim() || "Sin cliente"),
            fulfillment: o?.fulfillment_method ?? null,
            status: o?.status ?? null,
            urgency: o?.urgency ?? false,
            slots: [],
            picked: 0,
            needed: c.order_id ? (orderTotals[c.order_id] ?? 0) : 0,
          };
          byOrder.set(key, g);
        }
        // Group rows by slot inside this group
        let existing = g.slots.find((x) => x.slot.id === slot.id);
        if (!existing) {
          existing = { slot, contents: [], total: 0 };
          g.slots.push(existing);
        }
        existing.contents.push(c);
        existing.total += c.quantity;
        g.picked += c.quantity;
      }
    }
    // Order: real orders first (by code), unassigned at the bottom
    return [...byOrder.values()].sort((a, b) => {
      if (a.key === "__unassigned__") return 1;
      if (b.key === "__unassigned__") return -1;
      return (a.order_code ?? "").localeCompare(b.order_code ?? "");
    });
  })();

  // Empty embarque sub-slots (no contents) — surfaced as a small
  // strip at the bottom so the worker still sees what's free.
  const emptyEmbarqueSlots = zone === "embarque"
    ? zoneSlots.filter((s) => (contentsBySlot.get(s.id) ?? []).length === 0)
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl w-[96vw] max-h-[90vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="text-xl flex items-center gap-2 flex-wrap">
            <Icon className="h-5 w-5 text-blue-500" />
            {title}
            <span className="text-sm font-normal text-muted-foreground ml-1">
              · {zoneSlots.length} posiciones
            </span>
            {zone === "embarque" && embarqueGroups.length > 0 && (
              <Badge variant="outline" className="text-[10px] bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40">
                {embarqueGroups.filter((g) => g.key !== "__unassigned__").length} órden{embarqueGroups.filter((g) => g.key !== "__unassigned__").length === 1 ? "" : "es"} preparándose
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {zone === "embarque" ? (
            <>
              {embarqueGroups.length === 0 ? (
                <div className="text-center py-10 text-sm text-muted-foreground italic flex flex-col items-center gap-2">
                  <Truck className="h-8 w-8 opacity-30" />
                  Embarque vacío. Surte una orden desde "Órdenes por surtir" para llenarlo.
                </div>
              ) : (
                embarqueGroups.map((g) => (
                  <EmbarqueOrderGroupCard
                    key={g.key}
                    group={g}
                    onSlotClick={onSlotClick}
                  />
                ))
              )}
              {emptyEmbarqueSlots.length > 0 && (
                <section className="rounded-xl border border-dashed bg-card/40 p-3">
                  <div className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground mb-2">
                    Posiciones libres ({emptyEmbarqueSlots.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {emptyEmbarqueSlots.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onSlotClick(s.id)}
                        className="rounded-md border border-dashed px-2.5 py-1 text-[11px] font-mono text-muted-foreground hover:bg-muted/30 transition active:scale-[0.97]"
                      >
                        {s.code}
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : (
            // RECIBO — flat grid, unchanged from previous behavior
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {zoneSlots.map((s) => {
                const cs = contentsBySlot.get(s.id) ?? [];
                const fill = cs.reduce((sum, c) => sum + c.quantity, 0);
                const empty = cs.length === 0;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onSlotClick(s.id)}
                    className={cn(
                      "rounded-lg border bg-card p-3 text-left transition active:scale-[0.98] space-y-1.5 min-h-[112px]",
                      empty ? "border-dashed text-muted-foreground" : "hover:bg-muted/30",
                    )}
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="font-mono font-bold text-sm">{s.code}</span>
                      {!empty && (
                        <span className="text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                          {fill}
                        </span>
                      )}
                    </div>
                    {empty ? (
                      <div className="text-xs italic">Vacía</div>
                    ) : (
                      <>
                        <div className="text-[11px] text-muted-foreground">
                          {cs.length} lote{cs.length === 1 ? "" : "s"}
                        </div>
                        {cs.slice(0, 2).map((c) => (
                          <div key={c.id} className="text-[11px] truncate">
                            <span className="font-mono text-primary mr-1">
                              {c.products?.clave ?? "—"}
                            </span>
                            <span className="text-muted-foreground">
                              {c.products?.name ?? c.description ?? ""}
                            </span>
                          </div>
                        ))}
                        {cs.length > 2 && (
                          <div className="text-[10px] italic text-muted-foreground">
                            +{cs.length - 2} más
                          </div>
                        )}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** One order's section inside the Zona de Embarque dialog. Header
 *  has the order code chip, client, day/fulfillment chips, and a
 *  bultos progress strip. Below, each EMBARQUE-NN sub-slot belonging
 *  to this order is rendered as its own clickable tile showing the
 *  product + lote inside. */
function EmbarqueOrderGroupCard({
  group, onSlotClick,
}: {
  group: {
    key: string;
    order_id: string | null;
    order_code: string | null;
    client: string;
    fulfillment: string | null;
    status: string | null;
    urgency: boolean;
    slots: Array<{ slot: Slot; contents: SlotContent[]; total: number }>;
    picked: number;
    needed: number;
  };
  onSlotClick: (id: string) => void;
}) {
  const isUnassigned = group.key === "__unassigned__";
  const isPickup = group.fulfillment === "pickup";
  const remaining = Math.max(0, group.needed - group.picked);
  const pct = group.needed > 0 ? Math.min(100, Math.round((group.picked / group.needed) * 100)) : 0;
  const ready = group.needed > 0 && remaining === 0;

  return (
    <section
      className={cn(
        "rounded-xl border-2 bg-card overflow-hidden",
        isUnassigned
          ? "border-dashed border-border"
          : ready
            ? "border-emerald-500/40"
            : remaining > 0 && group.needed > 0
              ? "border-amber-500/40"
              : "border-border",
      )}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center gap-3 flex-wrap bg-muted/20">
        {isUnassigned ? (
          <>
            <Badge variant="outline" className="bg-gray-500/15 text-gray-700 dark:text-gray-300 border-gray-500/40">
              Sin asignar
            </Badge>
            <span className="text-xs text-muted-foreground italic">
              Bultos en embarque que no están atados a una orden — probablemente colocaciones manuales.
            </span>
          </>
        ) : (
          <>
            <span className="font-mono font-bold text-sm">{group.order_code}</span>
            {isPickup ? (
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/40 gap-1">
                <Hand className="h-2.5 w-2.5" />
                Pickup
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40 gap-1">
                <Truck className="h-2.5 w-2.5" />
                Reparto
              </Badge>
            )}
            {group.urgency && (
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40">
                Urgente
              </Badge>
            )}
            {group.status && (
              <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                {group.status}
              </Badge>
            )}
            <span className="text-sm font-medium truncate min-w-0 flex-1">
              {group.client}
            </span>
            {/* Progress chip on the right */}
            {group.needed > 0 && (
              <div className="shrink-0 flex items-center gap-2">
                <div className="h-1.5 w-32 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all",
                      ready
                        ? "bg-emerald-500"
                        : pct >= 50
                          ? "bg-blue-500"
                          : "bg-amber-500",
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="text-xs tabular-nums">
                  <span className="font-semibold">{group.picked.toLocaleString("es-MX")}</span>
                  <span className="text-muted-foreground">/{group.needed.toLocaleString("es-MX")}</span>
                </div>
                {remaining > 0 && (
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40">
                    {remaining.toLocaleString("es-MX")} faltan
                  </Badge>
                )}
                {ready && (
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 gap-1">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    Listo
                  </Badge>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Sub-slot tiles for this order */}
      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {group.slots.map(({ slot, contents, total }) => (
          <button
            key={slot.id}
            type="button"
            onClick={() => onSlotClick(slot.id)}
            className="rounded-lg border bg-background p-3 text-left transition active:scale-[0.98] space-y-1.5 hover:bg-muted/30 min-h-[96px]"
          >
            <div className="flex items-baseline justify-between">
              <span className="font-mono font-bold text-sm">{slot.code}</span>
              <span className="text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {total}
              </span>
            </div>
            {contents.slice(0, 2).map((c) => (
              <div key={c.id} className="text-[11px] truncate">
                <span className="font-mono text-primary mr-1">
                  {c.products?.clave ?? "—"}
                </span>
                <span className="text-muted-foreground">
                  {c.products?.name ?? c.description ?? ""}
                </span>
                {c.lote && (
                  <span className="text-[10px] text-muted-foreground/80 font-mono ml-1">
                    · {c.lote}
                  </span>
                )}
              </div>
            ))}
            {contents.length > 2 && (
              <div className="text-[10px] italic text-muted-foreground">
                +{contents.length - 2} más
              </div>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

/** Legend explaining the color / border code of the tiles. Static, no
 *  data dependency, so safe to render during load too. */
function MapLegend({
  occupied, total,
}: {
  occupied: number;
  total: number;
}) {
  const items: Array<{ label: string; className: string; content?: React.ReactNode }> = [
    // Was "Disponible" — confusingly read as "free space available." The
    // green tile actually marks slots IN USE (with content). Renamed
    // to avoid the misread.
    { label: "En uso", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40", content: <span className="font-bold text-xs">42</span> },
    { label: "Vacía", className: "bg-gray-100 dark:bg-gray-800/60 text-gray-400 border-gray-200 dark:border-gray-700", content: <span className="opacity-40 text-sm">·</span> },
    { label: "Bloqueada", className: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/50", content: <Lock className="h-3.5 w-3.5" /> },
    { label: "Daño", className: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/50", content: <PackageX className="h-3.5 w-3.5" /> },
    { label: "Patines (sin apilador)", className: "bg-gray-100 dark:bg-gray-800/60 text-gray-500 border-amber-500/60 border-2", content: <span className="opacity-60 text-[10px]">≡</span> },
    { label: "Manual (accesorios)", className: "bg-gray-100 dark:bg-gray-800/60 text-gray-500 border-purple-500/60 border-2", content: <span className="opacity-60 text-[10px]">≡</span> },
  ];
  const pct = total > 0 ? Math.round((occupied / total) * 100) : 0;
  // Color-code the percentage chip by how full the warehouse is.
  const pctAccent =
    pct >= 90
      ? "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/40"
      : pct >= 70
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40"
      : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40";
  return (
    <div className="rounded-xl border bg-card p-3 flex items-center gap-4 flex-wrap text-xs">
      <span className="font-semibold uppercase tracking-wide text-muted-foreground">Leyenda</span>
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-1.5">
          <div className={cn("w-7 h-7 rounded border flex items-center justify-center", it.className)}>
            {it.content}
          </div>
          <span className="text-muted-foreground">{it.label}</span>
        </div>
      ))}
      {/* Capacity utilization chip on the right — tabular nums + colored
          by fullness threshold (emerald < 70 %, amber 70-89 %, red ≥ 90 %). */}
      <div
        className={cn(
          "ml-auto flex items-center gap-2 rounded-md border px-2.5 py-1",
          pctAccent,
        )}
        title="Capacidad ocupada del almacén"
      >
        <span className="font-bold tabular-nums">
          {occupied.toLocaleString("es-MX")}/{total.toLocaleString("es-MX")}
        </span>
        <span className="opacity-70">en uso</span>
        <span className="opacity-30">·</span>
        <span className="font-bold tabular-nums">{pct}%</span>
      </div>
    </div>
  );
}

/* ── Stat card ── */
/** Filter-result stats block. Sits between the search bar and the
 *  MapLegend. Empty/active states share the same outer height so toggling
 *  search never shifts the map / legend / data below.
 *
 *  Each tile follows the project brand pattern (icon chip on the left,
 *  tabular value on the right). Distance-to-Embarque + expiration logic
 *  is computed in the parent (`filterStats` memo) so this component is
 *  presentation-only. */
function FilterStatsBlock({
  active, stats, searchTerm,
}: {
  active: boolean;
  stats: ReturnType<typeof computeNothing> | null;
  searchTerm: string;
}) {
  // Day-count for the "Caduca en N d" label
  const today = new Date();
  const daysUntil = (iso: string | null): number | null => {
    if (!iso) return null;
    try {
      const d = new Date(iso);
      const ms = d.getTime() - today.getTime();
      return Math.floor(ms / (1000 * 60 * 60 * 24));
    } catch { return null; }
  };
  const daysSince = (iso: string | null | undefined): number | null => {
    if (!iso) return null;
    try {
      const d = new Date(iso);
      const ms = today.getTime() - d.getTime();
      return Math.floor(ms / (1000 * 60 * 60 * 24));
    } catch { return null; }
  };
  const fmtDays = (n: number | null): string => {
    if (n == null) return "—";
    if (n < 0) return `vencido hace ${Math.abs(n)} d`;
    if (n < 30) return `${n} días`;
    if (n < 365) return `${Math.round(n / 30)} meses`;
    return `${Math.round(n / 365)} años`;
  };
  const expiryAccent = (n: number | null): "red" | "amber" | "emerald" => {
    if (n == null) return "amber";
    if (n < 30)  return "red";
    if (n < 90)  return "amber";
    return "emerald";
  };

  // Outer wrapper has a FIXED height locked to the populated state so
  // the map / legend / data below NEVER shifts when the search toggles.
  // 6 stat tiles + h-full inside the grid all stretch to fill that
  // height; the disclaimer also fills it. Adjust this one constant if
  // we ever need to change the band's height.
  const STATS_HEIGHT = 96;

  if (!active || !stats) {
    return (
      <div
        className="rounded-xl border border-dashed border-border bg-card/40 px-5 flex items-center justify-center gap-3 text-sm text-muted-foreground italic"
        style={{ height: STATS_HEIGHT }}
      >
        <Search className="h-4 w-4 opacity-60" />
        <span>Busca un producto, SKU, lote o posición para ver estadísticas del filtro.</span>
      </div>
    );
  }

  const expiryDays = daysUntil(stats.earliestExpiry);
  const oldestDays = daysSince((stats.oldestLote as any)?.last_updated_at ?? null);

  return (
    <div
      className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3"
      style={{ height: STATS_HEIGHT }}
    >
      <Stat
        icon={<Package className="h-5 w-5" />}
        label="Bultos totales"
        value={stats.totalBultos.toLocaleString("es-MX")}
        accent="emerald"
        size="numeric"
      />
      <Stat
        icon={<MapPin className="h-5 w-5" />}
        label={stats.totalPositions === 1 ? "Posición" : "Posiciones"}
        value={stats.totalPositions.toString()}
        accent="blue"
        size="numeric"
      />
      <Stat
        icon={<Layers className="h-5 w-5" />}
        label={stats.totalLotes === 1 ? "Lote" : "Lotes"}
        value={stats.totalLotes.toString()}
        accent="purple"
        size="numeric"
      />
      <Stat
        icon={<Truck className="h-5 w-5" />}
        label="Cerca de Embarque"
        value={stats.closestSlot?.code ?? "—"}
        accent="amber"
        size="string"
      />
      <Stat
        icon={<CalendarClock className="h-5 w-5" />}
        label={
          stats.earliestExpiry
            ? `Próxima caducidad · ${fmtDays(expiryDays)}`
            : "Sin caducidad registrada"
        }
        value={stats.earliestExpiry ? fmtShortDate(stats.earliestExpiry) : "—"}
        accent={expiryAccent(expiryDays)}
        size="string"
      />
      <Stat
        icon={<History className="h-5 w-5" />}
        label={
          stats.oldestLote
            ? `Lote más viejo · ${oldestDays != null ? fmtDays(oldestDays) : "?"}`
            : "Sin lotes etiquetados"
        }
        value={stats.oldestLote?.lote ? stats.oldestLote.lote : "—"}
        accent="purple"
        size="string"
      />
    </div>
  );
}

// Helper that lets the FilterStatsBlock prop type stay readable
// without us needing to export the parent's memo return type.
function computeNothing() {
  return {} as {
    totalBultos: number;
    totalPositions: number;
    totalLotes: number;
    closestSlot: Slot | null;
    earliestExpiry: string | null;
    oldestLote: SlotContent | null;
  };
}

const fmtShortDate = (iso: string | null): string => {
  if (!iso) return "—";
  try {
    const raw = format(parseLocalDate(iso), "dd MMM yy", { locale: es });
    // date-fns' es locale returns the month lowercase ("01 jul 27").
    // Capitalize the first letter of the month abbreviation.
    return raw.replace(/ ([a-záéíóúñ])/, (_, c: string) => " " + c.toUpperCase());
  } catch { return iso; }
};

/** KPI tile matching the project's brand pattern: icon chip on the left
 *  (tinted bg + accent-colored icon), value on the right, label
 *  underneath. `size`: "numeric" (big text-2xl tabular-nums, default)
 *  or "string" (text-base, leaves room for slot codes / dates / lote
 *  text without truncation in a 6-col layout). `accent` recolors both
 *  the icon chip and the value. */
function Stat({
  icon, label, value, loading, accent = "blue", size = "numeric",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  loading?: boolean;
  accent?: "blue" | "emerald" | "amber" | "purple" | "red" | "gray";
  size?: "numeric" | "string";
}) {
  const styles = {
    blue:    { bg: "bg-blue-500/10",    text: "text-blue-500",    val: "text-foreground" },
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-500", val: "text-emerald-600 dark:text-emerald-400" },
    amber:   { bg: "bg-amber-500/10",   text: "text-amber-500",   val: "text-foreground" },
    purple:  { bg: "bg-purple-500/10",  text: "text-purple-500",  val: "text-foreground" },
    red:     { bg: "bg-red-500/10",     text: "text-red-500",     val: "text-foreground" },
    gray:    { bg: "bg-muted/50",       text: "text-muted-foreground", val: "text-foreground" },
  }[accent];
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3 hover:bg-card/80 transition-colors h-full">
      <div className={cn("p-2.5 rounded-lg shrink-0", styles.bg, styles.text)}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        {loading ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <div
            className={cn(
              "font-bold leading-tight whitespace-nowrap truncate",
              size === "numeric"
                ? "text-xl md:text-2xl tabular-nums"
                // String stats: smaller so they FIT on one line, same
                // font family as numeric (no mono) to match the rest of
                // the brand. truncate falls back to a tooltip via title=
                // when the value is genuinely longer than the column.
                : "text-base md:text-lg",
              styles.val,
            )}
            title={typeof value === "string" ? value : undefined}
          >
            {value}
          </div>
        )}
        <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{label}</div>
      </div>
    </div>
  );
}

/* ── Slot drawer: shows contents + recent movements ── */
function SlotDrawer({
  slot, contents, open, onOpenChange, onMoveInit,
  onUndoMovement, onRevertMovement,
}: {
  slot: Slot | null;
  contents: SlotContent[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Called when the worker hits Mover on a lote row — the parent uses
   *  this to close the drawer and enter map-level move mode. */
  onMoveInit?: (content: SlotContent) => void;
  /** Fired when the user clicks "Deshacer" on the recent-action banner
   *  (≤30 min reubicacion / entrada / pedido). Parent owns the confirm
   *  AlertDialog + RPC. */
  onUndoMovement?: (movementId: string) => void;
  /** Fired when the user clicks "Revertir" on the same banner for an
   *  older (>30 min) compatible movement. */
  onRevertMovement?: (movementId: string) => void;
}) {
  const qc = useQueryClient();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [togglingBlock, setTogglingBlock] = useState(false);

  // Toggle the slot's `blocked` flag. Blocked slots are visually red
  // on the map and excluded from automatic placement suggestions.
  // We invalidate the map's slot query so the tile re-colors instantly.
  const toggleBlock = async () => {
    if (!slot) return;
    setTogglingBlock(true);
    try {
      const { error } = await (supabase as any)
        .from("warehouse_slots")
        .update({ blocked: !slot.blocked })
        .eq("id", slot.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["warehouse-slots"] });
      toast.success(slot.blocked ? "Posición desbloqueada" : "Posición bloqueada");
    } catch (err: any) {
      toast.error("Error: " + (err.message ?? "desconocido"));
    } finally {
      setTogglingBlock(false);
    }
  };

  const { data: movements = [], isLoading: movementsLoading } = useQuery({
    queryKey: ["slot-movements", slot?.id],
    queryFn: async () => {
      if (!slot) return [];
      // RPC returns each row enriched with `pair_slot_code` so the UI
      // can show "← desde X" / "→ hacia Y" on reubicacion rows.
      const { data, error } = await (supabase as any).rpc(
        "get_slot_movements_with_pair",
        { p_slot_id: slot.id, p_limit: 20 },
      );
      if (error) throw error;
      return (data ?? []) as Movement[];
    },
    enabled: !!slot && open,
    staleTime: 30 * 1000,
  });

  if (!slot) return null;
  const totalBultos = contents.reduce((s, c) => s + c.quantity, 0);
  const occupiedLotes = contents.length;
  const distinctSKUs = new Set(contents.map(c => c.product_id ?? c.description ?? "")).size;
  const nextExpiry = contents
    .map(c => c.expiration_date)
    .filter((d): d is string => !!d)
    .sort()[0] ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl w-[96vw] max-h-[92vh] p-0 flex flex-col gap-0">
        {/* Sticky header — slot code + status badges + edit action */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-start justify-between gap-3">
            <DialogTitle className="text-2xl flex items-center gap-3 flex-wrap">
              <span className="font-mono">{slot.code}</span>
              {slot.blocked && (
                <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30">
                  <Lock className="h-3 w-3 mr-1" /> Bloqueada
                </Badge>
              )}
              {!slot.blocked && slot.access_type === "patines" && (
                <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/40">
                  Patines · sin apilador
                </Badge>
              )}
              {!slot.blocked && slot.access_type === "manual" && (
                <Badge variant="outline" className="bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/40">
                  Manual · accesorios
                </Badge>
              )}
              {!slot.blocked && slot.access_type === "damaged" && (
                <Badge variant="outline" className="bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/40">
                  <PackageX className="h-3 w-3 mr-1" /> Bultos dañados
                </Badge>
              )}
              {slot.zone === "recibo" && (
                <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">
                  <Inbox className="h-3 w-3 mr-1" /> Zona de recibo
                </Badge>
              )}
              {slot.zone === "embarque" && (
                <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">
                  <Truck className="h-3 w-3 mr-1" /> Zona de embarque
                </Badge>
              )}
              {slot.zone === "storage" && (
                <span className="text-sm font-normal text-muted-foreground ml-1">
                  Bloque {slot.block} · Planta {slot.row_letter} · Tarima {slot.position === 1 ? "01" : "02"}
                </span>
              )}
            </DialogTitle>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant={slot.blocked ? "default" : "outline"}
                size="sm"
                onClick={toggleBlock}
                disabled={togglingBlock}
                className={cn(
                  "gap-1.5",
                  slot.blocked && "bg-red-500 hover:bg-red-600 text-white",
                )}
              >
                <Lock className="h-3.5 w-3.5" />
                {slot.blocked ? "Desbloquear" : "Bloquear"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setAdjustOpen(true)} className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" />
                Ajustar
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Recent-action banner — mirrors the side panel banner so the
            Deshacer / Revertir option is reachable from this dialog too
            (the side panel only renders on hover, which doesn't work on
            touch). Shown when the slot's most recent kardex row is a
            reubicacion / entrada / pedido. */}
        {(() => {
          const latest = movements[0];
          if (!latest) return null;
          const reasonOk = latest.reason === "reubicacion" || latest.reason === "entrada" || latest.reason === "pedido";
          if (!reasonOk) return null;
          if (!onUndoMovement && !onRevertMovement) return null;
          const ageMin = (Date.now() - new Date(latest.created_at).getTime()) / 60000;
          const canUndo = ageMin <= 30;
          if (!canUndo && !onRevertMovement) return null;
          return (
            <div className={cn(
              "px-6 py-2.5 border-b flex items-center justify-between gap-3 shrink-0",
              canUndo ? "bg-amber-500/10 border-amber-500/30" : "bg-muted/30",
            )}>
              <div className="flex items-center gap-2 min-w-0">
                {canUndo
                  ? <Undo2 className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  : <RotateCcw className="h-4 w-4 shrink-0" />}
                <div className="min-w-0 text-xs">
                  <span className="font-semibold">
                    {canUndo ? "Acción reciente" : "Movimiento previo"}
                  </span>
                  <span className="text-muted-foreground"> · </span>
                  <span>
                    {latest.delta > 0 ? "+" : ""}{latest.delta} bultos · {REASON_LABELS[latest.reason] ?? latest.reason}
                  </span>
                  {latest.pair_slot_code && (
                    <>
                      <span className="text-muted-foreground"> · </span>
                      <span className="font-mono">
                        {latest.delta < 0 ? `→ ${latest.pair_slot_code}` : `← ${latest.pair_slot_code}`}
                      </span>
                    </>
                  )}
                </div>
              </div>
              {canUndo && onUndoMovement ? (
                <Button
                  size="sm"
                  onClick={() => onUndoMovement(latest.id)}
                  className="h-7 gap-1 text-xs shrink-0 bg-amber-500 hover:bg-amber-600 text-white"
                >
                  <Undo2 className="h-3 w-3" />
                  Deshacer
                </Button>
              ) : onRevertMovement ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRevertMovement(latest.id)}
                  className="h-7 gap-1 text-xs shrink-0"
                >
                  <RotateCcw className="h-3 w-3" />
                  Revertir
                </Button>
              ) : null}
            </div>
          );
        })()}

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiTile label="Bultos" value={totalBultos.toLocaleString("es-MX")} accent="emerald" />
            <KpiTile label="Lotes" value={occupiedLotes} />
            <KpiTile label="SKUs" value={distinctSKUs} />
            <KpiTile label="Próx. caducidad" value={nextExpiry ? fmtDate(nextExpiry) : "—"} accent={nextExpiry ? "amber" : undefined} />
          </div>

          {/* Contents */}
          <section className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-baseline justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Contenido
              </h3>
              <span className="text-xs text-muted-foreground">
                {contents.length} {contents.length === 1 ? "lote" : "lotes"}
              </span>
            </div>
            {contents.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">
                <Package className="h-10 w-10 mx-auto opacity-30 mb-2" />
                Posición vacía
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 px-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b">
                      <th className="text-left py-2 pr-2 w-14"></th>
                      <th className="text-left py-2 pr-3">SKU</th>
                      <th className="text-left py-2 pr-3">Producto</th>
                      <th className="text-left py-2 pr-3">Lote</th>
                      <th className="text-left py-2 pr-3">Caducidad</th>
                      <th className="text-left py-2 pr-3">Código de barras</th>
                      <th className="text-right py-2 pr-3">Bultos</th>
                      <th className="text-right py-2 w-[88px]"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {contents.map(c => (
                      <tr key={c.id} className="hover:bg-muted/20">
                        <td className="py-3 pr-3">
                          <ProductThumb src={c.products?.image_url ?? null} size="md" />
                        </td>
                        <td className="py-3 pr-3 font-mono text-xs text-primary whitespace-nowrap">
                          {c.products?.clave ?? "—"}
                        </td>
                        <td className="py-3 pr-3 min-w-[220px]">
                          <div className="font-medium text-sm leading-tight">
                            {c.products?.name ?? c.description ?? "—"}
                          </div>
                          {/* When there's no product match (SOBRE / accesorios)
                              show a small label so it's clear why the SKU is missing */}
                          {!c.products && c.description && (
                            <div className="text-[10px] text-muted-foreground italic mt-0.5">
                              No vinculado al catálogo
                            </div>
                          )}
                        </td>
                        <td className="py-3 pr-3 font-mono text-xs whitespace-nowrap">
                          {c.lote ?? "—"}
                        </td>
                        <td className="py-3 pr-3 text-xs whitespace-nowrap">
                          {fmtDate(c.expiration_date)}
                        </td>
                        <td className="py-3 pr-3 font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                          {c.barcode ?? "—"}
                        </td>
                        <td className="py-3 pr-3 text-right font-bold tabular-nums">
                          {c.quantity}
                        </td>
                        <td className="py-3 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onMoveInit?.(c)}
                            className="h-7 gap-1 text-[11px] px-2"
                            title="Mover bultos a otra posición"
                          >
                            <MoveRight className="h-3 w-3" />
                            Mover
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Movements (Kardex). Section card is ALWAYS rendered with the
              same outer dimensions so the dialog doesn't resize when the
              fetch finishes. During load we show skeleton rows at the
              same height as the final rows. */}
          <section className="rounded-lg border bg-card p-4 space-y-3 min-h-[260px]">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Movimientos · Kardex
              </h3>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {movementsLoading ? (
                  <Skeleton className="h-3 w-16 inline-block align-middle" />
                ) : (
                  <span>últimos {movements.length}</span>
                )}
                <Link
                  to={`/kardex?slot=${slot.id}`}
                  className="text-primary hover:underline whitespace-nowrap"
                >
                  Ver historial completo →
                </Link>
              </div>
            </div>
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b">
                    <th className="text-left py-2 pr-3 whitespace-nowrap">Fecha</th>
                    <th className="text-left py-2 pr-3">Razón</th>
                    <th className="text-left py-2 pr-3">Origen / Destino</th>
                    <th className="text-left py-2 pr-3">SKU</th>
                    <th className="text-left py-2 pr-3">Producto</th>
                    <th className="text-left py-2 pr-3">Lote</th>
                    <th className="text-right py-2 pr-3">Delta</th>
                    <th className="text-left py-2">Nota</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {movementsLoading
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <tr key={`sk-${i}`}>
                          <td className="py-2 pr-3"><Skeleton className="h-4 w-20" /></td>
                          <td className="py-2 pr-3"><Skeleton className="h-4 w-14" /></td>
                          <td className="py-2 pr-3"><Skeleton className="h-4 w-24" /></td>
                          <td className="py-2 pr-3"><Skeleton className="h-4 w-16" /></td>
                          <td className="py-2 pr-3"><Skeleton className="h-4 w-40" /></td>
                          <td className="py-2 pr-3"><Skeleton className="h-4 w-20" /></td>
                          <td className="py-2 pr-3 text-right"><Skeleton className="h-4 w-10 ml-auto" /></td>
                          <td className="py-2"><Skeleton className="h-4 w-24" /></td>
                        </tr>
                      ))
                    : movements.length === 0
                    ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-sm text-muted-foreground italic">
                          Sin movimientos registrados
                        </td>
                      </tr>
                    )
                    : movements.map(m => {
                        const isIn = m.delta > 0;
                        return (
                          <tr key={m.id} className="hover:bg-muted/20">
                            <td className="py-2 pr-3 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                              {format(new Date(m.created_at), "dd MMM HH:mm", { locale: es })}
                            </td>
                            <td className="py-2 pr-3">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] font-semibold whitespace-nowrap",
                                  REASON_BADGE_CLASS[m.reason] ?? "",
                                )}
                              >
                                {REASON_LABELS[m.reason] ?? m.reason}
                              </Badge>
                            </td>
                            <td className="py-2 pr-3 text-xs whitespace-nowrap">
                              {m.reason === "reubicacion" && m.pair_slot_code ? (
                                <span className="inline-flex items-center gap-1">
                                  {isIn ? (
                                    <>
                                      <span className="text-muted-foreground">←</span>
                                      <span className="text-muted-foreground">desde</span>
                                      <span className="font-mono font-semibold">{m.pair_slot_code}</span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="text-muted-foreground">→</span>
                                      <span className="text-muted-foreground">hacia</span>
                                      <span className="font-mono font-semibold">{m.pair_slot_code}</span>
                                    </>
                                  )}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/40">—</span>
                              )}
                            </td>
                            <td className="py-2 pr-3 font-mono text-xs text-primary whitespace-nowrap">
                              {m.products?.clave ?? "—"}
                            </td>
                            <td className="py-2 pr-3 truncate max-w-[240px]">
                              {m.products?.name ?? m.description ?? "—"}
                            </td>
                            <td className="py-2 pr-3 font-mono text-xs whitespace-nowrap">
                              {m.lote ?? "—"}
                            </td>
                            <td className={cn(
                              "py-2 pr-3 text-right font-bold tabular-nums whitespace-nowrap",
                              isIn ? "text-emerald-600" : "text-red-600",
                            )}>
                              {isIn ? "+" : ""}{m.delta}
                            </td>
                            <td className="py-2 text-xs text-muted-foreground truncate max-w-[200px]">
                              {m.note ?? ""}
                            </td>
                          </tr>
                        );
                      })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </DialogContent>

      {/* Adjust dialog — add/edit/remove contents for this slot.
          Quantity changes auto-write Kardex entries (reason='ajuste')
          via the slot_contents_audit trigger. */}
      <AdjustSlotDialog
        slot={slot}
        contents={contents}
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
      />
    </Dialog>
  );
}

/* ── AdjustSlotDialog ─────────────────────────────────────────────
 *
 * CRUD for slot_contents at a single slot. Lets the warehouse admin:
 *   • bump quantity up/down on an existing row
 *   • change the lote / barcode / expiration
 *   • remove a row (Kardex trigger logs the −quantity)
 *   • add a new row (pick product + lote + qty)
 *
 * The slot_contents_audit trigger writes a `reason='ajuste'` Kardex
 * row automatically for every INSERT / UPDATE / DELETE, so nothing
 * here has to manually manage movement entries.
 */
interface AdjustRow {
  id?: string;          // existing row id, or undefined for new
  product_id: string | null;
  product_clave?: string | null;
  product_name?: string | null;
  product_image_url?: string | null;
  description: string;
  lote: string;
  barcode: string;
  quantity: number;
  expiration_date: string;
  _deleted?: boolean;
}

function AdjustSlotDialog({
  slot, contents, open, onOpenChange,
}: {
  slot: Slot | null;
  contents: SlotContent[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<AdjustRow[]>([]);
  const [saving, setSaving] = useState(false);

  // Load product catalog for the "add new row" picker
  const { data: products = [] } = useQuery({
    queryKey: ["products-for-adjust"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, clave, name, image_url, barcode")
        .eq("active", true)
        .order("clave");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; clave: string; name: string; image_url: string | null; barcode: string | null }>;
    },
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  // Hydrate from contents whenever the dialog opens
  useEffect(() => {
    if (!open) return;
    setRows(contents.map(c => ({
      id: c.id,
      product_id: c.product_id,
      product_clave: c.products?.clave ?? null,
      product_name: c.products?.name ?? null,
      product_image_url: c.products?.image_url ?? null,
      description: c.description ?? c.products?.name ?? "",
      lote: c.lote ?? "",
      barcode: c.barcode ?? "",
      quantity: c.quantity,
      expiration_date: c.expiration_date ?? "",
    })));
  }, [open, contents]);

  const addRow = () => {
    setRows(r => [...r, {
      product_id: null, description: "", lote: "", barcode: "", quantity: 0, expiration_date: "",
    }]);
  };

  const updateRow = (idx: number, patch: Partial<AdjustRow>) => {
    setRows(r => r.map((row, i) => i === idx ? { ...row, ...patch } : row));
  };

  const removeRow = (idx: number) => {
    setRows(r => r.map((row, i) => i === idx ? { ...row, _deleted: true } : row));
  };

  const pickProduct = (idx: number, productId: string) => {
    const p = products.find(p => p.id === productId);
    if (!p) return;
    updateRow(idx, {
      product_id: p.id,
      product_clave: p.clave,
      product_name: p.name,
      product_image_url: p.image_url,
      description: p.name,
      barcode: p.barcode ?? "",
    });
  };

  const save = async () => {
    if (!slot) return;
    setSaving(true);
    try {
      // Deletes first
      const toDelete = rows.filter(r => r._deleted && r.id);
      if (toDelete.length > 0) {
        const { error } = await (supabase as any)
          .from("slot_contents")
          .delete()
          .in("id", toDelete.map(r => r.id));
        if (error) throw error;
      }
      // Updates (existing + not deleted)
      for (const row of rows.filter(r => !r._deleted && r.id)) {
        const { error } = await (supabase as any)
          .from("slot_contents")
          .update({
            product_id: row.product_id,
            description: row.product_id ? null : (row.description || null),
            lote: row.lote || null,
            barcode: row.barcode || null,
            quantity: Math.max(0, Math.floor(row.quantity)),
            expiration_date: row.expiration_date || null,
            last_updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        if (error) throw error;
      }
      // Inserts (no id, not deleted, qty > 0)
      const toInsert = rows.filter(r => !r.id && !r._deleted && r.quantity > 0);
      if (toInsert.length > 0) {
        const { error } = await (supabase as any)
          .from("slot_contents")
          .insert(toInsert.map(r => ({
            slot_id: slot.id,
            product_id: r.product_id,
            description: r.product_id ? null : (r.description || null),
            lote: r.lote || null,
            barcode: r.barcode || null,
            quantity: Math.max(0, Math.floor(r.quantity)),
            expiration_date: r.expiration_date || null,
          })));
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ["warehouse-contents"] });
      qc.invalidateQueries({ queryKey: ["slot-movements", slot.id] });
      toast.success("Posición actualizada");
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Error al guardar: " + (err.message ?? "desconocido"));
    } finally {
      setSaving(false);
    }
  };

  if (!slot) return null;
  const visibleRows = rows.filter(r => !r._deleted);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl w-[96vw] max-h-[92vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="text-xl flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            Ajustar posición <span className="font-mono">{slot.code}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {visibleRows.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              Sin contenido. Agrega un producto abajo.
            </div>
          ) : (
            <div className="space-y-3">
              {visibleRows.map((row) => {
                // Find original index in rows (since visibleRows hides deleted)
                const idx = rows.indexOf(row);
                return (
                  <div key={row.id ?? `new-${idx}`} className="rounded-lg border bg-card p-3 space-y-3">
                    {/* Top row: product picker + thumbnail + remove */}
                    <div className="flex items-start gap-3">
                      <ProductThumb src={row.product_image_url ?? null} size="md" />
                      <div className="flex-1 min-w-0 space-y-1">
                        {row.id && row.product_id ? (
                          // Existing row tied to a product — show read-only
                          <>
                            <div className="font-mono text-xs text-primary">{row.product_clave}</div>
                            <div className="font-medium text-sm">{row.product_name}</div>
                          </>
                        ) : (
                          <Select
                            value={row.product_id ?? "__none__"}
                            onValueChange={(v) => v === "__none__" ? updateRow(idx, { product_id: null }) : pickProduct(idx, v)}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Seleccionar producto..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— Sin producto (accesorio, etc.) —</SelectItem>
                              {products.map(p => (
                                <SelectItem key={p.id} value={p.id}>
                                  <span className="font-mono text-xs mr-2">{p.clave}</span>
                                  {p.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {!row.product_id && (
                          <Input
                            placeholder="Descripción (para items sin SKU)"
                            value={row.description}
                            onChange={e => updateRow(idx, { description: e.target.value })}
                            className="h-8 text-sm"
                          />
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRow(idx)}
                        className="h-8 w-8 text-red-500 hover:text-red-600 shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Bottom row: qty / lote / barcode / expiration */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Cantidad</label>
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={row.quantity}
                          onChange={e => updateRow(idx, { quantity: Number(e.target.value) || 0 })}
                          className="h-9 text-sm tabular-nums"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Lote</label>
                        <Input
                          value={row.lote}
                          onChange={e => updateRow(idx, { lote: e.target.value })}
                          className="h-9 text-sm font-mono"
                          placeholder="F2014616V1"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Cód. barras</label>
                        <Input
                          value={row.barcode}
                          onChange={e => updateRow(idx, { barcode: e.target.value })}
                          className="h-9 text-sm font-mono"
                          placeholder="7502..."
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Caducidad</label>
                        <Input
                          type="date"
                          value={row.expiration_date}
                          onChange={e => updateRow(idx, { expiration_date: e.target.value })}
                          className="h-9 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Button variant="outline" onClick={addRow} className="w-full gap-1.5">
            <Plus className="h-4 w-4" />
            Agregar producto a la posición
          </Button>
        </div>

        <DialogFooter className="px-6 py-3 border-t shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving} className="min-w-[140px]">
            {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Guardando...</> : "Guardar cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── KPI tile (compact, used in dialog header) ── */
function KpiTile({ label, value, accent }: { label: string; value: string | number; accent?: "emerald" | "amber" }) {
  const accentClass =
    accent === "emerald" ? "text-emerald-600 dark:text-emerald-400"
    : accent === "amber" ? "text-amber-600 dark:text-amber-400"
    : "text-foreground";
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</div>
      <div className={cn("text-xl font-bold tabular-nums mt-0.5", accentClass)}>{value}</div>
    </div>
  );
}
