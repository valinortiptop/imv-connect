import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  openaiChat,
  googleGeocode,
  googleDirections,
} from "./valinor-proxy.server";
import {
  CLIENT_INSIGHTS_SYSTEM,
  DAILY_PLAN_SYSTEM,
} from "./rep-prompts";

/* ─── helper: obtiene el representante actual (o null si es admin sin registro) ─── */
async function getCurrentRep(supabase: any, userId: string) {
  const { data } = await supabase
    .from("representantes")
    .select("id, nombre, email, telefono, activo")
    .eq("user_id", userId)
    .maybeSingle();
  return data as
    | { id: string; nombre: string; email: string | null; telefono: string | null; activo: boolean }
    | null;
}

/* ─── 1. getMyRep ─── */
export const getMyRepFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rep = await getCurrentRep(context.supabase, context.userId);
    return { rep };
  });

/* ─── 2. getMyClients: clientes + métricas base ─── */
export const getMyClientsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rep = await getCurrentRep(context.supabase, context.userId);

    let clientsQ = context.supabase
      .from("clientes")
      .select(
        "id, razon_social, nombre_comercial, nickname, rfc, telefono, phone, direccion, codigo_postal, lat, lng, active, representante_id, credit_limit, payment_terms",
      )
      .eq("active", true);

    if (rep) {
      clientsQ = clientsQ.eq("representante_id", rep.id);
    }

    const { data: clientes, error } = await clientsQ.limit(500);
    if (error) throw error;
    const clientIds = (clientes ?? []).map((c: any) => c.id);
    if (clientIds.length === 0) return { rep, clients: [] };

    // Métricas: último pedido + total 12m + conteo pedidos
    const since = new Date();
    since.setMonth(since.getMonth() - 12);

    const { data: pedidos } = await context.supabase
      .from("pedidos")
      .select("id, cliente_id, total, created_at")
      .in("cliente_id", clientIds)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false });

    const stats = new Map<
      string,
      { last: string | null; count: number; total12m: number; totals: number[] }
    >();
    for (const p of pedidos ?? []) {
      const cur = stats.get(p.cliente_id) ?? {
        last: null,
        count: 0,
        total12m: 0,
        totals: [],
      };
      if (!cur.last || p.created_at > cur.last) cur.last = p.created_at;
      cur.count += 1;
      cur.total12m += Number(p.total ?? 0);
      cur.totals.push(Number(p.total ?? 0));
      stats.set(p.cliente_id, cur);
    }

    // Insights cache (para pintar badges de riesgo sin llamar IA aún)
    const { data: insights } = await context.supabase
      .from("rep_client_insights")
      .select("cliente_id, churn_risk_score, generated_at")
      .in("cliente_id", clientIds);
    const insightsMap = new Map(
      (insights ?? []).map((i: any) => [i.cliente_id, i]),
    );

    const now = Date.now();
    const enriched = (clientes ?? []).map((c: any) => {
      const s = stats.get(c.id);
      const daysSince = s?.last
        ? Math.floor((now - new Date(s.last).getTime()) / 86400000)
        : null;
      const avgTicket =
        s && s.totals.length > 0 ? s.total12m / s.totals.length : 0;
      const insight = insightsMap.get(c.id) as any;
      return {
        ...c,
        last_order_at: s?.last ?? null,
        orders_12m: s?.count ?? 0,
        total_12m: s?.total12m ?? 0,
        avg_ticket: avgTicket,
        days_since_last: daysSince,
        churn_risk_score: insight?.churn_risk_score ?? null,
      };
    });

    return { rep, clients: enriched };
  });

