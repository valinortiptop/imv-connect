// @ts-nocheck
/**
 * Helpers para importar catálogos y listas de precios desde XLSX/CSV
 * que el usuario sube en la pantalla de onboarding.
 *
 * - parseSheet(file): convierte cualquier XLSX/CSV en filas crudas.
 * - mapProductRow(row): mapea cabeceras en español a campos de `productos`.
 * - mapPriceRow(row): mapea cabeceras a { sku, price_with_iva }.
 */

import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

export type RawRow = Record<string, unknown>;

function norm(k: string): string {
  return String(k ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function pick(row: RawRow, keys: string[]): string | undefined {
  const map: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) map[norm(k)] = v;
  for (const k of keys) {
    const v = map[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  return undefined;
}

function num(v: string | undefined): number | null {
  if (v === undefined) return null;
  const n = Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export async function parseSheet(file: File): Promise<RawRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const all: RawRow[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<RawRow>(ws, { defval: "" });
    for (const r of rows) all.push(r);
  }
  return all;
}

export type ProductMapped = {
  sku: string;
  nombre: string;
  marca?: string;
  presentacion?: string;
  descripcion?: string;
  precio_lista?: number | null;
  costo?: number | null;
  costo_civa?: number | null;
  iva_pct?: number | null;
  peso_kg?: number | null;
  proveedor?: string;
  unidad?: string;
  linea?: string;
  grupo?: string;
  tipo_producto?: string;
  sat_clave?: string;
};

export function mapProductRow(row: RawRow): (ProductMapped & { categoria?: string }) | null {
  // Heurística para el formato "BG Cat productos":
  //   columna "Nombre"              → SKU
  //   columna "Nombre para mostrar" → nombre comercial
  //   columna "Clase"               → laboratorio/marca
  //   columna "Tipo de producto"    → categoría
  //   columna "Grupo"               → se anexa a descripción
  // Si la fila tiene "nombre_para_mostrar", asumimos ese formato.
  const hasDisplay = pick(row, ["nombre_para_mostrar", "display_name"]);
  let sku: string | undefined;
  let nombre: string | undefined;
  if (hasDisplay) {
    sku = pick(row, ["nombre", "sku", "clave", "codigo", "code"]);
    nombre = hasDisplay;
  } else {
    sku = pick(row, ["sku", "clave", "codigo", "code"]);
    nombre = pick(row, ["nombre", "producto", "descripcion_corta", "name"]);
  }
  if (!sku || !nombre) return null;

  const marca = pick(row, ["marca", "brand", "clase", "laboratorio", "lab"]);
  const categoria = pick(row, ["categoria", "tipo_de_producto", "tipo"]);
  const grupo = pick(row, ["grupo", "group"]);
  const descripcionBase = pick(row, ["descripcion", "description", "detalle"]);
  const descripcion =
    [descripcionBase, grupo].filter(Boolean).join(" — ") || undefined;

  // Derivar IVA desde el código SuiteTax si está disponible.
  const sat = pick(row, [
    "codigo_de_articulo_de_suitetax_latam_engine",
    "suitetax",
    "iva_label",
  ]);
  let ivaPct = num(pick(row, ["iva", "iva_pct"]));
  if (ivaPct === null && sat) {
    if (/iva\s*0/i.test(sat)) ivaPct = 0;
    else if (/iva\s*16/i.test(sat)) ivaPct = 16;
  }

  return {
    sku,
    nombre,
    marca,
    presentacion: pick(row, ["presentacion", "presentation"]),
    descripcion,
    categoria,
    precio_lista: num(pick(row, ["precio_lista", "precio", "precio_publico", "pvp", "price"])),
    costo: num(pick(row, ["costo", "costo_sin_iva", "costo_siva", "cost"])),
    costo_civa: num(pick(row, ["costo_con_iva", "costo_civa"])),
    iva_pct: ivaPct,
    peso_kg: num(pick(row, ["peso", "peso_kg", "weight_kg"])),
    proveedor: pick(row, ["proveedor", "supplier"]),
    unidad: pick(row, ["unidad", "unit"]),
    linea: pick(row, ["linea", "line"]),
    grupo,
    tipo_producto: categoria,
    sat_clave: pick(row, ["sat_clave_producto_servicio", "sat_clave", "clave_sat", "sat"]),
  };
}

export type PriceMapped = { sku: string; price_with_iva: number };

export function mapPriceRow(row: RawRow): PriceMapped | null {
  const sku = pick(row, ["sku", "clave", "codigo"]);
  const price = num(
    pick(row, ["precio_con_iva", "price_with_iva", "precio", "precio_lista", "pvp"]),
  );
  if (!sku || price === null) return null;
  return { sku, price_with_iva: price };
}

/* ───────────────────────── Imports ───────────────────────── */

export type ImportResult = {
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
};


/** Upsert masivo de productos por SKU. Crea laboratorios faltantes a partir de `marca`. */
export async function importProductos(rows: RawRow[]): Promise<ImportResult> {
  const out: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };
  const mapped = rows.map(mapProductRow).filter(Boolean) as Array<
    ProductMapped & { categoria?: string }
  >;
  if (mapped.length === 0) {
    out.errors.push("No se encontraron filas con SKU y nombre.");
    return out;
  }

  // 1) Asegurar laboratorios para cada `marca` única.
  const marcas = Array.from(
    new Set(mapped.map((m) => m.marca).filter(Boolean) as string[]),
  );
  if (marcas.length > 0) {
    const { data: existingLabs } = await supabase
      .from("laboratorios")
      .select("id,nombre")
      .in("nombre", marcas);
    const have = new Set((existingLabs ?? []).map((l) => l.nombre));
    const toInsert = marcas
      .filter((n) => !have.has(n))
      .map((nombre, i) => ({ nombre, activo: true, orden: (i + 1) * 10 }));
    if (toInsert.length > 0) {
      const { error } = await supabase.from("laboratorios").insert(toInsert);
      if (error) out.errors.push(`Laboratorios: ${error.message}`);
    }
  }
  const { data: allLabs } = await supabase.from("laboratorios").select("id,nombre");
  const labIdByNombre = new Map((allLabs ?? []).map((l) => [l.nombre, l.id]));

  // 2) Productos existentes para distinguir insert vs update.
  const skus = mapped.map((m) => m.sku);
  const { data: existing } = await supabase
    .from("productos")
    .select("id,sku")
    .in("sku", skus);
  const existingBySku = new Map((existing ?? []).map((r) => [r.sku, r.id]));

  for (const p of mapped) {
    const payload: Record<string, unknown> = {
      sku: p.sku,
      nombre: p.nombre,
      marca: p.marca ?? null,
      categoria: p.categoria ?? null,
      laboratorio_id: p.marca ? labIdByNombre.get(p.marca) ?? null : null,
      presentacion: p.presentacion ?? null,
      descripcion: p.descripcion ?? null,
      precio_lista: p.precio_lista ?? 0,
      costo: p.costo ?? null,
      costo_siva: p.costo ?? null,
      costo_civa: p.costo_civa ?? null,
      iva_pct: p.iva_pct ?? 16,
      peso_kg: p.peso_kg ?? null,
      proveedor: p.proveedor ?? null,
      unidad: p.unidad ?? "pieza",
      activo: true,
    };
    const id = existingBySku.get(p.sku);
    if (id) {
      const { error } = await supabase.from("productos").update(payload).eq("id", id);
      if (error) out.errors.push(`${p.sku}: ${error.message}`);
      else out.updated += 1;
    } else {
      const { error } = await supabase.from("productos").insert(payload);
      if (error) out.errors.push(`${p.sku}: ${error.message}`);
      else out.inserted += 1;
    }
  }
  return out;
}

/**
 * Upsert de items de una lista de precios. Si `listName` no existe se crea.
 * Solo importa filas cuyo SKU exista en `productos`.
 */
export async function importPriceList(
  listName: string,
  rows: RawRow[],
): Promise<ImportResult> {
  const out: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };
  const mapped = rows.map(mapPriceRow).filter(Boolean) as PriceMapped[];
  if (mapped.length === 0) {
    out.errors.push("No se encontraron filas con SKU y precio.");
    return out;
  }

  // Buscar o crear lista
  const { data: existingList } = await supabase
    .from("price_lists")
    .select("id")
    .eq("name", listName)
    .maybeSingle();
  let listId = existingList?.id as string | undefined;
  if (!listId) {
    const { data, error } = await supabase
      .from("price_lists")
      .insert({ name: listName, active: true, markup_pct: 0 })
      .select("id")
      .single();
    if (error || !data) {
      out.errors.push(`No se pudo crear lista: ${error?.message ?? "desconocido"}`);
      return out;
    }
    listId = data.id;
  }

  // Resolver SKUs → product_id
  const skus = mapped.map((m) => m.sku);
  const { data: prods } = await supabase
    .from("productos")
    .select("id,sku")
    .in("sku", skus);
  const idBySku = new Map((prods ?? []).map((p) => [p.sku, p.id]));

  // Items existentes en esta lista para distinguir insert/update
  const productIds = mapped
    .map((m) => idBySku.get(m.sku))
    .filter(Boolean) as string[];
  const { data: existingItems } = await supabase
    .from("price_list_items")
    .select("id,product_id")
    .eq("price_list_id", listId)
    .in("product_id", productIds);
  const itemByProduct = new Map(
    (existingItems ?? []).map((r) => [r.product_id, r.id]),
  );

  for (const p of mapped) {
    const productId = idBySku.get(p.sku);
    if (!productId) {
      out.skipped += 1;
      continue;
    }
    const itemId = itemByProduct.get(productId);
    if (itemId) {
      const { error } = await supabase
        .from("price_list_items")
        .update({ price_with_iva: p.price_with_iva, manual_override: true })
        .eq("id", itemId);
      if (error) out.errors.push(`${p.sku}: ${error.message}`);
      else out.updated += 1;
    } else {
      const { error } = await supabase.from("price_list_items").insert({
        price_list_id: listId,
        product_id: productId,
        price_with_iva: p.price_with_iva,
        manual_override: true,
      });
      if (error) out.errors.push(`${p.sku}: ${error.message}`);
      else out.inserted += 1;
    }
  }
  return out;
}

/* ───────────────────────── Clientes ───────────────────────── */

export type ClienteMapped = {
  razon_social: string;
  nombre_comercial?: string;
  rfc?: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  codigo_postal?: string;
  nombre_cfdi?: string;
  curp?: string;
  contact?: string;
  client_type?: string;
  payment_method?: string;
  payment_terms?: number | null;
  credit_limit?: number | null;
  central?: string;
  company?: string;
};

export function mapClienteRow(row: RawRow): ClienteMapped | null {
  const razon = pick(row, ["razon_social", "razon", "nombre", "cliente", "name"]);
  if (!razon) return null;
  return {
    razon_social: razon,
    nombre_comercial: pick(row, ["nombre_comercial", "comercial", "alias"]),
    rfc: pick(row, ["rfc"]),
    email: pick(row, ["email", "correo", "mail"]),
    telefono: pick(row, ["telefono", "tel", "phone", "celular"]),
    direccion: pick(row, ["direccion", "domicilio", "address"]),
    codigo_postal: pick(row, ["cp", "codigo_postal", "zip"]),
    nombre_cfdi: pick(row, ["nombre_cfdi", "razon_cfdi"]),
    curp: pick(row, ["curp"]),
    contact: pick(row, ["contacto", "contact"]),
    client_type: pick(row, ["tipo", "client_type", "tipo_cliente"]),
    payment_method: pick(row, ["forma_pago", "payment_method", "metodo_pago"]),
    payment_terms: num(pick(row, ["dias_credito", "credito", "payment_terms"])),
    credit_limit: num(pick(row, ["limite_credito", "credit_limit"])),
    central: pick(row, ["central"]),
    company: pick(row, ["empresa", "company"]),
  };
}

export async function importClientes(rows: RawRow[]): Promise<ImportResult> {
  const out: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };
  const mapped = rows.map(mapClienteRow).filter(Boolean) as ClienteMapped[];
  if (mapped.length === 0) {
    out.errors.push("No se encontraron filas con razón social.");
    return out;
  }

  const rfcs = mapped.map((m) => m.rfc).filter(Boolean) as string[];
  const { data: existingByRfc } = rfcs.length
    ? await supabase.from("clientes").select("id,rfc").in("rfc", rfcs)
    : { data: [] as { id: string; rfc: string }[] };
  const idByRfc = new Map((existingByRfc ?? []).map((r) => [r.rfc, r.id]));

  for (const c of mapped) {
    const payload: Record<string, unknown> = {
      razon_social: c.razon_social,
      nombre_comercial: c.nombre_comercial ?? null,
      rfc: c.rfc ?? null,
      email: c.email ?? null,
      telefono: c.telefono ?? null,
      direccion: c.direccion ?? null,
      codigo_postal: c.codigo_postal ?? null,
      nombre_cfdi: c.nombre_cfdi ?? null,
      curp: c.curp ?? null,
      contact: c.contact ?? null,
      client_type: c.client_type ?? "menudeo",
      payment_method: c.payment_method ?? null,
      payment_terms: c.payment_terms ?? null,
      credit_limit: c.credit_limit ?? null,
      central: c.central ?? null,
      company: c.company ?? null,
      active: true,
    };
    const id = c.rfc ? idByRfc.get(c.rfc) : undefined;
    if (id) {
      const { error } = await supabase.from("clientes").update(payload).eq("id", id);
      if (error) out.errors.push(`${c.razon_social}: ${error.message}`);
      else out.updated += 1;
    } else {
      const { error } = await supabase.from("clientes").insert(payload);
      if (error) out.errors.push(`${c.razon_social}: ${error.message}`);
      else out.inserted += 1;
    }
  }
  return out;
}

