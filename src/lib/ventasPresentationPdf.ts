/**
 * Ventas — Presentación ejecutiva en PDF.
 *
 * 6 diapositivas 16:9 con resultados generales (sin detalle granular).
 * Comparte generador con el reporte mensual (mismos datos) pero formato
 * de presentación.
 */
import jsPDF from "jspdf";
import {
  buildMonthlySales,
  fmtMXN,
  fmtInt,
  MONTHS_ES,
  type CatalogItem,
  type SoldMix,
} from "./ventasPdfData";

const C_BLUE = [30, 64, 175] as const;
const C_BLUE_SOFT = [239, 246, 255] as const;
const C_INK = [17, 24, 39] as const;
const C_MUTED = [107, 114, 128] as const;
const C_WHITE = [255, 255, 255] as const;

// 16:9 slide in points (13.33 x 7.5 inches ≈ standard widescreen)
const W = 960;
const H = 540;

export interface PresentationOpts {
  year: number;
  month0: number;
  catalog: CatalogItem[];
  soldMix: SoldMix;
  totalBultos: number;
  /** Prior-month mix + total for MoM deltas on slide 3. */
  prevSoldMix: SoldMix;
  prevTotalBultos: number;
}

export function generateVentasPresentationPdf(opts: PresentationOpts): jsPDF {
  const { year, month0, catalog, soldMix, totalBultos, prevSoldMix, prevTotalBultos } = opts;
  const monthLabel = `${MONTHS_ES[month0]} ${year}`;

  // Current month + previous month for MoM deltas
  const cur = buildMonthlySales({ year, month0, catalog, soldMix, totalBultos });
  const prev = buildMonthlySales({
    year: month0 === 0 ? year - 1 : year,
    month0: month0 === 0 ? 11 : month0 - 1,
    catalog,
    soldMix: prevSoldMix,
    totalBultos: prevTotalBultos,
  });

  const doc = new jsPDF({
    unit: "pt",
    format: [W, H],
    orientation: "landscape",
  });

  slideCover(doc, monthLabel);
  slideOportunidad(doc, monthLabel, cur.totals.tiendas);
  slideResultados(doc, monthLabel, cur.totals, prev.totals);
  slideMezcla(doc, monthLabel, cur);
  slideCobertura(doc, monthLabel, cur.totals.porMunicipio);
  slideCrecimiento(doc, monthLabel, cur, prev);

  return doc;
}

/* ──────────────────────── Helpers ──────────────────────── */

function slideFooter(doc: jsPDF, monthLabel: string, page: number, total: number) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...C_MUTED);
  doc.text(`Ventas ADM · ${monthLabel}`, 40, H - 20);
  doc.text(`${page} / ${total}`, W - 40 - 20, H - 20);
}

function slideHeader(doc: jsPDF, title: string, eyebrow?: string) {
  // left blue accent bar
  doc.setFillColor(...C_BLUE);
  doc.rect(0, 0, 8, H, "F");

  if (eyebrow) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...C_BLUE);
    doc.text(eyebrow.toUpperCase(), 40, 60, { charSpace: 2 });
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(32);
  doc.setTextColor(...C_INK);
  doc.text(title, 40, 100);
}

/* ──────────────────────── Slide 1: Cover ──────────────────────── */
function slideCover(doc: jsPDF, monthLabel: string) {
  doc.setFillColor(...C_BLUE);
  doc.rect(0, 0, W, H, "F");

  // decorative circles
  doc.setGState(new (doc as any).GState({ opacity: 0.08 }));
  doc.setFillColor(255, 255, 255);
  doc.circle(W - 80, 80, 180, "F");
  doc.circle(80, H - 60, 140, "F");
  doc.setGState(new (doc as any).GState({ opacity: 1 }));

  doc.setTextColor(...C_WHITE);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text("PRESENTACIÓN EJECUTIVA", 60, 140, { charSpace: 3 });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(72);
  doc.text("Ventas ADM", 60, 240);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(24);
  doc.text(monthLabel, 60, 300);

  doc.setFontSize(14);
  doc.text("Canal misceláneas · Zona Poniente del Valle de México", 60, H - 100);
  doc.setFontSize(11);
  doc.text(
    "Naucalpan · Tlalnepantla · Atizapán · Huixquilucan · Cuautitlán Izcalli",
    60,
    H - 78
  );
  doc.text(`Emitido: ${new Date().toLocaleDateString("es-MX")}`, 60, H - 56);

  slideFooter(doc, monthLabel, 1, 6);
  // override cover footer color for legibility
  doc.setTextColor(...C_WHITE);
  doc.setFontSize(9);
  doc.text("1 / 6", W - 60, H - 20);
}