/* ─── 3. getClientDashboard: historial 12m + tendencias ─── */
export const getClientDashboardFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ clienteId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const since = new Date();
    since.setMonth(since.getMonth() - 12);

    const { data: cliente } = await context.supabase
      .from("clientes")
      .select(
        "id, razon_social, nombre_comercial, nickname, rfc, telefono, phone, direccion, codigo_postal, lat, lng, contact, notas",
      )
      .eq("id", data.clienteId)
      .maybeSingle();
    if (!cliente) throw new Error("Cliente no encontrado o sin acceso");

    const { data: pedidos } = await context.supabase
      .from("pedidos")
      .select("id, folio, total, subtotal, created_at, estado")
      .eq("cliente_id", data.clienteId)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false });

    const pedidoIds = (pedidos ?? []).map((p: any) => p.id);
    let items: any[] = [];
    if (pedidoIds.length > 0) {
      const { data: rows } = await context.supabase
        .from("pedido_items")
        .select(
          "pedido_id, producto_id, nombre_snapshot, sku_snapshot, cantidad, precio_unitario, importe",
        )
        .in("pedido_id", pedidoIds);
      items = rows ?? [];
    }

    const productIds = Array.from(
      new Set(items.map((i) => i.producto_id).filter(Boolean)),
    );
    let productos: any[] = [];
    if (productIds.length > 0) {
      const { data: prods } = await context.supabase
        .from("productos")
        .select("id, nombre, sku, marca, laboratorio_id, stock_disponible, stock_en_camino, stock_comprometido")
        .in("id", productIds);
      productos = prods ?? [];
    }
    const labIds = Array.from(
      new Set(productos.map((p) => p.laboratorio_id).filter(Boolean)),
    );
    let laboratorios: any[] = [];
    if (labIds.length > 0) {
      const { data: labs } = await context.supabase
        .from("laboratorios")
        .select("id, nombre")
        .in("id", labIds);
      laboratorios = labs ?? [];
    }

    const pedidoDate = new Map(
      (pedidos ?? []).map((p: any) => [p.id, p.created_at as string]),
    );
    const prodById = new Map(productos.map((p) => [p.id, p]));
    const labById = new Map(laboratorios.map((l) => [l.id, l]));

    // Agregación por producto
    const productoAgg = new Map<
      string,
      {
        producto_id: string;
        nombre: string;
        sku: string | null;
        marca: string | null;
        laboratorio_id: string | null;
        laboratorio_nombre: string | null;
        qty: number;
        importe: number;
        last_purchase: string | null;
        purchases: number;
      }
    >();
    // por mes
    const monthAgg = new Map<string, number>();
    // por laboratorio
    const labAgg = new Map<
      string,
      { laboratorio_id: string; nombre: string; importe: number; qty: number; last: string | null }
    >();

    for (const it of items) {
      const created = pedidoDate.get(it.pedido_id) as string | undefined;
      if (!created) continue;
      const month = created.slice(0, 7);
      monthAgg.set(month, (monthAgg.get(month) ?? 0) + Number(it.importe ?? 0));

      const prod = prodById.get(it.producto_id) as any;
      const key = it.producto_id ?? it.sku_snapshot ?? it.nombre_snapshot;
      const cur = productoAgg.get(key) ?? {
        producto_id: it.producto_id,
        nombre: prod?.nombre ?? it.nombre_snapshot,
        sku: prod?.sku ?? it.sku_snapshot,
        marca: prod?.marca ?? null,
        laboratorio_id: prod?.laboratorio_id ?? null,
        laboratorio_nombre: prod?.laboratorio_id
          ? (labById.get(prod.laboratorio_id) as any)?.nombre ?? null
          : null,
        qty: 0,
        importe: 0,
        last_purchase: null,
        purchases: 0,
      };
      cur.qty += Number(it.cantidad ?? 0);
      cur.importe += Number(it.importe ?? 0);
      cur.purchases += 1;
      if (!cur.last_purchase || created > cur.last_purchase)
        cur.last_purchase = created;
      productoAgg.set(key, cur);

      if (prod?.laboratorio_id) {
        const lab = labById.get(prod.laboratorio_id) as any;
        const lcur = labAgg.get(prod.laboratorio_id) ?? {
          laboratorio_id: prod.laboratorio_id,
          nombre: lab?.nombre ?? "—",
          importe: 0,
          qty: 0,
          last: null,
        };
        lcur.importe += Number(it.importe ?? 0);
        lcur.qty += Number(it.cantidad ?? 0);
        if (!lcur.last || created > lcur.last) lcur.last = created;
        labAgg.set(prod.laboratorio_id, lcur);
      }
    }

    const topProducts = Array.from(productoAgg.values())
      .sort((a, b) => b.importe - a.importe)
      .slice(0, 20);

    const abandoned = Array.from(productoAgg.values())
      .filter((p) => {
        if (!p.last_purchase) return false;
        const days = (Date.now() - new Date(p.last_purchase).getTime()) / 86400000;
        return days > 60 && p.purchases >= 3;
      })
      .sort((a, b) => b.importe - a.importe)
      .slice(0, 15);

    const monthly = Array.from(monthAgg.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, importe]) => ({ month, importe }));

    const laboratorioBreakdown = Array.from(labAgg.values()).sort(
      (a, b) => b.importe - a.importe,
    );

    const totals = (pedidos ?? []).map((p: any) => Number(p.total ?? 0));
    const total12m = totals.reduce((a: number, b: number) => a + b, 0);
    const avgTicket = totals.length > 0 ? total12m / totals.length : 0;

    return {
      cliente,
      pedidos: pedidos ?? [],
      metrics: {
        total_12m: total12m,
        avg_ticket: avgTicket,
        orders_12m: totals.length,
      },
      monthly,
      topProducts,
      abandoned,
      laboratorioBreakdown,
    };
  });

