import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* Helpers */
async function getScopedRep(supabase: any, userId: string) {
  const { data } = await supabase
    .from("representantes")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  return data as { id: string } | null;
}

async function assertClientAccess(supabase: any, userId: string, clienteId: string) {
  // admin sees all
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
  if (isAdmin) return { isAdmin, rep: null as { id: string } | null };

  const rep = await getScopedRep(supabase, userId);
  if (!rep) throw new Error("Sin acceso");
  const { data: c } = await supabase
    .from("clientes")
    .select("id, representante_id")
    .eq("id", clienteId)
    .maybeSingle();
  if (!c || c.representante_id !== rep.id) throw new Error("Cliente fuera de tu cartera");
  return { isAdmin: false, rep };
}

const MS_DAY = 24 * 60 * 60 * 1000;

/* ─── 1. getClientProductBehavior ─── Deserción y variación de consumo por SKU */
export const getClientProductBehaviorFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ clienteId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertClientAccess(context.supabase, context.userId, data.clienteId);

    const since = new Date();
    since.setMonth(since.getMonth() - 12);

    const { data: pedidos } = await context.supabase
      .from("pedidos")
      .select("id, created_at, total")
      .eq("cliente_id", data.clienteId)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: true });

    const pedidoIds = (pedidos ?? []).map((p: any) => p.id);
    if (pedidoIds.length === 0)
      return { sku_behavior: [], ticket_trend: [] as Array<{ month: string; total: number; orders: number }> };

    // Ticket trend por mes
    const monthMap = new Map<string, { total: number; orders: number }>();
    for (const p of pedidos ?? []) {
      const d = new Date(p.created_at);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      const cur = monthMap.get(key) ?? { total: 0, orders: 0 };
      cur.total += Number(p.total ?? 0);
      cur.orders += 1;
      monthMap.set(key, cur);
    }
    const ticket_trend = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, total: Math.round(v.total), orders: v.orders }));

    // Items agrupados por SKU
    const { data: items } = await context.supabase
      .from("pedido_items")
      .select("pedido_id, producto_id, cantidad, importe")
      .in("pedido_id", pedidoIds);

    const pMeta = new Map<string, number>(
      (pedidos ?? []).map((p: any) => [p.id, new Date(p.created_at).getTime()]),
    );

    const skuStats = new Map<
      string,
      { qty: number; qtyRecent: number; qtyPrev: number; dates: number[]; revenue: number }
    >();
    const now = Date.now();
    const cut = now - 90 * MS_DAY; // recent = last 90d, prev = 90-180d
    const prevCut = now - 180 * MS_DAY;

    for (const it of (items ?? []) as any[]) {
      const t = pMeta.get(it.pedido_id);
      if (!t) continue;
      const cur = skuStats.get(it.producto_id) ?? {
        qty: 0,
        qtyRecent: 0,
        qtyPrev: 0,
        dates: [],
        revenue: 0,
      };
      const qty = Number(it.cantidad ?? 0);
      cur.qty += qty;
      cur.revenue += Number(it.importe ?? 0);
      cur.dates.push(t);
      if (t >= cut) cur.qtyRecent += qty;
      else if (t >= prevCut) cur.qtyPrev += qty;
      skuStats.set(it.producto_id, cur);
    }

    const productIds = Array.from(skuStats.keys());
    if (productIds.length === 0) return { sku_behavior: [], ticket_trend };

    const { data: productos } = await context.supabase
      .from("productos")
      .select("id, nombre, sku, marca, laboratorio_id, stock_disponible, precio_lista, imagen_url")
      .in("id", productIds);
    const pmap = new Map((productos ?? []).map((p: any) => [p.id, p]));

    const sku_behavior = productIds
      .map((pid) => {
        const s = skuStats.get(pid)!;
        s.dates.sort();
        const gaps: number[] = [];
        for (let i = 1; i < s.dates.length; i++) {
          gaps.push((s.dates[i] - s.dates[i - 1]) / MS_DAY);
        }
        const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
        const lastTs = s.dates[s.dates.length - 1];
        const daysSinceLast = Math.floor((now - lastTs) / MS_DAY);
        const delta =
          s.qtyPrev > 0 ? (s.qtyRecent - s.qtyPrev) / s.qtyPrev : s.qtyRecent > 0 ? 1 : 0;

        let status: "activo" | "en_baja" | "dormido" | "perdido" | "subiendo";
        if (avgGap != null && daysSinceLast > avgGap * 3) status = "perdido";
        else if (avgGap != null && daysSinceLast > avgGap * 1.8) status = "dormido";
        else if (delta <= -0.3) status = "en_baja";
        else if (delta >= 0.3) status = "subiendo";
        else status = "activo";

        const p = pmap.get(pid);
        return {
          producto_id: pid,
          nombre: p?.nombre ?? "Producto",
          sku: p?.sku ?? "",
          marca: p?.marca ?? null,
          laboratorio_id: p?.laboratorio_id ?? null,
          imagen_url: p?.imagen_url ?? null,
          stock_disponible: Number(p?.stock_disponible ?? 0),
          precio_lista: p?.precio_lista != null ? Number(p.precio_lista) : null,
          qty_12m: s.qty,
          qty_recent_90d: s.qtyRecent,
          qty_prev_90d: s.qtyPrev,
          revenue_12m: Math.round(s.revenue),
          avg_gap_days: avgGap != null ? Math.round(avgGap) : null,
          days_since_last: daysSinceLast,
          delta_pct: Math.round(delta * 100),
          status,
        };
      })
      .sort((a, b) => b.revenue_12m - a.revenue_12m);

    return { sku_behavior, ticket_trend };
  });

