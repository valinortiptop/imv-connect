import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ChronoBar } from "@/components/ChronoBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  Search, ChevronRight, ChevronDown, FileText, Upload, Trash2, Eye,
  CheckCircle2, XCircle, AlertCircle, Download, X, Image, File,
  CalendarIcon, FileCheck, FileClock, FileX, Files, Settings2, Loader2,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { parseLocalDate, calendarDateToString } from "@/lib/date-utils";

// ── Types ──────────────────────────────────────────────
type DocCategory = "factura" | "nota_credito" | "comprobante_pago" | "comprobante_entrega" | "otro";

type RequiredDocs = {
  cash: DocCategory[];
  transfer: DocCategory[];
};

const DEFAULT_REQUIRED: RequiredDocs = {
  cash: ["comprobante_entrega"],
  transfer: ["factura", "comprobante_pago", "comprobante_entrega"],
};

// Categories that can be toggled as required. nota_credito and otro stay
// always-optional regardless of client preferences.
const CONFIGURABLE_CATEGORIES: DocCategory[] = ["factura", "comprobante_pago", "comprobante_entrega"];

function normalizeRequired(raw: any): RequiredDocs {
  const cash = Array.isArray(raw?.cash) ? raw.cash.filter((c: any) => CONFIGURABLE_CATEGORIES.includes(c)) : DEFAULT_REQUIRED.cash;
  const transfer = Array.isArray(raw?.transfer) ? raw.transfer.filter((c: any) => CONFIGURABLE_CATEGORIES.includes(c)) : DEFAULT_REQUIRED.transfer;
  return { cash, transfer };
}

function getRequiredFor(req: RequiredDocs, paymentMethod: string): DocCategory[] {
  return paymentMethod === "Efectivo" ? req.cash : req.transfer;
}

type OrderDocument = {
  id: string;
  order_id: string;
  category: DocCategory;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number | null;
  notes: string | null;
  uploaded_at: string;
};

type OrderWithDocs = {
  id: string;
  order_code: string;
  order_date: string | null;
  delivery_date: string | null;
  status: string;
  client_id: string | null;
  client_name: string;
  payment_method: string;
  total: number;
  documents: OrderDocument[];
  required_documents: RequiredDocs;
  /** Set when the client signed the entrega via /entrega/:token. Used to
   *  auto-generate the comprobante PDF if step 4 of the signing flow
   *  silently failed (e.g. P-0036 on May 1). */
  signed_at: string | null;
  signature_path: string | null;
};

const CATEGORIES: { key: DocCategory; label: string; labelEn: string; icon: React.ReactNode }[] = [
  { key: "factura", label: "Factura", labelEn: "Invoice", icon: <FileText className="h-4 w-4" /> },
  { key: "nota_credito", label: "Nota de Crédito", labelEn: "Credit Note", icon: <FileText className="h-4 w-4" /> },
  { key: "comprobante_pago", label: "Comp. de Pago", labelEn: "Proof of Payment", icon: <FileText className="h-4 w-4" /> },
  { key: "comprobante_entrega", label: "Comp. de Entrega", labelEn: "Proof of Delivery", icon: <FileText className="h-4 w-4" /> },
  { key: "otro", label: "Otro", labelEn: "Other", icon: <File className="h-4 w-4" /> },
];

const CATEGORY_LABELS: Record<DocCategory, { es: string; en: string }> = {
  factura: { es: "Factura", en: "Invoice" },
  nota_credito: { es: "Nota de Crédito", en: "Credit Note" },
  comprobante_pago: { es: "Comprobante de Pago", en: "Proof of Payment" },
  comprobante_entrega: { es: "Comprobante de Entrega", en: "Proof of Delivery" },
  otro: { es: "Otro", en: "Other" },
};

const STORAGE_URL = "https://rfyshhzkhewzjudohzii.supabase.co/storage/v1/object/public/order-documents/";
const STORAGE_ROOT = "https://rfyshhzkhewzjudohzii.supabase.co/storage/v1/object/public/";

/** Build a public storage URL for a doc given its bucket. The legacy
 *  STORAGE_URL constant above is kept around so the unchanged order
 *  rendering paths don't have to be touched. */
function docUrl(bucket: string, path: string) {
  return STORAGE_ROOT + bucket + "/" + path;
}

/* ── Stock-delivery (entrada) document types — parallel to the order
 *    side. Categories are intentionally sparse: just the supplier's
 *    invoice plus a catch-all 'otro'. */
type DeliveryDocCategory = "factura_proveedor" | "otro";

type DeliveryDocument = {
  id: string;
  delivery_id: string;
  category: DeliveryDocCategory;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number | null;
  notes: string | null;
  uploaded_at: string;
};

type DeliveryWithDocs = {
  id: string;
  delivery_code: string;
  delivery_date: string | null;
  supplier: string | null;
  reference: string | null;
  delivery_status: string;
  total_bultos: number;
  product_count: number;
  documents: DeliveryDocument[];
};

const DELIVERY_CATEGORIES: { key: DeliveryDocCategory; label: string; labelEn: string; icon: React.ReactNode }[] = [
  { key: "factura_proveedor", label: "Factura Proveedor", labelEn: "Supplier Invoice", icon: <FileText className="h-4 w-4" /> },
  { key: "otro", label: "Otro", labelEn: "Other", icon: <File className="h-4 w-4" /> },
];

const DELIVERY_REQUIRED: DeliveryDocCategory[] = ["factura_proveedor"];

function getDeliveryDocStatus(docs: DeliveryDocument[]): "complete" | "empty" {
  return docs.some(d => d.category === "factura_proveedor") ? "complete" : "empty";
}

// ── Helpers ────────────────────────────────────────────
function getDocStatus(docs: OrderDocument[], required: DocCategory[], orderStatus: string): "complete" | "partial" | "empty" | "cancelled" {
  if (orderStatus === "Cancelado") return "cancelled";

  if (required.length === 0) return "complete";

  const present = required.filter(cat => docs.some(d => d.category === cat));
  if (present.length === required.length) return "complete";
  if (present.length === 0) return "empty";
  return "partial";
}

function countByCategory(docs: OrderDocument[], cat: DocCategory): number {
  return docs.filter(d => d.category === cat).length;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  try { return format(new Date(d), "dd/MM/yy"); } catch { return d; }
}

function fmtDateTime(d: string): string {
  try { return format(new Date(d), "dd MMM yyyy, HH:mm", { locale: es }); } catch { return d; }
}

function getFileIcon(fileType: string) {
  if (fileType.startsWith("image/")) return <Image className="h-4 w-4 text-blue-400" />;
  return <FileText className="h-4 w-4 text-red-400" />;
}

// ── Status Badge Component ─────────────────────────────
function DocStatusBadge({ status }: { status: "complete" | "partial" | "empty" | "cancelled" }) {
  if (status === "cancelled") {
    return (
      <Badge className="bg-gray-500/15 text-gray-400 border-gray-500/30 gap-1">
        <XCircle className="h-3 w-3" /> Cancelado
      </Badge>
    );
  }
  if (status === "complete") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 gap-1">
        <CheckCircle2 className="h-3 w-3" /> Completo
      </Badge>
    );
  }
  if (status === "partial") {
    return (
      <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30 gap-1">
        <AlertCircle className="h-3 w-3" /> Parcial
      </Badge>
    );
  }
  return (
    <Badge className="bg-red-500/15 text-red-500 border-red-500/30 gap-1">
      <XCircle className="h-3 w-3" /> Sin docs
    </Badge>
  );
}

