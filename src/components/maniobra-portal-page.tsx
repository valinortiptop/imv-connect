// @ts-nocheck
/**
 * ManiobraPortal — public portal at /portalmaniobra.
 *
 * Two views in one component:
 *   - List view (default): every product to load/unload today, grouped by
 *     descarga / traspalear / carga. Each line shows live count.
 *   - Detail view: tap a product → opens a focused single-product counter.
 *
 * Role hierarchy (4 tiers):
 *   Cargador  (no PIN, default)        → view only, no buttons
 *   Contador  (shared PIN + free-text name) → tap +/- to count
 *   Manager   (cargador_mgr / warehouse_mgr) → +/-, override, mark Listo,
 *             day nav (Navas: 7d forward; Bautista: full timeline)
 *
 * The counter aggregates by product within each section so the team
 * counts product-by-product rather than order-by-order.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Truck, Warehouse, ArrowRight, Package, AlertTriangle,
  ArrowDownToLine, Plus, Minus, Check, KeyRound,
  ChevronLeft, ChevronRight, Edit3, Sun, Moon, ArrowLeft,
  User, UserCheck, X, Activity, Users, TrendingUp, Clock, AlertCircle, Shield, Trophy,
} from "lucide-react";
import { format, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { ManiobraGateScreen } from "@/components/maniobra/ManiobraGateScreen";

/* ── Types ── */

interface PortalItem {
  id: string;
  product_id: string;
  quantity: number;
  clave: string;
  name: string;
  image_url: string | null;
}

interface PortalOrder {
  id: string;
  order_code: string;
  status: string;
  client_name: string;
  notes: string | null;
  items: PortalItem[];
}

interface PortalDelivery {
  id: string;
  delivery_code: string;
  notes: string | null;
  items: PortalItem[];
}

interface PortalTruck {
  id: string;
  label: string;
  capacity_bultos?: number;
  items?: Array<{ order_id?: string; product_id?: string; quantity?: number; clave?: string; name?: string; image_url?: string | null }>;
  order_ids?: string[];
}

interface PortalPlan {
  trucks: PortalTruck[];
  pickup_order_ids: string[];
  /** When counting started for the day. NULL until the manager taps
   *  "Iniciar conteo" or the first count event auto-stamps it via
   *  the maniobra_auto_start_day_trg trigger. Drives stale-banner
   *  suppression + the "Tiempo de jornada" KPI. */
  started_at?: string | null;
}
interface CountRecord { count: number; target: number; completed: boolean; completed_at: string | null; last_actor: string | null }

interface PortalData {
  date: string;
  orders: PortalOrder[];
  deliveries: PortalDelivery[];
  plan: PortalPlan;
  counts: Record<string, CountRecord>;
}

type Role = "cargador" | "contador" | "cargador_mgr" | "warehouse_mgr";
interface Session {
  role: Exclude<Role, "cargador">;
  display_name: string;
  unlocked_at: number;
}

/* ── Storage helpers ── */
const SESSION_KEY = "maniobra-portal-session-v2";
const THEME_KEY   = "maniobra-portal-theme-v1";
const SESSION_MAX_MS = 4 * 60 * 60 * 1000; // 4h auto-lock

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed: Session = JSON.parse(raw);
    if (Date.now() - parsed.unlocked_at > SESSION_MAX_MS) { localStorage.removeItem(SESSION_KEY); return null; }
    return parsed;
  } catch { return null; }
}
function saveSession(s: Session) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
function clearSession() { localStorage.removeItem(SESSION_KEY); }

// Light by default. Drop the system option entirely — every tap is a clean
// flip between light and dark.
function loadTheme(): "light" | "dark" {
  try { return (localStorage.getItem(THEME_KEY) as any) === "dark" ? "dark" : "light"; } catch { return "light"; }
}

function todayInCDMX(): { date: Date; ymd: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" });
  const ymd = fmt.format(new Date());
  const [y, m, d] = ymd.split("-").map(Number);
  return { date: new Date(y, (m ?? 1) - 1, d ?? 1), ymd };
}
function dateToYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtBultos(n: number) { return n.toLocaleString("es-MX"); }

function canNavigate(role: Role, to: Date): boolean {
  // Navigation window per role.
  //   - warehouse_mgr (Bautista) → unrestricted, full timeline.
  //   - cargador / contador      → today through today+7 so they can
  //     see tomorrow's truck loads (maniobra plans are keyed by
  //     delivery date; Tuesday's loading work belongs to Wednesday's
  //     plan).
  //   - cargador_mgr (Navas)     → TODAY ONLY. He's an external crew
  //     and shouldn't see future work he isn't booked for. The wider
  //     window of cargadores/contadores doesn't apply to him because
  //     he's not internal staff prepping ahead.
  const today = todayInCDMX().date.getTime();
  const target = to.getTime();
  if (role === "warehouse_mgr") return true;
  if (role === "cargador_mgr")  return target === today;
  return target >= today && target <= today + 7 * 86400000;
}

/* ── Aggregation: one count line per (section × product) ── */

interface CountableLine {
  /** Stable key used as primary key in maniobra_counts. */
  line_key: string;
  product_id: string;
  clave: string;
  name: string;
  image_url: string | null;
  target: number;
  /** Where this line sits in the day's plan, for grouping in the list. */
  section: { kind: "descarga"; delivery_id: string; delivery_code: string; destination: "warehouse" | string }
         | { kind: "carga";    truck_id: string;     truck_label: string };
  /** Optional human breakdown for the subtitle (only set when multi-order/multi-entry). */
  subtitle: string;
}

function aggregateLines(data: PortalData): CountableLine[] {
  const lines: CountableLine[] = [];
  const orderMap = new Map(data.orders.map(o => [o.id, o]));

  // ---- Build outgoing-needs map for cross-dock matching ----
  type Need = { truck_label: string; quantity: number };
  const truckTotalsByProduct = new Map<string, Need[]>();
  // Aggregate truck items by product first (this is also what defines carga lines).
  type CargaAgg = { truck_id: string; truck_label: string; product_id: string; clave: string; name: string; image_url: string | null; target: number; pieces: Array<{ order_code: string; client_name: string; quantity: number }> };
  const cargaByKey = new Map<string, CargaAgg>();

  for (const t of data.plan.trucks ?? []) {
    const itemsRaw: Array<{ order_id?: string; product_id?: string; quantity?: number; clave?: string; name?: string; image_url?: string | null }> = [];
    if (Array.isArray(t.items)) itemsRaw.push(...t.items);
    else if (Array.isArray(t.order_ids)) {
      for (const oid of t.order_ids) {
        const o = orderMap.get(oid);
        if (!o) continue;
        for (const p of o.items) itemsRaw.push({ order_id: oid, product_id: p.product_id, quantity: p.quantity, clave: p.clave, name: p.name, image_url: p.image_url });
      }
    }
    for (const it of itemsRaw) {
      const o = it.order_id ? orderMap.get(it.order_id) : undefined;
      const orderItem = o?.items.find((p) => p.product_id === it.product_id);
      const qty = it.quantity ?? orderItem?.quantity ?? 0;
      if (qty <= 0 || !it.product_id) continue;
      const key = `carga:${t.id}:${it.product_id}`;
      const cur = cargaByKey.get(key) ?? {
        truck_id: t.id, truck_label: t.label, product_id: it.product_id,
        clave: it.clave ?? orderItem?.clave ?? "",
        name:  it.name  ?? orderItem?.name  ?? "",
        image_url: it.image_url ?? orderItem?.image_url ?? null,
        target: 0, pieces: [],
      };
      cur.target += qty;
      cur.pieces.push({ order_code: o?.order_code ?? "", client_name: o?.client_name ?? "", quantity: qty });
      cargaByKey.set(key, cur);
    }
  }

  for (const carga of cargaByKey.values()) {
    const arr = truckTotalsByProduct.get(carga.product_id) ?? [];
    arr.push({ truck_label: carga.truck_label, quantity: carga.target });
    truckTotalsByProduct.set(carga.product_id, arr);
  }

  // ---- Descarga: per-delivery, per-product, split between warehouse / cross-dock ----
  for (const del of data.deliveries) {
    // First aggregate entries by product within this delivery.
    const aggByProduct = new Map<string, { product_id: string; clave: string; name: string; image_url: string | null; quantity: number }>();
    for (const e of del.items) {
      const cur = aggByProduct.get(e.product_id) ?? { product_id: e.product_id, clave: e.clave, name: e.name, image_url: e.image_url, quantity: 0 };
      cur.quantity += e.quantity;
      aggByProduct.set(e.product_id, cur);
    }
    for (const a of aggByProduct.values()) {
      let remaining = a.quantity;
      const needs = (truckTotalsByProduct.get(a.product_id) ?? []).slice(); // copy so we can drain
      for (const need of needs) {
        if (remaining <= 0) break;
        const crossDock = Math.min(remaining, need.quantity);
        if (crossDock <= 0) continue;
        lines.push({
          line_key: `descarga:${del.id}:${a.product_id}:${need.truck_label}`,
          product_id: a.product_id, clave: a.clave, name: a.name, image_url: a.image_url,
          target: crossDock,
          section: { kind: "descarga", delivery_id: del.id, delivery_code: del.delivery_code, destination: need.truck_label },
          subtitle: "",
        });
        remaining -= crossDock;
        need.quantity -= crossDock;
      }
      if (remaining > 0) {
        lines.push({
          line_key: `descarga:${del.id}:${a.product_id}:warehouse`,
          product_id: a.product_id, clave: a.clave, name: a.name, image_url: a.image_url,
          target: remaining,
          section: { kind: "descarga", delivery_id: del.id, delivery_code: del.delivery_code, destination: "warehouse" },
          subtitle: "",
        });
      }
    }
  }

  // ---- Carga lines: aggregated by (truck × product) ----
  for (const c of cargaByKey.values()) {
    const subtitle = c.pieces.length > 1
      ? c.pieces.map(p => `${p.client_name} · ${p.quantity}`).join(" · ")
      : "";
    lines.push({
      line_key: `carga:${c.truck_id}:${c.product_id}`,
      product_id: c.product_id, clave: c.clave, name: c.name, image_url: c.image_url,
      target: c.target,
      section: { kind: "carga", truck_id: c.truck_id, truck_label: c.truck_label },
      subtitle,
    });
  }

  return lines;
}

/* ──────────────────────────────────────────────────────────────────────
   Main component
   ────────────────────────────────────────────────────────────────────── */

/**
 * Optional embed props — when supplied, the portal renders as a pane
 * inside the admin Maniobra page instead of as a standalone screen.
 *
 * Embedded mode:
 *  - skips the PIN gate (uses the admin's identity directly)
 *  - hides its own header / theme toggle / profile / day nav (the admin
 *    page owns those)
 *  - hides the fixed reconciliation banner
 *  - lays the section cards out as a 2-col dashboard instead of stacked
 *  - syncs to the date supplied by the parent so toggling Plan/Live
 *    keeps the same day
 */
export interface ManiobraPortalEmbedProps {
  embedded?: boolean;
  embedDate?: Date;
  embedRole?: Exclude<Role, "cargador">;
  embedActor?: string;
}

/**
 * Default export — wraps the real portal in the daily-PIN gate. Only
 * standalone visitors see the gate; admin's embedded view bypasses it
 * since the admin is already authenticated inside /maniobra.
 */
export default function ManiobraPortal(props: ManiobraPortalEmbedProps = {}) {
  const [gateUnlocked, setGateUnlocked] = useState(false);
  if (!props.embedded && !gateUnlocked) {
    return <ManiobraGateScreen onUnlock={() => setGateUnlocked(true)} />;
  }
  return <ManiobraPortalInner {...props} />;
}

