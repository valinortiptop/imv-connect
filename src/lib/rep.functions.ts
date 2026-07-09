import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  openaiChat,
  geminiGenerate,
  googleGeocode,
  googleDirections,
} from "./valinor-proxy.server";
import {
  CLIENT_INSIGHTS_SYSTEM,
  DAILY_PLAN_SYSTEM,
  REP_COACHING_SYSTEM,
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

/* ─── FASE 2 ─────────────────────────────────────────────────────────────── */

/* Helper: obtiene clientes del rep (o todos si es admin) */
async function getScopedClientIds(supabase: any, userId: string) {
  const rep = await getCurrentRep(supabase, userId);
  let q = supabase.from("clientes").select("id, razon_social, nombre_comercial, zona").eq("active", true);
  if (rep) q = q.eq("representante_id", rep.id);
  const { data } = await q.limit(1000);
  return { rep, clientes: (data ?? []) as Array<{ id: string; razon_social: string; nombre_comercial: string | null; zona: string | null }> };
}

/* ─── 12. getLabRiskPanel ─── Detección de migración por laboratorio */
export const getLabRiskPanelFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { rep, clientes } = await getScopedClientIds(context.supabase, context.userId);
    const clientIds = clientes.map((c) => c.id);
    if (clientIds.length === 0) return { rep, labs: [] };

    // 4 meses de historia para comparar bloques de 60 días
    const since = new Date();
    since.setDate(since.getDate() - 120);

    const { data: pedidos } = await context.supabase
      .from("pedidos")
      .select("id, cliente_id, created_at")
      .in("cliente_id", clientIds)
      .gte("created_at", since.toISOString());

    const pedidoIds = (pedidos ?? []).map((p: any) => p.id);
    if (pedidoIds.length === 0) return { rep, labs: [] };

    const pedidoMeta = new Map(
      (pedidos ?? []).map((p: any) => [p.id, { cliente_id: p.cliente_id, created_at: p.created_at as string }]),
    );

    const { data: items } = await context.supabase
      .from("pedido_items")
      .select("pedido_id, producto_id, cantidad, importe")
      .in("pedido_id", pedidoIds);

    const productIds = Array.from(new Set((items ?? []).map((i: any) => i.producto_id).filter(Boolean)));
    if (productIds.length === 0) return { rep, labs: [] };

    const { data: productos } = await context.supabase
      .from("productos")
      .select("id, laboratorio_id")
      .in("id", productIds);
    const prodLab = new Map((productos ?? []).map((p: any) => [p.id, p.laboratorio_id]));

    const labIds = Array.from(new Set((productos ?? []).map((p: any) => p.laboratorio_id).filter(Boolean)));
    const { data: labs } = await context.supabase
      .from("laboratorios")
      .select("id, nombre")
      .in("id", labIds);
    const labName = new Map((labs ?? []).map((l: any) => [l.id, l.nombre]));

    const now = Date.now();
    const CUT_60 = now - 60 * 86400000;
    const CUT_120 = now - 120 * 86400000;

    type Agg = {
      lab_id: string;
      nombre: string;
      recent: number;
      previous: number;
      clientes_recent: Set<string>;
      clientes_prev: Set<string>;
      clientes_perdidos: Set<string>;
    };
    const agg = new Map<string, Agg>();

    // Track por (lab, cliente) para saber si un cliente dejó de comprar el lab
    const perLabClientRecent = new Map<string, Map<string, number>>();
    const perLabClientPrev = new Map<string, Map<string, number>>();

    for (const it of items ?? []) {
      const meta = pedidoMeta.get(it.pedido_id) as { cliente_id: string; created_at: string } | undefined;
      if (!meta) continue;
      const lab = prodLab.get(it.producto_id) as string | undefined;
      if (!lab) continue;
      const ts = new Date(meta.created_at).getTime();
      const bucket = ts >= CUT_60 ? "recent" : ts >= CUT_120 ? "previous" : null;
      if (!bucket) continue;
      const importe = Number(it.importe ?? 0);
      const cur = agg.get(lab) ?? {
        lab_id: lab,
        nombre: (labName.get(lab) as string) ?? "—",
        recent: 0,
        previous: 0,
        clientes_recent: new Set<string>(),
        clientes_prev: new Set<string>(),
        clientes_perdidos: new Set<string>(),
      };
      if (bucket === "recent") {
        cur.recent += importe;
        cur.clientes_recent.add(meta.cliente_id);
        const m = perLabClientRecent.get(lab) ?? new Map<string, number>();
        m.set(meta.cliente_id, (m.get(meta.cliente_id) ?? 0) + importe);
        perLabClientRecent.set(lab, m);
      } else {
        cur.previous += importe;
        cur.clientes_prev.add(meta.cliente_id);
        const m = perLabClientPrev.get(lab) ?? new Map<string, number>();
        m.set(meta.cliente_id, (m.get(meta.cliente_id) ?? 0) + importe);
        perLabClientPrev.set(lab, m);
      }
      agg.set(lab, cur);
    }

    const results = Array.from(agg.values())
      .map((a) => {
        const drop_pct = a.previous > 0 ? (a.previous - a.recent) / a.previous : a.recent > 0 ? -1 : 0;
        const prevClients = perLabClientPrev.get(a.lab_id) ?? new Map<string, number>();
        const recentClients = perLabClientRecent.get(a.lab_id) ?? new Map<string, number>();
        const perdidos: Array<{ cliente_id: string; nombre: string; importe_prev: number }> = [];
        for (const [cid, imp] of prevClients) {
          if (!recentClients.has(cid) && imp >= 500) {
            const c = clientes.find((x) => x.id === cid);
            perdidos.push({
              cliente_id: cid,
              nombre: c?.nombre_comercial ?? c?.razon_social ?? "Cliente",
              importe_prev: Math.round(imp),
            });
          }
        }
        perdidos.sort((a, b) => b.importe_prev - a.importe_prev);
        return {
          laboratorio_id: a.lab_id,
          nombre: a.nombre,
          importe_recent: Math.round(a.recent),
          importe_previous: Math.round(a.previous),
          drop_pct,
          clientes_recent: a.clientes_recent.size,
          clientes_previous: a.clientes_prev.size,
          clientes_perdidos: perdidos.slice(0, 8),
          risk_level:
            drop_pct >= 0.6 ? "alto" : drop_pct >= 0.3 ? "medio" : drop_pct >= 0.1 ? "bajo" : "estable",
        };
      })
      .filter((l) => l.importe_previous > 0 || l.importe_recent > 0)
      .sort((a, b) => b.drop_pct - a.drop_pct);

    return { rep, labs: results };
  });

