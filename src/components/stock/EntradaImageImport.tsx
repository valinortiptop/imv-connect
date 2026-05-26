// @ts-nocheck
/**
 * EntradaImageImport
 *
 * Drop-or-paste a supplier confirmation screenshot (ADM today, others
 * tomorrow). The image is uploaded to storage as proof, OCR'd via the
 * ocr-entrada-image edge function, and the parsed rows are surfaced
 * in an editable review form before save.
 *
 * Features per the spec:
 *   • Proper drop zone — drag-over highlight, dragDepth counter so
 *     the highlight doesn't flicker on child elements, preventDefault
 *     on dragover (this is what made the old paste-data flow lose the
 *     file: native input + no dragover preventDefault = browser opens
 *     the file in a new tab). Click-to-select fallback. Clipboard
 *     paste also routed here.
 *   • Review step — every row editable. Unknown SKUs glow red and
 *     block save. Low-confidence rows glow yellow.
 *   • "Cortesía" toggle per row → zeroes cost, sets is_gifted, locks
 *     cost input.
 *   • "+ Agregar línea" button per row for the same-SKU mixed
 *     paid+gifted case.
 *   • Suggested sale price per row: cost_with_iva × 1.085. Click
 *     "Aplicar" to overwrite products.sale_price_with_iva.
 *   • Save creates one stock_deliveries row + N stock_entries rows
 *     with cost + is_gifted populated, plus adm_proof_path on the
 *     parent delivery.
 */

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import { todayMx } from "@/lib/date-utils";
import {
  Upload,
  Image as ImageIcon,
  Loader2,
  AlertTriangle,
  Plus,
  Trash2,
  Gift,
  Check,
  X,
  Pencil,
  CalendarIcon,
  CheckCircle2,
  Building2,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** Each editable row in the review table. After OCR runs, the
 *  edge function's rows are mapped into this shape. The user can
 *  edit any field, mark gifted, or add a second line for the same
 *  SKU (mixed paid + gifted case). */
interface ReviewRow {
  /** UI id only — never sent to DB. */
  uiId: string;
  clave: string;
  description: string;
  product_id: string | null;          // resolved against products on edit
  product_sale_price: number | null;  // current sale_price_with_iva in DB
  product_image_url: string | null;   // thumbnail
  /** Canonical cost from margins — used to flag cost changes vs the
   *  new entrada cost. */
  product_cost_with_iva: number | null;
  cost_without_iva: number | null;
  cost_with_iva: number | null;
  quantity: number;
  kilos: number | null;
  is_gifted: boolean;
  /** Original OCR'd clave when an alias rewrite happened (e.g. the
   *  supplier sent MX023262 and we mapped it to canonical MX023261).
   *  Drives the small "alias de X" badge in the row. */
  alias_from: string | null;
  /** Editable target sale price the user is about to apply. Defaults
   *  to product_sale_price (so it shows what's already there); the
   *  user can override and click Apply. */
  edited_price: number | null;
  /** "low" = OCR uncertain (renders yellow). Independent from
   *  unknown-SKU block which renders red. */
  confidence: "high" | "low";
}

interface Props {
  /** Triggered after a successful save. Parent should refetch lists
   *  and close the dialog. */
  onSaved: () => void;
}

const REGULAR_MARGIN = 0.085;       // 8.5 % regular margin on top of cost_with_iva
const PROOF_BUCKET = "stock-delivery-documents";

function newUiId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function fmtMXN(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-MX", {
    style: "currency", currency: "MXN", minimumFractionDigits: 2,
  }).format(n);
}

