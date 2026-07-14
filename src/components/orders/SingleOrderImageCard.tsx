// @ts-nocheck
import React from "react";
import { format } from "date-fns";
import { parseLocalDate } from "@/lib/date-utils";
import { loadImageAsDataUrl } from "@/lib/load-image-as-data-url";

const mxnFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

export type PdfOrderItem = {
  clave: string;
  name: string;
  unit: string | null;
  quantity: number;
  price: number;
  subtotal: number;
  thumbDataUrl?: string | null;
  is_damaged?: boolean;
  damaged_condition?: "leve" | "moderado" | "severo" | null;
};

const DAMAGED_LABELS: Record<"leve" | "moderado" | "severo", string> = {
  leve: "Producto con detalle menor en empaque — precio especial",
  moderado: "Producto con empaque dañado — precio especial",
  severo: "Producto con empaque con daño visible — precio especial",
};

export type PdfEmpresa = {
  razon_social: string | null;
  nombre_comercial: string | null;
  rfc: string | null;
  direccion_fiscal: string | null;
  cp_fiscal: string | null;
  telefono: string | null;
  logo_url: string | null;
  logoDataUrl?: string | null;
};

export type PdfOrder = {
  id: string;
  order_code: string;
  order_date: string | null;
  delivery_date: string | null;
  status: string;
  notes: string | null;
  subtotal: number;
  discount?: number;
  discountReason?: string | null;
  total: number;
  items: PdfOrderItem[];
  signature?: {
    dataUrl: string;
    signedAt: string;
    signedByName: string | null;
  } | null;
  vence?: string | null;
  vendedor?: string | null;
};

type Props = {
  clientName: string;
  clientCompany: string | null;
  clientPhone: string | null;
  clientAddress: string | null;
  order: PdfOrder;
  empresa?: PdfEmpresa | null;
  hideMoney?: boolean;
};

const IMPORTANTE_TEXT =
  "IMPORTANTE: NO CORTAR ESTE MATERIAL ANTES DE COMPROBAR TODO LO RELACIONADO A CALIDAD, METRAJE, SOLIDEZ DE COLOR, ENCOGIMIENTO, ARRUGA Y TODO TIPO DE DEFECTO POSIBLES. NO NOS HACEMOS RESPONSABLES, NO ACEPTAREMOS RECLAMACIONES NI OTORGAREMOS BONIFICACIONES SI LA TELA HA SIDO CORTADA.";

function numberToSpanish(n: number): string {
  if (!isFinite(n) || n < 0) return "";
  if (n === 0) return "CERO";
  const UNITS = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE", "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISEIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE", "VEINTE"];
  const TENS = ["", "", "VEINTI", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
  const HUNDREDS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];
  const under100 = (x: number): string => {
    if (x <= 20) return UNITS[x];
    if (x < 30) return "VEINTI" + UNITS[x - 20];
    const t = Math.floor(x / 10), u = x % 10;
    return TENS[t] + (u ? " Y " + UNITS[u] : "");
  };
  const under1000 = (x: number): string => {
    if (x === 100) return "CIEN";
    const h = Math.floor(x / 100), r = x % 100;
    return (h ? HUNDREDS[h] + (r ? " " : "") : "") + (r ? under100(r) : "");
  };
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  let out = "";
  if (millions) out += (millions === 1 ? "UN MILLON" : under1000(millions) + " MILLONES") + " ";
  if (thousands) out += (thousands === 1 ? "MIL" : under1000(thousands) + " MIL") + " ";
  if (rest) out += under1000(rest);
  return out.trim();
}

function amountToLetters(total: number): string {
  const entero = Math.floor(total);
  const centavos = Math.round((total - entero) * 100);
  const cent = String(centavos).padStart(2, "0");
  return `( ${numberToSpanish(entero)} PESOS ${cent}/100 M.N. )`;
}

