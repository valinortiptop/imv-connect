/**
 * PartnerShipmentDetailSheet
 *
 * Click a shipment_code in the Partners table → this opens. Has two
 * modes:
 *
 *   • View mode — everything is read-only with proper currency
 *     formatting ($382,894.00 style). Footer: Eliminar + Editar.
 *
 *   • Edit mode — full editor:
 *       · Header fields (fecha, cobrado a partner, pagado el, banco,
 *         método, ref, notas).
 *       · Line items grid: edit clave (with alias swap), qty, kilos,
 *         costs. Add lines with "+". Remove with trash. Importe is
 *         auto-computed. adm_total_cost on the header is the live
 *         sum.
 *       · Drop zones for BOTH images:
 *           - "Imagen original ADM" — swap the ADM photo. Doesn't
 *             re-OCR (use delete + recreate if you need to re-import
 *             items from a fresh ADM).
 *           - "Comprobante de pago" — drop a Banregio screenshot/PDF
 *             any time later. OCR runs and auto-fills the finance
 *             fields above. So the workflow "type markup now, get the
 *             receipt next week" works.
 *
 *   Save: deletes old items + reinserts new (mirrors the StockEntries
 *   edit pattern, simpler than diffing). Header gets updated with
 *   recomputed totals + any new file paths.
 *
 *   Delete: cascades line items via FK. Removes both files from
 *   storage best-effort.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Pencil, Trash2, Download, Receipt, CalendarIcon, CheckCircle2, Clock,
  TrendingUp, Image as ImageIcon, Save, X, AlertTriangle, FileText, Loader2,
  Package, Upload, Plus, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import { parseLocalDate } from "@/lib/date-utils";
import { CurrencyInput } from "@/components/partners/CurrencyInput";

interface Partner {
  id: string;
  code: string;
  name: string;
  settlement_model: "monthly_split" | "per_shipment_markup";
}

interface ShipmentDetail {
  id: string;
  partner_id: string;
  shipment_code: string;
  shipment_date: string;
  adm_proof_path: string | null;
  adm_total_cost: number | null;
  charged_to_partner: number | null;
  partner_paid_at: string | null;
  notes: string | null;
  payment_proof_path: string | null;
  payment_reference: string | null;
  payment_method: string | null;
  payment_bank: string | null;
  created_at: string;
}

interface RawItem {
  id: string;
  clave: string;
  description: string | null;
  quantity: number;
  kilos: number | null;
  cost_without_iva: number | null;
  cost_with_iva: number | null;
  importe: number | null;
  product_id: string | null;
  products: { clave: string; name: string; image_url: string | null } | null;
}

interface EditableItem {
  uiId: string;
  clave: string;
  description: string;
  product_id: string | null;
  product_image_url: string | null;
  product_name: string | null;
  quantity: number;
  kilos: number | null;
  cost_without_iva: number | null;
  cost_with_iva: number | null;
  importe: number | null;
  alias_from: string | null;
}

interface Props {
  shipmentId: string | null;
  partner: Partner | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** If true, the dialog opens directly in edit mode (used when the
   *  user clicks the pencil icon on a row — no need to click "Editar"
   *  again). */
  initialEdit?: boolean;
}

const mxnFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });
const fmtMXN = (v: number | null | undefined) => v == null ? "—" : mxnFmt.format(v);
const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try { return format(parseLocalDate(d), "dd/MM/yy", { locale: esLocale }); } catch { return d; }
};

const PROOF_BUCKET = "stock-delivery-documents";

function newUiId(): string { return Math.random().toString(36).slice(2, 10); }