/* ─── 4. getClientInventoryOffer ─── */
export const getClientInventoryOfferFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ clienteId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // top productos comprados últimos 6 meses
    const since = new Date();
    since.setMonth(since.getMonth() - 6);
    const { data: pedidos } = await context.supabase
      .from("pedidos")
      .select("id")
      .eq("cliente_id", data.clienteId)
      .gte("created_at", since.toISOString());
    const pedidoIds = (pedidos ?? []).map((p: any) => p.id);
    if (pedidoIds.length === 0) return { productos: [] };

    const { data: items } = await context.supabase
      .from("pedido_items")
      .select("producto_id, cantidad, importe")
      .in("pedido_id", pedidoIds);

    const agg = new Map<string, { qty: number; importe: number }>();
    for (const it of items ?? []) {
      if (!it.producto_id) continue;
      const c = agg.get(it.producto_id) ?? { qty: 0, importe: 0 };
      c.qty += Number(it.cantidad ?? 0);
      c.importe += Number(it.importe ?? 0);
      agg.set(it.producto_id, c);
    }
    const productIds = Array.from(agg.keys());
    if (productIds.length === 0) return { productos: [] };

    const { data: productos } = await context.supabase
      .from("productos")
      .select(
        "id, nombre, sku, marca, laboratorio_id, precio_lista, stock_disponible, stock_en_camino, stock_comprometido, imagen_url",
      )
      .in("id", productIds);

    // Próximas entradas en tránsito
    const { data: entries } = await context.supabase
      .from("stock_entries")
      .select("product_id, quantity, entry_date, entry_status")
      .in("product_id", productIds)
      .in("entry_status", ["transit", "pending", "in_transit"])
      .order("entry_date", { ascending: true });
    const entryMap = new Map<string, { qty: number; eta: string | null }>();
    for (const e of entries ?? []) {
      if (!e.product_id) continue;
      const cur = entryMap.get(e.product_id) ?? { qty: 0, eta: null };
      cur.qty += Number(e.quantity ?? 0);
      if (!cur.eta || (e.entry_date && e.entry_date < cur.eta))
        cur.eta = e.entry_date;
      entryMap.set(e.product_id, cur);
    }

    const enriched = (productos ?? [])
      .map((p: any) => {
        const a = agg.get(p.id)!;
        const tr = entryMap.get(p.id);
        return {
          ...p,
          historic_qty: a.qty,
          historic_importe: a.importe,
          transit_qty: tr?.qty ?? 0,
          transit_eta: tr?.eta ?? null,
        };
      })
      .sort((a, b) => b.historic_importe - a.historic_importe)
      .slice(0, 40);

    return { productos: enriched };
  });