/* ─── 13. getReorderPredictions ─── Predicción determinística de recompra */
export const getReorderPredictionsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ withinDays: z.number().int().min(1).max(60).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const within = data.withinDays ?? 10;
    const { rep, clientes } = await getScopedClientIds(context.supabase, context.userId);
    const clientIds = clientes.map((c) => c.id);
    if (clientIds.length === 0) return { rep, predictions: [] };

    const since = new Date();
    since.setMonth(since.getMonth() - 9);

    const { data: pedidos } = await context.supabase
      .from("pedidos")
      .select("id, cliente_id, created_at")
      .in("cliente_id", clientIds)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: true });

    const pedidoIds = (pedidos ?? []).map((p: any) => p.id);
    if (pedidoIds.length === 0) return { rep, predictions: [] };

    const pedidoMeta = new Map(
      (pedidos ?? []).map((p: any) => [p.id, { cliente_id: p.cliente_id, created_at: p.created_at as string }]),
    );

    const { data: items } = await context.supabase
      .from("pedido_items")
      .select("pedido_id, producto_id, cantidad, importe, nombre_snapshot")
      .in("pedido_id", pedidoIds);

    // Agrupar por (cliente, producto): fechas de compra + qty promedio
    type Key = string;
    const map = new Map<Key, { cliente_id: string; producto_id: string; nombre: string; dates: number[]; qtys: number[] }>();
    for (const it of items ?? []) {
      if (!it.producto_id) continue;
      const meta = pedidoMeta.get(it.pedido_id) as { cliente_id: string; created_at: string } | undefined;
      if (!meta) continue;
      const key = `${meta.cliente_id}:${it.producto_id}`;
      const cur = map.get(key) ?? {
        cliente_id: meta.cliente_id,
        producto_id: it.producto_id,
        nombre: it.nombre_snapshot ?? "",
        dates: [],
        qtys: [],
      };
      cur.dates.push(new Date(meta.created_at).getTime());
      cur.qtys.push(Number(it.cantidad ?? 0));
      map.set(key, cur);
    }

    const productIds = Array.from(new Set(Array.from(map.values()).map((v) => v.producto_id)));
    const { data: prods } = await context.supabase
      .from("productos")
      .select("id, nombre, sku, stock_disponible, precio_lista")
      .in("id", productIds);
    const prodMap = new Map((prods ?? []).map((p: any) => [p.id, p]));

    const now = Date.now();
    const predictions: any[] = [];
    for (const v of map.values()) {
      if (v.dates.length < 3) continue; // necesitamos histórico
      v.dates.sort((a, b) => a - b);
      const intervals: number[] = [];
      for (let i = 1; i < v.dates.length; i++) {
        intervals.push((v.dates[i] - v.dates[i - 1]) / 86400000);
      }
      // media móvil de los últimos 4 intervalos
      const recentInt = intervals.slice(-4);
      const avg = recentInt.reduce((a, b) => a + b, 0) / recentInt.length;
      if (!isFinite(avg) || avg < 3 || avg > 180) continue;
      const last = v.dates[v.dates.length - 1];
      const nextTs = last + avg * 86400000;
      const daysUntil = Math.round((nextTs - now) / 86400000);
      if (daysUntil > within || daysUntil < -within * 2) continue;
      const prod = prodMap.get(v.producto_id) as any;
      const qtyAvg = v.qtys.reduce((a, b) => a + b, 0) / v.qtys.length;
      const c = clientes.find((x) => x.id === v.cliente_id);
      predictions.push({
        cliente_id: v.cliente_id,
        cliente_nombre: c?.nombre_comercial ?? c?.razon_social ?? "Cliente",
        producto_id: v.producto_id,
        producto_nombre: prod?.nombre ?? v.nombre,
        sku: prod?.sku ?? null,
        stock_disponible: Number(prod?.stock_disponible ?? 0),
        precio_lista: Number(prod?.precio_lista ?? 0),
        qty_sugerida: Math.max(1, Math.round(qtyAvg)),
        cadencia_dias: Math.round(avg),
        probable_date: new Date(nextTs).toISOString().slice(0, 10),
        days_until: daysUntil,
        confidence:
          intervals.length >= 6 ? "alta" : intervals.length >= 4 ? "media" : "baja",
        urgency: daysUntil <= 0 ? "vencido" : daysUntil <= 3 ? "inmediato" : "proximo",
      });
    }

    predictions.sort((a, b) => a.days_until - b.days_until);
    return { rep, predictions: predictions.slice(0, 100) };
  });