/* ──────────────────────── Slide 2: Oportunidad ──────────────────────── */
function slideOportunidad(doc: jsPDF, monthLabel: string, tiendas: number) {
  doc.addPage();
  slideHeader(doc, "La oportunidad", "Contexto");

  const bullets: Array<[string, string]> = [
    [
      "~5,000 misceláneas",
      "en 5 municipios de la zona poniente del Valle de México (INEGI DENUE, SCIAN 461190).",
    ],
    [
      `${fmtInt(tiendas)} tiendas activas`,
      "este mes en ruta comercial.",
    ],
    [
      "Canal fragmentado",
      "con ticket promedio menor pero base de clientes muy amplia — reduce la concentración de riesgo por punto de venta.",
    ],
    [
      "Marcas ADM en foco",
      "Ganador (perro) y Minino (gato), con precios de lista vigentes en el portal.",
    ],
  ];

  let y = 170;
  for (const [title, body] of bullets) {
    doc.setFillColor(...C_BLUE);
    doc.circle(54, y - 4, 5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...C_INK);
    doc.text(title, 80, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(...C_MUTED);
    const lines = doc.splitTextToSize(body, W - 140);
    doc.text(lines, 80, y + 20);
    y += 20 + lines.length * 15 + 20;
  }

  slideFooter(doc, monthLabel, 2, 6);
}

/* ──────────────────────── Slide 3: Resultados ──────────────────────── */
function slideResultados(
  doc: jsPDF,
  monthLabel: string,
  cur: ReturnType<typeof buildMonthlySales>["totals"],
  prev: ReturnType<typeof buildMonthlySales>["totals"]
) {
  doc.addPage();
  slideHeader(doc, "Resultados del mes", "Resumen");

  const cardW = (W - 80 - 40) / 3;
  const cardY = 180;
  kpiCard(doc, 40, cardY, cardW, "Bultos vendidos", fmtInt(cur.bultos), deltaLabel(cur.bultos, prev.bultos));
  kpiCard(doc, 40 + cardW + 20, cardY, cardW, "Importe total", fmtMXN(cur.importe), deltaLabel(cur.importe, prev.importe, true));
  kpiCard(doc, 40 + 2 * (cardW + 20), cardY, cardW, "Tiendas activas", fmtInt(cur.tiendas), deltaLabel(cur.tiendas, prev.tiendas));

  // Secondary metric strip
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...C_BLUE);
  doc.text("CIFRAS CLAVE", 40, 420);

  const extras: Array<[string, string]> = [
    ["Ticket promedio / tienda", fmtMXN(cur.importe / Math.max(1, cur.tiendas))],
    ["Bultos promedio / tienda", fmtInt(cur.bultos / Math.max(1, cur.tiendas))],
    ["Municipios activos", fmtInt(Object.keys(cur.porMunicipio).length)],
  ];
  let x = 40;
  for (const [label, value] of extras) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...C_MUTED);
    doc.text(label, x, 450);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...C_INK);
    doc.text(value, x, 478);
    x += (W - 80) / extras.length;
  }

  slideFooter(doc, monthLabel, 3, 6);
}

