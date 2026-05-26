/**
 * DeliverySignature — public delivery signature page at /entrega/:token.
 *
 * Two views in one page, controlled by `audience`:
 *  - Driver view (default): bultos + line items, no prices. Big "Iniciar
 *    firma con cliente" button hands the phone over.
 *  - Client view: full receipt with prices + total, signature canvas
 *    below. Sign + confirm to lock the page into receipt mode.
 *
 * No auth — anyone with the token can open the URL. Token is unique
 * per order. Once signed, the page flips to a permanent receipt view
 * and the order's signature can't be overwritten.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, AlertTriangle, CheckCircle2, ArrowLeft, X, Eraser, Loader2, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { RevealSelfieDialog } from "@/components/delivery/RevealSelfieDialog";
import { registerBackgroundFlush } from "@/lib/revealPhotoQueue";

type Item = {
  id: string;
  clave: string;
  name: string;
  image_url: string | null;
  quantity: number;
  unit_price: number;
  is_damaged: boolean;
  damaged_condition: string | null;
};

type StopAllocation = { order_item_id: string; quantity: number };

type Stop = {
  id: string;
  stop_index: number;
  address: string;
  client_label: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  notes: string | null;
  manual_maps_url: string | null;
  signed_at: string | null;
  signed_by_name: string | null;
  signature_path: string | null;
  allocations: StopAllocation[];
};

type Order = {
  id: string;
  order_code: string;
  order_date: string | null;
  delivery_date: string | null;
  status: string;
  notes: string | null;
  signed_at: string | null;
  signed_by_name: string | null;
  signature_path: string | null;
  /** Manual discount applied by the seller. 0 or null = no discount. */
  discount_amount?: number | null;
  /** Free-text reason for the discount, shown next to the discount line. */
  discount_reason?: string | null;
  client: {
    name: string | null;
    company: string | null;
    phone: string | null;
    address: string | null;
  };
  items: Item[];
  /** Multi-stop deliveries — at least 1 stop after the Phase 2 backfill. */
  stops?: Stop[];
};

const SIG_BUCKET = "order-documents";
const STORAGE_ROOT = "https://rfyshhzkhewzjudohzii.supabase.co/storage/v1/object/public/";

const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 }).format(n);

function fmtRowDate(d: string | null) {
  if (!d) return "—";
  try { return format(new Date(d + "T12:00:00"), "dd/MM/yyyy", { locale: es }); } catch { return d; }
}