export function PartnerShipmentDetailSheet({ shipmentId, partner, open, onOpenChange, initialEdit }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state — only used while editing
  const [formDate, setFormDate] = useState<Date>(new Date());
  const [formCharged, setFormCharged] = useState("");
  const [formPaidAt, setFormPaidAt] = useState<Date | null>(null);
  const [formRef, setFormRef] = useState("");
  const [formMethod, setFormMethod] = useState("");
  const [formBank, setFormBank] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [items, setItems] = useState<EditableItem[]>([]);

  // File-swap state
  const [newAdmFile, setNewAdmFile] = useState<File | null>(null);
  const [newAdmPreview, setNewAdmPreview] = useState<string | null>(null);
  const admInputRef = useRef<HTMLInputElement>(null);
  const [paymentFile, setPaymentFile] = useState<File | null>(null);
  const [paymentPreview, setPaymentPreview] = useState<string | null>(null);
  const [paymentOcrRunning, setPaymentOcrRunning] = useState(false);
  const paymentInputRef = useRef<HTMLInputElement>(null);

  const { data: shipment, isLoading: shipmentLoading } = useQuery({
    queryKey: ["partner-shipment-detail", shipmentId],
    queryFn: async () => {
      if (!shipmentId) return null;
      const { data, error } = await (supabase as any)
        .from("partner_shipments")
        .select("*")
        .eq("id", shipmentId)
        .single();
      if (error) throw error;
      return data as ShipmentDetail;
    },
    enabled: !!shipmentId && open,
  });

  const { data: rawItems = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["partner-shipment-items", shipmentId],
    queryFn: async () => {
      if (!shipmentId) return [] as RawItem[];
      const { data, error } = await (supabase as any)
        .from("partner_shipment_items")
        .select("id, clave, description, quantity, kilos, cost_without_iva, cost_with_iva, importe, product_id, products(clave, name, image_url)")
        .eq("shipment_id", shipmentId)
        .order("importe", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RawItem[];
    },
    enabled: !!shipmentId && open,
  });

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

  // Seed form whenever the shipment + items load
  useEffect(() => {
    if (!shipment) return;
    setFormDate(parseLocalDate(shipment.shipment_date));
    setFormCharged(shipment.charged_to_partner != null ? String(shipment.charged_to_partner) : "");
    setFormPaidAt(shipment.partner_paid_at ? new Date(shipment.partner_paid_at) : null);
    setFormRef(shipment.payment_reference ?? "");
    setFormMethod(shipment.payment_method ?? "");
    setFormBank(shipment.payment_bank ?? "");
    setFormNotes(shipment.notes ?? "");
  }, [shipment]);

  useEffect(() => {
    setItems(rawItems.map(it => ({
      uiId: newUiId(),
      clave: it.clave,
      description: it.description ?? "",
      product_id: it.product_id,
      product_image_url: it.products?.image_url ?? null,
      product_name: it.products?.name ?? null,
      quantity: it.quantity,
      kilos: it.kilos,
      cost_without_iva: it.cost_without_iva,
      cost_with_iva: it.cost_with_iva,
      importe: it.importe ?? ((it.cost_with_iva ?? 0) * (it.quantity ?? 0)),
      alias_from: null,
    })));
  }, [rawItems]);

  // Reset on close. On OPEN, honor initialEdit so the pencil icon
  // can jump straight into edit mode (no extra click).
  useEffect(() => {
    if (!open) {
      setEditing(false);
      setConfirmDelete(false);
      setNewAdmFile(null);
      setNewAdmPreview(null);
      setPaymentFile(null);
      setPaymentPreview(null);
    } else if (initialEdit) {
      setEditing(true);
    }
  }, [open, initialEdit]);

  // ── Derived: live ADM total (sum of importes for current items) ─
  const liveAdmTotal = useMemo(() => {
    return items.reduce((s, it) => s + (it.importe ?? ((it.cost_with_iva ?? 0) * (it.quantity ?? 0))), 0);
  }, [items]);

  const chargedNum = parseFloat(formCharged) || 0;
  const markupView = (shipment?.charged_to_partner ?? 0) - (shipment?.adm_total_cost ?? 0);
  const markupEdit = chargedNum - liveAdmTotal;
  const markup = editing ? markupEdit : markupView;
  const baseForPct = editing ? liveAdmTotal : (shipment?.adm_total_cost ?? 0);
  const markupPct = baseForPct > 0 ? (markup / baseForPct) * 100 : 0;

  // ── Items mutations ──────────────────────────────────────────────
  const updateItem = (uiId: string, patch: Partial<EditableItem>) => {
    setItems(rs => rs.map(r => {
      if (r.uiId !== uiId) return r;
      const next = { ...r, ...patch };
      // Alias swap + catalog re-resolution on clave change
      if (patch.clave !== undefined && patch.clave !== r.clave) {
        const typedUpper = patch.clave!.toUpperCase();
        const canonical = aliasMap.get(typedUpper);
        const claveResolved = canonical ?? typedUpper;
        const found = catalog.find(p => p.clave.toUpperCase() === claveResolved);
        next.clave = claveResolved;
        next.alias_from = canonical ? typedUpper : null;
        next.product_id = found?.id ?? null;
        next.product_image_url = found?.image_url ?? null;
        next.product_name = found?.name ?? next.product_name;
      }
      // Auto-recompute importe when qty or cost changes
      const qty = patch.quantity ?? r.quantity;
      const cwi = patch.cost_with_iva ?? r.cost_with_iva;
      next.importe = (cwi ?? 0) * (qty ?? 0);
      return next;
    }));
  };
  const removeItem = (uiId: string) => setItems(rs => rs.filter(r => r.uiId !== uiId));
  const addItem = () => setItems(rs => [...rs, {
    uiId: newUiId(),
    clave: "",
    description: "",
    product_id: null,
    product_image_url: null,
    product_name: null,
    quantity: 1,
    kilos: null,
    cost_without_iva: null,
    cost_with_iva: null,
    importe: 0,
    alias_from: null,
  }]);

  // ── File handlers ───────────────────────────────────────────────
  const handleAdmFile = async (file: File) => {
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      toast.error("Solo .png o .jpg para imagen ADM");
      return;
    }
    setNewAdmFile(file);
    const r = new FileReader();
    r.onload = () => setNewAdmPreview(r.result as string);
    r.readAsDataURL(file);
  };

  const handlePaymentFile = async (file: File) => {
    if (!/^(image\/(png|jpe?g|webp)|application\/pdf)$/i.test(file.type)) {
      toast.error("Solo .png / .jpg / .pdf");
      return;
    }
    setPaymentFile(file);
    if (file.type.startsWith("image/")) {
      const r = new FileReader();
      r.onload = () => setPaymentPreview(r.result as string);
      r.readAsDataURL(file);
    } else {
      setPaymentPreview(null);
    }
    // OCR it and auto-fill
    setPaymentOcrRunning(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const mediaType = file.type === "application/pdf" ? "application/pdf" : file.type || "image/png";
      const { data, error } = await (supabase as any).functions.invoke("ocr-payment-receipt", {
        body: { file_base64: dataUrl, media_type: mediaType },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (typeof data.amount === "number" && data.amount > 0) setFormCharged(data.amount.toFixed(2));
      if (data.date) {
        try {
          const d = new Date(data.date + "T00:00:00");
          if (!isNaN(d.getTime())) setFormPaidAt(d);
        } catch { /* ignore */ }
      }
      if (data.reference) setFormRef(String(data.reference));
      else if (data.tracking_code) setFormRef(String(data.tracking_code));
      if (data.bank) setFormBank(String(data.bank));
      if (data.method) setFormMethod(String(data.method));
      toast.success(data.confidence === "low" ? "Comprobante leído (revisar)" : "Comprobante leído");
    } catch (err: any) {
      toast.error("Error al leer comprobante: " + (err?.message ?? "desconocido"));
    } finally {
      setPaymentOcrRunning(false);
    }
  };

  // ── Save ────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!shipmentId || !shipment) return;
    setSaving(true);
    try {
      let admPath = shipment.adm_proof_path;
      let paymentPath = shipment.payment_proof_path;
      const ts = Date.now();

      if (newAdmFile) {
        const ext = (newAdmFile.name.split(".").pop() || "png").toLowerCase();
        const path = `partner_shipments/${partner?.code.toLowerCase() ?? "unknown"}/adm_${ts}.${ext}`;
        const { error } = await supabase.storage.from(PROOF_BUCKET).upload(path, newAdmFile, {
          contentType: newAdmFile.type || "image/png", upsert: false,
        });
        if (error) throw error;
        admPath = path;
      }

      if (paymentFile) {
        const ext = (paymentFile.name.split(".").pop() || (paymentFile.type === "application/pdf" ? "pdf" : "png")).toLowerCase();
        const path = `partner_shipments/${partner?.code.toLowerCase() ?? "unknown"}/payment_${ts}.${ext}`;
        const { error } = await supabase.storage.from(PROOF_BUCKET).upload(path, paymentFile, {
          contentType: paymentFile.type || (ext === "pdf" ? "application/pdf" : "image/png"),
          upsert: false,
        });
        if (error) throw error;
        paymentPath = path;
      }

      // Delete + reinsert items (same pattern as StockEntries edit)
      const { error: delErr } = await supabase
        .from("partner_shipment_items")
        .delete()
        .eq("shipment_id", shipmentId);
      if (delErr) throw delErr;

      if (items.length > 0) {
        const payload = items.map(it => ({
          shipment_id: shipmentId,
          product_id: it.product_id,
          clave: it.clave.trim().toUpperCase() || "—",
          description: it.description.trim() || null,
          quantity: Math.max(0, it.quantity),
          kilos: it.kilos,
          cost_without_iva: it.cost_without_iva,
          cost_with_iva: it.cost_with_iva,
          importe: it.importe ?? ((it.cost_with_iva ?? 0) * (it.quantity ?? 0)),
        }));
        const { error: insErr } = await supabase.from("partner_shipment_items").insert(payload as any);
        if (insErr) throw insErr;
      }

      // Update header
      const { error: updErr } = await (supabase as any)
        .from("partner_shipments")
        .update({
          shipment_date: format(formDate, "yyyy-MM-dd"),
          adm_proof_path: admPath,
          adm_total_cost: liveAdmTotal,
          charged_to_partner: chargedNum || null,
          partner_paid_at: formPaidAt ? formPaidAt.toISOString() : null,
          notes: formNotes.trim() || null,
          payment_proof_path: paymentPath,
          payment_reference: formRef.trim() || null,
          payment_method: formMethod.trim() || null,
          payment_bank: formBank.trim() || null,
        })
        .eq("id", shipmentId);
      if (updErr) throw updErr;

      toast.success("Pedido ADM actualizado");
      qc.invalidateQueries({ queryKey: ["partner-shipment-detail", shipmentId] });
      qc.invalidateQueries({ queryKey: ["partner-shipment-items", shipmentId] });
      qc.invalidateQueries({ queryKey: ["partner-shipments"] });
      setEditing(false);
      setNewAdmFile(null);
      setNewAdmPreview(null);
      setPaymentFile(null);
      setPaymentPreview(null);
    } catch (err: any) {
      toast.error("Error al guardar: " + (err?.message ?? "desconocido"));
    } finally {
      setSaving(false);
    }
  };

  const deleteShipment = useMutation({
    mutationFn: async () => {
      if (!shipmentId || !shipment) throw new Error("Sin shipment");
      const paths = [shipment.adm_proof_path, shipment.payment_proof_path].filter(Boolean) as string[];
      if (paths.length > 0) {
        await supabase.storage.from(PROOF_BUCKET).remove(paths).catch(() => {});
      }
      const { error } = await (supabase as any)
        .from("partner_shipments")
        .delete()
        .eq("id", shipmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${shipment?.shipment_code ?? "Pedido"} eliminado`);
      qc.invalidateQueries({ queryKey: ["partner-shipments"] });
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

  const cancelEdit = () => {
    if (!shipment) return;
    setFormDate(parseLocalDate(shipment.shipment_date));
    setFormCharged(shipment.charged_to_partner != null ? String(shipment.charged_to_partner) : "");
    setFormPaidAt(shipment.partner_paid_at ? new Date(shipment.partner_paid_at) : null);
    setFormRef(shipment.payment_reference ?? "");
    setFormMethod(shipment.payment_method ?? "");
    setFormBank(shipment.payment_bank ?? "");
    setFormNotes(shipment.notes ?? "");
    setItems(rawItems.map(it => ({
      uiId: newUiId(),
      clave: it.clave,
      description: it.description ?? "",
      product_id: it.product_id,
      product_image_url: it.products?.image_url ?? null,
      product_name: it.products?.name ?? null,
      quantity: it.quantity,
      kilos: it.kilos,
      cost_without_iva: it.cost_without_iva,
      cost_with_iva: it.cost_with_iva,
      importe: it.importe ?? ((it.cost_with_iva ?? 0) * (it.quantity ?? 0)),
      alias_from: null,
    })));
    setNewAdmFile(null);
    setNewAdmPreview(null);
    setPaymentFile(null);
    setPaymentPreview(null);
    setEditing(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[96vw] sm:max-w-6xl max-h-[92vh] overflow-y-auto p-0">
          <DialogHeader className="px-4 sm:px-6 pt-6 pb-3 border-b">
            <DialogTitle className="text-xl flex items-center gap-3 flex-wrap">
              <Package className="h-5 w-5" />
              <span>Pedido ADM</span>
              {shipment && <span className="font-mono text-blue-400 text-base">{shipment.shipment_code}</span>}
              {partner && (
                <Badge variant="outline" className="bg-muted/40 font-mono">
                  {partner.code}
                </Badge>
              )}
              {shipment && (shipment.partner_paid_at ? (
                <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Pagado · {fmtDate(shipment.partner_paid_at)}
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40 gap-1">
                  <Clock className="h-3 w-3" />
                  Pago pendiente
                </Badge>
              ))}
              {editing && (
                <Badge variant="outline" className="bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40 gap-1 ml-auto">
                  <Pencil className="h-3 w-3" /> Editando
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {partner?.name ?? "—"} · {shipment ? fmtDate(shipment.shipment_date) : "—"} ·
              {" "}{items.length} línea{items.length === 1 ? "" : "s"}
            </DialogDescription>
          </DialogHeader>

          <div className="px-4 sm:px-6 py-4 space-y-5">
            {shipmentLoading || !shipment ? (
              <div className="space-y-3">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : (
              <>
                {/* Two-column: finance + payment proof */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Finance card */}
                  <div className="rounded-xl border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Finanzas
                      </h3>
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Fecha</span>
                        {editing ? (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className="h-8 gap-1 text-xs font-normal">
                                <CalendarIcon className="h-3 w-3" />
                                {format(formDate, "dd/MM/yy", { locale: esLocale })}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                              <Calendar mode="single" selected={formDate} onSelect={(d) => { if (d) setFormDate(d); }} />
                            </PopoverContent>
                          </Popover>
                        ) : (
                          <span className="tabular-nums font-medium">{fmtDate(shipment.shipment_date)}</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Costo ADM (suma)</span>
                        <span className="tabular-nums font-semibold text-foreground">
                          {fmtMXN(editing ? liveAdmTotal : shipment.adm_total_cost)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Cobrado a {partner?.name ?? "partner"}</span>
                        {editing ? (
                          <CurrencyInput
                            value={formCharged}
                            onChange={setFormCharged}
                            className="w-36"
                          />
                        ) : (
                          <span className="tabular-nums font-semibold">{fmtMXN(shipment.charged_to_partner)}</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-sm pt-2 border-t">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <TrendingUp className="h-3.5 w-3.5" /> Markup
                        </span>
                        <div className="text-right">
                          <div className={cn(
                            "tabular-nums font-bold text-base",
                            markup > 0 ? "text-emerald-500" : markup < 0 ? "text-red-500" : "text-muted-foreground",
                          )}>
                            {fmtMXN(markup)}
                          </div>
                          {baseForPct > 0 && markup !== 0 && (
                            <div className="text-[10px] text-muted-foreground tabular-nums">
                              {markup > 0 ? "+" : ""}{markupPct.toFixed(2)}% sobre costo
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Pagado el</span>
                        {editing ? (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className="h-8 gap-1 text-xs font-normal">
                                <CalendarIcon className="h-3 w-3" />
                                {formPaidAt ? format(formPaidAt, "dd/MM/yy", { locale: esLocale }) : "Pendiente"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                              <Calendar mode="single" selected={formPaidAt ?? undefined} onSelect={(d) => setFormPaidAt(d ?? null)} />
                              {formPaidAt && (
                                <div className="p-2 border-t">
                                  <Button size="sm" variant="ghost" onClick={() => setFormPaidAt(null)} className="w-full text-xs">
                                    Marcar como pendiente
                                  </Button>
                                </div>
                              )}
                            </PopoverContent>
                          </Popover>
                        ) : (
                          <span className="tabular-nums">{shipment.partner_paid_at ? fmtDate(shipment.partner_paid_at) : <span className="text-amber-500">Pendiente</span>}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Payment proof card */}
                  <div className="rounded-xl border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Comprobante de pago
                      </h3>
                      <Receipt className="h-4 w-4 text-muted-foreground" />
                    </div>

                    {/* Meta fields — show in both view + edit mode */}
                    {(shipment.payment_proof_path || paymentFile || editing) && (
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Banco</span>
                          {editing ? (
                            <Input value={formBank} onChange={(e) => setFormBank(e.target.value)} className="h-8 w-36" placeholder="Banregio" />
                          ) : (
                            <span className="font-medium">{shipment.payment_bank ?? "—"}</span>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Método</span>
                          {editing ? (
                            <Input value={formMethod} onChange={(e) => setFormMethod(e.target.value)} className="h-8 w-36" placeholder="SPEI" />
                          ) : (
                            <span className="font-medium">{shipment.payment_method ?? "—"}</span>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Referencia</span>
                          {editing ? (
                            <Input value={formRef} onChange={(e) => setFormRef(e.target.value)} className="h-8 w-44 font-mono text-xs" placeholder="123456" />
                          ) : (
                            <span className="font-mono text-xs">{shipment.payment_reference ?? "—"}</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* File slot — view: show open button; edit: show drop zone or staged file */}
                    {!editing ? (
                      shipment.payment_proof_path ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openProof(shipment.payment_proof_path)}
                          className="w-full gap-1.5"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Abrir comprobante
                        </Button>
                      ) : (
                        <div className="text-center py-4 text-sm text-muted-foreground">
                          <Receipt className="h-7 w-7 mx-auto opacity-30 mb-1" />
                          Sin comprobante. Entra a editar para subir uno.
                        </div>
                      )
                    ) : paymentFile ? (
                      <div className="flex items-center gap-2 p-2 rounded-lg border bg-muted/20">
                        {paymentPreview ? (
                          <img src={paymentPreview} alt="" className="h-12 w-10 object-cover rounded border" />
                        ) : (
                          <div className="h-12 w-10 rounded border bg-card flex items-center justify-center">
                            <FileText className="h-5 w-5 text-red-500" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{paymentFile.name}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {(paymentFile.size / 1024).toFixed(1)} KB
                            {paymentOcrRunning && " · Procesando…"}
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => { setPaymentFile(null); setPaymentPreview(null); }} className="h-7 w-7">
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div
                        onClick={() => paymentInputRef.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onDrop={(e) => {
                          e.preventDefault(); e.stopPropagation();
                          const f = e.dataTransfer?.files?.[0];
                          if (f) void handlePaymentFile(f);
                        }}
                        role="button"
                        tabIndex={0}
                        className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                      >
                        {paymentOcrRunning ? (
                          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" /> Leyendo comprobante…
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <Upload className="h-5 w-5 mx-auto opacity-50" />
                            <div className="text-xs text-muted-foreground">
                              {shipment.payment_proof_path ? "Reemplazar" : "Arrastra"} Banregio (img/PDF)
                            </div>
                          </div>
                        )}
                        <input
                          ref={paymentInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp,application/pdf"
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handlePaymentFile(f); }}
                          className="sr-only"
                        />
                        {shipment.payment_proof_path && (
                          <Button
                            variant="link"
                            size="sm"
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openProof(shipment.payment_proof_path); }}
                            className="text-[11px] h-auto p-0 mt-1"
                          >
                            Ver actual
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* ADM image row — view + edit upload */}
                <div className="rounded-lg border bg-muted/20 p-3 flex items-center gap-3 flex-wrap">
                  <ImageIcon className="h-5 w-5 text-blue-400 shrink-0" />
                  <div className="flex-1 min-w-[150px] text-sm">
                    <span className="font-medium">Imagen original ADM</span>
                    <span className="text-muted-foreground"> · Tabla de productos enviada por ADM</span>
                  </div>
                  {!editing ? (
                    shipment.adm_proof_path && (
                      <Button variant="outline" size="sm" onClick={() => openProof(shipment.adm_proof_path)} className="gap-1.5">
                        <Download className="h-3.5 w-3.5" /> Abrir
                      </Button>
                    )
                  ) : (
                    <div className="flex items-center gap-2">
                      {shipment.adm_proof_path && (
                        <Button variant="outline" size="sm" onClick={() => openProof(shipment.adm_proof_path)} className="gap-1.5">
                          <Download className="h-3.5 w-3.5" /> Abrir actual
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => admInputRef.current?.click()} className="gap-1.5">
                        <RefreshCw className="h-3.5 w-3.5" />
                        {newAdmFile ? "Cambiar otra vez" : "Reemplazar"}
                      </Button>
                      <input
                        ref={admInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleAdmFile(f); }}
                        className="sr-only"
                      />
                      {newAdmFile && (
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/40 gap-1">
                          <Upload className="h-3 w-3" />
                          {newAdmFile.name} (se subirá al guardar)
                        </Badge>
                      )}
                    </div>
                  )}
                </div>

                {/* Line items editor */}
                <div className="rounded-xl border bg-card overflow-hidden">
                  <div className="px-4 py-3 border-b flex items-center justify-between flex-wrap gap-2">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Productos
                    </h3>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono">
                        {items.length} línea{items.length === 1 ? "" : "s"}
                      </Badge>
                      {editing && (
                        <Button size="sm" variant="outline" onClick={addItem} className="h-7 gap-1 text-xs">
                          <Plus className="h-3 w-3" /> Agregar línea
                        </Button>
                      )}
                    </div>
                  </div>
                  {itemsLoading ? (
                    <div className="p-4 space-y-2">
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/30 border-b">
                          <tr className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            <th className="text-left px-2 py-2 w-[130px]">SKU</th>
                            <th className="text-left px-2 py-2">Producto</th>
                            <th className="text-right px-2 py-2 w-[80px]">Piezas</th>
                            <th className="text-right px-2 py-2 w-[80px]">Kilos</th>
                            <th className="text-right px-2 py-2 w-[110px]">Costo s/IVA</th>
                            <th className="text-right px-2 py-2 w-[110px]">Costo c/IVA</th>
                            <th className="text-right px-2 py-2 w-[130px]">Importe</th>
                            {editing && <th className="w-[40px]"></th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {items.map((it) => {
                            const importe = it.importe ?? ((it.cost_with_iva ?? 0) * (it.quantity ?? 0));
                            return (
                              <tr key={it.uiId} className={cn("hover:bg-muted/20")}>
                                <td className="px-2 py-2">
                                  {editing ? (
                                    <div className="flex flex-col gap-1">
                                      <Input
                                        value={it.clave}
                                        onChange={(e) => updateItem(it.uiId, { clave: e.target.value.toUpperCase() })}
                                        className="h-8 font-mono text-xs"
                                      />
                                      {it.alias_from && (
                                        <span className="text-[9px] font-mono text-blue-700 dark:text-blue-300 bg-blue-500/10 border border-blue-500/30 rounded px-1 py-0.5 self-start">
                                          ← {it.alias_from}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="font-mono text-xs text-blue-400">{it.clave}</span>
                                  )}
                                </td>
                                <td className="px-2 py-2">
                                  <div className="flex items-center gap-2">
                                    {it.product_image_url ? (
                                      <img src={it.product_image_url} alt="" className="h-8 w-8 rounded object-contain bg-white border shrink-0" />
                                    ) : (
                                      <div className="h-8 w-8 rounded bg-muted/40 border flex items-center justify-center shrink-0">
                                        <ImageIcon className="h-3.5 w-3.5 text-muted-foreground/40" />
                                      </div>
                                    )}
                                    {editing ? (
                                      <Input
                                        value={it.description || it.product_name || ""}
                                        onChange={(e) => updateItem(it.uiId, { description: e.target.value })}
                                        className="h-8 text-sm"
                                        placeholder={it.product_name || "Descripción"}
                                      />
                                    ) : (
                                      <span className="text-sm">
                                        {it.product_name || it.description || <span className="text-muted-foreground italic">(sin descripción)</span>}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-2 py-2">
                                  {editing ? (
                                    <Input
                                      type="number"
                                      min={0}
                                      value={it.quantity || ""}
                                      onChange={(e) => updateItem(it.uiId, { quantity: parseInt(e.target.value) || 0 })}
                                      className="h-8 text-right tabular-nums px-2"
                                    />
                                  ) : (
                                    <div className="text-right tabular-nums">{it.quantity}</div>
                                  )}
                                </td>
                                <td className="px-2 py-2">
                                  {editing ? (
                                    <Input
                                      type="number"
                                      step="0.01"
                                      value={it.kilos ?? ""}
                                      onChange={(e) => updateItem(it.uiId, { kilos: e.target.value === "" ? null : parseFloat(e.target.value) })}
                                      className="h-8 text-right tabular-nums px-2"
                                    />
                                  ) : (
                                    <div className="text-right tabular-nums text-muted-foreground">{it.kilos != null ? it.kilos.toLocaleString("es-MX") : "—"}</div>
                                  )}
                                </td>
                                <td className="px-2 py-2">
                                  {editing ? (
                                    <Input
                                      type="number"
                                      step="0.01"
                                      value={it.cost_without_iva ?? ""}
                                      onChange={(e) => updateItem(it.uiId, { cost_without_iva: e.target.value === "" ? null : parseFloat(e.target.value) })}
                                      className="h-8 text-right tabular-nums"
                                    />
                                  ) : (
                                    <div className="text-right tabular-nums">{fmtMXN(it.cost_without_iva)}</div>
                                  )}
                                </td>
                                <td className="px-2 py-2">
                                  {editing ? (
                                    <Input
                                      type="number"
                                      step="0.01"
                                      value={it.cost_with_iva ?? ""}
                                      onChange={(e) => updateItem(it.uiId, { cost_with_iva: e.target.value === "" ? null : parseFloat(e.target.value) })}
                                      className="h-8 text-right tabular-nums"
                                    />
                                  ) : (
                                    <div className="text-right tabular-nums">{fmtMXN(it.cost_with_iva)}</div>
                                  )}
                                </td>
                                <td className="px-2 py-2 text-right tabular-nums font-semibold">
                                  {fmtMXN(importe)}
                                </td>
                                {editing && (
                                  <td className="px-2 py-2 text-right">
                                    <button
                                      type="button"
                                      onClick={() => removeItem(it.uiId)}
                                      className="rounded-md p-1 hover:bg-muted/40 text-red-600 dark:text-red-400"
                                      title="Eliminar línea"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-muted/30 border-t">
                          <tr className="text-sm font-semibold">
                            <td colSpan={6} className="px-2 py-2 text-right text-muted-foreground">Total costo ADM (vivo)</td>
                            <td className="px-2 py-2 text-right tabular-nums">{fmtMXN(liveAdmTotal)}</td>
                            {editing && <td></td>}
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>

                {/* Notas */}
                <div className="space-y-1">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Notas</Label>
                  {editing ? (
                    <Input value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Notas opcionales…" />
                  ) : (
                    <div className="text-sm text-foreground">{shipment.notes || <span className="text-muted-foreground italic">Sin notas</span>}</div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          {shipment && (
            <div className="px-4 sm:px-6 py-3 border-t bg-muted/20 flex items-center gap-2 justify-end">
              {!editing ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setConfirmDelete(true)}
                    className="gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 border-red-500/30"
                  >
                    <Trash2 className="h-4 w-4" />
                    Eliminar
                  </Button>
                  <Button onClick={() => setEditing(true)} className="gap-1.5">
                    <Pencil className="h-4 w-4" />
                    Editar
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={cancelEdit} disabled={saving} className="gap-1.5">
                    <X className="h-4 w-4" />
                    Cancelar
                  </Button>
                  <Button onClick={handleSave} disabled={saving} className="gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white">
                    {saving ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</>
                    ) : (
                      <><Save className="h-4 w-4" /> Guardar cambios</>
                    )}
                  </Button>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              ¿Eliminar este Pedido ADM?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Vas a eliminar <span className="font-mono font-semibold">{shipment?.shipment_code}</span>{" "}
                con <span className="font-semibold">{items.length} línea{items.length === 1 ? "" : "s"}</span>{" "}
                por <span className="font-semibold">{fmtMXN(shipment?.adm_total_cost)}</span> (costo ADM).
              </span>
              <span className="block text-xs">
                Las imágenes adjuntas (ADM + comprobante de pago) también se borran. Esta acción no se puede deshacer.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteShipment.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteShipment.mutate()}
              disabled={deleteShipment.isPending}
              className="bg-red-500 hover:bg-red-600 text-white gap-1.5"
            >
              {deleteShipment.isPending ? (
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