function kpiCard(doc: jsPDF, x: number, y: number, w: number, label: string, value: string, delta: string) {
  doc.setFillColor(...C_BLUE_SOFT);
  doc.roundedRect(x, y, w, 170, 14, 14, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...C_BLUE);
  doc.text(label.toUpperCase(), x + 24, y + 38, { charSpace: 2 });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(32);
  doc.setTextColor(...C_INK);
  doc.text(value, x + 24, y + 90);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...C_MUTED);
  doc.text(delta, x + 24, y + 130);
}

function deltaLabel(next: number, prev: number, money = false): string {
  if (!prev) return "sin mes anterior";
  const diff = next - prev;
  const pct = (diff / prev) * 100;
  const sign = diff >= 0 ? "+" : "-";
  const abs = Math.abs(diff);
  const v = money ? fmtMoneyShort(abs) : fmtInt(abs);
  return `${sign}${v} vs mes ant. (${sign}${Math.abs(pct).toFixed(1)}%)`;
}

/** Compact money format: $1.2M / $82.4K so it fits in a KPI card. */
function fmtMoneyShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

/* ──────────────────────── Slide 4: Mezcla ──────────────────────── */
function slideMezcla(
  doc: jsPDF,
  monthLabel: string,
  cur: ReturnType<typeof buildMonthlySales>
) {
  doc.addPage();
  slideHeader(doc, "Mezcla de producto", "Portafolio");

  // Left: brand breakdown as horizontal bars
  const brandEntries = Object.entries(cur.totals.porMarca).sort(
    (a, b) => b[1].bultos - a[1].bultos
  );
  const maxB = Math.max(...brandEntries.map(([, v]) => v.bultos), 1);
  const barX = 40;
  let barY = 180;
  const barW = 400;
  const barH = 34;
  const barGap = 24;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...C_INK);
  doc.text("Participación por marca (bultos)", barX, 170);

  for (const [brand, v] of brandEntries) {
    const pct = v.bultos / cur.totals.bultos;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...C_INK);
    doc.text(brand, barX, barY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...C_MUTED);
    doc.text(`${fmtInt(v.bultos)} bultos · ${(pct * 100).toFixed(1)}%`, barX, barY + 14);
    doc.setFillColor(...C_BLUE_SOFT);
    doc.roundedRect(barX, barY + 18, barW, 10, 5, 5, "F");
    doc.setFillColor(...C_BLUE);
    doc.roundedRect(barX, barY + 18, Math.max(6, barW * (v.bultos / maxB)), 10, 5, 5, "F");
    barY += barH + barGap;
  }

  // Right: Top products list (brief)
  const byProduct = new Map<string, number>();
  for (const r of cur.rows) {
    byProduct.set(r.producto, (byProduct.get(r.producto) || 0) + r.piezas);
  }
  const topProducts = [...byProduct.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const rightX = 500;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...C_INK);
  doc.text("Top 5 productos", rightX, 170);

  let rowY = 185;
  for (const [name, piezas] of topProducts) {
    doc.setDrawColor(229, 231, 235);
    doc.line(rightX, rowY + 22, W - 40, rowY + 22);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...C_INK);
    const lines = doc.splitTextToSize(name, W - 40 - rightX - 80);
    doc.text(lines[0], rightX, rowY + 14);
    if (lines[1]) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...C_MUTED);
      doc.text(lines[1], rightX, rowY + 28);
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...C_BLUE);
    doc.text(`${fmtInt(piezas)} b.`, W - 40, rowY + 14, { align: "right" });
    rowY += 44;
  }

  slideFooter(doc, monthLabel, 4, 6);
}

