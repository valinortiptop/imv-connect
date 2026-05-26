/**
 * ImportInventoryDialog
 *
 * Excel importer for the Almacén page. The previous diff-based RPC
 * double-counted bultos when the new sheet had a slightly different
 * lote or description for an existing tarima (the matcher couldn't find
 * the existing row and inserted alongside). The user asked for a clean
 * wipe-and-replace semantics:
 *
 *   1. File picker → parse the first sheet and project to the canonical
 *      row shape (slot_code, sku, barcode, ...).
 *   2. Show a diff PREVIEW (insert / update / delete chips) so the user
 *      sees what's changing in their mental model, even though the
 *      actual operation is wipe-and-replace.
 *   3. Surface a stale-upload warning if the new total bultos < 70 %
 *      of the current storage total — the user wants a disclaimer +
 *      proceed button in that case.
 *   4. Confirm (red button) → calls import_inventory_apply which:
 *        • takes a pre_import snapshot
 *        • wipes every storage-zone slot_contents row
 *        • inserts the new rows from the Excel
 *        • emits Kardex 'ajuste' entries
 *        • takes a post_import snapshot
 *      Recibo + embarque are NEVER touched — those zones are workflow
 *      state, not Excel-tracked.
 *
 * Unmatched SKUs are imported anyway with product_id NULL and the
 * description preserved, so the map renders them as untagged loose-
 * tarima entries.
 */