/* ─── 5. generateClientInsights: IA con cache 24h ─── */
export const generateClientInsightsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ clienteId: z.string().uuid(), force: z.boolean().optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Cache 24h
    if (!data.force) {
      const { data: cached } = await context.supabase
        .from("rep_client_insights")
        .select("*")
        .eq("cliente_id", data.clienteId)
        .maybeSingle();
      if (cached) {
        const ageMs =
          Date.now() - new Date(cached.generated_at).getTime();
        if (ageMs < 24 * 3600 * 1000) return { insights: cached, cached: true };
      }
    }

    // Reunir contexto: cliente + resumen productos + laboratorios (12m)
    const since = new Date();
    since.setMonth(since.getMonth() - 12);
    const { data: cliente } = await context.supabase
      .from("clientes")
      .select("id, razon_social, nombre_comercial, direccion, codigo_postal")
      .eq("id", data.clienteId)
      .maybeSingle();
    if (!cliente) throw new Error("Cliente no accesible");

    const { data: pedidos } = await context.supabase
      .from("pedidos")
      .select("id, total, created_at")
      .eq("cliente_id", data.clienteId)
      .gte("created_at", since.toISOString());
    const pedidoIds = (pedidos ?? []).map((p: any) => p.id);
    let items: any[] = [];
    if (pedidoIds.length > 0) {
      const { data: rows } = await context.supabase
        .from("pedido_items")
        .select(
          "pedido_id, producto_id, nombre_snapshot, sku_snapshot, cantidad, importe",
        )
        .in("pedido_id", pedidoIds);
      items = rows ?? [];
    }
    const productIds = Array.from(
      new Set(items.map((i) => i.producto_id).filter(Boolean)),
    );
    let productos: any[] = [];
    if (productIds.length > 0) {
      const { data: prods } = await context.supabase
        .from("productos")
        .select("id, nombre, marca, laboratorio_id")
        .in("id", productIds);
      productos = prods ?? [];
    }
    const { data: labs } = await context.supabase
      .from("laboratorios")
      .select("id, nombre");
    const labMap = new Map((labs ?? []).map((l: any) => [l.id, l.nombre]));

    const pedidoDate = new Map(
      (pedidos ?? []).map((p: any) => [p.id, p.created_at]),
    );
    const prodMap = new Map(productos.map((p) => [p.id, p]));

    const perProd = new Map<
      string,
      { name: string; qty: number; importe: number; last: string; lab: string }
    >();
    const perLab = new Map<
      string,
      { name: string; importe: number; last: string; months: Set<string> }
    >();
    for (const it of items) {
      const created = pedidoDate.get(it.pedido_id) as string;
      if (!created) continue;
      const prod = prodMap.get(it.producto_id) as any;
      const lab = prod?.laboratorio_id ? labMap.get(prod.laboratorio_id) : null;
      const pid = it.producto_id ?? it.sku_snapshot;
      const c = perProd.get(pid) ?? {
        name: prod?.nombre ?? it.nombre_snapshot,
        qty: 0,
        importe: 0,
        last: "",
        lab: lab ?? "",
      };
      c.qty += Number(it.cantidad ?? 0);
      c.importe += Number(it.importe ?? 0);
      if (created > c.last) c.last = created;
      perProd.set(pid, c);

      if (lab) {
        const lc = perLab.get(lab) ?? {
          name: lab,
          importe: 0,
          last: "",
          months: new Set<string>(),
        };
        lc.importe += Number(it.importe ?? 0);
        if (created > lc.last) lc.last = created;
        lc.months.add(created.slice(0, 7));
        perLab.set(lab, lc);
      }
    }

    const topProds = Array.from(perProd.entries())
      .sort((a, b) => b[1].importe - a[1].importe)
      .slice(0, 25)
      .map(([id, v]) => ({
        producto_id: id,
        producto_nombre: v.name,
        laboratorio: v.lab,
        qty: v.qty,
        importe: Math.round(v.importe),
        last_purchase: v.last,
      }));

    const labSummary = Array.from(perLab.values())
      .sort((a, b) => b.importe - a.importe)
      .slice(0, 15)
      .map((l) => ({
        laboratorio: l.name,
        importe: Math.round(l.importe),
        meses_activos: l.months.size,
        last_purchase: l.last,
      }));

    const monthly = new Map<string, number>();
    for (const p of pedidos ?? []) {
      const m = (p.created_at as string).slice(0, 7);
      monthly.set(m, (monthly.get(m) ?? 0) + Number(p.total ?? 0));
    }
    const monthlySeries = Array.from(monthly.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([m, t]) => ({ month: m, total: Math.round(t) }));

    const userPayload = {
      cliente: {
        nombre: cliente.nombre_comercial ?? cliente.razon_social,
        cp: cliente.codigo_postal,
      },
      resumen_mensual: monthlySeries,
      top_productos: topProds,
      laboratorios: labSummary,
      fecha_hoy: new Date().toISOString().slice(0, 10),
    };

    let parsed: any = null;
    let modelUsed = "openai:gpt-4o-mini";
    try {
      const resp = await openaiChat({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: CLIENT_INSIGHTS_SYSTEM },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
      });
      const raw = resp.choices?.[0]?.message?.content ?? "";
      const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (err) {
      console.error("[rep insights] IA falló, usando fallback", err);
      // Fallback determinístico
      const lastMonths =
        monthlySeries.length > 0
          ? monthlySeries[monthlySeries.length - 1].month
          : null;
      const churn =
        !lastMonths || monthlySeries.length < 3
          ? 0.5
          : monthlySeries.slice(-1)[0].total <
              monthlySeries.slice(-4, -1).reduce((a, b) => a + b.total, 0) / 3 *
                0.5
            ? 0.75
            : 0.25;
      parsed = {
        churn_risk_score: churn,
        churn_reasons: ["Análisis heurístico (IA no disponible)"],
        reorder_predictions: [],
        cross_sell: [],
        lost_labs: [],
        summary: "Resumen no disponible por error de IA.",
      };
      modelUsed = "fallback";
    }

    const insertRow = {
      cliente_id: data.clienteId,
      generated_at: new Date().toISOString(),
      model: modelUsed,
      churn_risk_score: parsed.churn_risk_score ?? null,
      churn_reasons: parsed.churn_reasons ?? [],
      reorder_predictions: parsed.reorder_predictions ?? [],
      cross_sell: parsed.cross_sell ?? [],
      lost_labs: parsed.lost_labs ?? [],
      summary: parsed.summary ?? null,
      raw: parsed,
    };

    await context.supabase
      .from("rep_client_insights")
      .upsert(insertRow, { onConflict: "cliente_id" });

    return { insights: insertRow, cached: false };
  });