/* ─── 2. getMissedOpportunities ─── Oportunidades no aprovechadas */
export const getMissedOpportunitiesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ clienteId: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const rep = await getScopedRep(context.supabase, context.userId);

    // Base: clientes en scope
    let clientsQ = context.supabase
      .from("clientes")
      .select("id, razon_social, nombre_comercial")
      .eq("active", true);
    if (rep) clientsQ = clientsQ.eq("representante_id", rep.id);
    if (data.clienteId) clientsQ = clientsQ.eq("id", data.clienteId);
    const { data: clientes } = await clientsQ.limit(500);
    const clientIds = (clientes ?? []).map((c: any) => c.id);
    if (clientIds.length === 0) return { opportunities: [] };
    const cmap = new Map((clientes ?? []).map((c: any) => [c.id, c]));

    // 1. Reorder predictions vencidas
    const { data: preds } = await context.supabase
      .from("rep_client_insights")
      .select("cliente_id, reorder_predictions, generated_at")
      .in("cliente_id", clientIds);

    const now = Date.now();
    const opportunities: Array<{
      cliente_id: string;
      cliente: string;
      type: string;
      title: string;
      detail: string;
      severity: "alto" | "medio" | "bajo";
    }> = [];

    for (const row of preds ?? []) {
      const predictions = (row.reorder_predictions ?? []) as any[];
      for (const p of predictions) {
        if (!p?.expected_date) continue;
        const daysLate = Math.floor((now - new Date(p.expected_date).getTime()) / MS_DAY);
        if (daysLate > 0 && daysLate < 60) {
          const c = cmap.get(row.cliente_id);
          opportunities.push({
            cliente_id: row.cliente_id,
            cliente: c?.nombre_comercial ?? c?.razon_social ?? "Cliente",
            type: "reorder_overdue",
            title: p.nombre ?? "Producto",
            detail: `Recompra esperada hace ${daysLate}d`,
            severity: daysLate > 15 ? "alto" : daysLate > 7 ? "medio" : "bajo",
          });
        }
      }
    }

    // 2. Visitas cerradas hoy sin pedido
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { data: visitas } = await context.supabase
      .from("rep_visits")
      .select("id, cliente_id, ended_at")
      .in("cliente_id", clientIds)
      .gte("ended_at", startOfDay.toISOString())
      .not("ended_at", "is", null);

    const visitedIds = new Set((visitas ?? []).map((v: any) => v.cliente_id));
    if (visitedIds.size > 0) {
      const { data: todayOrders } = await context.supabase
        .from("pedidos")
        .select("cliente_id")
        .in("cliente_id", Array.from(visitedIds))
        .gte("created_at", startOfDay.toISOString());
      const orderedIds = new Set((todayOrders ?? []).map((o: any) => o.cliente_id));
      for (const cid of visitedIds) {
        if (!orderedIds.has(cid)) {
          const c = cmap.get(cid);
          opportunities.push({
            cliente_id: cid,
            cliente: c?.nombre_comercial ?? c?.razon_social ?? "Cliente",
            type: "visit_no_order",
            title: "Visita sin pedido",
            detail: "Cerró visita hoy sin levantar pedido",
            severity: "medio",
          });
        }
      }
    }

    // 3. Promos activas no ofrecidas (últimas 30d)
    const todayIso = new Date().toISOString().slice(0, 10);
    const { data: promos } = await context.supabase
      .from("product_promotions")
      .select("id, product_id, promo_name, valid_to")
      .eq("active", true)
      .lte("valid_from", todayIso)
      .gte("valid_to", todayIso)
      .limit(50);

    if ((promos ?? []).length > 0) {
      const promoProductIds = ((promos ?? []) as any[])
        .map((p) => p.product_id)
        .filter(Boolean);
      const since30 = new Date();
      since30.setDate(since30.getDate() - 30);
      const { data: recentPedidos } = await context.supabase
        .from("pedidos")
        .select("id, cliente_id")
        .in("cliente_id", clientIds)
        .gte("created_at", since30.toISOString());
      const recentIds = (recentPedidos ?? []).map((p: any) => p.id);
      let itemsRecentByProduct = new Map<string, Set<string>>(); // producto_id -> clientes
      if (recentIds.length > 0 && promoProductIds.length > 0) {
        const { data: items } = await context.supabase
          .from("pedido_items")
          .select("pedido_id, producto_id")
          .in("pedido_id", recentIds)
          .in("producto_id", promoProductIds);
        const pMeta = new Map<string, string>(
          (recentPedidos ?? []).map((p: any) => [p.id, p.cliente_id]),
        );
        for (const it of (items ?? []) as any[]) {
          const cid = pMeta.get(it.pedido_id);
          if (!cid) continue;
          if (!itemsRecentByProduct.has(it.producto_id))
            itemsRecentByProduct.set(it.producto_id, new Set());
          itemsRecentByProduct.get(it.producto_id)!.add(cid);
        }
      }

      // Solo top 3 promos por severidad para no saturar
      for (const promo of ((promos ?? []) as any[]).slice(0, 3)) {
        const bought = itemsRecentByProduct.get(promo.product_id) ?? new Set();
        for (const cid of clientIds.slice(0, 20)) {
          if (bought.has(cid)) continue;
          const c = cmap.get(cid);
          opportunities.push({
            cliente_id: cid,
            cliente: c?.nombre_comercial ?? c?.razon_social ?? "Cliente",
            type: "promo_not_offered",
            title: promo.promo_name ?? "Promoción activa",
            detail: `Vence ${String(promo.valid_to).slice(0, 10)}`,
            severity: "bajo",
          });
        }
      }
    }

    return { opportunities: opportunities.slice(0, 100) };
  });