import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx-js-style";
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
import { Input } from "@/components/ui/input";
import {
  Download,
  Loader2,
  FileSpreadsheet,
  CircleAlert,
  CheckCircle2,
  CirclePlus,
  CircleMinus,
  CircleDot,
  AlertTriangle,
  ShieldAlert,
  Camera,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** Shape used internally + sent over the wire */
interface ImportRow {
  slot_code: string;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  qty: number;
  lote: string | null;
  expiration_date: string | null; // ISO yyyy-mm-dd
}

interface ApplySummary {
  inserted: number;
  updated: number;
  deleted: number;
  unmatched_sku: string[];
  unknown_slot: string[];
  pre_snapshot_id?: string;
  post_snapshot_id?: string;
  stale_warning?: boolean;
  current_total?: number;
  target_total?: number;
}

/** Diff bucket for the preview. The "key" is unique per change so the
 *  React list keying is stable. */
type DiffStatus =
  | "insert"
  | "update"
  | "delete"
  | "unmatched_sku"
  | "unknown_slot";
interface DiffRow {
  key: string;
  status: DiffStatus;
  slot_code: string;
  sku: string | null;
  description: string | null;
  lote: string | null;
  old_qty?: number;
  new_qty?: number;
  expiration_date?: string | null;
}

interface Slot {
  id: string;
  code: string;
  /** Optional — when provided lets the dialog scope the "bultos actuales"
   *  comparison to storage zones only, ignoring recibo / embarque. */
  zone?: "storage" | "recibo" | "embarque" | string;
}
interface SlotContent {
  id: string;
  slot_id: string;
  product_id: string | null;
  description: string | null;
  lote: string | null;
  quantity: number;
  expiration_date: string | null;
}
interface Product {
  id: string;
  clave: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  slots: Slot[];
  contents: SlotContent[];
  products: Product[];
}

/** Excel column index in the canonical sheet layout */
const COL = {
  UBICACION: 0,
  SKU: 1,
  CODIGO_DE_BARRAS: 2,
  DESCRIPCION: 3,
  CANTIDAD: 4,
  LOTE: 5,
  FECHA_DE_CAD: 6,
} as const;

const STATUS_META: Record<
  DiffStatus,
  { label: string; chip: string; icon: React.ReactNode }
> = {
  insert: {
    label: "Nueva",
    chip:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
    icon: <CirclePlus className="h-3 w-3" />,
  },
  update: {
    label: "Actualizada",
    chip:
      "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
    icon: <CircleDot className="h-3 w-3" />,
  },
  delete: {
    label: "Eliminada",
    chip: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40",
    icon: <CircleMinus className="h-3 w-3" />,
  },
  unmatched_sku: {
    label: "Sin SKU",
    chip:
      "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/40",
    icon: <CircleAlert className="h-3 w-3" />,
  },
  unknown_slot: {
    label: "Posición desconocida",
    chip: "bg-gray-500/15 text-gray-700 dark:text-gray-300 border-gray-500/40",
    icon: <CircleAlert className="h-3 w-3" />,
  },
};

/** XLSX may give us numbers, Dates, or strings depending on cell format.
 *  Always project back to ISO yyyy-mm-dd for the RPC. */
function toIsoDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    const yyyy = v.getFullYear();
    const mm = String(v.getMonth() + 1).padStart(2, "0");
    const dd = String(v.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  if (typeof v === "number") {
    // Excel serial date — convert via XLSX helper
    const parsed = XLSX.SSF?.parse_date_code?.(v);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
    return null;
  }
  const s = String(v).trim();
  // Already ISO-ish?
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function toStrOrNull(v: unknown): string | null {
  if (v == null) return null;
  // Codigo de barras + Lote can come in as a float — drop trailing .0
  if (typeof v === "number") {
    if (Number.isInteger(v)) return String(v);
    return String(v);
  }
  const s = String(v).trim();
  return s === "" ? null : s;
}

function toIntOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

/** One candidate sheet from the uploaded workbook — used when the file
 *  contains multiple worksheets that look like inventory (UBICACION in
 *  row 0). The user picks via the pill row above the diff preview. */
interface CandidateSheet {
  name: string;
  rows: ImportRow[];
}

/** Header detection — a sheet qualifies as an inventory tab when its
 *  first row's column 0 reads "UBICACION" (accent / case tolerant).
 *  We deliberately don't require the other columns to exist by name —
 *  the position-based parser does the rest. */
function looksLikeInventorySheet(headerRow: unknown[] | undefined): boolean {
  if (!headerRow || headerRow.length === 0) return false;
  const first = headerRow[0];
  if (first == null) return false;
  const s = String(first)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();
  return s === "UBICACION";
}

/** Heuristic: does this sheet name contain a date?
 *  The user's workflow names the LIVE tab with a date suffix (e.g.
 *  "INVENTARIO 11 May 26") and keeps stale templates/archives under
 *  cleaner names. So the dated tab is ALWAYS the one we want.
 *
 *  Detects:
 *    - Spanish month name or 3-letter abbreviation (mayo / may)
 *    - Numeric date patterns DD/MM/YY, DD-MM-YYYY, YYYY-MM-DD, etc. */
function hasDateInName(name: string): boolean {
  const n = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const monthRx = /\b(ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|ago(?:sto)?|sep(?:t(?:iembre)?)?|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?)\b/;
  const numericDateRx = /\d{1,2}\s*[\/\-]\s*\d{1,2}(\s*[\/\-]\s*\d{2,4})?|\d{4}\s*[\/\-]\s*\d{1,2}\s*[\/\-]\s*\d{1,2}/;
  return monthRx.test(n) || numericDateRx.test(n);
}

/** Default-sheet picker — used when multiple sheets in the workbook
 *  have the UBICACION header.
 *
 *  The user's workflow:
 *    "INVENTARIO 11 May 26"  ← LIVE tab (dated)
 *    "INVENTARIO"            ← stale template, ignore
 *
 *  Rule: a sheet name with a date wins. Among dated sheets, row count
 *  breaks ties (the most-active one is usually the largest). Undated
 *  sheets fall to the back. */
function rankCandidate(c: CandidateSheet): number {
  return hasDateInName(c.name) ? 0 : 1;
}

export function ImportInventoryDialog({
  open,
  onOpenChange,
  slots,
  contents,
  products,
}: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheetName, setSheetName] = useState<string | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [candidates, setCandidates] = useState<CandidateSheet[]>([]);
  const [statusFilter, setStatusFilter] = useState<DiffStatus | "all">("all");
  // Drag-over visual state for the drop zone. Driven by a counter so
  // child elements firing dragenter/dragleave during the same drag
  // don't toggle the highlight off prematurely.
  const [dragDepth, setDragDepth] = useState(0);

  // Pre-flight totals so the dialog can warn before the user clicks
  // Aplicar — a stale Excel (e.g. yesterday's sheet uploaded by mistake)
  // would silently wipe today's work without this check.
  //
  // We filter to STORAGE zone only here because the Excel describes the
  // storage state, not recibo/embarque. Otherwise the comparison
  // ("bultos actuales vs bultos en archivo") would unfairly count
  // workflow bultos against the file total.
  const currentStorageTotal = useMemo(() => {
    let n = 0;
    const storageIds = new Set(
      slots
        .filter((s) => s.zone === "storage" || s.zone === undefined)
        .map((s) => s.id),
    );
    for (const c of contents) {
      if (storageIds.has(c.slot_id)) n += c.quantity;
    }
    return n;
  }, [contents, slots]);

  const targetStorageTotal = useMemo(
    () => rows.reduce((s, r) => s + r.qty, 0),
    [rows],
  );

  // 70 % heuristic mirrors the server-side check. If we'd wipe a lot
  // more than we're inserting, surface a disclaimer the user must
  // acknowledge before the red Reemplazar button enables.
  const isStaleUpload =
    currentStorageTotal > 0 && targetStorageTotal < currentStorageTotal * 0.7;
  const [staleAck, setStaleAck] = useState(false);

  // Lookups
  const slotByCode = useMemo(() => {
    const m = new Map<string, Slot>();
    for (const s of slots) m.set(s.code, s);
    return m;
  }, [slots]);

  const productByClave = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) m.set(p.clave, p);
    return m;
  }, [products]);

  const contentsBySlot = useMemo(() => {
    const m = new Map<string, SlotContent[]>();
    for (const c of contents) {
      const arr = m.get(c.slot_id) ?? [];
      arr.push(c);
      m.set(c.slot_id, arr);
    }
    return m;
  }, [contents]);

  /** Match an Excel row to an existing slot_contents row using
   *  (slot_id, product_id, lote) with NULL-safe equality. For unmatched
   *  SKUs we tie-break on the description. */
  const findExisting = (slot_id: string, productId: string | null, lote: string | null, description: string | null): SlotContent | null => {
    const bySlot = contentsBySlot.get(slot_id) ?? [];
    return (
      bySlot.find((c) => {
        if ((c.product_id ?? null) !== productId) return false;
        if ((c.lote ?? null) !== lote) return false;
        if (productId === null) {
          // tie-break on description for loose tarimas
          return (c.description ?? null) === description;
        }
        return true;
      }) ?? null
    );
  };

  /** Compute the diff between the loaded Excel rows and the current
   *  slot_contents state. Mirrors the server-side logic in
   *  import_inventory_apply, but tolerant of slight presentation drift. */
  const diff: DiffRow[] = useMemo(() => {
    if (rows.length === 0) return [];
    const out: DiffRow[] = [];
    // Track which existing contents we've seen so we can compute deletes
    const touchedExistingIds = new Set<string>();
    const touchedSlotIds = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const slot = slotByCode.get(r.slot_code);
      if (!slot) {
        out.push({
          key: `unk-${i}`,
          status: "unknown_slot",
          slot_code: r.slot_code,
          sku: r.sku,
          description: r.description,
          lote: r.lote,
          new_qty: r.qty,
          expiration_date: r.expiration_date,
        });
        continue;
      }
      touchedSlotIds.add(slot.id);
      const product = r.sku ? productByClave.get(r.sku) ?? null : null;
      const isUnmatched = !!r.sku && !product;

      const productId = product?.id ?? null;
      const existing = findExisting(slot.id, productId, r.lote, isUnmatched ? r.description : null);

      if (!existing) {
        out.push({
          key: `ins-${i}`,
          status: isUnmatched ? "unmatched_sku" : "insert",
          slot_code: r.slot_code,
          sku: r.sku,
          description: r.description,
          lote: r.lote,
          new_qty: r.qty,
          expiration_date: r.expiration_date,
        });
      } else {
        touchedExistingIds.add(existing.id);
        const qtyChanged = existing.quantity !== r.qty;
        const cadChanged =
          (existing.expiration_date ?? null) !== (r.expiration_date ?? null);
        if (qtyChanged || cadChanged) {
          out.push({
            key: `upd-${existing.id}`,
            status: isUnmatched ? "unmatched_sku" : "update",
            slot_code: r.slot_code,
            sku: r.sku,
            description: r.description,
            lote: r.lote,
            old_qty: existing.quantity,
            new_qty: r.qty,
            expiration_date: r.expiration_date,
          });
        }
      }
    }

    // Deletes: contents in touched slots that the import didn't mention
    for (const slot_id of touchedSlotIds) {
      const cs = contentsBySlot.get(slot_id) ?? [];
      const slot = slots.find((s) => s.id === slot_id);
      for (const c of cs) {
        if (touchedExistingIds.has(c.id)) continue;
        out.push({
          key: `del-${c.id}`,
          status: "delete",
          slot_code: slot?.code ?? "?",
          sku: null,
          description: c.description,
          lote: c.lote,
          old_qty: c.quantity,
        });
      }
    }

    return out;
  }, [rows, slotByCode, productByClave, contentsBySlot, slots]);

  const diffCounts = useMemo(() => {
    const c: Record<DiffStatus, number> = {
      insert: 0,
      update: 0,
      delete: 0,
      unmatched_sku: 0,
      unknown_slot: 0,
    };
    for (const d of diff) c[d.status]++;
    return c;
  }, [diff]);

  const visibleDiff = useMemo(
    () =>
      statusFilter === "all"
        ? diff
        : diff.filter((d) => d.status === statusFilter),
    [diff, statusFilter],
  );

  const reset = () => {
    setRows([]);
    setCandidates([]);
    setFileName(null);
    setSheetName(null);
    setStatusFilter("all");
    setStaleAck(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  /** Parse one worksheet into the canonical ImportRow shape. Pulled out
   *  of handleFile so we can call it on every candidate sheet without
   *  duplicating the logic. */
  const parseSheetRows = (sheet: XLSX.WorkSheet): ImportRow[] => {
    const data = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
    }) as unknown[][];
    const parsed: ImportRow[] = [];
    for (let i = 1; i < data.length; i++) {
      const r = data[i];
      if (!r || r.length === 0) continue;
      const slot_code = toStrOrNull(r[COL.UBICACION]);
      const qty = toIntOrNull(r[COL.CANTIDAD]);
      // Skip empty-slot rows: UBICACION present but qty zero/blank
      if (!slot_code) continue;
      if (qty == null || qty <= 0) continue;
      parsed.push({
        slot_code,
        sku: toStrOrNull(r[COL.SKU]),
        barcode: toStrOrNull(r[COL.CODIGO_DE_BARRAS]),
        description: toStrOrNull(r[COL.DESCRIPCION]),
        qty,
        lote: toStrOrNull(r[COL.LOTE]),
        expiration_date: toIsoDate(r[COL.FECHA_DE_CAD]),
      });
    }
    return parsed;
  };

  /** Pick the active candidate from a parsed list — used both on file
   *  load (auto-pick the best one) and when the user clicks a pill to
   *  switch sheets. */
  const activateCandidate = (name: string, all: CandidateSheet[]) => {
    const target = all.find((c) => c.name === name);
    if (!target) return;
    setSheetName(target.name);
    setRows(target.rows);
    setStaleAck(false);  // re-acknowledge stale-warning per sheet
    if (target.rows.length === 0) {
      toast.warning(`La hoja "${target.name}" no contiene filas con cantidad`);
    }
  };

  const handleFile = async (file: File) => {
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      if (!wb.SheetNames.length) throw new Error("El archivo no tiene hojas");

      // Scan every sheet — anything whose first row starts with the
      // UBICACION header is an inventory candidate. Earlier versions of
      // this dialog blindly used SheetNames[0] which led to silent
      // imports of "INVENTARIO 11 May 26" (an archive tab) instead of
      // the active "INVENTARIO" sheet.
      const found: CandidateSheet[] = [];
      for (const name of wb.SheetNames) {
        const sheet = wb.Sheets[name];
        if (!sheet) continue;
        const probe = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: null,
          range: 0,
        }) as unknown[][];
        if (!looksLikeInventorySheet(probe[0] as unknown[] | undefined)) continue;
        found.push({ name, rows: parseSheetRows(sheet) });
      }

      if (found.length === 0) {
        toast.error(
          'Ninguna hoja tiene la columna "UBICACION" en la primera fila. Revisa el formato del Excel.',
        );
        setParsing(false);
        return;
      }

      // Auto-pick: dated tabs ALWAYS win (rankCandidate returns 0 for
      // dated, 1 for plain). Within the dated group, larger row count
      // wins — handles workflows with multiple dated archives by
      // picking the most filled-in one.
      const ranked = [...found].sort((a, b) => {
        const ra = rankCandidate(a);
        const rb = rankCandidate(b);
        if (ra !== rb) return ra - rb;
        return b.rows.length - a.rows.length;
      });
      const chosen = ranked[0];

      setCandidates(found);
      setFileName(file.name);
      activateCandidate(chosen.name, found);

      if (found.length > 1) {
        toast.warning(
          `${found.length} hojas con formato de inventario · Usando "${chosen.name}" (${chosen.rows.length.toLocaleString("es-MX")} filas). Verifica arriba que sea la correcta.`,
          { duration: 8000 },
        );
      }
    } catch (err: any) {
      toast.error("Error al leer el Excel: " + (err.message ?? "desconocido"));
    } finally {
      setParsing(false);
    }
  };

  const apply = async () => {
    if (rows.length === 0) return;
    setApplying(true);
    try {
      const { data, error } = await (supabase as any).rpc(
        "import_inventory_apply",
        { p_target_state: rows },
      );
      if (error) throw error;
      const s = data as ApplySummary;
      qc.invalidateQueries({ queryKey: ["warehouse-slots"] });
      qc.invalidateQueries({ queryKey: ["warehouse-contents"] });
      qc.invalidateQueries({ queryKey: ["warehouse-latest-movement-by-slot"] });
      qc.invalidateQueries({ queryKey: ["slot-movements"] });
      qc.invalidateQueries({ queryKey: ["inventory-snapshots"] });
      // Replace semantics surface only insert + delete (no UPDATEs are
      // emitted by the new RPC). Keep the toast honest.
      toast.success(
        `Inventario reemplazado · ${s.inserted.toLocaleString("es-MX")} cargadas, ${s.deleted.toLocaleString("es-MX")} eliminadas · snapshot guardado`,
      );
      if (s.unmatched_sku.length > 0) {
        toast.info(
          `${s.unmatched_sku.length} SKU sin coincidir (importados como tarimas sueltas)`,
        );
      }
      if (s.unknown_slot.length > 0) {
        toast.warning(
          `${s.unknown_slot.length} posiciones desconocidas (ignoradas)`,
        );
      }
      onOpenChange(false);
      reset();
    } catch (err: any) {
      toast.error("Error al importar: " + (err.message ?? "desconocido"));
    } finally {
      setApplying(false);
    }
  };

  const totalChanges =
    diffCounts.insert + diffCounts.update + diffCounts.delete +
    diffCounts.unmatched_sku;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-4xl w-[96vw] max-h-[92vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="text-xl flex items-center gap-3">
            <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
            Importar inventario desde Excel
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Formato esperado: <code className="font-mono text-xs">UBICACION, SKU, CODIGO DE BARRAS, DESCRIPCION, CANTIDAD, LOTE, FECHA DE CAD.</code>
            <br />
            Las filas sin SKU o con cantidad 0 se ignoran (posiciones vacías). SKUs que no existen en el catálogo se importan como tarimas sin clave.
          </p>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {rows.length === 0 ? (
            // Proper drop zone: a single click-or-drop target with its
            // own drag state. Bare <Input type="file"> doesn't accept
            // dropped files — the file just opens in the browser tab
            // and the dialog "flashes". We wrap the input, hide it
            // visually, and route both click + drop into handleFile.
            <div
              onClick={() => { if (!parsing) fileRef.current?.click(); }}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (parsing) return;
                setDragDepth((n) => n + 1);
              }}
              onDragOver={(e) => {
                // CRITICAL: preventDefault on dragover is what tells the
                // browser "this is a valid drop target." Without it,
                // onDrop never fires and the file opens in a new tab.
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragDepth((n) => Math.max(0, n - 1));
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragDepth(0);
                if (parsing) return;
                const f = e.dataTransfer?.files?.[0];
                if (!f) {
                  toast.warning("No se detectó ningún archivo. Intenta de nuevo.");
                  return;
                }
                const lower = f.name.toLowerCase();
                if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
                  toast.error("Solo se permiten archivos .xlsx o .xls");
                  return;
                }
                handleFile(f);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !parsing) {
                  e.preventDefault();
                  fileRef.current?.click();
                }
              }}
              className={cn(
                "border-2 border-dashed rounded-xl p-10 text-center space-y-3 transition-colors cursor-pointer select-none outline-none",
                dragDepth > 0
                  ? "border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/30"
                  : "border-border hover:border-primary/50 hover:bg-muted/30",
                parsing && "cursor-wait opacity-70",
              )}
            >
              <Download className={cn(
                "h-10 w-10 mx-auto rotate-180 transition-opacity",
                dragDepth > 0 ? "opacity-80 text-emerald-500" : "opacity-30",
              )} />
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">
                  {dragDepth > 0
                    ? "Suelta el archivo para procesarlo"
                    : "Arrastra el Excel aquí, o haz clic para elegir"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Acepta <code className="font-mono">.xlsx</code> · <code className="font-mono">.xls</code>
                </div>
              </div>
              {/* Hidden native input — the drop zone div proxies clicks
                  here so the OS file picker still works as a fallback. */}
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
                disabled={parsing}
                className="sr-only"
              />
              {parsing && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Procesando archivo...
                </div>
              )}
            </div>
          ) : (
            <>
              {/* File summary + horizontal capacity comparison. The grid
                  is fixed-height (h-20 / h-24) so the layout never shifts
                  between empty + populated states. */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-xl border bg-card p-3 flex items-center gap-3 min-w-0 md:col-span-1">
                  <FileSpreadsheet className="h-5 w-5 text-emerald-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{fileName}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      Hoja "{sheetName}" · {rows.length.toLocaleString("es-MX")} filas
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={reset} className="shrink-0">
                    Cambiar
                  </Button>
                </div>
                <TotalStat label="Bultos actuales" value={currentStorageTotal} accent="muted" />
                <TotalStat
                  label="Bultos en archivo"
                  value={targetStorageTotal}
                  accent={isStaleUpload ? "red" : "emerald"}
                  delta={targetStorageTotal - currentStorageTotal}
                />
              </div>

              {/* Sheet picker — only when the workbook has more than one
                  candidate. One pill per candidate; clicking switches
                  the active rows + diff preview without re-reading the
                  file. Default auto-pick still happens on load. */}
              {candidates.length > 1 && (
                <div className="rounded-xl border bg-card p-3 flex items-center gap-3 flex-wrap">
                  <div className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground shrink-0">
                    Hoja a importar
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {candidates.map((c) => {
                      const isActive = c.name === sheetName;
                      return (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() => activateCandidate(c.name, candidates)}
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs font-medium transition",
                            isActive
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/50 ring-2 ring-emerald-500/30"
                              : "border-border text-muted-foreground hover:bg-muted/30",
                          )}
                          title={`${c.rows.length.toLocaleString("es-MX")} filas con cantidad`}
                        >
                          <span className="font-mono">{c.name}</span>
                          <span className="ml-1.5 opacity-70 tabular-nums">
                            ({c.rows.length.toLocaleString("es-MX")})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Replace-semantics banner. Always shown so the user
                  remembers this is wipe-and-replace, not diff-merge. */}
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-3 text-xs">
                <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold text-amber-700 dark:text-amber-300">
                    Reemplazo total del inventario de almacenamiento
                  </div>
                  <div className="text-muted-foreground">
                    Esto borra todas las filas actuales de las posiciones de almacenamiento (A / B / C) y las reemplaza con lo que está en este archivo.
                    Las posiciones de <span className="font-semibold">Recibo</span> y <span className="font-semibold">Embarque</span> NO se tocan.
                    Antes de aplicar se guarda un snapshot automático para poder consultar el estado anterior desde el selector de fecha.
                  </div>
                </div>
              </div>

              {/* Stale-upload disclaimer — only when the new total is
                  far below the current one. Requires explicit ack. */}
              {isStaleUpload && (
                <div className="rounded-xl border-2 border-red-500/50 bg-red-500/10 p-3 space-y-2">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <div className="text-xs space-y-1">
                      <div className="font-semibold text-red-700 dark:text-red-300">
                        Posible archivo desactualizado
                      </div>
                      <div className="text-muted-foreground">
                        El archivo contiene <span className="font-bold tabular-nums">{targetStorageTotal.toLocaleString("es-MX")}</span> bultos contra <span className="font-bold tabular-nums">{currentStorageTotal.toLocaleString("es-MX")}</span> bultos en el sistema (caída de <span className="font-bold tabular-nums">{Math.round((1 - targetStorageTotal / Math.max(currentStorageTotal, 1)) * 100)}%</span>).
                        Si subes un Excel viejo por equivocación, perderías el trabajo de hoy.
                      </div>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-medium pl-8">
                    <input
                      type="checkbox"
                      checked={staleAck}
                      onChange={(e) => setStaleAck(e.target.checked)}
                      className="h-4 w-4 accent-red-500"
                    />
                    Sí, este archivo refleja el inventario actual del almacén
                  </label>
                </div>
              )}

              {/* Diff counts as filter chips */}
              <div className="flex flex-wrap gap-2">
                <FilterChip
                  active={statusFilter === "all"}
                  onClick={() => setStatusFilter("all")}
                  label={`Todos (${diff.length})`}
                  className="bg-muted/40 border-border"
                />
                {(["insert", "update", "delete", "unmatched_sku", "unknown_slot"] as DiffStatus[])
                  .filter((s) => diffCounts[s] > 0)
                  .map((s) => (
                    <FilterChip
                      key={s}
                      active={statusFilter === s}
                      onClick={() =>
                        setStatusFilter(statusFilter === s ? "all" : s)
                      }
                      label={`${STATUS_META[s].label} (${diffCounts[s]})`}
                      className={STATUS_META[s].chip}
                    />
                  ))}
              </div>

              {/* Diff table */}
              {diff.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground flex flex-col items-center gap-2 border rounded-lg">
                  <CheckCircle2 className="h-8 w-8 opacity-50 text-emerald-500" />
                  No hay cambios — el inventario coincide con el archivo
                </div>
              ) : (
                <div className="border rounded-lg overflow-x-auto max-h-[420px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card border-b">
                      <tr className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <th className="text-left px-3 py-2">Estado</th>
                        <th className="text-left px-3 py-2">Posición</th>
                        <th className="text-left px-3 py-2">SKU</th>
                        <th className="text-left px-3 py-2">Producto / Lote</th>
                        <th className="text-right px-3 py-2">Cant.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {visibleDiff.map((d) => {
                        const meta = STATUS_META[d.status];
                        return (
                          <tr key={d.key} className="hover:bg-muted/20">
                            <td className="px-3 py-2">
                              <Badge
                                variant="outline"
                                className={cn("text-[10px] font-semibold gap-1", meta.chip)}
                              >
                                {meta.icon}
                                {meta.label}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                              {d.slot_code}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-primary">
                              {d.sku ?? <span className="text-muted-foreground italic">—</span>}
                            </td>
                            <td className="px-3 py-2 min-w-[280px]">
                              <div className="truncate max-w-[320px]">
                                {d.description ?? "—"}
                              </div>
                              {d.lote && (
                                <div className="text-[10px] text-muted-foreground font-mono">
                                  Lote {d.lote}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-bold tabular-nums whitespace-nowrap">
                              {d.status === "update" ? (
                                <>
                                  <span className="text-muted-foreground line-through mr-1">
                                    {d.old_qty}
                                  </span>
                                  {d.new_qty}
                                </>
                              ) : d.status === "delete" ? (
                                <span className="text-red-600 dark:text-red-400">
                                  -{d.old_qty}
                                </span>
                              ) : (
                                d.new_qty
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="px-6 py-3 border-t shrink-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={applying}
          >
            Cancelar
          </Button>
          <Button
            onClick={apply}
            disabled={
              applying ||
              rows.length === 0 ||
              (isStaleUpload && !staleAck)
            }
            className={cn(
              "min-w-[220px] gap-1.5",
              // Destructive intent: red button so the action's severity
              // matches the brand rule on color-coding confirm buttons.
              "bg-red-500 hover:bg-red-600 text-white",
            )}
          >
            {applying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Reemplazando...
              </>
            ) : rows.length === 0 ? (
              "Sin filas"
            ) : (
              <>
                <ShieldAlert className="h-4 w-4" />
                Reemplazar inventario ({rows.length.toLocaleString("es-MX")} filas)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilterChip({
  active, onClick, label, className,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition",
        active ? `${className} ring-2 ring-primary/40` : "border-border text-muted-foreground hover:bg-muted/30",
      )}
    >
      {label}
    </button>
  );
}

/** Brand stat tile — icon chip on the left, tabular value + small label
 *  on the right. Used for the pre/post totals in the file summary row.
 *  Always renders at the same height so the surrounding grid doesn't
 *  shift between "no delta" and "big delta" states. */
function TotalStat({
  label, value, accent = "muted", delta,
}: {
  label: string;
  value: number;
  accent?: "muted" | "emerald" | "red";
  delta?: number;
}) {
  const styles = {
    muted:   { bg: "bg-muted/40",          text: "text-muted-foreground", val: "text-foreground" },
    emerald: { bg: "bg-emerald-500/15",    text: "text-emerald-500",      val: "text-emerald-700 dark:text-emerald-400" },
    red:     { bg: "bg-red-500/15",        text: "text-red-500",          val: "text-red-700 dark:text-red-400" },
  }[accent];
  return (
    <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-3 min-w-0 h-full">
      <div className={cn("p-2 rounded-lg shrink-0", styles.bg, styles.text)}>
        <Camera className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn("text-xl font-bold tabular-nums leading-tight truncate", styles.val)}>
          {value.toLocaleString("es-MX")}
          {delta != null && delta !== 0 && (
            <span className={cn(
              "ml-2 text-xs font-semibold tabular-nums",
              delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
            )}>
              {delta > 0 ? "+" : ""}{delta.toLocaleString("es-MX")}
            </span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground truncate">{label}</div>
      </div>
    </div>
  );
}
