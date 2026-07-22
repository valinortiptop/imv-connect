import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* Helper: current rep (null = admin sin registro) */
async function getCurrentRep(supabase: any, userId: string) {
  const { data } = await supabase
    .from("representantes")
    .select("id, nombre")
    .eq("user_id", userId)
    .maybeSingle();
  return data as { id: string; nombre: string } | null;
}

/* ─────────── Cotizaciones ─────────── */

export const listRepQuotesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rep = await getCurrentRep(context.supabase, context.userId);

    // Restrict clientes to this rep (if rep)
    let clientIds: string[] | null = null;
    if (rep) {
      const { data: cs } = await context.supabase
        .from("clientes")
        .select("id")
        .eq("representante_id", rep.id);
      clientIds = (cs ?? []).map((c: any) => c.id);
      if (clientIds.length === 0) return { quotes: [] };
    }

    let q = context.supabase
      .from("quotes")
      .select(
        "id, status, contact_name, subtotal, total, delivery_date, created_at, client_id, converted_to_order_id",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (clientIds) q = q.in("client_id", clientIds);
    const { data: quotes, error } = await q;
    if (error) throw error;

    // Enrich with client names
    const ids = Array.from(new Set((quotes ?? []).map((x: any) => x.client_id).filter(Boolean)));
    let byId = new Map<string, any>();
    if (ids.length) {
      const { data: cl } = await context.supabase
        .from("clientes")
        .select("id, razon_social, nombre_comercial, nickname")
        .in("id", ids);
      byId = new Map((cl ?? []).map((c: any) => [c.id, c]));
    }
    return {
      quotes: (quotes ?? []).map((q: any) => ({
        ...q,
        client_name:
          byId.get(q.client_id)?.nickname ||
          byId.get(q.client_id)?.nombre_comercial ||
          byId.get(q.client_id)?.razon_social ||
          q.contact_name ||
          "—",
      })),
    };
  });

export const convertQuoteToPedidoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ quoteId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: quote, error: qErr } = await context.supabase
      .from("quotes")
      .select("*")
      .eq("id", data.quoteId)
      .single();
    if (qErr || !quote) throw new Error("Cotización no encontrada");
    if (quote.converted_to_order_id) {
      return { pedidoId: quote.converted_to_order_id, alreadyConverted: true };
    }

    const { data: items, error: iErr } = await context.supabase
      .from("quote_items")
      .select("*")
      .eq("quote_id", data.quoteId);
    if (iErr) throw iErr;

    // Create pedido
    const rep = await getCurrentRep(context.supabase, context.userId);
    if (!quote.client_id) throw new Error("Cotización sin cliente");
    const { data: ped, error: pErr } = await context.supabase
      .from("pedidos")
      .insert({
        cliente_id: quote.client_id as string,
        notas_cliente: quote.notes ?? `Convertido de cotización`,
        contacto_nombre: quote.contact_name,
        contacto_telefono: quote.contact_phone,
        representante_id: rep?.id ?? null,
      })
      .select("id, folio")
      .single();
    if (pErr) throw pErr;

    // Copy items (fetch producto for iva/unidad snapshot)
    if ((items ?? []).length) {
      const prodIds = Array.from(new Set(items!.map((it: any) => it.product_id).filter(Boolean)));
      const { data: prods } = await context.supabase
        .from("productos")
        .select("id, sku, unidad, iva_pct, nombre")
        .in("id", prodIds);
      const byId = new Map((prods ?? []).map((p: any) => [p.id, p]));
      const rows = items!.map((it: any) => {
        const p = byId.get(it.product_id) || {};
        return {
          pedido_id: ped.id,
          producto_id: it.product_id,
          nombre_snapshot: it.product_name ?? p.nombre ?? "",
          sku_snapshot: p.sku ?? null,
          unidad_snapshot: p.unidad ?? "PZA",
          cantidad: it.quantity,
          precio_unitario: it.unit_price,
          iva_pct: p.iva_pct ?? 16,
        };
      });
      const { error: iiErr } = await context.supabase.from("pedido_items").insert(rows);
      if (iiErr) throw iiErr;
    }

    await context.supabase
      .from("quotes")
      .update({ converted_to_order_id: ped.id, status: "converted" })
      .eq("id", data.quoteId);

    return { pedidoId: ped.id, folio: ped.folio, alreadyConverted: false };
  });