export default function DeliverySignature() {
  const { token } = useParams<{ token: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 'driver' = pre-handover view (no prices). 'client' = handed-over view
  // (prices + signature pad). Once signed, view flips automatically to
  // 'receipt' which is the locked, signed state.
  const [audience, setAudience] = useState<"driver" | "client">("driver");

  // Selfie-on-reveal: the reveal dialog opens BETWEEN driver and client
  // views. Driver must type their name + (ideally) take a selfie before
  // prices/totals are shown. This deters peeking — drivers know they're
  // on record. See RevealSelfieDialog for the full flow.
  const [revealDialogOpen, setRevealDialogOpen] = useState(false);

  // Kick off the background uploader on first mount — any reveal photos
  // queued from previous offline taps get retried as soon as the device
  // is online again.
  useEffect(() => {
    registerBackgroundFlush();
  }, []);

  const [signatureName, setSignatureName] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetch order
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await (supabase as any).rpc("get_order_for_signature", { p_token: token });
        if (cancelled) return;
        if (error) throw error;
        if (!data) { setError("not_found"); return; }
        setOrder(data as Order);
      } catch (err: any) {
        if (!cancelled) setError(err.message ?? "fetch_failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // Stops sequencing — the active stop is the FIRST unsigned stop. UI
  // renders only that stop's items + address; once signed, refetch
  // advances to the next. When all stops signed → SignedReceipt.
  const stops = order?.stops ?? [];
  const isMultiStop = stops.length > 1;
  const activeStop = useMemo(() => {
    if (!stops.length) return null;
    return stops.find((s) => !s.signed_at) ?? null;
  }, [stops]);
  const allStopsSigned = stops.length > 0 && stops.every((s) => !!s.signed_at);

  // Filter the order's items to just what the active stop is delivering
  // (and use the stop's allocation as the bulto count, not the line's
  // total). When single-stop, this naturally returns all items at full qty.
  //
  // FALLBACK: if the active stop has NO allocations at all (legacy
  // single-stop orders, or new orders that skipped per-stop allocation
  // because the whole order is one delivery), return the full
  // order.items. Without this, the comment above was technically wrong —
  // the empty allocation map filtered EVERYTHING out, producing the
  // "0 bultos / $0.00" bug on ~half of the orders in production.
  const itemsForActiveStop = useMemo<Item[]>(() => {
    if (!order || !activeStop) return order?.items ?? [];
    const allocations = activeStop.allocations ?? [];
    if (allocations.length === 0) return order.items;
    const allocByItem = new Map<string, number>();
    for (const a of allocations) allocByItem.set(a.order_item_id, a.quantity);
    return order.items
      .filter((it) => allocByItem.has(it.id))
      .map((it) => ({ ...it, quantity: allocByItem.get(it.id) ?? it.quantity }));
  }, [order, activeStop]);

  const totalBultos = useMemo(() => itemsForActiveStop.reduce((s, it) => s + it.quantity, 0), [itemsForActiveStop]);
  const subtotal = useMemo(() =>
    itemsForActiveStop.reduce((s, it) => s + it.quantity * it.unit_price, 0),
    [itemsForActiveStop],
  );
  const discount = useMemo(() => {
    // Discount is order-level — only apply to whole-order signature.
    // For per-stop view, show the proportional share so the total adds up.
    const raw = Number(order?.discount_amount) || 0;
    if (!order || !isMultiStop) return Math.max(0, Math.min(raw, subtotal));
    const orderSubtotal = order.items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
    if (orderSubtotal === 0) return 0;
    const stopShare = (subtotal / orderSubtotal) * raw;
    return Math.max(0, Math.min(stopShare, subtotal));
  }, [order, subtotal, isMultiStop]);
  const discountReason = ((order?.discount_reason ?? "") as string).trim();
  const total = Math.max(0, subtotal - discount);

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto" />
          <h1 className="text-xl font-bold">Link inválido</h1>
          <p className="text-muted-foreground text-sm">
            Este link de firma no existe o ya expiró. Pídele al equipo que te genere uno nuevo.
          </p>
        </div>
      </div>
    );
  }

  // Already signed — receipt view
  if (order.signed_at && order.signature_path) {
    return <SignedReceipt order={order} subtotal={subtotal} discount={discount} discountReason={discountReason} total={total} totalBultos={totalBultos} />;
  }

  // Driver pre-handover view (no prices). Tapping the handover button
  // opens the RevealSelfieDialog FIRST — once the driver types their
  // name + (ideally) snaps a selfie, the dialog confirms and we flip
  // audience to 'client', exposing prices. The photo upload happens in
  // the background and never blocks the reveal.
  if (audience === "driver") {
    return (
      <>
        <DriverPreview
          order={order}
          totalBultos={totalBultos}
          onHandover={() => setRevealDialogOpen(true)}
        />
        <RevealSelfieDialog
          open={revealDialogOpen}
          token={token!}
          orderCode={order.order_code}
          stopIndex={activeStop?.stop_index ?? null}
          onConfirm={() => {
            setRevealDialogOpen(false);
            setAudience("client");
          }}
          onCancel={() => setRevealDialogOpen(false)}
        />
      </>
    );
  }

  // Client signature view
  return (
    <ClientSignature
      order={order}
      items={itemsForActiveStop}
      activeStop={activeStop}
      totalStops={stops.length}
      subtotal={subtotal}
      discount={discount}
      discountReason={discountReason}
      total={total}
      totalBultos={totalBultos}
      onBack={() => setAudience("driver")}
      signatureName={signatureName}
      setSignatureName={setSignatureName}
      photoFile={photoFile}
      setPhotoFile={setPhotoFile}
      photoPreview={photoPreview}
      setPhotoPreview={setPhotoPreview}
      submitting={submitting}
      submitError={submitError}
      onSubmit={async (signatureDataUrl) => {
        if (!token) return;
        setSubmitError(null);
        if (!signatureName.trim()) {
          setSubmitError("Escribe el nombre de quien firma.");
          return;
        }
        setSubmitting(true);
        try {
          const ts = Date.now();
          // 1. Signature
          const sigBlob = await (await fetch(signatureDataUrl)).blob();
          const sigPath = `${order.id}/signature/${ts}_signature.png`;
          const { error: sigErr } = await supabase.storage.from(SIG_BUCKET).upload(sigPath, sigBlob, {
            contentType: "image/png",
            upsert: false,
          });
          if (sigErr) throw sigErr;

          // 2. Optional photo
          if (photoFile) {
            const ext = photoFile.name.split(".").pop()?.toLowerCase() || "jpg";
            const photoPath = `${order.id}/comprobante_entrega/${ts}_entrega.${ext}`;
            const { error: photoErr } = await supabase.storage.from(SIG_BUCKET).upload(photoPath, photoFile, {
              contentType: photoFile.type,
              upsert: false,
            });
            if (photoErr) throw photoErr;
            // Register the photo as a comprobante_entrega document.
            await (supabase as any).from("order_documents").insert({
              order_id: order.id,
              category: "comprobante_entrega",
              file_name: `Foto entrega ${order.order_code}.${ext}`,
              file_path: photoPath,
              file_type: photoFile.type,
              file_size: photoFile.size,
            });
          }

          // 3. Stamp the SPECIFIC stop. The submit_stop_signature RPC
          //    auto-flips orders.signed_at + Entregado when the LAST
          //    stop is signed (single-stop orders behave identically
          //    to today since there's only 1 stop to sign).
          const stopIndex = activeStop?.stop_index ?? 1;
          const { error: rpcErr } = await (supabase as any).rpc("submit_stop_signature", {
            p_token: token,
            p_stop_index: stopIndex,
            p_signed_by_name: signatureName.trim(),
            p_signature_path: sigPath,
          });
          if (rpcErr) throw rpcErr;

          // 4. Refetch order. If more stops remain, the page will
          //    auto-advance to the next unsigned stop. If this was the
          //    last stop, the page flips to receipt mode (because
          //    orders.signed_at gets set by the RPC's last-stop check).
          const { data: fresh } = await (supabase as any).rpc("get_order_for_signature", { p_token: token });
          if (fresh) setOrder(fresh as Order);

          const willHaveMoreStops = ((fresh as any)?.stops ?? []).some((s: any) => !s.signed_at);
          if (!willHaveMoreStops) {
            // 5. All stops signed → render the FULL signed comprobante
            //    snapshot for /documentos. Best-effort.
            try {
              const { uploadSignedComprobanteForOrder } = await import("@/components/orders/SingleOrderImageCard");
              await uploadSignedComprobanteForOrder(order.id);
            } catch (e) {
              console.error("[entrega] uploading comprobante snapshot failed", e);
            }
          } else {
            // Reset signature state so the next stop's pad starts blank
            setSignatureName("");
            setPhotoFile(null);
            setPhotoPreview(null);
          }
        } catch (err: any) {
          setSubmitError(err.message ?? "No se pudo enviar la firma.");
        } finally {
          setSubmitting(false);
        }
      }}
    />
  );
}