/* ─── 14. generateRepAlerts ─── Genera notifications al rep */
export const generateRepAlertsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rep = await getCurrentRep(context.supabase, context.userId);

    // Recupera insights de riesgo alto
    let clientsQ = context.supabase
      .from("clientes")
      .select("id, nombre_comercial, razon_social, representante_id")
      .eq("active", true);
    if (rep) clientsQ = clientsQ.eq("representante_id", rep.id);
    const { data: clientes } = await clientsQ.limit(1000);
    const clientIds = (clientes ?? []).map((c: any) => c.id);
    if (clientIds.length === 0) return { created: 0 };

    const { data: insights } = await context.supabase
      .from("rep_client_insights")
      .select("cliente_id, churn_risk_score, summary, generated_at")
      .in("cliente_id", clientIds)
      .gte("churn_risk_score", 0.7);

    // Notificaciones ya enviadas hoy para no duplicar
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: existing } = await context.supabase
      .from("notifications")
      .select("route")
      .eq("user_id", context.userId)
      .eq("category", "rep_alert")
      .gte("created_at", todayStart.toISOString());
    const alreadySent = new Set((existing ?? []).map((n: any) => n.route));

    const rows: any[] = [];
    for (const ins of insights ?? []) {
      const c = (clientes ?? []).find((x: any) => x.id === ins.cliente_id);
      const route = `/rep/clientes/${ins.cliente_id}`;
      if (alreadySent.has(route)) continue;
      rows.push({
        user_id: context.userId,
        title: `⚠️ Riesgo alto: ${c?.nombre_comercial ?? c?.razon_social ?? "Cliente"}`,
        description: ins.summary?.slice(0, 200) ?? `Riesgo de pérdida ${(Number(ins.churn_risk_score) * 100).toFixed(0)}%`,
        category: "rep_alert",
        type: "churn",
        priority: "high",
        route,
      });
    }

    if (rows.length > 0) {
      await context.supabase.from("notifications").insert(rows);
    }
    return { created: rows.length };
  });

/* ─── FASE 3 ─────────────────────────────────────────────────────────────── */

/* 15. detectOverVisitedFn — clientes con >3 visitas sin pedido en 60 días */
export const detectOverVisitedFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rep = await getCurrentRep(context.supabase, context.userId);
    const since = new Date();
    since.setDate(since.getDate() - 60);

    let visitsQ = context.supabase
      .from("rep_visits")
      .select("id, cliente_id, representante_id, check_in_at, outcome")
      .gte("check_in_at", since.toISOString());
    if (rep) visitsQ = visitsQ.eq("representante_id", rep.id);
    const { data: visits } = await visitsQ;

    const byClient = new Map<string, { visits: number; withOrder: number; last: string }>();
    for (const v of visits ?? []) {
      const cur = byClient.get(v.cliente_id) ?? { visits: 0, withOrder: 0, last: "" };
      cur.visits += 1;
      if (v.outcome === "pedido") cur.withOrder += 1;
      if (v.check_in_at > cur.last) cur.last = v.check_in_at;
      byClient.set(v.cliente_id, cur);
    }

    const flagged = Array.from(byClient.entries())
      .filter(([, s]) => s.visits > 3 && s.withOrder === 0)
      .map(([cliente_id, s]) => ({ cliente_id, ...s }));

    if (flagged.length === 0) return { rep, clients: [] };

    const { data: clientes } = await context.supabase
      .from("clientes")
      .select("id, razon_social, nombre_comercial, telefono, phone, direccion, zona")
      .in("id", flagged.map((f) => f.cliente_id));
    const cmap = new Map((clientes ?? []).map((c: any) => [c.id, c]));

    const results = flagged
      .map((f) => {
        const c = cmap.get(f.cliente_id) as any;
        return {
          ...f,
          nombre: c?.nombre_comercial ?? c?.razon_social ?? "Cliente",
          telefono: c?.telefono ?? c?.phone ?? null,
          zona: c?.zona ?? null,
          direccion: c?.direccion ?? null,
        };
      })
      .sort((a, b) => b.visits - a.visits);

    return { rep, clients: results };
  });

/* 16. buildWeeklyPlanFn — plan semanal balanceado por zona/día */
export const buildWeeklyPlanFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ maxPerDay: z.number().int().min(1).max(20).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const maxPerDay = data.maxPerDay ?? 8;
    const { rep, clientes } = await getScopedClientIds(context.supabase, context.userId);
    if (clientes.length === 0) return { rep, week: [] };

    const clientIds = clientes.map((c) => c.id);
    const since = new Date();
    since.setDate(since.getDate() - 120);

    const { data: pedidos } = await context.supabase
      .from("pedidos")
      .select("cliente_id, created_at, total")
      .in("cliente_id", clientIds)
      .gte("created_at", since.toISOString());
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
      .select("cliente_id, churn_risk_score")
      .in("cliente_id", clientIds);
    const iMap = new Map((insights ?? []).map((i: any) => [i.cliente_id, Number(i.churn_risk_score ?? 0)]));

    // Score por cliente
    const now = Date.now();
    const scored = clientes
      .map((c) => {
        const s = lastMap.get(c.id);
        const daysSince = s?.last
          ? Math.floor((now - new Date(s.last).getTime()) / 86400000)
          : 999;
        const churn = iMap.get(c.id) ?? 0;
        const total = s?.total ?? 0;
        // score: mezcla riesgo, recencia, valor
        const score =
          churn * 100 +
          Math.min(daysSince, 180) * 0.6 +
          Math.log10(total + 1) * 8;
        return {
          cliente_id: c.id,
          nombre: c.nombre_comercial ?? c.razon_social,
          zona: c.zona ?? "sin_zona",
          churn,
          daysSince,
          total_12m: Math.round(total),
          score,
        };
      })
      .filter((x) => x.score > 25)
      .sort((a, b) => b.score - a.score);

    // Agrupar por zona; distribuir zonas a días (lun-vie)
    const zonas = Array.from(new Set(scored.map((s) => s.zona)));
    const days = ["lunes", "martes", "miércoles", "jueves", "viernes"];
    const week: Record<string, any[]> = Object.fromEntries(days.map((d) => [d, []]));

    // asignar zona → día (round-robin por prioridad de zona)
    const zoneOrder = zonas
      .map((z) => ({
        z,
        top: scored.filter((s) => s.zona === z).slice(0, maxPerDay * 2).length,
      }))
      .sort((a, b) => b.top - a.top)
      .map((x) => x.z);

    const zoneToDay = new Map<string, string>();
    zoneOrder.forEach((z, i) => zoneToDay.set(z, days[i % days.length]));

    for (const s of scored) {
      const day = zoneToDay.get(s.zona) ?? days[0];
      if (week[day].length < maxPerDay) {
        week[day].push({
          ...s,
          prioridad:
            s.churn >= 0.6 ? "urgente" : s.daysSince > 45 ? "oportunidad" : "seguimiento",
          razon:
            s.churn >= 0.6
              ? `Riesgo alto de pérdida (${Math.round(s.churn * 100)}%)`
              : s.daysSince > 60
                ? `Sin pedido hace ${s.daysSince} días`
                : `Valor 12m ${s.total_12m}`,
        });
      }
    }

    // rebalanceo: rellenar días que quedaron cortos con siguientes candidatos globales
    const already = new Set<string>();
    for (const d of days) for (const c of week[d]) already.add(c.cliente_id);
    for (const d of days) {
      let i = 0;
      while (week[d].length < maxPerDay && i < scored.length) {
        const cand = scored[i++];
        if (already.has(cand.cliente_id)) continue;
        week[d].push({
          ...cand,
          prioridad: cand.churn >= 0.6 ? "urgente" : "seguimiento",
          razon: `Zona: ${cand.zona}`,
        });
        already.add(cand.cliente_id);
      }
    }

    const weekArr = days.map((d) => ({
      dia: d,
      zona_principal: zoneOrder.find((z) => zoneToDay.get(z) === d) ?? null,
      clientes: week[d],
    }));

    return { rep, week: weekArr };
  });

