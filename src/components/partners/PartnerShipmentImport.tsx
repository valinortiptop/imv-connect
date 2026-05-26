/**
 * PartnerShipmentImport
 *
 * Drop-or-paste an ADM doc photo → OCR → review grid → save as a
 * partner_shipment. Same OCR backbone as the Entradas Imagen flow
 * (calls the `ocr-entrada-image` edge function), but the save target
 * is `partner_shipments` + `partner_shipment_items` instead of
 * `stock_deliveries` + `stock_entries`, and the form carries two
 * partner-specific fields:
 *
 *   • "Cobrado al partner" — what the partner paid us for this truck.
 *     For Tamemes: usually equal to ADM cost (settled monthly via the
 *     separate Liquidación flow).
 *     For GDL: ADM cost + markup. The markup is fully ours, shown live.
 *
 *   • "Pagado el" — when the partner paid (defaults to today). For GDL
 *     this is always immediate. For Tamemes this can be left blank
 *     until they pay.
 *
 * No inventory side-effects: this never touches stock_entries,
 * stock_deliveries, or the cortesía pool.
 */

import { useEffect, useRef, useState, useMemo } from "react";
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
import {
  Upload,
  Image as ImageIcon,
  Loader2,
  AlertTriangle,
  Trash2,
  CalendarIcon,
  CheckCircle2,
  TrendingUp,
  Receipt,
  FileText,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CurrencyInput } from "@/components/partners/CurrencyInput";

interface ReviewRow {
  uiId: string;
  clave: string;
  description: string;
  product_id: string | null;
  product_image_url: string | null;
  cost_without_iva: number | null;
  cost_with_iva: number | null;
  quantity: number;
  kilos: number | null;
  importe: number | null;
  confidence: "high" | "low";
  alias_from: string | null;
}

interface Partner {
  id: string;
  code: string;
  name: string;
  settlement_model: "monthly_split" | "per_shipment_markup";
}

interface Props {
  partner: Partner;
  onSaved: () => void;
}

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

