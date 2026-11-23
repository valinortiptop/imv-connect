/**
 * Exportación estándar de listados a Excel y PDF (la usa BarraHerramientas).
 *
 * - Una página puede entregar sus datos completos (`TablaExport`), útil cuando
 *   la tabla está paginada o se muestra en tarjetas.
 * - Si no, se lee la tabla que está en pantalla debajo de la barra, con los
 *   filtros, búsqueda y orden que el usuario ve.
 *
 * Las celdas vacías se quedan vacías (nunca se convierten en 0) y los importes
 * con "$" se exportan como texto para no perder la moneda.
 */

export type Celda = string | number | null | undefined;
export type TablaExport = { columnas: string[]; filas: Celda[][] };
export type MetaExport = {
  titulo: string;
  /** Líneas de contexto: búsqueda y filtros activos. */
  filtros: string[];
};

const ZONA = "America/Mexico_City";

/** Fecha de hoy en Ciudad de México, YYYY-MM-DD. */
export function hoyCdmx(fecha = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(fecha);
}

export function fechaHoraCdmx(fecha = new Date()): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: ZONA, dateStyle: "medium", timeStyle: "short" }).format(fecha);
}

/** "Impuestos por producto" → "impuestos-por-producto_2026-11-23". */
export function nombreArchivo(titulo: string, fecha = new Date()): string {
  const base = titulo
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "exportacion";
  return `${base}_${hoyCdmx(fecha)}`;
}

/**
 * Texto de tabla → número sólo cuando es un número simple ("1,234", "-12.5").
 * Importes con "$", porcentajes, claves con ceros a la izquierda y fechas se
 * quedan como texto.
 */
export function aNumero(v: Celda): Celda {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (!/^-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(t)) return v;
  if (/^-?0\d/.test(t)) return v; // clave con ceros a la izquierda
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) && Math.abs(n) < 1e15 ? n : v;
}

const COLUMNAS_SIN_DATOS = /^(acciones|actions|opciones)$/i;

/**
 * Quita columnas sin encabezado (casillas, flechas, botones) o de acciones,
 * y filas que no tienen el mismo número de celdas (filas expandidas, "sin resultados").
 */
export function limpiarTabla(t: TablaExport): TablaExport {
  const n = t.columnas.length;
  const filas = t.filas.filter((f) => f.length === n);
  const conservar = t.columnas
    .map((c, i) => ({ c: c.trim(), i }))
    .filter(({ c }) => c !== "" && !COLUMNAS_SIN_DATOS.test(c));
  const usar = conservar.length ? conservar : t.columnas.map((c, i) => ({ c, i }));
  return {
    columnas: usar.map(({ c }) => c),
    filas: filas.map((f) => usar.map(({ i }) => f[i])),
  };
}

/** Helvetica (PDF) sólo cubre Latin-1: cambia símbolos comunes y quita el resto. */
export function textoPdf(v: Celda): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "number" ? v.toLocaleString("es-MX", { maximumFractionDigits: 6 }) : v;
  return s
    .replace(/[✓✔]/g, "Sí").replace(/[✗✘]/g, "No")
    .replace(/[−–]/g, "-").replace(/—/g, "-").replace(/…/g, "...")
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/›/g, ">").replace(/•/g, "·")
    .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, "")
    .replace(/\s+/g, " ").trim();
}

/* ───────────── Lectura de la tabla en pantalla ───────────── */

function textoDe(el: Element): string {
  let out = "";
  const sep = () => { if (out && !out.endsWith(" ")) out += " "; };
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) { out += (n.textContent ?? "").replace(/\s+/g, " "); return; }
    if (!(n instanceof HTMLElement)) return; // svg, comentarios
    if (n.getAttribute("aria-hidden") === "true" || n.dataset["exportar"] === "no") return;
    const tag = n.tagName;
    if (tag === "SELECT") { const s = n as HTMLSelectElement; sep(); out += s.selectedOptions[0]?.text ?? s.value; sep(); return; }
    if (tag === "INPUT") {
      const i = n as HTMLInputElement;
      if (!["checkbox", "radio", "hidden", "file", "button", "submit"].includes(i.type) && i.value) { sep(); out += i.value; sep(); }
      return;
    }
    if (tag === "TEXTAREA") { sep(); out += (n as HTMLTextAreaElement).value; sep(); return; }
    if (n.getAttribute("role") === "checkbox" || n.getAttribute("role") === "switch") return;
    sep();
    n.childNodes.forEach(walk);
    sep();
  };
  walk(el);
  return out.replace(/\s+/g, " ").trim();
}

