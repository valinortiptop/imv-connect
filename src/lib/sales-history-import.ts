// @ts-nocheck
/**
 * Import de historial de ventas desde reportes NetSuite (SpreadsheetML XML .xls o XLSX).
 *
 * Columnas esperadas:
 *   Representante de ventas | Clase (laboratorio) | Cliente/proyecto |
 *   Número de documento | Fecha de creación | Artículo | Descripción del artículo |
 *   Cantidad vendida | Ingresos totales
 */

import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

export type SalesHistoryRow = {
  rep_name_raw: string | null;
  lab_name_raw: string | null;
  client_name_raw: string | null;
  invoice_no: string;
  invoice_date: string; // YYYY-MM-DD
  sku: string | null;
  description: string | null;
  quantity: number;
  revenue: number;
};

export type ImportSummary = {
  parsed: number;
  inserted: number;
  duplicated: number;
  errors: string[];
  batchId: string;
};

function norm(k: string): string {
  return String(k ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function toDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = String(v);
  // NetSuite format: "2026-04-22T00:00:00.000"
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // fallbacks: dd/mm/yyyy
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (dmy) {
    const y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${y}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function num(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const HEADER_ALIASES: Record<keyof SalesHistoryRow | "_rep" | "_lab" | "_client" | "_inv" | "_date" | "_sku" | "_desc" | "_qty" | "_rev", string[]> = {
  rep_name_raw: [],
  lab_name_raw: [],
  client_name_raw: [],
  invoice_no: [],
  invoice_date: [],
  sku: [],
  description: [],
  quantity: [],
  revenue: [],
  _rep: ["representante_de_ventas_nombre", "representante_de_ventas", "representante", "sales_rep"],
  _lab: ["clase_nombre", "clase", "laboratorio", "class"],
  _client: ["cliente_proyecto", "cliente", "client", "customer"],
  _inv: ["numero_de_documento", "documento", "invoice_no", "invoice", "factura", "folio"],
  _date: ["fecha_de_creacion", "fecha", "date", "invoice_date"],
  _sku: ["articulo", "sku", "clave", "item", "codigo"],
  _desc: ["descripcion_del_articulo", "descripcion", "description"],
  _qty: ["cantidad_vendida", "cantidad", "quantity", "qty"],
  _rev: ["ingresos_totales", "ingresos", "revenue", "total", "importe"],
};

function pickRaw(row: Record<string, unknown>, keys: string[]): string | undefined {
  const map: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) map[norm(k)] = v;
  for (const k of keys) {
    const v = map[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return undefined;
}

/** Detecta el rango con encabezados en un sheet de NetSuite y devuelve filas normalizadas. */
function extractRows(ws: XLSX.WorkSheet): Record<string, unknown>[] {
  // NetSuite exports drop header row(s) with company title/subtitle before the real
  // column headers. We probe several starting rows looking for the "Cliente/proyecto"
  // and "Ingresos totales" combo.
  const HEADERS = ["Representante de ventas: Nombre", "Clase: Nombre", "Cliente/proyecto", "Número de documento", "Fecha de creación", "Artículo", "Descripción del artículo", "Cantidad vendida", "Ingresos totales"];
  const raw = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" });
  let headerIdx = -1;
  for (let i = 0; i < Math.min(raw.length, 25); i++) {
    const row = (raw[i] || []).map((c) => String(c ?? "").trim());
    const joined = row.join("|").toLowerCase();
    if (joined.includes("cliente/proyecto") && joined.includes("ingresos")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

  const header = (raw[headerIdx] as any[]).map((c) => String(c ?? "").trim());
  const body = raw.slice(headerIdx + 1);
  const rows: Record<string, unknown>[] = [];
  for (const line of body) {
    const rec: Record<string, unknown> = {};
    for (let c = 0; c < header.length; c++) {
      const key = header[c] || `col_${c}`;
      rec[key] = (line as any[])[c];
    }
    rows.push(rec);
  }
  return rows;
}

export async function parseNetSuiteSalesFile(file: File): Promise<SalesHistoryRow[]> {
  const buf = await file.arrayBuffer();
  // xlsx handles both XLSX (zip) and legacy SpreadsheetML 2003 XML.
  const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
  const parsed: SalesHistoryRow[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const rows = extractRows(ws);
    for (const r of rows) {
      const invoice = pickRaw(r, HEADER_ALIASES._inv);
      const date = toDate(pickRaw(r, HEADER_ALIASES._date));
      if (!invoice || !date) continue;
      const sku = pickRaw(r, HEADER_ALIASES._sku);
      const qty = num(pickRaw(r, HEADER_ALIASES._qty));
      const rev = num(pickRaw(r, HEADER_ALIASES._rev));
      // Skip subtotal / grand total lines (no SKU + no rep)
      const rep = pickRaw(r, HEADER_ALIASES._rep);
      const client = pickRaw(r, HEADER_ALIASES._client);
      if (!sku && !rep && !client) continue;
      parsed.push({
        rep_name_raw: rep ?? null,
        lab_name_raw: pickRaw(r, HEADER_ALIASES._lab) ?? null,
        client_name_raw: client ?? null,
        invoice_no: invoice,
        invoice_date: date,
        sku: sku ?? null,
        description: pickRaw(r, HEADER_ALIASES._desc) ?? null,
        quantity: qty,
        revenue: rev,
      });
    }
  }
  return parsed;
}

export async function importSalesHistory(
  empresaId: string,
  rows: SalesHistoryRow[],
): Promise<ImportSummary> {
  const out: ImportSummary = {
    parsed: rows.length,
    inserted: 0,
    duplicated: 0,
    errors: [],
    batchId: crypto.randomUUID(),
  };
  if (!rows.length) return out;

  const chunk = 400;
  for (let i = 0; i < rows.length; i += chunk) {
    const batch = rows.slice(i, i + chunk).map((r) => ({
      ...r,
      empresa_id: empresaId,
      source: "netsuite",
      import_batch_id: out.batchId,
    }));
    const { data, error } = await supabase
      .from("sales_history" as any)
      .upsert(batch, {
        onConflict: "empresa_id,invoice_no,sku,client_name_raw,rep_name_raw",
        ignoreDuplicates: false,
      })
      .select("id");
    if (error) {
      out.errors.push(`Lote ${i}-${i + batch.length}: ${error.message}`);
      continue;
    }
    out.inserted += data?.length ?? 0;
  }
  out.duplicated = Math.max(0, out.parsed - out.inserted);
  return out;
}

/** Lista los lotes previamente importados, más recientes primero. */
export async function listSalesHistoryBatches(empresaId?: string) {
  let q = supabase
    .from("sales_history" as any)
    .select("import_batch_id, source, created_at, empresa_id");
  if (empresaId) q = q.eq("empresa_id", empresaId);
  const { data, error } = await q.limit(20000);
  if (error) throw error;
  const map = new Map<string, { batch_id: string; rows: number; first: string; last: string; source: string }>();
  for (const r of (data as any[]) || []) {
    const id = r.import_batch_id;
    if (!id) continue;
    const cur = map.get(id) || { batch_id: id, rows: 0, first: r.created_at, last: r.created_at, source: r.source };
    cur.rows += 1;
    if (r.created_at < cur.first) cur.first = r.created_at;
    if (r.created_at > cur.last) cur.last = r.created_at;
    map.set(id, cur);
  }
  return Array.from(map.values()).sort((a, b) => (b.last > a.last ? 1 : -1));
}

export async function deleteSalesHistoryBatch(batchId: string) {
  const { error } = await supabase
    .from("sales_history" as any)
    .delete()
    .eq("import_batch_id", batchId);
  if (error) throw error;
}
