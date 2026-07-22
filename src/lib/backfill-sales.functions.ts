import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  BACKFILL_TAG,
  normalizeName,
  stripClientPrefix,
  type BackfillInvoice,
} from "./backfill-sales.server";

type Counters = {
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

export const backfillNetsuiteSales2026Fn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { empresaId: string; invoices: BackfillInvoice[] }) => input,
  )
  .handler(async ({ data, context }) => {
    const { empresaId, invoices } = data;
    const out: Counters = {
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

    // Verify admin role using the caller's authenticated Supabase client.
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc(
      "has_role",
      { _user_id: context.userId, _role: "admin" },
    );
    if (roleErr || !isAdmin) {
      throw new Error("Forbidden: se requiere rol admin para ejecutar el backfill");
    }

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    // ---------- Collect unique refs across this chunk ----------
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

    // ---------- Resolve existing rows ----------
    const clientCleanNames = Array.from(clientKeyToInfo.values()).map((x) => x.clean);
    const repRawSet = new Set<string>();
    for (const inv of invoices) if (inv.rep_name) repRawSet.add(inv.rep_name.trim());
    const repRaw = Array.from(repRawSet);
    const skuList = Array.from(skus);

    // Load in batches of 500 to keep the IN() query size reasonable.
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

    // Create missing client stubs
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

    // Reps
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

    // Productos (match by sku)
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
        precio_lista: 0,
        unidad: "pieza",
        iva_pct: 0,
        activo: true,
        notas: `Auto-creado backfill NetSuite ${BACKFILL_TAG}`,
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

    // ---------- Skip invoices we already imported ----------
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

    // ---------- Build inserts per invoice ----------
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

    // ---------- Insert pedidos ----------
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

    // ---------- Insert pedido_items ----------
    const pedItems: any[] = [];
    for (const [folio, lines] of invoiceToLines) {
      const pid = folioToPedidoId.get(folio);
      if (!pid) continue;
      for (const l of lines) {
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
      // Insert in batches of 1000 to stay within request size limits
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

    // ---------- Insert facturas ----------
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

    // ---------- Insert factura_items ----------
    const facItems: any[] = [];
    for (const [folio, lines] of invoiceToLines) {
      const fid = folioToFacturaId.get(folio);
      if (!fid) continue;
      for (const l of lines) {
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
  });