export const SingleOrderImageCard = React.forwardRef<HTMLDivElement, Props>(
  ({ clientName, clientCompany, clientPhone, clientAddress, order, empresa, hideMoney }, ref) => {
    const fg = "#000000";
    const border = "#000000";
    const bg = "#ffffff";

    const tnum: React.CSSProperties = { fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum" 1, "lnum" 1' };
    const fmtDate = (d: string | null | undefined) => {
      if (!d) return "";
      try { return format(parseLocalDate(d), "dd-MM-yyyy"); } catch { return d; }
    };
    const fmtMXN = (v: number) =>
      Number(v ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const empresaName = (empresa?.nombre_comercial || empresa?.razon_social || "").toUpperCase();
    const empresaDir = empresa?.direccion_fiscal ?? "";
    const empresaCp = empresa?.cp_fiscal ?? "";
    const empresaTel = empresa?.telefono ?? "";
    const empresaRfc = empresa?.rfc ?? "";

    const clientDisplay = (clientCompany || clientName || "").toUpperCase();
    const clientAddr = (clientAddress || "").toUpperCase();

    const cellHead: React.CSSProperties = {
      border: `1px solid ${border}`, padding: "6px 8px", fontSize: 12, fontWeight: 700,
      textAlign: "left", verticalAlign: "middle", background: bg,
    };
    const cellBody: React.CSSProperties = {
      border: `1px solid ${border}`, padding: "6px 8px", fontSize: 12,
      verticalAlign: "top",
    };
    const cellNum: React.CSSProperties = { ...cellBody, textAlign: "right", ...tnum };

    const showMoney = !hideMoney;

    return (
      <div
        ref={ref}
        style={{
          position: "fixed", top: 0, left: 0, transform: "translateX(-200vw)",
          pointerEvents: "none", zIndex: 0, width: 1100, minHeight: 900,
          backgroundColor: bg, color: fg,
          fontFamily: "'Arial', 'Helvetica', sans-serif",
          padding: 40, boxSizing: "border-box",
          lineHeight: 1.35,
        }}
      >
        {/* HEADER — logo left, empresa data centered */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 24, marginBottom: 16 }}>
          <div style={{ width: 160, minHeight: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {empresa?.logoDataUrl ? (
              <img src={empresa.logoDataUrl} alt="" style={{ maxWidth: "100%", maxHeight: 80, objectFit: "contain" }} />
            ) : null}
          </div>
          <div style={{ flex: 1, textAlign: "center", fontSize: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{empresaName || "\u00A0"}</div>
            {empresaRfc && <div>R.F.C. : {empresaRfc}</div>}
            {empresaDir && <div>{empresaDir.toUpperCase()}</div>}
            {empresaCp && <div>C.P. : {empresaCp}</div>}
            {empresaTel && <div>TELS. : {empresaTel}</div>}
          </div>
          <div style={{ width: 160 }} />
        </div>

        {/* Info grid */}
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={{ ...cellBody, width: "65%" }}>
                <div><span style={{ fontWeight: 700 }}>VENDEDOR :</span> {(order.vendedor ?? "").toUpperCase()}</div>
                <div style={{ marginTop: 4 }}><span style={{ fontWeight: 700 }}>CLIENTE :</span> {clientDisplay}</div>
                <div style={{ marginTop: 4 }}>
                  <span style={{ fontWeight: 700 }}>DIRECCION :</span>{" "}
                  {clientAddr || "\u00A0"}
                </div>
                {clientPhone && <div style={{ marginTop: 4 }}><span style={{ fontWeight: 700 }}>TEL. :</span> {clientPhone}</div>}
              </td>
              <td style={{ ...cellBody, width: "35%" }}>
                <div><span style={{ fontWeight: 700 }}>PEDIDO :</span> {order.order_code}</div>
                <div style={{ marginTop: 4 }}><span style={{ fontWeight: 700 }}>FECHA :</span> <span style={tnum}>{fmtDate(order.order_date)}</span></div>
                <div style={{ marginTop: 4 }}><span style={{ fontWeight: 700 }}>PED.CTE. :</span></div>
                <div style={{ marginTop: 4 }}><span style={{ fontWeight: 700 }}>VENCE :</span> {order.vence ?? ""}</div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Items table */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: -1 }}>
          <colgroup>
            <col style={{ width: 90 }} />
            <col style={{ width: 130 }} />
            <col />
            <col style={{ width: 90 }} />
            {showMoney && <col style={{ width: 110 }} />}
            {showMoney && <col style={{ width: 120 }} />}
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...cellHead, textAlign: "right" }}>CANTIDAD</th>
              <th style={cellHead}>CODIGO</th>
              <th style={cellHead}>DESCRIPCION</th>
              <th style={cellHead}>UNIDAD</th>
              {showMoney && <th style={{ ...cellHead, textAlign: "right" }}>PRECIO</th>}
              {showMoney && <th style={{ ...cellHead, textAlign: "right" }}>IMPORTE</th>}
            </tr>
          </thead>
          <tbody>
            {order.items.map((it, i) => {
              const damagedLabel = it.is_damaged
                ? (it.damaged_condition && DAMAGED_LABELS[it.damaged_condition]) || "Producto con empaque dañado — precio especial"
                : null;
              return (
                <tr key={i}>
                  <td style={cellNum}>{Number(it.quantity ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td style={{ ...cellBody, fontFamily: "'Courier New', monospace" }}>{it.clave}</td>
                  <td style={cellBody}>
                    <div>{(it.name || "").toUpperCase()}</div>
                    {damagedLabel && (
                      <div style={{ fontSize: 10, fontStyle: "italic", marginTop: 2 }}>{damagedLabel}</div>
                    )}
                  </td>
                  <td style={{ ...cellBody, textTransform: "uppercase" }}>{it.unit || ""}</td>
                  {showMoney && <td style={cellNum}>{fmtMXN(it.price)}</td>}
                  {showMoney && <td style={cellNum}>{fmtMXN(it.subtotal)}</td>}
                </tr>
              );
            })}
            {order.items.length < 4 && Array.from({ length: 4 - order.items.length }).map((_, i) => (
              <tr key={`f${i}`}>
                <td style={cellBody}>&nbsp;</td>
                <td style={cellBody} />
                <td style={cellBody} />
                <td style={cellBody} />
                {showMoney && <td style={cellBody} />}
                {showMoney && <td style={cellBody} />}
              </tr>
            ))}
          </tbody>
        </table>

        {/* IMPORTANTE note */}
        <div style={{ marginTop: 18, fontSize: 12, fontWeight: 700, lineHeight: 1.4 }}>
          {IMPORTANTE_TEXT}
        </div>

        {/* Amount in letters + TOTAL */}
        {showMoney && (
          <div style={{ marginTop: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24 }}>
            <div style={{ fontSize: 12 }}>{amountToLetters(order.total)}</div>
            <div style={{ fontSize: 13, fontWeight: 700, ...tnum }}>
              {(() => {
                const discount = Math.max(0, Math.min(Number(order.discount) || 0, order.subtotal));
                if (discount <= 0) {
                  return <div>TOTAL : &nbsp;&nbsp; {fmtMXN(order.total)}</div>;
                }
                return (
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 400 }}>SUBTOTAL : {fmtMXN(order.subtotal)}</div>
                    <div style={{ fontWeight: 400, color: "#b45309" }}>
                      DESCUENTO{order.discountReason ? ` · ${order.discountReason.toUpperCase()}` : ""} : −{fmtMXN(discount)}
                    </div>
                    <div style={{ marginTop: 4 }}>TOTAL : &nbsp;&nbsp; {fmtMXN(order.total)}</div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {order.notes && (
          <div style={{ marginTop: 20, padding: 10, border: `1px solid ${border}`, fontSize: 11 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>NOTAS</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{order.notes}</div>
          </div>
        )}

        {order.signature && (
          <div style={{ marginTop: 24, padding: "12px 16px", border: `2px solid #16a34a` }}>
            <div style={{ fontSize: 12, color: "#16a34a", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: 10 }}>
              Entrega confirmada · Firmado
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
              <div style={{
                flexShrink: 0, width: 220, height: 100, backgroundColor: "#ffffff",
                border: `1px solid ${border}`, padding: 4, display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <img src={order.signature.dataUrl} alt="firma" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", backgroundColor: "#ffffff" }} />
              </div>
              <div style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
                <div style={{ fontWeight: 700, textTransform: "uppercase" }}>Firmó</div>
                <div style={{ fontSize: 14, marginBottom: 8 }}>{order.signature.signedByName || "—"}</div>
                <div style={{ fontWeight: 700, textTransform: "uppercase" }}>Fecha y hora</div>
                <div>
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
    .select("quantity, unit_price_override, is_damaged, products(clave, name, unidad, sale_price_with_iva, image_url), damaged_batches(condition)")
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
      unit: p?.unidad ?? null,
      quantity: it.quantity ?? 0,
      price,
      subtotal: price * (it.quantity ?? 0),
      thumbDataUrl: thumbs[idx],
      is_damaged: !!it.is_damaged,
      damaged_condition: it.damaged_batches?.condition ?? null,
    };
  });

  // Fetch default empresa for the header (razon social, RFC, direccion, tel, logo)
  const { data: empresaRow } = await (supabase as any)
    .from("empresas")
    .select("razon_social, nombre_comercial, rfc, direccion_fiscal, cp_fiscal, telefono, logo_url")
    .eq("active", true)
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();
  const empresa: PdfEmpresa | null = empresaRow
    ? {
        razon_social: empresaRow.razon_social ?? null,
        nombre_comercial: empresaRow.nombre_comercial ?? null,
        rfc: empresaRow.rfc ?? null,
        direccion_fiscal: empresaRow.direccion_fiscal ?? null,
        cp_fiscal: empresaRow.cp_fiscal ?? null,
        telefono: empresaRow.telefono ?? null,
        logo_url: empresaRow.logo_url ?? null,
        logoDataUrl: empresaRow.logo_url ? await loadImageAsDataUrl(empresaRow.logo_url) : null,
      }
    : null;

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

/* Shared export helper: fetches order details on-demand and exports as PDF. */
export async function exportOrderAsPdf(orderId: string, opts?: { hideMoney?: boolean }) {
  const { toast } = await import("sonner");
  try {
    const result = await renderOrderSnapshotBlob(orderId, !!opts?.hideMoney);
    if (!result) throw new Error("No se pudo generar el PDF");
    const { default: jsPDF } = await import("jspdf");
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(result.blob);
    });
    // Get image dimensions to size the PDF page proportionally.
    const dims: { w: number; h: number } = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = reject;
      img.src = dataUrl;
    });
    const pageW = 210; // A4 width in mm
    const pageH = (dims.h / dims.w) * pageW;
    const pdf = new jsPDF({ orientation: pageH > pageW ? "portrait" : "landscape", unit: "mm", format: [pageW, pageH] });
    pdf.addImage(dataUrl, "PNG", 0, 0, pageW, pageH);
    const filename = result.filename.replace(/\.png$/i, ".pdf");
    pdf.save(filename);
  } catch (err) {
    console.error(err);
    toast("Error al generar PDF");
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

