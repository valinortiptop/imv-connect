// @ts-nocheck
/**
 * CFDI Parser — extracts fiscal data from SAT "Constancia de Situación Fiscal" PDFs.
 *
 * Uses pdfjs-dist to extract text client-side, then parses the predictable
 * SAT table layout with regex to pull RFC, CURP, name, address, CP, and régimen fiscal.
 */

import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface CfdiData {
  rfc: string;
  curp: string;
  nombre: string;        // Nombre(s)
  primerApellido: string;
  segundoApellido: string;
  razonSocial: string;   // Full name assembled
  codigoPostal: string;
  direccion: string;     // Full address assembled
  regimenFiscal: string;
}

/**
 * Extract all text from a PDF file, page by page.
 */
async function extractText(file: File): Promise<string[]> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[] = [];

  // Read first 2-3 pages (page 1 = identity + address, page 2 = régimen)
  const maxPages = Math.min(pdf.numPages, 3);
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: any) => item.str)
      .join(" ");
    pages.push(text);
  }

  return pages;
}

/**
 * Convert ALL CAPS text to Title Case.
 * Keeps small words (de, del, la, el, y, e, en) lowercase unless first word.
 */
function toTitleCase(str: string): string {
  if (!str) return str;
  const small = new Set(["de", "del", "la", "las", "el", "los", "y", "e", "en", "a", "o", "u"]);
  return str
    .toLowerCase()
    .split(" ")
    .map((word, i) => {
      if (i > 0 && small.has(word)) return word;
      if (!word) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/**
 * Find a value that follows a label in text.
 * The SAT PDF renders as: "Label:" followed by the value text.
 */
function after(text: string, label: string): string {
  const idx = text.indexOf(label);
  if (idx === -1) return "";

  const rest = text.substring(idx + label.length).trim();
  // Take until the next known label or end of reasonable length
  const match = rest.match(/^([^:]{1,80}?)(?:\s{2,}|\s*(?:RFC|CURP|Nombre|Primer|Segundo|Fecha|Estatus|Nombre Comercial|Código Postal|Tipo de Vialidad|Nombre de Vialidad|Número|Entre Calle|Datos del domicilio))/i);
  if (match) return match[1].trim();

  // Fallback: grab first chunk
  const simple = rest.split(/\s{3,}/)[0];
  return simple?.trim().substring(0, 80) || "";
}

/**
 * Parse the extracted text into structured CFDI data.
 */
function parseText(pages: string[]): CfdiData {
  const fullText = pages.join(" ");

  // === Page 1: Identity ===
  const rfcMatch = fullText.match(/RFC:\s*([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})/i);
  const rfc = rfcMatch?.[1]?.toUpperCase() ?? "";

  const curpMatch = fullText.match(/CURP:\s*([A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d)/i);
  const curp = curpMatch?.[1]?.toUpperCase() ?? "";

  // Name fields
  const nombre = after(fullText, "Nombre (s):") || after(fullText, "Nombre(s):");
  const primerApellido = after(fullText, "Primer Apellido:");
  const segundoApellido = after(fullText, "Segundo Apellido:");

  const parts = [nombre, primerApellido, segundoApellido].filter(Boolean).map(toTitleCase);
  const razonSocial = parts.join(" ");

  // === Page 1: Address ===
  const cpMatch = fullText.match(/Código Postal[:\s]*(\d{4,5})/i);
  const codigoPostal = cpMatch?.[1] ?? "";

  const tipoVialidad = after(fullText, "Tipo de Vialidad:");
  const nombreVialidad = after(fullText, "Nombre de Vialidad:");
  const numExterior = after(fullText, "Número Exterior:");
  const numInterior = after(fullText, "Número Interior:");
  const colonia = after(fullText, "Nombre de la Colonia:");
  const municipio = after(fullText, "Nombre del Municipio o Demarcación Territorial:") ||
                     after(fullText, "Demarcación Territorial:");
  const entidad = after(fullText, "Nombre de la Entidad Federativa:");

  const addrParts: string[] = [];
  if (nombreVialidad) {
    const street = tipoVialidad
      ? `${toTitleCase(tipoVialidad)} ${toTitleCase(nombreVialidad)}`
      : toTitleCase(nombreVialidad);
    addrParts.push(street);
  }
  if (numExterior && numExterior !== "SIN NUMERO") addrParts.push(numExterior);
  if (numInterior && numInterior !== "SIN NUMERO") addrParts.push(`Int. ${numInterior}`);
  if (colonia) addrParts.push(toTitleCase(colonia));
  if (municipio) addrParts.push(toTitleCase(municipio));
  if (entidad) addrParts.push(toTitleCase(entidad));

  const direccion = addrParts.join(", ");

  // === Page 2+: Régimen Fiscal ===
  let regimenFiscal = "";
  const regimenPatterns = [
    /Régimen Simplificado de Confianza/i,
    /Régimen de Incorporación Fiscal/i,
    /Actividades Empresariales y Profesionales/i,
    /Actividad Empresarial/i,
    /Régimen de las Actividades Empresariales/i,
    /Personas Físicas con Actividades Empresariales/i,
    /Persona [Ff]ísica/i,
    /Persona [Mm]oral/i,
    /Régimen General de Ley Personas Morales/i,
  ];

  for (const pattern of regimenPatterns) {
    const m = fullText.match(pattern);
    if (m) {
      regimenFiscal = m[0];
      break;
    }
  }

  if (!regimenFiscal) {
    const genericMatch = fullText.match(/Régimen\s+(?:de\s+)?[A-ZÁÉÍÓÚÑa-záéíóúñ\s]{5,60}/);
    if (genericMatch) {
      regimenFiscal = genericMatch[0].trim();
    }
  }

  return {
    rfc,
    curp,
    nombre: toTitleCase(nombre),
    primerApellido: toTitleCase(primerApellido),
    segundoApellido: toTitleCase(segundoApellido),
    razonSocial,
    codigoPostal,
    direccion,
    regimenFiscal,
  };
}

/**
 * Main entry: parse a CFDI PDF file and return structured data.
 */
export async function parseCfdiPdf(file: File): Promise<CfdiData> {
  const pages = await extractText(file);
  return parseText(pages);
}
