// @ts-nocheck
import React from "react";
import { format } from "date-fns";
import { parseLocalDate } from "@/lib/date-utils";
import { loadImageAsDataUrl } from "@/lib/load-image-as-data-url";

const mxnFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

export type PdfOrderItem = {
  clave: string;
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
  /** Pre-fetched data URL for the product thumbnail. Lives on the row
   *  so html2canvas can paint it without going to the network during
   *  the snapshot (network requests during snapshot frequently fail
   *  due to CORS or timing). */
  thumbDataUrl?: string | null;
  is_damaged?: boolean;
  damaged_condition?: "leve" | "moderado" | "severo" | null;
};

const DAMAGED_LABELS: Record<"leve" | "moderado" | "severo", string> = {
  leve: "Producto con detalle menor en empaque — precio especial",
  moderado: "Producto con empaque dañado — precio especial",
  severo: "Producto con empaque con daño visible — precio especial",
};

export type PdfOrder = {
  id: string;
  order_code: string;
  order_date: string | null;
  delivery_date: string | null;
  status: string;
  notes: string | null;
  /** Pre-discount sum of all line subtotals. Always equal to the sum of
   *  items[].subtotal — kept as a separate field so the renderer doesn't
   *  have to recalculate. */
  subtotal: number;
  /** Manual discount in MXN. 0 (or undefined) means no discount line is
   *  rendered. Capped to subtotal at the call site so total never goes
   *  negative. */
  discount?: number;
  /** Free-text reason printed next to the discount line (e.g.
   *  "compensación P-0038"). Optional even when discount > 0. */
  discountReason?: string | null;
  /** Final amount the client pays. = subtotal - discount. */
  total: number;
  items: PdfOrderItem[];
  /** Optional signature block. When present, the card renders a
   *  "FIRMADO" section at the bottom with the signature image and
   *  metadata. signatureDataUrl is a pre-fetched data URL so html2canvas
   *  can paint it deterministically (same trick as product thumbnails). */
  signature?: {
    dataUrl: string;
    signedAt: string;          // ISO timestamp
    signedByName: string | null;
  } | null;
};

type Props = {
  clientName: string;
  clientCompany: string | null;
  clientPhone: string | null;
  clientAddress: string | null;
  order: PdfOrder;
  /** When true, hides every $ value (unit price, subtotal, total,
   *  discount). Used when downloading from the maniobra plan view —
   *  drivers shouldn't see prices and the user explicitly didn't
   *  want monetary info on the driver-facing handout. The image
   *  still shows products + bulto counts + total bulto count. */
  hideMoney?: boolean;
};