/* ─── 6. buildDailyPlan ─── */
export const buildDailyPlanFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        startLat: z.number().optional(),
        startLng: z.number().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const rep = await getCurrentRep(context.supabase, context.userId);

    let q = context.supabase
      .from("clientes")
      .select("id, razon_social, nombre_comercial, direccion, lat, lng")
      .eq("active", true);
    if (rep) q = q.eq("representante_id", rep.id);
    const { data: clientes } = await q.limit(200);

    const clientIds = (clientes ?? []).map((c: any) => c.id);
    if (clientIds.length === 0) return { plan: [] };

    // últimas fechas pedido
    const { data: pedidos } = await context.supabase
      .from("pedidos")
      .select("cliente_id, created_at, total")
      .in("cliente_id", clientIds);
    const lastMap = new Map<string, { last: string; count: number; total: number }>();
    for (const p of pedidos ?? []) {
      const c = lastMap.get(p.cliente_id) ?? { last: "", count: 0, total: 0 };
      if (p.created_at > c.last) c.last = p.created_at;
      c.count++;
      c.total += Number(p.total ?? 0);
      lastMap.set(p.cliente_id, c);
    }

    const { data: insights } = await context.supabase
      .from("rep_client_insights")
      .select("cliente_id, churn_risk_score, summary")
      .in("cliente_id", clientIds);
    const insightMap = new Map((insights ?? []).map((i: any) => [i.cliente_id, i]));

    const payload = (clientes ?? []).slice(0, 40).map((c: any) => {
      const s = lastMap.get(c.id);
      const i = insightMap.get(c.id) as any;
      const daysSince = s?.last
        ? Math.floor((Date.now() - new Date(s.last).getTime()) / 86400000)
        : null;
      return {
        cliente_id: c.id,
        nombre: c.nombre_comercial ?? c.razon_social,
        dias_desde_ultimo_pedido: daysSince,
        pedidos_12m: s?.count ?? 0,
        total_12m: Math.round(s?.total ?? 0),
        churn_risk: i?.churn_risk_score ?? null,
        resumen_ia: i?.summary ?? null,
      };
    });

    let plan: any[] = [];
    try {
      const resp = await openaiChat({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: DAILY_PLAN_SYSTEM },
          {
            role: "user",
            content: JSON.stringify({
              fecha: new Date().toISOString().slice(0, 10),
              origen: data.startLat && data.startLng ? { lat: data.startLat, lng: data.startLng } : null,
              clientes: payload,
            }),
          },
        ],
      });
      const raw = resp.choices?.[0]?.message?.content ?? "";
      const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
      plan = JSON.parse(cleaned).plan ?? [];
    } catch (err) {
      console.error("[rep daily plan] fallback", err);
      // Fallback: ordenar por churn + días sin pedido
      plan = payload
        .map((c) => ({
          cliente_id: c.cliente_id,
          score:
            (c.churn_risk ?? 0.3) * 100 +
            Math.min(c.dias_desde_ultimo_pedido ?? 90, 180) * 0.5,
          prioridad:
            (c.churn_risk ?? 0) > 0.6
              ? "urgente"
              : (c.dias_desde_ultimo_pedido ?? 0) > 45
                ? "oportunidad"
                : "seguimiento",
          razon: c.resumen_ia ?? "Priorización automática por historial",
          ventana_sugerida: "Hoy",
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map(({ score: _s, ...r }) => r);
    }

    return { plan };
  });

/* ─── 7. Check-in / Check-out ─── */
export const checkInFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clienteId: z.string().uuid(),
        lat: z.number().optional(),
        lng: z.number().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const rep = await getCurrentRep(context.supabase, context.userId);
    if (!rep) throw new Error("Solo representantes pueden hacer check-in");

    const { data: row, error } = await context.supabase
      .from("rep_visits")
      .insert({
        representante_id: rep.id,
        cliente_id: data.clienteId,
        check_in_at: new Date().toISOString(),
        check_in_lat: data.lat ?? null,
        check_in_lng: data.lng ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return { visit: row };
  });

export const checkOutFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        visitId: z.string().uuid(),
        lat: z.number().optional(),
        lng: z.number().optional(),
        notes: z.string().max(2000).optional(),
        outcome: z
          .enum(["pedido", "sin_pedido", "seguimiento", "incidencia"])
          .optional(),
        agreements: z
          .array(
            z.object({
              description: z.string().min(1).max(500),
              due_date: z.string().optional(),
            }),
          )
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("rep_visits")
      .update({
        check_out_at: new Date().toISOString(),
        check_out_lat: data.lat ?? null,
        check_out_lng: data.lng ?? null,
        notes: data.notes ?? null,
        outcome: data.outcome ?? null,
      })
      .eq("id", data.visitId);
    if (error) throw error;

    if (data.agreements && data.agreements.length > 0) {
      const rows = data.agreements.map((a) => ({
        visit_id: data.visitId,
        description: a.description,
        due_date: a.due_date ?? null,
      }));
      await context.supabase.from("rep_visit_agreements").insert(rows);
    }
    return { ok: true };
  });

