// @ts-nocheck
/**
 * Customer-facing COTIZACIÓN PDF — clearly labeled as a quote, not an order.
 * Reuses the look of /catalogo's price-list PDF for consistency.
 */

import jsPDF from "jspdf";
import { BUSINESS_CONTACT } from "@/config/business";
import { loadImageForJsPdf } from "@/lib/load-image-as-data-url";

const DEEP_BLUE: [number, number, number] = [15, 23, 42];
const WHITE: [number, number, number] = [255, 255, 255];
const DARK: [number, number, number] = [30, 30, 30];

const fmtPrice = (n: number) =>
  "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface QuoteLine {
  clave: string;
  name: string;
  quantity: number;
  unit_price: number;
  image_url?: string | null;
}

// Image loading is delegated to the shared loader in
// src/lib/load-image-as-data-url so every PDF/PNG export uses the same
// dual-strategy (img+canvas → fetch fallback) approach.

interface QuotePdfInput {
  quoteNumber: number;
  clientName: string;
  deliveryDate: string | null;
  notes: string | null;
  lines: QuoteLine[];
}

export async function generateQuotePDF(q: QuotePdfInput) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const W = 215.9;
  const H = 279.4;
  const MARGIN_X = 14;
  const HEADER_H = 36;

  // Column layout — leftmost column reserved for product thumbnail.
  const THUMB_W = 8;          // image width in mm
  const THUMB_GAP = 2;        // gap between image and SKU text
  const COL_THUMB_X = MARGIN_X;
  const COL_SKU_X = COL_THUMB_X + THUMB_W + THUMB_GAP;
  const COL_SKU_W = 24;
  const COL_NAME_X = COL_SKU_X + COL_SKU_W;
  const COL_QTY_W = 18;
  const COL_PRICE_W = 28;
  const COL_TOTAL_W = 32;
  const COL_TOTAL_X = W - MARGIN_X - COL_TOTAL_W;
  const COL_PRICE_X = COL_TOTAL_X - COL_PRICE_W - 2;
  const COL_QTY_X = COL_PRICE_X - COL_QTY_W - 2;
  const COL_NAME_W = COL_QTY_X - COL_NAME_X - 2;

  // Header
  doc.setFillColor(...DEEP_BLUE);
  doc.rect(0, 0, W, HEADER_H, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...WHITE);
  doc.text("COTIZACIÓN", MARGIN_X, 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const today = new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
  doc.text(`No. ${String(q.quoteNumber).padStart(4, "0")} · ${today}`, MARGIN_X, 24);
  doc.text(`Precios con IVA incluido`, MARGIN_X, 30);

  // Right side: client info
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(q.clientName, W - MARGIN_X, 16, { align: "right" });
  if (q.deliveryDate) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    let entregaDate: string;
    try {
      entregaDate = new Date(q.deliveryDate + "T12:00:00").toLocaleDateString("es-MX", {
        day: "numeric", month: "long", year: "numeric",
      });
    } catch { entregaDate = q.deliveryDate; }
    doc.text(`Entrega tentativa: ${entregaDate}`, W - MARGIN_X, 22, { align: "right" });
  }

  // Notice
  let bodyTop = HEADER_H + 10;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  const notice =
    "Esta cotización es informativa y no compromete inventario. Sujeta a disponibilidad al momento de confirmar el pedido.";
  doc.text(notice, MARGIN_X, bodyTop);
  bodyTop += 8;

  // Preload all thumbnails in parallel before drawing rows.
  const thumbs = await Promise.all(
    q.lines.map(line => loadImageForJsPdf(line.image_url ?? null)),
  );

  // Table header — taller rows so the 8mm thumbnails fit comfortably.
  const ROW_H = 10;
  doc.setFillColor(240, 240, 240);
  doc.rect(MARGIN_X, bodyTop - 5, W - MARGIN_X * 2, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  doc.text("SKU", COL_SKU_X + 1, bodyTop);
  doc.text("Producto", COL_NAME_X + 1, bodyTop);
  doc.text("Cant.", COL_QTY_X + COL_QTY_W - 1, bodyTop, { align: "right" });
  doc.text("Precio", COL_PRICE_X + COL_PRICE_W - 1, bodyTop, { align: "right" });
  doc.text("Subtotal", COL_TOTAL_X + COL_TOTAL_W - 1, bodyTop, { align: "right" });

  let y = bodyTop + ROW_H;
  let total = 0;
  q.lines.forEach((line, i) => {
    if (i % 2 === 0) {
      doc.setFillColor(250, 250, 250);
      doc.rect(MARGIN_X, y - 5, W - MARGIN_X * 2, ROW_H, "F");
    }

    // Thumbnail — centered vertically inside the row.
    const thumb = thumbs[i];
    const thumbY = y - 4;
    if (thumb) {
      try {
        doc.addImage(thumb.dataUrl, thumb.format, COL_THUMB_X, thumbY, THUMB_W, THUMB_W);
      } catch {
        // Fall through if jsPDF rejects the image format.
      }
    }

    // Vertically centre the text inside the taller row.
    const textY = y + 2;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...DARK);
    doc.text(line.clave || "—", COL_SKU_X + 1, textY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const name = doc.splitTextToSize(line.name, COL_NAME_W);
    doc.text(name[0] ?? "", COL_NAME_X + 1, textY);

    doc.text(String(line.quantity), COL_QTY_X + COL_QTY_W - 1, textY, { align: "right" });
    doc.text(fmtPrice(line.unit_price), COL_PRICE_X + COL_PRICE_W - 1, textY, { align: "right" });

    const sub = line.quantity * line.unit_price;
    total += sub;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DEEP_BLUE);
    doc.text(fmtPrice(sub), COL_TOTAL_X + COL_TOTAL_W - 1, textY, { align: "right" });

    y += ROW_H;
  });

  // Total
  y += 4;
  doc.setDrawColor(...DEEP_BLUE);
  doc.setLineWidth(0.5);
  doc.line(COL_PRICE_X, y - 2, W - MARGIN_X, y - 2);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...DEEP_BLUE);
  doc.text("Total con IVA", COL_PRICE_X, y + 4);
  doc.text(fmtPrice(total), W - MARGIN_X, y + 4, { align: "right" });

  // Notes
  if (q.notes) {
    y += 14;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...DARK);
    doc.text("Notas:", MARGIN_X, y);
    doc.setFont("helvetica", "normal");
    const noteLines = doc.splitTextToSize(q.notes, W - MARGIN_X * 2);
    doc.text(noteLines, MARGIN_X, y + 5);
  }

  // Footer
  if (BUSINESS_CONTACT.phone) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    const tail = BUSINESS_CONTACT.whatsappNumber ? " · WhatsApp" : "";
    doc.text(`${BUSINESS_CONTACT.phone}${tail}`, MARGIN_X, H - 10);
  }

  doc.save(`cotizacion_${String(q.quoteNumber).padStart(4, "0")}.pdf`);
}
