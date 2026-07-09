import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getCurrentRep(supabase: any, userId: string) {
  const { data } = await supabase
    .from("representantes")
    .select("id, nombre")
    .eq("user_id", userId)
    .maybeSingle();
  return data as { id: string; nombre: string } | null;
}

/* ─────────── Catálogo enriquecido para mostrar al cliente ─────────── */

export const getRepCatalogFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        client_id: z.string().uuid().optional(),
        search: z.string().optional(),
        laboratorio_id: z.string().uuid().optional(),
        limit: z.number().min(1).max(300).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    // Resolve client's price list
    let priceListId: string | null = null;
    let client: any = null;
    if (data.client_id) {
      const { data: c } = await context.supabase
        .from("clientes")
        .select("id, razon_social, nombre_comercial, nickname, price_list_id")
        .eq("id", data.client_id)
        .maybeSingle();
      client = c;
      priceListId = c?.price_list_id ?? null;
    }

    // Products
    let q = context.supabase
      .from("productos")
      .select(
        "id, nombre, sku, presentacion, marca, laboratorio_id, imagen_url, precio_lista, stock_disponible, promo, categoria, linea, activo",
      )
      .eq("activo", true)
      .order("nombre", { ascending: true })
      .limit(data.limit ?? 120);
    if (data.laboratorio_id) q = q.eq("laboratorio_id", data.laboratorio_id);
    if (data.search) q = q.ilike("nombre", `%${data.search}%`);
    const { data: products, error } = await q;
    if (error) throw error;

    // Price list overrides
    let priceMap = new Map<string, number>();
    if (priceListId && products?.length) {
      const { data: pli } = await context.supabase
        .from("price_list_items")
        .select("product_id, price_with_iva")
        .eq("price_list_id", priceListId)
        .in(
          "product_id",
          products.map((p: any) => p.id),
        );
      priceMap = new Map((pli ?? []).map((r: any) => [r.product_id, Number(r.price_with_iva)]));
    }

    // Active promotions
    const nowIso = new Date().toISOString();
    const { data: promos } = await context.supabase
      .from("product_promotions")
      .select("product_id, promo_name, promo_cost_with_iva, valid_from, valid_to")
      .eq("active", true);
    const promoMap = new Map<string, any>();
    for (const p of promos ?? []) {
      if (p.valid_from && p.valid_from > nowIso) continue;
      if (p.valid_to && p.valid_to < nowIso) continue;
      if (p.product_id) promoMap.set(p.product_id, p);
    }

    // Labs
    const labIds = Array.from(
      new Set((products ?? []).map((p: any) => p.laboratorio_id).filter(Boolean)),
    );
    let labMap = new Map<string, string>();
    if (labIds.length) {
      const { data: labs } = await context.supabase
        .from("laboratorios")
        .select("id, nombre")
        .in("id", labIds);
      labMap = new Map((labs ?? []).map((l: any) => [l.id, l.nombre]));
    }

    return {
      client,
      products: (products ?? []).map((p: any) => ({
        ...p,
        lab_name: p.laboratorio_id ? labMap.get(p.laboratorio_id) ?? null : null,
        price: priceMap.get(p.id) ?? Number(p.precio_lista ?? 0),
        promo: promoMap.get(p.id) ?? null,
      })),
    };
  });

/* ─────────── Ticket / recibo compartible ─────────── */