/* ─── 8. listMyVisits ─── */
export const listMyVisitsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ limit: z.number().int().min(1).max(100).optional() })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("rep_visits")
      .select(
        "id, cliente_id, check_in_at, check_out_at, outcome, notes, check_in_lat, check_in_lng, clientes:cliente_id(razon_social, nombre_comercial, direccion)",
      )
      .order("check_in_at", { ascending: false })
      .limit(data.limit ?? 50);
    return { visits: rows ?? [] };
  });

/* ─── 9. optimizeRoute ─── */
export const optimizeRouteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        startLat: z.number(),
        startLng: z.number(),
        stops: z
          .array(
            z.object({
              cliente_id: z.string().uuid(),
              lat: z.number(),
              lng: z.number(),
            }),
          )
          .min(1)
          .max(20),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const origin = `${data.startLat},${data.startLng}`;
    const dest = data.stops[data.stops.length - 1];
    const destination = `${dest.lat},${dest.lng}`;
    const mid = data.stops.slice(0, -1).map((s) => `${s.lat},${s.lng}`);
    const resp = await googleDirections({
      origin,
      destination,
      waypoints: mid,
      optimize: true,
      mode: "driving",
    });
    if (resp.status !== "OK") {
      throw new Error(`Directions API: ${resp.status} ${resp.error_message ?? ""}`);
    }
    const route = resp.routes?.[0];
    const order = route?.waypoint_order ?? [];
    const legs = route?.legs ?? [];
    const totalMeters = legs.reduce(
      (a, l) => a + (l.distance?.value ?? 0),
      0,
    );
    const totalSecs = legs.reduce(
      (a, l) => a + (l.duration?.value ?? 0),
      0,
    );
    const orderedStops = [
      ...order.map((i) => data.stops[i]),
      data.stops[data.stops.length - 1],
    ];
    return {
      orderedStops,
      polyline: route?.overview_polyline?.points ?? null,
      total_km: Math.round(totalMeters / 100) / 10,
      total_minutes: Math.round(totalSecs / 60),
    };
  });

