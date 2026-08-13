/**
 * Sincronización NetSuite → IMV (solo lectura, solo servidor).
 *
 * Cada entidad se ejecuta como un "run" que queda registrado en
 * `netsuite_sync_runs` con contadores, errores y filas no emparejadas.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { suiteqlAll } from "./netsuite.server";
import { normalizeName } from "./backfill-sales.server";

export type NetsuiteEntity = "ventas" | "clientes" | "productos" | "inventario";

export type SyncResult = {
  run_id: string | null;
  entity: NetsuiteEntity;
  status: "ok" | "error";
  rows_read: number;
  rows_inserted: number;
  rows_updated: number;
  rows_skipped: number;
  errors: string[];
  unmatched: string[];
  duration_ms: number;
};

const SOURCE = "netsuite_api";

function sqlDate(d: string): string {
  return `TO_DATE('${d}', 'YYYY-MM-DD')`;
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  return String(v ?? "").trim();
}

/** Fecha NetSuite (p.ej. "13/8/2026" o ISO) → YYYY-MM-DD */
function toISODate(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

async function startRun(
  entity: NetsuiteEntity,
  triggerSource: string,
  range?: { from?: string; to?: string },
  triggeredBy?: string | null,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("netsuite_sync_runs")
    .insert({
      entity,
      status: "running",
      trigger_source: triggerSource,
      date_from: range?.from ?? null,
      date_to: range?.to ?? null,
      triggered_by: triggeredBy ?? null,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[netsuite] no se pudo crear el run", error.message);
    return null;
  }
  return (data as { id: string }).id;
}

async function finishRun(runId: string | null, res: SyncResult) {
  if (!runId) return;
  await supabaseAdmin
    .from("netsuite_sync_runs")
    .update({
      status: res.status,
      rows_read: res.rows_read,
      rows_inserted: res.rows_inserted,
      rows_updated: res.rows_updated,
      rows_skipped: res.rows_skipped,
      errors: res.errors.slice(0, 200),
      unmatched: res.unmatched.slice(0, 500),
      finished_at: new Date().toISOString(),
      duration_ms: res.duration_ms,
    })
    .eq("id", runId);
}

async function defaultEmpresaId(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("empresas")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);
  return (data?.[0] as { id: string } | undefined)?.id ?? null;
}

/* ───────────────────────────── CLIENTES ───────────────────────────── */

async function syncClientes(res: SyncResult) {
  const rows = await suiteqlAll<Record<string, unknown>>(
    `SELECT id, entityid, companyname, altname, email, phone, isinactive
       FROM customer`,
    { pageSize: 1000 },
  );
  res.rows_read = rows.length;
  if (!rows.length) return;

  const { data: existing } = await supabaseAdmin
    .from("clientes")
    .select("id, netsuite_id, razon_social")
    .limit(100000);
  const byNs = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const c of (existing ?? []) as {
    id: string;
    netsuite_id: string | null;
    razon_social: string | null;
  }[]) {
    if (c.netsuite_id) byNs.set(c.netsuite_id, c.id);
    if (c.razon_social) byName.set(normalizeName(c.razon_social), c.id);
  }

  const inserts: Record<string, unknown>[] = [];
  for (const r of rows) {
    const nsId = str(r["id"]);
    if (!nsId) continue;
    const name = str(r["companyname"]) || str(r["altname"]) || str(r["entityid"]);
    if (!name) {
      res.rows_skipped++;
      continue;
    }
    const patch = {
      netsuite_id: nsId,
      razon_social: name,
      nickname: str(r["entityid"]) || null,
      email: str(r["email"]) || null,
      telefono: str(r["phone"]) || null,
      active: str(r["isinactive"]).toUpperCase() !== "T",
    };
    const known = byNs.get(nsId) ?? byName.get(normalizeName(name));
    if (known) {
      const { error } = await supabaseAdmin
        .from("clientes")
        .update(patch)
        .eq("id", known);
      if (error) res.errors.push(`cliente ${nsId}: ${error.message}`);
      else res.rows_updated++;
    } else {
      inserts.push({
        ...patch,
        client_type: "menudeo",
        notas: "Creado por sincronización NetSuite",
      });
    }
  }

  for (let i = 0; i < inserts.length; i += 300) {
    const chunk = inserts.slice(i, i + 300);
    const { data, error } = await supabaseAdmin
      .from("clientes")
      .insert(chunk)
      .select("id");
    if (error) res.errors.push(`insert clientes: ${error.message}`);
    else res.rows_inserted += data?.length ?? 0;
  }
}

