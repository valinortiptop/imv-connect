// @ts-nocheck
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  UserPlus,
  Upload,
  Phone,
  MessageCircle,
  Search,
  Loader2,
  Users2,
  CheckCircle2,
  X,
  Copy,
  Calendar as CalIcon,
  Sparkles as SparklesIcon,
  Users,
  TrendingUp,
  CheckCircle,
  UserCheck,
  SearchCheck,
  MapPin as MapPinIcon,
  Trash2,
  Check,
  Clock as ClockIcon,
  MoreHorizontal,
  Pencil,
  Plus,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { cn, titleCase, userLabel } from "@/lib/utils";
import { useTx } from "@/lib/translate";
import * as XLSX from "xlsx-js-style";
import { format } from "date-fns";
import { es as esLocale } from "date-fns/locale";

/* ───────────────────────── Types & constants ───────────────────────── */

type ProspectStatus =
  | "nuevo"
  | "contactado"
  | "interesado"
  | "portal_enviado"
  | "primer_pedido"
  | "cliente_activo"
  | "descartado";

type CallOutcome =
  | "no_contesto"
  | "buzon"
  | "interesado"
  | "no_interesado"
  | "numero_equivocado"
  | "no_existe"
  | "ya_compra_con_otro"
  | "pidio_seguimiento"
  | "portal_enviado"
  | "primer_pedido_colocado";

interface Prospect {
  id: string;
  phone: string | null;
  name: string | null;
  /** Owner / person who answered the phone — separate from the
   *  business name in `name`. */
  contact_person: string | null;
  municipio: string | null;
  colonia: string | null;
  direccion: string | null;
  status: ProspectStatus;
  source: string | null;
  assigned_to: string | null;
  notes: string | null;
  converted_client_id: string | null;
  created_at: string;
  updated_at: string;
  enriched_at?: string | null;
  enrichment_status?: string | null;
  place_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  rating?: number | null;
  review_count?: number | null;
  website?: string | null;
  business_status?: string | null;
  opening_hours?: string[] | null;
  description?: string | null;
  google_maps_url?: string | null;
  manual_maps_url?: string | null;
  primary_type?: string | null;
  price_level?: string | null;
  photo_url?: string | null;
}

interface ProspectCall {
  id: string;
  prospect_id: string;
  called_at: string;
  outcome: CallOutcome;
  notes: string | null;
  next_action_at: string | null;
  created_by: string | null;
}

interface Profile {
  id: string;
  email: string | null;
  full_name?: string | null;
}

const STATUS_LABELS: Record<ProspectStatus, string> = {
  nuevo: "Nuevo",
  contactado: "Contactado",
  interesado: "Interesado",
  portal_enviado: "Portal enviado",
  primer_pedido: "Primer pedido",
  cliente_activo: "Cliente activo",
  descartado: "Descartado",
};

const STATUS_COLORS: Record<ProspectStatus, string> = {
  nuevo: "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700",
  contactado: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
  interesado: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800",
  portal_enviado: "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800",
  primer_pedido: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800",
  cliente_activo: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
  descartado: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",
};