/* ─────────── Cobranza ─────────── */

export const listOpenInvoicesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rep = await getCurrentRep(context.supabase, context.userId);

    let q = context.supabase
      .from("facturas")
      .select(
        "id, folio, cliente_id, fecha_emision, fecha_vencimiento, total, pagado, saldo, estado, representante_id",
      )
      .in("estado", ["emitida", "parcial"])
      .order("fecha_vencimiento", { ascending: true, nullsFirst: false })
      .limit(300);
    if (rep) q = q.eq("representante_id", rep.id);

    const { data: facs, error } = await q;
    if (error) throw error;

    const ids = Array.from(new Set((facs ?? []).map((f: any) => f.cliente_id).filter(Boolean)));
    let byId = new Map<string, any>();
    if (ids.length) {
      const { data: cl } = await context.supabase
        .from("clientes")
        .select("id, razon_social, nombre_comercial, nickname")
        .in("id", ids);
      byId = new Map((cl ?? []).map((c: any) => [c.id, c]));
    }

    const today = new Date();
    return {
      facturas: (facs ?? []).map((f: any) => {
        const dueDays = f.fecha_vencimiento
          ? Math.floor((today.getTime() - new Date(f.fecha_vencimiento).getTime()) / 86400000)
          : 0;
        return {
          ...f,
          client_name:
            byId.get(f.cliente_id)?.nickname ||
            byId.get(f.cliente_id)?.nombre_comercial ||
            byId.get(f.cliente_id)?.razon_social ||
            "—",
          overdue_days: dueDays > 0 ? dueDays : 0,
          saldo: Number(f.saldo ?? Number(f.total) - Number(f.pagado ?? 0)),
        };
      }),
    };
  });

export const registerPaymentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        facturaId: z.string().uuid(),
        monto: z.number().positive(),
        metodo: z.enum(["efectivo", "transferencia", "cheque", "tarjeta", "otro"]),
        referencia: z.string().optional().nullable(),
        notas: z.string().optional().nullable(),
        fecha: z.string().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: pago, error } = await context.supabase
      .from("pagos")
      .insert({
        factura_id: data.facturaId,
        monto: data.monto,
        metodo: data.metodo,
        referencia: data.referencia ?? null,
        notas: data.notas ?? null,
        fecha: data.fecha ?? new Date().toISOString().slice(0, 10),
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { pagoId: pago.id };
  });

/* ─────────── Cobranza summary (para meta mensual) ─────────── */