/* ── Driver pre-handover view ─────────────────────────────────────────── */

function DriverPreview({
  order, totalBultos, onHandover,
}: {
  order: Order;
  totalBultos: number;
  onHandover: () => void;
}) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-md mx-auto p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Entrega</p>
          <h1 className="text-lg font-bold font-mono text-blue-500">{order.order_code}</h1>
          <p className="text-sm text-muted-foreground truncate">{order.client.name}</p>
        </div>
      </header>

      <main className="flex-1 max-w-md w-full mx-auto p-4 space-y-4">
        <div className="border rounded-lg p-4 bg-card space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Total a entregar</p>
          <p className="text-4xl font-bold tabular-nums">{totalBultos}<span className="text-base text-muted-foreground ml-2">bultos</span></p>
          <p className="text-xs text-muted-foreground">{order.items.length} producto{order.items.length === 1 ? "" : "s"}</p>
        </div>

        <div className="border rounded-lg bg-card overflow-hidden">
          <div className="px-4 py-2 border-b bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            Productos
          </div>
          <ul className="divide-y">
            {order.items.map((it, i) => (
              <li key={i} className="flex items-center gap-3 p-3">
                {it.image_url ? (
                  <img src={it.image_url} alt="" className="h-10 w-10 rounded object-contain bg-white shrink-0 border" />
                ) : (
                  <div className="h-10 w-10 rounded bg-muted shrink-0 grid place-items-center">
                    <Package className="h-4 w-4 text-muted-foreground/50" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs text-primary">{it.clave}</p>
                  <p className="text-sm truncate">{it.name}</p>
                  {it.is_damaged && (
                    <p className="text-[10px] text-orange-500 font-semibold">Dañado · {it.damaged_condition}</p>
                  )}
                </div>
                <p className="font-bold tabular-nums">x{it.quantity}</p>
              </li>
            ))}
          </ul>
        </div>

        {order.client.address && (
          <div className="border rounded-lg p-3 bg-card text-xs text-muted-foreground">
            <p className="uppercase tracking-wider mb-1">Dirección</p>
            <p className="text-foreground">{order.client.address}</p>
          </div>
        )}
      </main>

      <footer className="border-t bg-card sticky bottom-0">
        <div className="max-w-md mx-auto p-4">
          <Button
            onClick={onHandover}
            className="w-full h-14 text-base font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white shadow-lg shadow-blue-500/20 transition"
          >
            Iniciar firma con cliente →
          </Button>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            Pásale el celular al cliente. La siguiente pantalla muestra precios y firma.
          </p>
        </div>
      </footer>
    </div>
  );
}