/* ─── 3. Competitor migrations ─── */
export const listCompetitorMigrationsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ clienteId: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("competitor_migrations")
      .select("id, cliente_id, laboratorio_id, competitor_name, motivo, source, detected_at, evidence_url")
      .order("detected_at", { ascending: false })
      .limit(200);
    if (data.clienteId) q = q.eq("cliente_id", data.clienteId);
    const { data: rows, error } = await q;
    if (error) throw error;

    const clientIds = Array.from(new Set((rows ?? []).map((r: any) => r.cliente_id)));
    const labIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.laboratorio_id).filter(Boolean)),
    );
    const [{ data: cs }, { data: ls }] = await Promise.all([
      clientIds.length
        ? context.supabase
            .from("clientes")
            .select("id, razon_social, nombre_comercial")
            .in("id", clientIds)
        : Promise.resolve({ data: [] as any[] }),
      labIds.length
        ? context.supabase.from("laboratorios").select("id, nombre").in("id", labIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const cmap = new Map((cs ?? []).map((c: any) => [c.id, c]));
    const lmap = new Map((ls ?? []).map((l: any) => [l.id, l]));

    return {
      migrations: (rows ?? []).map((r: any) => ({
        ...r,
        cliente_nombre:
          cmap.get(r.cliente_id)?.nombre_comercial ??
          cmap.get(r.cliente_id)?.razon_social ??
          "Cliente",
        laboratorio_nombre: r.laboratorio_id ? lmap.get(r.laboratorio_id)?.nombre ?? null : null,
      })),
    };
  });

export const createCompetitorMigrationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clienteId: z.string().uuid(),
        laboratorioId: z.string().uuid().optional().nullable(),
        competitorName: z.string().min(1).max(200),
        motivo: z.string().max(1000).optional(),
        evidenceUrl: z.string().url().optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const rep = await getScopedRep(context.supabase, context.userId);
    const { error, data: row } = await context.supabase
      .from("competitor_migrations")
      .insert({
        cliente_id: data.clienteId,
        laboratorio_id: data.laboratorioId ?? null,
        competitor_name: data.competitorName,
        motivo: data.motivo ?? null,
        evidence_url: data.evidenceUrl ?? null,
        representante_id: rep?.id ?? null,
        created_by: context.userId,
        source: "rep",
      })
      .select()
      .single();
    if (error) throw error;
    return { migration: row };
  });

