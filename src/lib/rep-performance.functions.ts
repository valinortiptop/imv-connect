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
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const rep = await getCurrentRep(context.supabase, context.userId);
    if (!rep) throw new Error("No hay representante asociado");

    // Recompute to save canonical numbers
    const compute = await (computeDayCloseFn as any).__executeServer?.({
      data: { date: data.close_date },
    });
    // Fallback: inline compute
    const s = compute?.summary;
    if (!s) throw new Error("No se pudo calcular el cierre");

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
        laboratorio_id: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.supabase, context.userId))) throw new Error("Solo admin");

    const from = new Date(data.from).toISOString();
    const to = new Date(new Date(data.to).getTime() + 24 * 3600_000).toISOString();

    let visitsQ = context.supabase
      .from("rep_visits")
      .select("id, representante_id, cliente_id, checkin_at, checkout_at, outcome, distance_m")
      .gte("checkin_at", from)
      .lt("checkin_at", to);
    if (data.rep_id) visitsQ = visitsQ.eq("representante_id", data.rep_id);

    let ordersQ = context.supabase
      .from("pedidos")
      .select("id, representante_id, cliente_id, total, created_at, laboratorio_id")
      .gte("created_at", from)
      .lt("created_at", to);
    if (data.rep_id) ordersQ = ordersQ.eq("representante_id", data.rep_id);
    if (data.laboratorio_id) ordersQ = ordersQ.eq("laboratorio_id", data.laboratorio_id);

    const [{ data: visits }, { data: orders }, { data: reps }] = await Promise.all([
      visitsQ,
      ordersQ,
      context.supabase.from("representantes").select("id, nombre"),
    ]);

    // Aggregate by rep
    const repMap = new Map((reps ?? []).map((r: any) => [r.id, r.nombre]));
    const agg = new Map<
      string,
      { rep_id: string; rep_name: string; visits: number; orders: number; amount: number }
    >();
    for (const v of visits ?? []) {
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
    for (const o of orders ?? []) {
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
        visits: (visits ?? []).length,
        orders: (orders ?? []).length,
        amount: (orders ?? []).reduce((a: number, x: any) => a + Number(x.total || 0), 0),
      },
    };
  });