export function PartnerShipmentImport({ partner, onSaved }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  // Drop-zone state
  const [dragDepth, setDragDepth] = useState(0);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);

  // Review state
  const [shipmentDate, setShipmentDate] = useState<Date>(new Date());
  const [rows, setRows] = useState<ReviewRow[]>([]);

  // Partner-specific fields
  const [chargedToPartner, setChargedToPartner] = useState<string>("");
  const [paidAt, setPaidAt] = useState<Date | null>(
    // GDL always pays on the spot — pre-fill today. Tamemes settles
    // monthly so leave blank.
    partner.settlement_model === "per_shipment_markup" ? new Date() : null,
  );
  const [notes, setNotes] = useState("");

  // ── Payment-receipt state ───────────────────────────────────────
  // Banregio (and other banks) screenshot/PDF confirming the partner
  // paid us for this shipment. Runs through a separate edge function
  // (ocr-payment-receipt) and auto-fills the charged/paidAt/reference
  // fields above.
  const [paymentFile, setPaymentFile] = useState<File | null>(null);
  const [paymentPreviewUrl, setPaymentPreviewUrl] = useState<string | null>(null);
  const [paymentOcrRunning, setPaymentOcrRunning] = useState(false);
  const [paymentOcrError, setPaymentOcrError] = useState<string | null>(null);
  const [paymentDragDepth, setPaymentDragDepth] = useState(0);
  const paymentFileRef = useRef<HTMLInputElement>(null);
  const [paymentRef, setPaymentRef] = useState<string>("");
  const [paymentBank, setPaymentBank] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("");

  const { data: catalog = [] } = useQuery({
    queryKey: ["partner-products-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, clave, name, image_url")
        .eq("active", true);
      if (error) throw error;
      return (data ?? []).map((p: any) => ({
        id: p.id as string,
        clave: p.clave as string,
        name: p.name as string,
        image_url: (p.image_url ?? null) as string | null,
      }));
    },
    staleTime: 5 * 60 * 1000,
  });

  // Reuse sku_aliases so partner OCR rows resolve the same as entradas
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

  const aliasMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of aliases) m.set(a.alias_clave.toUpperCase(), a.canonical_clave.toUpperCase());
    return m;
  }, [aliases]);

  /** Map OCR rows → ReviewRow, resolving against catalog + aliases. */
  const hydrateRows = (raw: any[]): ReviewRow[] => {
    const byClave = new Map<string, { id: string; image_url: string | null; name: string }>();
    for (const p of catalog) byClave.set(p.clave.toUpperCase(), {
      id: p.id, image_url: p.image_url, name: p.name,
    });
    return raw.map((r): ReviewRow => {
      const claveRaw = String(r.clave ?? "").trim().toUpperCase();
      const canonical = aliasMap.get(claveRaw);
      const claveResolved = canonical ?? claveRaw;
      const claveLookup = byClave.get(claveResolved);
      return {
        uiId: newUiId(),
        clave: claveResolved,
        description: String(r.description ?? "").trim() || (claveLookup?.name ?? ""),
        product_id: claveLookup?.id ?? null,
        product_image_url: claveLookup?.image_url ?? null,
        cost_without_iva: typeof r.cost_without_iva === "number" ? r.cost_without_iva : null,
        cost_with_iva: typeof r.cost_with_iva === "number" ? r.cost_with_iva : null,
        quantity: typeof r.piezas === "number" ? r.piezas : 0,
        kilos: typeof r.kilos === "number" ? r.kilos : null,
        importe: typeof r.importe === "number" ? r.importe : null,
        confidence: r.confidence === "low" ? "low" : "high",
        alias_from: canonical ? claveRaw : null,
      };
    });
  };

  // ── File handling ────────────────────────────────────────────────
  const acceptImage = async (file: File) => {
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
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
      const hydrated = hydrateRows(ocrRows);
      setRows(hydrated);
      if (data?.delivery_date) {
        try {
          const d = new Date(data.delivery_date + "T00:00:00");
          if (!isNaN(d.getTime())) setShipmentDate(d);
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

  // ── Payment-receipt OCR ─────────────────────────────────────────
  const acceptPaymentFile = async (file: File) => {
    const okType = /^(image\/(png|jpe?g|webp)|application\/pdf)$/i.test(file.type);
    if (!okType) {
      toast.error("Solo .png / .jpg / .pdf");
      return;
    }
    setPaymentOcrError(null);
    setPaymentFile(file);
    // For images: show inline preview. For PDFs: show file icon + name.
    if (file.type.startsWith("image/")) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      setPaymentPreviewUrl(dataUrl);
      await runPaymentOcr(dataUrl, file.type || "image/png");
    } else {
      setPaymentPreviewUrl(null);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      await runPaymentOcr(dataUrl, "application/pdf");
    }
  };

  const runPaymentOcr = async (dataUrl: string, mediaType: string) => {
    setPaymentOcrRunning(true);
    setPaymentOcrError(null);
    try {
      const { data, error } = await (supabase as any).functions.invoke("ocr-payment-receipt", {
        body: { file_base64: dataUrl, media_type: mediaType },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      // Auto-fill the partner-side fields with what the receipt says.
      // We don't overwrite user-typed values if they're already set.
      if (typeof data.amount === "number" && data.amount > 0) {
        setChargedToPartner(data.amount.toFixed(2));
      }
      if (data.date) {
        try {
          const d = new Date(data.date + "T00:00:00");
          if (!isNaN(d.getTime())) setPaidAt(d);
        } catch { /* ignore */ }
      }
      if (data.reference) setPaymentRef(String(data.reference));
      else if (data.tracking_code) setPaymentRef(String(data.tracking_code));
      if (data.bank) setPaymentBank(String(data.bank));
      if (data.method) setPaymentMethod(String(data.method));

      // Auto-append a tiny human-readable line to notes (only if notes
      // is empty — never clobber user-typed notes).
      if (!notes && data.bank && data.amount) {
        const lines = [];
        if (data.from_name) lines.push(`De: ${data.from_name}`);
        if (data.tracking_code) lines.push(`Rastreo: ${data.tracking_code}`);
        if (lines.length > 0) setNotes(lines.join(" · "));
      }

      toast.success(
        data.confidence === "low"
          ? "Comprobante leído (revisar — algunos campos no son claros)"
          : "Comprobante leído",
      );
    } catch (err: any) {
      setPaymentOcrError(err?.message ?? "Error al procesar el comprobante");
      toast.error("Error al leer comprobante: " + (err?.message ?? "desconocido"));
    } finally {
      setPaymentOcrRunning(false);
    }
  };

  const resetPaymentFile = () => {
    setPaymentFile(null);
    setPaymentPreviewUrl(null);
    setPaymentOcrError(null);
  };

  // Clipboard paste handler — also routes images through OCR
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
      if (patch.clave !== undefined && patch.clave !== r.clave) {
        const typedUpper = patch.clave!.toUpperCase();
        const canonical = aliasMap.get(typedUpper);
        const claveResolved = canonical ?? typedUpper;
        const found = catalog.find(p => p.clave.toUpperCase() === claveResolved);
        next.clave = claveResolved;
        next.alias_from = canonical ? typedUpper : null;
        next.product_id = found?.id ?? null;
        next.product_image_url = found?.image_url ?? null;
      }
      return next;
    }));
  };

  const removeRow = (uiId: string) => setRows(rs => rs.filter(r => r.uiId !== uiId));

  // ── Derived totals ───────────────────────────────────────────────
  const admTotalCost = useMemo(() => {
    return rows.reduce((s, r) => s + (r.importe ?? (r.cost_with_iva ?? 0) * (r.quantity ?? 0)), 0);
  }, [rows]);

  const chargedNum = parseFloat(chargedToPartner) || 0;
  const markup = chargedNum - admTotalCost;
  const markupPct = admTotalCost > 0 ? (markup / admTotalCost) * 100 : 0;

  // Pre-fill "Cobrado al partner" based on settlement model.
  // For Tamemes: cobrado = admTotal (they pay at cost).
  // For GDL: leave blank so user types the markup-included amount.
  useEffect(() => {
    if (rows.length === 0) return;
    if (chargedToPartner !== "") return; // user already typed
    if (partner.settlement_model === "monthly_split") {
      setChargedToPartner(admTotalCost.toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admTotalCost, rows.length, partner.settlement_model]);

  // ── Validation + save ────────────────────────────────────────────
  const hasInvalidQty = rows.some(r => !Number.isFinite(r.quantity) || r.quantity <= 0);
  const canSave = rows.length > 0 && !hasInvalidQty && !!imageFile && chargedToPartner !== "";

  const save = useMutation({
    mutationFn: async () => {
      if (!imageFile) throw new Error("Falta la imagen");
      // 1. Upload the ADM doc image to the shared bucket (partner_shipments/ prefix)
      const ts = Date.now();
      const ext = (imageFile.name.split(".").pop() || "png").toLowerCase();
      const path = `partner_shipments/${partner.code.toLowerCase()}/${ts}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(PROOF_BUCKET)
        .upload(path, imageFile, { contentType: imageFile.type || "image/png", upsert: false });
      if (upErr) throw upErr;

      // 2. Optionally upload the payment proof (Banregio screenshot/PDF).
      let paymentPath: string | null = null;
      if (paymentFile) {
        const paymentExt = (paymentFile.name.split(".").pop() || (paymentFile.type === "application/pdf" ? "pdf" : "png")).toLowerCase();
        paymentPath = `partner_shipments/${partner.code.toLowerCase()}/payment_${ts}.${paymentExt}`;
        const { error: pUpErr } = await supabase.storage
          .from(PROOF_BUCKET)
          .upload(paymentPath, paymentFile, {
            contentType: paymentFile.type || (paymentExt === "pdf" ? "application/pdf" : "image/png"),
            upsert: false,
          });
        if (pUpErr) throw pUpErr;
      }

      // 3. Insert the shipment header — trg_partner_shipment_code
      //    auto-assigns P-{CODE}-NNNN.
      const dateStr = format(shipmentDate, "yyyy-MM-dd");
      const { data: shipment, error: sErr } = await (supabase as any)
        .from("partner_shipments")
        .insert({
          partner_id: partner.id,
          shipment_date: dateStr,
          adm_proof_path: path,
          adm_total_cost: admTotalCost,
          charged_to_partner: chargedNum,
          partner_paid_at: paidAt ? paidAt.toISOString() : null,
          notes: notes.trim() || null,
          payment_proof_path: paymentPath,
          payment_reference: paymentRef.trim() || null,
          payment_method: paymentMethod.trim() || null,
          payment_bank: paymentBank.trim() || null,
        })
        .select("id, shipment_code")
        .single();
      if (sErr) throw sErr;

      // 4. Insert line items
      const items = rows.map(r => ({
        shipment_id: shipment.id,
        product_id: r.product_id,
        clave: r.clave,
        description: r.description || null,
        quantity: r.quantity,
        kilos: r.kilos,
        cost_without_iva: r.cost_without_iva,
        cost_with_iva: r.cost_with_iva,
        importe: r.importe ?? ((r.cost_with_iva ?? 0) * (r.quantity ?? 0)),
      }));
      const { error: iErr } = await supabase.from("partner_shipment_items").insert(items as any);
      if (iErr) throw iErr;

      return { shipment_code: shipment.shipment_code as string, itemsCount: items.length };
    },
    onSuccess: ({ shipment_code, itemsCount }) => {
      toast.success(`${shipment_code} guardado · ${itemsCount} línea${itemsCount === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["partner-shipments"] });
      qc.invalidateQueries({ queryKey: ["partner-shipments", partner.id] });
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
    setChargedToPartner("");
    setNotes("");
    setPaymentFile(null);
    setPaymentPreviewUrl(null);
    setPaymentOcrError(null);
    setPaymentRef("");
    setPaymentBank("");
    setPaymentMethod("");
  };

  return (
    <div className="space-y-5">
      {/* Drop zone — visible whenever no image is loaded. */}
      {!imageDataUrl ? (
        <div
          onClick={() => fileRef.current?.click()}
          onDragEnter={(e) => {
            e.preventDefault(); e.stopPropagation();
            if (ocrRunning) return;
            setDragDepth((n) => n + 1);
          }}
          onDragOver={(e) => {
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
                : `Arrastra la confirmación ADM para ${partner.name}`}
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
          {/* Header: thumbnail + date + partner badge + change button */}
          <div className="rounded-xl border bg-card p-3 flex items-center gap-3 flex-wrap">
            <img
              src={imageDataUrl}
              alt="Confirmación ADM"
              className="h-16 w-24 object-cover rounded border"
            />
            <div className="flex-1 min-w-[200px] grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                  Partner
                </Label>
                <div className="h-9 flex items-center px-3 rounded-md border bg-muted/30 text-sm font-semibold">
                  {partner.name} · <span className="font-mono text-blue-400 ml-1">{partner.code}</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                  Fecha del embarque
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal h-9">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(shipmentDate, "dd/MM/yy", { locale: esLocale })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={shipmentDate} onSelect={(d) => { if (d) setShipmentDate(d); }} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={reset} className="shrink-0 gap-1.5">
              <ImageIcon className="h-4 w-4" /> Cambiar imagen
            </Button>
          </div>

          {/* OCR error */}
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

          {/* OCR loading skeletons */}
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
                  {rows.length} línea{rows.length === 1 ? "" : "s"}
                </Badge>
                <Badge variant="outline" className="ml-auto tabular-nums">
                  Total ADM: {fmtMXN(admTotalCost)}
                </Badge>
              </div>

              <div className="rounded-xl border bg-card overflow-hidden">
                <div className="max-h-[420px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card border-b z-10">
                      <tr className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <th className="text-left px-2 py-2 w-[120px]">SKU</th>
                        <th className="text-left px-2 py-2">Producto</th>
                        <th className="text-right px-2 py-2 w-[100px]">Piezas</th>
                        <th className="text-right px-2 py-2 w-[110px]">Costo s/IVA</th>
                        <th className="text-right px-2 py-2 w-[110px]">Costo c/IVA</th>
                        <th className="text-right px-2 py-2 w-[120px]">Importe</th>
                        <th className="px-2 py-2 w-[40px]"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {rows.map((r) => {
                        const lowConf = r.confidence === "low";
                        const importe = r.importe ?? ((r.cost_with_iva ?? 0) * (r.quantity ?? 0));
                        return (
                          <tr key={r.uiId} className={cn("hover:bg-muted/20", lowConf && "bg-amber-500/[0.05]")}>
                            <td className="px-2 py-2">
                              <div className="flex flex-col gap-1">
                                <Input
                                  value={r.clave}
                                  onChange={(e) => updateRow(r.uiId, { clave: e.target.value.toUpperCase() })}
                                  className="h-8 font-mono text-xs"
                                />
                                {r.alias_from && (
                                  <span
                                    className="text-[9px] font-mono text-blue-700 dark:text-blue-300 bg-blue-500/10 border border-blue-500/30 rounded px-1 py-0.5 self-start"
                                    title={`Alias: el proveedor envió ${r.alias_from}, mapeado a ${r.clave}`}
                                  >
                                    ← {r.alias_from}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-2">
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
                                <div className="text-sm leading-tight line-clamp-2 min-w-0">{r.description || <span className="text-muted-foreground italic">(sin descripción)</span>}</div>
                              </div>
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
                                value={r.cost_without_iva ?? ""}
                                onChange={(e) => updateRow(r.uiId, { cost_without_iva: e.target.value === "" ? null : parseFloat(e.target.value) })}
                                className="h-8 text-right tabular-nums"
                              />
                            </td>
                            <td className="px-2 py-2">
                              <Input
                                type="number"
                                step="0.01"
                                value={r.cost_with_iva ?? ""}
                                onChange={(e) => updateRow(r.uiId, { cost_with_iva: e.target.value === "" ? null : parseFloat(e.target.value) })}
                                className="h-8 text-right tabular-nums"
                              />
                            </td>
                            <td className="px-2 py-2 text-right text-sm tabular-nums">
                              {fmtMXN(importe)}
                            </td>
                            <td className="px-2 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => removeRow(r.uiId)}
                                className="rounded-md p-1 hover:bg-muted/40 text-red-600 dark:text-red-400"
                                title="Eliminar fila"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Partner-specific finance block */}
              <div className="rounded-xl border bg-card p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                    Costo total ADM
                  </Label>
                  <div className="h-9 flex items-center text-base font-semibold tabular-nums text-foreground">
                    {fmtMXN(admTotalCost)}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                    Cobrado a {partner.name} *
                  </Label>
                  <CurrencyInput
                    value={chargedToPartner}
                    onChange={setChargedToPartner}
                    placeholder={partner.settlement_model === "monthly_split" ? "al costo (Tamemes)" : "ADM + markup"}
                    inputClassName="h-9 text-base font-semibold"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    Markup (utilidad inmediata)
                  </Label>
                  <div className={cn(
                    "h-9 flex items-center text-base font-semibold tabular-nums",
                    markup > 0 ? "text-emerald-500" : markup < 0 ? "text-red-500" : "text-muted-foreground",
                  )}>
                    {fmtMXN(markup)}
                    {admTotalCost > 0 && markup !== 0 && (
                      <span className="text-xs ml-1.5 opacity-70">
                        ({markup > 0 ? "+" : ""}{markupPct.toFixed(2)}%)
                      </span>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                    Pagado el
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal h-9">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {paidAt
                          ? format(paidAt, "dd/MM/yy", { locale: esLocale })
                          : <span className="text-muted-foreground">Pendiente</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={paidAt ?? undefined}
                        onSelect={(d) => setPaidAt(d ?? null)}
                      />
                      {paidAt && (
                        <div className="p-2 border-t">
                          <Button size="sm" variant="ghost" onClick={() => setPaidAt(null)} className="w-full text-xs">
                            Marcar como pendiente
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Payment receipt — optional. Drop the Banregio
                  screenshot or PDF and we OCR it to auto-fill the
                  finance fields above. */}
              <div className="rounded-xl border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                      Comprobante de pago (opcional)
                    </Label>
                  </div>
                  {(paymentBank || paymentMethod || paymentRef) && (
                    <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                      {paymentBank && (
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/40">
                          {paymentBank}
                        </Badge>
                      )}
                      {paymentMethod && (
                        <Badge variant="outline" className="bg-muted/60">
                          {paymentMethod}
                        </Badge>
                      )}
                      {paymentRef && (
                        <Badge variant="outline" className="font-mono">
                          Ref: {paymentRef}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>

                {!paymentFile ? (
                  <div
                    onClick={() => paymentFileRef.current?.click()}
                    onDragEnter={(e) => {
                      e.preventDefault(); e.stopPropagation();
                      if (paymentOcrRunning) return;
                      setPaymentDragDepth(n => n + 1);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault(); e.stopPropagation();
                      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault(); e.stopPropagation();
                      setPaymentDragDepth(n => Math.max(0, n - 1));
                    }}
                    onDrop={(e) => {
                      e.preventDefault(); e.stopPropagation();
                      setPaymentDragDepth(0);
                      if (paymentOcrRunning) return;
                      const f = e.dataTransfer?.files?.[0];
                      if (f) void acceptPaymentFile(f);
                    }}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      "border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer select-none",
                      paymentDragDepth > 0
                        ? "border-emerald-500 bg-emerald-500/10"
                        : "border-border hover:border-primary/50 hover:bg-muted/30",
                      paymentOcrRunning && "cursor-wait opacity-70",
                    )}
                  >
                    <div className="flex items-center justify-center gap-3 text-sm">
                      {paymentOcrRunning ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-muted-foreground">Leyendo comprobante…</span>
                        </>
                      ) : (
                        <>
                          <Upload className="h-5 w-5 opacity-50" />
                          <span className="text-muted-foreground">
                            Arrastra la captura de Banregio (o PDF) · llena Cobrado / Pagado / Referencia automáticamente
                          </span>
                        </>
                      )}
                    </div>
                    <input
                      ref={paymentFileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,application/pdf"
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void acceptPaymentFile(f);
                      }}
                      disabled={paymentOcrRunning}
                      className="sr-only"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-2 rounded-lg border bg-muted/20">
                    {paymentPreviewUrl ? (
                      <img
                        src={paymentPreviewUrl}
                        alt="Comprobante"
                        className="h-16 w-12 object-cover rounded border"
                      />
                    ) : (
                      <div className="h-16 w-12 rounded border bg-card flex items-center justify-center">
                        <FileText className="h-6 w-6 text-red-500" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{paymentFile.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {(paymentFile.size / 1024).toFixed(1)} KB
                        {paymentOcrRunning && " · Procesando…"}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={resetPaymentFile} className="h-8 w-8 text-muted-foreground">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {paymentOcrError && (
                  <div className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3" />
                    {paymentOcrError}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                  Notas
                </Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notas opcionales sobre este embarque…"
                  className="h-9"
                />
              </div>

              <div className="flex items-center gap-2 justify-end">
                <Button
                  onClick={() => save.mutate()}
                  disabled={!canSave || save.isPending}
                  className="gap-1.5 min-w-[260px] bg-emerald-500 hover:bg-emerald-600 text-white"
                >
                  {save.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</>
                  ) : (
                    <>Guardar Pedido ADM para {partner.code}</>
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