export function EntradaImageImport({ onSaved }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  // Drop-zone state
  const [dragDepth, setDragDepth] = useState(0);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);

  // Review state
  const [supplier, setSupplier] = useState("");
  const [deliveryDate, setDeliveryDate] = useState<Date>(new Date());
  const [rows, setRows] = useState<ReviewRow[]>([]);

  // Active products catalog for SKU resolution. The OCR returns claves;
  // we map them against products.clave to resolve product_id + sale price.
  // Pull cost from `margins` alongside the product fields so we can
  // flag "the supplier raised/dropped this SKU's cost since last time".
  // margins is 1-to-1 with products via the `margins_product_id_fkey`,
  // so Supabase nests it as an object.
  const { data: catalog = [] } = useQuery({
    queryKey: ["entrada-products-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, clave, name, sale_price_with_iva, image_url, margins(cost_with_iva, cost_without_iva)")
        .eq("active", true);
      if (error) throw error;
      return (data ?? []).map((p: any) => {
        // Supabase returns margins either as array or single obj depending
        // on relationship inference. Normalize to a single record.
        const m = Array.isArray(p.margins) ? p.margins[0] : p.margins;
        return {
          id: p.id as string,
          clave: p.clave as string,
          name: p.name as string,
          sale_price_with_iva: (p.sale_price_with_iva ?? null) as number | null,
          image_url: (p.image_url ?? null) as string | null,
          cost_with_iva: (m?.cost_with_iva ?? null) as number | null,
          cost_without_iva: (m?.cost_without_iva ?? null) as number | null,
        };
      });
    },
    staleTime: 5 * 60 * 1000,
  });

  // SKU aliases — alternate supplier codes that map to a canonical
  // product (e.g. ADM emits MX023262 for the same SKU as MX023261).
  // We swap aliased claves on hydration so the row resolves against
  // the canonical product, and merge identical resulting rows so the
  // user sees ONE line per canonical SKU.
  const { data: aliases = [] } = useQuery({
    queryKey: ["sku-aliases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sku_aliases")
        .select("alias_clave, canonical_clave");
      if (error) throw error;
      return (data ?? []) as Array<{ alias_clave: string; canonical_clave: string }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  /** alias_clave (UPPER) → canonical_clave (UPPER). */
  const aliasMap = (() => {
    const m = new Map<string, string>();
    for (const a of aliases) {
      m.set(a.alias_clave.toUpperCase(), a.canonical_clave.toUpperCase());
    }
    return m;
  })();

  /** Resolve OCR rows against the catalog. Sets product_id when found,
   *  leaves null when unknown (UI shows red + blocks save). */
  const hydrateRows = (raw: any[]): ReviewRow[] => {
    const byClave = new Map<string, {
      id: string; sale: number | null; img: string | null;
      cost_with_iva: number | null;
    }>();
    for (const p of catalog) byClave.set(p.clave.toUpperCase(), {
      id: p.id, sale: p.sale_price_with_iva, img: p.image_url,
      cost_with_iva: p.cost_with_iva,
    });
    const built: ReviewRow[] = raw.map((r): ReviewRow => {
      const claveRaw = String(r.clave ?? "").trim().toUpperCase();
      // Alias swap — if the OCR'd clave is an alternate, substitute
      // the canonical one and remember the original for the badge.
      const canonical = aliasMap.get(claveRaw);
      const claveResolved = canonical ?? claveRaw;
      const claveLookup = byClave.get(claveResolved);
      const costWithIva = typeof r.cost_with_iva === "number" ? r.cost_with_iva : null;
      // Existing product → keep the DB sale price as-is (don't drift by
      // cents every time a cost moves). New product → prefill with the
      // 8.5 % suggestion so there's a starting point.
      const fallbackSuggested = costWithIva != null && costWithIva > 0
        ? Math.round(costWithIva * (1 + REGULAR_MARGIN) * 100) / 100
        : null;
      return {
        uiId: newUiId(),
        clave: claveResolved,
        description: String(r.description ?? "").trim(),
        product_id: claveLookup?.id ?? null,
        product_sale_price: claveLookup?.sale ?? null,
        product_image_url: claveLookup?.img ?? null,
        product_cost_with_iva: claveLookup?.cost_with_iva ?? null,
        cost_without_iva: typeof r.cost_without_iva === "number" ? r.cost_without_iva : null,
        cost_with_iva:    costWithIva,
        quantity:         typeof r.piezas === "number"          ? r.piezas          : 0,
        kilos:            typeof r.kilos === "number"           ? r.kilos           : null,
        is_gifted: false,
        alias_from: canonical ? claveRaw : null,
        edited_price: claveLookup?.sale ?? fallbackSuggested,
        confidence: r.confidence === "low" ? "low" : "high",
      };
    });

    // Auto-merge: when two rows resolve to the same product AND have
    // identical cost + gifted flag, combine them into one row (sum
    // quantity + kilos). This is the ADM case where MX023261 + MX023262
    // both show up with the same cost and we want a single canonical
    // line of 50 piezas instead of two lines of 25.
    const merged: ReviewRow[] = [];
    for (const row of built) {
      const twin = row.product_id
        ? merged.find(m =>
            m.product_id === row.product_id &&
            m.is_gifted === row.is_gifted &&
            // null-safe numeric equality
            Math.abs((m.cost_with_iva ?? 0) - (row.cost_with_iva ?? 0)) < 0.005 &&
            Math.abs((m.cost_without_iva ?? 0) - (row.cost_without_iva ?? 0)) < 0.005,
          )
        : null;
      if (twin) {
        twin.quantity += row.quantity;
        twin.kilos = (twin.kilos ?? 0) + (row.kilos ?? 0) || twin.kilos;
        // Remember the alias on the merged row so the badge shows.
        if (row.alias_from && !twin.alias_from) twin.alias_from = row.alias_from;
        if (row.alias_from && twin.alias_from && twin.alias_from !== row.alias_from) {
          twin.alias_from = `${twin.alias_from},${row.alias_from}`;
        }
      } else {
        merged.push(row);
      }
    }
    return merged;
  };

  // ── File handling ────────────────────────────────────────────────
  const acceptImage = async (file: File) => {
    const okType = /^image\/(png|jpe?g|webp)$/i.test(file.type);
    if (!okType) {
      toast.error("Solo .png o .jpg");
      return;
    }
    setOcrError(null);
    setImageFile(file);
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    setImageDataUrl(dataUrl);
    await runOcr(dataUrl, file.type || "image/png");
  };

  const runOcr = async (dataUrl: string, mediaType: string) => {
    setOcrRunning(true);
    setOcrError(null);
    setRows([]);
    try {
      const { data, error } = await (supabase as any).functions.invoke("ocr-entrada-image", {
        body: { image_base64: dataUrl, media_type: mediaType },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const ocrRows = Array.isArray(data?.rows) ? data.rows : [];
      if (ocrRows.length === 0) {
        setOcrError("No se detectaron filas. Verifica que la imagen muestre la tabla del proveedor.");
        return;
      }
      setRows(hydrateRows(ocrRows));
      if (data?.supplier) setSupplier(data.supplier);
      if (data?.delivery_date) {
        try {
          const d = new Date(data.delivery_date + "T00:00:00");
          if (!isNaN(d.getTime())) setDeliveryDate(d);
        } catch { /* keep default */ }
      }
      toast.success(`${ocrRows.length} producto${ocrRows.length === 1 ? "" : "s"} detectado${ocrRows.length === 1 ? "" : "s"}`);
    } catch (err: any) {
      setOcrError(err?.message ?? "Error al procesar la imagen");
      toast.error("Error al procesar: " + (err?.message ?? "desconocido"));
    } finally {
      setOcrRunning(false);
    }
  };

  // Clipboard paste handler — also routes images through OCR.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      for (const item of Array.from(e.clipboardData.items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            void acceptImage(file);
            return;
          }
        }
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog]);

  // ── Row mutations ────────────────────────────────────────────────
  const updateRow = (uiId: string, patch: Partial<ReviewRow>) => {
    setRows(rs => rs.map(r => {
      if (r.uiId !== uiId) return r;
      const next = { ...r, ...patch };
      // Re-resolve product_id when clave changes — including alias swap
      // so manual edits get the same MX023262→MX023261 treatment.
      if (patch.clave !== undefined && patch.clave !== r.clave) {
        const typedUpper = patch.clave!.toUpperCase();
        const canonical = aliasMap.get(typedUpper);
        const claveResolved = canonical ?? typedUpper;
        const found = catalog.find(p => p.clave.toUpperCase() === claveResolved);
        next.clave = claveResolved;
        next.alias_from = canonical ? typedUpper : null;
        next.product_id = found?.id ?? null;
        next.product_sale_price = found?.sale_price_with_iva ?? null;
        next.product_image_url = found?.image_url ?? null;
        next.product_cost_with_iva = found?.cost_with_iva ?? null;
        next.edited_price = found?.sale_price_with_iva ?? next.edited_price;
      }
      // Cortesía → force cost to 0
      if (patch.is_gifted === true) {
        next.cost_with_iva = 0;
        next.cost_without_iva = 0;
      }
      return next;
    }));
  };

  const removeRow = (uiId: string) => setRows(rs => rs.filter(r => r.uiId !== uiId));

  /** "Agregar línea" for the same SKU — used when an entrada has
   *  paid + gifted units of the SAME product. New row pre-filled
   *  with the same SKU + qty=0 + is_gifted=true so the user just
   *  fills the gifted quantity. */
  const addGiftLineFor = (uiId: string) => {
    const src = rows.find(r => r.uiId === uiId);
    if (!src) return;
    const insertIdx = rows.findIndex(r => r.uiId === uiId);
    const gift: ReviewRow = {
      uiId: newUiId(),
      clave: src.clave,
      description: src.description,
      product_id: src.product_id,
      product_sale_price: src.product_sale_price,
      product_image_url: src.product_image_url,
      product_cost_with_iva: src.product_cost_with_iva,
      cost_without_iva: 0,
      cost_with_iva: 0,
      quantity: 0,
      kilos: null,
      is_gifted: true,
      alias_from: null, // the gift line is fresh — no original alias
      edited_price: src.edited_price,
      confidence: "high",
    };
    setRows(rs => [...rs.slice(0, insertIdx + 1), gift, ...rs.slice(insertIdx + 1)]);
  };

  // ── Sale price apply (with undo) ────────────────────────────────
  /** Writes `newPrice` to products.sale_price_with_iva, syncs all
   *  rows sharing the same product_id, and shows a toast with a
   *  "Deshacer" action that reverts the change (within the toast
   *  lifetime). The previous price is captured before the update so
   *  undo always works even if the user edits other rows after. */
  const applyEditedPrice = async (row: ReviewRow) => {
    if (!row.product_id || row.edited_price == null || row.edited_price <= 0) return;
    const newPrice = Math.round(row.edited_price * 100) / 100;
    const previousPrice = row.product_sale_price; // captured before update

    const { error } = await (supabase as any)
      .from("products")
      .update({ sale_price_with_iva: newPrice })
      .eq("id", row.product_id);
    if (error) {
      toast.error("Error al aplicar precio: " + error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["entrada-products-catalog"] });
    setRows(rs => rs.map(r =>
      r.product_id === row.product_id
        ? { ...r, product_sale_price: newPrice, edited_price: newPrice }
        : r,
    ));

    const undo = async () => {
      const { error: undoErr } = await (supabase as any)
        .from("products")
        .update({ sale_price_with_iva: previousPrice })
        .eq("id", row.product_id);
      if (undoErr) {
        toast.error("No se pudo deshacer: " + undoErr.message);
        return;
      }
      qc.invalidateQueries({ queryKey: ["entrada-products-catalog"] });
      setRows(rs => rs.map(r =>
        r.product_id === row.product_id
          ? { ...r, product_sale_price: previousPrice, edited_price: previousPrice }
          : r,
      ));
      toast.success(
        previousPrice != null
          ? `Precio revertido a ${fmtMXN(previousPrice)}`
          : "Precio anterior restaurado",
      );
    };

    toast.success(`Precio actualizado: ${fmtMXN(newPrice)}`, {
      duration: 8000,
      action: { label: "Deshacer", onClick: () => { void undo(); } },
    });
  };

  // ── Validation + save ────────────────────────────────────────────
  const hasUnknown = rows.some(r => !r.product_id);
  const hasInvalidQty = rows.some(r => !Number.isFinite(r.quantity) || r.quantity <= 0);
  const canSave = rows.length > 0 && !hasUnknown && !hasInvalidQty && !!imageFile;

  const save = useMutation({
    mutationFn: async () => {
      if (!imageFile) throw new Error("Falta la imagen");
      // 1. Upload the proof image
      const ts = Date.now();
      const safeSupplier = (supplier || "proveedor").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24);
      const ext = (imageFile.name.split(".").pop() || "png").toLowerCase();
      const path = `entrada_proof/${ts}_${safeSupplier}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(PROOF_BUCKET)
        .upload(path, imageFile, { contentType: imageFile.type || "image/png", upsert: false });
      if (upErr) throw upErr;

      // 2. Insert the delivery row with adm_proof_path. We DO NOT pass
      // delivery_code — the `trg_delivery_code` BEFORE INSERT trigger
      // assigns the next sequential E-XXXX (matches the manual flow).
      //
      // Status follows the date (same rule as Manual tab): future →
      // Programado, today/past → Recibido. Hardcoding Recibido here
      // was the bug that quietly marked Bedisa promos for next week
      // as already received.
      const dateStr = format(deliveryDate, "yyyy-MM-dd");
      const todayStr = todayMx();
      const derivedStatus: "Recibido" | "Programado" =
        dateStr > todayStr ? "Programado" : "Recibido";
      const { data: delivery, error: dErr } = await (supabase as any)
        .from("stock_deliveries")
        .insert({
          delivery_date: dateStr,
          supplier: supplier.trim() || null,
          adm_proof_path: path,
          delivery_status: derivedStatus,
        })
        .select("id")
        .single();
      if (dErr) throw dErr;

      // 4. Insert all entries (paid + gifted) under this delivery
      const entries = rows.map(r => ({
        delivery_id: delivery.id,
        product_id: r.product_id,
        quantity: r.quantity,
        entry_date: dateStr,
        entry_status: derivedStatus,
        supplier: supplier.trim() || null,
        cost_with_iva:    r.is_gifted ? 0 : r.cost_with_iva,
        cost_without_iva: r.is_gifted ? 0 : r.cost_without_iva,
        is_gifted: r.is_gifted,
        effective_weight_kg: r.kilos ?? null,
      }));
      const { error: eErr } = await supabase.from("stock_entries").insert(entries as any);
      if (eErr) throw eErr;

      return { entriesCount: entries.length };
    },
    onSuccess: ({ entriesCount }) => {
      toast.success(`${entriesCount} producto${entriesCount === 1 ? "" : "s"} guardado${entriesCount === 1 ? "" : "s"} en nueva entrada`);
      qc.invalidateQueries({ queryKey: ["delivery-summary"] });
      qc.invalidateQueries({ queryKey: ["entradas-pending-recibo"] });
      onSaved();
    },
    onError: (err: any) => {
      toast.error("Error al guardar: " + (err?.message ?? "desconocido"));
    },
  });

  const reset = () => {
    setImageFile(null);
    setImageDataUrl(null);
    setRows([]);
    setOcrError(null);
  };

  return (
    <div className="space-y-5">
      {/* Drop zone — visible whenever no image is loaded, plus a tiny
          "Cambiar imagen" button when one is. */}
      {!imageDataUrl ? (
        <div
          onClick={() => fileRef.current?.click()}
          onDragEnter={(e) => {
            e.preventDefault(); e.stopPropagation();
            if (ocrRunning) return;
            setDragDepth((n) => n + 1);
          }}
          onDragOver={(e) => {
            // CRITICAL — preventDefault on dragover is what tells the
            // browser this is a drop target. Without it, the file
            // opens in a new tab and the dialog flickers.
            e.preventDefault(); e.stopPropagation();
            if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={(e) => {
            e.preventDefault(); e.stopPropagation();
            setDragDepth((n) => Math.max(0, n - 1));
          }}
          onDrop={(e) => {
            e.preventDefault(); e.stopPropagation();
            setDragDepth(0);
            if (ocrRunning) return;
            const f = e.dataTransfer?.files?.[0];
            if (!f) {
              toast.warning("No se detectó imagen");
              return;
            }
            void acceptImage(f);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !ocrRunning) {
              e.preventDefault();
              fileRef.current?.click();
            }
          }}
          className={cn(
            "border-2 border-dashed rounded-xl p-10 text-center space-y-3 transition-colors cursor-pointer select-none outline-none",
            dragDepth > 0
              ? "border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/30"
              : "border-border hover:border-primary/50 hover:bg-muted/30",
            ocrRunning && "cursor-wait opacity-70",
          )}
        >
          <Upload className={cn(
            "h-12 w-12 mx-auto transition-opacity",
            dragDepth > 0 ? "opacity-80 text-emerald-500" : "opacity-30",
          )} />
          <div className="space-y-1">
            <div className="text-base font-semibold text-foreground">
              {dragDepth > 0
                ? "Suelta la imagen para procesarla"
                : "Arrastra la confirmación del proveedor"}
            </div>
            <div className="text-xs text-muted-foreground">
              También puedes pegar (<kbd className="px-1 py-0.5 rounded border text-[10px]">⌘V</kbd>) o hacer clic para elegir
            </div>
            <div className="text-[11px] text-muted-foreground">
              <code className="font-mono">.png</code> · <code className="font-mono">.jpg</code>
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void acceptImage(f);
            }}
            disabled={ocrRunning}
            className="sr-only"
          />
          {ocrRunning && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground pt-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Leyendo la imagen…
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Header row: thumbnail + supplier + date + change button */}
          <div className="rounded-xl border bg-card p-3 flex items-center gap-3 flex-wrap">
            <img
              src={imageDataUrl}
              alt="Confirmación del proveedor"
              className="h-16 w-24 object-cover rounded border"
            />
            <div className="flex-1 min-w-[200px] grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                  <Building2 className="h-3 w-3 inline mr-1" />
                  Proveedor
                </Label>
                <Input
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="ADM"
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                  Fecha de entrada
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal h-9">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(deliveryDate, "dd/MM/yy", { locale: esLocale })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={deliveryDate} onSelect={(d) => { if (d) setDeliveryDate(d); }} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={reset} className="shrink-0 gap-1.5">
              <ImageIcon className="h-4 w-4" /> Cambiar imagen
            </Button>
          </div>

          {/* OCR error state */}
          {ocrError && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold text-red-700 dark:text-red-300">No se pudo leer la imagen</div>
                <div className="text-xs text-muted-foreground">{ocrError}</div>
                <Button variant="outline" size="sm" onClick={reset} className="mt-1">
                  Intentar con otra imagen
                </Button>
              </div>
            </div>
          )}

          {/* OCR loading skeletons over the same area so the layout doesn't jump */}
          {ocrRunning && (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          )}

          {/* Review table */}
          {rows.length > 0 && !ocrRunning && (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {rows.filter(r => r.product_id).length} producto{rows.filter(r => r.product_id).length === 1 ? "" : "s"} válido{rows.filter(r => r.product_id).length === 1 ? "" : "s"}
                </Badge>
                {hasUnknown && (
                  <Badge variant="outline" className="bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {rows.filter(r => !r.product_id).length} SKU no encontrado
                  </Badge>
                )}
                {rows.some(r => r.is_gifted) && (
                  <Badge variant="outline" className="bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/40">
                    <Gift className="h-3 w-3 mr-1" />
                    {rows.filter(r => r.is_gifted).length} cortesía
                  </Badge>
                )}
                <Badge variant="outline" className="ml-auto tabular-nums">
                  Total: {rows.reduce((s, r) => s + (r.quantity || 0), 0)} bultos
                </Badge>
              </div>

              <div className="rounded-xl border bg-card overflow-hidden">
                <div className="max-h-[420px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card border-b z-10">
                      <tr className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <th className="text-left px-2 py-2 w-[110px]">SKU</th>
                        <th className="text-left px-2 py-2">Producto</th>
                        <th className="text-right px-2 py-2 w-[100px]">Piezas</th>
                        <th className="text-right px-2 py-2 w-[110px]">Costo s/IVA</th>
                        <th className="text-right px-2 py-2 w-[130px]">Costo c/IVA</th>
                        <th className="text-center px-2 py-2 w-[80px]">Cortesía</th>
                        <th className="text-right px-2 py-2 w-[180px]">Precio venta</th>
                        <th className="px-2 py-2 w-[80px]"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {rows.map((r) => {
                        const unknown = !r.product_id;
                        const lowConf = r.confidence === "low";
                        const suggested = (r.cost_with_iva ?? 0) > 0
                          ? Math.round(r.cost_with_iva! * (1 + REGULAR_MARGIN) * 100) / 100
                          : null;
                        return (
                          <tr
                            key={r.uiId}
                            className={cn(
                              "hover:bg-muted/20",
                              unknown && "bg-red-500/[0.04]",
                              !unknown && lowConf && "bg-amber-500/[0.05]",
                              r.is_gifted && !unknown && "bg-purple-500/[0.04]",
                            )}
                          >
                            <td className="px-2 py-2">
                              <div className="flex flex-col gap-1">
                                <Input
                                  value={r.clave}
                                  onChange={(e) => updateRow(r.uiId, { clave: e.target.value.toUpperCase() })}
                                  className={cn(
                                    "h-8 font-mono text-xs",
                                    unknown && "border-red-500/60 focus-visible:ring-red-500/30",
                                  )}
                                />
                                {r.alias_from && (
                                  <span
                                    className="text-[9px] font-mono text-blue-700 dark:text-blue-300 bg-blue-500/10 border border-blue-500/30 rounded px-1 py-0.5 self-start"
                                    title={`SKU equivalente: el proveedor envió ${r.alias_from}, mapeado al canónico ${r.clave}`}
                                  >
                                    ← {r.alias_from}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-2">
                              {unknown ? (
                                <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400 text-xs">
                                  <AlertTriangle className="h-3 w-3 shrink-0" />
                                  <span className="font-medium">SKU no existe en catálogo</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  {r.product_image_url ? (
                                    <img
                                      src={r.product_image_url}
                                      alt=""
                                      className="h-9 w-9 rounded object-contain bg-white shrink-0 border"
                                    />
                                  ) : (
                                    <div className="h-9 w-9 rounded bg-muted/40 shrink-0 border flex items-center justify-center">
                                      <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
                                    </div>
                                  )}
                                  <div className="text-sm leading-tight line-clamp-2 min-w-0">
                                    {r.description}
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-2">
                              <Input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                value={r.quantity || ""}
                                onChange={(e) => updateRow(r.uiId, { quantity: parseInt(e.target.value) || 0 })}
                                className="h-8 text-right tabular-nums px-2"
                              />
                            </td>
                            <td className="px-2 py-2">
                              <Input
                                type="number"
                                step="0.01"
                                min={0}
                                value={r.cost_without_iva ?? ""}
                                onChange={(e) => updateRow(r.uiId, {
                                  cost_without_iva: e.target.value === "" ? null : parseFloat(e.target.value),
                                })}
                                disabled={r.is_gifted}
                                className="h-8 text-right tabular-nums"
                              />
                            </td>
                            <td className="px-2 py-2">
                              <div className="flex flex-col gap-1 items-end">
                                <Input
                                  type="number"
                                  step="0.01"
                                  min={0}
                                  value={r.cost_with_iva ?? ""}
                                  onChange={(e) => updateRow(r.uiId, {
                                    cost_with_iva: e.target.value === "" ? null : parseFloat(e.target.value),
                                  })}
                                  disabled={r.is_gifted}
                                  className="h-8 text-right tabular-nums"
                                />
                                <CostChangeFlag
                                  prev={r.product_cost_with_iva}
                                  next={r.cost_with_iva}
                                  isGifted={r.is_gifted}
                                />
                              </div>
                            </td>
                            <td className="px-2 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => updateRow(r.uiId, { is_gifted: !r.is_gifted })}
                                className={cn(
                                  "rounded-md border px-2 py-1 text-[10px] font-semibold transition",
                                  r.is_gifted
                                    ? "bg-purple-500 text-white border-purple-500"
                                    : "border-border text-muted-foreground hover:bg-muted/40",
                                )}
                                title="Marca esta línea como cortesía / regalo (costo = 0)"
                              >
                                <Gift className="h-3 w-3 inline mr-0.5" />
                                {r.is_gifted ? "Sí" : "No"}
                              </button>
                            </td>
                            <td className="px-2 py-2 text-right">
                              {!unknown && !r.is_gifted && (r.cost_with_iva ?? 0) > 0 ? (
                                <PriceCell
                                  row={r}
                                  suggested={suggested}
                                  onChange={(v) => updateRow(r.uiId, { edited_price: v })}
                                  onApply={() => applyEditedPrice(r)}
                                />
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-right">
                              <div className="flex items-center gap-0.5 justify-end">
                                {!unknown && !r.is_gifted && (
                                  <button
                                    type="button"
                                    onClick={() => addGiftLineFor(r.uiId)}
                                    className="rounded-md p-1 hover:bg-muted/40 text-purple-600 dark:text-purple-400"
                                    title="Agregar línea de cortesía para el mismo SKU"
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => removeRow(r.uiId)}
                                  className="rounded-md p-1 hover:bg-muted/40 text-red-600 dark:text-red-400"
                                  title="Eliminar fila"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {hasUnknown && (
                <div className="rounded-md border border-red-500/40 bg-red-500/10 p-2.5 text-xs text-red-700 dark:text-red-300">
                  Hay SKU que no existen en el catálogo. Crea el producto en{" "}
                  <a href="/products" target="_blank" rel="noreferrer" className="underline font-semibold">
                    Productos
                  </a>{" "}
                  (o corrige el código) antes de guardar.
                </div>
              )}

              <div className="flex items-center gap-2 justify-end">
                <Button
                  onClick={() => save.mutate()}
                  disabled={!canSave || save.isPending}
                  className="gap-1.5 min-w-[220px] bg-emerald-500 hover:bg-emerald-600 text-white"
                >
                  {save.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</>
                  ) : (
                    <>Guardar {rows.length} producto{rows.length === 1 ? "" : "s"} como nueva entrada</>
                  )}
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ── CostChangeFlag ──────────────────────────────────────────────────
 * Small chip that fires only when the supplier's new cost c/IVA
 * differs from the canonical cost on `margins`. The user asked for
 * a simple "did the cost change" signal — that's the whole job.
 *
 *  • Cost went UP   → amber chip with ↑ and absolute delta
 *  • Cost went DOWN → emerald chip with ↓ and absolute delta
 *  • New product / no prior cost → nothing (we'd be flagging "vs
 *    nothing" which isn't useful)
 *  • Gifted line   → nothing (cost is forced to 0; not a real change)
 */
function CostChangeFlag({
  prev, next, isGifted,
}: { prev: number | null; next: number | null; isGifted: boolean }) {
  if (isGifted) return null;
  if (prev == null || next == null) return null;
  const delta = next - prev;
  if (Math.abs(delta) < 0.01) return null;
  const up = delta > 0;
  return (
    <span
      className={cn(
        "text-[10px] font-semibold tabular-nums flex items-center gap-0.5 px-1.5 py-0.5 rounded border",
        up
          ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/40"
          : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
      )}
      title={`Costo anterior: ${fmtMXN(prev)} · Costo actual: ${fmtMXN(next)}`}
    >
      {up ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
      {up ? "+" : "−"}{fmtMXN(Math.abs(delta))}
    </span>
  );
}

/* ── PriceCell ───────────────────────────────────────────────────────
 * Two-mode cell:
 *
 *  • Readonly mode (default) — just the price as plain text, plus a
 *    tiny pencil to enter edit mode. For products that already have a
 *    DB price this is the resting state, so cents-level drift can't
 *    sneak in on every entrada.
 *  • Edit mode — input + ✓ / ✗. Margin % shows live while editing so
 *    the user can target a specific margin manually. Suggested price
 *    (cost × 1.085) renders below as a one-click prefill.
 *
 *  Products that have no DB price yet auto-open in edit mode so the
 *  user always lands a sale price on first entrada of a new SKU.
 */
interface PriceCellProps {
  row: ReviewRow;
  suggested: number | null;
  onChange: (v: number | null) => void;
  onApply: () => void;
}

function PriceCell({ row, suggested, onChange, onApply }: PriceCellProps) {
  // Auto-open edit mode if the product has no DB price yet (new SKU
  // case — there's nothing to display readonly).
  const [editing, setEditing] = useState(row.product_sale_price == null);
  const cost = row.cost_with_iva ?? 0;
  const price = row.edited_price ?? null;
  const profitPct = (price != null && cost > 0)
    ? ((price - cost) / cost) * 100
    : null;
  const profitColor = profitPct == null
    ? "text-muted-foreground"
    : profitPct >= 8
      ? "text-emerald-600 dark:text-emerald-400"
      : profitPct >= 0
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";

  if (!editing) {
    return (
      <div className="flex items-center gap-1.5 justify-end group">
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {fmtMXN(row.product_sale_price)}
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded p-1 hover:bg-muted/50 text-muted-foreground hover:text-foreground transition"
          title="Editar precio"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    );
  }

  const handleCancel = () => {
    onChange(row.product_sale_price); // revert to DB value
    setEditing(false);
  };
  const handleApply = () => {
    onApply();
    setEditing(false);
  };

  return (
    <div className="flex flex-col gap-1 items-end">
      <div className="flex items-center gap-1">
        <Input
          type="number"
          step="0.01"
          min={0}
          value={price ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : parseFloat(e.target.value))}
          autoFocus
          className="h-7 w-[88px] text-right tabular-nums px-1.5 text-xs"
        />
        <button
          type="button"
          onClick={handleApply}
          disabled={price == null || price <= 0}
          className="rounded-md p-1 text-emerald-600 hover:bg-emerald-500/15 disabled:opacity-40 disabled:hover:bg-transparent"
          title="Aplicar y guardar"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted/50"
          title="Cancelar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-2 text-[10px] tabular-nums">
        {profitPct != null && (
          <span className={cn("font-semibold", profitColor)}>
            {profitPct >= 0 ? "+" : ""}{profitPct.toFixed(1)}%
          </span>
        )}
        {suggested != null && suggested !== price && (
          <button
            type="button"
            onClick={() => onChange(suggested)}
            className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            title="Usar precio sugerido (cost × 1.085)"
          >
            Sug. {fmtMXN(suggested)}
          </button>
        )}
      </div>
    </div>
  );
}