/* 17. getOpportunityHeatmapFn — puntos ponderados por oportunidad */
export const getOpportunityHeatmapFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { rep, clientes } = await getScopedClientIds(context.supabase, context.userId);
    const clientIds = clientes.map((c) => c.id);
    if (clientIds.length === 0) return { rep, points: [] };

    // Necesitamos lat/lng — leer de tabla clientes
    const { data: rows } = await context.supabase
      .from("clientes")
      .select("id, razon_social, nombre_comercial, lat, lng")
      .in("id", clientIds)
      .not("lat", "is", null)
      .not("lng", "is", null);

    const { data: pedidos } = await context.supabase
      .from("pedidos")
      .select("cliente_id, created_at, total")
      .in("cliente_id", clientIds)
      .gte("created_at", new Date(Date.now() - 365 * 86400000).toISOString());

    const stats = new Map<string, { last: string; total: number; count: number }>();
    for (const p of pedidos ?? []) {
      const c = stats.get(p.cliente_id) ?? { last: "", total: 0, count: 0 };
      if (p.created_at > c.last) c.last = p.created_at;
      c.total += Number(p.total ?? 0);
      c.count += 1;
      stats.set(p.cliente_id, c);
    }

    const { data: insights } = await context.supabase
      .from("rep_client_insights")
      .select("cliente_id, churn_risk_score")
      .in("cliente_id", clientIds);
    const iMap = new Map(
      (insights ?? []).map((i: any) => [i.cliente_id, Number(i.churn_risk_score ?? 0)]),
    );

    const now = Date.now();
    const points = (rows ?? []).map((c: any) => {
      const s = stats.get(c.id);
      const daysSince = s?.last
        ? Math.floor((now - new Date(s.last).getTime()) / 86400000)
        : 999;
      const churn = iMap.get(c.id) ?? 0;
      const total = s?.total ?? 0;
      // weight 0..1
      const weight = Math.min(
        1,
        churn * 0.5 + Math.min(daysSince, 120) / 240 + Math.min(Math.log10(total + 1) / 6, 0.4),
      );
      return {
        cliente_id: c.id,
        nombre: c.nombre_comercial ?? c.razon_social,
        lat: Number(c.lat),
        lng: Number(c.lng),
        weight,
        churn,
        days_since_last: daysSince,
        total_12m: Math.round(total),
      };
    });

    return { rep, points };
  });

/* ─── FASE 4: Ejecución en visita ────────────────────────────────────────── */