/** Primera tabla que aparece después de `ancla` dentro de su sección. */
export function buscarTablaDespues(ancla: HTMLElement): HTMLTableElement | null {
  let el: HTMLElement | null = ancla.parentElement;
  while (el && el !== document.body) {
    const tablas = Array.from(el.querySelectorAll("table"));
    const t = tablas.find((tb) => !ancla.contains(tb) && (ancla.compareDocumentPosition(tb) & Node.DOCUMENT_POSITION_FOLLOWING));
    if (t) return t;
    el = el.parentElement;
  }
  return null;
}

export function tablaDesdeDom(table: HTMLTableElement): TablaExport {
  const filaEnc = table.tHead?.rows[table.tHead.rows.length - 1] ?? table.rows[0];
  if (!filaEnc) return { columnas: [], filas: [] };
  const columnas = Array.from(filaEnc.cells).map((c) => textoDe(c));
  const cuerpos = table.tBodies.length ? Array.from(table.tBodies).flatMap((b) => Array.from(b.rows)) : Array.from(table.rows).slice(1);
  const filas = cuerpos
    .filter((r) => r !== filaEnc && !Array.from(r.cells).some((c) => c.colSpan > 1))
    .map((r) => Array.from(r.cells).map((c) => aNumero(textoDe(c)) as Celda));
  return limpiarTabla({ columnas, filas });
}

/* ───────────── Descargas ───────────── */

export async function descargarExcel(tabla: TablaExport, meta: MetaExport): Promise<void> {
  const XLSX = await import("xlsx");
  const filas = tabla.filas.map((f) => f.map((v) => (v === undefined ? null : aNumero(v))));
  const ws = XLSX.utils.aoa_to_sheet([tabla.columnas, ...filas]);
  ws["!cols"] = tabla.columnas.map((c, i) => {
    const largo = Math.max(c.length, ...filas.slice(0, 300).map((f) => String(f[i] ?? "").length));
    return { wch: Math.min(60, Math.max(8, largo + 2)) };
  });
  if (tabla.filas.length) ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: filas.length, c: Math.max(0, tabla.columnas.length - 1) } }) };
  const info = XLSX.utils.aoa_to_sheet([
    ["Reporte", meta.titulo],
    ["Generado", `${fechaHoraCdmx()} (hora de Ciudad de México)`],
    ["Registros", tabla.filas.length],
    ...(meta.filtros.length ? meta.filtros.map((f, i) => [i === 0 ? "Filtros" : "", f]) : [["Filtros", "Ninguno"]]),
  ]);
  info["!cols"] = [{ wch: 12 }, { wch: 70 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, meta.titulo.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Datos");
  XLSX.utils.book_append_sheet(wb, info, "Información");
  XLSX.writeFile(wb, `${nombreArchivo(meta.titulo)}.xlsx`);
}

export async function descargarPdf(tabla: TablaExport, meta: MetaExport): Promise<void> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const horizontal = tabla.columnas.length > 5;
  const doc = new jsPDF({ orientation: horizontal ? "landscape" : "portrait", unit: "pt", format: "letter" });
  const ancho = doc.internal.pageSize.getWidth();
  const margen = 32;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(textoPdf(meta.titulo), margen, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100);
  const lineas = [
    `Generado ${textoPdf(fechaHoraCdmx())} (hora de Ciudad de México) · ${tabla.filas.length.toLocaleString("es-MX")} registros`,
    ...(meta.filtros.length ? [`Filtros: ${meta.filtros.join(" · ")}`] : []),
  ].flatMap((l) => doc.splitTextToSize(textoPdf(l), ancho - margen * 2) as string[]);
  doc.text(lineas, margen, 56);
  doc.setTextColor(0);

  const tamano = tabla.columnas.length > 10 ? 6.5 : tabla.columnas.length > 7 ? 7.5 : 8.5;
  autoTable(doc, {
    startY: 56 + lineas.length * 11 + 6,
    head: [tabla.columnas.map(textoPdf)],
    body: tabla.filas.map((f) => f.map(textoPdf)),
    margin: { left: margen, right: margen, bottom: 36 },
    styles: { fontSize: tamano, cellPadding: 3, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 246, 248] },
    columnStyles: Object.fromEntries(
      tabla.columnas.map((_, i) => [i, tabla.filas.slice(0, 200).every((f) => f[i] === null || f[i] === undefined || f[i] === "" || typeof f[i] === "number" || /^[-$\d.,\s%]+(MXN|USD)?$/.test(String(f[i]))) && tabla.filas.length ? { halign: "right" as const } : {}]),
    ),
    didDrawPage: () => {
      const alto = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(textoPdf(meta.titulo), margen, alto - 18);
      doc.text(`Página ${doc.getCurrentPageInfo().pageNumber}`, ancho - margen, alto - 18, { align: "right" });
      doc.setTextColor(0);
    },
  });
  doc.save(`${nombreArchivo(meta.titulo)}.pdf`);
}
