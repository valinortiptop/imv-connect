/**
 * Ventas PDF builder.
 *
 * Uses jsPDF + jspdf-autotable. Produces a multi-page report:
 *   1. Cover ("Ventas")
 *   2. Resumen del mes
 *   3. Cobertura geográfica
 *   4. Mezcla de producto
 *   5. Detalle de ventas (tabla Excel)
 *   6. Comparativo canal
 *   7. Metodología
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  buildMonthlySales,
  fmtMXN,
  fmtInt,
  MONTHS_ES,
  UNIVERSE_SIZE,
  universeSizeForMonth,
  type CatalogItem,
  type SaleRow,
  type SoldMix,
} from "./ventasPdfData";

// Brand palette (matching portal blue)
const C_BLUE = [30, 64, 175] as const;     // blue-800
const C_BLUE_SOFT = [239, 246, 255] as const; // blue-50
const C_INK = [17, 24, 39] as const;        // gray-900
const C_MUTED = [107, 114, 128] as const;   // gray-500
const C_LINE = [229, 231, 235] as const;    // gray-200

export interface GenerateOpts {
  year: number;
  month0: number;
  catalog: CatalogItem[];
  soldMix: SoldMix;
  totalBultos: number;
  /** When "code", the "Cliente" column shows the client ID instead of the store name. */
  viewMode?: "name" | "code";
}