/* 18. getReorderPrefillFn — sugerencias para levantar pedido rápido */
export const getReorderPrefillFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clienteId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // 1. Toma predicciones cacheadas si existen
    const { data: insights } = await context.supabase
      .from("rep_client_insights")
      .select("reorder_predictions, cross_sell")
      .eq("cliente_id", data.clienteId)
      .maybeSingle();

    // 2. Toma últimos productos comprados 6 meses (más consumidos primero)
    const since = new Date();
    since.setMonth(since.getMonth() - 6);
    const { data: pedidos } = await context.supabase
      .from("pedidos")
      .select("id")
      .eq("cliente_id", data.clienteId)
      .gte("created_at", since.toISOString());
    const pedidoIds = (pedidos ?? []).map((p: any) => p.id);

    const agg = new Map<string, { qty: number; last_price: number }>();
    if (pedidoIds.length > 0) {
      const { data: items } = await context.supabase
        .from("pedido_items")
        .select("producto_id, cantidad, precio_unitario")
        .in("pedido_id", pedidoIds);
      for (const it of items ?? []) {
        if (!it.producto_id) continue;
        const cur = agg.get(it.producto_id) ?? { qty: 0, last_price: 0 };
        cur.qty += Number(it.cantidad ?? 0);
        if (Number(it.precio_unitario) > 0) cur.last_price = Number(it.precio_unitario);
        agg.set(it.producto_id, cur);
      }
    }

    const productIds = Array.from(agg.keys());
    let productos: any[] = [];
    if (productIds.length > 0) {
      const { data } = await context.supabase
        .from("productos")
        .select("id, nombre, sku, precio_lista, stock_disponible, unidad")
        .in("id", productIds);
      productos = data ?? [];
    }

    // Precios especiales por cliente (con IVA)
    const [{ data: overrides }, { data: preciosCli }] = await Promise.all([
      context.supabase
        .from("client_price_overrides")
        .select("product_id, price_with_iva")
        .eq("client_id", data.clienteId),
      context.supabase
        .from("precios_cliente")
        .select("producto_id, precio, vigente_hasta")
        .eq("cliente_id", data.clienteId),
    ]);
    const ovMap = new Map((overrides ?? []).map((o: any) => [o.product_id, Number(o.price_with_iva)]));
    const pcMap = new Map<string, number>();
    for (const p of preciosCli ?? []) {
      if (p.vigente_hasta && new Date(p.vigente_hasta) < new Date()) continue;
      pcMap.set(p.producto_id, Number(p.precio));
    }

    const suggestions = productos
      .map((p: any) => {
        const s = agg.get(p.id)!;
        const overrideWithIva = ovMap.get(p.id);
        const preciosCliente = pcMap.get(p.id);
        // precio sin IVA sugerido: override / 1.16, o precios_cliente (sin IVA), o último, o lista
        const price = overrideWithIva
          ? Number((overrideWithIva / 1.16).toFixed(4))
          : preciosCliente ?? s.last_price ?? Number(p.precio_lista ?? 0);
        return {
          producto_id: p.id,
          nombre: p.nombre,
          sku: p.sku,
          unidad: p.unidad ?? "PZA",
          stock_disponible: Number(p.stock_disponible ?? 0),
          precio_sugerido: price,
          precio_lista: Number(p.precio_lista ?? 0),
          suggested_qty: Math.max(1, Math.round(s.qty / Math.max(1, pedidoIds.length))),
          source: overrideWithIva ? "override" : preciosCliente ? "precio_cliente" : "historico",
        };
      })
      .sort((a, b) => b.suggested_qty - a.suggested_qty)
      .slice(0, 30);

    return {
      suggestions,
      reorder_predictions: (insights?.reorder_predictions ?? []) as any[],
      cross_sell: (insights?.cross_sell ?? []) as any[],
    };
  });

/* 19. searchProductsForRepFn — búsqueda rápida por sku/nombre con precio efectivo */
export const searchProductsForRepFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ clienteId: z.string().uuid(), q: z.string().min(1).max(80) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const term = data.q.trim();
    const like = `%${term}%`;
    const { data: rows } = await context.supabase
      .from("productos")
      .select("id, nombre, sku, precio_lista, stock_disponible, unidad")
      .or(`nombre.ilike.${like},sku.ilike.${like}`)
      .limit(20);

    const productIds = (rows ?? []).map((p: any) => p.id);
    if (productIds.length === 0) return { results: [] };

    const [{ data: overrides }, { data: preciosCli }] = await Promise.all([
      context.supabase
        .from("client_price_overrides")
        .select("product_id, price_with_iva")
        .eq("client_id", data.clienteId)
        .in("product_id", productIds),
      context.supabase
        .from("precios_cliente")
        .select("producto_id, precio, vigente_hasta")
        .eq("cliente_id", data.clienteId)
        .in("producto_id", productIds),
    ]);
    const ovMap = new Map((overrides ?? []).map((o: any) => [o.product_id, Number(o.price_with_iva)]));
    const pcMap = new Map<string, number>();
    for (const p of preciosCli ?? []) {
      if (p.vigente_hasta && new Date(p.vigente_hasta) < new Date()) continue;
      pcMap.set(p.producto_id, Number(p.precio));
    }

    const results = (rows ?? []).map((p: any) => {
      const overrideWithIva = ovMap.get(p.id);
      const preciosCliente = pcMap.get(p.id);
      const price = overrideWithIva
        ? Number((overrideWithIva / 1.16).toFixed(4))
        : preciosCliente ?? Number(p.precio_lista ?? 0);
      return {
        producto_id: p.id,
        nombre: p.nombre,
        sku: p.sku,
        unidad: p.unidad ?? "PZA",
        stock_disponible: Number(p.stock_disponible ?? 0),
        precio_sugerido: price,
        precio_lista: Number(p.precio_lista ?? 0),
        source: overrideWithIva ? "override" : preciosCliente ? "precio_cliente" : "lista",
      };
    });
    return { results };
  });

/* 20. createRepOrderFn — inserta pedido + items desde una visita */
const RepOrderItem = z.object({
  producto_id: z.string().uuid(),
  nombre_snapshot: z.string().min(1),
  sku_snapshot: z.string().nullable().optional(),
  unidad_snapshot: z.string().default("PZA"),
  cantidad: z.number().positive(),
  precio_unitario: z.number().nonnegative(),
  iva_pct: z.number().min(0).max(1).default(0.16),
});