// ── Category Check Cell ────────────────────────────────
// All variants render at the same height/width so columns line up.
function CategoryCell({ count }: { count: number }) {
  if (count === 0) {
    return (
      <span className="inline-flex items-center justify-center h-5 min-w-[2rem]">
        <XCircle className="h-4 w-4 text-muted-foreground/40" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center gap-1 h-5 min-w-[2rem] text-emerald-500 font-medium text-sm">
      <CheckCircle2 className="h-4 w-4" /> {count}
    </span>
  );
}

function OptionalCell({ lang }: { lang: "es" | "en" }) {
  return (
    <span className="inline-flex items-center justify-center h-5 min-w-[2rem] text-muted-foreground/40 text-xs italic">
      {lang === "es" ? "Opcional" : "Optional"}
    </span>
  );
}

// ── Upload Drop Zone ───────────────────────────────────
function UploadZone({
  orderId,
  category,
  lang,
  onUploaded,
}: {
  orderId: string;
  category: DocCategory;
  lang: "es" | "en";
  onUploaded: () => void;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const allowed = ["application/pdf", "image/jpeg", "image/png"];
    const validFiles = Array.from(files).filter(f => allowed.includes(f.type));

    if (validFiles.length === 0) {
      toast({ title: lang === "es" ? "Formato no permitido" : "Format not allowed", description: "PDF, JPG, PNG", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      for (const file of validFiles) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
        const timestamp = Date.now();
        const path = `${orderId}/${category}/${timestamp}_${file.name}`;

        const { error: uploadError } = await supabase.storage
          .from("order-documents")
          .upload(path, file, { contentType: file.type });

        if (uploadError) throw uploadError;

        const { error: dbError } = await supabase.from("order_documents").insert({
          order_id: orderId,
          category,
          file_name: file.name,
          file_path: path,
          file_type: file.type,
          file_size: file.size,
        });

        if (dbError) throw dbError;
      }

      toast({
        title: lang === "es" ? "Archivo subido" : "File uploaded",
        description: `${validFiles.length} ${lang === "es" ? "archivo(s)" : "file(s)"}`,
      });
      onUploaded();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [orderId, category, lang, toast, onUploaded]);

  return (
    <div
      className={cn(
        "border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors",
        isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/20 hover:border-muted-foreground/40",
        uploading && "opacity-50 pointer-events-none"
      )}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Upload className={cn("h-5 w-5 mx-auto mb-1", uploading ? "animate-pulse" : "text-muted-foreground/50")} />
      <p className="text-xs text-muted-foreground">
        {uploading
          ? (lang === "es" ? "Subiendo..." : "Uploading...")
          : (lang === "es" ? "Arrastra o haz clic" : "Drag or click")
        }
      </p>
      <p className="text-[10px] text-muted-foreground/60">PDF, JPG, PNG</p>
    </div>
  );
}

// ── File Preview Modal ─────────────────────────────────
function FilePreviewModal({
  doc,
  open,
  onClose,
}: {
  doc: OrderDocument | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!doc) return null;
  const url = STORAGE_URL + doc.file_path;
  const isImage = doc.file_type.startsWith("image/");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getFileIcon(doc.file_type)}
            {doc.file_name}
          </DialogTitle>
          <DialogDescription>
            {formatFileSize(doc.file_size)} &middot; {fmtDateTime(doc.uploaded_at)}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto mt-2" style={{ maxHeight: "70vh" }}>
          {isImage ? (
            <img src={url} alt={doc.file_name} className="max-w-full h-auto rounded-md" />
          ) : (
            <iframe src={url} className="w-full h-[65vh] rounded-md border" title={doc.file_name} />
          )}
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" size="sm" asChild>
            <a href={url} target="_blank" rel="noreferrer" download>
              <Download className="h-4 w-4 mr-1" />
              Descargar
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Expanded Row ───────────────────────────────────────
function OrderExpandedRow({
  order,
  lang,
  onRefresh,
}: {
  order: OrderWithDocs;
  lang: "es" | "en";
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [previewDoc, setPreviewDoc] = useState<OrderDocument | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<OrderDocument | null>(null);
  const queryClient = useQueryClient();

  const handleDelete = async () => {
    if (!deleteDoc) return;
    try {
      await supabase.storage.from("order-documents").remove([deleteDoc.file_path]);
      const { error } = await supabase.from("order_documents").delete().eq("id", deleteDoc.id);
      if (error) throw error;
      toast({ title: lang === "es" ? "Eliminado" : "Deleted" });
      onRefresh();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeleteDoc(null);
    }
  };

  const requiredList = getRequiredFor(order.required_documents, order.payment_method);

  return (
    <>
      {/* Required-docs summary for this order */}
      <div className="text-xs text-muted-foreground mb-3 pb-3 border-b">
        {lang === "es" ? "Documentos requeridos: " : "Required: "}
        <span className="text-foreground font-medium">
          {requiredList.length === 0
            ? (lang === "es" ? "ninguno" : "none")
            : requiredList.map(c => CATEGORY_LABELS[c][lang]).join(" + ")}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {CATEGORIES.map((cat) => {
          const docs = order.documents.filter(d => d.category === cat.key);
          return (
            <div key={cat.key} className="border rounded-lg p-3 bg-card/50">
              <div className="flex items-center gap-2 mb-2 pb-2 border-b">
                {cat.icon}
                <h4 className="text-sm font-medium">{lang === "es" ? cat.label : cat.labelEn}</h4>
                {docs.length > 0 && (
                  <Badge variant="secondary" className="ml-auto text-xs">{docs.length}</Badge>
                )}
              </div>

              {/* Files list */}
              <div className="space-y-1.5 mb-2">
                {docs.map((doc) => {
                  const url = STORAGE_URL + doc.file_path;
                  const isImage = doc.file_type.startsWith("image/");
                  return (
                    <div key={doc.id} className="group flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 transition-colors">
                      {isImage ? (
                        <img
                          src={url}
                          alt={doc.file_name}
                          className="h-8 w-8 rounded object-cover flex-shrink-0 cursor-pointer"
                          onClick={() => setPreviewDoc(doc)}
                        />
                      ) : (
                        <div
                          className="h-8 w-8 rounded bg-red-500/10 flex items-center justify-center flex-shrink-0 cursor-pointer"
                          onClick={() => setPreviewDoc(doc)}
                        >
                          <FileText className="h-4 w-4 text-red-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{doc.file_name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatFileSize(doc.file_size)} &middot; {fmtDate(doc.uploaded_at)}
                        </p>
                      </div>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setPreviewDoc(doc)}>
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setDeleteDoc(doc)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Upload zone */}
              <UploadZone
                orderId={order.id}
                category={cat.key}
                lang={lang}
                onUploaded={onRefresh}
              />
            </div>
          );
        })}
      </div>

      {/* Preview modal */}
      <FilePreviewModal doc={previewDoc} open={!!previewDoc} onClose={() => setPreviewDoc(null)} />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteDoc} onOpenChange={() => setDeleteDoc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {lang === "es" ? "Eliminar archivo?" : "Delete file?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDoc?.file_name}
              <br />
              {lang === "es"
                ? "Esta accion no se puede deshacer."
                : "This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{lang === "es" ? "Cancelar" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {lang === "es" ? "Eliminar" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Client Document Preferences Dialog ─────────────────
function ClientDocPrefsDialog({
  clientId,
  clientName,
  initial,
  open,
  onClose,
  onSaved,
  lang,
}: {
  clientId: string;
  clientName: string;
  initial: RequiredDocs;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  lang: "es" | "en";
}) {
  const { toast } = useToast();
  const [cash, setCash] = useState<DocCategory[]>(initial.cash);
  const [transfer, setTransfer] = useState<DocCategory[]>(initial.transfer);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (open) {
      setCash(initial.cash);
      setTransfer(initial.transfer);
    }
  }, [open, initial]);

  const toggle = (
    list: DocCategory[],
    setList: (v: DocCategory[]) => void,
    cat: DocCategory,
  ) => {
    setList(list.includes(cat) ? list.filter(c => c !== cat) : [...list, cat]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("clients")
        .update({ required_documents: { cash, transfer } })
        .eq("id", clientId);
      if (error) throw error;
      toast({ title: lang === "es" ? "Guardado" : "Saved" });
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefault = () => {
    setCash(DEFAULT_REQUIRED.cash);
    setTransfer(DEFAULT_REQUIRED.transfer);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {lang === "es" ? "Documentos requeridos" : "Required documents"}
          </DialogTitle>
          <DialogDescription>
            {clientName}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          {/* Cash column */}
          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b">
              <Badge className="bg-green-500/15 text-green-500 border-green-500/30 text-[10px]">
                {lang === "es" ? "Efectivo" : "Cash"}
              </Badge>
            </div>
            <div className="space-y-2.5">
              {CONFIGURABLE_CATEGORIES.map((cat) => (
                <label key={cat} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={cash.includes(cat)}
                    onCheckedChange={() => toggle(cash, setCash, cat)}
                  />
                  <span className="text-sm">
                    {lang === "es" ? CATEGORY_LABELS[cat].es : CATEGORY_LABELS[cat].en}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Transfer column */}
          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b">
              <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/30 text-[10px]">
                {lang === "es" ? "Transferencia / Depósito" : "Transfer / Deposit"}
              </Badge>
            </div>
            <div className="space-y-2.5">
              {CONFIGURABLE_CATEGORIES.map((cat) => (
                <label key={cat} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={transfer.includes(cat)}
                    onCheckedChange={() => toggle(transfer, setTransfer, cat)}
                  />
                  <span className="text-sm">
                    {lang === "es" ? CATEGORY_LABELS[cat].es : CATEGORY_LABELS[cat].en}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {lang === "es"
            ? "Nota de Crédito y Otro siempre son opcionales."
            : "Credit Note and Other are always optional."}
        </p>

        <div className="flex justify-between gap-2 mt-2">
          <Button variant="ghost" size="sm" onClick={handleResetDefault} disabled={saving}>
            {lang === "es" ? "Restaurar default" : "Reset default"}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
              {lang === "es" ? "Cancelar" : "Cancel"}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? (lang === "es" ? "Guardando..." : "Saving...") : (lang === "es" ? "Guardar" : "Save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Master Client Picker Dialog ────────────────────────
type ClientRow = { id: string; name: string; required: RequiredDocs };

function MasterClientDocPrefsDialog({
  open,
  onClose,
  onSaved,
  lang,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  lang: "es" | "en";
}) {
  const { toast } = useToast();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cash, setCash] = useState<DocCategory[]>([]);
  const [transfer, setTransfer] = useState<DocCategory[]>([]);
  const [saving, setSaving] = useState(false);

  // Load clients when dialog opens
  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelectedId(null);
    setSearch("");
    supabase
      .from("clients")
      .select("id, name, required_documents")
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          toast({ title: "Error", description: error.message, variant: "destructive" });
          setLoading(false);
          return;
        }
        setClients(
          (data || []).map((c: any) => ({
            id: c.id,
            name: c.name,
            required: normalizeRequired(c.required_documents),
          })),
        );
        setLoading(false);
      });
  }, [open, toast]);

  // When a client is picked, hydrate the checkboxes
  const selectClient = (id: string) => {
    const c = clients.find(x => x.id === id);
    if (!c) return;
    setSelectedId(id);
    setCash(c.required.cash);
    setTransfer(c.required.transfer);
  };

  const toggle = (
    list: DocCategory[],
    setList: (v: DocCategory[]) => void,
    cat: DocCategory,
  ) => {
    setList(list.includes(cat) ? list.filter(c => c !== cat) : [...list, cat]);
  };

  const handleSave = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("clients")
        .update({ required_documents: { cash, transfer } })
        .eq("id", selectedId);
      if (error) throw error;
      toast({ title: lang === "es" ? "Guardado" : "Saved" });
      // Update local cache so the dialog reflects the save without reloading
      setClients(prev => prev.map(c => c.id === selectedId ? { ...c, required: { cash, transfer } } : c));
      onSaved();
      setSelectedId(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefault = () => {
    setCash(DEFAULT_REQUIRED.cash);
    setTransfer(DEFAULT_REQUIRED.transfer);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(c => c.name.toLowerCase().includes(q));
  }, [clients, search]);

  const selected = clients.find(c => c.id === selectedId) || null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {lang === "es" ? "Documentos requeridos por cliente" : "Required documents per client"}
          </DialogTitle>
          <DialogDescription>
            {lang === "es"
              ? "Selecciona un cliente para configurar qué documentos necesitas."
              : "Pick a client to configure which documents are required."}
          </DialogDescription>
        </DialogHeader>

        {!selected ? (
          <>
            {/* Client picker */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={lang === "es" ? "Buscar cliente..." : "Search client..."}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>
            <div className="max-h-[50vh] overflow-y-auto border rounded-md divide-y">
              {loading ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  {lang === "es" ? "Cargando..." : "Loading..."}
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  {lang === "es" ? "Sin resultados" : "No results"}
                </div>
              ) : (
                filtered.map((c) => {
                  const cashLabel = c.required.cash.length === 0
                    ? (lang === "es" ? "ninguno" : "none")
                    : c.required.cash.map(cat => CATEGORY_LABELS[cat][lang].split(" ")[0]).join(", ");
                  const transferLabel = c.required.transfer.length === 0
                    ? (lang === "es" ? "ninguno" : "none")
                    : c.required.transfer.map(cat => CATEGORY_LABELS[cat][lang].split(" ")[0]).join(", ");
                  return (
                    <button
                      key={c.id}
                      onClick={() => selectClient(c.id)}
                      className="w-full text-left p-3 hover:bg-muted/50 transition-colors"
                    >
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        <span className="text-green-500">●</span> {lang === "es" ? "Efec" : "Cash"}: {cashLabel}
                        <span className="mx-2 text-border">·</span>
                        <span className="text-blue-500">●</span> {lang === "es" ? "Transf" : "Transfer"}: {transferLabel}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <>
            {/* Editor for selected client */}
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{selected.name}</p>
              <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)} disabled={saving}>
                {lang === "es" ? "← Cambiar cliente" : "← Change client"}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4 py-2">
              <div className="border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                  <Badge className="bg-green-500/15 text-green-500 border-green-500/30 text-[10px]">
                    {lang === "es" ? "Efectivo" : "Cash"}
                  </Badge>
                </div>
                <div className="space-y-2.5">
                  {CONFIGURABLE_CATEGORIES.map((cat) => (
                    <label key={cat} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={cash.includes(cat)}
                        onCheckedChange={() => toggle(cash, setCash, cat)}
                      />
                      <span className="text-sm">
                        {lang === "es" ? CATEGORY_LABELS[cat].es : CATEGORY_LABELS[cat].en}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                  <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/30 text-[10px]">
                    {lang === "es" ? "Transferencia / Depósito" : "Transfer / Deposit"}
                  </Badge>
                </div>
                <div className="space-y-2.5">
                  {CONFIGURABLE_CATEGORIES.map((cat) => (
                    <label key={cat} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={transfer.includes(cat)}
                        onCheckedChange={() => toggle(transfer, setTransfer, cat)}
                      />
                      <span className="text-sm">
                        {lang === "es" ? CATEGORY_LABELS[cat].es : CATEGORY_LABELS[cat].en}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {lang === "es"
                ? "Nota de Crédito y Otro siempre son opcionales."
                : "Credit Note and Other are always optional."}
            </p>

            <div className="flex justify-between gap-2 mt-2">
              <Button variant="ghost" size="sm" onClick={handleResetDefault} disabled={saving}>
                {lang === "es" ? "Restaurar default" : "Reset default"}
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
                  {lang === "es" ? "Cerrar" : "Close"}
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? (lang === "es" ? "Guardando..." : "Saving...") : (lang === "es" ? "Guardar" : "Save")}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Payment Method Badge ───────────────────────────────
const PAYMENT_METHODS = [
  { value: "Transferencia", label: "Transferencia", color: "bg-blue-500/15 text-blue-500 border-blue-500/30" },
  { value: "Depósito", label: "Depósito", color: "bg-purple-500/15 text-purple-500 border-purple-500/30" },
  { value: "Efectivo", label: "Efectivo", color: "bg-green-500/15 text-green-500 border-green-500/30" },
  { value: "Otro", label: "Otro", color: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
];

function PaymentMethodBadge({ method }: { method: string }) {
  const pm = PAYMENT_METHODS.find(p => p.value === method) || PAYMENT_METHODS[0];
  return (
    <Badge className={cn("text-[10px] gap-1", pm.color)}>
      {pm.label}
    </Badge>
  );
}

// ── Date helpers ───────────────────────────────────────
const getFirstOfMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
};

// ── Main Page Component ────────────────────────────────
export default function OrderDocuments() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [view, setView] = useState<"pedidos" | "entradas">("pedidos");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "complete" | "partial" | "empty">("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState(getFirstOfMonth());
  const [dateTo, setDateTo] = useState("");
  const [docPrefsOpen, setDocPrefsOpen] = useState(false);

  const setThisMonth = () => { setDateFrom(getFirstOfMonth()); setDateTo(""); };
  const setAllTime = () => { setDateFrom(""); setDateTo(""); };

  // Fetch orders + their documents
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["order-documents-list"],
    queryFn: async () => {
      const { data: ordersData, error: ordersErr } = await (supabase as any)
        .from("orders")
        .select("id, order_code, order_date, delivery_date, status, payment_method, client_id, discount_amount, signed_at, signature_path, clients(name, required_documents), order_items(quantity, unit_price_override)")
        .order("order_code", { ascending: false });

      if (ordersErr) throw ordersErr;

      const { data: docsData, error: docsErr } = await supabase
        .from("order_documents")
        .select("*")
        .order("uploaded_at", { ascending: false });

      if (docsErr) throw docsErr;

      const docsMap = new Map<string, OrderDocument[]>();
      (docsData || []).forEach((doc: any) => {
        if (!docsMap.has(doc.order_id)) docsMap.set(doc.order_id, []);
        docsMap.get(doc.order_id)!.push(doc);
      });

      return (ordersData || []).map((o: any): OrderWithDocs => {
        const subtotal = (o.order_items || []).reduce((sum: number, i: any) =>
          sum + (i.quantity || 0) * (i.unit_price_override || 0), 0);
        const discount = Math.min(Number(o.discount_amount) || 0, subtotal);
        const total = Math.max(0, subtotal - discount);
        return {
          id: o.id,
          order_code: o.order_code || "—",
          order_date: o.order_date,
          delivery_date: o.delivery_date,
          status: o.status || "pendiente",
          payment_method: o.payment_method || "Transferencia",
          client_id: o.client_id || null,
          client_name: o.clients?.name || "—",
          total,
          documents: docsMap.get(o.id) || [],
          required_documents: normalizeRequired(o.clients?.required_documents),
          signed_at: o.signed_at ?? null,
          signature_path: o.signature_path ?? null,
        };
      });
    },
  });

  // Auto-generate the comprobante PDF for any signed order that doesn't
  // already have one in order_documents. The signing flow at /entrega/:token
  // tries to upload the comprobante after stamping signed_at, but that step
  // can silently fail (network blip, html2canvas race, etc.). Without this
  // self-heal pass, the order looks signed in the system but never shows
  // the comprobante here. We do it lazily, one order at a time, only after
  // the list has loaded so we don't block the UI.
  const isHealing = useRef(false);
  useEffect(() => {
    if (isHealing.current) return;
    if (!orders.length) return;
    const missing = orders.filter(o =>
      o.signed_at &&
      o.signature_path &&
      !o.documents.some(d => d.category === "comprobante_entrega" && d.file_name?.toLowerCase().includes("comprobante"))
    );
    if (missing.length === 0) return;

    isHealing.current = true;
    (async () => {
      try {
        const { uploadSignedComprobanteForOrder } = await import("@/components/orders/SingleOrderImageCard");
        for (const o of missing) {
          try {
            await uploadSignedComprobanteForOrder(o.id);
          } catch (err) {
            console.error(`[order-documents] failed to auto-generate comprobante for ${o.order_code}`, err);
          }
        }
        // Refresh once after the batch so all newly-uploaded docs appear
        queryClient.invalidateQueries({ queryKey: ["order-documents-list"] });
      } finally {
        isHealing.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders.length]);

  const refreshDocs = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["order-documents-list"] });
  }, [queryClient]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // Filter + search + date
  const filtered = useMemo(() => {
    let result = orders;

    // Date filter
    if (dateFrom) {
      result = result.filter(o => o.order_date && o.order_date >= dateFrom);
    }
    if (dateTo) {
      result = result.filter(o => o.order_date && o.order_date <= dateTo);
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(o =>
        o.order_code.toLowerCase().includes(q) ||
        o.client_name.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== "all") {
      result = result.filter(o => getDocStatus(o.documents, getRequiredFor(o.required_documents, o.payment_method), o.status) === statusFilter);
    }

    return result;
  }, [orders, search, statusFilter, dateFrom, dateTo]);

  // Stats (based on filtered results)
  const stats = useMemo(() => {
    const nonCancelled = filtered.filter(o => o.status !== "Cancelado");
    const total = filtered.length;
    const statusOf = (o: OrderWithDocs) => getDocStatus(o.documents, getRequiredFor(o.required_documents, o.payment_method), o.status);
    const complete = nonCancelled.filter(o => statusOf(o) === "complete").length;
    const partial = nonCancelled.filter(o => statusOf(o) === "partial").length;
    const empty = nonCancelled.filter(o => statusOf(o) === "empty").length;
    const totalDocs = filtered.reduce((sum, o) => sum + o.documents.length, 0);
    return { total, complete, partial, empty, totalDocs };
  }, [filtered]);

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          {/* Locked-width title block so the toggle never shifts when the
              subtitle changes between Pedidos / Entradas. The subtitle
              truncates if it gets too long for the box. */}
          <div className="w-[440px] shrink-0">
            <h1 className="text-2xl font-bold tracking-tight">
              {lang === "es" ? "Documentos" : "Documents"}
            </h1>
            <p className="text-sm text-muted-foreground truncate">
              {view === "pedidos"
                ? (lang === "es" ? "Facturas, comprobantes de pago y entrega por pedido" : "Invoices, payment and delivery proofs by order")
                : (lang === "es" ? "Factura del proveedor por entrada de stock" : "Supplier invoice per stock delivery")}
            </p>
          </div>
          {/* Pedidos / Entradas toggle */}
          <div className="inline-flex rounded-lg border bg-muted p-0.5">
            <button
              onClick={() => setView("pedidos")}
              className={cn(
                "px-3 py-1.5 text-sm font-semibold rounded-md transition",
                view === "pedidos" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {lang === "es" ? "Pedidos" : "Orders"}
            </button>
            <button
              onClick={() => setView("entradas")}
              className={cn(
                "px-3 py-1.5 text-sm font-semibold rounded-md transition",
                view === "entradas" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {lang === "es" ? "Entradas" : "Entries"}
            </button>
          </div>
        </div>
        {view === "pedidos" && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setDocPrefsOpen(true)}>
            <Settings2 className="h-4 w-4" />
            {lang === "es" ? "Documentos por cliente" : "Docs per client"}
          </Button>
        )}
      </div>

      {view === "entradas" && <EntradasView />}
      {view === "pedidos" && (<>

      {/* Stats cards - matching Orders.tsx pattern */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* Total */}
        <button
          onClick={() => setStatusFilter("all")}
          className={cn(
            "border border-border rounded-lg bg-card/50 flex flex-col text-center overflow-hidden transition-colors",
            statusFilter === "all" && "ring-2 ring-primary/50"
          )}
        >
          <div className="px-5 pt-4 pb-2 flex items-center justify-center gap-2">
            <div className="p-1.5 rounded-md bg-blue-500/10">
              <Files className="h-4 w-4 text-blue-400" />
            </div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {lang === "es" ? "Pedidos" : "Orders"}
            </p>
          </div>
          <div className="pb-4 pt-1 flex flex-col items-center justify-center">
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
          </div>
        </button>

        {/* Complete */}
        <button
          onClick={() => setStatusFilter(statusFilter === "complete" ? "all" : "complete")}
          className={cn(
            "border border-border rounded-lg bg-card/50 flex flex-col text-center overflow-hidden transition-colors",
            statusFilter === "complete" && "ring-2 ring-emerald-500/50"
          )}
        >
          <div className="px-5 pt-4 pb-2 flex items-center justify-center gap-2">
            <div className="p-1.5 rounded-md bg-emerald-500/10">
              <FileCheck className="h-4 w-4 text-emerald-400" />
            </div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {lang === "es" ? "Completos" : "Complete"}
            </p>
          </div>
          <div className="pb-4 pt-1 flex flex-col items-center justify-center">
            <p className="text-2xl font-bold text-emerald-500">{stats.complete}</p>
          </div>
        </button>

        {/* Partial */}
        <button
          onClick={() => setStatusFilter(statusFilter === "partial" ? "all" : "partial")}
          className={cn(
            "border border-border rounded-lg bg-card/50 flex flex-col text-center overflow-hidden transition-colors",
            statusFilter === "partial" && "ring-2 ring-amber-500/50"
          )}
        >
          <div className="px-5 pt-4 pb-2 flex items-center justify-center gap-2">
            <div className="p-1.5 rounded-md bg-amber-500/10">
              <FileClock className="h-4 w-4 text-amber-400" />
            </div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {lang === "es" ? "Parciales" : "Partial"}
            </p>
          </div>
          <div className="pb-4 pt-1 flex flex-col items-center justify-center">
            <p className="text-2xl font-bold text-amber-500">{stats.partial}</p>
          </div>
        </button>

        {/* Empty */}
        <button
          onClick={() => setStatusFilter(statusFilter === "empty" ? "all" : "empty")}
          className={cn(
            "border border-border rounded-lg bg-card/50 flex flex-col text-center overflow-hidden transition-colors",
            statusFilter === "empty" && "ring-2 ring-red-500/50"
          )}
        >
          <div className="px-5 pt-4 pb-2 flex items-center justify-center gap-2">
            <div className="p-1.5 rounded-md bg-red-500/10">
              <FileX className="h-4 w-4 text-red-400" />
            </div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {lang === "es" ? "Sin docs" : "No docs"}
            </p>
          </div>
          <div className="pb-4 pt-1 flex flex-col items-center justify-center">
            <p className="text-2xl font-bold text-red-500">{stats.empty}</p>
          </div>
        </button>

        {/* Total files */}
        <div className="border border-border rounded-lg bg-card/50 flex flex-col text-center overflow-hidden">
          <div className="px-5 pt-4 pb-2 flex items-center justify-center gap-2">
            <div className="p-1.5 rounded-md bg-violet-500/10">
              <FileText className="h-4 w-4 text-violet-400" />
            </div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {lang === "es" ? "Archivos" : "Files"}
            </p>
          </div>
          <div className="pb-4 pt-1 flex flex-col items-center justify-center">
            <p className="text-2xl font-bold text-foreground">{stats.totalDocs}</p>
          </div>
        </div>
      </div>

      {/* Filters row: chronological bar + search */}
      <div className="flex flex-wrap items-center gap-3">
        <ChronoBar
          dateFrom={dateFrom}
          dateTo={dateTo}
          onChange={(from, to) => { setDateFrom(from); setDateTo(to); }}
        />

        {/* Search */}
        <div className="relative flex-1 max-w-sm ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={lang === "es" ? "Buscar por pedido o cliente..." : "Search by order or client..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
          {search && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
              onClick={() => setSearch("")}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Mobile card list */}
      {isLoading ? (
        <div className="md:hidden space-y-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
        </div>
      ) : (
        <div className="md:hidden space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>{lang === "es" ? "No hay pedidos que coincidan" : "No matching orders"}</p>
            </div>
          ) : (
            filtered.map((order) => {
              const isExpanded = expandedIds.has(order.id);
              const requiredList = getRequiredFor(order.required_documents, order.payment_method);
              const docStatus = getDocStatus(order.documents, requiredList, order.status);
              const isCancelled = order.status === "Cancelado";
              const isRequired = (cat: DocCategory) => requiredList.includes(cat);

              return (
                <div key={order.id} className={cn("border rounded-lg bg-card/50 overflow-hidden", isCancelled && "opacity-50")}>
                  {/* Card header - tappable */}
                  <button
                    className="w-full text-left p-3 flex flex-col gap-2"
                    onClick={() => toggleExpand(order.id)}
                  >
                    {/* Top row: order code + status badge */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isExpanded
                          ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        }
                        <span className={cn("font-mono font-semibold text-sm", isCancelled && "line-through")}>
                          {order.order_code}
                        </span>
                      </div>
                      <DocStatusBadge status={docStatus} />
                    </div>

                    {/* Client name */}
                    <p className="text-sm text-foreground truncate pl-6">{order.client_name}</p>

                    {/* Info row: date, total, payment method */}
                    <div className="flex items-center gap-3 pl-6 flex-wrap">
                      <span className="text-xs text-muted-foreground">{fmtDate(order.order_date)}</span>
                      <span className="text-xs font-medium">
                        ${order.total.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </span>
                      <PaymentMethodBadge method={order.payment_method} />
                    </div>

                    {/* Document category summary row */}
                    <div className="flex items-center gap-3 pl-6 pt-1 border-t border-border/50">
                      <div className={cn("flex items-center gap-1 text-xs text-muted-foreground", !isRequired("factura") && "opacity-40")}>
                        <span>{lang === "es" ? "Fact" : "Inv"}</span>
                        {isRequired("factura") || countByCategory(order.documents, "factura") > 0 ? (
                          <CategoryCell count={countByCategory(order.documents, "factura")} />
                        ) : (
                          <OptionalCell lang={lang} />
                        )}
                      </div>
                      <div className={cn("flex items-center gap-1 text-xs text-muted-foreground", !isRequired("comprobante_pago") && "opacity-40")}>
                        <span>{lang === "es" ? "Pago" : "Pay"}</span>
                        {isRequired("comprobante_pago") || countByCategory(order.documents, "comprobante_pago") > 0 ? (
                          <CategoryCell count={countByCategory(order.documents, "comprobante_pago")} />
                        ) : (
                          <OptionalCell lang={lang} />
                        )}
                      </div>
                      <div className={cn("flex items-center gap-1 text-xs text-muted-foreground", !isRequired("comprobante_entrega") && "opacity-40")}>
                        <span>{lang === "es" ? "Entr" : "Del"}</span>
                        {isRequired("comprobante_entrega") || countByCategory(order.documents, "comprobante_entrega") > 0 ? (
                          <CategoryCell count={countByCategory(order.documents, "comprobante_entrega")} />
                        ) : (
                          <OptionalCell lang={lang} />
                        )}
                      </div>
                      {countByCategory(order.documents, "nota_credito") > 0 && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <span>NC</span>
                          <CategoryCell count={countByCategory(order.documents, "nota_credito")} />
                        </div>
                      )}
                      {countByCategory(order.documents, "otro") > 0 && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <span>{lang === "es" ? "Otro" : "Other"}</span>
                          <CategoryCell count={countByCategory(order.documents, "otro")} />
                        </div>
                      )}
                    </div>
                  </button>

                  {/* Expanded content */}
                  <div
                    className="overflow-hidden transition-all duration-300 ease-in-out"
                    style={{
                      maxHeight: isExpanded ? "800px" : "0px",
                      opacity: isExpanded ? 1 : 0,
                    }}
                  >
                    <div className="p-3 pt-0 border-t">
                      <OrderExpandedRow order={order} lang={lang} onRefresh={refreshDocs} />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Desktop table */}
      {isLoading ? (
        <div className="hidden md:block space-y-2">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : (
        <div className="hidden md:block rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>{lang === "es" ? "Pedido" : "Order"}</TableHead>
                <TableHead>{lang === "es" ? "Cliente" : "Client"}</TableHead>
                <TableHead className="text-right">{lang === "es" ? "Total" : "Total"}</TableHead>
                <TableHead>{lang === "es" ? "Fecha" : "Date"}</TableHead>
                <TableHead className="text-center">{lang === "es" ? "Método" : "Method"}</TableHead>
                <TableHead className="text-center">{lang === "es" ? "Factura" : "Invoice"}</TableHead>
                <TableHead className="text-center">{lang === "es" ? "Pago" : "Payment"}</TableHead>
                <TableHead className="text-center">{lang === "es" ? "Entrega" : "Delivery"}</TableHead>
                <TableHead className="text-center hidden lg:table-cell">{lang === "es" ? "N. Crédito" : "Credit N."}</TableHead>
                <TableHead className="text-center hidden lg:table-cell">{lang === "es" ? "Otro" : "Other"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">
                    <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p>{lang === "es" ? "No hay pedidos que coincidan" : "No matching orders"}</p>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((order) => {
                  const isExpanded = expandedIds.has(order.id);
                  const requiredList = getRequiredFor(order.required_documents, order.payment_method);
                  const docStatus = getDocStatus(order.documents, requiredList, order.status);
                  const isCancelled = order.status === "Cancelado";
                  const isRequired = (cat: DocCategory) => requiredList.includes(cat);

                  return (
                    <React.Fragment key={order.id}>
                      <TableRow
                        className={cn(
                          "cursor-pointer",
                          isExpanded && "bg-muted/30",
                          isCancelled && "opacity-50"
                        )}
                        onClick={() => toggleExpand(order.id)}
                      >
                        <TableCell className="w-10">
                          {isExpanded
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          }
                        </TableCell>
                        <TableCell>
                          <span className={cn("font-mono font-medium text-sm", isCancelled && "line-through")}>{order.order_code}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{order.client_name}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-sm font-medium">
                            ${order.total.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {fmtDate(order.order_date)}
                        </TableCell>
                        <TableCell className="text-center">
                          <PaymentMethodBadge method={order.payment_method} />
                        </TableCell>
                        <TableCell className={cn("text-center", !isRequired("factura") && "opacity-40")}>
                          {isRequired("factura") || countByCategory(order.documents, "factura") > 0 ? (
                            <CategoryCell count={countByCategory(order.documents, "factura")} />
                          ) : (
                            <OptionalCell lang={lang} />
                          )}
                        </TableCell>
                        <TableCell className={cn("text-center", !isRequired("comprobante_pago") && "opacity-40")}>
                          {isRequired("comprobante_pago") || countByCategory(order.documents, "comprobante_pago") > 0 ? (
                            <CategoryCell count={countByCategory(order.documents, "comprobante_pago")} />
                          ) : (
                            <OptionalCell lang={lang} />
                          )}
                        </TableCell>
                        <TableCell className={cn("text-center", !isRequired("comprobante_entrega") && "opacity-40")}>
                          {isRequired("comprobante_entrega") || countByCategory(order.documents, "comprobante_entrega") > 0 ? (
                            <CategoryCell count={countByCategory(order.documents, "comprobante_entrega")} />
                          ) : (
                            <OptionalCell lang={lang} />
                          )}
                        </TableCell>
                        <TableCell className="text-center hidden lg:table-cell">
                          <CategoryCell count={countByCategory(order.documents, "nota_credito")} />
                        </TableCell>
                        <TableCell className="text-center hidden lg:table-cell">
                          <CategoryCell count={countByCategory(order.documents, "otro")} />
                        </TableCell>
                      </TableRow>

                      {/* Expanded content */}
                      <TableRow key={`${order.id}-expanded`} className="bg-muted/20">
                        <TableCell colSpan={11} className="!p-0">
                          <div
                            className="overflow-hidden transition-all duration-300 ease-in-out"
                            style={{
                              maxHeight: isExpanded ? "800px" : "0px",
                              opacity: isExpanded ? 1 : 0,
                            }}
                          >
                            <div className="p-4">
                              <OrderExpandedRow order={order} lang={lang} onRefresh={refreshDocs} />
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Footer info */}
      {!isLoading && filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          {lang === "es"
            ? `Mostrando ${filtered.length} de ${orders.length} pedidos`
            : `Showing ${filtered.length} of ${orders.length} orders`}
        </p>
      )}

      </>)}

      {/* Master per-client document requirements dialog */}
      <MasterClientDocPrefsDialog
        open={docPrefsOpen}
        onClose={() => setDocPrefsOpen(false)}
        onSaved={refreshDocs}
        lang={lang}
      />
    </div>
  );
}

/* ── Entradas (stock-delivery) view ─────────────────────────────────────
 *  Same shape as the Pedidos view but parameterized for the parallel
 *  stock_delivery_documents table + stock-delivery-documents bucket.
 *  Status logic is much simpler: the supplier's invoice is the only
 *  required doc, so a delivery is either "complete" (factura uploaded)
 *  or "empty".
 */
function EntradasView() {
  const { lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "complete" | "empty">("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState(getFirstOfMonth());
  const [dateTo, setDateTo] = useState("");

  const { data: deliveries = [], isLoading } = useQuery({
    queryKey: ["delivery-documents-list"],
    queryFn: async () => {
      const { data: delsData, error: delsErr } = await supabase
        .from("stock_deliveries")
        .select("id, delivery_code, delivery_date, supplier, reference, delivery_status, stock_entries(quantity, product_id)")
        // Order by code (E-0019 → E-0018 → ...). Codes are zero-padded
        // 4 digits so a lex sort matches the numeric sort.
        .order("delivery_code", { ascending: false });
      if (delsErr) throw delsErr;

      const { data: docsData, error: docsErr } = await supabase
        .from("stock_delivery_documents")
        .select("*")
        .order("uploaded_at", { ascending: false });
      if (docsErr) throw docsErr;

      const docsMap = new Map<string, DeliveryDocument[]>();
      (docsData || []).forEach((doc: any) => {
        if (!docsMap.has(doc.delivery_id)) docsMap.set(doc.delivery_id, []);
        docsMap.get(doc.delivery_id)!.push(doc);
      });

      return (delsData || []).map((d: any): DeliveryWithDocs => {
        const entries = (d.stock_entries || []) as Array<{ quantity: number; product_id: string }>;
        const total_bultos = entries.reduce((s, e) => s + (e.quantity || 0), 0);
        const product_count = new Set(entries.map(e => e.product_id)).size;
        return {
          id: d.id,
          delivery_code: d.delivery_code || "—",
          delivery_date: d.delivery_date,
          supplier: d.supplier ?? null,
          reference: d.reference ?? null,
          delivery_status: d.delivery_status || "completed",
          total_bultos,
          product_count,
          documents: docsMap.get(d.id) || [],
        };
      });
    },
  });

  const refreshDocs = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["delivery-documents-list"] });
  }, [queryClient]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    let result = deliveries;
    if (dateFrom) result = result.filter(d => d.delivery_date && d.delivery_date >= dateFrom);
    if (dateTo) result = result.filter(d => d.delivery_date && d.delivery_date <= dateTo);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(d =>
        d.delivery_code.toLowerCase().includes(q) ||
        (d.supplier ?? "").toLowerCase().includes(q) ||
        (d.reference ?? "").toLowerCase().includes(q),
      );
    }
    if (statusFilter !== "all") {
      result = result.filter(d => getDeliveryDocStatus(d.documents) === statusFilter);
    }
    return result;
  }, [deliveries, search, statusFilter, dateFrom, dateTo]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const complete = filtered.filter(d => getDeliveryDocStatus(d.documents) === "complete").length;
    const empty = total - complete;
    const totalDocs = filtered.reduce((s, d) => s + d.documents.length, 0);
    return { total, complete, empty, totalDocs };
  }, [filtered]);

  const setThisMonth = () => { setDateFrom(getFirstOfMonth()); setDateTo(""); };
  const setAllTime = () => { setDateFrom(""); setDateTo(""); };

  return (
    <div className="space-y-6">
      {/* Stats — simpler than orders: complete vs missing */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button
          onClick={() => setStatusFilter("all")}
          className={cn(
            "border border-border rounded-lg bg-card/50 flex flex-col text-center overflow-hidden transition-colors",
            statusFilter === "all" && "ring-2 ring-primary/50",
          )}
        >
          <div className="px-5 pt-4 pb-2 flex items-center justify-center gap-2">
            <div className="p-1.5 rounded-md bg-blue-500/10"><Files className="h-4 w-4 text-blue-400" /></div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {lang === "es" ? "Entradas" : "Entries"}
            </p>
          </div>
          <div className="pb-4 pt-1"><p className="text-2xl font-bold text-foreground">{stats.total}</p></div>
        </button>
        <button
          onClick={() => setStatusFilter(statusFilter === "complete" ? "all" : "complete")}
          className={cn(
            "border border-border rounded-lg bg-card/50 flex flex-col text-center overflow-hidden transition-colors",
            statusFilter === "complete" && "ring-2 ring-emerald-500/50",
          )}
        >
          <div className="px-5 pt-4 pb-2 flex items-center justify-center gap-2">
            <div className="p-1.5 rounded-md bg-emerald-500/10"><CheckCircle2 className="h-4 w-4 text-emerald-400" /></div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {lang === "es" ? "Con factura" : "With invoice"}
            </p>
          </div>
          <div className="pb-4 pt-1"><p className="text-2xl font-bold text-emerald-500">{stats.complete}</p></div>
        </button>
        <button
          onClick={() => setStatusFilter(statusFilter === "empty" ? "all" : "empty")}
          className={cn(
            "border border-border rounded-lg bg-card/50 flex flex-col text-center overflow-hidden transition-colors",
            statusFilter === "empty" && "ring-2 ring-red-500/50",
          )}
        >
          <div className="px-5 pt-4 pb-2 flex items-center justify-center gap-2">
            <div className="p-1.5 rounded-md bg-red-500/10"><AlertCircle className="h-4 w-4 text-red-400" /></div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {lang === "es" ? "Sin factura" : "No invoice"}
            </p>
          </div>
          <div className="pb-4 pt-1"><p className="text-2xl font-bold text-red-500">{stats.empty}</p></div>
        </button>
        <div className="border border-border rounded-lg bg-card/50 flex flex-col text-center overflow-hidden">
          <div className="px-5 pt-4 pb-2 flex items-center justify-center gap-2">
            <div className="p-1.5 rounded-md bg-purple-500/10"><FileText className="h-4 w-4 text-purple-400" /></div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {lang === "es" ? "Documentos" : "Documents"}
            </p>
          </div>
          <div className="pb-4 pt-1"><p className="text-2xl font-bold text-foreground">{stats.totalDocs}</p></div>
        </div>
      </div>

      {/* Filters row: same ChronoBar pattern as Pedidos so the toggle
          feels seamless. Search stays on the right. */}
      <div className="flex flex-wrap items-center gap-3">
        <ChronoBar
          dateFrom={dateFrom}
          dateTo={dateTo}
          onChange={(from, to) => { setDateFrom(from); setDateTo(to); }}
        />

        {/* Search */}
        <div className="relative flex-1 max-w-sm ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={lang === "es" ? "Buscar por entrada o proveedor..." : "Search by entry or supplier..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
          {search && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
              onClick={() => setSearch("")}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg py-12 text-center text-sm text-muted-foreground">
          {lang === "es" ? "Sin entradas en el rango seleccionado" : "No entries in this range"}
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden bg-card/30">
          <div className="grid grid-cols-[40px_120px_120px_1fr_100px_100px_120px] gap-2 px-4 py-2.5 border-b border-border bg-muted/30 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <div></div>
            <div>{lang === "es" ? "Código" : "Code"}</div>
            <div>{lang === "es" ? "Fecha" : "Date"}</div>
            <div>{lang === "es" ? "Proveedor" : "Supplier"}</div>
            <div className="text-right">SKUs</div>
            <div className="text-right">Bultos</div>
            <div className="text-center">{lang === "es" ? "Factura" : "Invoice"}</div>
          </div>
          {filtered.map((d) => {
            const isExpanded = expandedIds.has(d.id);
            const status = getDeliveryDocStatus(d.documents);
            return (
              <div key={d.id} className="border-b border-border last:border-0">
                <button
                  type="button"
                  onClick={() => toggleExpand(d.id)}
                  className="w-full grid grid-cols-[40px_120px_120px_1fr_100px_100px_120px] gap-2 px-4 py-3 items-center hover:bg-muted/30 transition-colors text-left"
                >
                  <div className="text-muted-foreground">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </div>
                  <div className="font-mono font-semibold text-blue-400">{d.delivery_code}</div>
                  <div className="text-sm text-muted-foreground">{fmtDate(d.delivery_date)}</div>
                  <div className="text-sm truncate">
                    {d.supplier || <span className="italic text-muted-foreground">—</span>}
                    {d.reference && (
                      <span className="text-xs text-muted-foreground ml-2">· {d.reference}</span>
                    )}
                  </div>
                  <div className="text-right text-sm tabular-nums">{d.product_count}</div>
                  <div className="text-right text-sm font-semibold tabular-nums">{d.total_bultos.toLocaleString()}</div>
                  <div className="flex justify-center">
                    {status === "complete" ? (
                      <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        {lang === "es" ? "Subida" : "Uploaded"}
                      </Badge>
                    ) : (
                      <Badge className="bg-red-500/15 text-red-500 border-red-500/30 gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {lang === "es" ? "Falta" : "Missing"}
                      </Badge>
                    )}
                  </div>
                </button>
                {isExpanded && (
                  <div className="px-6 py-4 bg-muted/10 border-t border-border">
                    <DeliveryExpandedRow delivery={d} lang={lang} onRefresh={refreshDocs} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          {lang === "es"
            ? `Mostrando ${filtered.length} de ${deliveries.length} entradas`
            : `Showing ${filtered.length} of ${deliveries.length} entries`}
        </p>
      )}
    </div>
  );

  // toast is referenced inside child components below — keep the linter happy
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  toast;
}

/* ── Per-delivery expanded row (parallel to OrderExpandedRow) ─── */
function DeliveryExpandedRow({
  delivery,
  lang,
  onRefresh,
}: {
  delivery: DeliveryWithDocs;
  lang: "es" | "en";
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [previewDoc, setPreviewDoc] = useState<DeliveryDocument | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<DeliveryDocument | null>(null);

  const handleDelete = async () => {
    if (!deleteDoc) return;
    try {
      await supabase.storage.from("stock-delivery-documents").remove([deleteDoc.file_path]);
      const { error } = await supabase.from("stock_delivery_documents").delete().eq("id", deleteDoc.id);
      if (error) throw error;
      toast({ title: lang === "es" ? "Eliminado" : "Deleted" });
      onRefresh();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeleteDoc(null);
    }
  };

  return (
    <>
      <div className="text-xs text-muted-foreground mb-3 pb-3 border-b">
        {lang === "es" ? "Documento requerido: " : "Required: "}
        <span className="text-foreground font-medium">
          {DELIVERY_REQUIRED.map(c => DELIVERY_CATEGORIES.find(x => x.key === c)?.label ?? c).join(" + ")}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {DELIVERY_CATEGORIES.map((cat) => {
          const docs = delivery.documents.filter(d => d.category === cat.key);
          return (
            <div key={cat.key} className="border rounded-lg p-3 bg-card/50">
              <div className="flex items-center gap-2 mb-2 pb-2 border-b">
                {cat.icon}
                <h4 className="text-sm font-medium">{lang === "es" ? cat.label : cat.labelEn}</h4>
                {docs.length > 0 && (
                  <Badge variant="secondary" className="ml-auto text-xs">{docs.length}</Badge>
                )}
              </div>
              <div className="space-y-1.5 mb-2">
                {docs.map((doc) => {
                  const url = docUrl("stock-delivery-documents", doc.file_path);
                  const isImage = doc.file_type.startsWith("image/");
                  return (
                    <div key={doc.id} className="group flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 transition-colors">
                      {isImage ? (
                        <img
                          src={url}
                          alt={doc.file_name}
                          className="h-8 w-8 rounded object-cover flex-shrink-0 cursor-pointer"
                          onClick={() => setPreviewDoc(doc)}
                        />
                      ) : (
                        <div
                          className="h-8 w-8 rounded bg-red-500/10 flex items-center justify-center flex-shrink-0 cursor-pointer"
                          onClick={() => setPreviewDoc(doc)}
                        >
                          <FileText className="h-4 w-4 text-red-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{doc.file_name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatFileSize(doc.file_size)} &middot; {fmtDate(doc.uploaded_at)}
                        </p>
                      </div>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setPreviewDoc(doc)}>
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setDeleteDoc(doc)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <DeliveryUploadZone
                deliveryId={delivery.id}
                category={cat.key}
                lang={lang}
                onUploaded={onRefresh}
              />
            </div>
          );
        })}
      </div>

      {/* Preview */}
      <Dialog open={!!previewDoc} onOpenChange={(o) => !o && setPreviewDoc(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          {previewDoc && (() => {
            const url = docUrl("stock-delivery-documents", previewDoc.file_path);
            const isImage = previewDoc.file_type.startsWith("image/");
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {getFileIcon(previewDoc.file_type)}
                    {previewDoc.file_name}
                  </DialogTitle>
                  <DialogDescription>
                    {formatFileSize(previewDoc.file_size)} &middot; {fmtDateTime(previewDoc.uploaded_at)}
                  </DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-auto mt-2" style={{ maxHeight: "70vh" }}>
                  {isImage ? (
                    <img src={url} alt={previewDoc.file_name} className="max-w-full h-auto rounded-md" />
                  ) : (
                    <iframe src={url} className="w-full h-[65vh] rounded-md border" title={previewDoc.file_name} />
                  )}
                </div>
                <div className="flex justify-end gap-2 mt-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href={url} target="_blank" rel="noreferrer" download>
                      <Download className="h-4 w-4 mr-1" />
                      Descargar
                    </a>
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteDoc} onOpenChange={() => setDeleteDoc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{lang === "es" ? "Eliminar archivo?" : "Delete file?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDoc?.file_name}
              <br />
              {lang === "es" ? "Esta accion no se puede deshacer." : "This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{lang === "es" ? "Cancelar" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {lang === "es" ? "Eliminar" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ── DeliveryUploadZone — drag-and-drop into stock-delivery-documents bucket */
function DeliveryUploadZone({
  deliveryId,
  category,
  lang,
  onUploaded,
}: {
  deliveryId: string;
  category: DeliveryDocCategory;
  lang: "es" | "en";
  onUploaded: () => void;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const allowed = ["application/pdf", "image/jpeg", "image/png"];
    const validFiles = Array.from(files).filter(f => allowed.includes(f.type));
    if (validFiles.length === 0) {
      toast({ title: lang === "es" ? "Formato no permitido" : "Format not allowed", description: "PDF, JPG, PNG", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      for (const file of validFiles) {
        const timestamp = Date.now();
        const path = `${deliveryId}/${category}/${timestamp}_${file.name}`;
        const { error: upErr } = await supabase.storage
          .from("stock-delivery-documents")
          .upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;
        const { error: dbErr } = await supabase.from("stock_delivery_documents").insert({
          delivery_id: deliveryId,
          category,
          file_name: file.name,
          file_path: path,
          file_type: file.type,
          file_size: file.size,
        });
        if (dbErr) throw dbErr;
      }
      toast({
        title: lang === "es" ? "Archivo subido" : "File uploaded",
        description: `${validFiles.length} ${lang === "es" ? "archivo(s)" : "file(s)"}`,
      });
      onUploaded();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [deliveryId, category, lang, toast, onUploaded]);

  return (
    <div
      className={cn(
        "border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors",
        isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/20 hover:border-muted-foreground/40",
        uploading && "opacity-50 pointer-events-none",
      )}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Upload className={cn("h-5 w-5 mx-auto mb-1", uploading ? "animate-pulse" : "text-muted-foreground/50")} />
      <p className="text-xs text-muted-foreground">
        {uploading
          ? (lang === "es" ? "Subiendo..." : "Uploading...")
          : (lang === "es" ? "Arrastra o haz clic" : "Drag or click")}
      </p>
      <p className="text-[10px] text-muted-foreground/60">PDF, JPG, PNG</p>
    </div>
  );
}