export const getRepCobranzaSummaryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rep = await getCurrentRep(context.supabase, context.userId);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthStr = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}-01`;

    // clientes del rep
    let clientIds: string[] | null = null;
    if (rep) {
      const { data: cs } = await context.supabase
        .from("clientes")
        .select("id")
        .eq("representante_id", rep.id);
      clientIds = (cs ?? []).map((c: any) => c.id);
    }

    // facturas del rep para poder ligar pagos
    let facQ = context.supabase.from("facturas").select("id, cliente_id, representante_id");
    if (rep) facQ = facQ.eq("representante_id", rep.id);
    const { data: facs } = await facQ;
    const facIds = (facs ?? []).map((f: any) => f.id);

    let collected = 0;
    if (facIds.length) {
      const { data: pagos } = await context.supabase
        .from("pagos")
        .select("monto, fecha, factura_id")
        .in("factura_id", facIds)
        .gte("fecha", monthStart.toISOString().slice(0, 10))
        .lt("fecha", monthEnd.toISOString().slice(0, 10));
      collected = (pagos ?? []).reduce((s: number, p: any) => s + Number(p.monto || 0), 0);
    }

    let target: any = null;
    if (rep) {
      const { data: t } = await context.supabase
        .from("rep_targets")
        .select("target_amount, min_daily")
        .eq("rep_id", rep.id)
        .eq("period_month", monthStr)
        .maybeSingle();
      target = t;
    }

    return {
      collected_month: collected,
      target_amount: Number(target?.target_amount ?? 0),
      month: monthStr,
      rep_id: rep?.id ?? null,
    };
  });

/* ─────────── Devoluciones ─────────── */

export const listRepDevolucionesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rep = await getCurrentRep(context.supabase, context.userId);

    let clientIds: string[] | null = null;
    if (rep) {
      const { data: cs } = await context.supabase
        .from("clientes")
        .select("id")
        .eq("representante_id", rep.id);
      clientIds = (cs ?? []).map((c: any) => c.id);
      if (clientIds.length === 0) return { devoluciones: [] };
    }

    let q = context.supabase
      .from("devoluciones")
      .select("id, folio, cliente_id, fecha, motivo, estado, total, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (clientIds) q = q.in("cliente_id", clientIds);
    const { data: devs, error } = await q;
    if (error) throw error;

    const ids = Array.from(new Set((devs ?? []).map((d: any) => d.cliente_id).filter(Boolean)));
    let byId = new Map<string, any>();
    if (ids.length) {
      const { data: cl } = await context.supabase
        .from("clientes")
        .select("id, razon_social, nombre_comercial, nickname")
        .in("id", ids);
      byId = new Map((cl ?? []).map((c: any) => [c.id, c]));
    }
    return {
      devoluciones: (devs ?? []).map((d: any) => ({
        ...d,
        client_name:
          byId.get(d.cliente_id)?.nickname ||
          byId.get(d.cliente_id)?.nombre_comercial ||
          byId.get(d.cliente_id)?.razon_social ||
          "—",
      })),
    };
  });

export const startDevolucionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        clienteId: z.string().uuid(),
        facturaId: z.string().uuid(),
        motivo: z.string().min(3),
        notas: z.string().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: alm } = await context.supabase
      .from("almacenes")
      .select("id")
      .eq("principal", true)
      .limit(1)
      .maybeSingle();
    if (!alm) throw new Error("No hay almacén principal configurado");
    const { data: dev, error } = await context.supabase
      .from("devoluciones")
      .insert({
        cliente_id: data.clienteId,
        factura_id: data.facturaId,
        almacen_id: alm.id,
        motivo: data.motivo,
        notas: data.notas ?? null,
        estado: "borrador",
        created_by: context.userId,
      })
      .select("id, folio")
      .single();
    if (error) throw error;
    return { devolucionId: dev.id, folio: dev.folio };
  });

/* ─────────── Promos activas del cliente ─────────── */

export const getActivePromosFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clienteId: z.string().uuid().optional() }).parse(d),
  )
  .handler(async ({ context }) => {
    const today = new Date().toISOString().slice(0, 10);
    const { data: promos, error } = await context.supabase
      .from("product_promotions")
      .select(
        "id, product_id, promo_clave, promo_name, promo_cost_with_iva, description, valid_from, valid_to",
      )
      .eq("active", true)
      .or(`valid_from.is.null,valid_from.lte.${today}`)
      .or(`valid_to.is.null,valid_to.gte.${today}`)
      .limit(100);
    if (error) throw error;

    const prodIds = Array.from(
      new Set((promos ?? []).map((p: any) => p.product_id).filter(Boolean)),
    );
    let prodMap = new Map<string, any>();
    if (prodIds.length) {
      const { data: prods } = await context.supabase
        .from("productos")
        .select("id, nombre, sku, imagen_url")
        .in("id", prodIds);
      prodMap = new Map((prods ?? []).map((p: any) => [p.id, p]));
    }
    return {
      promos: (promos ?? []).map((p: any) => ({
        ...p,
        product: prodMap.get(p.product_id) ?? null,
      })),
    };
  });