export const createRepOrderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clienteId: z.string().uuid(),
        items: z.array(RepOrderItem).min(1),
        notas_cliente: z.string().max(1000).optional(),
        notas_internas: z.string().max(1000).optional(),
        delivery_date: z.string().optional(),
        urgency: z.boolean().optional(),
        visitId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const rep = await getCurrentRep(context.supabase, context.userId);

    // Totales
    let subtotal = 0;
    let iva = 0;
    for (const it of data.items) {
      const imp = it.cantidad * it.precio_unitario;
      subtotal += imp;
      iva += imp * it.iva_pct;
    }
    subtotal = Number(subtotal.toFixed(2));
    iva = Number(iva.toFixed(2));
    const total = Number((subtotal + iva).toFixed(2));

    const folio = `PED-${Date.now().toString(36).toUpperCase()}`;

    const { data: pedido, error } = await context.supabase
      .from("pedidos")
      .insert({
        cliente_id: data.clienteId,
        representante_id: rep?.id ?? null,
        folio,
        estado: "pendiente",
        subtotal,
        iva,
        total,
        notas_cliente: data.notas_cliente ?? null,
        notas_internas: data.notas_internas ?? null,
        delivery_date: data.delivery_date ?? null,
        urgency: data.urgency ?? false,
      })
      .select("id, folio")
      .single();
    if (error) throw error;

    const itemRows = data.items.map((it) => ({
      pedido_id: pedido.id,
      producto_id: it.producto_id,
      nombre_snapshot: it.nombre_snapshot,
      sku_snapshot: it.sku_snapshot ?? null,
      unidad_snapshot: it.unidad_snapshot,
      cantidad: it.cantidad,
      precio_unitario: it.precio_unitario,
      iva_pct: it.iva_pct,
      importe: Number((it.cantidad * it.precio_unitario).toFixed(2)),
    }));
    const { error: itemsErr } = await context.supabase.from("pedido_items").insert(itemRows);
    if (itemsErr) throw itemsErr;

    if (data.visitId) {
      await context.supabase
        .from("rep_visits")
        .update({ pedido_id: pedido.id, outcome: "pedido" })
        .eq("id", data.visitId);
    }

    return { pedido };
  });

/* 21. createRepQuoteFn — cotización rápida */
export const createRepQuoteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clienteId: z.string().uuid(),
        items: z
          .array(
            z.object({
              product_id: z.string().uuid(),
              product_name: z.string().min(1),
              quantity: z.number().positive(),
              unit_price: z.number().nonnegative(),
            }),
          )
          .min(1),
        notes: z.string().max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const subtotal = Number(
      data.items.reduce((s, i) => s + i.quantity * i.unit_price, 0).toFixed(2),
    );
    const total = Number((subtotal * 1.16).toFixed(2));

    const { data: quote, error } = await context.supabase
      .from("quotes")
      .insert({
        client_id: data.clienteId,
        created_by: context.userId,
        source: "rep",
        status: "draft",
        notes: data.notes ?? null,
        subtotal,
        total,
      })
      .select("id")
      .single();
    if (error) throw error;

    const rows = data.items.map((i) => ({
      quote_id: quote.id,
      product_id: i.product_id,
      product_name: i.product_name,
      quantity: i.quantity,
      unit_price: i.unit_price,
    }));
    const { error: iErr } = await context.supabase.from("quote_items").insert(rows);
    if (iErr) throw iErr;

    return { quote };
  });

/* 22. attachVisitEvidenceFn — asocia fotos/firma a una visita */
export const attachVisitEvidenceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        visitId: z.string().uuid(),
        photoPaths: z.array(z.string()).optional(),
        signaturePath: z.string().optional(),
        signedByName: z.string().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: any = {};
    if (data.photoPaths !== undefined) patch.photo_paths = data.photoPaths;
    if (data.signaturePath !== undefined) patch.signature_path = data.signaturePath;
    if (data.signedByName !== undefined) patch.signed_by_name = data.signedByName;
    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await context.supabase
      .from("rep_visits")
      .update(patch)
      .eq("id", data.visitId);
    if (error) throw error;
    return { ok: true };
  });

/* 23. getVisitEvidenceUrlsFn — signed read URLs para mostrar fotos/firma */
export const getVisitEvidenceUrlsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ visitId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: visit } = await context.supabase
      .from("rep_visits")
      .select("photo_paths, signature_path, signed_by_name")
      .eq("id", data.visitId)
      .maybeSingle();
    if (!visit) return { photos: [], signatureUrl: null, signedByName: null };

    const paths: string[] = [
      ...((visit.photo_paths as string[]) ?? []),
      ...(visit.signature_path ? [visit.signature_path as string] : []),
    ];
    const urls = new Map<string, string>();
    if (paths.length > 0) {
      const { data: signed } = await context.supabase.storage
        .from("rep-evidence")
        .createSignedUrls(paths, 60 * 30);
      for (const s of signed ?? []) {
        if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
      }
    }
    return {
      photos: ((visit.photo_paths as string[]) ?? []).map((p) => ({ path: p, url: urls.get(p) ?? null })),
      signatureUrl: visit.signature_path ? urls.get(visit.signature_path as string) ?? null : null,
      signedByName: (visit.signed_by_name as string | null) ?? null,
    };
  });

/* ─── Phase 5 helpers ─── */
async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Solo administradores");
}