export const getCompetitiveLandscapeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rep = await getScopedRep(context.supabase, context.userId);
    let q = context.supabase
      .from("competitor_migrations")
      .select("competitor_name, laboratorio_id, cliente_id, detected_at, representante_id");
    if (rep) q = q.eq("representante_id", rep.id);
    const { data: rows } = await q.limit(2000);

    const byCompetitor = new Map<string, { count: number; clientes: Set<string> }>();
    const byLab = new Map<string, { count: number; competitors: Map<string, number> }>();
    for (const r of rows ?? []) {
      const c = byCompetitor.get(r.competitor_name) ?? { count: 0, clientes: new Set() };
      c.count += 1;
      c.clientes.add(r.cliente_id);
      byCompetitor.set(r.competitor_name, c);

      if (r.laboratorio_id) {
        const l = byLab.get(r.laboratorio_id) ?? { count: 0, competitors: new Map() };
        l.count += 1;
        l.competitors.set(r.competitor_name, (l.competitors.get(r.competitor_name) ?? 0) + 1);
        byLab.set(r.laboratorio_id, l);
      }
    }

    const labIds = Array.from(byLab.keys());
    const { data: labs } = labIds.length
      ? await context.supabase.from("laboratorios").select("id, nombre").in("id", labIds)
      : { data: [] as any[] };
    const lmap = new Map((labs ?? []).map((l: any) => [l.id, l.nombre]));

    return {
      competitors: Array.from(byCompetitor.entries())
        .map(([name, v]) => ({
          competitor_name: name,
          menciones: v.count,
          clientes: v.clientes.size,
        }))
        .sort((a, b) => b.menciones - a.menciones),
      labs_perdidos: Array.from(byLab.entries())
        .map(([labId, v]) => ({
          laboratorio_id: labId,
          laboratorio_nombre: lmap.get(labId) ?? "—",
          menciones: v.count,
          top_competitor: Array.from(v.competitors.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
        }))
        .sort((a, b) => b.menciones - a.menciones),
    };
  });

/* ─── 4. Product substitutes ─── */
export const getProductSubstitutesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ productoId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: subs } = await context.supabase
      .from("product_substitutes")
      .select("sustituto_id, prioridad, motivo")
      .eq("producto_id", data.productoId)
      .order("prioridad", { ascending: true });
    const ids = (subs ?? []).map((s: any) => s.sustituto_id);
    if (ids.length === 0) return { substitutes: [] };
    const { data: prods } = await context.supabase
      .from("productos")
      .select("id, nombre, sku, marca, laboratorio_id, stock_disponible, precio_lista, imagen_url")
      .in("id", ids);
    const pmap = new Map((prods ?? []).map((p: any) => [p.id, p]));
    return {
      substitutes: (subs ?? [])
        .map((s: any) => ({ ...(pmap.get(s.sustituto_id) ?? {}), prioridad: s.prioridad, motivo: s.motivo }))
        .filter((p: any) => p.id),
    };
  });

/* ─── 5. Próximos ingresos agregados ─── */
export const getUpcomingReceiptsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: entries } = await context.supabase
      .from("stock_entries")
      .select("product_id, quantity, entry_date, entry_status")
      .in("entry_status", ["transit", "pending", "in_transit"])
      .not("entry_date", "is", null)
      .order("entry_date", { ascending: true })
      .limit(500);

    const productIds = Array.from(
      new Set((entries ?? []).map((e: any) => e.product_id).filter(Boolean)),
    );
    const { data: prods } = productIds.length
      ? await context.supabase
          .from("productos")
          .select("id, nombre, sku, marca, laboratorio_id")
          .in("id", productIds)
      : { data: [] as any[] };
    const pmap = new Map((prods ?? []).map((p: any) => [p.id, p]));

    // Group by date
    const byDate = new Map<string, Array<{ producto_id: string; nombre: string; sku: string; marca: string | null; quantity: number }>>();
    for (const e of entries ?? []) {
      if (!e.entry_date || !e.product_id) continue;
      const p = pmap.get(e.product_id);
      const day = String(e.entry_date).slice(0, 10);
      const arr = byDate.get(day) ?? [];
      arr.push({
        producto_id: e.product_id,
        nombre: p?.nombre ?? "Producto",
        sku: p?.sku ?? "",
        marca: p?.marca ?? null,
        quantity: Number(e.quantity ?? 0),
      });
      byDate.set(day, arr);
    }

    return {
      receipts: Array.from(byDate.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, items]) => ({ date, items })),
    };
  });