/* ───────────────────────────── PRODUCTOS ───────────────────────────── */

async function syncProductos(res: SyncResult) {
  const rows = await suiteqlAll<Record<string, unknown>>(
    `SELECT id, itemid, displayname, description, isinactive
       FROM item`,
    { pageSize: 1000 },
  );
  res.rows_read = rows.length;
  if (!rows.length) return;

  // Precios (nivel base). Si la cuenta no expone `pricing`, se registra y sigue.
  const priceByItem = new Map<string, number>();
  try {
    const prices = await suiteqlAll<Record<string, unknown>>(
      `SELECT item, unitprice FROM pricing WHERE pricelevel = 1`,
      { pageSize: 1000 },
    );
    for (const p of prices) {
      const item = str(p["item"]);
      if (item) priceByItem.set(item, num(p["unitprice"]));
    }
  } catch (e) {
    res.errors.push(
      `precios no disponibles: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const { data: existing } = await supabaseAdmin
    .from("productos")
    .select("id, netsuite_id, sku")
    .limit(100000);
  const byNs = new Map<string, string>();
  const bySku = new Map<string, string>();
  for (const p of (existing ?? []) as {
    id: string;
    netsuite_id: string | null;
    sku: string | null;
  }[]) {
    if (p.netsuite_id) byNs.set(p.netsuite_id, p.id);
    if (p.sku) bySku.set(p.sku.trim().toUpperCase(), p.id);
  }

  const inserts: Record<string, unknown>[] = [];
  for (const r of rows) {
    const nsId = str(r["id"]);
    const sku = str(r["itemid"]);
    if (!nsId || !sku) {
      res.rows_skipped++;
      continue;
    }
    const nombre = str(r["displayname"]) || sku;
    const precio = priceByItem.get(nsId);
    const patch: Record<string, unknown> = {
      netsuite_id: nsId,
      sku,
      nombre,
      descripcion: str(r["description"]) || null,
      activo: str(r["isinactive"]).toUpperCase() !== "T",
    };
    if (precio != null && precio > 0) patch["precio_lista"] = precio;

    const known = byNs.get(nsId) ?? bySku.get(sku.toUpperCase());
    if (known) {
      const { error } = await supabaseAdmin
        .from("productos")
        .update(patch)
        .eq("id", known);
      if (error) res.errors.push(`producto ${sku}: ${error.message}`);
      else res.rows_updated++;
    } else {
      inserts.push(patch);
    }
  }

  for (let i = 0; i < inserts.length; i += 300) {
    const chunk = inserts.slice(i, i + 300);
    const { data, error } = await supabaseAdmin
      .from("productos")
      .insert(chunk)
      .select("id");
    if (error) res.errors.push(`insert productos: ${error.message}`);
    else res.rows_inserted += data?.length ?? 0;
  }
}

/* ──────────────────────────── INVENTARIO ──────────────────────────── */

async function loadProductIndex() {
  const { data } = await supabaseAdmin
    .from("productos")
    .select("id, netsuite_id, sku")
    .limit(100000);
  const byNs = new Map<string, string>();
  const bySku = new Map<string, string>();
  for (const p of (data ?? []) as {
    id: string;
    netsuite_id: string | null;
    sku: string | null;
  }[]) {
    if (p.netsuite_id) byNs.set(p.netsuite_id, p.id);
    if (p.sku) bySku.set(p.sku.trim().toUpperCase(), p.id);
  }
  const { data: aliases } = await supabaseAdmin
    .from("sku_aliases")
    .select("alias_clave, product_id")
    .limit(100000);
  for (const a of (aliases ?? []) as {
    alias_clave: string | null;
    product_id: string | null;
  }[]) {
    if (a.alias_clave && a.product_id) {
      bySku.set(a.alias_clave.trim().toUpperCase(), a.product_id);
    }
  }
  return { byNs, bySku };
}

async function loadAlmacenIndex() {
  const { data } = await supabaseAdmin
    .from("almacenes")
    .select("id, nombre, codigo, principal")
    .limit(1000);
  const byName = new Map<string, string>();
  let principal: string | null = null;
  for (const a of (data ?? []) as {
    id: string;
    nombre: string | null;
    codigo: string | null;
    principal: boolean | null;
  }[]) {
    if (a.nombre) byName.set(normalizeName(a.nombre), a.id);
    if (a.codigo) byName.set(normalizeName(a.codigo), a.id);
    if (a.principal) principal = a.id;
  }
  return { byName, principal };
}

async function syncInventario(res: SyncResult) {
  const { byNs, bySku } = await loadProductIndex();
  const { byName: almByName, principal } = await loadAlmacenIndex();

  const rows = await suiteqlAll<Record<string, unknown>>(
    `SELECT iil.item AS item_id,
            BUILTIN.DF(iil.location) AS location_name,
            iil.quantityonhand AS qty
       FROM inventoryitemlocations iil`,
    { pageSize: 1000 },
  );
  res.rows_read = rows.length;

  const unmatchedLocations = new Set<string>();
  for (const r of rows) {
    const productId = byNs.get(str(r["item_id"]));
    if (!productId) {
      res.rows_skipped++;
      continue;
    }
    const locName = str(r["location_name"]);
    const almacenId = almByName.get(normalizeName(locName)) ?? principal;
    if (!almacenId) {
      if (locName) unmatchedLocations.add(`almacén desconocido: ${locName}`);
      res.rows_skipped++;
      continue;
    }
    if (locName && !almByName.has(normalizeName(locName))) {
      unmatchedLocations.add(`almacén sin mapeo (usó principal): ${locName}`);
    }
    const { error } = await supabaseAdmin
      .from("stock")
      .upsert(
        {
          producto_id: productId,
          almacen_id: almacenId,
          cantidad: num(r["qty"]),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "producto_id,almacen_id" },
      );
    if (error) res.errors.push(`stock ${productId}: ${error.message}`);
    else res.rows_updated++;
  }

  // Lotes (números de inventario). Opcional: si la cuenta no los usa, se omite.
  try {
    const lots = await suiteqlAll<Record<string, unknown>>(
      `SELECT inv.item AS item_id,
              inv.inventorynumber AS lote,
              inv.expirationdate AS caducidad,
              BUILTIN.DF(invloc.location) AS location_name,
              invloc.quantityonhand AS qty
         FROM inventorynumber inv
         JOIN inventorynumberlocation invloc ON invloc.inventorynumber = inv.id`,
      { pageSize: 1000 },
    );
    for (const l of lots) {
      const productId =
        byNs.get(str(l["item_id"])) ?? bySku.get(str(l["item_id"]).toUpperCase());
      const lote = str(l["lote"]);
      if (!productId || !lote) {
        res.rows_skipped++;
        continue;
      }
      const almacenId =
        almByName.get(normalizeName(str(l["location_name"]))) ?? principal;
      if (!almacenId) {
        res.rows_skipped++;
        continue;
      }
      const payload = {
        producto_id: productId,
        almacen_id: almacenId,
        lote,
        caducidad: toISODate(l["caducidad"]),
        cantidad: num(l["qty"]),
      };
      const { data: found } = await supabaseAdmin
        .from("product_batches")
        .select("id")
        .eq("producto_id", productId)
        .eq("almacen_id", almacenId)
        .eq("lote", lote)
        .limit(1);
      const hit = (found?.[0] as { id: string } | undefined)?.id;
      if (hit) {
        const { error } = await supabaseAdmin
          .from("product_batches")
          .update({ cantidad: payload.cantidad, caducidad: payload.caducidad })
          .eq("id", hit);
        if (error) res.errors.push(`lote ${lote}: ${error.message}`);
        else res.rows_updated++;
      } else {
        const { error } = await supabaseAdmin
          .from("product_batches")
          .insert(payload);
        if (error) res.errors.push(`lote ${lote}: ${error.message}`);
        else res.rows_inserted++;
      }
    }
  } catch (e) {
    res.errors.push(
      `lotes no disponibles: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  res.unmatched.push(...unmatchedLocations);
}

/* ────────────────────────────── VENTAS ────────────────────────────── */

async function syncVentas(
  res: SyncResult,
  range: { from: string; to: string },
) {
  const { byNs: prodByNs, bySku } = await loadProductIndex();
  const empresaId = await defaultEmpresaId();

  const { data: clientRows } = await supabaseAdmin
    .from("clientes")
    .select("id, netsuite_id, razon_social")
    .limit(100000);
  const cliByNs = new Map<string, string>();
  const cliByName = new Map<string, string>();
  for (const c of (clientRows ?? []) as {
    id: string;
    netsuite_id: string | null;
    razon_social: string | null;
  }[]) {
    if (c.netsuite_id) cliByNs.set(c.netsuite_id, c.id);
    if (c.razon_social) cliByName.set(normalizeName(c.razon_social), c.id);
  }

  const rows = await suiteqlAll<Record<string, unknown>>(
    `SELECT t.id            AS tran_id,
            t.tranid        AS invoice_no,
            t.trandate      AS invoice_date,
            t.entity        AS customer_id,
            BUILTIN.DF(t.entity) AS customer_name,
            tl.uniquekey    AS line_id,
            tl.item         AS item_id,
            BUILTIN.DF(tl.item) AS item_name,
            tl.quantity     AS quantity,
            tl.netamount    AS revenue,
            tl.memo         AS memo
       FROM transaction t
       JOIN transactionline tl ON tl.transaction = t.id
      WHERE t.type = 'CustInvc'
        AND tl.mainline = 'F'
        AND tl.taxline = 'F'
        AND tl.item IS NOT NULL
        AND t.trandate >= ${sqlDate(range.from)}
        AND t.trandate <= ${sqlDate(range.to)}`,
    { pageSize: 1000 },
  );
  res.rows_read = rows.length;
  if (!rows.length) return;

  const unmatched = new Set<string>();
  const payloads: Record<string, unknown>[] = [];

  for (const r of rows) {
    const lineId = str(r["line_id"]);
    const invoiceDate = toISODate(r["invoice_date"]);
    if (!lineId || !invoiceDate) {
      res.rows_skipped++;
      continue;
    }
    const nsItem = str(r["item_id"]);
    const itemName = str(r["item_name"]);
    const sku = itemName.split(":").pop()?.trim() ?? itemName;
    const productId =
      prodByNs.get(nsItem) ?? bySku.get(sku.toUpperCase()) ?? null;
    if (!productId) {
      unmatched.add(`SKU sin producto: ${itemName || nsItem}`);
      res.rows_skipped++;
      continue;
    }
    const customerName = str(r["customer_name"]);
    const clientId =
      cliByNs.get(str(r["customer_id"])) ??
      cliByName.get(normalizeName(customerName.replace(/^\d+\s+/, ""))) ??
      null;
    if (!clientId) unmatched.add(`Cliente sin coincidencia: ${customerName}`);

    payloads.push({
      empresa_id: empresaId,
      source: SOURCE,
      netsuite_line_id: lineId,
      netsuite_tran_id: str(r["tran_id"]),
      invoice_no: str(r["invoice_no"]),
      invoice_date: invoiceDate,
      client_name_raw: customerName || null,
      client_id: clientId,
      sku,
      product_id: productId,
      description: str(r["memo"]) || itemName || null,
      quantity: Math.abs(num(r["quantity"])),
      revenue: Math.abs(num(r["revenue"])),
    });
  }

  for (let i = 0; i < payloads.length; i += 500) {
    const chunk = payloads.slice(i, i + 500);
    const { data, error } = await supabaseAdmin
      .from("sales_history")
      .upsert(chunk, { onConflict: "netsuite_line_id" })
      .select("id");
    if (error) res.errors.push(`upsert ventas: ${error.message}`);
    else res.rows_inserted += data?.length ?? 0;
  }

  res.unmatched.push(...unmatched);
}

/* ────────────────────────────── RUNNER ────────────────────────────── */

export async function runNetsuiteSync(opts: {
  entity: NetsuiteEntity;
  from?: string;
  to?: string;
  triggerSource?: string;
  triggeredBy?: string | null;
}): Promise<SyncResult> {
  const t0 = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const from = opts.from ?? today;
  const to = opts.to ?? today;
  const isVentas = opts.entity === "ventas";

  const res: SyncResult = {
    run_id: null,
    entity: opts.entity,
    status: "ok",
    rows_read: 0,
    rows_inserted: 0,
    rows_updated: 0,
    rows_skipped: 0,
    errors: [],
    unmatched: [],
    duration_ms: 0,
  };

  res.run_id = await startRun(
    opts.entity,
    opts.triggerSource ?? "manual",
    isVentas ? { from, to } : undefined,
    opts.triggeredBy ?? null,
  );

  try {
    if (opts.entity === "ventas") await syncVentas(res, { from, to });
    else if (opts.entity === "clientes") await syncClientes(res);
    else if (opts.entity === "productos") await syncProductos(res);
    else if (opts.entity === "inventario") await syncInventario(res);
    if (res.errors.length) res.status = "ok";
  } catch (e) {
    res.status = "error";
    res.errors.push(e instanceof Error ? e.message : String(e));
  }

  res.duration_ms = Date.now() - t0;
  await finishRun(res.run_id, res);
  return res;
}