function startOfWeek(d = new Date()) {
  const x = new Date(d);
  const day = x.getDay(); // 0 sun ... 1 mon
  const diff = (day + 6) % 7; // days since monday
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

/* ─── getSupervisorDashboardFn (admin) ─── */
export const getSupervisorDashboardFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ days: z.number().int().min(1).max(180).default(30) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const since = new Date();
    since.setDate(since.getDate() - data.days);
    const sinceIso = since.toISOString();

    const { data: reps } = await context.supabase
      .from("representantes")
      .select("id, nombre, activo")
      .eq("activo", true);

    const repIds = (reps ?? []).map((r: any) => r.id);
    if (repIds.length === 0) return { rows: [], since: sinceIso, totals: { visits: 0, pedidos: 0, ventas: 0 } };

    const [{ data: visits }, { data: pedidos }] = await Promise.all([
      context.supabase
        .from("rep_visits")
        .select("representante_id, cliente_id, outcome, check_in_at, check_out_at, pedido_id")
        .in("representante_id", repIds)
        .gte("check_in_at", sinceIso),
      context.supabase
        .from("pedidos")
        .select("id, representante_id, total, created_at, cliente_id")
        .in("representante_id", repIds)
        .gte("created_at", sinceIso),
    ]);

    type Row = {
      rep_id: string;
      rep_nombre: string;
      visitas: number;
      pedidos: number;
      ratio: number;
      ventas: number;
      clientes_unicos: number;
      duracion_prom_min: number;
      ticket_prom: number;
    };
    const rows: Row[] = (reps ?? []).map((r: any) => {
      const vs = (visits ?? []).filter((v: any) => v.representante_id === r.id);
      const ps = (pedidos ?? []).filter((p: any) => p.representante_id === r.id);
      const durs: number[] = [];
      for (const v of vs) {
        if (v.check_in_at && v.check_out_at) {
          const d = (new Date(v.check_out_at).getTime() - new Date(v.check_in_at).getTime()) / 60000;
          if (d > 0 && d < 480) durs.push(d);
        }
      }
      const ventas = ps.reduce((a: number, p: any) => a + Number(p.total ?? 0), 0);
      const clientesUnicos = new Set(vs.map((v: any) => v.cliente_id).filter(Boolean)).size;
      return {
        rep_id: r.id,
        rep_nombre: r.nombre,
        visitas: vs.length,
        pedidos: ps.length,
        ratio: vs.length > 0 ? ps.length / vs.length : 0,
        ventas: Math.round(ventas),
        clientes_unicos: clientesUnicos,
        duracion_prom_min: durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : 0,
        ticket_prom: ps.length ? Math.round(ventas / ps.length) : 0,
      };
    });
    rows.sort((a, b) => b.ventas - a.ventas);

    const totals = {
      visits: rows.reduce((a, r) => a + r.visitas, 0),
      pedidos: rows.reduce((a, r) => a + r.pedidos, 0),
      ventas: rows.reduce((a, r) => a + r.ventas, 0),
    };
    return { rows, since: sinceIso, totals };
  });

/* ─── getRepKpisFn: KPIs del rep actual (o admin especifica repId) ─── */
export const getRepKpisFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        repId: z.string().uuid().optional(),
        days: z.number().int().min(1).max(180).default(7),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let repId = data.repId;
    if (!repId) {
      const rep = await getCurrentRep(context.supabase, context.userId);
      if (!rep) throw new Error("Sin representante ligado");
      repId = rep.id;
    }
    const since = new Date();
    since.setDate(since.getDate() - data.days);
    const sinceIso = since.toISOString();

    const [{ data: visits }, { data: pedidos }] = await Promise.all([
      context.supabase
        .from("rep_visits")
        .select("id, cliente_id, outcome, check_in_at, check_out_at")
        .eq("representante_id", repId)
        .gte("check_in_at", sinceIso),
      context.supabase
        .from("pedidos")
        .select("id, cliente_id, total, created_at")
        .eq("representante_id", repId)
        .gte("created_at", sinceIso),
    ]);

    const durs: number[] = [];
    for (const v of visits ?? []) {
      if (v.check_in_at && v.check_out_at) {
        const d = (new Date(v.check_out_at).getTime() - new Date(v.check_in_at).getTime()) / 60000;
        if (d > 0 && d < 480) durs.push(d);
      }
    }
    const ventas = (pedidos ?? []).reduce((a: number, p: any) => a + Number(p.total ?? 0), 0);
    return {
      repId,
      days: data.days,
      visitas: (visits ?? []).length,
      pedidos: (pedidos ?? []).length,
      ratio: (visits ?? []).length ? (pedidos ?? []).length / (visits ?? []).length : 0,
      ventas: Math.round(ventas),
      clientes_unicos: new Set((visits ?? []).map((v: any) => v.cliente_id).filter(Boolean)).size,
      duracion_prom_min: durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : 0,
      ticket_prom: (pedidos ?? []).length ? Math.round(ventas / (pedidos ?? []).length) : 0,
    };
  });