/* ─── 10. geocodeClient ─── */
export const geocodeClientFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ clienteId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: cliente } = await context.supabase
      .from("clientes")
      .select("id, direccion, codigo_postal, razon_social")
      .eq("id", data.clienteId)
      .maybeSingle();
    if (!cliente?.direccion) throw new Error("Cliente sin dirección");
    const q = `${cliente.direccion}, CP ${cliente.codigo_postal ?? ""}, México`;
    const res = await googleGeocode({ address: q });
    const loc = res.results?.[0]?.geometry?.location;
    if (!loc) throw new Error(`Geocode falló: ${res.status}`);
    await context.supabase
      .from("clientes")
      .update({ lat: loc.lat, lng: loc.lng })
      .eq("id", data.clienteId);
    return { lat: loc.lat, lng: loc.lng };
  });

/* ─── 11. quickInventoryLookup ─── */
export const quickInventoryLookupFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ q: z.string().min(1).max(100) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const term = `%${data.q}%`;
    const { data: rows } = await context.supabase
      .from("productos")
      .select(
        "id, nombre, sku, marca, laboratorio_id, precio_lista, stock_disponible, stock_en_camino, stock_comprometido, imagen_url",
      )
      .eq("activo", true)
      .or(`nombre.ilike.${term},sku.ilike.${term},marca.ilike.${term}`)
      .limit(30);
    const productIds = (rows ?? []).map((r: any) => r.id);
    let entryMap = new Map<string, { qty: number; eta: string | null }>();
    if (productIds.length > 0) {
      const { data: entries } = await context.supabase
        .from("stock_entries")
        .select("product_id, quantity, entry_date, entry_status")
        .in("product_id", productIds)
        .in("entry_status", ["transit", "pending", "in_transit"])
        .order("entry_date", { ascending: true });
      for (const e of entries ?? []) {
        if (!e.product_id) continue;
        const cur = entryMap.get(e.product_id) ?? { qty: 0, eta: null };
        cur.qty += Number(e.quantity ?? 0);
        if (!cur.eta || (e.entry_date && e.entry_date < cur.eta))
          cur.eta = e.entry_date;
        entryMap.set(e.product_id, cur);
      }
    }
    const enriched = (rows ?? []).map((p: any) => ({
      ...p,
      transit_qty: entryMap.get(p.id)?.qty ?? 0,
      transit_eta: entryMap.get(p.id)?.eta ?? null,
    }));
    return { productos: enriched };
  });
