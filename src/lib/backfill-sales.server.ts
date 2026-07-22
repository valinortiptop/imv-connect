// Server-only helpers for the 2026 NetSuite sales backfill.
// Kept in a separate `.server.ts` file so `.functions.ts` handlers stay thin
// wrappers and the tss-serverfn splitter does not lose the helpers.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const BACKFILL_TAG = "netsuite_2026";

export type BackfillLine = {
  sku: string;
  description: string | null;
  quantity: number;
  revenue: number;
};

export type BackfillInvoice = {
  invoice_no: string;
  invoice_date: string; // YYYY-MM-DD
  rep_name: string | null;
  client_name: string | null; // "1471 NANCY M YAÑEZ SILVA"
  lab_name: string | null;
  lines: BackfillLine[];
};

export type BackfillCounters = {
  processed_invoices: number;
  created_pedidos: number;
  skipped_existing: number;
  created_pedido_items: number;
  created_facturas: number;
  created_factura_items: number;
  created_client_stubs: number;
  created_product_stubs: number;
  created_rep_stubs: number;
  errors: string[];
};

export function stripClientPrefix(raw: string | null | undefined): {
  clean: string;
  netsuiteId: string | null;
} {
  const s = String(raw ?? "").trim();
  if (!s) return { clean: "", netsuiteId: null };
  const m = s.match(/^(\d{2,8})\s+(.+)$/);
  if (m) return { clean: m[2].trim(), netsuiteId: m[1] };
  return { clean: s, netsuiteId: null };
}

