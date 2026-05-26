/**
 * MonthlyBonificacionDialog
 *
 * Add / edit a row in `monthly_bonificaciones`. ADM sends a single
 * image per month with the bonificación split between Naucalpan,
 * Tamemes, and Guadalajara. Naucalpan is 100% ours; partner amounts
 * split 50/50.
 *
 * The dialog is intentionally simple — no OCR for this one yet, just:
 *   • Mes (month picker, period_month always normalized to YYYY-MM-01)
 *   • Drop zone for the ADM image (optional but recommended)
 *   • 3 currency inputs: Naucalpan / Tamemes / GDL
 *   • Live calc: total received from ADM, our total share, partner halves
 *   • Status timestamps: Recibido de ADM · Pagado a Tamemes · Pagado a GDL
 *
 * Save upserts on period_month. Delete is one click + confirm.
 */

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CurrencyInput } from "@/components/partners/CurrencyInput";
import {
  CalendarIcon, Upload, Image as ImageIcon, X, AlertTriangle,
  Loader2, Save, Trash2, Download, Gift, CheckCircle2, Building2,
  ChevronLeft, ChevronRight, Truck, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es as esLocale } from "date-fns/locale";

export interface BonificacionRow {
  id: string;
  period_month: string;
  naucalpan_amount: number;
  tamemes_amount: number;
  gdl_amount: number;
  adm_proof_path: string | null;
  received_at: string | null;
  tamemes_settled_at: string | null;
  gdl_settled_at: string | null;
  notes: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass an existing row to edit, or null to create a new one. */
  editing: BonificacionRow | null;
  /** Pre-fill the month when creating a new entry. Used by the
   *  backfill banner — clicking "Capturar abril 2026" opens the
   *  dialog already on April. Ignored when editing != null. */
  defaultMonth?: Date | null;
}

const mxnFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });
const fmtMXN = (v: number | null | undefined) => v == null ? "—" : mxnFmt.format(v);

const PROOF_BUCKET = "stock-delivery-documents";