export const SingleOrderImageCard = React.forwardRef<HTMLDivElement, Props>(
  ({ clientName, clientCompany, clientPhone, clientAddress, order, hideMoney }, ref) => {
    const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
    const bg = isDark ? "#020817" : "#ffffff";
    const fg = isDark ? "#f8fafc" : "#020817";
    const muted = isDark ? "#94a3b8" : "#64748b";
    const accent = "#1e293b";
    const separator = isDark ? "rgba(248,250,252,0.10)" : "rgba(2,8,23,0.10)";
    const rowBg = isDark ? "rgba(248,250,252,0.03)" : "rgba(2,8,23,0.02)";
    const codeColor = isDark ? "#60a5fa" : "#2563eb";

    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
    const tnum: React.CSSProperties = { fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum" 1, "lnum" 1' };
    const fmtRowDate = (d: string | null) => {
      if (!d) return "—";
      try { return format(parseLocalDate(d), "dd/MM/yy"); } catch { return d; }
    };
    const fmtMXN = (v: number) => mxnFmt.format(v);
    const totalBultos = order.items.reduce((s, i) => s + i.quantity, 0);

    const cellBase: React.CSSProperties = {
      padding: "14px 12px",
      borderBottom: `1px solid ${separator}`,
      verticalAlign: "middle",
      fontSize: 15,
    };

    return (
      <div
        ref={ref}
        style={{
          position: "fixed", top: 0, left: 0, transform: "translateX(-200vw)",
          pointerEvents: "none", zIndex: 0, width: 1200, minHeight: 900,
          backgroundColor: bg, color: fg,
          fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
          padding: 56, boxSizing: "border-box",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, gap: 24 }}>
          <div>
            <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1 }}>Pedido</div>
            <div style={{ fontSize: 30, fontWeight: 700, fontFamily: "'SF Mono', Menlo, monospace", color: codeColor, marginTop: 6, lineHeight: 1.1 }}>
              {order.order_code}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Generado</div>
            <div style={{ fontSize: 16, marginTop: 4, ...tnum }}>{dateStr}</div>
          </div>
        </div>
        <div style={{ height: 3, background: accent, borderRadius: 2, marginBottom: 24 }} />

        {/* Client block */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Cliente</div>
          <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.2 }}>{clientName}</div>
          {clientCompany && <div style={{ fontSize: 14, color: muted, marginTop: 4, lineHeight: 1.3 }}>{clientCompany}</div>}
          {clientPhone && <div style={{ fontSize: 14, color: muted, marginTop: 2, lineHeight: 1.3 }}>Tel: {clientPhone}</div>}
          {clientAddress && <div style={{ fontSize: 14, color: muted, marginTop: 2, lineHeight: 1.3 }}>{clientAddress}</div>}
        </div>

        {/* Order meta grid */}
        <div style={{ display: "flex", gap: 56, marginBottom: 32, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, color: muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Fecha pedido</div>
            <div style={{ fontSize: 18, fontWeight: 600, ...tnum }}>{fmtRowDate(order.order_date)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Fecha entrega</div>
            <div style={{ fontSize: 18, fontWeight: 600, ...tnum }}>{fmtRowDate(order.delivery_date)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Estado</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{order.status}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Bultos totales</div>
            <div style={{ fontSize: 18, fontWeight: 600, ...tnum }}>{totalBultos.toLocaleString("es-MX")}</div>
          </div>
        </div>

        {/* Items table. When hideMoney is true, the two right-most
            columns (P. Unit + Subtotal) are dropped — keeps the
            driver from seeing the prices. */}
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 64 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 140 }} />
            <col />
            {!hideMoney && <col style={{ width: 140 }} />}
            {!hideMoney && <col style={{ width: 160 }} />}
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "0 12px 10px", fontSize: 12, color: muted, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${separator}`, fontWeight: 600 }}></th>
              <th style={{ textAlign: "left", padding: "0 12px 10px", fontSize: 12, color: muted, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${separator}`, fontWeight: 600 }}>Bultos</th>
              <th style={{ textAlign: "left", padding: "0 12px 10px", fontSize: 12, color: muted, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${separator}`, fontWeight: 600 }}>SKU</th>
              <th style={{ textAlign: "left", padding: "0 12px 10px", fontSize: 12, color: muted, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${separator}`, fontWeight: 600 }}>Producto</th>
              {!hideMoney && <th style={{ textAlign: "right", padding: "0 12px 10px", fontSize: 12, color: muted, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${separator}`, fontWeight: 600 }}>P. Unit.</th>}
              {!hideMoney && <th style={{ textAlign: "right", padding: "0 12px 10px", fontSize: 12, color: muted, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${separator}`, fontWeight: 600 }}>Subtotal</th>}
            </tr>
          </thead>
          <tbody>
            {order.items.map((it, i) => {
              const damagedLabel = it.is_damaged
                ? (it.damaged_condition && DAMAGED_LABELS[it.damaged_condition]) || "Producto con empaque dañado — precio especial"
                : null;
              return (
                <tr key={i} style={{ background: i % 2 === 1 ? rowBg : "transparent" }}>
                  <td style={{ ...cellBase, padding: "10px 12px" }}>
                    {it.thumbDataUrl ? (
                      // Theme-aware wrapper bg + thick padding so the
                      // bg frame visibly surrounds the photo regardless
                      // of how dark the source image is. Bigger box (56×56)
                      // with 10px padding means the inner image sits at
                      // ~36×36, and the page-colored frame around it is
                      // ~10px on every side — that frame is what reads
                      // as "white" on light pages and "dark" on dark.
                      <div
                        style={{
                          width: 56,
                          height: 56,
                          background: bg,
                          borderRadius: 8,
                          border: `1px solid ${separator}`,
                          padding: 10,
                          boxSizing: "border-box",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <img
                          src={it.thumbDataUrl}
                          alt=""
                          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
                        />
                      </div>
                    ) : (
                      <div
                        style={{ width: 56, height: 56, background: rowBg, borderRadius: 8, border: `1px solid ${separator}`, display: "flex", alignItems: "center", justifyContent: "center", color: muted, fontSize: 18 }}
                      >
                        {/* Tiny placeholder icon (squared box) */}
                        <span style={{ display: "inline-block", width: 20, height: 20, border: `2px solid currentColor`, borderRadius: 3 }} />
                      </div>
                    )}
                  </td>
                  <td style={{ ...cellBase, fontWeight: 600, ...tnum }}>{it.quantity.toLocaleString("es-MX")}</td>
                  <td style={{ ...cellBase, fontFamily: "'SF Mono', Menlo, monospace", fontWeight: 600 }}>{it.clave}</td>
                  <td style={{ ...cellBase, wordBreak: "break-word", lineHeight: 1.35 }}>
                    <div>{it.name}</div>
                    {damagedLabel && (
                      <div style={{ fontSize: 12, color: muted, fontStyle: "italic", marginTop: 3, lineHeight: 1.3 }}>
                        {damagedLabel}
                      </div>
                    )}
                  </td>
                  {!hideMoney && <td style={{ ...cellBase, textAlign: "right", ...tnum }}>{fmtMXN(it.price)}</td>}
                  {!hideMoney && <td style={{ ...cellBase, textAlign: "right", fontWeight: 600, ...tnum }}>{fmtMXN(it.subtotal)}</td>}
                </tr>
              );
            })}
            {!hideMoney && (() => {
              const discount = Math.max(0, Math.min(Number(order.discount) || 0, order.subtotal));
              const reason = (order.discountReason ?? "").trim();
              if (discount <= 0) {
                return (
                  <tr>
                    <td colSpan={4} style={{ padding: "18px 12px 0", fontSize: 14, textTransform: "uppercase", letterSpacing: "0.08em", color: muted, fontWeight: 600, borderTop: `2px solid ${separator}` }}>Total</td>
                    <td style={{ padding: "18px 12px 0", borderTop: `2px solid ${separator}` }} />
                    <td style={{ padding: "18px 12px 0", textAlign: "right", fontSize: 26, fontWeight: 700, borderTop: `2px solid ${separator}`, ...tnum }}>{order.total.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                );
              }
              return (
                <>
                  <tr>
                    <td colSpan={4} style={{ padding: "14px 12px 4px", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.08em", color: muted, fontWeight: 600, borderTop: `2px solid ${separator}` }}>Subtotal</td>
                    <td style={{ padding: "14px 12px 4px", borderTop: `2px solid ${separator}` }} />
                    <td style={{ padding: "14px 12px 4px", textAlign: "right", fontSize: 16, fontWeight: 600, color: muted, borderTop: `2px solid ${separator}`, ...tnum }}>{order.subtotal.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                  <tr>
                    <td colSpan={4} style={{ padding: "4px 12px", fontSize: 13, color: "#d97706", fontWeight: 600 }}>
                      Descuento{reason ? ` · ${reason}` : ""}
                    </td>
                    <td />
                    <td style={{ padding: "4px 12px", textAlign: "right", fontSize: 16, fontWeight: 600, color: "#d97706", ...tnum }}>−{discount.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                  <tr>
                    <td colSpan={4} style={{ padding: "8px 12px 0", fontSize: 14, textTransform: "uppercase", letterSpacing: "0.08em", color: muted, fontWeight: 700, borderTop: `1px solid ${separator}` }}>Total</td>
                    <td style={{ padding: "8px 12px 0", borderTop: `1px solid ${separator}` }} />
                    <td style={{ padding: "8px 12px 0", textAlign: "right", fontSize: 26, fontWeight: 700, borderTop: `1px solid ${separator}`, ...tnum }}>{order.total.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                </>
              );
            })()}
          </tbody>
        </table>

        {order.notes && (
          <div style={{ marginTop: 24, padding: 14, border: `1px solid ${separator}`, borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Notas</div>
            <div style={{ fontSize: 14 }}>{order.notes}</div>
          </div>
        )}

        {/* FIRMADO section — only when the order has been signed via the
            /entrega/:token flow. Renders the signature image, the name
            of who signed, and the timestamp, all on the same canvas as
            the order summary so the snapshot becomes a complete
            "comprobante de entrega firmado". */}
        {order.signature && (
          <div style={{
            marginTop: 28,
            padding: "16px 20px",
            border: `2px solid #16a34a`,
            borderRadius: 10,
            backgroundColor: isDark ? "rgba(22,163,74,0.08)" : "rgba(22,163,74,0.04)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              {/* SVG check — explicit 18px line-height on the heading
                  text below so the two boxes are the same height and
                  the visual centers actually align. */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <div style={{ fontSize: 13, color: "#16a34a", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, lineHeight: "18px" }}>
                Entrega confirmada · Firmado
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
              <div style={{
                flexShrink: 0,
                width: 220,
                height: 110,
                backgroundColor: "#ffffff",
                border: `1px solid ${separator}`,
                borderRadius: 8,
                padding: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                <img
                  src={order.signature.dataUrl}
                  alt="firma"
                  /* Defensive white background on the IMG itself in case
                     the underlying PNG was saved with transparency
                     (older signatures pre-fix). */
                  style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", backgroundColor: "#ffffff" }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Firmó</div>
                <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
                  {order.signature.signedByName || "—"}
                </div>
                <div style={{ fontSize: 11, color: muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Fecha y hora</div>
                {/* No `tnum` here — tabular-nums forces the colon into a
                    digit-width slot which renders as a visible "12: 04"
                    gap. Date is short enough that proportional digits
                    look fine. */}
                <div style={{ fontSize: 16, fontWeight: 500 }}>
                  {(() => {
                    try {
                      const d = new Date(order.signature.signedAt);
                      const dd = String(d.getDate()).padStart(2, "0");
                      const mm = String(d.getMonth() + 1).padStart(2, "0");
                      const yyyy = d.getFullYear();
                      const hh = String(d.getHours()).padStart(2, "0");
                      const mi = String(d.getMinutes()).padStart(2, "0");
                      return `${dd}/${mm}/${yyyy} · ${hh}:${mi}`;
                    } catch { return order.signature?.signedAt ?? ""; }
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
);
SingleOrderImageCard.displayName = "SingleOrderImageCard";

/**
 * Replace pure-dark pixels of a data-URL image with the given background
 * color. Used to clean up product photos for light-theme PNG exports —
 * source thumbnails have dark navy/black backgrounds baked in, which
 * read as black squares against a white page. Pixels where *all three*
 * RGB channels fall below `threshold` are treated as background; pixels
 * where any channel is brighter (orange/red/yellow logo art, dog faces,
 * etc.) are left alone, so the product art is preserved.
 *
 * Returns the original data URL on any failure so the export never
 * breaks because of a bad image.
 */
async function lightenDarkBackground(
  dataUrl: string,
  threshold: number,
  bgColor: string,
): Promise<string> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;
          if (!w || !h) return resolve(dataUrl);
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(dataUrl);
          ctx.drawImage(img, 0, 0, w, h);

          // Parse "#rrggbb" → channels
          const m = /^#?([0-9a-fA-F]{6})$/.exec(bgColor.trim());
          const bgR = m ? parseInt(m[1].slice(0, 2), 16) : 255;
          const bgG = m ? parseInt(m[1].slice(2, 4), 16) : 255;
          const bgB = m ? parseInt(m[1].slice(4, 6), 16) : 255;

          let imageData: ImageData;
          try {
            imageData = ctx.getImageData(0, 0, w, h);
          } catch {
            // Tainted canvas (CORS) — bail out gracefully
            return resolve(dataUrl);
          }
          const px = imageData.data;
          for (let i = 0; i < px.length; i += 4) {
            if (px[i] < threshold && px[i + 1] < threshold && px[i + 2] < threshold) {
              px[i] = bgR;
              px[i + 1] = bgG;
              px[i + 2] = bgB;
            }
          }
          ctx.putImageData(imageData, 0, 0);
          resolve(canvas.toDataURL("image/png"));
        } catch {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    } catch {
      resolve(dataUrl);
    }
  });
}

/**
 * Internal: fetch all the data + render the SingleOrderImageCard
 * offscreen + snapshot via html2canvas. Returns the Blob plus a
 * suggested filename and a flag indicating whether the snapshot
 * already includes the signature ("comprobante" mode). Used both by
 * the standalone download (exportOrderAsImage) and by the post-sign
 * comprobante upload (uploadSignedComprobanteForOrder).
 */
async function renderOrderSnapshotBlob(orderId: string, hideMoney: boolean = false): Promise<{ blob: Blob; filename: string; signed: boolean } | null> {
  const { supabase } = await import("@/integrations/supabase/client");
  const html2canvas = (await import("html2canvas")).default;

  // Fetch order (includes signature + manual discount columns)
  const { data: orderData, error: orderErr } = await (supabase as any)
    .from("orders")
    .select("id, order_code, order_date, delivery_date, status, notes, client_id, signed_at, signed_by_name, signature_path, discount_amount, discount_reason")
    .eq("id", orderId)
    .single();
  if (orderErr || !orderData) return null;

  const { data: client } = await supabase
    .from("clients")
    .select("name, company, phone, address")
    .eq("id", orderData.client_id)
    .single();

  const { data: items } = await (supabase as any)
    .from("order_items")
    .select("quantity, unit_price_override, is_damaged, products(clave, name, sale_price_with_iva, image_url), damaged_batches(condition)")
    .eq("order_id", orderId);

  const rawItems = (items ?? []) as any[];
  const thumbs = await Promise.all(
    rawItems.map(it => loadImageAsDataUrl(it.products?.image_url ?? null)),
  );

  const pdfItems: PdfOrderItem[] = rawItems.map((it: any, idx: number) => {
    const p = it.products;
    const price = it.unit_price_override ?? p?.sale_price_with_iva ?? 0;
    return {
      clave: p?.clave ?? "",
      name: p?.name ?? "",
      quantity: it.quantity ?? 0,
      price,
      subtotal: price * (it.quantity ?? 0),
      thumbDataUrl: thumbs[idx],
      is_damaged: !!it.is_damaged,
      damaged_condition: it.damaged_batches?.condition ?? null,
    };
  });
  const subtotal = pdfItems.reduce((s, i) => s + i.subtotal, 0);
  const discountRaw = Number(orderData.discount_amount) || 0;
  const discount = Math.max(0, Math.min(discountRaw, subtotal));
  const discountReason = (orderData.discount_reason ?? "") as string | null;
  const total = Math.max(0, subtotal - discount);

  let signature: PdfOrder["signature"] = null;
  if (orderData.signed_at && orderData.signature_path) {
    const sigUrl = `https://rfyshhzkhewzjudohzii.supabase.co/storage/v1/object/public/order-documents/${orderData.signature_path}`;
    const rawDataUrl = await loadImageAsDataUrl(sigUrl);
    if (rawDataUrl) {
      // Composite onto a white canvas so transparent pixels become
      // white. Old signatures saved before the canvas-paints-white
      // fix have transparent backgrounds; without this step they
      // composite as black during html2canvas rasterization.
      const flattened = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement("canvas");
          c.width = img.naturalWidth || 600;
          c.height = img.naturalHeight || 200;
          const ctx = c.getContext("2d");
          if (!ctx) return resolve(rawDataUrl);
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0);
          resolve(c.toDataURL("image/png"));
        };
        img.onerror = () => reject(new Error("signature image load failed"));
        img.src = rawDataUrl;
      }).catch(() => rawDataUrl);
      signature = {
        dataUrl: flattened,
        signedAt: orderData.signed_at,
        signedByName: orderData.signed_by_name ?? null,
      };
    }
  }

  const pdfOrder: PdfOrder = {
    id: orderData.id,
    order_code: orderData.order_code ?? "pedido",
    order_date: orderData.order_date,
    delivery_date: orderData.delivery_date,
    status: orderData.status ?? "",
    notes: orderData.notes ?? null,
    subtotal,
    discount,
    discountReason,
    total,
    items: pdfItems,
    signature,
  };

  const container = document.createElement("div");
  document.body.appendChild(container);
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(container);

  await new Promise<void>((resolve) => {
    root.render(
      <SingleOrderImageCard
        ref={(node) => { if (node) setTimeout(resolve, 60); }}
        clientName={client?.name ?? "—"}
        clientCompany={client?.company ?? null}
        clientPhone={client?.phone ?? null}
        clientAddress={client?.address ?? null}
        order={pdfOrder}
        hideMoney={hideMoney}
      />
    );
  });

  if (document.fonts?.ready) await document.fonts.ready;
  const node = container.firstElementChild as HTMLElement | null;
  if (!node) {
    root.unmount();
    container.remove();
    return null;
  }
  const isDark = document.documentElement.classList.contains("dark");
  const bg = isDark ? "#020817" : "#ffffff";
  const height = node.scrollHeight || 900;
  const canvas = await html2canvas(node, {
    backgroundColor: bg, scale: 2, useCORS: true, allowTaint: true, logging: false,
    width: 1200, height, windowWidth: 1200, windowHeight: height,
  });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  root.unmount();
  container.remove();

  if (!blob) return null;
  const code = (pdfOrder.order_code || "pedido").replace(/[^\w\-]+/g, "_");
  const filename = signature ? `comprobante_${code}.png` : `${code}.png`;
  return { blob, filename, signed: !!signature };
}

/* Shared export helper: fetches order details on-demand and exports as PNG. */
export async function exportOrderAsImage(orderId: string, opts?: { hideMoney?: boolean }) {
  const { toast } = await import("sonner");
  try {
    const result = await renderOrderSnapshotBlob(orderId, !!opts?.hideMoney);
    if (!result) throw new Error("No se pudo generar la imagen");
    const url = URL.createObjectURL(result.blob);
    const link = document.createElement("a");
    link.download = result.filename;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error(err);
    toast("Error al generar imagen");
  }
}

/**
 * Generate the signed comprobante snapshot, upload it to storage, and
 * register it in order_documents with category 'comprobante_entrega'.
 * Called from /entrega/:token right after the client signs so the
 * /documentos page picks it up automatically.
 */
export async function uploadSignedComprobanteForOrder(orderId: string): Promise<{ path: string; size: number } | null> {
  const { supabase } = await import("@/integrations/supabase/client");
  const result = await renderOrderSnapshotBlob(orderId);
  if (!result || !result.signed) return null;
  const ts = Date.now();
  const path = `${orderId}/comprobante_entrega/${ts}_comprobante.png`;
  const { error: upErr } = await supabase.storage
    .from("order-documents")
    .upload(path, result.blob, { contentType: "image/png", upsert: false });
  if (upErr) { console.error(upErr); return null; }
  const { error: docErr } = await (supabase as any).from("order_documents").insert({
    order_id: orderId,
    category: "comprobante_entrega",
    file_name: result.filename,
    file_path: path,
    file_type: "image/png",
    file_size: result.blob.size,
  });
  if (docErr) console.error(docErr);
  return { path, size: result.blob.size };
}

/**
 * Heuristic: is this comprobante_entrega doc an auto-generated
 * snapshot (or old bare-signature PNG that pre-dated the snapshot)
 * vs. a manually-uploaded delivery photo?
 *
 * Auto-generated patterns we know about:
 *   - "comprobante_<code>.png"   — current format (full snapshot)
 *   - "Firma <code>.png"         — old format (bare signature only,
 *                                    pre-dated the snapshot rewrite)
 *
 * Photos are typically named "Foto entrega ..." or whatever the user
 * uploads manually. Anything not matching the auto-generated patterns
 * is left alone.
 */
export function isAutoComprobanteFilename(fileName: string | null | undefined): boolean {
  if (!fileName || typeof fileName !== "string") return false;
  const lower = fileName.toLowerCase();
  return lower.startsWith("comprobante_") || lower.startsWith("firma ") || lower.startsWith("firma_");
}

/**
 * Delete every auto-generated comprobante snapshot for an order (both
 * new "comprobante_*" PNGs and the old "Firma *" bare-signature ones).
 * Leaves the optional delivery photos in place — those are internal
 * evidence and shouldn't be wiped just because someone wants to refresh
 * the snapshot.
 *
 * Returns the count of snapshots removed.
 */
export async function deleteComprobanteSnapshotsForOrder(orderId: string): Promise<number> {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data: docs, error } = await (supabase as any)
    .from("order_documents")
    .select("id, file_path, file_name")
    .eq("order_id", orderId)
    .eq("category", "comprobante_entrega");
  if (error || !docs?.length) return 0;
  const snapshots = (docs as Array<{ id: string; file_path: string; file_name: string }>).filter(
    (d) => isAutoComprobanteFilename(d.file_name),
  );
  if (!snapshots.length) return 0;
  const paths = snapshots.map((d) => d.file_path).filter(Boolean);
  if (paths.length) {
    await supabase.storage.from("order-documents").remove(paths);
  }
  await (supabase as any)
    .from("order_documents")
    .delete()
    .in("id", snapshots.map((d) => d.id));
  return snapshots.length;
}

/**
 * Regenerate: delete existing comprobante snapshots, then render a
 * fresh one and upload. One-click "fix the broken/dark-bg comprobante"
 * action. The signing event itself is untouched (signed_at,
 * signed_by_name, signature_path stay on the order).
 */
export async function regenerateComprobanteForOrder(orderId: string): Promise<{ path: string; size: number } | null> {
  await deleteComprobanteSnapshotsForOrder(orderId);
  return uploadSignedComprobanteForOrder(orderId);
}

/**
 * Reiniciar firma — destructive. Removes ALL comprobante snapshots,
 * deletes the bare signature PNG from storage, and clears
 * signed_at/signed_by_name/signature_path on the order so the
 * /entrega/:token link unlocks for re-signing. Use only when the
 * signing event itself was wrong (wrong person, mistake, etc.).
 */
export async function resetOrderSignature(orderId: string): Promise<void> {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data: orderRow } = await (supabase as any)
    .from("orders")
    .select("signature_path")
    .eq("id", orderId)
    .single();
  const sigPath = (orderRow?.signature_path as string | null) ?? null;
  await deleteComprobanteSnapshotsForOrder(orderId);
  if (sigPath) {
    await supabase.storage.from("order-documents").remove([sigPath]);
  }
  await (supabase as any)
    .from("orders")
    .update({ signed_at: null, signed_by_name: null, signature_path: null })
    .eq("id", orderId);
}