/* ───────────────────────── Laboratorios ───────────────────────── */

export async function importLaboratorios(rows: RawRow[]): Promise<ImportResult> {
  const out: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };
  const names: string[] = [];
  for (const r of rows) {
    const n = pick(r, ["nombre", "laboratorio", "lab", "proveedor", "name"]);
    if (n) names.push(n);
  }
  if (names.length === 0) {
    out.errors.push("No se encontraron filas con nombre de laboratorio.");
    return out;
  }
  const { data: existing } = await supabase
    .from("laboratorios")
    .select("id,nombre")
    .in("nombre", names);
  const have = new Set((existing ?? []).map((r) => r.nombre));
  let orden = (existing?.length ?? 0) * 10;
  for (const nombre of names) {
    if (have.has(nombre)) {
      out.updated += 0; // ya existe; lo contamos como omitido
      out.skipped += 1;
      continue;
    }
    orden += 10;
    const { error } = await supabase
      .from("laboratorios")
      .insert({ nombre, activo: true, orden });
    if (error) out.errors.push(`${nombre}: ${error.message}`);
    else out.inserted += 1;
    have.add(nombre);
  }
  return out;
}

/* ───────────────────────── Representantes ───────────────────────── */

export async function importRepresentantes(rows: RawRow[]): Promise<ImportResult> {
  const out: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };
  type Rep = { nombre: string; email?: string; telefono?: string; comision?: number | null };
  const mapped: Rep[] = [];
  for (const r of rows) {
    const nombre = pick(r, ["nombre", "name", "representante"]);
    if (!nombre) continue;
    mapped.push({
      nombre,
      email: pick(r, ["email", "correo"]),
      telefono: pick(r, ["telefono", "tel", "phone"]),
      comision: num(pick(r, ["comision", "comision_pct", "comision_default_pct"])),
    });
  }
  if (mapped.length === 0) {
    out.errors.push("No se encontraron filas con nombre de representante.");
    return out;
  }
  const emails = mapped.map((m) => m.email).filter(Boolean) as string[];
  const { data: existing } = emails.length
    ? await supabase.from("representantes").select("id,email").in("email", emails)
    : { data: [] as { id: string; email: string }[] };
  const idByEmail = new Map((existing ?? []).map((r) => [r.email, r.id]));
  for (const rep of mapped) {
    const payload: Record<string, unknown> = {
      nombre: rep.nombre,
      email: rep.email ?? null,
      telefono: rep.telefono ?? null,
      comision_default_pct: rep.comision ?? 0,
      activo: true,
    };
    const id = rep.email ? idByEmail.get(rep.email) : undefined;
    if (id) {
      const { error } = await supabase.from("representantes").update(payload).eq("id", id);
      if (error) out.errors.push(`${rep.nombre}: ${error.message}`);
      else out.updated += 1;
    } else {
      const { error } = await supabase.from("representantes").insert(payload);
      if (error) out.errors.push(`${rep.nombre}: ${error.message}`);
      else out.inserted += 1;
    }
  }
  return out;
}