export const getShareTicketFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        kind: z.enum(["pedido", "cotizacion", "pago"]),
        id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const rep = await getCurrentRep(context.supabase, context.userId);

    if (data.kind === "pedido") {
      const { data: p } = await context.supabase
        .from("pedidos")
        .select(
          "id, folio, total, subtotal, iva, created_at, cliente_id, delivery_date, notas_cliente, notas_internas",
        )
        .eq("id", data.id)
        .maybeSingle();
      if (!p) throw new Error("Pedido no encontrado");
      const { data: items } = await context.supabase
        .from("pedido_items")
        .select("cantidad, producto_id, precio_unitario, importe, nombre_snapshot, sku_snapshot")
        .eq("pedido_id", data.id);
      const { data: c } = await context.supabase
        .from("clientes")
        .select("razon_social, nombre_comercial, nickname, telefono")
        .eq("id", p.cliente_id)
        .maybeSingle();

      return {
        kind: "pedido" as const,
        rep: rep?.nombre ?? "",
        title: `Pedido ${p.folio ?? p.id.slice(0, 8)}`,
        client: {
          name: c?.nickname || c?.nombre_comercial || c?.razon_social || "Cliente",
          phone: c?.telefono ?? null,
        },
        date: p.created_at,
        delivery_date: p.delivery_date,
        notes: p.notas_cliente ?? p.notas_internas ?? null,
        subtotal: Number(p.subtotal ?? 0),
        iva: Number(p.iva ?? 0),
        total: Number(p.total ?? 0),
        items: (items ?? []).map((i: any) => ({
          name: i.nombre_snapshot ?? "",
          sku: i.sku_snapshot ?? "",
          qty: Number(i.cantidad),
          price: Number(i.precio_unitario),
          amount: Number(i.importe ?? Number(i.cantidad) * Number(i.precio_unitario)),
        })),
      };
    }


    if (data.kind === "cotizacion") {
      const { data: q } = await context.supabase
        .from("quotes")
        .select("id, status, subtotal, total, created_at, client_id, delivery_date, contact_name")
        .eq("id", data.id)
        .maybeSingle();
      if (!q) throw new Error("Cotización no encontrada");
      const { data: items } = await context.supabase
        .from("quote_items")
        .select("cantidad, producto_id, precio_unitario, importe")
        .eq("quote_id", data.id);
      const productIds = (items ?? []).map((i: any) => i.producto_id);
      const { data: prods } = productIds.length
        ? await context.supabase
            .from("productos")
            .select("id, nombre, sku")
            .in("id", productIds)
        : { data: [] as any[] };
      const byId = new Map((prods ?? []).map((p: any) => [p.id, p]));
      const { data: c } = q.client_id
        ? await context.supabase
            .from("clientes")
            .select("razon_social, nombre_comercial, nickname, telefono")
            .eq("id", q.client_id)
            .maybeSingle()
        : { data: null as any };

      return {
        kind: "cotizacion",
        rep: rep?.nombre ?? "",
        title: `Cotización ${q.id.slice(0, 8)}`,
        client: {
          name: c?.nickname || c?.nombre_comercial || c?.razon_social || q.contact_name || "Cliente",
          phone: c?.telefono ?? null,
        },
        date: q.created_at,
        delivery_date: q.delivery_date,
        notes: null,
        subtotal: Number(q.subtotal ?? 0),
        iva: Number(q.total ?? 0) - Number(q.subtotal ?? 0),
        total: Number(q.total ?? 0),
        items: (items ?? []).map((i: any) => ({
          name: byId.get(i.producto_id)?.nombre ?? i.producto_id,
          sku: byId.get(i.producto_id)?.sku ?? "",
          qty: Number(i.cantidad),
          price: Number(i.precio_unitario),
          amount: Number(i.importe),
        })),
      };
    }

    // pago
    const { data: pago } = await context.supabase
      .from("pagos")
      .select("id, monto, metodo, referencia, fecha, factura_id, notas")
      .eq("id", data.id)
      .maybeSingle();
    if (!pago) throw new Error("Pago no encontrado");
    let clientName = "Cliente";
    let phone: string | null = null;
    if (pago.factura_id) {
      const { data: f } = await context.supabase
        .from("facturas")
        .select("cliente_id, folio")
        .eq("id", pago.factura_id)
        .maybeSingle();
      if (f?.cliente_id) {
        const { data: c } = await context.supabase
          .from("clientes")
          .select("razon_social, nombre_comercial, nickname, telefono")
          .eq("id", f.cliente_id)
          .maybeSingle();
        clientName = c?.nickname || c?.nombre_comercial || c?.razon_social || clientName;
        phone = c?.telefono ?? null;
      }
    }
    return {
      kind: "pago",
      rep: rep?.nombre ?? "",
      title: `Recibo de pago`,
      client: { name: clientName, phone },
      date: pago.fecha,
      delivery_date: null,
      notes: pago.notas,
      subtotal: Number(pago.monto),
      iva: 0,
      total: Number(pago.monto),
      items: [
        {
          name: `Pago ${pago.forma_pago ?? ""} ${pago.referencia ? `· ref ${pago.referencia}` : ""}`,
          sku: "",
          qty: 1,
          price: Number(pago.monto),
          amount: Number(pago.monto),
        },
      ],
    };
  });