function ProspectStatusBadge({ status }: { status: ProspectStatus }) {
  return (
    <Badge variant="outline" className={cn("text-xs font-medium", STATUS_COLORS[status])}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

const OUTCOME_LABELS: Record<CallOutcome, string> = {
  no_contesto: "No contestó",
  buzon: "Buzón de voz",
  interesado: "Interesado",
  no_interesado: "No interesado",
  numero_equivocado: "Número equivocado",
  no_existe: "No existe",
  ya_compra_con_otro: "Ya compra con otro",
  pidio_seguimiento: "Pidió seguimiento",
  portal_enviado: "Portal enviado",
  primer_pedido_colocado: "Primer pedido colocado",
};

/* ───────────────────────── Helpers ───────────────────────── */

/**
 * Normalize a Mexican phone number to the canonical +52XXXXXXXXXX format.
 * Returns null if the number is invalid (not 10 digits after country code).
 */
export function normalizePhone(raw: string): { value: string | null; reason: string } {
  if (!raw) return { value: null, reason: "vacío" };
  const digits = raw.replace(/\D/g, "");
  let ten = digits;
  if (ten.startsWith("521") && ten.length === 13) ten = ten.slice(3); // 521NNNNNNNNNN
  else if (ten.startsWith("52") && ten.length === 12) ten = ten.slice(2);
  else if (ten.startsWith("1") && ten.length === 11) ten = ten.slice(1);
  if (ten.length !== 10) return { value: null, reason: `esperado 10 dígitos, tiene ${ten.length}` };
  return { value: `+52${ten}`, reason: "" };
}

/** Cell values that mean "no phone given" — show up a lot in messy
 *  spreadsheets. Treated as empty so they don't pollute the invalid list. */
const PHONE_BLANK_VALUES = new Set([
  "-", "–", "—", "n/a", "n/e", "ne", "n/d", "nd", "s/n", "sn", ".", "—",
]);

/**
 * Robust phone-cell parser for the importer:
 *   - Treats common "no phone" placeholders ("-", "N/E", "N/A", etc.) as empty
 *   - Splits cells with multiple numbers on /, comma, semicolon, ' y ', ' o '
 *     and uses the first one that validates
 *   - Returns `{ kind: "blank" }` for skip-silently cases (no error noise)
 *   - Returns `{ kind: "valid"; value }` on success
 *   - Returns `{ kind: "invalid"; reason }` only for rows that actually look
 *     like a phone but don't validate (so the invalid list is short and
 *     actionable)
 */
export function parsePhoneCell(raw: unknown):
  | { kind: "blank" }
  | { kind: "valid"; value: string }
  | { kind: "invalid"; reason: string }
{
  if (raw == null) return { kind: "blank" };
  // Excel numeric cells arrive as numbers — preserve digits, drop trailing .0
  const s = (typeof raw === "number" ? String(Math.trunc(raw)) : String(raw)).trim();
  if (!s) return { kind: "blank" };
  if (PHONE_BLANK_VALUES.has(s.toLowerCase())) return { kind: "blank" };
  // No digits at all = stray header / label like "Contacto" — skip silently.
  if (!/\d/.test(s)) return { kind: "blank" };

  // Multiple phones in one cell? Split and try each.
  const parts = s.split(/[/,;]| y | o /i).map(p => p.trim()).filter(Boolean);
  for (const part of parts) {
    const n = normalizePhone(part);
    if (n.value) return { kind: "valid", value: n.value };
  }
  // Nothing matched — return reason from the first attempt.
  const firstReason = normalizePhone(parts[0] ?? s).reason || "no válido";
  return { kind: "invalid", reason: firstReason };
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  return format(d, "dd MMM yy", { locale: esLocale });
}

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  return format(d, "dd MMM yy, HH:mm", { locale: esLocale });
}

function humanPhone(p: string): string {
  // +5215567890123 → +52 55 6789 0123
  if (!p.startsWith("+52") || p.length !== 13) return p;
  return `${p.slice(0, 3)} ${p.slice(3, 5)} ${p.slice(5, 9)} ${p.slice(9)}`;
}

const DAY_ES: Record<string, string> = {
  Monday: "Lunes",
  Tuesday: "Martes",
  Wednesday: "Miércoles",
  Thursday: "Jueves",
  Friday: "Viernes",
  Saturday: "Sábado",
  Sunday: "Domingo",
};
function translateDayToEs(day: string): string {
  return DAY_ES[day.trim()] ?? day;
}

/** Build a Google Maps URL for an enriched prospect — prefers place_id, then
 *  lat/lng, then a name+address text query. Returns null if we don't have
 *  enough data to point at anything. */
function googleMapsUrl(p: {
  manual_maps_url?: string | null;
  google_maps_url?: string | null;
  place_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  name?: string | null;
  direccion?: string | null;
}): string | null {
  if (p.manual_maps_url) return p.manual_maps_url;
  if (p.google_maps_url) return p.google_maps_url;
  if (p.place_id) return `https://www.google.com/maps/place/?q=place_id:${p.place_id}`;
  if (p.lat != null && p.lng != null) return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
  if (p.name || p.direccion) {
    const q = [p.name, p.direccion].filter(Boolean).join(" ");
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  }
  return null;
}

// Mobile devices open the WhatsApp app via wa.me. Desktop browsers without
// the app installed get prompted to download it instead, so we send them to
// web.whatsapp.com which opens an existing logged-in session.
function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function waLink(phone: string, text?: string): string {
  const num = phone.replace(/\D/g, "");
  const encoded = text ? encodeURIComponent(text) : "";
  if (isMobileDevice()) {
    return `https://wa.me/${num}${encoded ? `?text=${encoded}` : ""}`;
  }
  return `https://web.whatsapp.com/send?phone=${num}${encoded ? `&text=${encoded}` : ""}`;
}

/* ───────────────────────── Main page ───────────────────────── */

export default function Prospects({ scopeToMe = false }: { scopeToMe?: boolean } = {}) {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const tx = useTx();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProspectStatus | "all" | "pending_action">("all");
  const [enrichedFilter, setEnrichedFilter] = useState<"all" | "enriched" | "not_enriched">("all");
  const [muniFilter, setMuniFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [mineOnly, setMineOnly] = useState(scopeToMe);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Detail dialog: store only the prospect id and resolve the fresh
  // record from the prospects query on every render. Storing a
  // snapshot caused the assignee/status Selects to glitch — after
  // mutating, the query refetched but the cached snapshot was still
  // stale, so the controlled `value` mismatched what Radix had set.
  const [detailId, setDetailId] = useState<string | null>(null);
  // Resolved live prospect for the dialog. We pull from the query
  // cache and remember the last good value so a transient
  // `prospects` empty state during refetch doesn't unmount the
  // dialog (which would replay open animations and flash the UI).
  const lastDetailRef = useRef<Prospect | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  // "Agregar contacto" mini-dialog. When opened from a list-tab pill we
  // pre-fill the source so the new prospect lands in that list directly.
  const [newContactSource, setNewContactSource] = useState<string | null>(null);
  const [newContactOpen, setNewContactOpen] = useState(false);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [enrichOpen, setEnrichOpen] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  /* ── Queries ── */
  const { data: prospects = [], isLoading } = useQuery({
    queryKey: ["prospects"],
    queryFn: async (): Promise<Prospect[]> => {
      const { data, error } = await (supabase as any)
        .from("prospects")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Prospect[];
    },
  });

  // Live prospect for the detail dialog. Resolves from the prospects
  // query each render so mutations are reflected. Falls back to the
  // last good value if a transient refetch returns nothing — that's
  // what kept the dialog from flashing open/closed during updates.
  const detailProspect = useMemo<Prospect | null>(() => {
    if (!detailId) {
      lastDetailRef.current = null;
      return null;
    }
    const found = prospects.find((p) => p.id === detailId) ?? null;
    if (found) lastDetailRef.current = found;
    return found ?? lastDetailRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailId, prospects]);

  const { data: callsByProspect = {} } = useQuery({
    queryKey: ["prospect-calls-index"],
    queryFn: async (): Promise<Record<string, { last: string | null; next: string | null; latestCallId: string | null; count: number }>> => {
      const { data, error } = await (supabase as any)
        .from("prospect_calls")
        .select("id, prospect_id, called_at, next_action_at")
        .order("called_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as { id: string; prospect_id: string; called_at: string; next_action_at: string | null }[];
      // For each prospect, the LATEST call (most recent called_at)
      // dictates the active follow-up date. Older calls are
      // superseded — their next_action_at no longer matters.
      // Without this rule the "seguimientos hoy" pill would never
      // clear because some old call still pointed at today.
      const map: Record<string, { last: string | null; next: string | null; latestCallId: string | null; count: number }> = {};
      for (const r of rows) {
        const cur = map[r.prospect_id] || { last: null, next: null, latestCallId: null, count: 0 };
        cur.count++;
        if (!cur.last || r.called_at > cur.last) {
          cur.last = r.called_at;
          // Whenever we promote a new "latest" call, replace the
          // active next_action_at with whatever that call carries.
          cur.next = r.next_action_at;
          cur.latestCallId = r.id;
        }
        map[r.prospect_id] = cur;
      }
      return map;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-for-prospects"],
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await (supabase as any).rpc("get_assignable_users");
      if (error) {
        console.warn("get_assignable_users failed", error);
        return [];
      }
      return (data ?? []) as Profile[];
    },
  });

  /* ── Derived ── */
  const municipios = useMemo(() => {
    const set = new Set<string>();
    for (const p of prospects) if (p.municipio) set.add(p.municipio);
    return Array.from(set).sort();
  }, [prospects]);

  const sources = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of prospects) {
      const key = p.source || "Sin lista";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [prospects]);

  const counters = useMemo(() => {
    return {
      nuevos: prospects.filter((p) => p.status === "nuevo").length,
      contactados: prospects.filter((p) => p.status === "contactado").length,
      interesados: prospects.filter((p) => p.status === "interesado").length,
      convertidos: prospects.filter((p) => p.status === "cliente_activo").length,
      total: prospects.length,
    };
  }, [prospects]);

  const todayISO = new Date().toISOString();

  const pendingActionIds = useMemo(() => {
    const s = new Set<string>();
    for (const [id, v] of Object.entries(callsByProspect)) {
      if (v.next && v.next <= todayISO) s.add(id);
    }
    return s;
  }, [callsByProspect, todayISO]);

  const filtered = useMemo(() => {
    let list = prospects;
    if (mineOnly && user) list = list.filter((p) => p.assigned_to === user.id);
    if (muniFilter !== "all") list = list.filter((p) => p.municipio === muniFilter);
    if (sourceFilter !== "all") {
      list = list.filter((p) =>
        sourceFilter === "__none__" ? !p.source : p.source === sourceFilter
      );
    }
    if (statusFilter === "pending_action") {
      list = list.filter((p) => pendingActionIds.has(p.id));
    } else if (statusFilter !== "all") {
      list = list.filter((p) => p.status === statusFilter);
    }
    if (enrichedFilter === "enriched") {
      list = list.filter((p) => !!p.enriched_at && p.enrichment_status !== "no_match");
    } else if (enrichedFilter === "not_enriched") {
      list = list.filter((p) => !p.enriched_at || p.enrichment_status === "no_match");
    }
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          (p.phone || "").toLowerCase().includes(s) ||
          (p.name || "").toLowerCase().includes(s) ||
          (p.colonia || "").toLowerCase().includes(s) ||
          (p.municipio || "").toLowerCase().includes(s) ||
          (p.source || "").toLowerCase().includes(s)
      );
    }
    return list;
  }, [prospects, mineOnly, user, muniFilter, sourceFilter, statusFilter, search, pendingActionIds, enrichedFilter]);

  // Reset to page 1 when filters change
  useMemo(() => setPage(1), [search, statusFilter, muniFilter, sourceFilter, mineOnly]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page]);

  /* ── Mutations ── */
  const bulkAssignMut = useMutation({
    mutationFn: async ({ ids, userId }: { ids: string[]; userId: string | null }) => {
      const { error } = await (supabase as any)
        .from("prospects")
        .update({ assigned_to: userId })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast({ title: "Asignación actualizada", description: `${vars.ids.length} prospectos` });
      qc.invalidateQueries({ queryKey: ["prospects"] });
      setSelectedIds(new Set());
      setBulkAssignOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateProspectMut = useMutation({
    mutationFn: async (patch: Partial<Prospect> & { id: string }) => {
      const { id, ...fields } = patch;
      const { error } = await (supabase as any)
        .from("prospects")
        .update(fields)
        .eq("id", id);
      if (error) throw error;
    },
    // Optimistic update: patch the prospects cache immediately. Since
    // the patch is exactly what the server will store, no post-success
    // invalidation is needed — the extra refetch was reordering the
    // array (order by updated_at desc) and replacing every row's
    // reference, which is what kept making the dialog flash.
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ["prospects"] });
      const prev = qc.getQueryData<Prospect[]>(["prospects"]);
      if (prev) {
        qc.setQueryData<Prospect[]>(["prospects"], prev.map((p) =>
          p.id === patch.id ? { ...p, ...patch } : p,
        ));
      }
      return { prev };
    },
    onError: (err: any, _patch, ctx) => {
      if (ctx?.prev) qc.setQueryData(["prospects"], ctx.prev);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Update the next_action_at on a specific call row. Used by:
  //   1. The per-call calendar popover in the dialog history (Fix 3b)
  //   2. The Hecho/Posponer buttons on the prospect row when the amber
  //      filter is active (Fix 3c) — those target the LATEST call's id.
  //   3. The bulk Hecho/Posponer items on the amber pill menu (Fix 3d).
  // Pass `null` to clear the follow-up.
  const updateCallNextMut = useMutation({
    mutationFn: async ({ callId, nextAt }: { callId: string; nextAt: string | null }) => {
      const { error } = await (supabase as any)
        .from("prospect_calls")
        .update({ next_action_at: nextAt })
        .eq("id", callId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prospect-calls-index"] });
      qc.invalidateQueries({ queryKey: ["prospect-calls"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Bulk variant for the pill menu — single round-trip per call.
  const bulkUpdateCallNextMut = useMutation({
    mutationFn: async ({ callIds, nextAt }: { callIds: string[]; nextAt: string | null }) => {
      if (callIds.length === 0) return;
      const { error } = await (supabase as any)
        .from("prospect_calls")
        .update({ next_action_at: nextAt })
        .in("id", callIds);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prospect-calls-index"] });
      qc.invalidateQueries({ queryKey: ["prospect-calls"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  /**
   * Bump the latest call's next_action_at by N days from today (or null to
   * clear). Convenience wrapper used by row + bulk buttons. Always anchors
   * to local noon so the date survives UTC offset (same trick the
   * "Registrar llamada" form uses).
   */
  const dateAtNoonPlusDays = (days: number | null): string | null => {
    if (days === null) return null;
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + days);
    return d.toISOString();
  };

  // Delete every prospect that belongs to a given list (source label).
  // Pass `null` to delete the "Sin lista" bucket. Cascades will clean up
  // the call history too (prospect_calls FK is ON DELETE CASCADE). Also
  // posts a row into the global notifications table so the team sees in
  // the bell who deleted what.
  const [deleteListLabel, setDeleteListLabel] = useState<string | null>(null);
  const deleteListMut = useMutation({
    mutationFn: async (label: string) => {
      const count = prospects.filter(p =>
        label === "__none__" ? !p.source : p.source === label,
      ).length;

      const q = (supabase as any).from("prospects").delete();
      const { error } = label === "__none__"
        ? await q.is("source", null)
        : await q.eq("source", label);
      if (error) throw error;

      // Best-effort notification post — never block the UX if it fails.
      try {
        const who = user?.email ? user.email.split("@")[0] : "alguien";
        const listName = label === "__none__" ? "Sin lista" : label;
        await (supabase as any).from("notifications").insert({
          type: "prospect_list_deleted",
          category: "sistema",
          priority: "important",
          title: `${who} borró la lista "${listName}"`,
          description: `Se eliminaron ${count} prospecto${count === 1 ? "" : "s"} junto con su historial de llamadas.`,
          route: "/prospectos",
        });
      } catch { /* non-fatal */ }

      return count;
    },
    onSuccess: (count, label) => {
      toast({
        title: "Lista eliminada",
        description: `${count} prospecto${count === 1 ? "" : "s"} de "${label === "__none__" ? "Sin lista" : label}"`,
      });
      qc.invalidateQueries({ queryKey: ["prospects"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      setSourceFilter("all");
      setDeleteListLabel(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setDeleteListLabel(null);
    },
  });

  /* ── Render ── */
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((p) => p.id)));
  };

  const isAdminOrVentas = role === "admin" || role === "ventas";

  if (!isAdminOrVentas) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4 text-center">
        <h1 className="text-xl font-semibold">Sin acceso</h1>
        <p className="text-sm text-muted-foreground mt-2">
          No tienes permiso para ver Prospectos.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserPlus className="h-6 w-6 text-blue-600" />
            {tx("Prospectos")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {tx("Pipeline de clientes potenciales · llamadas, seguimientos y conversión.")}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {selectedIds.size > 0 && (
            <Button variant="outline" onClick={() => setBulkAssignOpen(true)} className="gap-2">
              <Users2 className="h-4 w-4" />
              {tx("Asignar")} ({selectedIds.size})
            </Button>
          )}
          <Button variant="outline" onClick={() => exportCSV(filtered)} className="gap-2">
            <Upload className="h-4 w-4 rotate-180" />
            {tx("Exportar CSV")}
          </Button>
          <Button variant="outline" onClick={() => setEnrichOpen(true)} className="gap-2">
            <SearchCheck className="h-4 w-4" />
            {tx("Enriquecer con Google")}
          </Button>
          <Button variant="outline" onClick={() => { setNewContactSource(null); setNewContactOpen(true); }} className="gap-2">
            <UserPlus className="h-4 w-4" />
            {tx("Nuevo prospecto")}
          </Button>
          <Button onClick={() => setImportOpen(true)} className="gap-2">
            <Upload className="h-4 w-4" />
            {tx("Importar lista")}
          </Button>

        </div>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <CounterCard
          icon={<Users className="h-4 w-4 text-blue-400" />}
          tone="bg-blue-500/10"
          label={tx("Total")}
          value={counters.total}
          numClass="text-foreground"
          active={statusFilter === "all"}
          ringColor="ring-primary/50"
          onClick={() => setStatusFilter("all")}
        />
        <CounterCard
          icon={<UserPlus className="h-4 w-4 text-slate-400" />}
          tone="bg-slate-500/10"
          label={tx("Nuevos")}
          value={counters.nuevos}
          numClass="text-slate-200"
          active={statusFilter === "nuevo"}
          ringColor="ring-slate-500/50"
          onClick={() => setStatusFilter(statusFilter === "nuevo" ? "all" : "nuevo")}
        />
        <CounterCard
          icon={<UserCheck className="h-4 w-4 text-blue-400" />}
          tone="bg-blue-500/10"
          label={tx("Contactados")}
          value={counters.contactados}
          numClass="text-blue-400"
          active={statusFilter === "contactado"}
          ringColor="ring-blue-500/50"
          onClick={() => setStatusFilter(statusFilter === "contactado" ? "all" : "contactado")}
        />
        <CounterCard
          icon={<TrendingUp className="h-4 w-4 text-amber-400" />}
          tone="bg-amber-500/10"
          label={tx("Interesados")}
          value={counters.interesados}
          numClass="text-amber-400"
          active={statusFilter === "interesado"}
          ringColor="ring-amber-500/50"
          onClick={() => setStatusFilter(statusFilter === "interesado" ? "all" : "interesado")}
        />
        <CounterCard
          icon={<CheckCircle className="h-4 w-4 text-emerald-400" />}
          tone="bg-emerald-500/10"
          label={tx("Convertidos")}
          value={counters.convertidos}
          numClass="text-emerald-400"
          active={statusFilter === "cliente_activo"}
          ringColor="ring-emerald-500/50"
          onClick={() => setStatusFilter(statusFilter === "cliente_activo" ? "all" : "cliente_activo")}
        />
      </div>

      {/* Pending-action pill — stays visible as a subtle reminder; clicking
          toggles the filter on/off so the user can always escape back to
          the full list (tap any counter card OR the pill again).
          The adjacent ⋯ menu lets you bulk-act on every pending follow-up
          in one click (snooze them all by N days, mark all done). Useful
          when the morning surfaces 24 follow-ups and you need to clear
          the noise fast. */}
      {pendingActionIds.size > 0 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setStatusFilter(statusFilter === "pending_action" ? "all" : "pending_action")
            }
            aria-pressed={statusFilter === "pending_action"}
            className={cn(
              "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              statusFilter === "pending_action"
                ? "bg-amber-500 text-white border-amber-500 ring-2 ring-amber-500/40"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/40 hover:bg-amber-500/20",
            )}
          >
            <CalIcon className="h-3.5 w-3.5" />
            <span className="tabular-nums">
              {pendingActionIds.size} {pendingActionIds.size === 1 ? "seguimiento" : "seguimientos"} hoy
            </span>
            {statusFilter === "pending_action" && (
              <span className="ml-1 opacity-90">· toca para volver</span>
            )}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center justify-center h-7 w-7 rounded-full border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-300"
                title="Acciones en masa"
                aria-label="Acciones en masa"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="text-xs">
                Aplicar a los {pendingActionIds.size}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  const ids = [...pendingActionIds]
                    .map((pid) => callsByProspect[pid]?.latestCallId)
                    .filter((x): x is string => !!x);
                  bulkUpdateCallNextMut.mutate({ callIds: ids, nextAt: dateAtNoonPlusDays(1) });
                  toast({ title: `Pospuestos +1 día`, description: `${ids.length} seguimientos` });
                }}
              >
                Posponer todos +1 día
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const ids = [...pendingActionIds]
                    .map((pid) => callsByProspect[pid]?.latestCallId)
                    .filter((x): x is string => !!x);
                  bulkUpdateCallNextMut.mutate({ callIds: ids, nextAt: dateAtNoonPlusDays(3) });
                  toast({ title: `Pospuestos +3 días`, description: `${ids.length} seguimientos` });
                }}
              >
                Posponer todos +3 días
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const ids = [...pendingActionIds]
                    .map((pid) => callsByProspect[pid]?.latestCallId)
                    .filter((x): x is string => !!x);
                  bulkUpdateCallNextMut.mutate({ callIds: ids, nextAt: dateAtNoonPlusDays(7) });
                  toast({ title: `Pospuestos +1 semana`, description: `${ids.length} seguimientos` });
                }}
              >
                Posponer todos +1 semana
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  if (!confirm(`¿Marcar como hechos los ${pendingActionIds.size} seguimientos? Esto borra la fecha del seguimiento de cada llamada — las notas quedan intactas.`)) return;
                  const ids = [...pendingActionIds]
                    .map((pid) => callsByProspect[pid]?.latestCallId)
                    .filter((x): x is string => !!x);
                  bulkUpdateCallNextMut.mutate({ callIds: ids, nextAt: null });
                  toast({ title: `Marcados como hechos`, description: `${ids.length} seguimientos` });
                }}
                className="text-emerald-600 focus:text-emerald-600"
              >
                Marcar todos como hechos
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* List (source) tabs */}
      {sources.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSourceFilter("all")}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              sourceFilter === "all"
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-background hover:bg-muted border-border text-foreground"
            )}
          >
            Todas las listas · {prospects.length}
          </button>
          {sources.map(([label, count]) => {
            const value = label === "Sin lista" ? "__none__" : label;
            const active = sourceFilter === value;
            return (
              <div
                key={label}
                className={cn(
                  "inline-flex items-center rounded-full border transition-colors overflow-hidden",
                  active
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-background hover:bg-muted border-border text-foreground",
                )}
              >
                <button
                  onClick={() => setSourceFilter(value)}
                  className="px-3 py-1.5 text-xs font-medium"
                >
                  {label} · {count}
                </button>
                {/* Active-only inline actions: Add contact + Delete list.
                    Add-contact opens the small NuevoContactoDialog with
                    source pre-filled, so a single new phone joins this
                    list without re-uploading a CSV. Trash deletes the
                    whole list (kept). */}
                {active && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setNewContactSource(label === "Sin lista" ? null : label);
                        setNewContactOpen(true);
                      }}
                      title="Agregar contacto a esta lista"
                      aria-label="Agregar contacto a esta lista"
                      className="px-2 py-1.5 hover:bg-blue-700 text-white border-l border-white/20"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteListLabel(value);
                      }}
                      title="Borrar esta lista"
                      aria-label="Borrar esta lista"
                      className="px-2 py-1.5 hover:bg-red-500/30 text-white border-l border-white/20"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <Label className="text-xs">{tx("Buscar")}</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Teléfono, nombre, colonia…"
                className="pl-8"
              />
            </div>
          </div>
          <div className="w-[200px]">
            <Label className="text-xs">{tx("Estado")}</Label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending_action">Seguimiento hoy</SelectItem>
                {(Object.keys(STATUS_LABELS) as ProspectStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[200px]">
            <Label className="text-xs">{tx("Municipio")}</Label>
            <Select value={muniFilter} onValueChange={setMuniFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {municipios.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[200px]">
            <Label className="text-xs">{tx("Enriquecimiento")}</Label>
            <Select value={enrichedFilter} onValueChange={(v) => setEnrichedFilter(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="enriched">
                  Enriquecidos ({prospects.filter((p) => !!p.enriched_at && p.enrichment_status !== "no_match").length})
                </SelectItem>
                <SelectItem value="not_enriched">
                  Sin enriquecer ({prospects.filter((p) => !p.enriched_at || p.enrichment_status === "no_match").length})
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pb-1.5">
            <Checkbox
              id="mine"
              checked={mineOnly}
              onCheckedChange={(v) => setMineOnly(!!v)}
            />
            <Label htmlFor="mine" className="text-sm cursor-pointer">Asignados a mí</Label>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr className="text-muted-foreground border-b border-border">
                <th className="py-3 px-3 w-10">
                  <Checkbox
                    checked={selectedIds.size > 0 && selectedIds.size === filtered.length}
                    onCheckedChange={toggleSelectAll}
                  />
                </th>
                <th className="py-3 px-3 text-left font-medium text-xs uppercase tracking-wide">{tx("Teléfono")}</th>
                <th className="py-3 px-3 text-left font-medium text-xs uppercase tracking-wide">{tx("Nombre")}</th>
                <th className="py-3 px-3 text-left font-medium text-xs uppercase tracking-wide">{tx("Municipio / Colonia")}</th>
                <th className="py-3 px-3 text-left font-medium text-xs uppercase tracking-wide">{tx("Estado")}</th>
                {sourceFilter === "all" && (
                  <th className="py-3 px-3 text-left font-medium text-xs uppercase tracking-wide">{tx("Lista")}</th>
                )}
                <th className="py-3 px-3 text-left font-medium text-xs uppercase tracking-wide">{tx("Última llamada")}</th>
                <th className="py-3 px-3 text-left font-medium text-xs uppercase tracking-wide">{tx("Próximo seguimiento")}</th>
                <th className="py-3 px-3 text-left font-medium text-xs uppercase tracking-wide">{tx("Asignado")}</th>
                <th className="py-3 px-3 w-24 font-medium text-xs uppercase tracking-wide">{tx("Acciones")}</th>
              </tr>
            </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={sourceFilter === "all" ? 10 : 9} className="py-8 text-center text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Cargando…
                    </td>
                  </tr>
                )}
                {!isLoading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={sourceFilter === "all" ? 10 : 9} className="py-8 text-center text-muted-foreground">
                      Sin prospectos. Haz clic en <b>Importar lista</b> para empezar.
                    </td>
                  </tr>
                )}
                {pagedRows.map((p) => {
                  const callInfo = callsByProspect[p.id];
                  const assignedProfile = profiles.find((u) => u.id === p.assigned_to);
                  return (
                    <tr
                      key={p.id}
                      className="border-t hover:bg-muted/30 cursor-pointer"
                      onClick={(e) => {
                        // don't trigger from checkbox/button clicks
                        if ((e.target as HTMLElement).closest("button,input")) return;
                        setDetailId(p.id);
                      }}
                    >
                      <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(p.id)}
                          onCheckedChange={() => toggleSelect(p.id)}
                        />
                      </td>
                      <td className="py-2 px-3 font-mono text-xs whitespace-nowrap">
                        {p.phone ? humanPhone(p.phone) : (
                          <span className="italic text-muted-foreground">Sin teléfono</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <div>{p.name || <span className="text-muted-foreground italic">—</span>}</div>
                        {p.contact_person && (
                          <div className="text-[11px] text-muted-foreground truncate max-w-[220px]">
                            {p.contact_person}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <div>{p.municipio || <span className="text-muted-foreground">—</span>}</div>
                        {p.colonia && (
                          <div className="text-[11px] text-muted-foreground">{p.colonia}</div>
                        )}
                      </td>
                      <td className="py-2 px-3 w-[150px]" onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={p.status}
                          onValueChange={(v) => {
                            if (v === p.status) return;
                            updateProspectMut.mutate({ id: p.id, status: v as ProspectStatus });
                          }}
                        >
                          <SelectTrigger className="h-7 w-[130px] border-0 bg-transparent p-0 shadow-none ring-0 focus:ring-0 focus:ring-offset-0 [&>svg]:hidden">
                            <ProspectStatusBadge status={p.status} />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(STATUS_LABELS) as ProspectStatus[]).map((s) => (
                              <SelectItem key={s} value={s}>
                                <ProspectStatusBadge status={s} />
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      {sourceFilter === "all" && (
                        <td className="py-2 px-3 text-xs">
                          {p.source ? (
                            <span className="text-muted-foreground">{p.source}</span>
                          ) : (
                            <span className="text-muted-foreground italic">—</span>
                          )}
                        </td>
                      )}
                      <td className="py-2 px-3 text-xs">{fmtDate(callInfo?.last)}</td>
                      <td className="py-2 px-3 text-xs">
                        {callInfo?.next ? (
                          <span
                            className={cn(
                              callInfo.next <= todayISO && "text-yellow-700 font-semibold"
                            )}
                          >
                            {fmtDate(callInfo.next)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-xs">
                        {assignedProfile ? (
                          userLabel(assignedProfile)
                        ) : p.assigned_to ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className="italic text-muted-foreground">Sin asignar</span>
                        )}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1">
                          {/* Quick follow-up actions — only meaningful
                              while the user is filtered to "Seguimiento
                              hoy". Hecho clears the latest call's
                              next_action_at; Posponer bumps it forward. */}
                          {statusFilter === "pending_action" && callInfo?.latestCallId && (
                            <>
                              <button
                                type="button"
                                onClick={() => updateCallNextMut.mutate({ callId: callInfo.latestCallId!, nextAt: null })}
                                disabled={updateCallNextMut.isPending}
                                className="p-1.5 rounded hover:bg-emerald-500/15 text-emerald-600"
                                title="Hecho — quita el seguimiento"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    className="p-1.5 rounded hover:bg-amber-500/15 text-amber-600"
                                    title="Posponer"
                                  >
                                    <ClockIcon className="h-4 w-4" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44">
                                  <DropdownMenuLabel className="text-xs">Posponer a…</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => updateCallNextMut.mutate({ callId: callInfo.latestCallId!, nextAt: dateAtNoonPlusDays(1) })}
                                  >
                                    Mañana (+1 día)
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => updateCallNextMut.mutate({ callId: callInfo.latestCallId!, nextAt: dateAtNoonPlusDays(3) })}
                                  >
                                    En 3 días
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => updateCallNextMut.mutate({ callId: callInfo.latestCallId!, nextAt: dateAtNoonPlusDays(7) })}
                                  >
                                    En 1 semana
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => updateCallNextMut.mutate({ callId: callInfo.latestCallId!, nextAt: dateAtNoonPlusDays(14) })}
                                  >
                                    En 2 semanas
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </>
                          )}
                          {p.phone ? (
                            <>
                              <a
                                href={`tel:${p.phone}`}
                                className="p-1.5 rounded hover:bg-muted"
                                title="Llamar"
                              >
                                <Phone className="h-4 w-4 text-blue-600" />
                              </a>
                              <a
                                href={waLink(p.phone)}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 rounded hover:bg-muted"
                                title="WhatsApp"
                              >
                                <MessageCircle className="h-4 w-4 text-green-600" />
                              </a>
                            </>
                          ) : (
                            <>
                              <span className="p-1.5 rounded opacity-30 cursor-not-allowed" title="Sin teléfono">
                                <Phone className="h-4 w-4" />
                              </span>
                              <span className="p-1.5 rounded opacity-30 cursor-not-allowed" title="Sin teléfono">
                                <MessageCircle className="h-4 w-4" />
                              </span>
                            </>
                          )}
                          {(() => {
                            const url = googleMapsUrl(p);
                            if (!url) return null;
                            return (
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 rounded hover:bg-muted"
                                title="Ver en Google Maps"
                              >
                                <MapPinIcon className="h-4 w-4 text-red-500" />
                              </a>
                            );
                          })()}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length > pageSize && (
            <div className="border-t flex items-center justify-between px-4 py-3 text-sm">
              <div className="text-muted-foreground">
                Mostrando {(page - 1) * pageSize + 1}–{Math.min(filtered.length, page * pageSize)} de {filtered.length}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage(1)}
                >
                  «
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ‹ Anterior
                </Button>
                <span className="text-xs text-muted-foreground px-2">
                  Página {page} de {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Siguiente ›
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage(totalPages)}
                >
                  »
                </Button>
              </div>
            </div>
          )}
      </div>

      {/* Detail drawer — resolve the prospect from the live query on
          every render so any in-flight mutation (optimistic) reflects
          back into controlled <Select> values. Memoized so the
          reference only changes when the actual prospect data does,
          avoiding spurious dialog re-mounts. */}
      <ProspectDetailDrawer
        prospect={detailProspect}
        onClose={() => setDetailId(null)}
        onUpdate={(patch) => detailId && updateProspectMut.mutate({ id: detailId, ...patch })}
        profiles={profiles}
      />

      {/* Import dialog */}
      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        defaultAssignee={user?.id ?? null}
        profiles={profiles}
      />

      {/* Single-prospect "Agregar contacto" dialog. Pre-fills source
          when launched from an active list pill — so a new phone for
          "Iztapalapa" lands in that list without a CSV roundtrip. */}
      <NuevoContactoDialog
        open={newContactOpen}
        onClose={() => setNewContactOpen(false)}
        defaultSource={newContactSource}
        defaultAssignee={user?.id ?? null}
      />

      {/* Bulk assign dialog */}
      <BulkAssignDialog
        open={bulkAssignOpen}
        onClose={() => setBulkAssignOpen(false)}
        count={selectedIds.size}
        profiles={profiles}
        onAssign={(userId) => bulkAssignMut.mutate({ ids: Array.from(selectedIds), userId })}
        saving={bulkAssignMut.isPending}
      />

      {/* Google Places enrichment dialog */}
      <EnrichDialog
        open={enrichOpen}
        onClose={() => setEnrichOpen(false)}
        prospects={prospects}
      />

      {/* Delete-list confirmation */}
      <AlertDialog open={!!deleteListLabel} onOpenChange={(o) => !o && !deleteListMut.isPending && setDeleteListLabel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Borrar lista completa</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteListLabel && (
                <>
                  Vas a eliminar <b>{prospects.filter(p => deleteListLabel === "__none__" ? !p.source : p.source === deleteListLabel).length}</b>{" "}
                  prospectos de la lista{" "}
                  <b>{deleteListLabel === "__none__" ? "Sin lista" : deleteListLabel}</b>.
                  <br /><br />
                  Esto también borrará el historial de llamadas asociado. Esta acción no se puede deshacer.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteListMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteListMut.isPending}
              onClick={() => {
                if (deleteListLabel) deleteListMut.mutate(deleteListLabel);
              }}
              className="bg-red-500 hover:bg-red-600"
            >
              {deleteListMut.isPending ? "Borrando…" : "Borrar lista"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ───────────────────────── Counter card ───────────────────────── */
function CounterCard({
  icon,
  tone,
  label,
  value,
  numClass,
  active,
  ringColor,
  onClick,
}: {
  icon: React.ReactNode;
  tone: string;
  label: string;
  value: number;
  numClass: string;
  active?: boolean;
  ringColor?: string;
  onClick?: () => void;
}) {
  const Wrapper: any = onClick ? "button" : "div";
  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        "border border-border rounded-lg bg-card/50 flex flex-col text-center overflow-hidden transition-colors",
        onClick && "hover:bg-card",
        active && ringColor && `ring-2 ${ringColor}`
      )}
    >
      <div className="px-5 pt-4 pb-2 flex items-center justify-center gap-2">
        <div className={cn("p-1.5 rounded-md", tone)}>{icon}</div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      </div>
      <div className="pb-4 pt-1 flex flex-col items-center justify-center">
        <p className={cn("text-2xl font-bold", numClass)}>{value.toLocaleString("es-MX")}</p>
      </div>
    </Wrapper>
  );
}

/* ───────────────────────── Editable phone in dialog header ─────────────────────────
 * Inline phone editor for the prospect dialog. Renders the human-formatted
 * phone with a Pencil icon by default; click to swap into an input. Saves
 * on blur/Enter via normalizePhone — invalid input is rejected with a
 * toast instead of corrupting the data. Replaces the previous "static
 * label + Copy icon" header where you couldn't fix wrong numbers without
 * touching SQL.
 */
function PhoneEditor({
  value,
  onChange,
  onCopy,
}: {
  value: string | null;
  onChange: (newValue: string | null) => void;
  onCopy: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => { setDraft(value ?? ""); }, [value]);
  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      onChange(null);
      setEditing(false);
      return;
    }
    const r = normalizePhone(trimmed);
    if (!r.value) {
      toast({ title: "Teléfono inválido", description: r.reason || "Revisa el formato", variant: "destructive" });
      return;
    }
    onChange(r.value);
    setEditing(false);
  };
  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); }
        }}
        className="h-8 max-w-[220px] font-mono text-base"
        placeholder="+52 55 1234 5678"
      />
    );
  }
  return (
    <>
      {value ? (
        <span>{humanPhone(value)}</span>
      ) : (
        <span className="italic text-muted-foreground text-sm">Sin teléfono</span>
      )}
      <button
        onClick={() => setEditing(true)}
        className="p-1 rounded hover:bg-muted"
        title="Editar"
      >
        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {value && (
        <button
          onClick={onCopy}
          className="p-1 rounded hover:bg-muted"
          title="Copiar"
        >
          <Copy className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      )}
    </>
  );
}

/* ───────────────────────── Detail drawer ───────────────────────── */
function ProspectDetailDrawer({
  prospect,
  onClose,
  onUpdate,
  profiles,
}: {
  prospect: Prospect | null;
  onClose: () => void;
  onUpdate: (patch: Partial<Prospect>) => void;
  profiles: Profile[];
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const [localName, setLocalName] = useState("");
  const [localContactPerson, setLocalContactPerson] = useState("");
  const [localMuni, setLocalMuni] = useState("");
  const [localColonia, setLocalColonia] = useState("");
  const [localDireccion, setLocalDireccion] = useState("");
  const [localNotes, setLocalNotes] = useState("");
  const [localMapsUrl, setLocalMapsUrl] = useState("");

  // Call-logging form
  const [logOutcome, setLogOutcome] = useState<CallOutcome>("no_contesto");
  const [logNotes, setLogNotes] = useState("");
  const [logNext, setLogNext] = useState<string>("");
  const [confirmDelete, setConfirmDelete] = useState<ProspectCall | null>(null);

  useMemo(() => {
    if (prospect) {
      setLocalName(prospect.name ?? "");
      setLocalContactPerson(prospect.contact_person ?? "");
      setLocalMuni(prospect.municipio ?? "");
      setLocalColonia(prospect.colonia ?? "");
      setLocalDireccion(prospect.direccion ?? "");
      setLocalMapsUrl(prospect.manual_maps_url ?? "");
      setLocalNotes(prospect.notes ?? "");
      setLogOutcome("no_contesto");
      setLogNotes("");
      setLogNext("");
    }
  }, [prospect?.id]);

  const { data: calls = [] } = useQuery({
    queryKey: ["prospect-calls", prospect?.id],
    queryFn: async (): Promise<ProspectCall[]> => {
      if (!prospect) return [];
      const { data, error } = await (supabase as any)
        .from("prospect_calls")
        .select("*")
        .eq("prospect_id", prospect.id)
        .order("called_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProspectCall[];
    },
    enabled: !!prospect,
  });

  const deleteCallMut = useMutation({
    mutationFn: async (callId: string) => {
      const { error } = await (supabase as any)
        .from("prospect_calls")
        .delete()
        .eq("id", callId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prospect-calls", prospect?.id] });
      qc.invalidateQueries({ queryKey: ["prospect-calls-index"] });
      toast({ title: "Llamada eliminada" });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Edit a single call's next_action_at without touching the rest of the
  // row. Powers the per-call calendar popover in the history list — no
  // more "delete the whole call to fix the date" loss-of-notes pattern.
  const updateCallDateMut = useMutation({
    mutationFn: async ({ callId, nextAt }: { callId: string; nextAt: string | null }) => {
      const { error } = await (supabase as any)
        .from("prospect_calls")
        .update({ next_action_at: nextAt })
        .eq("id", callId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prospect-calls", prospect?.id] });
      qc.invalidateQueries({ queryKey: ["prospect-calls-index"] });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const logCallMut = useMutation({
    mutationFn: async () => {
      if (!prospect) return;
      const { error } = await (supabase as any).from("prospect_calls").insert({
        prospect_id: prospect.id,
        outcome: logOutcome,
        notes: logNotes.trim() || null,
        // Anchor to local noon so the date survives UTC conversion.
        // `new Date("2026-04-30")` is parsed as UTC midnight, which
        // becomes 18:00 the previous day in CDMX — that's why picking
        // a date used to save it as one day earlier.
        next_action_at: logNext ? new Date(`${logNext}T12:00:00`).toISOString() : null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;

      // Status transition heuristics
      const nextStatus: ProspectStatus | null =
        logOutcome === "interesado" ? "interesado" :
        logOutcome === "portal_enviado" ? "portal_enviado" :
        logOutcome === "primer_pedido_colocado" ? "primer_pedido" :
        logOutcome === "numero_equivocado" || logOutcome === "no_existe" || logOutcome === "ya_compra_con_otro" || logOutcome === "no_interesado"
          ? "descartado" :
        prospect.status === "nuevo" ? "contactado" :
        null;
      if (nextStatus && nextStatus !== prospect.status) {
        await (supabase as any).from("prospects").update({ status: nextStatus }).eq("id", prospect.id);
      }
    },
    onSuccess: () => {
      toast({ title: "Llamada registrada" });
      qc.invalidateQueries({ queryKey: ["prospect-calls", prospect?.id] });
      qc.invalidateQueries({ queryKey: ["prospect-calls-index"] });
      qc.invalidateQueries({ queryKey: ["prospects"] });
      setLogNotes("");
      setLogNext("");
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (!prospect) return null;

  const flushField = (key: keyof Prospect, value: string | null) => {
    onUpdate({ [key]: value } as Partial<Prospect>);
  };

  const firstContactMsg = `Hola, te escribo de Distribuidora ADM — mayoreo de alimento para perro y gato (marcas Ganador y Minino). ¿Tienes un minuto para platicar de precios?`;

  return (
    <Dialog open={!!prospect} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[95vw] sm:max-w-[1100px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-base">
            <PhoneEditor
              value={prospect.phone}
              onChange={(newPhone) => onUpdate({ phone: newPhone })}
              onCopy={() => {
                if (!prospect.phone) return;
                navigator.clipboard.writeText(prospect.phone);
                toast({ title: "Teléfono copiado" });
              }}
            />
          </DialogTitle>
          <DialogDescription>
            {prospect.source ? `Lista: ${prospect.source}` : "Prospecto"}
          </DialogDescription>
        </DialogHeader>

        {/* Two-column layout */}
        <div className="flex flex-col md:flex-row gap-6 mt-2">
          {/* LEFT — core info + log call */}
          <div className="flex-1 space-y-4">
            {/* Quick actions */}
            <div className="flex gap-2">
              <Button asChild={!!prospect.phone} variant="outline" className="flex-1 gap-2" disabled={!prospect.phone}>
                {prospect.phone ? (
                  <a href={`tel:${prospect.phone}`}>
                    <Phone className="h-4 w-4" />
                    Llamar
                  </a>
                ) : (
                  <span><Phone className="h-4 w-4" />Llamar</span>
                )}
              </Button>
              <Button asChild={!!prospect.phone} variant="outline" className="flex-1 gap-2" disabled={!prospect.phone}>
                {prospect.phone ? (
                  <a href={waLink(prospect.phone, firstContactMsg)} target="_blank" rel="noreferrer">
                    <MessageCircle className="h-4 w-4" />
                    WhatsApp
                  </a>
                ) : (
                  <span><MessageCircle className="h-4 w-4" />WhatsApp</span>
                )}
              </Button>
              {(() => {
                const url = googleMapsUrl(prospect);
                if (!url) return null;
                return (
                  <Button asChild variant="outline" className="flex-1 gap-2">
                    <a href={url} target="_blank" rel="noreferrer">
                      <MapPinIcon className="h-4 w-4 text-red-500" />
                      Maps
                    </a>
                  </Button>
                );
              })()}
            </div>

            {/* Google Places info panel — only shown if enriched */}
            {prospect.enriched_at && prospect.enrichment_status !== "no_match" && (
              <div className="rounded-lg border bg-muted/30 overflow-hidden">
                {prospect.photo_url && (
                  <div className="w-full aspect-[16/9] bg-muted">
                    <img
                      src={prospect.photo_url}
                      alt={prospect.name ?? ""}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                )}
                <div className="p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {prospect.business_status && prospect.business_status !== "OPERATIONAL" && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-500/15 text-red-600 border border-red-500/30">
                        {prospect.business_status === "CLOSED_PERMANENTLY"
                          ? "Cerrado permanentemente"
                          : "Cerrado temporalmente"}
                      </span>
                    )}
                    {prospect.primary_type && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] bg-muted border">
                        {prospect.primary_type}
                      </span>
                    )}
                    {prospect.rating != null && (
                      <span className="text-[11px] text-muted-foreground">
                        ⭐ {prospect.rating} ({prospect.review_count ?? 0})
                      </span>
                    )}
                    {prospect.price_level && (
                      <span className="text-[11px] text-muted-foreground">
                        {prospect.price_level === "PRICE_LEVEL_INEXPENSIVE" && "$"}
                        {prospect.price_level === "PRICE_LEVEL_MODERATE" && "$$"}
                        {prospect.price_level === "PRICE_LEVEL_EXPENSIVE" && "$$$"}
                        {prospect.price_level === "PRICE_LEVEL_VERY_EXPENSIVE" && "$$$$"}
                      </span>
                    )}
                  </div>
                  {prospect.description && (
                    <p className="text-xs text-foreground italic">"{prospect.description}"</p>
                  )}
                  {prospect.website && (
                    <p className="text-xs">
                      <span className="text-muted-foreground">URL: </span>
                      <a
                        href={prospect.website}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-500 hover:underline break-all"
                      >
                        {prospect.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                      </a>
                    </p>
                  )}
                  {Array.isArray(prospect.opening_hours) && prospect.opening_hours.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none flex items-center gap-1.5">
                        <CalIcon className="h-3.5 w-3.5" />
                        Horario
                      </summary>
                      <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 pl-1">
                        {prospect.opening_hours.map((line, i) => {
                          // Lines from Places API are like "Monday: 8:30 AM – 9:00 PM"
                          const m = line.match(/^([^:]+):\s*(.+)$/);
                          const day = m?.[1] ?? line;
                          const hours = m?.[2] ?? "";
                          const dayEs = translateDayToEs(day);
                          return (
                            <Fragment key={i}>
                              <span className="text-muted-foreground">{dayEs}</span>
                              <span className="text-foreground tabular-nums">{hours}</span>
                            </Fragment>
                          );
                        })}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            )}

            {/* Status + assigned */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Estado</Label>
                <Select
                  value={prospect.status}
                  onValueChange={(v) => flushField("status", v)}
                >
                  <SelectTrigger>
                    <SelectValue>
                      <ProspectStatusBadge status={prospect.status} />
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_LABELS) as ProspectStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        <ProspectStatusBadge status={s} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Asignado a</Label>
                <Select
                  value={prospect.assigned_to ?? "__unassigned__"}
                  onValueChange={(v) => flushField("assigned_to", v === "__unassigned__" ? null : v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unassigned__">Sin asignar</SelectItem>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {userLabel(p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Editable fields */}
            <div className="grid grid-cols-1 gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Nombre del negocio</Label>
                  <Input
                    value={localName}
                    onChange={(e) => setLocalName(e.target.value)}
                    onBlur={() => flushField("name", localName || null)}
                    placeholder="Abarrotes La Estrella…"
                  />
                </div>
                <div>
                  <Label className="text-xs">Contacto (dueño / quien contestó)</Label>
                  <Input
                    value={localContactPerson}
                    onChange={(e) => setLocalContactPerson(e.target.value)}
                    onBlur={() => flushField("contact_person", localContactPerson || null)}
                    placeholder="Don Juan, María, …"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Municipio</Label>
                  <Input
                    value={localMuni}
                    onChange={(e) => setLocalMuni(e.target.value)}
                    onBlur={() => flushField("municipio", localMuni || null)}
                    placeholder="Naucalpan de Juárez"
                  />
                </div>
                <div>
                  <Label className="text-xs">Colonia</Label>
                  <Input
                    value={localColonia}
                    onChange={(e) => setLocalColonia(e.target.value)}
                    onBlur={() => flushField("colonia", localColonia || null)}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Dirección</Label>
                <Input
                  value={localDireccion}
                  onChange={(e) => setLocalDireccion(e.target.value)}
                  onBlur={() => flushField("direccion", localDireccion || null)}
                  placeholder="Calle, número, referencias…"
                />
              </div>
              <div>
                <Label className="text-xs flex items-center gap-1.5">
                  <MapPinIcon className="h-3.5 w-3.5 text-red-500" />
                  Google Maps (manual)
                </Label>
                <Input
                  value={localMapsUrl}
                  onChange={(e) => setLocalMapsUrl(e.target.value)}
                  onBlur={() => flushField("manual_maps_url" as any, localMapsUrl || null)}
                  placeholder="Pega la URL de Google Maps (https://maps.app.goo.gl/…)"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Se usa cuando el botón <b>Maps</b> arriba se abre en lugar del enlace automático.
                </p>
              </div>
              <div>
                <Label className="text-xs">Notas</Label>
                <Textarea
                  value={localNotes}
                  onChange={(e) => setLocalNotes(e.target.value)}
                  onBlur={() => flushField("notes", localNotes || null)}
                  rows={3}
                  placeholder="Horarios preferidos, objeciones, referencias…"
                />
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="hidden md:block w-px bg-border" />

          {/* RIGHT — register call + history */}
          <div className="flex-1 space-y-4 flex flex-col min-h-0">
            <div className="rounded-lg border p-4 space-y-3">
              <h3 className="font-semibold text-sm">Registrar llamada</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Resultado</Label>
                  <Select value={logOutcome} onValueChange={(v) => setLogOutcome(v as CallOutcome)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(OUTCOME_LABELS) as CallOutcome[]).map((o) => (
                        <SelectItem key={o} value={o}>{OUTCOME_LABELS[o]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Próximo seguimiento</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          "w-full h-11 md:h-10 justify-start font-normal",
                          !logNext && "text-muted-foreground",
                        )}
                      >
                        <CalIcon className="h-4 w-4 mr-2" />
                        {logNext
                          ? format(new Date(`${logNext}T12:00:00`), "dd MMM yyyy", { locale: esLocale })
                          : "Sin fecha"}
                        {logNext && (
                          <span
                            role="button"
                            onClick={(e) => { e.stopPropagation(); setLogNext(""); }}
                            className="ml-auto text-muted-foreground hover:text-foreground"
                            aria-label="Limpiar"
                          >
                            <X className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={logNext ? new Date(`${logNext}T12:00:00`) : undefined}
                        onSelect={(d) => {
                          if (!d) return;
                          // Persist as YYYY-MM-DD; the save mutation
                          // anchors to noon to dodge UTC offset issues.
                          const y = d.getFullYear();
                          const m = String(d.getMonth() + 1).padStart(2, "0");
                          const day = String(d.getDate()).padStart(2, "0");
                          setLogNext(`${y}-${m}-${day}`);
                        }}
                        locale={esLocale}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div>
                <Label className="text-xs">Notas</Label>
                <Textarea
                  value={logNotes}
                  onChange={(e) => setLogNotes(e.target.value)}
                  rows={3}
                  placeholder="Qué dijo, objeciones, compromiso…"
                />
              </div>
              <Button
                onClick={() => logCallMut.mutate()}
                disabled={logCallMut.isPending}
                className="w-full gap-2"
              >
                {logCallMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Guardar llamada
              </Button>
            </div>

            <div className="rounded-lg border p-4 space-y-2 flex-1 flex flex-col min-h-0">
              <h3 className="font-semibold text-sm shrink-0">Historial ({calls.length})</h3>
              {calls.length === 0 && (
                <p className="text-xs text-muted-foreground">Sin llamadas registradas.</p>
              )}
              <div className="flex-1 min-h-[200px] max-h-[520px] overflow-y-auto space-y-2 pr-1">
                {calls.map((c) => (
                  <div key={c.id} className="border rounded-lg p-3 space-y-1 bg-muted/30 group relative">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold">{OUTCOME_LABELS[c.outcome]}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">{fmtDateTime(c.called_at)}</span>
                        <button
                          onClick={() => setConfirmDelete(c)}
                          className="opacity-0 group-hover:opacity-100 transition p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500"
                          title="Eliminar"
                          disabled={deleteCallMut.isPending}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    {c.notes && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{c.notes}</p>}
                    {/* Editable next_action_at. Calendar popover sets a new
                        date (anchored to local noon to dodge UTC drift),
                        the X clears it. Always rendered so the user can
                        ADD a follow-up to a call that doesn't yet have
                        one — replaces the previous "delete + re-log"
                        workaround that destroyed notes. */}
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className={cn(
                              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] border transition-colors",
                              c.next_action_at
                                ? "text-yellow-700 dark:text-yellow-400 border-yellow-500/40 bg-yellow-500/10 hover:bg-yellow-500/20"
                                : "text-muted-foreground border-border hover:bg-muted",
                            )}
                            title={c.next_action_at ? "Cambiar fecha de seguimiento" : "Agregar fecha de seguimiento"}
                          >
                            <CalIcon className="h-3 w-3" />
                            {c.next_action_at ? `Seguimiento: ${fmtDate(c.next_action_at)}` : "Sin seguimiento"}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={c.next_action_at ? new Date(c.next_action_at) : undefined}
                            onSelect={(d) => {
                              if (!d) return;
                              const y = d.getFullYear();
                              const m = String(d.getMonth() + 1).padStart(2, "0");
                              const day = String(d.getDate()).padStart(2, "0");
                              updateCallDateMut.mutate({
                                callId: c.id,
                                nextAt: new Date(`${y}-${m}-${day}T12:00:00`).toISOString(),
                              });
                            }}
                            locale={esLocale}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      {c.next_action_at && (
                        <button
                          type="button"
                          onClick={() => updateCallDateMut.mutate({ callId: c.id, nextAt: null })}
                          disabled={updateCallDateMut.isPending}
                          className="p-0.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500"
                          title="Quitar seguimiento"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>

      {/* Delete call confirmation */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar llamada</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete && (
                <>
                  ¿Seguro que quieres eliminar la llamada{" "}
                  <b>{OUTCOME_LABELS[confirmDelete.outcome]}</b> del{" "}
                  {fmtDateTime(confirmDelete.called_at)}? Esta acción no se puede deshacer.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) {
                  deleteCallMut.mutate(confirmDelete.id);
                  setConfirmDelete(null);
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

/* ───────────────────────── Import dialog ───────────────────────── */
/* ───────────────────────── Single-prospect add ─────────────────────────
 * Mini-dialog for "+ Agregar contacto" on the active list pill. Inserts
 * one prospect with the source pre-filled and basic fields exposed. Phone
 * is required; everything else is optional. Validates phone with
 * normalizePhone before hitting the DB so we don't store junk.
 */
function NuevoContactoDialog({
  open,
  onClose,
  defaultSource,
  defaultAssignee,
}: {
  open: boolean;
  onClose: () => void;
  defaultSource: string | null;
  defaultAssignee: string | null;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [colonia, setColonia] = useState("");
  const [direccion, setDireccion] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset when reopened so each "Agregar" starts blank
  useEffect(() => {
    if (open) {
      setPhone(""); setName(""); setContactPerson("");
      setMunicipio(""); setColonia(""); setDireccion("");
    }
  }, [open]);

  const submit = async () => {
    const r = normalizePhone(phone.trim());
    if (!r.value) {
      toast({ title: "Teléfono inválido", description: r.reason || "Revisa el formato", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("prospects").insert({
        phone: r.value,
        name: name.trim() || null,
        contact_person: contactPerson.trim() || null,
        municipio: municipio.trim() || null,
        colonia: colonia.trim() || null,
        direccion: direccion.trim() || null,
        source: defaultSource,
        assigned_to: defaultAssignee,
        status: "nuevo",
      });
      if (error) throw error;
      toast({ title: "Contacto agregado", description: defaultSource ? `Lista: ${defaultSource}` : "Sin lista" });
      qc.invalidateQueries({ queryKey: ["prospects"] });
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar contacto</DialogTitle>
          <DialogDescription>
            {defaultSource ? <>Se agregará a la lista <b>{defaultSource}</b>.</> : "Sin lista asignada."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div>
            <Label className="text-xs">Teléfono *</Label>
            <Input
              autoFocus
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+52 55 1234 5678 o 5512345678"
              className="font-mono"
            />
          </div>
          <div>
            <Label className="text-xs">Nombre del negocio</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Veterinaria Las Flores" />
          </div>
          <div>
            <Label className="text-xs">Contacto / encargado</Label>
            <Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder="Quien contesta el teléfono" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Municipio</Label>
              <Input value={municipio} onChange={(e) => setMunicipio(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Colonia</Label>
              <Input value={colonia} onChange={(e) => setColonia(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Dirección</Label>
            <Input value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Calle y número" />
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving || !phone.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            Agregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({
  open,
  onClose,
  defaultAssignee,
  profiles,
}: {
  open: boolean;
  onClose: () => void;
  defaultAssignee: string | null;
  profiles: Profile[];
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [sourceLabel, setSourceLabel] = useState("Lista " + format(new Date(), "MMMM yyyy", { locale: esLocale }));
  const [assignee, setAssignee] = useState<string>(defaultAssignee ?? "__unassigned__");
  const [parsed, setParsed] = useState<{
    valid: { phone: string; name: string | null; municipio: string | null; colonia: string | null; direccion: string | null }[];
    invalid: { raw: string; reason: string }[];
  } | null>(null);
  const [existingClients, setExistingClients] = useState<{ phone: string; client_id: string; client_name: string }[]>([]);
  const [existingProspects, setExistingProspects] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const handleFileRef = useRef<(f: File) => void>(() => {});

  // While the import dialog is open, capture drag/drop on the whole
  // document so the browser doesn't navigate to the file when it lands
  // outside the explicit drop zone.
  useEffect(() => {
    if (!open) return;
    const isFile = (e: DragEvent) =>
      !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");
    const onDragEnter = (e: DragEvent) => {
      if (!isFile(e)) return;
      e.preventDefault();
      setDragActive(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!isFile(e)) return;
      e.preventDefault();
      setDragActive(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (!isFile(e)) return;
      // Only clear if the drag is leaving the window entirely
      if ((e as any).relatedTarget == null) setDragActive(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!isFile(e)) return;
      e.preventDefault();
      setDragActive(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) handleFileRef.current(f);
    };
    // Use capture phase so we see the events before Radix's overlay /
    // focus-trap logic can stopPropagation them.
    window.addEventListener("dragenter", onDragEnter, true);
    window.addEventListener("dragover", onDragOver, true);
    window.addEventListener("dragleave", onDragLeave, true);
    window.addEventListener("drop", onDrop, true);
    return () => {
      window.removeEventListener("dragenter", onDragEnter, true);
      window.removeEventListener("dragover", onDragOver, true);
      window.removeEventListener("dragleave", onDragLeave, true);
      window.removeEventListener("drop", onDrop, true);
    };
  }, [open]);

  const resetAll = () => {
    setParsed(null);
    setExistingClients([]);
    setExistingProspects(new Set());
    if (fileRef.current) fileRef.current.value = "";
  };

  // Keep a stable pointer to the latest parse function for window-level listeners
  useEffect(() => {
    handleFileRef.current = (f: File) => {
      // Fire and forget; handleFile is async
      void handleFile(f);
    };
  });

  const handleFile = async (f: File) => {
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: null });
    if (rows.length === 0) {
      toast({ title: "Archivo vacío", variant: "destructive" });
      return;
    }

    // Column detection — two-pass: first by header pattern, then verify by
    // looking at the values. If a header-matched "phone" column turns out not
    // to contain phone-shaped data, fall back to the column whose values are
    // most phone-like.
    const headers = Object.keys(rows[0]);
    const findCol = (patterns: RegExp[]) =>
      headers.find((h) => patterns.some((p) => p.test(h.toLowerCase()))) ?? null;

    /** Score a column by what fraction of non-empty values look like phones
     *  (7+ digit characters once non-digits are stripped). */
    const phoneScore = (col: string): number => {
      let total = 0;
      let good = 0;
      for (const r of rows) {
        const v = r[col];
        if (v == null || String(v).trim() === "") continue;
        total++;
        const digits = String(v).replace(/\D/g, "");
        if (digits.length >= 7) good++;
      }
      return total === 0 ? 0 : good / total;
    };

    // Pick the best column: header-matched phone column only wins if it
    // actually scores high; otherwise use the best-scoring column.
    const headerPhoneCol = findCol([/tel[eé]fono/, /^phone$/, /celular/, /whats/, /^tel$/, /m[oó]vil/]);
    let phoneCol: string;
    if (headerPhoneCol && phoneScore(headerPhoneCol) >= 0.5) {
      phoneCol = headerPhoneCol;
    } else {
      let bestCol = headers[0];
      let bestScore = 0;
      for (const h of headers) {
        const s = phoneScore(h);
        if (s > bestScore) {
          bestScore = s;
          bestCol = h;
        }
      }
      phoneCol = bestCol;
    }

    const nameCol = findCol([/nombre/, /name/, /cliente/, /negocio/, /raz[oó]n/, /empresa/, /comercio/, /establecimiento/]);
    // Municipio prefers an explicit municipio/delegación/alcaldía header. If
    // none, fall back to the unnamed "in-between" column some sheets use
    // (`__EMPTY`, generated by xlsx for blank header cells).
    const muniCol = findCol([/municip/, /delegaci/, /alcald/]) ?? findCol([/^__empty$/]);
    const coloniaCol = findCol([/colonia/]);
    const dirCol = findCol([/direcci/, /address/, /ubicaci/, /punto de venta/]);
    const ciudadCol = findCol([/ciudad|cuidad/, /location/, /estado|state/]);
    const notesCol = findCol([/^nota$/, /^notas$/, /comentari/, /observaci/, /^note/]);
    const contactCol = findCol([/encargad/, /contacto persona/, /persona/, /due[ñn]o/, /owner/]);

    const valid: { phone: string | null; name: string | null; contact_person: string | null; municipio: string | null; colonia: string | null; direccion: string | null; notes: string | null }[] = [];
    const invalid: { raw: string; reason: string }[] = [];
    const seen = new Set<string>();

    for (const r of rows) {
      const nameVal = nameCol && r[nameCol] ? String(r[nameCol]).trim() : null;
      const result = parsePhoneCell(r[phoneCol]);

      // Phone is malformed but present — flag as invalid (don't silently drop).
      if (result.kind === "invalid") {
        invalid.push({ raw: String(r[phoneCol] ?? ""), reason: result.reason });
        continue;
      }

      // Truly blank everything — nothing to import.
      if (result.kind === "blank" && !nameVal) continue;

      // Phoneless but has a business name — import as a "no phone yet" lead.
      let phoneToUse: string | null = null;
      if (result.kind === "valid") {
        if (seen.has(result.value)) continue; // dedupe by phone within file
        seen.add(result.value);
        phoneToUse = result.value;
      }

      valid.push({
        phone: phoneToUse,
        name: nameVal,
        contact_person: contactCol && r[contactCol] ? String(r[contactCol]).trim() : null,
        municipio: muniCol && r[muniCol] ? String(r[muniCol]).trim() : ciudadCol && r[ciudadCol] ? String(r[ciudadCol]).trim() : null,
        colonia: coloniaCol && r[coloniaCol] ? String(r[coloniaCol]).trim() : null,
        direccion: dirCol && r[dirCol] ? String(r[dirCol]).trim() : null,
        notes: notesCol && r[notesCol] ? String(r[notesCol]).trim() : null,
      });
    }

    // Check against existing clients + prospects (only for rows that
    // actually have a phone — phoneless rows can't dedup by phone).
    const phones = valid.map((v) => v.phone).filter((p): p is string => !!p);
    if (phones.length) {
      const { data: clientHits } = await (supabase as any)
        .from("clients")
        .select("id, name, phone")
        .in("phone", phones);
      setExistingClients(
        ((clientHits ?? []) as any[]).map((c) => ({
          phone: c.phone,
          client_id: c.id,
          client_name: c.name ?? "Cliente",
        }))
      );

      const { data: prospectHits } = await (supabase as any)
        .from("prospects")
        .select("phone")
        .in("phone", phones);
      setExistingProspects(new Set(((prospectHits ?? []) as { phone: string }[]).map((p) => p.phone)));
    }

    setParsed({ valid, invalid });
  };

  const handleImport = async () => {
    if (!parsed) return;
    setSaving(true);
    try {
      // Skip phones that are already prospects. Phoneless rows can't be
      // deduped by phone so they always pass through as new.
      const newOnes = parsed.valid.filter((v) => !v.phone || !existingProspects.has(v.phone));
      if (newOnes.length === 0) {
        toast({ title: "Nada nuevo que importar" });
        setSaving(false);
        return;
      }

      const rows = newOnes.map((v) => ({
        phone: v.phone,
        name: v.name,
        contact_person: v.contact_person,
        municipio: v.municipio,
        colonia: v.colonia,
        direccion: v.direccion,
        notes: v.notes,
        source: sourceLabel || null,
        assigned_to: assignee === "__unassigned__" ? null : assignee,
        created_by: user?.id ?? null,
      }));

      // Chunk to stay well under any payload limits
      const chunkSize = 200;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const { error } = await (supabase as any).from("prospects").insert(rows.slice(i, i + chunkSize));
        if (error) throw error;
      }

      toast({
        title: "Importación completa",
        description: `${newOnes.length} prospectos nuevos · ${existingProspects.size} ya existían · ${parsed.invalid.length} inválidos`,
      });
      qc.invalidateQueries({ queryKey: ["prospects"] });
      resetAll();
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          resetAll();
          onClose();
        }
      }}
    >
      <DialogContent
        className="max-w-[95vw] sm:max-w-[1100px] w-full max-h-[90vh] overflow-y-auto overflow-x-hidden"
        onDragEnter={(e) => {
          if (!Array.from(e.dataTransfer.types).includes("Files")) return;
          e.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(e) => {
          if (!Array.from(e.dataTransfer.types).includes("Files")) return;
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(e) => {
          if (!Array.from(e.dataTransfer.types).includes("Files")) return;
          // Only clear when we leave the dialog entirely, not on child hovers
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDragActive(false);
          }
        }}
        onDrop={(e) => {
          if (!Array.from(e.dataTransfer.types).includes("Files")) return;
          e.preventDefault();
          setDragActive(false);
          const f = e.dataTransfer.files?.[0];
          if (f && !parsed) void handleFile(f);
        }}
      >
        <DialogHeader>
          <DialogTitle>Importar prospectos</DialogTitle>
          <DialogDescription>
            Sube un Excel o CSV con la columna <b>Teléfono</b>. Los demás campos (nombre,
            municipio, colonia, dirección) se importan si existen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2 min-w-0">
          {!parsed && (
            <div
              className={cn(
                "border-2 border-dashed rounded-xl h-64 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors",
                dragActive
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-border hover:border-blue-400 hover:bg-muted/30"
              )}
              onClick={() => fileRef.current?.click()}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
            >
              <Upload className={cn("h-8 w-8", dragActive ? "text-blue-600" : "text-muted-foreground")} />
              <p className="text-sm font-medium">
                {dragActive ? "Suelta el archivo aquí" : "Haz clic o arrastra un archivo"}
              </p>
              <p className="text-xs text-muted-foreground">.xlsx · .xls · .csv</p>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </div>
          )}

          {parsed && (
            <>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="border rounded-lg p-4">
                  <div className="text-3xl font-bold text-green-600">{parsed.valid.length}</div>
                  <div className="text-xs text-muted-foreground mt-1">Listos para importar</div>
                </div>
                <div className="border rounded-lg p-4">
                  <div className="text-3xl font-bold text-yellow-600">{existingProspects.size}</div>
                  <div className="text-xs text-muted-foreground mt-1">Ya son prospectos</div>
                </div>
                <div className="border rounded-lg p-4">
                  <div className="text-3xl font-bold text-red-600">{parsed.invalid.length}</div>
                  <div className="text-xs text-muted-foreground mt-1">Inválidos</div>
                </div>
              </div>

              {existingClients.length > 0 && (
                <div className="border border-orange-200 bg-orange-500/5 rounded-lg p-3 space-y-1.5 overflow-hidden min-w-0">
                  <p className="text-sm font-semibold text-orange-700 dark:text-orange-400">
                    {existingClients.length} teléfonos ya existen como clientes:
                  </p>
                  <ul className="text-xs text-orange-700 dark:text-orange-400 space-y-0.5 max-h-32 overflow-y-auto overflow-x-hidden">
                    {existingClients.slice(0, 20).map((c) => (
                      <li key={c.phone} className="break-all">
                        {humanPhone(c.phone)} → <b>{c.client_name}</b>
                      </li>
                    ))}
                    {existingClients.length > 20 && (
                      <li className="italic">… y {existingClients.length - 20} más</li>
                    )}
                  </ul>
                  <p className="text-[11px] text-orange-700 dark:text-orange-400 italic">
                    Se importarán igual como prospectos; puedes completar la info faltante después.
                  </p>
                </div>
              )}

              {parsed.invalid.length > 0 && (
                <div className="border border-red-200 bg-red-500/5 rounded-lg p-3 space-y-1.5 overflow-hidden min-w-0">
                  <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                    {parsed.invalid.length} teléfonos inválidos (se omitirán):
                  </p>
                  <ul className="text-xs text-red-700 dark:text-red-400 space-y-0.5 max-h-32 overflow-y-auto overflow-x-hidden font-mono">
                    {parsed.invalid.slice(0, 15).map((i, n) => (
                      <li key={n} className="break-all">
                        <span className="font-semibold">{(i.raw || "(vacío)").slice(0, 80)}{(i.raw || "").length > 80 ? "…" : ""}</span>
                        <span className="not-italic"> — {i.reason}</span>
                      </li>
                    ))}
                    {parsed.invalid.length > 15 && (
                      <li className="italic">… y {parsed.invalid.length - 15} más</li>
                    )}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                <div>
                  <Label className="text-xs">Etiqueta de origen</Label>
                  <Input
                    value={sourceLabel}
                    onChange={(e) => setSourceLabel(e.target.value)}
                    placeholder="Lista Abril 2026"
                  />
                </div>
                <div>
                  <Label className="text-xs">Asignar a</Label>
                  <Select value={assignee} onValueChange={setAssignee}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unassigned__">Sin asignar</SelectItem>
                      {profiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {userLabel(p)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          {parsed && (
            <Button variant="ghost" onClick={resetAll}>
              <X className="h-4 w-4 mr-1" /> Empezar de nuevo
            </Button>
          )}
          <Button variant="outline" onClick={() => { resetAll(); onClose(); }}>
            Cancelar
          </Button>
          {parsed && (
            <Button
              onClick={handleImport}
              disabled={saving || parsed.valid.length === 0}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" /> Importando…
                </>
              ) : (
                <>Importar {parsed.valid.length - existingProspects.size} prospectos</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── Bulk assign ───────────────────────── */
function BulkAssignDialog({
  open,
  onClose,
  count,
  profiles,
  onAssign,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  count: number;
  profiles: Profile[];
  onAssign: (userId: string | null) => void;
  saving: boolean;
}) {
  const [pick, setPick] = useState<string>("__unassigned__");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[95vw] sm:max-w-[640px] w-full">
        <DialogHeader>
          <DialogTitle>Asignar {count} prospectos</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Label className="text-sm">Asignar a</Label>
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__unassigned__">Sin asignar</SelectItem>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.full_name || p.email || p.id.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => onAssign(pick === "__unassigned__" ? null : pick)}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Asignar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────── Google Places enrichment ───────────────────── */

interface EnrichResult {
  found: boolean;
  matched_phone?: boolean;
  place_id?: string;
  name?: string | null;
  formatted_address?: string | null;
  municipio?: string | null;
  colonia?: string | null;
  direccion?: string | null;
  lat?: number | null;
  lng?: number | null;
  rating?: number | null;
  review_count?: number | null;
  google_phone?: string | null;
  types?: string[];
  website?: string | null;
  google_maps_url?: string | null;
  business_status?: string | null;
  price_level?: string | null;
  primary_type?: string | null;
  description?: string | null;
  opening_hours?: string[] | null;
  photo_url?: string | null;
  raw?: any;
  error?: string;
}

function EnrichDialog({
  open,
  onClose,
  prospects,
}: {
  open: boolean;
  onClose: () => void;
  prospects: Prospect[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [scope, setScope] = useState<"only_missing" | "first_10" | "all">("only_missing");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, hits: 0, misses: 0, errors: 0 });
  const [recent, setRecent] = useState<{ phone: string; name: string | null; status: string }[]>([]);
  const cancelRef = useRef(false);

  const candidates = useMemo(() => {
    // Enrichment lookup is keyed off the phone — phoneless rows can't be
    // resolved against Google Places by phone, so they're skipped.
    const hasPhone = (p: Prospect) => !!p.phone;
    const filterByEnriched = (p: Prospect) => hasPhone(p) && p.enriched_at == null;
    if (scope === "only_missing") return prospects.filter(filterByEnriched);
    if (scope === "first_10") return prospects.filter(hasPhone).slice(0, 10);
    return prospects.filter(hasPhone);
  }, [scope, prospects]);

  const reset = () => {
    cancelRef.current = false;
    setRunning(false);
    setProgress({ done: 0, total: 0, hits: 0, misses: 0, errors: 0 });
    setRecent([]);
  };

  const run = async () => {
    if (candidates.length === 0) return;
    setRunning(true);
    cancelRef.current = false;
    setProgress({ done: 0, total: candidates.length, hits: 0, misses: 0, errors: 0 });
    setRecent([]);

    const concurrency = 5;
    let cursor = 0;

    const worker = async () => {
      while (!cancelRef.current) {
        const i = cursor++;
        if (i >= candidates.length) break;
        const p = candidates[i];
        try {
          const { data, error } = await (supabase.functions.invoke as any)(
            "enrich-prospect-places",
            { body: { phone: p.phone } }
          );
          if (error) throw error;
          const r = (data ?? {}) as EnrichResult;

          // Persist whatever we got — even misses get enriched_at so we don't retry
          const update: Partial<Prospect> & {
            place_id?: string | null;
            lat?: number | null;
            lng?: number | null;
            rating?: number | null;
            review_count?: number | null;
            enriched_at?: string;
            enrichment_data?: any;
            enrichment_status?: string;
          } = {
            enriched_at: new Date().toISOString(),
            enrichment_data: r as any,
            enrichment_status: r.found
              ? r.matched_phone
                ? "match"
                : "weak_match"
              : "no_match",
          };
          if (r.found) {
            // Only overwrite name/dir/muni/colonia if currently empty — don't
            // clobber data the user already entered manually.
            if (!p.name && r.name) update.name = r.name;
            if (!p.municipio && r.municipio) update.municipio = r.municipio;
            if (!p.colonia && r.colonia) update.colonia = r.colonia;
            if (!p.direccion && r.direccion) update.direccion = r.direccion;
            update.place_id = r.place_id ?? null;
            update.lat = r.lat ?? null;
            update.lng = r.lng ?? null;
            update.rating = r.rating ?? null;
            update.review_count = r.review_count ?? null;
            (update as any).website = r.website ?? null;
            (update as any).google_maps_url = r.google_maps_url ?? null;
            (update as any).business_status = r.business_status ?? null;
            (update as any).price_level = r.price_level ?? null;
            (update as any).primary_type = r.primary_type ?? null;
            (update as any).description = r.description ?? null;
            (update as any).opening_hours = r.opening_hours ?? null;
            if (r.photo_url) {
              (update as any).photo_url = r.photo_url;
              (update as any).photo_fetched_at = new Date().toISOString();
            }
          }

          const { error: upErr } = await (supabase as any)
            .from("prospects")
            .update(update)
            .eq("id", p.id);
          if (upErr) throw upErr;

          setProgress((s) => ({
            ...s,
            done: s.done + 1,
            hits: s.hits + (r.found ? 1 : 0),
            misses: s.misses + (r.found ? 0 : 1),
          }));
          setRecent((rs) =>
            [
              { phone: p.phone ?? "", name: r.found ? r.name ?? "(sin nombre)" : null, status: r.found ? (r.matched_phone ? "✓ match" : "≈ weak") : "× no" },
              ...rs,
            ].slice(0, 12)
          );
        } catch (err: any) {
          setProgress((s) => ({ ...s, done: s.done + 1, errors: s.errors + 1 }));
          setRecent((rs) =>
            [{ phone: p.phone ?? "", name: null, status: `! ${String(err.message ?? err).slice(0, 30)}` }, ...rs].slice(0, 12)
          );
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    setRunning(false);
    qc.invalidateQueries({ queryKey: ["prospects"] });
    toast({ title: "Enriquecimiento completo" });
  };

  const cancel = () => {
    cancelRef.current = true;
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          if (running) cancel();
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-[95vw] sm:max-w-[760px] w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enriquecer prospectos con Google Places</DialogTitle>
          <DialogDescription>
            Cada teléfono se busca en Google Maps. Si lo encuentra, llenamos nombre,
            municipio, colonia y dirección. Lo que ya tenías escrito no se sobreescribe.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {!running && (
            <div className="space-y-3">
              <Label className="text-xs">Alcance</Label>
              <div className="grid grid-cols-1 gap-2">
                {(
                  [
                    {
                      v: "first_10",
                      label: "Probar con los primeros 10",
                      detail: "Para validar el flujo y revisar resultados antes de gastar más.",
                    },
                    {
                      v: "only_missing",
                      label: `Sin enriquecer (${prospects.filter((p) => p.enriched_at == null).length})`,
                      detail: "Salta los que ya se procesaron antes.",
                    },
                    {
                      v: "all",
                      label: `Todos (${prospects.length})`,
                      detail: "Re-procesa también los que ya se enriquecieron.",
                    },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.v}
                    onClick={() => setScope(opt.v)}
                    className={cn(
                      "text-left p-3 rounded-lg border transition-colors",
                      scope === opt.v
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-border hover:bg-muted/40"
                    )}
                  >
                    <div className="font-medium text-sm">{opt.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{opt.detail}</div>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Costo estimado: <b>~${(candidates.length * 0.017).toFixed(2)} USD</b> (Google
                cobra ~$0.017 por consulta — el primer mes tienes $200 USD gratis).
              </p>
            </div>
          )}

          {(running || progress.done > 0) && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Procesando {progress.done} de {progress.total}
                </span>
                <span className="text-muted-foreground">
                  {Math.round((progress.done / Math.max(1, progress.total)) * 100)}%
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
                />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="border rounded-lg p-2">
                  <div className="text-xl font-bold text-green-600">{progress.hits}</div>
                  <div className="text-[11px] text-muted-foreground">Encontrados</div>
                </div>
                <div className="border rounded-lg p-2">
                  <div className="text-xl font-bold text-muted-foreground">{progress.misses}</div>
                  <div className="text-[11px] text-muted-foreground">Sin coincidencia</div>
                </div>
                <div className="border rounded-lg p-2">
                  <div className="text-xl font-bold text-red-600">{progress.errors}</div>
                  <div className="text-[11px] text-muted-foreground">Errores</div>
                </div>
              </div>
              {recent.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="text-[11px] font-semibold text-muted-foreground px-3 py-2 bg-muted/30">
                    Últimos resultados
                  </div>
                  <div className="max-h-[200px] overflow-y-auto divide-y">
                    {recent.map((r, i) => (
                      <div key={i} className="px-3 py-1.5 text-xs flex items-center gap-2">
                        <span className="font-mono w-[120px] shrink-0">{humanPhone(r.phone)}</span>
                        <span className="truncate flex-1">{r.name ?? "—"}</span>
                        <span className={cn(
                          "shrink-0 text-[10px]",
                          r.status.startsWith("✓") && "text-green-600",
                          r.status.startsWith("≈") && "text-yellow-600",
                          r.status.startsWith("×") && "text-muted-foreground",
                          r.status.startsWith("!") && "text-red-600"
                        )}>{r.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-col sm:flex-row">
          {progress.done > 0 && !running && (
            <p className="text-[11px] text-muted-foreground sm:mr-auto">
              ✅ Resultados guardados automáticamente. Cierra y abre cualquier
              prospecto para ver los datos llenados.
            </p>
          )}
          {running ? (
            <>
              <Button variant="outline" onClick={() => { reset(); onClose(); }}>
                Cerrar (sigue corriendo en backend)
              </Button>
              <Button variant="destructive" onClick={cancel}>
                Detener
              </Button>
            </>
          ) : progress.done > 0 ? (
            <>
              <Button variant="outline" onClick={() => reset()}>
                Hacer otro
              </Button>
              <Button onClick={() => { reset(); onClose(); }}>
                Hecho
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => { reset(); onClose(); }}>
                Cancelar
              </Button>
              <Button onClick={run} disabled={candidates.length === 0}>
                Enriquecer {candidates.length} prospectos
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── CSV export ───────────────────────── */
function exportCSV(rows: Prospect[]) {
  const headers = [
    "telefono",
    "nombre",
    "municipio",
    "colonia",
    "direccion",
    "estado",
    "source",
    "creado",
  ];
  const esc = (s: any) => {
    const v = s == null ? "" : String(s);
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.phone,
        r.name ?? "",
        r.municipio ?? "",
        r.colonia ?? "",
        r.direccion ?? "",
        STATUS_LABELS[r.status],
        r.source ?? "",
        r.created_at.slice(0, 10),
      ].map(esc).join(",")
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `prospectos_${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