/* ─── generateRepCoachingFn: Gemini analiza KPIs y guarda coaching semanal ─── */
export const generateRepCoachingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ repId: z.string().uuid().optional(), force: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    let repId = data.repId;
    if (!repId) {
      const rep = await getCurrentRep(context.supabase, context.userId);
      if (!rep) throw new Error("Sin representante ligado");
      repId = rep.id;
    }
    const weekStart = startOfWeek();
    const weekStartIso = weekStart.toISOString().slice(0, 10);

    if (!data.force) {
      const { data: cached } = await context.supabase
        .from("rep_coaching")
        .select("*")
        .eq("rep_id", repId)
        .eq("week_start", weekStartIso)
        .maybeSingle();
      if (cached) return { coaching: cached, cached: true };
    }

    // KPIs 7d actuales y 7d previos
    const now = new Date();
    const w1 = new Date(now); w1.setDate(w1.getDate() - 7);
    const w2 = new Date(now); w2.setDate(w2.getDate() - 14);

    const [{ data: v1 }, { data: v2 }, { data: p1 }, { data: p2 }] = await Promise.all([
      context.supabase.from("rep_visits").select("id, outcome, check_in_at, check_out_at, cliente_id").eq("representante_id", repId).gte("check_in_at", w1.toISOString()),
      context.supabase.from("rep_visits").select("id, outcome, check_in_at, check_out_at, cliente_id").eq("representante_id", repId).gte("check_in_at", w2.toISOString()).lt("check_in_at", w1.toISOString()),
      context.supabase.from("pedidos").select("id, total, created_at").eq("representante_id", repId).gte("created_at", w1.toISOString()),
      context.supabase.from("pedidos").select("id, total, created_at").eq("representante_id", repId).gte("created_at", w2.toISOString()).lt("created_at", w1.toISOString()),
    ]);

    const kpi = (visits: any[], pedidos: any[]) => {
      const durs: number[] = [];
      for (const v of visits) {
        if (v.check_in_at && v.check_out_at) {
          const d = (new Date(v.check_out_at).getTime() - new Date(v.check_in_at).getTime()) / 60000;
          if (d > 0 && d < 480) durs.push(d);
        }
      }
      const ventas = pedidos.reduce((a: number, p: any) => a + Number(p.total ?? 0), 0);
      return {
        visitas: visits.length,
        pedidos: pedidos.length,
        ratio: visits.length ? pedidos.length / visits.length : 0,
        ventas: Math.round(ventas),
        clientes_unicos: new Set(visits.map((v: any) => v.cliente_id).filter(Boolean)).size,
        duracion_prom_min: durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : 0,
      };
    };
    const kpisNow = kpi(v1 ?? [], p1 ?? []);
    const kpisPrev = kpi(v2 ?? [], p2 ?? []);

    let coachingJson: any = null;
    try {
      const resp = await geminiGenerate({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  REP_COACHING_SYSTEM +
                  "\n\nKPIs semana actual: " +
                  JSON.stringify(kpisNow) +
                  "\nKPIs semana anterior: " +
                  JSON.stringify(kpisPrev),
              },
            ],
          },
        ],
      });
      const text: string =
        (resp as any)?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const clean = text.replace(/```json\s*|```/g, "").trim();
      coachingJson = JSON.parse(clean);
    } catch {
      // Fallback determinístico
      const ratioTrend = kpisNow.ratio - kpisPrev.ratio;
      const ventasTrend = kpisNow.ventas - kpisPrev.ventas;
      coachingJson = {
        summary: `Semana con ${kpisNow.visitas} visitas y ${kpisNow.pedidos} pedidos (ratio ${(kpisNow.ratio * 100).toFixed(0)}%). Ventas $${kpisNow.ventas.toLocaleString("es-MX")}.`,
        strengths: [
          kpisNow.visitas >= kpisPrev.visitas ? "Mantuviste ritmo de visitas" : "Actividad de campo constante",
          kpisNow.ratio >= 0.4 ? "Buen ratio de cierre" : "Cobertura amplia de clientes",
        ].filter(Boolean),
        improvements: [
          ratioTrend < 0 ? "Ratio visita→pedido cayó; enfoca a clientes con recompra probable" : "Sube el ticket promedio con cross-sell sugerido por IA",
          kpisNow.duracion_prom_min < 15 ? "Visitas muy cortas; profundiza en necesidades" : "Optimiza tiempo por cliente",
        ],
        goals: [
          { titulo: "Aumentar cierres", meta: `+${Math.max(1, Math.ceil(kpisNow.pedidos * 0.1))} pedidos`, kpi: "pedidos" },
          { titulo: "Ventas", meta: `+10% vs $${kpisNow.ventas.toLocaleString("es-MX")}`, kpi: "ventas" },
          { titulo: "Ratio", meta: "≥ 45%", kpi: "ratio" },
        ],
      };
      void ventasTrend;
    }

    const row = {
      rep_id: repId,
      week_start: weekStartIso,
      summary: String(coachingJson.summary ?? "").slice(0, 500),
      strengths: coachingJson.strengths ?? [],
      improvements: coachingJson.improvements ?? [],
      goals: coachingJson.goals ?? [],
      kpis: { current: kpisNow, previous: kpisPrev },
    };
    const { data: saved, error } = await context.supabase
      .from("rep_coaching")
      .upsert(row, { onConflict: "rep_id,week_start" })
      .select()
      .maybeSingle();
    if (error) throw error;
    return { coaching: saved, cached: false };
  });

/* ─── getGamificationFn: puntos + badges + ranking ─── */
export const getGamificationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rep = await getCurrentRep(context.supabase, context.userId);
    const isAdmin = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });

    // Ventana: últimos 30 días
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceIso = since.toISOString();

    const { data: reps } = await context.supabase
      .from("representantes")
      .select("id, nombre, activo")
      .eq("activo", true);
    const repIds = (reps ?? []).map((r: any) => r.id);
    if (repIds.length === 0) return { me: null, ranking: [], badges: [] };

    const [{ data: visits }, { data: pedidos }] = await Promise.all([
      context.supabase.from("rep_visits").select("representante_id, outcome").in("representante_id", repIds).gte("check_in_at", sinceIso),
      context.supabase.from("pedidos").select("representante_id, total").in("representante_id", repIds).gte("created_at", sinceIso),
    ]);

    // 10 pts / visita, 50 pts / pedido, 1 pt / $1000 vendidos
    const ranking = (reps ?? []).map((r: any) => {
      const v = (visits ?? []).filter((x: any) => x.representante_id === r.id).length;
      const ps = (pedidos ?? []).filter((x: any) => x.representante_id === r.id);
      const ventas = ps.reduce((a: number, p: any) => a + Number(p.total ?? 0), 0);
      const puntos = v * 10 + ps.length * 50 + Math.floor(ventas / 1000);
      return { rep_id: r.id, nombre: r.nombre, visitas: v, pedidos: ps.length, ventas: Math.round(ventas), puntos };
    });
    ranking.sort((a, b) => b.puntos - a.puntos);
    ranking.forEach((r, i) => ((r as any).rank = i + 1));

    const me = rep ? ranking.find((r) => r.rep_id === rep.id) ?? null : null;

    // Badges dinámicos según logros
    const badges: Array<{ code: string; label: string; description: string; earned: boolean }> = [];
    if (me) {
      badges.push({
        code: "first_10_visits",
        label: "Explorador",
        description: "10 visitas en 30 días",
        earned: me.visitas >= 10,
      });
      badges.push({
        code: "closer",
        label: "Cerrador",
        description: "10 pedidos en 30 días",
        earned: me.pedidos >= 10,
      });
      badges.push({
        code: "top3",
        label: "Top 3",
        description: "Entre los 3 mejores",
        earned: me.rank <= 3,
      });
      badges.push({
        code: "high_ticket",
        label: "Ticket alto",
        description: "$100k en ventas / 30 días",
        earned: me.ventas >= 100000,
      });
    }
    return { me, ranking: isAdmin.data ? ranking : ranking.slice(0, 10), badges };
  });
