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

async function isAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  return !!data;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/* ─────────── Targets ─────────── */

export const getMyTargetFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ month: z.string().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const rep = await getCurrentRep(context.supabase, context.userId);
    if (!rep) return { target: null, progress: null, rep: null };

    const now = new Date();
    const monthDate = data.month
      ? new Date(data.month + "-01")
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStr = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}-01`;

    const { data: target } = await context.supabase
      .from("rep_targets")
      .select("*")
      .eq("rep_id", rep.id)
      .eq("period_month", monthStr)
      .maybeSingle();

    // month progress: sum pedidos this month
    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1).toISOString();
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1).toISOString();

    const { data: monthOrders } = await context.supabase
      .from("pedidos")
      .select("total, created_at, cliente_id")
      .eq("representante_id", rep.id)
      .gte("created_at", monthStart)
      .lt("created_at", monthEnd);

    const monthAmount = (monthOrders ?? []).reduce(
      (a: number, x: any) => a + Number(x.total || 0),
      0,
    );

    // today progress
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayAmount = (monthOrders ?? [])
      .filter((o: any) => new Date(o.created_at) >= todayStart)
      .reduce((a: number, x: any) => a + Number(x.total || 0), 0);

    return {
      rep,
      target,
      progress: {
        month_amount: monthAmount,
        today_amount: todayAmount,
        orders_count: (monthOrders ?? []).length,
        month: monthStr,
      },
    };
  });

export const upsertTargetFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        rep_id: z.string().uuid(),
        period_month: z.string(), // YYYY-MM or YYYY-MM-DD
        target_amount: z.number().nonnegative(),
        min_daily: z.number().nonnegative(),
        target_by_lab: z.record(z.string(), z.number()).optional(),
        notes: z.string().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.supabase, context.userId))) throw new Error("Solo admin");
    const period = data.period_month.length === 7 ? `${data.period_month}-01` : data.period_month;

    const { data: row, error } = await context.supabase
      .from("rep_targets")
      .upsert(
        {
          rep_id: data.rep_id,
          period_month: period,
          target_amount: data.target_amount,
          min_daily: data.min_daily,
          target_by_lab: data.target_by_lab ?? {},
          notes: data.notes ?? null,
        },
        { onConflict: "rep_id,period_month" },
      )
      .select()
      .single();
    if (error) throw error;
    return { target: row };
  });

export const listTargetsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ period_month: z.string().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.supabase, context.userId))) throw new Error("Solo admin");
    let q = context.supabase.from("rep_targets").select("*, representantes(id, nombre)");
    if (data.period_month) {
      const period =
        data.period_month.length === 7 ? `${data.period_month}-01` : data.period_month;
      q = q.eq("period_month", period);
    }
    const { data: rows, error } = await q.order("period_month", { ascending: false });
    if (error) throw error;
    return { targets: rows ?? [] };
  });

/* ─────────── Cierre de día ─────────── */

export const computeDayCloseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ date: z.string().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const rep = await getCurrentRep(context.supabase, context.userId);
    if (!rep) throw new Error("No hay representante asociado");

    const day = data.date ? new Date(data.date) : new Date();
    day.setHours(0, 0, 0, 0);
    const start = day.toISOString();
    const end = new Date(day.getTime() + 24 * 3600_000).toISOString();

    // First fetch clients belonging to this rep (needed to filter devoluciones)
    const { data: repClients } = await context.supabase
      .from("clientes")
      .select("id")
      .eq("representante_id", rep.id);
    const clientIds = (repClients ?? []).map((c: any) => c.id);

    const [{ data: visits }, { data: orders }, { data: payments }, returnsRes] =
      await Promise.all([
        context.supabase
          .from("rep_visits")
          .select("id, cliente_id, check_in_lat, check_in_lng, check_in_at, check_out_at")
          .neq("visit_kind", "oficina")
          .eq("representante_id", rep.id)
          .gte("check_in_at", start)
          .lt("check_in_at", end)
          .order("check_in_at", { ascending: true }),
        context.supabase
          .from("pedidos")
          .select("id, total, cliente_id, created_at")
          .eq("representante_id", rep.id)
          .gte("created_at", start)
          .lt("created_at", end),
        context.supabase
          .from("pagos")
          .select("id, monto, factura_id, created_at")
          .gte("created_at", start)
          .lt("created_at", end),
        clientIds.length
          ? context.supabase
              .from("devoluciones")
              .select("id, cliente_id, created_at")
              .in("cliente_id", clientIds)
              .gte("created_at", start)
              .lt("created_at", end)
          : Promise.resolve({ data: [] as any[] }),
      ]);
    const returns = (returnsRes as any).data ?? [];

    // km via visits trail
    let km = 0;
    const pts = (visits ?? [])
      .filter((v: any) => v.check_in_lat != null && v.check_in_lng != null)
      .map((v: any) => ({ lat: Number(v.check_in_lat), lng: Number(v.check_in_lng) }));
    for (let i = 1; i < pts.length; i++) km += haversineKm(pts[i - 1], pts[i]);

    // avg time per client (min)
    const durations = (visits ?? [])
      .filter((v: any) => v.check_out_at)
      .map(
        (v: any) =>
          (new Date(v.check_out_at).getTime() - new Date(v.check_in_at).getTime()) / 60000,

      );
    const avgTime = durations.length
      ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length
      : 0;

    // top clients today (by order total)
    const byClient = new Map<string, number>();
    for (const o of orders ?? []) {
      byClient.set(o.cliente_id, (byClient.get(o.cliente_id) || 0) + Number(o.total || 0));
    }
    const topIds = [...byClient.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    let topClients: Array<{ id: string; name: string; amount: number }> = [];
    if (topIds.length) {
      const { data: cl } = await context.supabase
        .from("clientes")
        .select("id, razon_social, nombre_comercial, nickname")
        .in(
          "id",
          topIds.map(([id]) => id),
        );
      const byId = new Map((cl ?? []).map((c: any) => [c.id, c]));
      topClients = topIds.map(([id, amount]) => ({
        id,
        name:
          byId.get(id)?.nickname ||
          byId.get(id)?.nombre_comercial ||
          byId.get(id)?.razon_social ||
          "—",
        amount,
      }));
    }

    const payAmount = (payments ?? []).reduce(
      (a: number, x: any) => a + Number(x.monto || 0),
      0,
    );
    const ordersAmount = (orders ?? []).reduce(
      (a: number, x: any) => a + Number(x.total || 0),
      0,
    );

    return {
      rep,
      close_date: day.toISOString().slice(0, 10),
      summary: {
        visits_count: (visits ?? []).length,
        orders_count: (orders ?? []).length,
        orders_amount: ordersAmount,
        payments_amount: payAmount,
        returns_count: (returns ?? []).length,
        km_traveled: Number(km.toFixed(2)),
        avg_time_per_client_min: Number(avgTime.toFixed(1)),
        top_clients: topClients,
      },
    };
  });

export const saveDayCloseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        close_date: z.string(),
        narrative: z.string().optional(),
        summary: z.object({
          visits_count: z.number(),
          orders_count: z.number(),
          orders_amount: z.number(),
          payments_amount: z.number(),
          returns_count: z.number(),
          km_traveled: z.number(),
          avg_time_per_client_min: z.number(),
          top_clients: z.array(z.any()),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const rep = await getCurrentRep(context.supabase, context.userId);
    if (!rep) throw new Error("No hay representante asociado");

    const s = data.summary;
    const { data: row, error } = await context.supabase
      .from("rep_day_closes")
      .upsert(
        {
          rep_id: rep.id,
          close_date: data.close_date,
          visits_count: s.visits_count,
          orders_count: s.orders_count,
          orders_amount: s.orders_amount,
          payments_amount: s.payments_amount,
          returns_count: s.returns_count,
          km_traveled: s.km_traveled,
          avg_time_per_client_min: s.avg_time_per_client_min,
          top_clients: s.top_clients,
          narrative: data.narrative ?? null,
        },
        { onConflict: "rep_id,close_date" },
      )
      .select()
      .single();
    if (error) throw error;
    return { close: row };
  });


export const listDayClosesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ limit: z.number().min(1).max(90).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const rep = await getCurrentRep(context.supabase, context.userId);
    const admin = await isAdmin(context.supabase, context.userId);
    let q = context.supabase
      .from("rep_day_closes")
      .select("*")
      .order("close_date", { ascending: false })
      .limit(data.limit ?? 30);
    if (!admin && rep) q = q.eq("rep_id", rep.id);
    else if (!admin) return { closes: [] };
    const { data: rows, error } = await q;
    if (error) throw error;
    return { closes: rows ?? [] };
  });

/* ─────────── Supervisor report + CSV ─────────── */

export const supervisorReportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        from: z.string(),
        to: z.string(),
        rep_id: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.supabase, context.userId))) throw new Error("Solo admin");

    const from = new Date(data.from).toISOString();
    const to = new Date(new Date(data.to).getTime() + 24 * 3600_000).toISOString();

    let visitsQ = context.supabase
      .from("rep_visits")
      .select("id, representante_id, cliente_id, check_in_at, check_out_at, outcome, distance_m")
      .neq("visit_kind", "oficina")
      .gte("check_in_at", from)
      .lt("check_in_at", to);
    if (data.rep_id) visitsQ = visitsQ.eq("representante_id", data.rep_id);

    let ordersQ = context.supabase
      .from("pedidos")
      .select("id, representante_id, cliente_id, total, created_at")
      .gte("created_at", from)
      .lt("created_at", to);
    if (data.rep_id) ordersQ = ordersQ.eq("representante_id", data.rep_id);

    const [visitsRes, ordersRes, repsRes] = await Promise.all([
      visitsQ,
      ordersQ,
      context.supabase.from("representantes").select("id, nombre"),
    ]);
    const visits = (visitsRes.data ?? []) as any[];
    const orders = (ordersRes.data ?? []) as any[];
    const reps = (repsRes.data ?? []) as any[];


    // Aggregate by rep
    const repMap = new Map(reps.map((r: any) => [r.id, r.nombre]));
    const agg = new Map<
      string,
      { rep_id: string; rep_name: string; visits: number; orders: number; amount: number }
    >();
    for (const v of visits) {
      const key = v.representante_id;
      if (!agg.has(key))
        agg.set(key, {
          rep_id: key,
          rep_name: repMap.get(key) || "—",
          visits: 0,
          orders: 0,
          amount: 0,
        });
      agg.get(key)!.visits += 1;
    }
    for (const o of orders) {
      const key = o.representante_id;
      if (!agg.has(key))
        agg.set(key, {
          rep_id: key,
          rep_name: repMap.get(key) || "—",
          visits: 0,
          orders: 0,
          amount: 0,
        });
      agg.get(key)!.orders += 1;
      agg.get(key)!.amount += Number(o.total || 0);
    }

    return {
      rows: [...agg.values()].sort((a, b) => b.amount - a.amount),
      totals: {
        visits: visits.length,
        orders: orders.length,
        amount: orders.reduce((a: number, x: any) => a + Number(x.total || 0), 0),
      },
    };
  });


/* ─────────── Reporte personalizado con IA ─────────── */

export const REPORT_TYPES = [
  "visitas_por_rep",
  "visitas_por_cliente",
  "cobertura_clientes",
  "pedidos_por_rep",
  "pedidos_por_cliente",
  "cumplimiento_rutas",
  "actividad_diaria",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  visitas_por_rep: "Visitas por representante",
  visitas_por_cliente: "Visitas por cliente",
  cobertura_clientes: "Cobertura de cartera",
  pedidos_por_rep: "Pedidos por representante",
  pedidos_por_cliente: "Pedidos por cliente",
  cumplimiento_rutas: "Cumplimiento de rutas",
  actividad_diaria: "Actividad diaria",
};

type Col = { key: string; label: string; align?: "left" | "right"; format?: "money" | "pct" };

export const customSupervisorReportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        from: z.string(),
        to: z.string(),
        rep_id: z.string().uuid().optional(),
        report_type: z.enum(["auto", ...REPORT_TYPES]).default("auto"),
        description: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.supabase, context.userId))) throw new Error("Solo admin");

    const fromISO = new Date(data.from).toISOString();
    const toISO = new Date(new Date(data.to).getTime() + 24 * 3600_000).toISOString();
    const desc = (data.description ?? "").trim();

    const { geminiGenerateInline } = await import("@/lib/valinor-proxy.server");
    const aiText = (res: any) =>
      (res?.candidates?.[0]?.content?.parts ?? [])
        .map((p: any) => p?.text ?? "")
        .join("")
        .trim();

    /* 1. Determinar tipo de reporte */
    let reportType: ReportType =
      data.report_type === "auto" ? "visitas_por_rep" : (data.report_type as ReportType);
    let aiReason: string | null = null;

    if (data.report_type === "auto" && desc) {
      try {
        const res = await geminiGenerateInline({
          model: "gemini-flash-latest",
          jsonMode: true,
          parts: [
            {
              text: `Eres analista de datos de IMV. El supervisor describe el reporte que necesita.