/* ──────────────────────── Slide 5: Cobertura ──────────────────────── */
function slideCobertura(
  doc: jsPDF,
  monthLabel: string,
  porMunicipio: Record<string, { bultos: number; importe: number; tiendas: number }>
) {
  doc.addPage();
  slideHeader(doc, "Cobertura por municipio", "Geografía");

  const entries = Object.entries(porMunicipio).sort((a, b) => b[1].bultos - a[1].bultos);
  const maxB = Math.max(...entries.map(([, v]) => v.bultos), 1);

  const chartX = 40;
  const chartW = W - 80;
  let y = 175;
  const rowH = 56;

  for (const [muni, v] of entries) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...C_INK);
    doc.text(muni, chartX, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...C_MUTED);
    doc.text(
      `${fmtInt(v.tiendas)} tiendas · ${fmtInt(v.bultos)} bultos · ${fmtMXN(v.importe)}`,
      chartX,
      y + 18
    );

    doc.setFillColor(...C_BLUE_SOFT);
    doc.roundedRect(chartX, y + 28, chartW, 12, 6, 6, "F");
    doc.setFillColor(...C_BLUE);
    doc.roundedRect(chartX, y + 28, Math.max(8, chartW * (v.bultos / maxB)), 12, 6, 6, "F");

    y += rowH;
  }

  slideFooter(doc, monthLabel, 5, 6);
}

/* ──────────────────────── Slide 6: Crecimiento ──────────────────────── */
function slideCrecimiento(
  doc: jsPDF,
  monthLabel: string,
  cur: ReturnType<typeof buildMonthlySales>,
  prev: ReturnType<typeof buildMonthlySales>
) {
  doc.addPage();
  slideHeader(doc, "Crecimiento y siguientes pasos", "Cierre");

  // Compute new / lost against previous month
  const curClaves = new Set(cur.rows.map((r) => r.claveCliente));
  const prevClaves = new Set(prev.rows.map((r) => r.claveCliente));
  let nuevas = 0;
  let perdidas = 0;
  curClaves.forEach((c) => {
    if (!prevClaves.has(c)) nuevas++;
  });
  prevClaves.forEach((c) => {
    if (!curClaves.has(c)) perdidas++;
  });

  // Two stat blocks
  const cardW = (W - 80 - 20) / 2;
  const cardY = 170;
  smallStat(doc, 40, cardY, cardW, "Tiendas nuevas este mes", fmtInt(nuevas), "pos");
  smallStat(doc, 40 + cardW + 20, cardY, cardW, "Tiendas sin compra este mes", fmtInt(perdidas), "neg");

  // Next steps
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...C_BLUE);
  doc.text("SIGUIENTES PASOS", 40, 340, { charSpace: 2 });

  const steps = [
    "Sostener ritmo de onboarding (+15 tiendas/mes) en los 5 municipios objetivo.",
    "Priorizar reactivación de tiendas inactivas con ruta comercial dedicada.",
    "Validar mezcla de producto vs demanda real una vez se acumulen 3 meses de venta.",
  ];

  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.setTextColor(...C_INK);
  let sy = 370;
  for (const s of steps) {
    doc.setFillColor(...C_BLUE);
    doc.circle(50, sy - 4, 4, "F");
    const lines = doc.splitTextToSize(s, W - 110);
    doc.text(lines, 70, sy);
    sy += lines.length * 18 + 10;
  }

  slideFooter(doc, monthLabel, 6, 6);
}

function smallStat(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  label: string,
  value: string,
  tone: "pos" | "neg"
) {
  doc.setFillColor(tone === "pos" ? 220 : 254, tone === "pos" ? 252 : 226, tone === "pos" ? 231 : 226);
  doc.roundedRect(x, y, w, 140, 14, 14, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(tone === "pos" ? 22 : 185, tone === "pos" ? 101 : 28, tone === "pos" ? 52 : 28);
  doc.text(label.toUpperCase(), x + 24, y + 36, { charSpace: 2 });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(48);
  doc.setTextColor(...C_INK);
  doc.text(value, x + 24, y + 100);
}

export function downloadVentasPresentationPdf(opts: PresentationOpts) {
  const doc = generateVentasPresentationPdf(opts);
  const name = `Presentacion_Ventas_${opts.year}-${String(opts.month0 + 1).padStart(2, "0")}.pdf`;
  doc.save(name);
}