function ManiobraPortalInner({
  embedded = false,
  embedDate,
  embedRole,
  embedActor,
}: ManiobraPortalEmbedProps = {}) {
  const [today, setToday] = useState(todayInCDMX);
  const [date, setDate] = useState<Date>(embedDate ?? today.date);
  const [session, setSession] = useState<Session | null>(() =>
    embedded && embedRole && embedActor
      ? { role: embedRole, display_name: embedActor, unlocked_at: Date.now() }
      : loadSession()
  );
  const role: Role = session?.role ?? "cargador";
  const dateStr = dateToYMD(date);

  // Keep internal date in sync with the parent when embedded.
  useEffect(() => {
    if (embedded && embedDate) setDate(embedDate);
  }, [embedded, embedDate]);

  // Keep synthetic session in sync if the admin's actor/role changes.
  useEffect(() => {
    if (embedded && embedRole && embedActor) {
      setSession({ role: embedRole, display_name: embedActor, unlocked_at: Date.now() });
    }
  }, [embedded, embedRole, embedActor]);

  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [overrideLine, setOverrideLine] = useState<CountableLine | null>(null);
  const [activeLineKey, setActiveLineKey] = useState<string | null>(null);
  // Firmas sheet — only available to warehouse_mgr (Rodrigo Bautista).
  // Lets him pull up the signature link for any order on the day to
  // hand the phone to the client at delivery without leaving the
  // maniobra portal. Only mounted when toggled on so the per-order
  // signature_token query doesn't run for cargadores.
  const [firmasOpen, setFirmasOpen] = useState(false);
  const [firmasTokens, setFirmasTokens] = useState<Record<string, string | null>>({});

  // Section filter driven by the breakdown cards (Descarga / Traspaleo /
  // Carga). null = show all sections. Click a card to focus the list
  // below to just that section; click the same card again to clear.
  type SectionFilter = "descarga" | "traspalear" | "carga" | null;
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>(null);
  const toggleSectionFilter = (k: NonNullable<SectionFilter>) =>
    setSectionFilter((prev) => (prev === k ? null : k));

  // Manager line-history state — lifted to the parent so it survives any
  // re-render of DetailView and never collapses on count taps.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyEvents, setHistoryEvents] = useState<Array<{ id: number; delta: number; action: string; actor_label: string; created_at: string }>>([]);
  const historyKeyRef = useRef<string | null>(null);

  // Initial fetch + stream new events live for the active line.
  useEffect(() => {
    const isMgr = role === "cargador_mgr" || role === "warehouse_mgr";
    if (!isMgr || !historyOpen || !activeLineKey) return;
    const key = `${dateStr}::${activeLineKey}`;
    let cancelled = false;

    // Only do an initial fetch when this is a new line (otherwise reuse
    // what we already have plus what realtime has streamed in).
    if (historyKeyRef.current !== key) {
      historyKeyRef.current = key;
      setHistoryEvents([]);
      (async () => {
        const { data: ev } = await (supabase as any).rpc("maniobra_portal_line_events", { p_date: dateStr, p_line_key: activeLineKey });
        if (!cancelled) setHistoryEvents(ev ?? []);
      })();
    }

    const ch = supabase.channel(`maniobra-portal-events-${dateStr}-${activeLineKey}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "maniobra_count_events", filter: `plan_date=eq.${dateStr}` },
        (payload: any) => {
          const r = payload.new;
          if (!r || r.line_key !== activeLineKey) return;
          setHistoryEvents(prev => {
            if (prev.some(e => e.id === r.id)) return prev;
            return [{ id: r.id, delta: r.delta, action: r.action, actor_label: r.actor_label, created_at: r.created_at }, ...prev];
          });
        },
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [historyOpen, activeLineKey, dateStr, role]);

  // Optimistic counts: lifted to the parent so the reconciliation banner
  // updates the same instant the buttons do.
  const [optimistic, setOptimistic] = useState<Record<string, number>>({});

  // Theme — synchronous, instant flip on tap.
  const [theme, setTheme] = useState<"light" | "dark">(loadTheme);
  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === "dark" ? "light" : "dark";
      if (next === "dark") document.documentElement.classList.add("dark");
      else document.documentElement.classList.remove("dark");
      localStorage.setItem(THEME_KEY, next);
      return next;
    });
  };
  // Apply on initial mount.
  useEffect(() => {
    if (theme === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps

  // Roll "today" forward at midnight CDMX without a refresh.
  useEffect(() => {
    const t = setInterval(() => {
      const next = todayInCDMX();
      setToday(prev => prev.ymd === next.ymd ? prev : next);
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  // Snap-back removed: cargadores/contadores were forced to today which
  // hid tomorrow's loading work (plans are keyed by delivery date, not
  // load date). canNavigate() above now lets them roam today..+7. We
  // still bound their target via canNavigate when they tap arrows.

  // Fetch + realtime + broadcast
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      const { data: rpcData, error } = await (supabase as any).rpc("maniobra_portal_data", { p_date: dateStr });
      if (cancelled) return;
      if (error) { setFetchError(error.message); setLoading(false); return; }
      setData(rpcData as PortalData);
      setOptimistic({});
      setFetchError(null);
      setLoading(false);
    }
    fetchData();

    // Apply a count update in place — used by both the realtime postgres
    // push and the broadcast fast-path.
    const applyCount = (line_key: string, count: number, target: number, completed: boolean, last_actor: string | null) => {
      const rec: CountRecord = {
        count, target, completed,
        completed_at: completed ? new Date().toISOString() : null,
        last_actor,
      };
      setData(prev => prev ? { ...prev, counts: { ...prev.counts, [line_key]: rec } } : prev);
      setOptimistic(o => {
        if (!(line_key in o)) return o;
        const next = { ...o }; delete next[line_key]; return next;
      });
    };

    const channel = supabase.channel(`maniobra-portal-${dateStr}`, {
      config: { broadcast: { ack: false, self: false } },
    })
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `delivery_date=eq.${dateStr}` }, fetchData)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, fetchData)
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_deliveries", filter: `delivery_date=eq.${dateStr}` }, fetchData)
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_entries" }, fetchData)
      .on("postgres_changes", { event: "*", schema: "public", table: "maniobra_plans", filter: `plan_date=eq.${dateStr}` }, fetchData)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "maniobra_counts", filter: `plan_date=eq.${dateStr}` },
        (payload: any) => {
          const r = payload.new ?? payload.old;
          if (!r || r.plan_date !== dateStr) return;
          applyCount(r.line_key, r.count, r.target, r.completed, r.last_actor);
        },
      )
      // Broadcast fast-path: when a contador taps, they ALSO fire a
      // broadcast on this channel. Listeners receive it within ~50ms, far
      // ahead of the postgres replication push. The DB write still
      // happens for persistence; this just removes the perceived lag.
      .on("broadcast", { event: "count" }, (msg: any) => {
        const p = msg.payload as {
          line_key: string; count: number; target: number; completed: boolean; actor: string;
          ev?: { delta: number; action: string; actor_label: string; created_at: string; line_key: string };
        };
        if (!p?.line_key) return;
        applyCount(p.line_key, p.count, p.target, p.completed, p.actor);
        // Managers also get a synthetic event prepended to the activity
        // feed so it appears with broadcast latency (<50ms) instead of
        // waiting on postgres replication. The real INSERT will arrive
        // later and dedupe/replace this synthetic row.
        if (p.ev && (role === "cargador_mgr" || role === "warehouse_mgr")) {
          // Each broadcast is its own event — no dedupe against other
          // synthetics. The postgres INSERT handler later replaces the
          // oldest matching synthetic (by content) with the real row,
          // which works correctly for rapid repeated taps because
          // replaced rows have a positive id and stop matching.
          const synth = { id: -(Date.now() * 1000 + Math.floor(Math.random() * 1000)), ...p.ev };
          setGlobalEvents(prev => [synth, ...prev].slice(0, 200));
        }
      })
      .subscribe();
    channelRef.current = channel;

    const interval = (role === "cargador_mgr" || role === "warehouse_mgr") ? 5_000 : 30_000;
    const t = setInterval(fetchData, interval);
    return () => { cancelled = true; supabase.removeChannel(channel); channelRef.current = null; clearInterval(t); };
  }, [dateStr, role]);

  const lines = useMemo(() => data ? aggregateLines(data) : [], [data]);
  // Map line_key -> human name so the global activity feed can label events.
  const lineNameByKey = useMemo(() => {
    const m: Record<string, string> = {};
    for (const l of lines) m[l.line_key] = l.name;
    return m;
  }, [lines]);
  // Map line_key -> product image so the activity feed can show thumbnails.
  const lineImageByKey = useMemo(() => {
    const m: Record<string, string | null> = {};
    for (const l of lines) m[l.line_key] = l.image_url;
    return m;
  }, [lines]);
  const countOf = (key: string, target: number) => {
    if (key in optimistic) return optimistic[key];
    return data?.counts[key]?.count ?? 0;
  };
  const completedOf = (key: string, target: number) => {
    const c = countOf(key, target);
    if (data?.counts[key]?.completed) return true;
    return c >= target;
  };

  const reconcile = useMemo(() => {
    // Plan note: we sum ALL line targets here (descarga + traspalear +
    // carga). That's intentional for the line-by-line counting math —
    // each section is an independent count action. But for the HEADER
    // "Plan del día" number we want UNIQUE bultos so cross-docked
    // bultos aren't shown twice.
    let plan = 0, counted = 0, sobra = 0, falta = 0;
    let descargaBultos = 0, traspaleoBultos = 0, cargaBultos = 0;
    let traspaleoCountedBultos = 0;
    const anomalies: Array<{ line: CountableLine; kind: "sobra" | "falta"; delta: number }> = [];
    for (const l of lines) {
      plan += l.target;
      const c = countOf(l.line_key, l.target);
      counted += c;
      // Bucket bultos by section kind for the header stats. Descarga
      // means warehouse-bound; traspalear means cross-dock direct to
      // truck (will reappear as a carga line for the same product →
      // that's the double-count we want to net out at display time).
      if (l.section.kind === "carga") cargaBultos += l.target;
      else if (l.section.destination === "warehouse") descargaBultos += l.target;
      else { traspaleoBultos += l.target; traspaleoCountedBultos += Math.min(c, l.target); }
      if (c > l.target) {
        sobra += c - l.target;
        anomalies.push({ line: l, kind: "sobra", delta: c - l.target });
      } else if (data?.counts[l.line_key]?.completed && c < l.target) {
        falta += l.target - c;
        anomalies.push({ line: l, kind: "falta", delta: l.target - c });
      }
    }
    // Unique physical bultos handled today =
    //   descarga (warehouse-bound) + carga (everything to outgoing
    //   trucks, which already includes the cross-docked amounts).
    // Equivalently: plan − traspaleo. Same answer, simpler explanation.
    const uniqueBultos = descargaBultos + cargaBultos;
    // "Entrada" for display = everything off the supplier truck —
    // warehouse-bound + cross-docked. Cargadores still see this raw
    // arrival number because that's what they're physically unloading.
    const entradaBultos = descargaBultos + traspaleoBultos;
    // Counted-display = subtract the traspalear count so it stays
    // comparable to uniqueBultos (otherwise mid-day numbers feel weird:
    // counted goes higher than plan as bultos get tallied twice).
    const countedDisplay = Math.max(0, counted - traspaleoCountedBultos);
    return {
      plan, counted, missing: plan - counted, sobra, falta, anomalies,
      uniqueBultos, entradaBultos, traspaleoBultos, cargaBultos,
      countedDisplay,
    };
  }, [lines, data, optimistic]);

  // ── Firmas sheet helpers (warehouse_mgr only) ──
  // When the sheet opens we fetch existing signature_token values for
  // every order in the day, so the icons can deep-link straight to
  // /entrega/<token>. Tokens are lazy-minted (same readable
  // <order_code>-<4ch> format as everywhere else) only when the user
  // taps an icon, so we don't litter the DB on every sheet open.
  // Manual "Iniciar conteo" trigger. Calls maniobra_start_day RPC
  // which is idempotent (won't overwrite an already-started day) and
  // returns the resulting started_at timestamp. We optimistically
  // refetch the portal data so the header flips from button → KPI.
  const [startingDay, setStartingDay] = useState(false);
  const handleStartDay = async () => {
    if (startingDay) return;
    setStartingDay(true);
    try {
      const { error } = await (supabase as any).rpc("maniobra_start_day", { p_date: dateStr });
      if (error) {
        console.warn("maniobra_start_day failed", error);
      }
    } finally {
      setStartingDay(false);
    }
  };

  const ALPHABET_TOKEN = "abcdefghjkmnpqrstuvwxyz23456789";
  useEffect(() => {
    if (!firmasOpen) return;
    if (role !== "warehouse_mgr") return;
    if (!data) return;
    let cancelled = false;
    (async () => {
      const ids = data.orders.map((o) => o.id);
      if (ids.length === 0) { setFirmasTokens({}); return; }
      const { data: rows, error } = await (supabase as any)
        .from("orders")
        .select("id, signature_token")
        .in("id", ids);
      if (cancelled || error) return;
      const m: Record<string, string | null> = {};
      for (const r of rows ?? []) m[r.id] = r.signature_token ?? null;
      setFirmasTokens(m);
    })();
    return () => { cancelled = true; };
  }, [firmasOpen, role, data]);

  const ensureSignatureTokenPortal = async (orderId: string, orderCode: string): Promise<string | null> => {
    const cached = firmasTokens[orderId];
    if (cached && cached.startsWith(`${orderCode}-`)) return cached;
    const random4 = Array.from({ length: 4 }, () =>
      ALPHABET_TOKEN[Math.floor(Math.random() * ALPHABET_TOKEN.length)],
    ).join("");
    const newToken = `${orderCode}-${random4}`;
    const { error } = await (supabase as any)
      .from("orders")
      .update({ signature_token: newToken })
      .eq("id", orderId);
    if (error) {
      alert(`No se pudo generar el link: ${error.message}`);
      return null;
    }
    setFirmasTokens((prev) => ({ ...prev, [orderId]: newToken }));
    return newToken;
  };

  const handleFirmaPreview = async (orderId: string, orderCode: string) => {
    const token = await ensureSignatureTokenPortal(orderId, orderCode);
    if (!token) return;
    window.open(`${window.location.origin}/entrega/${token}`, "_blank", "noopener,noreferrer");
  };
  const handleFirmaCopy = async (orderId: string, orderCode: string) => {
    const token = await ensureSignatureTokenPortal(orderId, orderCode);
    if (!token) return;
    try { await navigator.clipboard.writeText(`${window.location.origin}/entrega/${token}`); } catch { /* ignore */ }
  };
  const handleFirmaDownload = async (orderId: string) => {
    const { exportOrderAsImage } = await import("@/components/orders/SingleOrderImageCard");
    await exportOrderAsImage(orderId);
  };

  // Active counters (managers see this on their dashboard).
  const isManagerRole = role === "cargador_mgr" || role === "warehouse_mgr";
  const [activeCounters, setActiveCounters] = useState<Array<{ actor_label: string; taps: number; last_tap: string }>>([]);
  useEffect(() => {
    if (!isManagerRole) return;
    let cancelled = false;
    async function fetch() {
      const { data, error } = await (supabase as any).rpc("maniobra_portal_active_counters", { p_date: dateStr });
      if (!cancelled && !error) setActiveCounters(data ?? []);
    }
    fetch();
    const t = setInterval(fetch, 10_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [isManagerRole, dateStr]);

  // Global activity feed (managers): every tap from any contador across
  // every product, in chronological order. Used for the dashboard tile
  // and the "ver toda la actividad" modal.
  type GlobalEvent = { id: number; delta: number; action: string; actor_label: string; created_at: string; line_key: string };
  const [globalEvents, setGlobalEvents] = useState<GlobalEvent[]>([]);
  const [globalActivityOpen, setGlobalActivityOpen] = useState(false);
  useEffect(() => {
    if (!isManagerRole) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as any)
        .from("maniobra_count_events")
        .select("id, delta, action, actor_label, created_at, line_key")
        .eq("plan_date", dateStr)
        .order("created_at", { ascending: false })
        .limit(200);
      if (!cancelled && !error) setGlobalEvents((data as GlobalEvent[]) ?? []);
    })();
    const ch = supabase.channel(`maniobra-portal-global-events-${dateStr}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "maniobra_count_events", filter: `plan_date=eq.${dateStr}` },
        (payload: any) => {
          const r = payload.new as GlobalEvent;
          if (!r) return;
          setGlobalEvents(prev => {
            if (prev.some(e => e.id === r.id)) return prev;
            // Replace any matching synthetic (broadcast-prepended) row
            // so we don't show the same event twice.
            const ts = new Date(r.created_at).getTime();
            const idx = prev.findIndex(e =>
              e.id < 0 &&
              e.actor_label === r.actor_label &&
              e.line_key === r.line_key &&
              e.action === r.action &&
              e.delta === r.delta &&
              Math.abs(new Date(e.created_at).getTime() - ts) < 10000
            );
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = r;
              return next;
            }
            return [r, ...prev].slice(0, 200);
          });
        },
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [isManagerRole, dateStr]);

  /* ── Dashboard-only derived data (embedded admin view) ───────────────── */

  // Live clock — ticks every second so the banner reads in real time.
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!embedded) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [embedded]);

  // Historical pace (same weekday, prior 90 days). Refetched whenever the
  // selected date changes — and once a minute in case the day's still
  // ticking forward in CDMX.
  const [historicalAvg, setHistoricalAvg] = useState<{ avg: number; samples: number } | null>(null);
  useEffect(() => {
    if (!embedded) return;
    let cancelled = false;
    async function fetchHist() {
      const dow = date.getDay(); // 0..6, JS = Sunday-first, matches postgres extract(dow)
      // Minute-of-day in CDMX. We use the "now" wall-clock for current day,
      // and end-of-day (1439) for past days viewed retroactively.
      const isToday = dateStr === today.ymd;
      const minuteOfDay = isToday
        ? new Date().getHours() * 60 + new Date().getMinutes()
        : 1439;
      const { data: row, error } = await (supabase as any).rpc("maniobra_portal_historical_pace", {
        p_weekday: dow, p_minute_of_day: minuteOfDay,
      });
      if (cancelled || error) return;
      const r = Array.isArray(row) ? row[0] : row;
      if (r) setHistoricalAvg({ avg: Number(r.avg_bultos) || 0, samples: r.sample_count ?? 0 });
    }
    fetchHist();
    const t = setInterval(fetchHist, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [embedded, dateStr, date, today.ymd]);

  // Per-section completion (lines done & bultos counted).
  type SectionKind = "descarga" | "traspalear" | "carga";
  const sectionStats = useMemo(() => {
    const acc: Record<SectionKind, { totalLines: number; doneLines: number; totalBultos: number; countedBultos: number }> = {
      descarga: { totalLines: 0, doneLines: 0, totalBultos: 0, countedBultos: 0 },
      traspalear: { totalLines: 0, doneLines: 0, totalBultos: 0, countedBultos: 0 },
      carga: { totalLines: 0, doneLines: 0, totalBultos: 0, countedBultos: 0 },
    };
    for (const l of lines) {
      const kind: SectionKind = l.section.kind === "carga"
        ? "carga"
        : l.section.destination === "warehouse" ? "descarga" : "traspalear";
      const c = countOf(l.line_key, l.target);
      acc[kind].totalLines += 1;
      acc[kind].totalBultos += l.target;
      acc[kind].countedBultos += Math.min(c, l.target);
      // A line counts as done as soon as the count reaches the plan,
      // not only when the worker taps "Terminé". Matches completedOf()
      // and the green ring on the worker portal SectionCard.
      if (completedOf(l.line_key, l.target)) acc[kind].doneLines += 1;
    }
    return acc;
  }, [lines, data, optimistic]);

  // Per-truck progress (only for carga sections).
  const truckProgress = useMemo(() => {
    const m = new Map<string, { truck_id: string; truck_label: string; total: number; counted: number; doneLines: number; totalLines: number }>();
    for (const l of lines) {
      if (l.section.kind !== "carga") continue;
      const cur = m.get(l.section.truck_id) ?? {
        truck_id: l.section.truck_id, truck_label: l.section.truck_label,
        total: 0, counted: 0, doneLines: 0, totalLines: 0,
      };
      cur.total += l.target;
      cur.counted += Math.min(countOf(l.line_key, l.target), l.target);
      cur.totalLines += 1;
      // Same definition of "done" as sectionStats — count >= target.
      if (completedOf(l.line_key, l.target)) cur.doneLines += 1;
      m.set(l.section.truck_id, cur);
    }
    return [...m.values()];
  }, [lines, data, optimistic]);

  // Counter leaderboard — fetched as a SQL aggregate over the entire day's
  // events (not just the windowed feed) so totals don't drift when older
  // rows roll out of the 200-event cap. Refreshes every 5s and again on
  // every fresh event we hear about.
  const [leaderboard, setLeaderboard] = useState<Array<{ actor: string; bultos: number; events: number; lastTapMs: number }>>([]);
  useEffect(() => {
    if (!isManagerRole) return;
    let cancelled = false;
    async function fetch() {
      const { data, error } = await (supabase as any).rpc("maniobra_portal_actor_totals", { p_date: dateStr });
      if (cancelled || error) return;
      const rows = (data ?? []).map((r: any) => ({
        actor: r.actor_label,
        bultos: Number(r.bultos) || 0,
        events: Number(r.events) || 0,
        lastTapMs: r.last_tap ? new Date(r.last_tap).getTime() : 0,
      }));
      setLeaderboard(rows);
    }
    fetch();
    const t = setInterval(fetch, 5_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [isManagerRole, dateStr, globalEvents.length]);

  // Throughput: bultos counted per 10-min bucket over the last 2 hours.
  const throughputBuckets = useMemo(() => {
    const BUCKET_MIN = 10;
    const BUCKETS = 12; // 12 * 10min = 2h
    const buckets = Array.from({ length: BUCKETS }, (_, i) => ({
      offsetMin: -((BUCKETS - 1 - i) * BUCKET_MIN), // -110, -100, ..., 0
      bultos: 0,
    }));
    for (const ev of globalEvents) {
      if (ev.action !== "tap_increment" && ev.action !== "tap_decrement") continue;
      const ts = new Date(ev.created_at).getTime();
      const minsAgo = (nowMs - ts) / 60_000;
      if (minsAgo > BUCKETS * BUCKET_MIN || minsAgo < 0) continue;
      const idx = BUCKETS - 1 - Math.floor(minsAgo / BUCKET_MIN);
      if (idx >= 0 && idx < BUCKETS) buckets[idx].bultos += ev.delta;
    }
    return buckets;
  }, [globalEvents, nowMs]);

  // ETA: when will the plan be done at recent pace?
  const etaInfo = useMemo(() => {
    const remaining = Math.max(0, reconcile.plan - reconcile.counted);
    // Rate from last 30 min of throughput.
    const recent = throughputBuckets.slice(-3); // last 3 buckets = 30 min
    const recentBultos = recent.reduce((s, b) => s + Math.max(0, b.bultos), 0);
    const bultosPerMin = recentBultos / 30;
    if (bultosPerMin <= 0 || remaining <= 0) return { etaMs: null as number | null, bultosPerMin };
    const minsToDone = remaining / bultosPerMin;
    return { etaMs: nowMs + minsToDone * 60_000, bultosPerMin };
  }, [reconcile.plan, reconcile.counted, throughputBuckets, nowMs]);

  // Stale alert: minutes of actual idle time since either the latest
  // count event OR the day's started_at — whichever is later. Without
  // this floor the timer accrued overnight (yesterday 11pm tap → 8am
  // today the banner read 540+ min). With started_at as a floor: a
  // fresh-day 8:14 AM start → 8:36 AM check reads "22 min", correct.
  const dayStartedAtMs = useMemo(() => {
    const s = (data?.plan as any)?.started_at as string | null | undefined;
    if (!s) return null;
    const t = new Date(s).getTime();
    return Number.isFinite(t) ? t : null;
  }, [data]);

  const staleSinceMin = useMemo(() => {
    // No counting started yet → no stale concept; banner stays hidden.
    if (dayStartedAtMs == null && globalEvents.length === 0) return null;
    const lastEventMs = globalEvents.length > 0
      ? Math.max(...globalEvents.map(e => new Date(e.created_at).getTime()))
      : null;
    // Floor the "since" timestamp at the day-start so overnight idle
    // doesn't pollute the morning banner.
    const sinceMs = Math.max(
      lastEventMs ?? 0,
      dayStartedAtMs ?? 0,
    );
    if (sinceMs === 0) return null;
    return Math.floor((nowMs - sinceMs) / 60_000);
  }, [globalEvents, nowMs, dayStartedAtMs]);

  // Are there still lines being actively worked on? A line is considered
  // "closed out" when either count >= target OR the worker explicitly
  // marked Listo (even at less than target — that's a supplier short
  // delivery, not a stalled count). Used to suppress the stale-activity
  // banner when there's nothing left to count.
  const hasPendingLines = useMemo(() => {
    for (const l of lines) {
      const c = countOf(l.line_key, l.target);
      const done = data?.counts[l.line_key]?.completed || c >= l.target;
      if (!done) return true;
    }
    return false;
  }, [lines, data, optimistic]);

  // Override watch — just the override events.
  const overrideEvents = useMemo(
    () => globalEvents.filter(e => e.action === "override").slice(0, 8),
    [globalEvents],
  );

  const incrementCount = async (line: CountableLine, delta: 1 | -1) => {
    if (role === "cargador") return;
    const current = countOf(line.line_key, line.target);
    const next = Math.max(0, current + delta);
    const completedFlag = data?.counts[line.line_key]?.completed ?? false;
    const actor = session?.display_name ?? "cargador";
    setOptimistic(o => ({ ...o, [line.line_key]: next }));
    const localEv = {
      delta,
      action: delta > 0 ? "tap_increment" : "tap_decrement",
      actor_label: actor,
      created_at: new Date().toISOString(),
      line_key: line.line_key,
    };
    // Broadcast the new value on the channel so other devices see it
    // within ~50ms — far faster than waiting for the postgres replication
    // round-trip.
    try {
      channelRef.current?.send({
        type: "broadcast", event: "count",
        payload: {
          line_key: line.line_key, count: next, target: line.target, completed: completedFlag, actor,
          ev: localEv,
        },
      });
    } catch { /* non-fatal */ }
    // Locally surface the event for managers — they don't receive their
    // own broadcast (self:false), so otherwise their feed would lag.
    if (role === "cargador_mgr" || role === "warehouse_mgr") {
      const synth = { id: -(Date.now() * 1000 + Math.floor(Math.random() * 1000)), ...localEv };
      setGlobalEvents(prev => [synth, ...prev].slice(0, 200));
    }
    try {
      await (supabase as any).rpc("maniobra_portal_increment", {
        p_date: dateStr, p_line_key: line.line_key, p_target: line.target,
        p_delta: delta, p_actor_label: actor,
      });
    } catch { /* realtime / poll resolves */ }
  };

  const toggleComplete = async (line: CountableLine) => {
    if (role === "cargador") return;
    const cur = data?.counts[line.line_key];
    const isComp = cur?.completed ?? false;
    const next = !isComp;
    const actor = session?.display_name ?? "cargador";
    setData(prev => prev ? {
      ...prev,
      counts: {
        ...prev.counts,
        [line.line_key]: {
          count: cur?.count ?? 0,
          target: cur?.target ?? line.target,
          completed: next,
          completed_at: next ? new Date().toISOString() : null,
          last_actor: actor,
        },
      },
    } : prev);
    const localEv = {
      delta: 0,
      action: next ? "mark_complete" : "unmark",
      actor_label: actor,
      created_at: new Date().toISOString(),
      line_key: line.line_key,
    };
    try {
      channelRef.current?.send({
        type: "broadcast", event: "count",
        payload: {
          line_key: line.line_key, count: cur?.count ?? 0, target: line.target, completed: next, actor,
          ev: localEv,
        },
      });
    } catch { /* non-fatal */ }
    if (role === "cargador_mgr" || role === "warehouse_mgr") {
      const synth = { id: -(Date.now() * 1000 + Math.floor(Math.random() * 1000)), ...localEv };
      setGlobalEvents(prev => [synth, ...prev].slice(0, 200));
    }
    try {
      await (supabase as any).rpc("maniobra_portal_complete", {
        p_date: dateStr, p_line_key: line.line_key, p_target: line.target,
        p_completed: next, p_actor_label: actor,
      });
    } catch { /* realtime / next fetch resolves */ }
  };

  // Manager override — set count to an absolute value. Same instant-feedback
  // pattern as incrementCount: flip optimistic state + broadcast first, then
  // fire the RPC in the background so the UI never waits on the network.
  const applyOverride = (line: CountableLine, newCount: number) => {
    if (role === "cargador") return;
    const prevCount = countOf(line.line_key, line.target);
    if (newCount === prevCount) return;
    const completedFlag = data?.counts[line.line_key]?.completed ?? false;
    const actor = session?.display_name ?? "manager";
    setOptimistic(o => ({ ...o, [line.line_key]: newCount }));
    const localEv = {
      delta: newCount - prevCount,
      action: "override",
      actor_label: actor,
      created_at: new Date().toISOString(),
      line_key: line.line_key,
    };
    try {
      channelRef.current?.send({
        type: "broadcast", event: "count",
        payload: {
          line_key: line.line_key, count: newCount, target: line.target, completed: completedFlag, actor,
          ev: localEv,
        },
      });
    } catch { /* non-fatal */ }
    if (role === "cargador_mgr" || role === "warehouse_mgr") {
      const synth = { id: -(Date.now() * 1000 + Math.floor(Math.random() * 1000)), ...localEv };
      setGlobalEvents(prev => [synth, ...prev].slice(0, 200));
    }
    // Fire and forget — realtime/postgres will reconcile.
    (supabase as any).rpc("maniobra_portal_set_count", {
      p_date: dateStr, p_line_key: line.line_key, p_target: line.target,
      p_new_count: newCount, p_actor_label: actor,
    }).then(({ error }: any) => {
      if (error) {
        // eslint-disable-next-line no-alert
        alert(`Error guardando: ${error.message ?? error}`);
      }
    });
  };

  /* ── Render ── */

  if (fetchError) {
    return (
      <div className={cn(
        "flex items-center justify-center p-6",
        embedded ? "py-16" : "min-h-screen bg-background",
      )}>
        <div className="max-w-md text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto" />
          <h1 className="text-xl font-bold">No se pudo cargar el plan</h1>
          <p className="text-muted-foreground">{fetchError}</p>
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className={cn("p-4 space-y-4", embedded ? "" : "min-h-screen bg-background")}>
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const isManager = role === "cargador_mgr" || role === "warehouse_mgr";
  const canCount  = role === "contador" || isManager;
  const dateLabel = format(date, "EEEE d 'de' MMMM", { locale: es });
  const isToday   = dateStr === today.ymd;

  // ---- Detail (single-product counter) view ----
  const activeLine = activeLineKey ? lines.find(l => l.line_key === activeLineKey) : null;
  if (activeLine) {
    const c = countOf(activeLine.line_key, activeLine.target);
    const completedFlag = data.counts[activeLine.line_key]?.completed ?? false;
    return (
      <>
        <DetailView
          line={activeLine}
          count={c}
          completed={completedFlag}
          canCount={canCount}
          isManager={isManager}
          date={dateStr}
          onBack={() => setActiveLineKey(null)}
          onIncrement={(d) => incrementCount(activeLine, d)}
          onOverride={() => setOverrideLine(activeLine)}
          onToggleComplete={() => toggleComplete(activeLine)}
          theme={theme}
          onToggleTheme={toggleTheme}
          historyOpen={historyOpen}
          onToggleHistory={() => setHistoryOpen(s => !s)}
          historyEvents={historyEvents}
          embedded={embedded}
        />
        {/* Mounted here too because we early-return out of the list render. */}
        {overrideLine && (
          <OverrideDialog
            line={overrideLine}
            currentCount={countOf(overrideLine.line_key, overrideLine.target)}
            onSave={(n) => applyOverride(overrideLine, n)}
            onClose={() => setOverrideLine(null)}
          />
        )}
      </>
    );
  }

  // ---- List view ----
  // Group lines by section.
  type Group = { key: string; kind: "descarga" | "traspalear" | "carga"; title: string; subtitle: string; total: number; lines: CountableLine[] };
  const groupMap = new Map<string, Group>();
  for (const l of lines) {
    let key: string, kind: Group["kind"], title: string, subtitle: string;
    if (l.section.kind === "carga") {
      key = `carga-${l.section.truck_id}`;
      kind = "carga";
      title = "CARGA";
      subtitle = l.section.truck_label;
    } else if (l.section.destination === "warehouse") {
      key = `descarga-${l.section.delivery_id}-warehouse`;
      kind = "descarga";
      title = "DESCARGA · ALMACÉN";
      subtitle = l.section.delivery_code;
    } else {
      key = `traspalear-${l.section.delivery_id}-${l.section.destination}`;
      kind = "traspalear";
      title = "TRASPALEAR";
      subtitle = `${l.section.delivery_code} → ${l.section.destination}`;
    }
    const cur = groupMap.get(key) ?? { key, kind, title, subtitle, total: 0, lines: [] };
    cur.total += l.target;
    cur.lines.push(l);
    groupMap.set(key, cur);
  }
  const groups = [...groupMap.values()].sort((a, b) => {
    const order = { descarga: 0, traspalear: 1, carga: 2 };
    return order[a.kind] - order[b.kind];
  });

  // In embedded mode, layout adapts: no own chrome, wider container,
  // section cards in a 2-col dashboard grid on desktop.
  const rootClass = embedded
    ? "text-foreground"
    : "min-h-screen bg-background pb-24 text-foreground";
  const mainClass = embedded
    ? "w-full space-y-4"
    : "max-w-2xl mx-auto p-3 space-y-4";

  return (
    <div className={rootClass}>
      {!embedded && (
        <header className="sticky top-0 z-10 border-b bg-card/95 backdrop-blur">
          <div className="max-w-2xl mx-auto p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                <h1 className="text-lg font-bold">Plan del día</h1>
              </div>
              <div className="flex items-center gap-2">
                {/* Firmas pill — only for warehouse_mgr (Rodrigo Bautista).
                    Tap → bottom sheet with every order grouped by truck +
                    pickup section, each with eye/copy/download icons. */}
                {role === "warehouse_mgr" && (
                  <button
                    onClick={() => setFirmasOpen(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30"
                    title="Firmas de entrega"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Firmas
                  </button>
                )}
                <ThemeButton theme={theme} onToggle={toggleTheme} />
                {session ? (
                  <button
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20"
                    onClick={() => setProfileOpen(true)}
                    title="Ver perfil"
                  >
                    <UserCheck className="h-5 w-5" />
                    <span className="max-w-[120px] truncate">{session.display_name}</span>
                  </button>
                ) : (
                  <button
                    className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                    onClick={() => setUnlockOpen(true)}
                    title="Iniciar sesión"
                    aria-label="Iniciar sesión"
                  >
                    <User className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-center gap-3">
              {/* Hide chevrons entirely for Navas — he's locked to
                  today and shouldn't even see disabled arrows that
                  hint there's other days to navigate to. */}
              {isManager && role !== "cargador_mgr" && (
                <Button variant="ghost" size="icon" className="h-9 w-9"
                  onClick={() => { const next = addDays(date, -1); if (canNavigate(role, next)) setDate(next); }}
                  disabled={!canNavigate(role, addDays(date, -1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              )}
              <div className="text-center">
                <p className="text-xl sm:text-2xl font-bold capitalize tracking-tight">{dateLabel}</p>
                {/* Plan total = unique physical bultos handled today.
                    Cross-docked bultos used to be summed twice (once
                    in entrada, once in carga) inflating the headline.
                    Now we show the unique number and break it down
                    into entrada / traspaleo / carga badges so the
                    cargador sees both the truth AND the per-section
                    counts they need. */}
                {reconcile.plan === 0 ? (
                  <p className="text-sm text-muted-foreground mt-1">Sin movimientos</p>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground mt-1">
                      {role === "cargador"
                        ? <><span className="font-bold text-foreground">{fmtBultos(reconcile.uniqueBultos)}</span> bultos en total</>
                        : <>Plan <span className="font-bold text-foreground">{fmtBultos(reconcile.uniqueBultos)}</span> · Contado <span className="font-bold text-foreground">{fmtBultos(reconcile.countedDisplay)}</span></>
                      }
                    </p>
                    {(reconcile.entradaBultos > 0 || reconcile.traspaleoBultos > 0 || reconcile.cargaBultos > 0) && (
                      <div className="grid grid-cols-3 gap-2.5 mt-3 max-w-md mx-auto">
                        <button
                          type="button"
                          onClick={() => toggleSectionFilter("descarga")}
                          className={cn(
                            "rounded-xl border px-3 py-3 text-center transition active:scale-[0.97]",
                            sectionFilter === "descarga"
                              ? "border-blue-500 bg-blue-500/15 ring-2 ring-blue-500/30 shadow-sm"
                              : "border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10",
                          )}
                          aria-pressed={sectionFilter === "descarga"}
                        >
                          <div className="flex items-center justify-center gap-1.5 text-blue-700 dark:text-blue-300">
                            <ArrowDownToLine className="h-4 w-4" />
                            <span className="text-2xl font-bold tabular-nums leading-none">{fmtBultos(reconcile.entradaBultos)}</span>
                          </div>
                          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-1.5">Descarga</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleSectionFilter("traspalear")}
                          className={cn(
                            "rounded-xl border px-3 py-3 text-center transition active:scale-[0.97]",
                            sectionFilter === "traspalear"
                              ? "border-amber-500 bg-amber-500/15 ring-2 ring-amber-500/30 shadow-sm"
                              : "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10",
                          )}
                          aria-pressed={sectionFilter === "traspalear"}
                          title="Traspaleo: bultos que llegan y van directo al camión. Solo se cuentan una vez en el plan total."
                        >
                          <div className="flex items-center justify-center gap-1.5 text-amber-700 dark:text-amber-300">
                            <ArrowRight className="h-4 w-4" />
                            <span className="text-2xl font-bold tabular-nums leading-none">{fmtBultos(reconcile.traspaleoBultos)}</span>
                          </div>
                          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-1.5">Traspaleo</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleSectionFilter("carga")}
                          className={cn(
                            "rounded-xl border px-3 py-3 text-center transition active:scale-[0.97]",
                            sectionFilter === "carga"
                              ? "border-emerald-500 bg-emerald-500/15 ring-2 ring-emerald-500/30 shadow-sm"
                              : "border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10",
                          )}
                          aria-pressed={sectionFilter === "carga"}
                        >
                          <div className="flex items-center justify-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                            <Truck className="h-4 w-4" />
                            <span className="text-2xl font-bold tabular-nums leading-none">{fmtBultos(reconcile.cargaBultos)}</span>
                          </div>
                          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-1.5">Carga</div>
                        </button>
                      </div>
                    )}
                  </>
                )}
                {/* Day-start: button (manager, not yet started) OR
                    "Tiempo de jornada" pill (any role, once started).
                    Auto-stamped on first count event by the
                    maniobra_auto_start_day_trg trigger if the manager
                    forgets to tap. */}
                {reconcile.plan > 0 && (
                  dayStartedAtMs == null ? (
                    isManager && isToday && (
                      <button
                        type="button"
                        onClick={handleStartDay}
                        disabled={startingDay}
                        className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 active:scale-[0.97] transition disabled:opacity-50"
                      >
                        <Activity className="h-4 w-4" />
                        {startingDay ? "Iniciando…" : "Iniciar conteo"}
                      </button>
                    )
                  ) : (
                    <JornadaPill startedAtMs={dayStartedAtMs} nowMs={nowMs} />
                  )
                )}
                {!isToday && (
                  <button className="text-[11px] text-primary hover:underline mt-1 ml-3" onClick={() => setDate(today.date)}>
                    Volver a hoy
                  </button>
                )}
              </div>
              {isManager && role !== "cargador_mgr" && (
                <Button variant="ghost" size="icon" className="h-9 w-9"
                  onClick={() => { const next = addDays(date, 1); if (canNavigate(role, next)) setDate(next); }}
                  disabled={!canNavigate(role, addDays(date, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </header>
      )}

      <main className={mainClass}>
        {/* Manager dashboard.
            - Embedded (admin) mode: full horizontal LiveDashboard with
              every tile.
            - Mobile portal: compact ManagerDashboard.
        */}
        {isManagerRole && reconcile.plan > 0 && embedded && (
          <LiveDashboard
            nowMs={nowMs}
            dateLabel={dateLabel}
            isToday={isToday}
            plan={reconcile.uniqueBultos}
            counted={reconcile.countedDisplay}
            entradaBultos={reconcile.entradaBultos}
            traspaleoBultos={reconcile.traspaleoBultos}
            cargaBultos={reconcile.cargaBultos}
            sobra={reconcile.sobra}
            falta={reconcile.falta}
            anomalies={reconcile.anomalies}
            sectionStats={sectionStats}
            truckProgress={truckProgress}
            leaderboard={leaderboard}
            activeCounters={activeCounters}
            throughputBuckets={throughputBuckets}
            etaInfo={etaInfo}
            staleSinceMin={staleSinceMin}
            hasPendingLines={hasPendingLines}
            overrideEvents={overrideEvents}
            historicalAvg={historicalAvg}
            recentEvents={globalEvents.slice(0, 8)}
            lineNameByKey={lineNameByKey}
            lineImageByKey={lineImageByKey}
            onOpenAnomaly={(k) => setActiveLineKey(k)}
            onOpenAllActivity={() => setGlobalActivityOpen(true)}
            onOpenLine={(k) => setActiveLineKey(k)}
          />
        )}
        {isManagerRole && reconcile.plan > 0 && !embedded && (
          <ManagerDashboard
            plan={reconcile.uniqueBultos}
            counted={reconcile.countedDisplay}
            entradaBultos={reconcile.entradaBultos}
            traspaleoBultos={reconcile.traspaleoBultos}
            cargaBultos={reconcile.cargaBultos}
            sectionFilter={sectionFilter}
            onToggleSectionFilter={toggleSectionFilter}
            sobra={reconcile.sobra}
            falta={reconcile.falta}
            anomalies={reconcile.anomalies}
            activeCounters={activeCounters}
            recentEvents={globalEvents.slice(0, 5)}
            lineNameByKey={lineNameByKey}
            lineImageByKey={lineImageByKey}
            onOpenAnomaly={(k) => setActiveLineKey(k)}
            onOpenAllActivity={() => setGlobalActivityOpen(true)}
            onOpenLine={(k) => setActiveLineKey(k)}
          />
        )}

        {groups.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>Sin movimientos para este día</p>
          </div>
        ) : (
          <>
            {/* Active section filter banner — bigger, color-matched to
                the active section, with a prominent reset button so
                cargadores can always escape back to the full list.
                Was previously a small text-xs caption; users couldn't
                tell it was interactive. */}
            {sectionFilter && (
              <div
                className={cn(
                  "flex items-center justify-between gap-3 rounded-xl border-2 px-4 py-3",
                  sectionFilter === "descarga" && "border-blue-500/50 bg-blue-500/10",
                  sectionFilter === "traspalear" && "border-amber-500/50 bg-amber-500/10",
                  sectionFilter === "carga" && "border-emerald-500/50 bg-emerald-500/10",
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {sectionFilter === "descarga" && <ArrowDownToLine className="h-5 w-5 text-blue-700 dark:text-blue-300 shrink-0" />}
                  {sectionFilter === "traspalear" && <ArrowRight className="h-5 w-5 text-amber-700 dark:text-amber-300 shrink-0" />}
                  {sectionFilter === "carga" && <Truck className="h-5 w-5 text-emerald-700 dark:text-emerald-300 shrink-0" />}
                  <div className="text-sm font-semibold truncate">
                    Mostrando solo{" "}
                    {sectionFilter === "descarga" && "Descarga"}
                    {sectionFilter === "traspalear" && "Traspaleo"}
                    {sectionFilter === "carga" && "Carga"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSectionFilter(null)}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-background border border-border hover:bg-muted active:scale-[0.97] transition whitespace-nowrap"
                >
                  <X className="h-4 w-4" />
                  Mostrar todo
                </button>
              </div>
            )}
            {(() => {
              // Match each group's kind to the active filter. Descarga
              // groups split by kind: "descarga" key for warehouse-bound,
              // "traspalear" key for cross-dock. Carga groups always
              // kind: "carga".
              const visibleGroups = sectionFilter
                ? groups.filter((g) => g.kind === sectionFilter)
                : groups;
              if (visibleGroups.length === 0) {
                return (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    No hay movimientos en esta sección hoy.
                  </div>
                );
              }
              return (
                <div className={embedded ? "grid grid-cols-1 lg:grid-cols-2 gap-4" : "space-y-4"}>
                  {visibleGroups.map(g => (
                    <SectionCard key={g.key} group={g}
                      countOf={countOf} completedOf={completedOf}
                      isManager={isManagerRole}
                      canDrillIn={role !== "cargador"}
                      onOpenLine={(k) => setActiveLineKey(k)} />
                  ))}
                </div>
              );
            })()}
          </>
        )}
      </main>

      {/* Reconciliation banner — hidden from cargadores. They only need to
          know what to load and where, not the live count.
          Also hidden in embedded mode (the admin page has its own context). */}
      {!embedded && reconcile.plan > 0 && role !== "cargador" && (
        <div className="fixed bottom-0 left-0 right-0 border-t bg-card/95 backdrop-blur z-10">
          <div className="max-w-2xl mx-auto p-3 grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Plan</div>
              <div className="font-bold text-base tabular-nums">{fmtBultos(reconcile.plan)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Contado</div>
              <div className={cn("font-bold text-base tabular-nums", reconcile.counted === reconcile.plan && reconcile.sobra === 0 && reconcile.falta === 0 ? "text-emerald-500" : "text-foreground")}>
                {fmtBultos(reconcile.counted)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Diferencia</div>
              <div className="font-bold text-base tabular-nums">
                {reconcile.sobra === 0 && reconcile.falta === 0 && reconcile.counted < reconcile.plan ? (
                  <span className="text-foreground">{fmtBultos(reconcile.plan - reconcile.counted)} restantes</span>
                ) : reconcile.sobra > 0 || reconcile.falta > 0 ? (
                  <span>
                    {reconcile.sobra > 0 && <span className="text-amber-500">+{reconcile.sobra}</span>}
                    {reconcile.sobra > 0 && reconcile.falta > 0 && " · "}
                    {reconcile.falta > 0 && <span className="text-red-500">-{reconcile.falta}</span>}
                  </span>
                ) : (
                  <span className="text-emerald-500"><Check className="h-5 w-5 inline" /></span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {!embedded && (
        <UnlockDialog open={unlockOpen} onClose={() => setUnlockOpen(false)} onUnlock={(s) => { setSession(s); saveSession(s); setUnlockOpen(false); }} />
      )}

      {/* Firmas bottom sheet (warehouse_mgr only). */}
      {firmasOpen && role === "warehouse_mgr" && data && (
        <FirmasSheet
          orders={data.orders}
          plan={data.plan}
          tokens={firmasTokens}
          onClose={() => setFirmasOpen(false)}
          onPreview={handleFirmaPreview}
          onCopy={handleFirmaCopy}
          onDownload={handleFirmaDownload}
        />
      )}

      {!embedded && session && (
        <ProfileDialog
          open={profileOpen}
          onClose={() => setProfileOpen(false)}
          session={session}
          onLogout={() => { clearSession(); setSession(null); setDate(today.date); setProfileOpen(false); }}
        />
      )}

      {overrideLine && (
        <OverrideDialog
          line={overrideLine}
          currentCount={countOf(overrideLine.line_key, overrideLine.target)}
          onSave={(n) => applyOverride(overrideLine, n)}
          onClose={() => setOverrideLine(null)}
        />
      )}

      <ActivityFeedDialog
        open={globalActivityOpen}
        onClose={() => setGlobalActivityOpen(false)}
        events={globalEvents}
        lineNameByKey={lineNameByKey}
        lineImageByKey={lineImageByKey}
        onOpenLine={(k) => { setActiveLineKey(k); setGlobalActivityOpen(false); }}
      />
    </div>
  );
}

/* ── ActivityFeedDialog ───────────────────────────────────────────────── */

/* ───────────────────────── Firmas bottom sheet ─────────────────────────
 * Surfaces signature actions (eye / copy / download) per order without
 * cluttering the per-product loading list. Only mounted for
 * warehouse_mgr. Orders are grouped by truck (Rabón 1 → Rabón 2 → ...)
 * with a Pickup section and an Unassigned section for completeness.
 */
function FirmasSheet({
  orders,
  plan,
  tokens,
  onClose,
  onPreview,
  onCopy,
  onDownload,
}: {
  orders: PortalOrder[];
  plan: PortalPlan;
  tokens: Record<string, string | null>;
  onClose: () => void;
  onPreview: (orderId: string, orderCode: string) => void | Promise<void>;
  onCopy: (orderId: string, orderCode: string) => void | Promise<void>;
  onDownload: (orderId: string) => void | Promise<void>;
}) {
  // Lock background scroll while the sheet is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const orderById = new Map(orders.map((o) => [o.id, o]));
  const pickupSet = new Set(plan.pickup_order_ids ?? []);
  const groupedTrucks = (plan.trucks ?? []).map((t) => ({
    label: t.label,
    orders: (t.order_ids ?? []).map((oid) => orderById.get(oid)).filter(Boolean) as PortalOrder[],
  })).filter((g) => g.orders.length > 0);
  const pickupOrders = orders.filter((o) => pickupSet.has(o.id));
  const assignedSet = new Set<string>();
  for (const t of plan.trucks ?? []) for (const oid of t.order_ids ?? []) assignedSet.add(oid);
  const unassignedOrders = orders.filter((o) => !assignedSet.has(o.id) && !pickupSet.has(o.id));

  const totalOrders = orders.length;
  const Row = ({ o }: { o: PortalOrder }) => (
    <div className="flex items-center gap-3 px-4 py-3 border-t">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold text-blue-500">{o.order_code}</span>
          <span className="text-sm truncate">{o.client_name}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => onPreview(o.id, o.order_code)} className="p-2 rounded hover:bg-muted text-blue-600" title="Ver página de firma">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
        </button>
        <button onClick={() => onCopy(o.id, o.order_code)} className="p-2 rounded hover:bg-muted text-muted-foreground" title="Copiar link de firma">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
        </button>
        <button onClick={() => onDownload(o.id)} className="p-2 rounded hover:bg-muted text-muted-foreground" title="Descargar PNG del pedido">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 z-[60] rounded-t-3xl bg-card text-foreground shadow-2xl flex flex-col"
        style={{ maxHeight: "88dvh" }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1 shrink-0">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>
        {/* Header */}
        <div className="px-4 pt-2 pb-3 flex items-center gap-3 border-b shrink-0">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold">Firmas de entrega</h3>
            <p className="text-xs text-muted-foreground">
              {totalOrders} {totalOrders === 1 ? "pedido" : "pedidos"} · toca el icono para ver, copiar o descargar
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-muted hover:bg-muted/80" aria-label="Cerrar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: "contain" }}>
          {totalOrders === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">Sin pedidos en este día.</p>
          ) : (
            <>
              {groupedTrucks.map((g) => (
                <div key={g.label}>
                  <div className="px-4 pt-4 pb-1 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                    <span className="text-base">🚚</span> {g.label}
                  </div>
                  {g.orders.map((o) => <Row key={o.id} o={o} />)}
                </div>
              ))}
              {pickupOrders.length > 0 && (
                <div>
                  <div className="px-4 pt-4 pb-1 text-[11px] uppercase tracking-wider text-purple-600 dark:text-purple-400 font-semibold flex items-center gap-1.5">
                    <span className="text-base">📦</span> Pickup en bodega
                  </div>
                  {pickupOrders.map((o) => <Row key={o.id} o={o} />)}
                </div>
              )}
              {unassignedOrders.length > 0 && (
                <div>
                  <div className="px-4 pt-4 pb-1 text-[11px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1.5">
                    <span className="text-base">⚠</span> Sin asignar
                  </div>
                  {unassignedOrders.map((o) => <Row key={o.id} o={o} />)}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function ActivityFeedDialog({
  open, onClose, events, lineNameByKey, lineImageByKey, onOpenLine,
}: {
  open: boolean;
  onClose: () => void;
  events: Array<{ id: number; delta: number; action: string; actor_label: string; created_at: string; line_key: string }>;
  lineNameByKey: Record<string, string>;
  lineImageByKey: Record<string, string | null>;
  onOpenLine: (line_key: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Actividad del día</DialogTitle>
          <DialogDescription>
            Todos los conteos, en orden cronológico. Tap a un evento para abrir el producto.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto -mx-2 px-2">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Sin actividad todavía.</p>
          ) : (
            <ul className="space-y-2">
              {events.map(ev => {
                const { label, color } = describeEvent(ev);
                const productName = lineNameByKey[ev.line_key] ?? "—";
                const productImg = lineImageByKey[ev.line_key] ?? null;
                return (
                  <li key={ev.id}>
                    <button
                      onClick={() => onOpenLine(ev.line_key)}
                      className="w-full text-left flex items-start gap-3 border-b border-border/40 pb-2 last:border-0 hover:bg-muted/40 rounded px-1 py-0.5"
                    >
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0 pt-0.5 w-14">
                        {format(new Date(ev.created_at), "HH:mm:ss")}
                      </span>
                      {productImg ? (
                        <img src={productImg} className="h-10 w-10 rounded object-contain bg-white shrink-0" alt="" />
                      ) : (
                        <div className="h-10 w-10 rounded bg-muted shrink-0 grid place-items-center">
                          <Package className="h-5 w-5 text-muted-foreground/50" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{ev.actor_label}</div>
                        <div className={cn("text-sm font-medium", color)}>{label}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{productName}</div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Event labels for the per-line history list ───────────────────── */

function describeEvent(ev: { delta: number; action: string }): { label: string; color: string } {
  switch (ev.action) {
    case "tap_increment":
      return { label: `Sumó +${ev.delta} bulto${ev.delta === 1 ? "" : "s"}`, color: "text-emerald-600 dark:text-emerald-400" };
    case "tap_decrement":
      return { label: `Restó ${ev.delta} bulto${Math.abs(ev.delta) === 1 ? "" : "s"}`, color: "text-red-600 dark:text-red-400" };
    case "mark_complete":
      return { label: "Terminó de contar", color: "text-emerald-600 dark:text-emerald-400" };
    case "unmark":
      return { label: "Siguió contando", color: "text-amber-600 dark:text-amber-400" };
    case "override":
      return {
        label: ev.delta === 0 ? "Editó conteo" : `Editó conteo (${ev.delta > 0 ? "+" : ""}${ev.delta})`,
        color: "text-blue-600 dark:text-blue-400",
      };
    default:
      return { label: ev.action, color: "text-muted-foreground" };
  }
}

/* ── ProfileDialog (tap user badge to view + logout) ──────────────────── */

const ROLE_LABEL: Record<Exclude<Role, "cargador">, string> = {
  contador: "Contador",
  cargador_mgr: "Manager de cargadores",
  warehouse_mgr: "Manager de almacén",
};

function ProfileDialog({
  open, onClose, session, onLogout,
}: {
  open: boolean;
  onClose: () => void;
  session: Session;
  onLogout: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Tu sesión</DialogTitle>
          <DialogDescription>
            Información de la sesión actual en este dispositivo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 py-2">
          <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <UserCheck className="h-6 w-6" />
          </div>
          <div>
            <div className="font-semibold text-base">{session.display_name}</div>
            <div className="text-xs text-muted-foreground">{ROLE_LABEL[session.role]}</div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground border-t pt-3">
          Tu sesión se cierra automáticamente después de 4 horas sin actividad.
        </p>

        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Seguir trabajando</Button>
          <Button variant="destructive" onClick={onLogout} className="flex-1">Cerrar sesión</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Live dashboard (embedded admin view) ───────────────────────────── */

type SectionKindKey = "descarga" | "traspalear" | "carga";
const SECTION_LABELS: Record<SectionKindKey, string> = {
  descarga: "Descarga",
  traspalear: "Traspalear",
  carga: "Carga",
};
const SECTION_ICONS: Record<SectionKindKey, typeof Truck> = {
  descarga: ArrowDownToLine,
  traspalear: ArrowRight,
  carga: Truck,
};

function fmtClock(d: Date) {
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function fmtClockShort(d: Date) {
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}
function fmtRelativeMin(min: number): string {
  if (min < 1) return "ahora";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return rem === 0 ? `${h}h` : `${h}h${rem}m`;
}

function LiveDashboard({
  nowMs, dateLabel, isToday,
  plan, counted,
  entradaBultos, traspaleoBultos, cargaBultos,
  sobra, falta, anomalies,
  sectionStats, truckProgress, leaderboard, activeCounters,
  throughputBuckets, etaInfo, staleSinceMin, hasPendingLines, overrideEvents, historicalAvg,
  recentEvents, lineNameByKey, lineImageByKey,
  onOpenAnomaly, onOpenAllActivity, onOpenLine,
}: {
  nowMs: number;
  dateLabel: string;
  isToday: boolean;
  plan: number; counted: number; sobra: number; falta: number;
  /** Optional breakdown: bultos por sección. When provided, the
   *  dashboard renders the entrada / traspaleo / carga badges so the
   *  manager sees how the unique total is composed. */
  entradaBultos?: number;
  traspaleoBultos?: number;
  cargaBultos?: number;
  anomalies: Array<{ line: CountableLine; kind: "sobra" | "falta"; delta: number }>;
  sectionStats: Record<SectionKindKey, { totalLines: number; doneLines: number; totalBultos: number; countedBultos: number }>;
  truckProgress: Array<{ truck_id: string; truck_label: string; total: number; counted: number; doneLines: number; totalLines: number }>;
  leaderboard: Array<{ actor: string; bultos: number; events: number; lastTapMs: number }>;
  activeCounters: Array<{ actor_label: string; taps: number; last_tap: string }>;
  throughputBuckets: Array<{ offsetMin: number; bultos: number }>;
  etaInfo: { etaMs: number | null; bultosPerMin: number };
  staleSinceMin: number | null;
  hasPendingLines: boolean;
  overrideEvents: Array<{ id: number; delta: number; action: string; actor_label: string; created_at: string; line_key: string }>;
  historicalAvg: { avg: number; samples: number } | null;
  recentEvents: Array<{ id: number; delta: number; action: string; actor_label: string; created_at: string; line_key: string }>;
  lineNameByKey: Record<string, string>;
  lineImageByKey: Record<string, string | null>;
  onOpenAnomaly: (line_key: string) => void;
  onOpenAllActivity: () => void;
  onOpenLine: (line_key: string) => void;
}) {
  const pct = plan > 0 ? Math.min(100, Math.round((counted / plan) * 100)) : 0;
  const now = new Date(nowMs);
  const histDelta = historicalAvg && historicalAvg.samples > 0 ? counted - historicalAvg.avg : null;
  const activeActors = new Set(activeCounters.map(a => a.actor_label));
  // Show stale banner only if business hours-ish (8am to 8pm), ≥10 min
  // idle, AND there's still pending work. If every line is closed out
  // (count >= target or worker tapped Listo at less than target because
  // the supplier shorted), then `counted < plan` is expected and we
  // shouldn't nag — there's nothing left to count.
  const hour = now.getHours();
  const showStale = staleSinceMin !== null && staleSinceMin >= 10 && hour >= 8 && hour < 20 && hasPendingLines;

  return (
    <section className="space-y-3">
      {/* Live clock + date banner */}
      <div className="flex items-center justify-between border rounded-xl bg-card px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary/10 grid place-items-center">
            <Clock className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground leading-none">
              {isToday ? "En vivo · hoy" : "Vista histórica"}
            </p>
            <p className="text-sm font-bold capitalize leading-tight">{dateLabel}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none">Hora CDMX</p>
          <p className="text-xl font-bold tabular-nums leading-tight">{fmtClock(now)}</p>
        </div>
      </div>

      {/* Stale alert — only fires when there are still pending lines.
          If everything is marked Listo (even at less than plan), the
          banner stays hidden because the shortfall is the supplier's
          delivery, not a stalled count. */}
      {showStale && (
        <div className="flex items-center gap-3 border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-950/30 rounded px-4 py-2.5 text-sm">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
          <div>
            <p className="font-semibold text-amber-700 dark:text-amber-300">Sin actividad hace {staleSinceMin} min</p>
            <p className="text-xs text-amber-700/80 dark:text-amber-300/80">Hay líneas pendientes por contar o cerrar.</p>
          </div>
        </div>
      )}

      {/* KPI strip with progress, plan/counted/restante, ETA */}
      <div className="border-2 border-primary/40 rounded-xl bg-primary/5 p-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-primary">Vista en vivo</h2>
            <p className="text-xs text-muted-foreground">Conteo del día · espejo de Bautista</p>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Progreso</div>
            <div className="text-3xl font-bold tabular-nums leading-none">{pct}%</div>
          </div>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className={cn("h-full transition-all", pct === 100 ? "bg-emerald-500" : "bg-primary")} style={{ width: `${pct}%` }} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Plan</div>
            <div className="text-xl font-bold tabular-nums">{fmtBultos(plan)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Contado</div>
            <div className="text-xl font-bold tabular-nums">{fmtBultos(counted)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Restante</div>
            <div className="text-xl font-bold tabular-nums">{fmtBultos(Math.max(0, plan - counted))}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">ETA</div>
            {etaInfo.etaMs ? (
              <>
                <div className="text-xl font-bold tabular-nums">{fmtClockShort(new Date(etaInfo.etaMs))}</div>
                <div className="text-[10px] text-muted-foreground">a {Math.round(etaInfo.bultosPerMin)} blt/min</div>
              </>
            ) : counted >= plan ? (
              <div className="text-xl font-bold text-emerald-500">Listo</div>
            ) : (
              <div className="text-xl font-bold text-muted-foreground">—</div>
            )}
          </div>
        </div>

        {/* Breakdown cards moved to the portal header (single source of
            truth for everyone). LiveDashboard keeps just the Plan KPI
            strip above. */}

        {/* Historical comparison strip */}
        {historicalAvg && historicalAvg.samples > 0 && histDelta !== null && (
          <div className="flex items-center gap-2 text-xs border-t border-primary/20 pt-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">A esta hora · promedio mismo día (n={historicalAvg.samples}):</span>
            <span className="font-semibold tabular-nums">{fmtBultos(Math.round(historicalAvg.avg))}</span>
            <span className={cn("font-bold tabular-nums", histDelta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
              {histDelta >= 0 ? "▲" : "▼"} {fmtBultos(Math.abs(Math.round(histDelta)))}
            </span>
            <span className="text-muted-foreground">
              ({histDelta >= 0 ? "adelante" : "atrasado"})
            </span>
          </div>
        )}
      </div>

      {/* Section stats — Descarga / Traspalear / Carga */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(["descarga", "traspalear", "carga"] as SectionKindKey[]).map(kind => {
          const s = sectionStats[kind];
          const Icon = SECTION_ICONS[kind];
          if (s.totalLines === 0) return (
            <div key={kind} className="border rounded-lg p-3 bg-card opacity-60">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <Icon className="h-3.5 w-3.5" /> {SECTION_LABELS[kind]}
              </div>
              <div className="text-sm text-muted-foreground mt-2">Sin movimientos</div>
            </div>
          );
          const sectPct = s.totalBultos > 0 ? Math.round((s.countedBultos / s.totalBultos) * 100) : 0;
          return (
            <div key={kind} className="border rounded-lg p-3 bg-card">
              <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
                <span className="flex items-center gap-2"><Icon className="h-3.5 w-3.5" /> {SECTION_LABELS[kind]}</span>
                <span className="tabular-nums">{sectPct}%</span>
              </div>
              <div className="text-2xl font-bold tabular-nums mt-1.5">
                {s.doneLines}<span className="text-base text-muted-foreground">/{s.totalLines} líneas</span>
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {fmtBultos(s.countedBultos)} / {fmtBultos(s.totalBultos)} bultos
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-2">
                <div className={cn("h-full", sectPct === 100 ? "bg-emerald-500" : "bg-primary")} style={{ width: `${sectPct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Per-truck progress strip */}
      {truckProgress.length > 0 && (
        <div className="border rounded-lg p-3 bg-card">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            <Truck className="h-3.5 w-3.5" /> Camiones
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {truckProgress.map(t => {
              const p = t.total > 0 ? Math.round((t.counted / t.total) * 100) : 0;
              return (
                <div key={t.truck_id} className="flex items-center gap-2">
                  <span className="text-xs font-semibold truncate flex-1 min-w-0">{t.truck_label}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{t.doneLines}/{t.totalLines}</span>
                  <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden shrink-0">
                    <div className={cn("h-full", p === 100 ? "bg-emerald-500" : "bg-primary")} style={{ width: `${p}%` }} />
                  </div>
                  <span className="text-[10px] font-bold tabular-nums w-10 text-right shrink-0">{p}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Throughput sparkline + Leaderboard side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Throughput chart */}
        <div className="lg:col-span-2 border rounded-lg p-3 bg-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" /> Ritmo · últimas 2 horas
            </span>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {Math.round(etaInfo.bultosPerMin)} blt/min
            </span>
          </div>
          <ThroughputSpark buckets={throughputBuckets} />
        </div>

        {/* Leaderboard */}
        <div className="border rounded-lg p-3 bg-card">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            <Trophy className="h-3.5 w-3.5" /> Tabla de contadores
          </div>
          {leaderboard.length === 0 ? (
            <div className="text-xs text-muted-foreground py-2">Sin contadores todavía.</div>
          ) : (
            <ul className="max-h-48 overflow-y-auto divide-y divide-border/40">
              {leaderboard.map((row, i) => {
                const active = activeActors.has(row.actor);
                const minsAgo = Math.floor((nowMs - row.lastTapMs) / 60_000);
                return (
                  <li key={row.actor} className="flex items-center gap-2 text-xs h-7">
                    <span className="font-mono text-muted-foreground w-4 text-right shrink-0">{i + 1}</span>
                    <span className={cn("h-2 w-2 rounded-full shrink-0", active ? "bg-emerald-500" : "bg-muted-foreground/30")} />
                    <span className="font-semibold flex-1 truncate min-w-0">{row.actor}</span>
                    <span className="font-bold tabular-nums shrink-0 whitespace-nowrap">{fmtBultos(row.bultos)}</span>
                    <span className="text-muted-foreground tabular-nums shrink-0 whitespace-nowrap text-right min-w-[2.75rem]">{fmtRelativeMin(minsAgo)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Anomalies + Activity feed side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Anomalies */}
        <div className="border rounded-lg p-3 bg-card">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            <AlertTriangle className="h-3.5 w-3.5" /> Anomalías
            {anomalies.length > 0 && (
              <span className={cn("ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded", "bg-red-500 text-white")}>
                {anomalies.length}
              </span>
            )}
          </div>
          {anomalies.length === 0 ? (
            <div className="text-xs text-muted-foreground py-2 flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-500" /> Todo cuadra.
            </div>
          ) : (
            <ul className="space-y-1 max-h-48 overflow-y-auto">
              {anomalies.map((a, i) => (
                <li key={i}>
                  <button
                    onClick={() => onOpenAnomaly(a.line.line_key)}
                    className="w-full flex items-center gap-2 text-xs hover:bg-muted/40 rounded px-1 py-1"
                  >
                    <span className={cn(
                      "text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0",
                      a.kind === "sobra" ? "bg-amber-500 text-white" : "bg-red-500 text-white",
                    )}>
                      {a.kind === "sobra" ? `+${a.delta}` : `-${a.delta}`}
                    </span>
                    <span className="flex-1 truncate text-left">{a.line.name}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {a.line.section.kind === "carga" ? a.line.section.truck_label : a.line.section.delivery_code}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Activity feed */}
        <div className="border rounded-lg p-3 bg-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Actividad en vivo
            </span>
            <button onClick={onOpenAllActivity} className="text-[10px] text-primary hover:underline">
              Ver todo →
            </button>
          </div>
          {recentEvents.length === 0 ? (
            <div className="text-xs text-muted-foreground py-2">Sin actividad todavía.</div>
          ) : (
            <ul className="space-y-1.5 max-h-48 overflow-y-auto">
              {recentEvents.map(ev => {
                const { label, color } = describeEvent(ev);
                const productName = lineNameByKey[ev.line_key] ?? "—";
                const productImg = lineImageByKey[ev.line_key] ?? null;
                return (
                  <li key={ev.id}>
                    <button
                      onClick={() => onOpenLine(ev.line_key)}
                      className="w-full text-left flex items-center gap-2 text-xs hover:bg-muted/40 rounded px-1 py-0.5"
                    >
                      <span className="text-muted-foreground tabular-nums shrink-0 w-12 text-[10px]">
                        {format(new Date(ev.created_at), "HH:mm:ss")}
                      </span>
                      {productImg ? (
                        <img src={productImg} className="h-6 w-6 rounded object-contain bg-white shrink-0" alt="" />
                      ) : (
                        <div className="h-6 w-6 rounded bg-muted shrink-0" />
                      )}
                      <span className="font-semibold shrink-0 max-w-[80px] truncate">{ev.actor_label}</span>
                      <span className={cn("shrink-0", color)}>{label}</span>
                      <span className="text-muted-foreground truncate flex-1 text-right">{productName}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Override watch */}
      {overrideEvents.length > 0 && (
        <div className="border rounded-lg p-3 bg-card">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            <Shield className="h-3.5 w-3.5 text-blue-500" /> Ediciones manuales (override)
            <span className="ml-auto text-[10px] text-muted-foreground">{overrideEvents.length} hoy</span>
          </div>
          <ul className="space-y-1.5">
            {overrideEvents.map(ev => {
              const { label, color } = describeEvent(ev);
              const productName = lineNameByKey[ev.line_key] ?? "—";
              return (
                <li key={ev.id}>
                  <button
                    onClick={() => onOpenLine(ev.line_key)}
                    className="w-full text-left flex items-center gap-2 text-xs hover:bg-muted/40 rounded px-1 py-0.5"
                  >
                    <span className="text-muted-foreground tabular-nums shrink-0 w-14 text-[10px]">
                      {format(new Date(ev.created_at), "HH:mm:ss")}
                    </span>
                    <span className="font-semibold shrink-0 max-w-[120px] truncate">{ev.actor_label}</span>
                    <span className={cn("shrink-0 font-medium", color)}>{label}</span>
                    <span className="text-muted-foreground truncate flex-1 text-right">{productName}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

/* ── Throughput sparkline (inline SVG) ──────────────────────────────── */

function ThroughputSpark({ buckets }: { buckets: Array<{ offsetMin: number; bultos: number }> }) {
  const W = 600;
  const H = 56;
  const pad = 2;
  const maxV = Math.max(1, ...buckets.map(b => Math.max(0, b.bultos)));
  const barW = (W - pad * 2) / buckets.length;
  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-14">
        {buckets.map((b, i) => {
          const v = Math.max(0, b.bultos);
          const h = (v / maxV) * (H - pad * 2);
          const x = pad + i * barW;
          const y = H - pad - h;
          const isLast = i === buckets.length - 1;
          return (
            <rect
              key={i}
              x={x + 1}
              y={y}
              width={barW - 2}
              height={Math.max(1, h)}
              rx={2}
              className={isLast ? "fill-primary" : "fill-primary/40"}
            />
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums mt-1">
        <span>−2h</span>
        <span>−1h</span>
        <span>ahora</span>
      </div>
    </div>
  );
}

/* ── Manager dashboard (only for the two Rodrigos) ──────────────────── */

function ManagerDashboard({
  plan, counted,
  entradaBultos, traspaleoBultos, cargaBultos,
  sectionFilter, onToggleSectionFilter,
  sobra, falta, anomalies, activeCounters,
  recentEvents, lineNameByKey, lineImageByKey,
  onOpenAnomaly, onOpenAllActivity, onOpenLine,
}: {
  plan: number;
  counted: number;
  /** Same breakdown as LiveDashboard — when present, render Option-B
   *  cards so managers see descarga / traspaleo / carga at a glance.
   *  Cards become clickable when onToggleSectionFilter is provided. */
  entradaBultos?: number;
  traspaleoBultos?: number;
  cargaBultos?: number;
  sectionFilter?: "descarga" | "traspalear" | "carga" | null;
  onToggleSectionFilter?: (k: "descarga" | "traspalear" | "carga") => void;
  sobra: number;
  falta: number;
  anomalies: Array<{ line: CountableLine; kind: "sobra" | "falta"; delta: number }>;
  activeCounters: Array<{ actor_label: string; taps: number; last_tap: string }>;
  recentEvents: Array<{ id: number; delta: number; action: string; actor_label: string; created_at: string; line_key: string }>;
  lineNameByKey: Record<string, string>;
  lineImageByKey: Record<string, string | null>;
  onOpenAnomaly: (line_key: string) => void;
  onOpenAllActivity: () => void;
  onOpenLine: (line_key: string) => void;
}) {
  const pct = plan > 0 ? Math.min(100, Math.round((counted / plan) * 100)) : 0;
  const [showAnomalies, setShowAnomalies] = useState(false);

  return (
    <section className="border-2 border-primary/40 rounded-xl bg-primary/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-primary">Vista en vivo</h2>
          <p className="text-xs text-muted-foreground">Se actualiza al instante con cada conteo</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Progreso</div>
          <div className="text-2xl font-bold tabular-nums">{pct}%</div>
        </div>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full transition-all", pct === 100 ? "bg-emerald-500" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Plan</div>
          <div className="text-base font-bold tabular-nums">{fmtBultos(plan)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Contado</div>
          <div className="text-base font-bold tabular-nums">{fmtBultos(counted)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Restante</div>
          <div className="text-base font-bold tabular-nums">{fmtBultos(Math.max(0, plan - counted))}</div>
        </div>
      </div>

      {/* Breakdown cards moved to the portal header so all roles see them
          and own a single source of truth for the section filter. The
          KPI strip above (Plan / Contado / Restante) stays here. */}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {/* Anomalías */}
        <button
          onClick={() => setShowAnomalies(s => !s)}
          className={cn(
            "border rounded-lg p-3 text-left",
            (sobra > 0 || falta > 0) ? "border-red-500/40 bg-red-500/5" : "border-border/50",
          )}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Anomalías</span>
            <span className="text-[10px] text-muted-foreground">{showAnomalies ? "ocultar" : "ver"}</span>
          </div>
          <div className="flex gap-3">
            <div>
              <div className="text-[10px] text-amber-500">Sobra</div>
              <div className="text-base font-bold tabular-nums text-amber-500">{sobra > 0 ? `+${sobra}` : 0}</div>
            </div>
            <div>
              <div className="text-[10px] text-red-500">Falta</div>
              <div className="text-base font-bold tabular-nums text-red-500">{falta > 0 ? `-${falta}` : 0}</div>
            </div>
          </div>
        </button>

        {/* Contadores activos */}
        <div className="border rounded-lg p-3 border-border/50">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Quién está contando ahora</div>
          {activeCounters.length === 0 ? (
            <div className="text-xs text-muted-foreground">Nadie ha contado en los últimos 5 minutos</div>
          ) : (
            <ul className="text-xs space-y-0.5">
              {activeCounters.slice(0, 4).map(c => (
                <li key={c.actor_label} className="flex justify-between gap-2">
                  <span className="font-medium truncate">{c.actor_label}</span>
                  <span className="tabular-nums text-muted-foreground whitespace-nowrap">
                    +{c.taps} bulto{c.taps === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {showAnomalies && anomalies.length > 0 && (
        <div className="border-t border-border/50 pt-2 space-y-1">
          {anomalies.map((a, i) => (
            <button
              key={i}
              onClick={() => onOpenAnomaly(a.line.line_key)}
              className="w-full text-left flex items-center gap-2 px-2 py-1 rounded hover:bg-background/60"
            >
              <span className={cn(
                "text-[10px] font-bold px-1.5 py-0.5 rounded",
                a.kind === "sobra" ? "bg-amber-500 text-white" : "bg-red-500 text-white",
              )}>
                {a.kind === "sobra" ? `+${a.delta}` : `-${a.delta}`}
              </span>
              <span className="text-xs flex-1 truncate">{a.line.name}</span>
              <span className="text-[10px] text-muted-foreground">
                {a.line.section.kind === "carga" ? a.line.section.truck_label : a.line.section.delivery_code}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Actividad en vivo — last few events across all products. */}
      <div className="border rounded-lg p-3 border-border/50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Actividad en vivo</span>
          <button onClick={onOpenAllActivity} className="text-[10px] text-primary hover:underline">
            Ver toda la actividad →
          </button>
        </div>
        {recentEvents.length === 0 ? (
          <div className="text-xs text-muted-foreground">Sin actividad todavía.</div>
        ) : (
          <ul className="space-y-1.5">
            {recentEvents.map(ev => {
              const { label, color } = describeEvent(ev);
              const productName = lineNameByKey[ev.line_key] ?? "—";
              const productImg = lineImageByKey[ev.line_key] ?? null;
              return (
                <li key={ev.id}>
                  <button
                    onClick={() => onOpenLine(ev.line_key)}
                    className="w-full text-left flex items-center gap-2 text-xs hover:bg-background/60 rounded px-1 py-0.5"
                  >
                    <span className="text-muted-foreground tabular-nums shrink-0 w-14">
                      {format(new Date(ev.created_at), "HH:mm:ss")}
                    </span>
                    {productImg ? (
                      <img src={productImg} className="h-7 w-7 rounded object-contain bg-white shrink-0" alt="" />
                    ) : (
                      <div className="h-7 w-7 rounded bg-muted shrink-0" />
                    )}
                    <span className="font-semibold shrink-0 max-w-[80px] truncate">{ev.actor_label}</span>
                    <span className={cn("shrink-0", color)}>{label}</span>
                    <span className="text-muted-foreground truncate flex-1 text-right">{productName}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ── Section card on the list ───────────────────────────────────────── */

function SectionCard({ group, countOf, completedOf, isManager, canDrillIn, onOpenLine }: {
  group: { kind: "descarga" | "traspalear" | "carga"; title: string; subtitle: string; total: number; lines: CountableLine[] };
  countOf: (key: string, target: number) => number;
  completedOf: (key: string, target: number) => boolean;
  isManager: boolean;
  canDrillIn: boolean;
  onOpenLine: (key: string) => void;
}) {
  // Color palette MUST match the top breakdown cards (Descarga blue,
  // Traspaleo amber, Carga emerald). Used to be inverted (descarga
  // green, carga blue) which confused cargadores and the two Rodrigos
  // when they bounced their eyes between the top KPI cards and the
  // bottom section list.
  const styles = {
    descarga:   { border: "border-blue-500/40",    bg: "bg-blue-500/5",     text: "text-blue-700 dark:text-blue-400",       icon: <Warehouse className="h-5 w-5 text-blue-600" /> },
    traspalear: { border: "border-amber-500/40",   bg: "bg-amber-500/5",    text: "text-amber-700 dark:text-amber-400",     icon: <ArrowRight className="h-5 w-5 text-amber-600" /> },
    carga:      { border: "border-emerald-500/40", bg: "bg-emerald-500/5",  text: "text-emerald-700 dark:text-emerald-400", icon: <Truck className="h-5 w-5 text-emerald-600" /> },
  }[group.kind];

  return (
    <section className={cn("border-2 rounded-xl p-4 space-y-2", styles.border, styles.bg)}>
      <div className="flex items-center justify-between pb-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          {styles.icon}
          <div>
            <h2 className={cn("text-lg font-bold leading-tight", styles.text)}>{group.title}</h2>
            <p className="text-[11px] font-mono text-muted-foreground">{group.subtitle}</p>
          </div>
        </div>
        <span className="text-base font-bold tabular-nums">{fmtBultos(group.total)} bultos</span>
      </div>
      <div className="space-y-1.5">
        {group.lines.map(l => {
          const count = countOf(l.line_key, l.target);
          const done = completedOf(l.line_key, l.target);
          // Anomalies are only revealed to managers; cargadores never see counts.
          const sobra = count > l.target ? count - l.target : 0;
          const falta = done && count < l.target ? l.target - count : 0;
          const anomaly = isManager && (sobra > 0 || falta > 0);

          const Wrapper: any = canDrillIn ? "button" : "div";
          return (
            <Wrapper key={l.line_key}
              {...(canDrillIn ? { onClick: () => onOpenLine(l.line_key) } : {})}
              className={cn(
                "relative w-full flex items-stretch text-left rounded-lg bg-background/60 border overflow-hidden",
                canDrillIn && "hover:bg-background/90 transition-colors cursor-pointer",
                done && sobra === 0 && falta === 0 && "ring-2 ring-emerald-500/50 border-emerald-500/40",
                isManager && sobra > 0 && "ring-2 ring-amber-500/50 border-amber-500/40",
                isManager && falta > 0 && "ring-2 ring-red-500/50 border-red-500/40",
              )}>
              {/* Color strip on the left signals state without overlapping
                  any text. Width = 4px. */}
              {anomaly && (
                <div className={cn(
                  "w-1 shrink-0",
                  sobra > 0 ? "bg-amber-500" : "bg-red-500",
                )} />
              )}
              <div className="flex items-center gap-3 p-2 flex-1 min-w-0">
                {l.image_url ? (
                  <img src={l.image_url} className="h-12 w-12 rounded object-contain bg-white shrink-0" alt="" />
                ) : (
                  <div className="h-12 w-12 rounded bg-muted/50 shrink-0 flex items-center justify-center">
                    <Package className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{l.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    <span className="font-mono mr-2">{l.clave}</span>
                    {l.subtitle}
                  </div>
                  {/* Anomaly chip lives in its own row below the SKU so
                      it never overlaps the right-side count column. */}
                  {anomaly && (
                    <div className="mt-1">
                      <span className={cn(
                        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide",
                        sobra > 0 ? "bg-amber-500 text-white" : "bg-red-500 text-white",
                      )}>
                        {sobra > 0 ? `Sobra +${sobra}` : `Falta -${falta}`}
                      </span>
                    </div>
                  )}
                </div>
                {/* Right column: counters (counters/managers only) or just the
                    target (cargadores). */}
                <div className="flex flex-col items-end shrink-0">
                  {canDrillIn ? (
                    <>
                      <div className={cn(
                        "text-base font-bold tabular-nums leading-tight",
                        done && sobra === 0 && falta === 0 && "text-emerald-500",
                        sobra > 0 && "text-amber-500",
                        falta > 0 && "text-red-500",
                      )}>
                        {count}<span className="text-muted-foreground text-sm">/{l.target}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">×{l.target} bultos</div>
                    </>
                  ) : (
                    <div className="text-2xl font-extrabold tabular-nums leading-none">
                      ×{l.target}
                    </div>
                  )}
                </div>
              </div>
            </Wrapper>
          );
        })}
      </div>
    </section>
  );
}

/* ── DetailView (single-product counter) ────────────────────────────── */

function DetailView({
  line, count, completed, canCount, isManager, date,
  onBack, onIncrement, onOverride, onToggleComplete,
  theme, onToggleTheme,
  historyOpen, onToggleHistory, historyEvents,
  embedded = false,
}: {
  line: CountableLine;
  count: number;
  completed: boolean;
  canCount: boolean;
  isManager: boolean;
  date: string;
  onBack: () => void;
  onIncrement: (delta: 1 | -1) => void;
  onOverride: () => void;
  onToggleComplete: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  historyOpen: boolean;
  onToggleHistory: () => void;
  historyEvents: Array<{ id: number; delta: number; action: string; actor_label: string; created_at: string }>;
  embedded?: boolean;
}) {
  const missing = Math.max(0, line.target - count);
  const overflow = Math.max(0, count - line.target);
  const isFalta = completed && count < line.target;
  const sectionLabel = line.section.kind === "carga"
    ? `CARGA · ${line.section.truck_label}`
    : line.section.destination === "warehouse"
      ? `DESCARGA · ALMACÉN · ${line.section.delivery_code}`
      : `TRASPALEAR · ${line.section.delivery_code} → ${line.section.destination}`;

  // History state is owned by the parent (so it survives re-renders),
  // passed in as props.

  return (
    <div className={cn("flex flex-col text-foreground", embedded ? "" : "min-h-screen bg-background")}>
      <header className={cn("z-10 border-b", embedded ? "" : "sticky top-0 bg-card/95 backdrop-blur")}>
        <div className="max-w-xl mx-auto p-3 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" className="gap-1" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" /> Volver
          </Button>
          <p className="text-[11px] font-mono text-muted-foreground truncate flex-1 text-center">{sectionLabel}</p>
          {!embedded && <ThemeButton theme={theme} onToggle={onToggleTheme} />}
          {embedded && <div className="w-9" />}
        </div>
      </header>

      <main className="flex-1 max-w-xl w-full mx-auto px-4 py-6 flex flex-col items-center">
        {/* Product card */}
        <h1 className="text-2xl sm:text-3xl font-bold text-center tracking-tight mb-6 leading-tight">{line.name}</h1>
        <div className="w-full flex items-center justify-center gap-6 mb-8">
          {line.image_url ? (
            <img src={line.image_url} className="h-48 w-48 sm:h-56 sm:w-56 object-contain bg-white rounded-xl" alt="" />
          ) : (
            <div className="h-48 w-48 rounded-xl bg-muted flex items-center justify-center">
              <Package className="h-20 w-20 text-muted-foreground" />
            </div>
          )}
          <div className="text-5xl sm:text-6xl font-bold tabular-nums">×{line.target}</div>
        </div>

        {/* Counter row — canva-style. The +/- circles are locked once the
            line is marked Listo. The only way out of locked state is
            'Seguir contando' below. */}
        <div className="w-full flex items-center justify-center gap-6 sm:gap-10 mb-2">
          <button
            onClick={() => canCount && !completed && onIncrement(-1)}
            disabled={!canCount || completed || count <= 0}
            aria-label="Restar uno"
            className={cn(
              "h-28 w-28 sm:h-32 sm:w-32 rounded-full grid place-items-center shadow-lg transition-transform active:scale-95 leading-none",
              !canCount && "opacity-30 cursor-not-allowed",
              canCount && completed && "bg-muted text-muted-foreground/40 cursor-not-allowed shadow-none",
              canCount && !completed && count > 0 && "bg-red-500 hover:bg-red-600 text-white",
              canCount && !completed && count <= 0 && "bg-red-500/30 cursor-not-allowed text-white/60",
            )}
          >
            <Minus className="h-12 w-12 sm:h-14 sm:w-14 stroke-[3] block" strokeLinecap="round" />
          </button>

          <div className={cn(
            "text-5xl sm:text-6xl font-extrabold tabular-nums tracking-tight leading-none flex items-baseline",
            completed ? "text-emerald-500" : "",
          )}>
            {count}<span className="text-muted-foreground text-3xl sm:text-4xl leading-none">/{line.target}</span>
          </div>

          <button
            onClick={() => canCount && !completed && onIncrement(1)}
            disabled={!canCount || completed}
            aria-label="Sumar uno"
            className={cn(
              "h-28 w-28 sm:h-32 sm:w-32 rounded-full grid place-items-center shadow-lg transition-transform active:scale-95 leading-none",
              !canCount && "opacity-30 cursor-not-allowed",
              canCount && completed && "bg-emerald-500/30 text-white/60 cursor-not-allowed shadow-none",
              canCount && !completed && "bg-emerald-500 hover:bg-emerald-600 text-white",
            )}
          >
            {completed
              ? <Check className="h-12 w-12 sm:h-14 sm:w-14 stroke-[3] block" strokeLinecap="round" />
              : <Plus  className="h-12 w-12 sm:h-14 sm:w-14 stroke-[3] block" strokeLinecap="round" />}
          </button>
        </div>

        {/* Lock state hint — visible only when locked. */}
        {canCount && completed && (
          <div className="text-center text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-4 mt-2">
            🔒 Conteo bloqueado · presiona "Seguir contando" para reabrir
          </div>
        )}

        {/* Footer stats */}
        <div className="w-full grid grid-cols-2 gap-4 max-w-md mb-6">
          <div className="text-center">
            <div className="text-sm text-muted-foreground font-medium">Contado</div>
            <div className="text-3xl font-bold tabular-nums">{count}</div>
          </div>
          <div className="text-center">
            <div className="text-sm text-muted-foreground font-medium">{missing > 0 ? "Falta" : "Listo"}</div>
            <div className={cn("text-3xl font-bold tabular-nums", missing > 0 ? "text-red-500" : "text-emerald-500")}>
              {missing > 0 ? missing : <Check className="h-8 w-8 inline" />}
            </div>
          </div>
        </div>

        {/* Anomaly indicators (managers only). Reserved slot - never shifts. */}
        {isManager && (
          <div className="h-6 flex items-center justify-center mt-2">
            {overflow > 0 ? (
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-amber-500 text-white">
                Sobra +{overflow}
              </span>
            ) : isFalta ? (
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-red-500 text-white">
                Falta -{missing}
              </span>
            ) : null}
          </div>
        )}

        {/* Primary action — full-width, bigger so it's the obvious next step. */}
        {canCount && (
          <div className="w-full max-w-md flex flex-col gap-2 mt-3">
            <Button
              variant={completed ? "outline" : "default"}
              className={cn(
                "w-full h-14 text-base font-semibold gap-2 rounded-xl",
                completed
                  ? "border-2 border-amber-500/60 text-amber-600 hover:bg-amber-500/10"
                  : "bg-emerald-500 hover:bg-emerald-600 text-white border-0",
              )}
              onClick={onToggleComplete}
            >
              {completed ? <Edit3 className="h-5 w-5" /> : <Check className="h-5 w-5" />}
              {completed ? "Seguir contando" : "Terminé de contar"}
            </Button>
            {isManager && (
              <div className="flex gap-2 justify-center">
                <Button variant="outline" size="sm" className="gap-1" onClick={onOverride}>
                  <Edit3 className="h-4 w-4" /> Editar conteo
                </Button>
                <Button variant="ghost" size="sm" className="gap-1" onClick={onToggleHistory}>
                  {historyOpen ? "Ocultar historial" : "Ver historial"}
                </Button>
              </div>
            )}
          </div>
        )}

        {!canCount && (
          <p className="text-xs text-muted-foreground mt-4 text-center">
            Solo los contadores pueden actualizar este número.
          </p>
        )}

        {/* Per-line audit log (managers only). No loading state — events
            persist across re-renders and stream in via realtime. */}
        {isManager && historyOpen && (
          <div className="w-full max-w-md mt-6 border-2 rounded-xl p-4 space-y-3">
            <h3 className="text-base font-bold">Historial de conteo</h3>
            {historyEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin eventos.</p>
            ) : (
              <ul className="space-y-2 max-h-96 overflow-y-auto">
                {historyEvents.map(ev => {
                  const { label, color } = describeEvent(ev);
                  return (
                    <li key={ev.id} className="flex items-start gap-3 border-b border-border/40 pb-2 last:border-0">
                      <div className="text-xs text-muted-foreground tabular-nums shrink-0 pt-0.5 w-14">
                        {format(new Date(ev.created_at), "HH:mm:ss")}
                      </div>
                      {line.image_url ? (
                        <img src={line.image_url} alt="" className="h-10 w-10 rounded object-contain bg-white shrink-0" />
                      ) : (
                        <div className="h-10 w-10 rounded bg-muted shrink-0 grid place-items-center">
                          <Package className="h-5 w-5 text-muted-foreground/50" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{ev.actor_label}</div>
                        <div className={cn("text-sm font-medium", color)}>{label}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

/* ── Theme button ────────────────────────────────────────────────────── */

/* ───────────────────────── Tiempo de jornada pill ─────────────────────────
 * Small chip shown in the portal header once the day has started.
 * Format: "Iniciado a las 8:14 · 0h 36min"
 * Auto-updates because the parent passes a fresh nowMs every minute.
 */
function JornadaPill({ startedAtMs, nowMs }: { startedAtMs: number; nowMs: number }) {
  const startDate = new Date(startedAtMs);
  const hh = String(startDate.getHours()).padStart(2, "0");
  const mm = String(startDate.getMinutes()).padStart(2, "0");
  const totalMin = Math.max(0, Math.floor((nowMs - startedAtMs) / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const elapsed = h > 0 ? `${h}h ${m}min` : `${m}min`;
  return (
    <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-xs font-semibold">
      <Activity className="h-3.5 w-3.5" />
      <span>Iniciado {hh}:{mm}</span>
      <span className="opacity-60">·</span>
      <span className="tabular-nums">{elapsed} de jornada</span>
    </div>
  );
}

function ThemeButton({ theme, onToggle }: { theme: "light" | "dark"; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
      title={theme === "dark" ? "Cambiar a claro" : "Cambiar a oscuro"}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

/* ── UnlockDialog ────────────────────────────────────────────────────── */

function UnlockDialog({ open, onClose, onUnlock }: {
  open: boolean;
  onClose: () => void;
  onUnlock: (s: Session) => void;
}) {
  const [stage, setStage] = useState<"pin" | "name">("pin");
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState<{ role: Session["role"]; display_name: string } | null>(null);

  useEffect(() => { if (open) { setPin(""); setName(""); setError(null); setStage("pin"); setVerified(null); } }, [open]);

  const submitPin = async () => {
    if (pin.length < 4) return;
    setBusy(true); setError(null);
    try {
      const { data, error } = await (supabase as any).rpc("maniobra_portal_verify_pin", { p_pin: pin });
      if (error) throw error;
      if (!data) { setError("PIN incorrecto"); setBusy(false); return; }
      const role: Session["role"] = data.role;
      const display = data.display_name as string;
      if (role === "contador") {
        setVerified({ role, display_name: display });
        setStage("name");
      } else {
        onUnlock({ role, display_name: display, unlocked_at: Date.now() });
      }
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  };

  const submitName = () => {
    if (!verified) return;
    const finalName = name.trim() || verified.display_name;
    onUnlock({ role: verified.role, display_name: finalName, unlocked_at: Date.now() });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> Desbloquear</DialogTitle>
          <DialogDescription>
            {stage === "pin" ? "Ingresa tu PIN para activar contador o manager." : "¿Cómo te llamas? Aparecerá en el registro de conteo."}
          </DialogDescription>
        </DialogHeader>

        {stage === "pin" ? (
          <>
            <Input
              type="password" inputMode="numeric" maxLength={6}
              value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && submitPin()}
              autoFocus placeholder="••••"
              className="h-14 text-center text-2xl tracking-widest font-mono"
            />
            {error && <p className="text-xs text-red-500 text-center">{error}</p>}
            <Button onClick={submitPin} disabled={busy || pin.length < 4} className="w-full">
              {busy ? "Verificando…" : "Continuar"}
            </Button>
          </>
        ) : (
          <>
            <Input
              value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitName()}
              autoFocus placeholder="Tu nombre"
              className="h-12 text-center text-lg"
            />
            <Button onClick={submitName} className="w-full">Empezar a contar</Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── OverrideDialog ──────────────────────────────────────────────────────
 *
 * Bottom-sheet wheel picker, mirroring the customer portal cart UX. The
 * manager scrolls the wheel (or taps the +/- buttons / delta chips) to
 * land on the absolute count they want, then taps Guardar to commit via
 * `maniobra_portal_set_count`. Only commits on Guardar — intermediate
 * scroll positions don't fire events.
 */

const OVERRIDE_WHEEL_MAX = 2000;
const OVERRIDE_ITEM_HEIGHT = 56;
const OVERRIDE_VISIBLE_ROWS = 3;
const OVERRIDE_DELTA_CHIPS = [-100, -50, -10, +10, +50, +100] as const;

function OverrideDialog({ line, currentCount, onSave, onClose }: {
  line: CountableLine; currentCount: number; onSave: (n: number) => void; onClose: () => void;
}) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const [quantity, setQuantity] = useState(Math.max(0, currentCount));
  const ignoreScrollUntil = useRef(0);

  const scrollWheelTo = (n: number, smooth = true) => {
    if (!wheelRef.current) return;
    const clamped = Math.min(OVERRIDE_WHEEL_MAX, Math.max(0, n));
    ignoreScrollUntil.current = Date.now() + 450;
    wheelRef.current.scrollTo({
      top: clamped * OVERRIDE_ITEM_HEIGHT,
      behavior: smooth ? "smooth" : "auto",
    });
  };

  const setQtyFromControl = (n: number) => {
    const next = Math.min(OVERRIDE_WHEEL_MAX, Math.max(0, n));
    setQuantity(next);
    scrollWheelTo(next);
  };

  useEffect(() => {
    const q = Math.max(0, currentCount);
    setQuantity(q);
    requestAnimationFrame(() => scrollWheelTo(q, false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line.line_key]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const handleScroll = () => {
    if (!wheelRef.current) return;
    if (Date.now() < ignoreScrollUntil.current) return;
    const idx = Math.round(wheelRef.current.scrollTop / OVERRIDE_ITEM_HEIGHT);
    const next = Math.min(OVERRIDE_WHEEL_MAX, Math.max(0, idx));
    setQuantity((prev) => (prev === next ? prev : next));
  };

  const submit = () => {
    // Apply optimistically + broadcast in the parent, then close
    // immediately. RPC fires in the background — no spinner, no wait.
    onSave(quantity);
    onClose();
  };

  const padRows = Math.floor(OVERRIDE_VISIBLE_ROWS / 2);
  const padHeight = padRows * OVERRIDE_ITEM_HEIGHT;
  const wheelHeight = OVERRIDE_VISIBLE_ROWS * OVERRIDE_ITEM_HEIGHT;
  const delta = quantity - currentCount;

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm animate-in fade-in"
        onClick={onClose}
      />
      <div
        className="fixed inset-x-0 bottom-0 z-[60] rounded-t-3xl shadow-2xl animate-in slide-in-from-bottom flex flex-col bg-card text-foreground"
        style={{ maxHeight: "88dvh" }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1 shrink-0">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Header */}
        <div className="px-4 pt-2 pb-3 flex items-center gap-3 border-b border-border shrink-0">
          <div className="shrink-0 w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden bg-muted">
            {line.image_url ? (
              <img src={line.image_url} alt="" className="w-full h-full object-contain p-1" />
            ) : (
              <Package className="h-7 w-7 text-muted-foreground/50" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Editar conteo</p>
            <h3 className="text-sm font-semibold leading-tight line-clamp-2">{line.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Plan {fmtBultos(line.target)} · contado actual {fmtBultos(currentCount)}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 p-2 rounded-full bg-muted text-muted-foreground hover:bg-muted/80"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Middle */}
        <div
          className="flex-1 min-h-0 overflow-y-auto no-scrollbar"
          style={{ overscrollBehavior: "contain" }}
        >
          {/* Wheel */}
          <div className="relative mx-4 mt-3">
            {/* Center highlight */}
            <div
              className="absolute left-0 right-0 pointer-events-none rounded-2xl border-2 bg-primary/10 border-primary/40"
              style={{ top: padHeight, height: OVERRIDE_ITEM_HEIGHT }}
            />
            {/* Top fade */}
            <div
              className="absolute left-0 right-0 top-0 pointer-events-none z-10 bg-gradient-to-b from-card via-card/70 to-transparent"
              style={{ height: padHeight }}
            />
            {/* Bottom fade */}
            <div
              className="absolute left-0 right-0 bottom-0 pointer-events-none z-10 bg-gradient-to-t from-card via-card/70 to-transparent"
              style={{ height: padHeight }}
            />

            <div
              ref={wheelRef}
              onScroll={handleScroll}
              className="overflow-y-scroll no-scrollbar"
              style={{
                height: wheelHeight,
                scrollSnapType: "y proximity",
                scrollPaddingTop: padHeight,
                WebkitOverflowScrolling: "touch",
                overscrollBehavior: "contain",
                touchAction: "pan-y",
              }}
            >
              <div style={{ height: padHeight }} />
              {Array.from({ length: OVERRIDE_WHEEL_MAX + 1 }, (_, i) => i).map((n) => {
                const isSelected = n === quantity;
                return (
                  <div
                    key={n}
                    style={{ height: OVERRIDE_ITEM_HEIGHT, scrollSnapAlign: "start" }}
                    className={cn(
                      "flex items-center justify-center font-bold tabular-nums",
                      isSelected ? "opacity-0" : "text-muted-foreground/50 text-xl"
                    )}
                  >
                    {n}
                  </div>
                );
              })}
              <div style={{ height: padHeight }} />
            </div>

            {/* Center overlay: -/+ buttons + N bultos */}
            <div
              className="absolute left-0 right-0 flex items-center justify-between px-3 z-20 pointer-events-none"
              style={{ top: padHeight, height: OVERRIDE_ITEM_HEIGHT }}
            >
              <button
                onClick={() => setQtyFromControl(quantity - 1)}
                disabled={quantity <= 0}
                aria-label="Menos uno"
                className="pointer-events-auto p-2 rounded-full active:scale-90 transition disabled:opacity-30 shadow-sm bg-background text-primary border border-border"
                style={{ touchAction: "manipulation" }}
              >
                <Minus className="h-5 w-5" />
              </button>
              <div className="font-bold tabular-nums text-2xl select-none text-primary">
                {fmtBultos(quantity)} {quantity === 1 ? "bulto" : "bultos"}
              </div>
              <button
                onClick={() => setQtyFromControl(quantity + 1)}
                disabled={quantity >= OVERRIDE_WHEEL_MAX}
                aria-label="Más uno"
                className="pointer-events-auto p-2 rounded-full active:scale-90 transition disabled:opacity-30 shadow-sm bg-background text-primary border border-border"
                style={{ touchAction: "manipulation" }}
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
          </div>

          <p className="text-center text-[11px] mt-2 mb-2 text-muted-foreground">
            Desliza la rueda o usa los atajos de abajo
          </p>

          {/* Delta chips */}
          <div className="px-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
            {OVERRIDE_DELTA_CHIPS.map((d) => {
              const disabled = quantity + d < 0 || quantity + d > OVERRIDE_WHEEL_MAX;
              return (
                <button
                  key={d}
                  onClick={() => setQtyFromControl(quantity + d)}
                  disabled={disabled}
                  className={cn(
                    "shrink-0 px-3.5 py-2 rounded-full text-sm font-bold border transition",
                    "bg-card border-border text-foreground hover:bg-muted",
                    "disabled:opacity-30",
                    d > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
                  )}
                >
                  {d > 0 ? `+${d}` : d}
                </button>
              );
            })}
          </div>

          {/* Jump chips: plan target + zero */}
          <div className="px-4 pb-3 flex gap-2 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setQtyFromControl(line.target)}
              className={cn(
                "shrink-0 px-4 py-2 rounded-full text-sm font-semibold border transition",
                quantity === line.target
                  ? "bg-primary border-primary text-primary-foreground"
                  : "bg-card border-border text-foreground hover:bg-muted",
              )}
            >
              Plan ({fmtBultos(line.target)})
            </button>
            <button
              onClick={() => setQtyFromControl(currentCount)}
              className={cn(
                "shrink-0 px-4 py-2 rounded-full text-sm font-semibold border transition",
                quantity === currentCount
                  ? "bg-primary border-primary text-primary-foreground"
                  : "bg-card border-border text-foreground hover:bg-muted",
              )}
            >
              Actual ({fmtBultos(currentCount)})
            </button>
            <button
              onClick={() => setQtyFromControl(0)}
              className={cn(
                "shrink-0 px-4 py-2 rounded-full text-sm font-semibold border transition",
                quantity === 0
                  ? "bg-primary border-primary text-primary-foreground"
                  : "bg-card border-border text-foreground hover:bg-muted",
              )}
            >
              0
            </button>
          </div>
        </div>

        {/* Sticky footer */}
        <div
          className="shrink-0 px-4 pt-3 border-t border-border bg-card flex gap-2"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
        >
          <Button variant="outline" onClick={onClose} className="flex-1 h-12">Cancelar</Button>
          <Button
            onClick={submit}
            disabled={quantity === currentCount}
            className="flex-[2] h-12 text-base font-semibold"
          >
            {delta === 0 ? "Guardar" : `Guardar (${delta > 0 ? "+" : ""}${delta})`}
          </Button>
        </div>
      </div>
    </>
  );
}
