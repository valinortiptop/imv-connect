import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Row = (string | number)[];

const BRAND: [number, number, number] = [16, 74, 140];

function header(doc: jsPDF, title: string, meta: string[]) {
  doc.setFontSize(16);
  doc.setTextColor(...BRAND);
  doc.text("IMV · Integradora de Medicamentos Veterinarios", 40, 44);
  doc.setFontSize(13);
  doc.setTextColor(20);
  doc.text(title, 40, 64);
  doc.setFontSize(9);
  doc.setTextColor(90);
  let y = 82;
  for (const line of meta.filter(Boolean)) {
    doc.text(line, 40, y);
    y += 13;
  }
  return y + 6;
}

function table(doc: jsPDF, startY: number, head: string[], body: Row[]) {
  autoTable(doc, {
    startY,
    head: [head],
    body: body.map((r) => r.map((c) => (c == null ? "" : String(c)))),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: BRAND, textColor: 255 },
    theme: "grid",
  });
}

function output(doc: jsPDF, filename: string, mode: "download" | "print") {
  if (mode === "print") {
    doc.autoPrint();
    const url = doc.output("bloburl");
    window.open(url as unknown as string, "_blank");
  } else {
    doc.save(filename);
  }
}

const fmtDate = (d?: string | null) => (d ? String(d).slice(0, 10) : "—");

/* ------------------------------- Recepción ------------------------------- */
export type RecepcionPdfData = {
  folio: string;
  fecha?: string | null;
  oc_folio?: string | null;
  proveedor?: string | null;
  almacen?: string | null;
  factura_proveedor?: string | null;
  estado?: string | null;
  items: {
    clave?: string | null;
    articulo?: string | null;
    lote?: string | null;
    caducidad?: string | null;
    cantidad?: number | null;
    costo_unitario?: number | null;
  }[];
};

export function recepcionPdf(data: RecepcionPdfData, mode: "download" | "print" = "download") {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const y = header(doc, `Entrada de almacén ${data.folio}`, [
    `Fecha: ${fmtDate(data.fecha)}   ·   Orden de compra: ${data.oc_folio ?? "—"}   ·   Estado: ${data.estado ?? "registrada"}`,
    `Proveedor: ${data.proveedor ?? "—"}   ·   Almacén: ${data.almacen ?? "—"}   ·   Factura proveedor: ${data.factura_proveedor ?? "—"}`,
  ]);
  table(
    doc,
    y,
    ["Clave", "Descripción", "Lote", "Caducidad", "Cantidad", "Costo unit."],
    data.items.map((i) => [
      i.clave ?? "",
      i.articulo ?? "",
      i.lote ?? "—",
      fmtDate(i.caducidad),
      Number(i.cantidad ?? 0).toFixed(2),
      `$${Number(i.costo_unitario ?? 0).toFixed(2)}`,
    ]),
  );
  output(doc, `entrada-${data.folio}.pdf`, mode);
}

/* -------------------------------- Traspaso ------------------------------- */
export type TraspasoPdfData = {
  folio: string;
  fecha?: string | null;
  almacen_origen?: string | null;
  almacen_destino?: string | null;
  notas?: string | null;
  items: {
    clave?: string | null;
    articulo?: string | null;
    lote?: string | null;
    caducidad?: string | null;
    cantidad?: number | null;
  }[];
};

export function traspasoPdf(data: TraspasoPdfData, mode: "download" | "print" = "download") {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const y = header(doc, `Traspaso entre almacenes ${data.folio}`, [
    `Fecha: ${fmtDate(data.fecha)}`,
    `Almacén origen: ${data.almacen_origen ?? "—"}   →   Almacén destino: ${data.almacen_destino ?? "—"}`,
    data.notas ? `Notas: ${data.notas}` : "",
  ]);
  table(
    doc,
    y,
    ["Clave", "Descripción", "Lote", "Caducidad", "Cantidad"],
    data.items.map((i) => [
      i.clave ?? "",
      i.articulo ?? "",
      i.lote ?? "—",
      fmtDate(i.caducidad),
      Number(i.cantidad ?? 0).toFixed(2),
    ]),
  );
  output(doc, `traspaso-${data.folio}.pdf`, mode);
}

/* -------------------------------- Remisión ------------------------------- */
export type RemisionPdfData = {
  folio: string;
  fecha?: string | null;
  cliente?: string | null;
  pedido_folio?: string | null;
  almacen?: string | null;
  estado?: string | null;
  items: {
    clave?: string | null;
    articulo?: string | null;
    lote?: string | null;
    caducidad?: string | null;
    ubicacion?: string | null;
    cantidad?: number | null;
  }[];
};

export function remisionPdf(data: RemisionPdfData, mode: "download" | "print" = "download") {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const y = header(doc, `Remisión ${data.folio}`, [
    `Fecha: ${fmtDate(data.fecha)}   ·   Pedido: ${data.pedido_folio ?? "—"}   ·   Estado: ${data.estado ?? "emitida"}`,
    `Cliente: ${data.cliente ?? "—"}   ·   Almacén: ${data.almacen ?? "—"}`,
  ]);
  table(
    doc,
    y,
    ["Clave", "Artículo", "Cantidad", "Lote", "Caducidad", "Ubicación"],
    data.items.map((i) => [
      i.clave ?? "",
      i.articulo ?? "",
      Number(i.cantidad ?? 0).toFixed(2),
      i.lote ?? "—",
      fmtDate(i.caducidad),
      i.ubicacion ?? "—",
    ]),
  );
  const endY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text("Recibí de conformidad: ______________________________", 40, endY + 50);
  output(doc, `remision-${data.folio}.pdf`, mode);
}

/* -------------------------------- Reportes ------------------------------- */
export function reportePdf(
  title: string,
  head: string[],
  body: Row[],
  meta: string[] = [],
  mode: "download" | "print" = "download",
) {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "landscape" });
  const y = header(doc, title, [
    `Generado: ${new Date().toLocaleString("es-MX")}   ·   ${body.length} registros`,
    ...meta,
  ]);
  table(doc, y, head, body);
  output(doc, `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`, mode);
}