export function MonthlyBonificacionDialog({ open, onOpenChange, editing, defaultMonth }: Props) {
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [periodMonth, setPeriodMonth] = useState<Date>(new Date());
  const [naucalpan, setNaucalpan] = useState("");
  const [tamemes, setTamemes] = useState("");
  const [gdl, setGdl] = useState("");
  const [receivedAt, setReceivedAt] = useState<Date | null>(null);
  const [tamSettledAt, setTamSettledAt] = useState<Date | null>(null);
  const [gdlSettledAt, setGdlSettledAt] = useState<Date | null>(null);
  const [notes, setNotes] = useState("");

  // File state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [dragDepth, setDragDepth] = useState(0);
  const [ocrRunning, setOcrRunning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Seed form whenever the editing row changes or dialog opens fresh
  useEffect(() => {
    if (editing) {
      setPeriodMonth(new Date(editing.period_month + "T00:00:00"));
      setNaucalpan(String(editing.naucalpan_amount ?? ""));
      setTamemes(String(editing.tamemes_amount ?? ""));
      setGdl(String(editing.gdl_amount ?? ""));
      setReceivedAt(editing.received_at ? new Date(editing.received_at) : null);
      setTamSettledAt(editing.tamemes_settled_at ? new Date(editing.tamemes_settled_at) : null);
      setGdlSettledAt(editing.gdl_settled_at ? new Date(editing.gdl_settled_at) : null);
      setNotes(editing.notes ?? "");
      setImageFile(null);
      setImagePreview(null);
    } else if (open) {
      // New entry — honor defaultMonth (backfill flow) or default to
      // first of CURRENT month.
      const seed = defaultMonth ?? new Date();
      setPeriodMonth(new Date(seed.getFullYear(), seed.getMonth(), 1));
      setNaucalpan("");
      setTamemes("");
      setGdl("");
      setReceivedAt(new Date());
      setTamSettledAt(null);
      setGdlSettledAt(null);
      setNotes("");
      setImageFile(null);
      setImagePreview(null);
    }
  }, [editing, open, defaultMonth]);

  // ── Derived numbers ──────────────────────────────────────────────
  const naucalpanNum = parseFloat(naucalpan) || 0;
  const tamemesNum = parseFloat(tamemes) || 0;
  const gdlNum = parseFloat(gdl) || 0;
  const totalFromAdm = naucalpanNum + tamemesNum + gdlNum;
  // Naucalpan = 100% ours; Tamemes + GDL = 50% each
  const ourTotal = naucalpanNum + (tamemesNum * 0.5) + (gdlNum * 0.5);
  const owedToTamemes = tamemesNum * 0.5;
  const owedToGdl = gdlNum * 0.5;

  // ── File handler + OCR ──────────────────────────────────────────
  const acceptImage = async (file: File) => {
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      toast.error("Solo .png o .jpg");
      return;
    }
    setImageFile(file);
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    setImagePreview(dataUrl);
    // Auto-OCR — the bonificación image is a 3-row list and Haiku
    // reads it well. Auto-fill the three CurrencyInputs + the month
    // picker if a date is visible.
    setOcrRunning(true);
    try {
      const { data, error } = await (supabase as any).functions.invoke("ocr-monthly-bonificacion", {
        body: { file_base64: dataUrl, media_type: file.type || "image/png" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      // Only overwrite empty fields so the user's manual edits stick.
      if (typeof data.naucalpan_amount === "number" && data.naucalpan_amount > 0 && !naucalpan) {
        setNaucalpan(String(data.naucalpan_amount));
      }
      if (typeof data.tamemes_amount === "number" && data.tamemes_amount > 0 && !tamemes) {
        setTamemes(String(data.tamemes_amount));
      }
      if (typeof data.gdl_amount === "number" && data.gdl_amount > 0 && !gdl) {
        setGdl(String(data.gdl_amount));
      }
      if (data.period_month) {
        try {
          const d = new Date(data.period_month + "T00:00:00");
          if (!isNaN(d.getTime())) {
            setPeriodMonth(new Date(d.getFullYear(), d.getMonth(), 1));
          }
        } catch { /* keep current */ }
      }
      const filled = [
        data.naucalpan_amount, data.tamemes_amount, data.gdl_amount,
      ].filter(x => typeof x === "number" && x > 0).length;
      toast.success(
        data.confidence === "low"
          ? `Imagen leída (revisar — ${filled}/3 montos detectados)`
          : `Imagen leída · ${filled}/3 montos auto-rellenados`,
      );
    } catch (err: any) {
      toast.error("Error al leer imagen: " + (err?.message ?? "desconocido"));
    } finally {
      setOcrRunning(false);
    }
  };

  // ── Save ─────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (totalFromAdm <= 0) {
      toast.error("Captura al menos un monto");
      return;
    }
    setSaving(true);
    try {
      // Upload new image if dropped
      let imagePath = editing?.adm_proof_path ?? null;
      if (imageFile) {
        const ts = Date.now();
        const periodStr = format(periodMonth, "yyyy-MM");
        const ext = (imageFile.name.split(".").pop() || "png").toLowerCase();
        const path = `monthly_bonificaciones/${periodStr}_${ts}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(PROOF_BUCKET)
          .upload(path, imageFile, { contentType: imageFile.type || "image/png", upsert: false });
        if (upErr) throw upErr;
        imagePath = path;
      }

      const payload = {
        period_month: format(periodMonth, "yyyy-MM-01"),
        naucalpan_amount: naucalpanNum,
        tamemes_amount: tamemesNum,
        gdl_amount: gdlNum,
        adm_proof_path: imagePath,
        received_at: receivedAt ? receivedAt.toISOString() : null,
        tamemes_settled_at: tamSettledAt ? tamSettledAt.toISOString() : null,
        gdl_settled_at: gdlSettledAt ? gdlSettledAt.toISOString() : null,
        notes: notes.trim() || null,
      };

      if (editing) {
        const { error } = await (supabase as any)
          .from("monthly_bonificaciones")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        // Upsert on period_month — if the user already created the row
        // this month and tries to "add" again, treat it as an update.
        const { error } = await (supabase as any)
          .from("monthly_bonificaciones")
          .upsert(payload, { onConflict: "period_month" });
        if (error) throw error;
      }

      toast.success(editing ? "Bonificación actualizada" : "Bonificación registrada");
      qc.invalidateQueries({ queryKey: ["monthly-bonificaciones"] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Error al guardar: " + (err?.message ?? "desconocido"));
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error("Sin entry");
      // Best-effort remove the file too
      if (editing.adm_proof_path) {
        await supabase.storage.from(PROOF_BUCKET).remove([editing.adm_proof_path]).catch(() => {});
      }
      const { error } = await (supabase as any)
        .from("monthly_bonificaciones")
        .delete()
        .eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bonificación eliminada");
      qc.invalidateQueries({ queryKey: ["monthly-bonificaciones"] });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast.error("Error al eliminar: " + (err?.message ?? "desconocido"));
    },
  });

  const openProof = (path: string | null) => {
    if (!path) return;
    const { data } = supabase.storage.from(PROOF_BUCKET).getPublicUrl(path);
    window.open(data.publicUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[96vw] sm:max-w-4xl max-h-[92vh] overflow-y-auto p-0">
          <DialogHeader className="px-4 sm:px-6 pt-6 pb-3 border-b">
            <DialogTitle className="text-xl flex items-center gap-3 flex-wrap">
              <Gift className="h-5 w-5 text-purple-500" />
              <span>{editing ? "Editar bonificación" : "Nueva bonificación mensual"}</span>
              <Badge variant="outline" className="bg-muted/40 capitalize">
                {format(periodMonth, "MMMM yyyy", { locale: esLocale })}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              Captura el reporte que ADM nos envía cada mes con las bonificaciones (Naucalpan + Tamemes + GDL).
              Naucalpan es 100% nuestra; los montos de los partners se reparten 50/50.
            </DialogDescription>
          </DialogHeader>

          <div className="px-4 sm:px-6 py-4 space-y-5">
            {/* Top row: Month navigator (‹ Mayo 2026 ›) + Recibido date */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                  Mes
                </Label>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => setPeriodMonth(new Date(periodMonth.getFullYear(), periodMonth.getMonth() - 1, 1))}
                    title="Mes anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    className="h-9 flex-1 justify-center font-semibold capitalize tabular-nums"
                    onClick={() => {
                      const now = new Date();
                      setPeriodMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                    }}
                    title="Saltar al mes actual"
                  >
                    {format(periodMonth, "MMMM yyyy", { locale: esLocale })}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => setPeriodMonth(new Date(periodMonth.getFullYear(), periodMonth.getMonth() + 1, 1))}
                    title="Mes siguiente"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                  Recibido de ADM
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal h-9">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {receivedAt ? format(receivedAt, "dd/MM/yy", { locale: esLocale }) : "Pendiente"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={receivedAt ?? undefined}
                      onSelect={(d) => setReceivedAt(d ?? null)}
                    />
                    {receivedAt && (
                      <div className="p-2 border-t">
                        <Button size="sm" variant="ghost" onClick={() => setReceivedAt(null)} className="w-full text-xs">
                          Marcar como pendiente
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Montos por unidad de negocio — one row per unit (label left, input right).
                Matches the simple ADM image format the user shared. */}
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Montos por unidad de negocio
                </h3>
                <span className="text-[10px] text-muted-foreground">según imagen ADM</span>
              </div>
              <div className="divide-y">
                {/* Naucalpan */}
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <Building2 className="h-4 w-4 text-blue-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">Naucalpan</div>
                    <div className="text-[11px] text-muted-foreground">100% nuestro</div>
                  </div>
                  <CurrencyInput
                    value={naucalpan}
                    onChange={setNaucalpan}
                    placeholder="0"
                    className="w-44"
                  />
                </div>
                {/* Tamemes */}
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <Truck className="h-4 w-4 text-purple-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">Tamemes</div>
                    <div className="text-[11px] text-muted-foreground">50% nuestro · 50% partner</div>
                  </div>
                  <CurrencyInput
                    value={tamemes}
                    onChange={setTamemes}
                    placeholder="0"
                    className="w-44"
                  />
                </div>
                {/* Guadalajara */}
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <Truck className="h-4 w-4 text-orange-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">Guadalajara</div>
                    <div className="text-[11px] text-muted-foreground">50% nuestro · 50% partner</div>
                  </div>
                  <CurrencyInput
                    value={gdl}
                    onChange={setGdl}
                    placeholder="0"
                    className="w-44"
                  />
                </div>
              </div>
            </div>

            {/* Live computed shares */}
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Total ADM</div>
                  <div className="text-lg font-bold tabular-nums">{fmtMXN(totalFromAdm)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300 font-semibold">A ti</div>
                  <div className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{fmtMXN(ourTotal)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">A Tamemes</div>
                  <div className="text-base font-semibold tabular-nums">{fmtMXN(owedToTamemes)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">A GDL</div>
                  <div className="text-base font-semibold tabular-nums">{fmtMXN(owedToGdl)}</div>
                </div>
              </div>
            </div>

            {/* Image drop zone */}
            <div className="rounded-xl border bg-card p-4 space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground font-semibold flex items-center gap-1">
                <ImageIcon className="h-3 w-3" /> Imagen ADM (reporte de bonificación)
              </Label>
              {!imageFile && !editing?.adm_proof_path ? (
                <div
                  onClick={() => fileRef.current?.click()}
                  onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragDepth(n => n + 1); }}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragDepth(n => Math.max(0, n - 1)); }}
                  onDrop={(e) => {
                    e.preventDefault(); e.stopPropagation();
                    setDragDepth(0);
                    const f = e.dataTransfer?.files?.[0];
                    if (f) void acceptImage(f);
                  }}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    "border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors",
                    dragDepth > 0
                      ? "border-emerald-500 bg-emerald-500/10"
                      : "border-border hover:border-primary/50 hover:bg-muted/30",
                  )}
                >
                  {ocrRunning ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
                      <span className="text-sm text-muted-foreground">Leyendo imagen…</span>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-6 w-6 mx-auto opacity-50 mb-1" />
                      <div className="text-xs text-muted-foreground">
                        Arrastra la imagen del reporte ADM — leemos los 3 montos automáticamente
                      </div>
                    </>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void acceptImage(f); }}
                    className="sr-only"
                  />
                </div>
              ) : imageFile ? (
                <div className="flex items-center gap-3 p-2 rounded-lg border bg-muted/20">
                  {imagePreview ? (
                    <img src={imagePreview} alt="" className="h-16 w-24 object-cover rounded border" />
                  ) : (
                    <div className="h-16 w-24 rounded border bg-card flex items-center justify-center">
                      <FileText className="h-6 w-6" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{imageFile.name}</div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      {(imageFile.size / 1024).toFixed(1)} KB · se subirá al guardar
                      {ocrRunning && (
                        <span className="text-emerald-500 flex items-center gap-1">
                          · <Loader2 className="h-3 w-3 animate-spin" /> leyendo…
                        </span>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => { setImageFile(null); setImagePreview(null); }} className="h-8 w-8">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => openProof(editing!.adm_proof_path)} className="gap-1.5">
                    <Download className="h-3.5 w-3.5" /> Abrir imagen actual
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="gap-1.5">
                    <Upload className="h-3.5 w-3.5" /> Reemplazar
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void acceptImage(f); }}
                    className="sr-only"
                  />
                </div>
              )}
            </div>

            {/* Settlement timestamps */}
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Pagos a partners (su 50%)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                    Pagado a Tamemes
                  </Label>
                  <div className="flex items-center gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="flex-1 justify-start text-left font-normal h-9">
                          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                          {tamSettledAt ? format(tamSettledAt, "dd/MM/yy", { locale: esLocale }) : "Pendiente"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={tamSettledAt ?? undefined} onSelect={(d) => setTamSettledAt(d ?? null)} />
                        {tamSettledAt && (
                          <div className="p-2 border-t">
                            <Button size="sm" variant="ghost" onClick={() => setTamSettledAt(null)} className="w-full text-xs">
                              Marcar pendiente
                            </Button>
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                    <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{fmtMXN(owedToTamemes)}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                    Pagado a GDL
                  </Label>
                  <div className="flex items-center gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="flex-1 justify-start text-left font-normal h-9">
                          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                          {gdlSettledAt ? format(gdlSettledAt, "dd/MM/yy", { locale: esLocale }) : "Pendiente"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={gdlSettledAt ?? undefined} onSelect={(d) => setGdlSettledAt(d ?? null)} />
                        {gdlSettledAt && (
                          <div className="p-2 border-t">
                            <Button size="sm" variant="ghost" onClick={() => setGdlSettledAt(null)} className="w-full text-xs">
                              Marcar pendiente
                            </Button>
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                    <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{fmtMXN(owedToGdl)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Notas */}
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Notas</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas opcionales…" />
            </div>
          </div>

          <div className="px-4 sm:px-6 py-3 border-t bg-muted/20 flex items-center gap-2 justify-end">
            {editing && (
              <Button
                variant="outline"
                onClick={() => setConfirmDelete(true)}
                disabled={saving}
                className="gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 border-red-500/30 mr-auto"
              >
                <Trash2 className="h-4 w-4" />
                Eliminar
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="gap-1.5">
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || totalFromAdm <= 0} className="gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white">
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</>
              ) : (
                <><Save className="h-4 w-4" /> {editing ? "Guardar cambios" : "Registrar bonificación"}</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              ¿Eliminar esta bonificación?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se borrará el registro de <span className="font-semibold capitalize">{format(periodMonth, "MMMM yyyy", { locale: esLocale })}</span> ({fmtMXN(totalFromAdm)} total).
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteEntry.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteEntry.mutate()}
              disabled={deleteEntry.isPending}
              className="bg-red-500 hover:bg-red-600 text-white gap-1.5"
            >
              {deleteEntry.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Eliminando…</>
              ) : (
                <><Trash2 className="h-4 w-4" /> Sí, eliminar</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