/* ─── 6. Collections priority (cobranza + comportamiento) ─── */
export const getCollectionsPriorityFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rep = await getScopedRep(context.supabase, context.userId);
    let cQ = context.supabase
      .from("clientes")
      .select("id, razon_social, nombre_comercial, telefono, phone")
      .eq("active", true);
    if (rep) cQ = cQ.eq("representante_id", rep.id);
    const { data: clientes } = await cQ.limit(1000);
    const clientIds = (clientes ?? []).map((c: any) => c.id);
    if (clientIds.length === 0) return { rows: [] };
    const cmap = new Map((clientes ?? []).map((c: any) => [c.id, c]));

    const { data: facturas } = await context.supabase
      .from("facturas")
      .select("cliente_id, total, saldo, fecha_emision, fecha_vencimiento, estado")
      .in("cliente_id", clientIds)
      .gt("saldo", 0)
      .lt("fecha_vencimiento", new Date().toISOString().slice(0, 10));

    const now = Date.now();
    const agg = new Map<
      string,
      { saldo_vencido: number; max_dias: number; facturas: number }
    >();
    for (const f of (facturas ?? []) as any[]) {
      if (!f.fecha_vencimiento) continue;
      const dias = Math.floor((now - new Date(f.fecha_vencimiento).getTime()) / MS_DAY);
      if (dias <= 0) continue;
      const cur = agg.get(f.cliente_id) ?? { saldo_vencido: 0, max_dias: 0, facturas: 0 };
      cur.saldo_vencido += Number(f.saldo ?? 0);
      cur.max_dias = Math.max(cur.max_dias, dias);
      cur.facturas += 1;
      agg.set(f.cliente_id, cur);
    }

    const rows = Array.from(agg.entries())
      .map(([cid, v]) => {
        const c = cmap.get(cid);
        const severity: "alto" | "medio" | "bajo" =
          v.max_dias > 60 ? "alto" : v.max_dias > 30 ? "medio" : "bajo";
        return {
          cliente_id: cid,
          cliente: c?.nombre_comercial ?? c?.razon_social ?? "Cliente",
          telefono: c?.telefono ?? c?.phone ?? null,
          saldo_vencido: Math.round(v.saldo_vencido),
          dias_vencido: v.max_dias,
          facturas_vencidas: v.facturas,
          severity,
        };
      })
      .filter((r) => r.saldo_vencido > 0)
      .sort((a, b) => b.dias_vencido - a.dias_vencido)
      .slice(0, 30);

    return { rows };
  });

/* ─── 7. Quick incident ─── */
export const createQuickIncidentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clienteId: z.string().uuid().optional().nullable(),
        visitId: z.string().uuid().optional().nullable(),
        tipo: z.enum(["queja", "faltante", "competencia", "cobranza", "otro"]),
        descripcion: z.string().min(1).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const tipoLabels: Record<string, string> = {
      queja: "Queja",
      faltante: "Producto faltante",
      competencia: "Actividad de competencia",
      cobranza: "Tema de cobranza",
      otro: "Incidencia",
    };
    let clienteNombre: string | null = null;
    if (data.clienteId) {
      const { data: c } = await context.supabase
        .from("clientes")
        .select("nombre_comercial, razon_social")
        .eq("id", data.clienteId)
        .maybeSingle();
      clienteNombre = (c as any)?.nombre_comercial ?? (c as any)?.razon_social ?? null;
    }
    const { error, data: row } = await context.supabase
      .from("notifications")
      .insert({
        type: "incident",
        category: data.tipo,
        priority: data.tipo === "queja" || data.tipo === "cobranza" ? "high" : "normal",
        title: `${tipoLabels[data.tipo]}${clienteNombre ? ` · ${clienteNombre}` : ""}`,
        description: data.descripcion,
        route: data.clienteId ? `/rep/clientes/${data.clienteId}` : "/rep/visitas",
        user_id: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    return { incident: row };
  });