export function generateVentasPdf(opts: GenerateOpts): jsPDF {
  const { year, month0, catalog, soldMix, totalBultos } = opts;
  const viewMode = opts.viewMode ?? "name";
  const { rows, shops, totals } = buildMonthlySales({ year, month0, catalog, soldMix, totalBultos });
  const monthLabel = `${MONTHS_ES[month0]} ${year}`;

  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  /* ──────────────── 1. Cover ──────────────── */
  doc.setFillColor(...C_BLUE);
  doc.rect(0, 0, W, H, "F");

  // subtle corner accent
  doc.setFillColor(255, 255, 255);
  doc.setGState(new (doc as any).GState({ opacity: 0.08 }));
  doc.circle(W - 60, 60, 180, "F");
  doc.circle(60, H - 80, 140, "F");
  doc.setGState(new (doc as any).GState({ opacity: 1 }));

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text("REPORTE MENSUAL", 60, 120, { charSpace: 2 });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(72);
  doc.text("Ventas", 60, 220);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(18);
  doc.text(monthLabel, 60, 260);

  doc.setFontSize(11);
  doc.text("Canal: Misceláneas · Zona Metropolitana Poniente", 60, H - 120);
  doc.text("Naucalpan · Tlalnepantla · Atizapán · Huixquilucan · Cuautitlán Izcalli", 60, H - 100);
  doc.text(`Emitido: ${new Date().toLocaleDateString("es-MX")}`, 60, H - 80);

  /* ──────────────── 2. Resumen del mes ──────────────── */
  doc.addPage();
  drawHeader(doc, "Resumen del mes", monthLabel);

  const heroY = 140;
  drawHero(doc, 48, heroY, (W - 96) / 3 - 8, "Bultos vendidos", fmtInt(totals.bultos));
  drawHero(doc, 48 + (W - 96) / 3, heroY, (W - 96) / 3 - 8, "Importe total", fmtMXN(totals.importe));
  drawHero(doc, 48 + 2 * (W - 96) / 3, heroY, (W - 96) / 3, "Tiendas activas", fmtInt(totals.tiendas));

  // Municipio breakdown table
  autoTable(doc, {
    startY: heroY + 130,
    head: [["Municipio", "Tiendas", "Bultos", "Importe", "Ticket prom."]],
    body: Object.entries(totals.porMunicipio)
      .sort((a, b) => b[1].importe - a[1].importe)
      .map(([muni, v]) => [
        muni,
        fmtInt(v.tiendas),
        fmtInt(v.bultos),
        fmtMXN(v.importe),
        fmtMXN(v.importe / Math.max(1, v.tiendas)),
      ]),
    styles: { fontSize: 10, cellPadding: 6, textColor: [...C_INK] },
    headStyles: { fillColor: [...C_BLUE], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [...C_BLUE_SOFT] },
    margin: { left: 48, right: 48 },
  });

  /* ──────────────── 3. Cobertura geográfica ──────────────── */
  doc.addPage();
  drawHeader(doc, "Cobertura geográfica", monthLabel);

  doc.setTextColor(...C_INK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(
    "Se atendieron miscelaneas en los 5 municipios de la zona poniente del Valle de México.",
    48,
    130
  );

  // Simple bar chart by municipio (bultos)
  const munEntries = Object.entries(totals.porMunicipio).sort((a, b) => b[1].bultos - a[1].bultos);
  const maxB = Math.max(...munEntries.map(([, v]) => v.bultos), 1);
  const barsY = 170;
  const barH = 34;
  const barGap = 18;
  munEntries.forEach(([muni, v], i) => {
    const y = barsY + i * (barH + barGap);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...C_INK);
    doc.text(muni, 48, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...C_MUTED);
    doc.text(`${fmtInt(v.tiendas)} tiendas · ${fmtInt(v.bultos)} bultos`, 48, y + 14);
    const barW = (W - 96) * (v.bultos / maxB);
    doc.setFillColor(...C_BLUE_SOFT);
    doc.roundedRect(48, y + 18, W - 96, 12, 6, 6, "F");
    doc.setFillColor(...C_BLUE);
    doc.roundedRect(48, y + 18, Math.max(4, barW), 12, 6, 6, "F");
  });

  /* ──────────────── 4. Mezcla de producto ──────────────── */
  doc.addPage();
  drawHeader(doc, "Mezcla de producto", monthLabel);

  const brandEntries = Object.entries(totals.porMarca).sort((a, b) => b[1].bultos - a[1].bultos);
  autoTable(doc, {
    startY: 140,
    head: [["Marca", "Bultos", "% Bultos", "Importe", "% Importe"]],
    body: brandEntries.map(([brand, v]) => [
      brand,
      fmtInt(v.bultos),
      `${((v.bultos / totals.bultos) * 100).toFixed(1)}%`,
      fmtMXN(v.importe),
      `${((v.importe / totals.importe) * 100).toFixed(1)}%`,
    ]),
    styles: { fontSize: 10, cellPadding: 6, textColor: [...C_INK] },
    headStyles: { fillColor: [...C_BLUE], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [...C_BLUE_SOFT] },
    margin: { left: 48, right: 48 },
  });

  // Top 10 productos
  const byProduct = new Map<string, { piezas: number; importe: number; claveAdm: string }>();
  for (const r of rows) {
    const cur = byProduct.get(r.producto) || { piezas: 0, importe: 0, claveAdm: r.claveAdm };
    cur.piezas += r.piezas;
    cur.importe += r.importe;
    byProduct.set(r.producto, cur);
  }
  const topProducts = [...byProduct.entries()]
    .sort((a, b) => b[1].piezas - a[1].piezas)
    .slice(0, 10);

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 24,
    head: [["Top 10 productos", "Clave ADM", "Bultos", "Importe"]],
    body: topProducts.map(([name, v]) => [
      name,
      v.claveAdm,
      fmtInt(v.piezas),
      fmtMXN(v.importe),
    ]),
    styles: { fontSize: 9, cellPadding: 5, textColor: [...C_INK] },
    headStyles: { fillColor: [...C_INK], textColor: [255, 255, 255], fontStyle: "bold" },
    margin: { left: 48, right: 48 },
    columnStyles: {
      0: { cellWidth: 280 },
      1: { cellWidth: 70 },
      2: { halign: "right", cellWidth: 60 },
      3: { halign: "right" },
    },
  });

  /* ──────────────── 5. Detalle de ventas ──────────────── */
  doc.addPage("letter", "landscape");
  drawHeader(doc, "Detalle de ventas", monthLabel, true);

  autoTable(doc, {
    startY: 100,
    head: [[
      "Fecha", "Bodega", "Ruta", "Cliente",
      "Clave ADM", "Producto", "Piezas", "Precio", "Importe Total",
    ]],
    body: rows.map((r) => [
      r.fecha,
      r.bodega,
      r.ruta,
      viewMode === "code" ? r.claveCliente : r.cliente,
      r.claveAdm,
      r.producto,
      fmtInt(r.piezas),
      fmtMXN(r.precio),
      fmtMXN(r.importe),
    ]),
    foot: [[
      { content: "TOTAL", colSpan: 6, styles: { halign: "right", fontStyle: "bold" } },
      { content: fmtInt(totals.bultos), styles: { halign: "right", fontStyle: "bold" } },
      "",
      { content: fmtMXN(totals.importe), styles: { halign: "right", fontStyle: "bold" } },
    ]],
    styles: { fontSize: 7.5, cellPadding: 3, textColor: [...C_INK], lineColor: [...C_LINE], lineWidth: 0.3 },
    headStyles: { fillColor: [...C_BLUE], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    footStyles: { fillColor: [...C_BLUE_SOFT], textColor: [...C_INK] },
    alternateRowStyles: { fillColor: [250, 250, 252] },
    margin: { left: 24, right: 24 },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 80 },
      2: { cellWidth: 36 },
      3: { cellWidth: 160 },
      4: { cellWidth: 60 },
      5: { cellWidth: "auto" },
      6: { halign: "right", cellWidth: 44 },
      7: { halign: "right", cellWidth: 60 },
      8: { halign: "right", cellWidth: 76 },
    },
    didDrawPage: (data) => {
      // page footer
      doc.setFontSize(8);
      doc.setTextColor(...C_MUTED);
      doc.text(
        `Ventas — ${monthLabel}`,
        data.settings.margin.left,
        doc.internal.pageSize.getHeight() - 16
      );
      doc.text(
        `Pág. ${doc.getNumberOfPages()}`,
        doc.internal.pageSize.getWidth() - 60,
        doc.internal.pageSize.getHeight() - 16
      );
    },
  });

  /* ──────────────── 6. Indicadores del canal ──────────────── */
  doc.addPage("letter", "portrait");
  drawHeader(doc, "Indicadores del canal", monthLabel);

  autoTable(doc, {
    startY: 140,
    head: [["Indicador", "Valor"]],
    body: [
      ["Bultos vendidos", fmtInt(totals.bultos)],
      ["Importe total", fmtMXN(totals.importe)],
      ["Clientes atendidos", fmtInt(totals.tiendas)],
      [
        "Ticket promedio por tienda",
        fmtMXN(totals.importe / Math.max(1, totals.tiendas)),
      ],
      [
        "Bultos promedio por tienda",
        fmtInt(totals.bultos / Math.max(1, totals.tiendas)),
      ],
      [
        "Municipios cubiertos",
        fmtInt(Object.keys(totals.porMunicipio).length),
      ],
    ],
    styles: { fontSize: 11, cellPadding: 8, textColor: [...C_INK] },
    headStyles: { fillColor: [...C_BLUE], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [...C_BLUE_SOFT] },
    margin: { left: 48, right: 48 },
    columnStyles: {
      1: { halign: "right", fontStyle: "bold" },
    },
  });

  doc.setFontSize(10);
  doc.setTextColor(...C_MUTED);
  doc.text(
    [
      "• Base amplia de clientes — la concentración de riesgo por punto de venta es baja.",
      "• No se realizan entregas en sábado (política de cedis).",
    ].join("\n"),
    48,
    (doc as any).lastAutoTable.finalY + 28,
    { maxWidth: W - 96 }
  );

  /* ──────────────── 7. Metodología ──────────────── */
  doc.addPage();
  drawHeader(doc, "Metodología", monthLabel);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...C_INK);

  const universeMonth = universeSizeForMonth(year, month0);
  const methodology = [
    ["Clientes", `${fmtInt(UNIVERSE_SIZE)} miscelaneas atendidas en Naucalpan, Tlalnepantla, Atizapán, Huixquilucan y Cuautitlán Izcalli, con un promedio de 180 clientes por ruta por semana. Crecimiento 1.5% mensual.`],
    ["Clientes activos este mes", `${fmtInt(totals.tiendas)} de ${fmtInt(universeMonth)} (${Math.round((totals.tiendas / Math.max(1, universeMonth)) * 100)}%). El resto no recibió compra en el mes.`],
    ["Mezcla de producto", `La mezcla de SKU refleja las ventas reales entregadas en el mes (pedidos con estado Entregado).`],
    ["ID Cliente", `Código interno por municipio: NAU (Naucalpan), TLA (Tlalnepantla), ATI (Atizapán), HUI (Huixquilucan), CUA (Cuautitlán Izcalli) + consecutivo.`],
    ["Claves ADM", `Clave de producto del catálogo interno (formato MX######).`],
  ];

  let y = 130;
  for (const [label, body] of methodology) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C_BLUE);
    doc.setFontSize(11);
    doc.text(label, 48, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C_INK);
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(body, W - 96);
    doc.text(lines, 48, y);
    y += lines.length * 13 + 12;
  }

  return doc;
}

/* ──────────── helpers ──────────── */
function drawHeader(doc: jsPDF, title: string, subtitle: string, compact = false) {
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(...C_BLUE);
  doc.rect(0, 0, W, compact ? 60 : 80, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(compact ? 14 : 20);
  doc.text(title, 48, compact ? 28 : 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(compact ? 9 : 11);
  doc.text(subtitle, 48, compact ? 46 : 62);
}

function drawHero(doc: jsPDF, x: number, y: number, w: number, label: string, value: string) {
  doc.setDrawColor(...C_LINE);
  doc.setFillColor(...C_BLUE_SOFT);
  doc.roundedRect(x, y, w, 110, 12, 12, "F");
  doc.setTextColor(...C_MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(label.toUpperCase(), x + 16, y + 28, { charSpace: 1 });
  doc.setTextColor(...C_INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(value, x + 16, y + 72);
}

export function downloadVentasPdf(opts: GenerateOpts) {
  const doc = generateVentasPdf(opts);
  const name = `Ventas_${opts.year}-${String(opts.month0 + 1).padStart(2, "0")}.pdf`;
  doc.save(name);
}

// Re-export for callers
export type { SaleRow };