Elige el tipo de reporte más adecuado de esta lista (usa exactamente el identificador):
${REPORT_TYPES.map((t) => `- ${t}: ${REPORT_TYPE_LABELS[t]}`).join("\n")}

Descripción del supervisor: "${desc}"

Responde JSON: {"report_type":"<id>","reason":"<una frase en español>"}`,
            },
          ],
        });
        const parsed = JSON.parse(aiText(res).replace(/^```json|```$/g, "").trim());
        if (REPORT_TYPES.includes(parsed?.report_type)) {
          reportType = parsed.report_type;
          aiReason = typeof parsed?.reason === "string" ? parsed.reason : null;
        }
      } catch {
        /* fallback al tipo por defecto */
      }
    }

    /* 2. Datos base */
    let visitsQ = context.supabase
      .from("rep_visits")
      .select(
        "id, representante_id, cliente_id, check_in_at, check_out_at, outcome, visit_kind",
      )
      .neq("visit_kind", "oficina")
      .gte("check_in_at", fromISO)
      .lt("check_in_at", toISO);
    if (data.rep_id) visitsQ = visitsQ.eq("representante_id", data.rep_id);

    let ordersQ = context.supabase
      .from("pedidos")
      .select("id, representante_id, cliente_id, total, created_at")
      .gte("created_at", fromISO)
      .lt("created_at", toISO);
    if (data.rep_id) ordersQ = ordersQ.eq("representante_id", data.rep_id);

    let clientsQ = context.supabase
      .from("clientes")
      .select("id, razon_social, representante_id, active");
    if (data.rep_id) clientsQ = clientsQ.eq("representante_id", data.rep_id);

    let routesQ = context.supabase
      .from("rep_rutas_guardadas")
      .select("id, representante_id, nombre, fecha, ordered_stops")
      .gte("fecha", data.from)
      .lte("fecha", data.to);
    if (data.rep_id) routesQ = routesQ.eq("representante_id", data.rep_id);

    const [visitsRes, ordersRes, clientsRes, routesRes, repsRes] = await Promise.all([
      visitsQ,
      ordersQ,
      clientsQ,
      routesQ,
      context.supabase.from("representantes").select("id, nombre"),
    ]);

    const visits = (visitsRes.data ?? []) as any[];
    const orders = (ordersRes.data ?? []) as any[];
    const clients = (clientsRes.data ?? []) as any[];
    const routes = (routesRes.data ?? []) as any[];
    const reps = (repsRes.data ?? []) as any[];
    const repName = new Map(reps.map((r: any) => [r.id, r.nombre]));
    const clientName = new Map(clients.map((c: any) => [c.id, c.razon_social]));

    const durMin = (v: any) =>
      v.check_in_at && v.check_out_at
        ? Math.max(0, (new Date(v.check_out_at).getTime() - new Date(v.check_in_at).getTime()) / 60000)
        : 0;
    const dayOf = (iso: string) => new Date(iso).toISOString().slice(0, 10);

    let columns: Col[] = [];
    let rows: any[] = [];
    let totals: Record<string, number> = {};

    if (reportType === "visitas_por_rep") {
      columns = [
        { key: "name", label: "Representante" },
        { key: "visits", label: "Visitas", align: "right" },
        { key: "clients", label: "Clientes únicos", align: "right" },
        { key: "closed", label: "Cerradas", align: "right" },
        { key: "avg_min", label: "Duración prom. (min)", align: "right" },
        { key: "orders", label: "Pedidos", align: "right" },
        { key: "amount", label: "Monto", align: "right", format: "money" },
      ];
      const m = new Map<string, any>();
      const uniq = new Map<string, Set<string>>();
      const dur = new Map<string, number[]>();
      const get = (id: string) => {
        if (!m.has(id))
          m.set(id, {
            key: id,
            name: repName.get(id) || "—",
            visits: 0,
            clients: 0,
            closed: 0,
            avg_min: 0,
            orders: 0,
            amount: 0,
          });
        return m.get(id);
      };
      for (const v of visits) {
        const r = get(v.representante_id);
        r.visits += 1;
        if (v.check_out_at) r.closed += 1;
        if (!uniq.has(v.representante_id)) uniq.set(v.representante_id, new Set());
        if (v.cliente_id) uniq.get(v.representante_id)!.add(v.cliente_id);
        if (!dur.has(v.representante_id)) dur.set(v.representante_id, []);
        const d = durMin(v);
        if (d > 0) dur.get(v.representante_id)!.push(d);
      }
      for (const o of orders) {
        const r = get(o.representante_id);
        r.orders += 1;
        r.amount += Number(o.total || 0);
      }
      for (const r of m.values()) {
        r.clients = uniq.get(r.key)?.size ?? 0;
        const ds = dur.get(r.key) ?? [];
        r.avg_min = ds.length ? Math.round(ds.reduce((a, b) => a + b, 0) / ds.length) : 0;
      }
      rows = [...m.values()].sort((a, b) => b.visits - a.visits);
      totals = {
        visits: visits.length,
        orders: orders.length,
        amount: orders.reduce((a, x) => a + Number(x.total || 0), 0),
      };
    } else if (reportType === "visitas_por_cliente") {
      columns = [
        { key: "name", label: "Cliente" },
        { key: "visits", label: "Visitas", align: "right" },
        { key: "last", label: "Última visita" },
        { key: "avg_min", label: "Duración prom. (min)", align: "right" },
        { key: "reps", label: "Representantes" },
      ];
      const m = new Map<string, any>();
      for (const v of visits) {
        const id = v.cliente_id ?? "sin_cliente";
        if (!m.has(id))
          m.set(id, {
            key: id,
            name: clientName.get(id) || (v.visit_kind === "oficina" ? "Oficina IMV" : "—"),
            visits: 0,
            last: "",
            avg_min: 0,
            reps: new Set<string>(),
            _dur: [] as number[],
          });
        const r = m.get(id);
        r.visits += 1;
        const d = dayOf(v.check_in_at);
        if (!r.last || d > r.last) r.last = d;
        r.reps.add(repName.get(v.representante_id) || "—");
        const dm = durMin(v);
        if (dm > 0) r._dur.push(dm);
      }
      rows = [...m.values()]
        .map((r) => ({
          ...r,
          reps: [...r.reps].join(", "),
          avg_min: r._dur.length
            ? Math.round(r._dur.reduce((a: number, b: number) => a + b, 0) / r._dur.length)
            : 0,
        }))
        .sort((a, b) => b.visits - a.visits);
      totals = { visits: visits.length, clientes: rows.length };
    } else if (reportType === "cobertura_clientes") {
      columns = [
        { key: "name", label: "Representante" },
        { key: "cartera", label: "Cartera", align: "right" },
        { key: "visited", label: "Visitados", align: "right" },
        { key: "coverage", label: "Cobertura", align: "right", format: "pct" },
        { key: "pending", label: "Sin visitar", align: "right" },
      ];
      const m = new Map<string, any>();
      for (const c of clients) {
        if (c.active === false) continue;
        const id = c.representante_id ?? "sin_rep";
        if (!m.has(id))
          m.set(id, {
            key: id,
            name: id === "sin_rep" ? "Sin representante" : repName.get(id) || "—",
            cartera: 0,
            visited: 0,
            coverage: 0,
            pending: 0,
            _ids: new Set<string>(),
          });
        m.get(id).cartera += 1;
        m.get(id)._ids.add(c.id);
      }
      const visitedByRep = new Map<string, Set<string>>();
      for (const v of visits) {
        if (!v.cliente_id) continue;
        for (const [id, r] of m) {
          if (r._ids.has(v.cliente_id)) {
            if (!visitedByRep.has(id)) visitedByRep.set(id, new Set());
            visitedByRep.get(id)!.add(v.cliente_id);
          }
        }
      }
      rows = [...m.values()].map((r) => {
        const visited = visitedByRep.get(r.key)?.size ?? 0;
        return {
          key: r.key,
          name: r.name,
          cartera: r.cartera,
          visited,
          coverage: r.cartera ? Math.round((visited / r.cartera) * 100) : 0,
          pending: r.cartera - visited,
        };
      }).sort((a, b) => b.coverage - a.coverage);
      totals = {
        cartera: rows.reduce((a, r) => a + r.cartera, 0),
        visitados: rows.reduce((a, r) => a + r.visited, 0),
      };
    } else if (reportType === "pedidos_por_rep" || reportType === "pedidos_por_cliente") {
      const byRep = reportType === "pedidos_por_rep";
      columns = [
        { key: "name", label: byRep ? "Representante" : "Cliente" },
        { key: "orders", label: "Pedidos", align: "right" },
        { key: "amount", label: "Monto", align: "right", format: "money" },
        { key: "ticket", label: "Ticket prom.", align: "right", format: "money" },
      ];
      const m = new Map<string, any>();
      for (const o of orders) {
        const id = (byRep ? o.representante_id : o.cliente_id) ?? "sin_dato";
        if (!m.has(id))
          m.set(id, {
            key: id,
            name: (byRep ? repName.get(id) : clientName.get(id)) || "—",
            orders: 0,
            amount: 0,
            ticket: 0,
          });
        const r = m.get(id);
        r.orders += 1;
        r.amount += Number(o.total || 0);
      }
      rows = [...m.values()]
        .map((r) => ({ ...r, ticket: r.orders ? r.amount / r.orders : 0 }))
        .sort((a, b) => b.amount - a.amount);
      totals = {
        orders: orders.length,
        amount: orders.reduce((a, x) => a + Number(x.total || 0), 0),
      };
    } else if (reportType === "cumplimiento_rutas") {
      columns = [
        { key: "name", label: "Representante" },
        { key: "date", label: "Fecha" },
        { key: "planned", label: "Planeadas", align: "right" },
        { key: "done", label: "Visitadas", align: "right" },
        { key: "compliance", label: "Cumplimiento", align: "right", format: "pct" },
      ];
      const visitedKey = new Set(
        visits
          .filter((v) => v.cliente_id)
          .map((v) => `${v.representante_id}|${dayOf(v.check_in_at)}|${v.cliente_id}`),
      );
      rows = routes
        .map((r: any) => {
          const stops = Array.isArray(r.ordered_stops) ? r.ordered_stops : [];
          const ids = stops
            .map((s: any) => s?.cliente_id ?? s?.id ?? null)
            .filter(Boolean) as string[];
          const done = ids.filter((cid) =>
            visitedKey.has(`${r.representante_id}|${r.fecha}|${cid}`),
          ).length;
          return {
            key: r.id,
            name: repName.get(r.representante_id) || "—",
            date: r.fecha,
            planned: ids.length,
            done,
            compliance: ids.length ? Math.round((done / ids.length) * 100) : 0,
          };
        })
        .sort((a, b) => (a.date < b.date ? 1 : -1));
      totals = {
        rutas: rows.length,
        planeadas: rows.reduce((a, r) => a + r.planned, 0),
        visitadas: rows.reduce((a, r) => a + r.done, 0),
      };
    } else {
      columns = [
        { key: "name", label: "Fecha" },
        { key: "visits", label: "Visitas", align: "right" },
        { key: "reps", label: "Reps activos", align: "right" },
        { key: "orders", label: "Pedidos", align: "right" },
        { key: "amount", label: "Monto", align: "right", format: "money" },
      ];
      const m = new Map<string, any>();
      const repsByDay = new Map<string, Set<string>>();
      const get = (d: string) => {
        if (!m.has(d)) m.set(d, { key: d, name: d, visits: 0, reps: 0, orders: 0, amount: 0 });
        return m.get(d);
      };
      for (const v of visits) {
        const d = dayOf(v.check_in_at);
        get(d).visits += 1;
        if (!repsByDay.has(d)) repsByDay.set(d, new Set());
        repsByDay.get(d)!.add(v.representante_id);
      }
      for (const o of orders) {
        const d = dayOf(o.created_at);
        const r = get(d);
        r.orders += 1;
        r.amount += Number(o.total || 0);
      }
      for (const r of m.values()) r.reps = repsByDay.get(r.key)?.size ?? 0;
      rows = [...m.values()].sort((a, b) => (a.name < b.name ? 1 : -1));
      totals = {
        visits: visits.length,
        orders: orders.length,
        amount: orders.reduce((a, x) => a + Number(x.total || 0), 0),
      };
    }

    /* 3. Análisis IA del reporte */
    let analysis: string | null = null;
    try {
      const res = await geminiGenerateInline({
        model: "gemini-flash-latest",
        parts: [
          {
            text: `Eres analista de operaciones de campo de IMV. Analiza el reporte "${REPORT_TYPE_LABELS[reportType]}" del periodo ${data.from} a ${data.to}.
${desc ? `Necesidad del supervisor: "${desc}"` : ""}
Totales: ${JSON.stringify(totals)}
Filas (máx 40): ${JSON.stringify(rows.slice(0, 40))}

Responde en español de México, sin markdown ni emojis, máximo 6 frases: hallazgos clave con números, quién destaca, quién requiere atención y una recomendación accionable. Si no hay datos, dilo.`,
          },
        ],
      });
      analysis = aiText(res) || null;
    } catch {
      analysis = null;
    }

    return {
      report_type: reportType,
      report_label: REPORT_TYPE_LABELS[reportType],
      ai_reason: aiReason,
      columns,
      rows,
      totals,
      analysis,
    };
  });