/* ── Client signature view ────────────────────────────────────────────── */

function ClientSignature({
  order, items, subtotal, discount, discountReason, total, totalBultos, onBack,
  activeStop, totalStops,
  signatureName, setSignatureName,
  photoFile, setPhotoFile, photoPreview, setPhotoPreview,
  submitting, submitError, onSubmit,
}: {
  order: Order;
  /** Items for the CURRENT stop (already qty-adjusted to allocation).
   *  Falls back to order.items for single-stop orders. */
  items: Item[];
  subtotal: number;
  discount: number;
  discountReason: string;
  total: number;
  totalBultos: number;
  onBack: () => void;
  /** When multi-stop, the stop being signed right now. Drives the
   *  "Parada N de M" header + the address shown to the client. */
  activeStop: Stop | null;
  totalStops: number;
  signatureName: string;
  setSignatureName: (s: string) => void;
  photoFile: File | null;
  setPhotoFile: (f: File | null) => void;
  photoPreview: string | null;
  setPhotoPreview: (p: string | null) => void;
  submitting: boolean;
  submitError: string | null;
  onSubmit: (signatureDataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // Initial canvas sizing only — NO window resize listener. On mobile
  // the keyboard popping up/down fires window.resize, and re-setting
  // canvas.width clears the bitmap, wiping the signature right before
  // the user taps Confirmar. Sizing once on mount is enough — the
  // canvas's parent doesn't change size during the signing flow.
  //
  // Also: paint the canvas WHITE on init so the saved PNG has a white
  // background instead of transparent. Transparent PNGs composite to
  // whatever's behind when html2canvas rasterizes the comprobante,
  // making the signature look like it's on a black background.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = "#0f172a";
    }
  }, []);

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    drawingRef.current = true;
    canvasRef.current!.setPointerCapture(e.pointerId);
    lastPointRef.current = getPoint(e);
  };
  const moveStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d");
    if (!ctx) return;
    const p = getPoint(e);
    const last = lastPointRef.current;
    if (last) {
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    lastPointRef.current = p;
    if (!hasSignature) setHasSignature(true);
  };
  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false;
    lastPointRef.current = null;
    try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Re-paint white instead of clearing to transparent — keeps the
    // saved PNG on a white background after the user retries a sig.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    ctx.strokeStyle = "#0f172a";
    setHasSignature(false);
  };

  const handleSubmit = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return;
    onSubmit(canvas.toDataURL("image/png"));
  };

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-md mx-auto p-4 flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack} className="-ml-2">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Comprobante de entrega</p>
            <p className="text-sm font-mono text-blue-500">{order.order_code}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-md w-full mx-auto p-4 space-y-4">
        {/* Multi-stop progress banner — shows position in the sequence
            so the receiver knows "this is parada 1 of 2". */}
        {totalStops > 1 && activeStop && (
          <div className="rounded-lg border-2 border-blue-500/50 bg-blue-500/5 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-full bg-blue-500 text-white text-sm font-bold tabular-nums">
                {activeStop.stop_index}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Parada {activeStop.stop_index} de {totalStops}
                </p>
                <p className="text-sm font-semibold truncate">
                  {activeStop.client_label ?? "Esta parada"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Client header */}
        <div className="border rounded-lg p-4 bg-card">
          <p className="font-semibold">{order.client.name}</p>
          {order.client.company && <p className="text-sm text-muted-foreground">{order.client.company}</p>}
          {/* Stop address takes priority over client default when multi-stop */}
          {(activeStop?.address || order.client.address) && (
            <p className="text-xs text-muted-foreground mt-1">
              📍 {activeStop?.address ?? order.client.address}
            </p>
          )}
          {activeStop?.contact_name && (
            <p className="text-xs text-muted-foreground">
              👤 Recibe: {activeStop.contact_name}
              {activeStop.contact_phone && ` · ${activeStop.contact_phone}`}
            </p>
          )}
          {activeStop?.notes && (
            <p className="text-[11px] italic text-muted-foreground mt-1">{activeStop.notes}</p>
          )}
          <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
            <div>
              <p className="uppercase tracking-wider text-muted-foreground">Pedido</p>
              <p className="font-medium">{fmtRowDate(order.order_date)}</p>
            </div>
            <div>
              <p className="uppercase tracking-wider text-muted-foreground">Entrega</p>
              <p className="font-medium">{fmtRowDate(order.delivery_date)}</p>
            </div>
          </div>
        </div>

        {/* Items with prices — only items for the active stop */}
        <div className="border rounded-lg bg-card overflow-hidden">
          <div className="px-4 py-2 border-b bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            {totalStops > 1 ? `Productos para parada ${activeStop?.stop_index}` : "Productos entregados"}
          </div>
          <ul className="divide-y">
            {items.map((it, i) => (
              <li key={i} className="flex items-center gap-3 p-3">
                {it.image_url ? (
                  <img src={it.image_url} alt="" className="h-10 w-10 rounded object-contain bg-white shrink-0 border" />
                ) : (
                  <div className="h-10 w-10 rounded bg-muted shrink-0 grid place-items-center">
                    <Package className="h-4 w-4 text-muted-foreground/50" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{it.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{it.clave}</p>
                  {it.is_damaged && (
                    <p className="text-[10px] text-orange-500 font-semibold">Dañado · {it.damaged_condition}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold tabular-nums">x{it.quantity}</p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">{fmtMXN(it.quantity * it.unit_price)}</p>
                </div>
              </li>
            ))}
          </ul>
          {discount > 0 && (
            <div className="px-4 py-3 border-t bg-muted/20 space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums text-muted-foreground">{fmtMXN(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-amber-600 dark:text-amber-500">
                  Descuento{discountReason ? ` · ${discountReason}` : ""}
                </span>
                <span className="tabular-nums font-medium text-amber-600 dark:text-amber-500">−{fmtMXN(discount)}</span>
              </div>
            </div>
          )}
          <div className="px-4 py-3 border-t bg-muted/30 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Total bultos</p>
              <p className="text-lg font-bold tabular-nums">{totalBultos}</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Total</p>
              <p className="text-2xl font-bold tabular-nums text-primary">{fmtMXN(total)}</p>
            </div>
          </div>
        </div>

        {/* Optional photo */}
        <div className="border rounded-lg p-4 bg-card space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Foto de la entrega (opcional)</p>
          {photoPreview ? (
            <div className="relative">
              <img src={photoPreview} alt="" className="w-full h-40 object-cover rounded" />
              <button
                onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <label className="flex items-center justify-center gap-2 h-20 border-2 border-dashed rounded cursor-pointer text-sm text-muted-foreground hover:bg-muted/40">
              <Camera className="h-5 w-5" />
              <span>Tomar foto</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhoto}
                className="hidden"
              />
            </label>
          )}
        </div>

        {/* Signature */}
        <div className="border rounded-lg p-4 bg-card space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Firma del cliente</p>
            <button
              onClick={clearSignature}
              disabled={!hasSignature}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <Eraser className="h-3 w-3" /> Limpiar
            </button>
          </div>
          <canvas
            ref={canvasRef}
            onPointerDown={startStroke}
            onPointerMove={moveStroke}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
            onPointerLeave={endStroke}
            className={cn(
              "w-full h-48 rounded border-2 border-dashed bg-white touch-none",
              hasSignature ? "border-primary" : "border-muted-foreground/30",
            )}
            style={{ touchAction: "none" }}
          />
          <Input
            placeholder="Nombre de quien recibe"
            value={signatureName}
            onChange={(e) => setSignatureName(e.target.value)}
            className="h-11"
          />
          {submitError && (
            <p className="text-xs text-red-500">{submitError}</p>
          )}
        </div>
      </main>

      <footer className="border-t bg-card sticky bottom-0">
        <div className="max-w-md mx-auto p-4">
          <Button
            onClick={handleSubmit}
            disabled={!hasSignature || !signatureName.trim() || submitting}
            className="w-full h-14 text-base font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white shadow-lg shadow-blue-500/20 transition disabled:bg-blue-600/40 disabled:shadow-none disabled:cursor-not-allowed"
          >
            {submitting
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Guardando…</>
              : <>Confirmar firma <CheckCircle2 className="h-5 w-5 ml-2" /></>
            }
          </Button>
        </div>
      </footer>
    </div>
  );
}

/* ── Receipt view (post-signature) ────────────────────────────────────── */

function SignedReceipt({ order, subtotal, discount, discountReason, total, totalBultos }: { order: Order; subtotal: number; discount: number; discountReason: string; total: number; totalBultos: number }) {
  const sigUrl = order.signature_path ? STORAGE_ROOT + SIG_BUCKET + "/" + order.signature_path : null;
  const signedAt = order.signed_at ? new Date(order.signed_at) : null;
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-emerald-500/10 border-emerald-500/30">
        <div className="max-w-md mx-auto p-4 flex items-center gap-3">
          <CheckCircle2 className="h-7 w-7 text-emerald-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Entrega firmada</p>
            <p className="text-xs text-muted-foreground">
              {signedAt ? format(signedAt, "dd MMM yyyy · HH:mm", { locale: es }) : ""}
              {order.signed_by_name ? ` · ${order.signed_by_name}` : ""}
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-md w-full mx-auto p-4 space-y-4">
        <div className="border rounded-lg p-4 bg-card">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Pedido</p>
          <p className="font-mono text-lg text-blue-500">{order.order_code}</p>
          <p className="text-sm font-medium mt-2">{order.client.name}</p>
          {order.client.address && <p className="text-xs text-muted-foreground">{order.client.address}</p>}
        </div>

        <div className="border rounded-lg bg-card overflow-hidden">
          <div className="px-4 py-2 border-b bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            Productos entregados
          </div>
          <ul className="divide-y">
            {order.items.map((it, i) => (
              <li key={i} className="flex items-center gap-3 p-3">
                {it.image_url ? (
                  <img src={it.image_url} alt="" className="h-10 w-10 rounded object-contain bg-white shrink-0 border" />
                ) : (
                  <div className="h-10 w-10 rounded bg-muted shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{it.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{it.clave}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold tabular-nums">x{it.quantity}</p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">{fmtMXN(it.quantity * it.unit_price)}</p>
                </div>
              </li>
            ))}
          </ul>
          {discount > 0 && (
            <div className="px-4 py-3 border-t bg-muted/20 space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums text-muted-foreground">{fmtMXN(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-amber-600 dark:text-amber-500">
                  Descuento{discountReason ? ` · ${discountReason}` : ""}
                </span>
                <span className="tabular-nums font-medium text-amber-600 dark:text-amber-500">−{fmtMXN(discount)}</span>
              </div>
            </div>
          )}
          <div className="px-4 py-3 border-t bg-muted/30 flex items-center justify-between">
            <p className="text-sm font-semibold">{totalBultos} bultos</p>
            <p className="text-2xl font-bold tabular-nums text-primary">{fmtMXN(total)}</p>
          </div>
        </div>

        {sigUrl && (
          <div className="border rounded-lg p-4 bg-card space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Firma</p>
            <div className="border rounded bg-white p-2">
              <img src={sigUrl} alt="firma" className="w-full h-32 object-contain" />
            </div>
            {order.signed_by_name && (
              <p className="text-sm font-medium">{order.signed_by_name}</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