export function normalizeName(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

async function loadInBatches<T>(
  keys: string[],
  loader: (batch: string[]) => Promise<T[]>,
): Promise<T[]> {
  const acc: T[] = [];
  for (let i = 0; i < keys.length; i += 500) {
    const b = keys.slice(i, i + 500);
    if (b.length === 0) continue;
    const rows = await loader(b);
    acc.push(...rows);
  }
  return acc;
}

export async function runNetsuiteBackfillChunk(
  invoices: BackfillInvoice[],
): Promise<BackfillCounters> {
  const out: BackfillCounters = {
    processed_invoices: 0,
    created_pedidos: 0,
    skipped_existing: 0,
    created_pedido_items: 0,
    created_facturas: 0,
    created_factura_items: 0,
    created_client_stubs: 0,
    created_product_stubs: 0,
    created_rep_stubs: 0,
    errors: [],
  };
  if (!invoices?.length) return out;

  const clientKeyToInfo = new Map<
    string,
    { clean: string; netsuiteId: string | null }
  >();
  const skus = new Set<string>();
  const skuToDesc = new Map<string, string>();
  const reps = new Set<string>();

  for (const inv of invoices) {
    const { clean, netsuiteId } = stripClientPrefix(inv.client_name);
    if (clean) clientKeyToInfo.set(normalizeName(clean), { clean, netsuiteId });
    const rep = (inv.rep_name ?? "").trim();
    if (rep) reps.add(normalizeName(rep));
    for (const l of inv.lines) {
      const sku = (l.sku ?? "").trim();
      if (sku) {
        skus.add(sku);
        if (l.description && !skuToDesc.has(sku)) skuToDesc.set(sku, l.description);
      }
    }
  }

  const clientCleanNames = Array.from(clientKeyToInfo.values()).map((x) => x.clean);
  const repRawSet = new Set<string>();
  for (const inv of invoices) if (inv.rep_name) repRawSet.add(inv.rep_name.trim());
  const repRaw = Array.from(repRawSet);
  const skuList = Array.from(skus);

  const clientRows = await loadInBatches(clientCleanNames, async (batch) => {
    const { data, error } = await supabaseAdmin
      .from("clientes")
      .select("id, razon_social")
      .in("razon_social", batch);
    if (error) throw error;
    return data ?? [];
  });
  const clientMap = new Map<string, string>();
  for (const r of clientRows) clientMap.set(normalizeName(r.razon_social), r.id);

  const missingClients = Array.from(clientKeyToInfo.entries())
    .filter(([k]) => !clientMap.has(k))
    .map(([k, v]) => ({ key: k, clean: v.clean, netsuiteId: v.netsuiteId }));
  if (missingClients.length) {
    const payload = missingClients.map((m) => ({
      razon_social: m.clean,
      nickname: m.netsuiteId,
      client_type: "menudeo",
      active: true,
      notas: `Auto-creado backfill NetSuite ${BACKFILL_TAG}`,
    }));
    const { data: ins, error } = await supabaseAdmin
      .from("clientes")
      .insert(payload)
      .select("id, razon_social");
    if (error) {
      out.errors.push(`clientes stubs: ${error.message}`);
    } else {
      for (const r of ins ?? []) clientMap.set(normalizeName(r.razon_social), r.id);
      out.created_client_stubs += ins?.length ?? 0;
    }
  }

  const repRows = await loadInBatches(repRaw, async (batch) => {
    const { data, error } = await supabaseAdmin
      .from("representantes")
      .select("id, nombre")
      .in("nombre", batch);
    if (error) throw error;
    return data ?? [];
  });
  const repMap = new Map<string, string>();
  for (const r of repRows) repMap.set(normalizeName(r.nombre), r.id);
  const missingReps = repRaw.filter((n) => !repMap.has(normalizeName(n)));
  if (missingReps.length) {
    const payload = missingReps.map((n) => ({
      nombre: n,
      activo: true,
      comision_default_pct: 0,
      notas: `Auto-creado backfill NetSuite ${BACKFILL_TAG}`,
    }));
    const { data: ins, error } = await supabaseAdmin
      .from("representantes")
      .insert(payload)
      .select("id, nombre");
    if (error) {
      out.errors.push(`representantes stubs: ${error.message}`);
    } else {
      for (const r of ins ?? []) repMap.set(normalizeName(r.nombre), r.id);
      out.created_rep_stubs += ins?.length ?? 0;
    }
  }

  const prodRows = await loadInBatches(skuList, async (batch) => {
    const { data, error } = await supabaseAdmin
      .from("productos")
      .select("id, sku")
      .in("sku", batch);
    if (error) throw error;
    return data ?? [];
  });
  const prodMap = new Map<string, string>();
  for (const r of prodRows) if (r.sku) prodMap.set(r.sku, r.id);
  const missingSkus = skuList.filter((s) => !prodMap.has(s));
  if (missingSkus.length) {
    const payload = missingSkus.map((sku) => ({
      sku,
      nombre: skuToDesc.get(sku) ?? sku,
      descripcion: `Auto-creado backfill NetSuite ${BACKFILL_TAG}`,
      precio_lista: 0,
      unidad: "pieza",
      iva_pct: 0,
      activo: true,
    }));

    const { data: ins, error } = await supabaseAdmin
      .from("productos")
      .insert(payload)
      .select("id, sku");
    if (error) {
      out.errors.push(`productos stubs: ${error.message}`);
    } else {
      for (const r of ins ?? []) if (r.sku) prodMap.set(r.sku, r.id);
      out.created_product_stubs += ins?.length ?? 0;
    }
  }

  const invoiceNos = invoices.map((i) => i.invoice_no);
  const existing = await loadInBatches(invoiceNos, async (batch) => {
    const { data, error } = await supabaseAdmin
      .from("pedidos")
      .select("folio")
      .in("folio", batch);
    if (error) throw error;
    return data ?? [];
  });
  const existingFolios = new Set((existing ?? []).map((r) => r.folio));

  const pedidoRows: any[] = [];
  const invoiceToTotal = new Map<string, number>();
  const invoiceToClient = new Map<string, string>();
  const invoiceToRep = new Map<string, string | null>();
  const invoiceToDate = new Map<string, string>();
  const invoiceToLines = new Map<
    string,
    { producto_id: string; nombre: string; sku: string; qty: number; price: number; revenue: number }[]
  >();

  for (const inv of invoices) {
    if (existingFolios.has(inv.invoice_no)) {
      out.skipped_existing++;
      continue;
    }
    const { clean } = stripClientPrefix(inv.client_name);
    const clienteId = clientMap.get(normalizeName(clean));
    if (!clienteId) {
      out.errors.push(`invoice ${inv.invoice_no}: cliente sin resolver (${inv.client_name})`);
      continue;
    }
    const repId = inv.rep_name
      ? repMap.get(normalizeName(inv.rep_name.trim())) ?? null
      : null;

    const lines: {
      producto_id: string;
      nombre: string;
      sku: string;
      qty: number;
      price: number;
      revenue: number;
    }[] = [];
    let total = 0;
    let bad = false;
    for (const l of inv.lines) {
      const sku = (l.sku ?? "").trim();
      const producto_id = sku ? prodMap.get(sku) : undefined;
      if (!producto_id) {
        out.errors.push(
          `invoice ${inv.invoice_no}: sku sin resolver (${sku || "vacío"})`,
        );
        bad = true;
        break;
      }
      const qty = Number(l.quantity) || 0;
      const rev = Number(l.revenue) || 0;
      const price = qty > 0 ? rev / qty : 0;
      lines.push({
        producto_id,
        nombre: l.description ?? sku,
        sku,
        qty,
        price,
        revenue: rev,
      });
      total += rev;
    }
    if (bad || lines.length === 0) continue;

    pedidoRows.push({
      folio: inv.invoice_no,
      cliente_id: clienteId,
      representante_id: repId,
      estado: "entregado",
      subtotal: total,
      iva: 0,
      total,
      discount_amount: 0,
      order_code: inv.invoice_no,
      delivery_date: inv.invoice_date,
      backfill_source: BACKFILL_TAG,
      created_at: `${inv.invoice_date}T12:00:00Z`,
    });
    invoiceToTotal.set(inv.invoice_no, total);
    invoiceToClient.set(inv.invoice_no, clienteId);
    invoiceToRep.set(inv.invoice_no, repId);
    invoiceToDate.set(inv.invoice_no, inv.invoice_date);
    invoiceToLines.set(inv.invoice_no, lines);
    out.processed_invoices++;
  }

  if (pedidoRows.length === 0) return out;

  const { data: pedIns, error: pedErr } = await supabaseAdmin
    .from("pedidos")
    .insert(pedidoRows)
    .select("id, folio");
  if (pedErr) {
    out.errors.push(`pedidos insert: ${pedErr.message}`);
    return out;
  }
  out.created_pedidos += pedIns?.length ?? 0;
  const folioToPedidoId = new Map<string, string>();
  for (const r of pedIns ?? []) folioToPedidoId.set(r.folio, r.id);

  const pedItems: any[] = [];
  for (const [folio, lines] of invoiceToLines) {
    const pid = folioToPedidoId.get(folio);
    if (!pid) continue;
    for (const l of lines) {
      if (!(l.qty > 0) || !(l.price >= 0)) continue;
      pedItems.push({
        pedido_id: pid,
        producto_id: l.producto_id,
        nombre_snapshot: l.nombre,
        sku_snapshot: l.sku,
        unidad_snapshot: "pieza",
        cantidad: l.qty,
        precio_unitario: l.price,
        iva_pct: 0,
        is_damaged: false,
      });
    }

  }
  if (pedItems.length) {
    for (let i = 0; i < pedItems.length; i += 1000) {
      const batch = pedItems.slice(i, i + 1000);
      const { data: ins, error } = await supabaseAdmin
        .from("pedido_items")
        .insert(batch)
        .select("id");
      if (error) {
        out.errors.push(`pedido_items batch ${i}: ${error.message}`);
      } else {
        out.created_pedido_items += ins?.length ?? 0;
      }
    }
  }

  const facturaRows: any[] = [];
  for (const [folio, pid] of folioToPedidoId) {
    const total = invoiceToTotal.get(folio) ?? 0;
    const clienteId = invoiceToClient.get(folio)!;
    const repId = invoiceToRep.get(folio) ?? null;
    const fecha = invoiceToDate.get(folio)!;
    facturaRows.push({
      folio,
      cliente_id: clienteId,
      pedido_id: pid,
      representante_id: repId,
      fecha_emision: fecha,
      fecha_vencimiento: fecha,
      subtotal: total,
      iva: 0,
      total,
      pagado: total,
      estado: "pagada",
      backfill_source: BACKFILL_TAG,
      created_at: `${fecha}T12:00:00Z`,
    });
  }

  const folioToFacturaId = new Map<string, string>();
  for (let i = 0; i < facturaRows.length; i += 500) {
    const batch = facturaRows.slice(i, i + 500);
    const { data: ins, error } = await supabaseAdmin
      .from("facturas")
      .insert(batch)
      .select("id, folio");
    if (error) {
      out.errors.push(`facturas batch ${i}: ${error.message}`);
      continue;
    }
    for (const r of ins ?? []) folioToFacturaId.set(r.folio, r.id);
    out.created_facturas += ins?.length ?? 0;
  }

  const facItems: any[] = [];
  for (const [folio, lines] of invoiceToLines) {
    const fid = folioToFacturaId.get(folio);
    if (!fid) continue;
    for (const l of lines) {
      if (!(l.qty > 0) || !(l.price >= 0)) continue;
      facItems.push({
        factura_id: fid,
        producto_id: l.producto_id,
        nombre_snapshot: l.nombre,
        sku_snapshot: l.sku,
        unidad_snapshot: "pieza",
        cantidad: l.qty,
        precio_unitario: l.price,
        iva_pct: 0,
        ieps_pct: 0,
      });
    }

  }
  if (facItems.length) {
    for (let i = 0; i < facItems.length; i += 1000) {
      const batch = facItems.slice(i, i + 1000);
      const { data: ins, error } = await supabaseAdmin
        .from("factura_items")
        .insert(batch)
        .select("id");
      if (error) {
        out.errors.push(`factura_items batch ${i}: ${error.message}`);
      } else {
        out.created_factura_items += ins?.length ?? 0;
      }
    }
  }

  return out;
}
