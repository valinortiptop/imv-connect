import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { geminiGenerate } from "./valinor-proxy.server";
import { REP_COACHING_SYSTEM, ADMIN_COACHING_SYSTEM } from "./rep-prompts";

async function getCurrentRep(supabase: any, userId: string) {
  const { data } = await supabase
    .from("representantes")
    .select("id, nombre")
    .eq("user_id", userId)
    .maybeSingle();
  return data as { id: string; nombre: string } | null;
}

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
    z
      .object({
        days: z.number().int().min(1).max(730).default(30),
        /** Rango explícito (YYYY-MM-DD). Si viene, gana sobre `days`. */
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    let sinceIso: string;
    let untilIso: string | null = null;
    if (data.from) {
      sinceIso = new Date(`${data.from}T00:00:00`).toISOString();
      untilIso = new Date(`${data.to ?? data.from}T23:59:59.999`).toISOString();
    } else {
      const since = new Date();
      since.setDate(since.getDate() - data.days);
      sinceIso = since.toISOString();
    }


    const { data: reps } = await context.supabase
      .from("representantes")
      .select("id, nombre, activo")
      .eq("activo", true);

    const repIds = (reps ?? []).map((r: any) => r.id);
    if (repIds.length === 0) return { rows: [], since: sinceIso, totals: { visits: 0, pedidos: 0, ventas: 0 } };

    let vq = context.supabase
      .from("rep_visits")
      .select("representante_id, cliente_id, outcome, check_in_at, check_out_at, pedido_id")
      .in("representante_id", repIds)
      .gte("check_in_at", sinceIso);
    let pq = context.supabase
      .from("pedidos")
      .select("id, representante_id, total, created_at, cliente_id")
      .in("representante_id", repIds)
      .gte("created_at", sinceIso);
    if (untilIso) {
      vq = vq.lte("check_in_at", untilIso);
      pq = pq.lte("created_at", untilIso);
    }
    const [{ data: visits }, { data: pedidos }] = await Promise.all([vq, pq]);


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
        model: "gemini-flash-latest",
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
      return { rep_id: r.id as string, nombre: r.nombre as string, visitas: v, pedidos: ps.length, ventas: Math.round(ventas), puntos, rank: 0 };
    });
    ranking.sort((a, b) => b.puntos - a.puntos);
    ranking.forEach((r, i) => { r.rank = i + 1; });

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

/* ─── generateTeamCoachingFn: coach IA a nivel equipo (admins/supervisores) ─── */
export const generateTeamCoachingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        force: z.boolean().optional(),
        fecha_desde: z.string().optional(),
        fecha_hasta: z.string().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    void data.force;

    // Rango actual: por defecto los últimos 7 días. El periodo previo tiene la
    // misma duración e termina justo antes del rango actual.
    const now = new Date();
    const defaultFrom = new Date(now); defaultFrom.setDate(defaultFrom.getDate() - 7);
    const pad = (n: number) => String(n).padStart(2, "0");
    const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const fechaDesde = data.fecha_desde || ymd(defaultFrom);
    const fechaHasta = data.fecha_hasta || ymd(now);
    const w1 = new Date(`${fechaDesde}T00:00:00`);
    const end1 = new Date(`${fechaHasta}T23:59:59.999`);
    const spanMs = Math.max(end1.getTime() - w1.getTime(), 24 * 3600 * 1000);
    const w2 = new Date(w1.getTime() - spanMs);

    const { data: reps } = await context.supabase
      .from("representantes")
      .select("id, nombre, activo")
      .eq("activo", true);
    const repIds = (reps ?? []).map((r: any) => r.id);

    const empty = {
      visitas: 0, pedidos: 0, ratio: 0, ventas: 0, clientes_unicos: 0,
      duracion_prom_min: 0, ticket_prom: 0, reps_activos: 0,
    };
    if (repIds.length === 0) {
      return {
        team: { current: empty, previous: empty },
        reps: [],
        coaching: null,
        fecha_desde: fechaDesde,
        fecha_hasta: fechaHasta,
      };
    }

    const sel = "representante_id, cliente_id, check_in_at, check_out_at";
    const [{ data: v1 }, { data: v2 }, { data: p1 }, { data: p2 }] = await Promise.all([
      context.supabase.from("rep_visits").select(sel).in("representante_id", repIds).gte("check_in_at", w1.toISOString()).lte("check_in_at", end1.toISOString()),
      context.supabase.from("rep_visits").select(sel).in("representante_id", repIds).gte("check_in_at", w2.toISOString()).lt("check_in_at", w1.toISOString()),
      context.supabase.from("pedidos").select("id, representante_id, total, created_at").in("representante_id", repIds).gte("created_at", w1.toISOString()).lte("created_at", end1.toISOString()),
      context.supabase.from("pedidos").select("id, representante_id, total, created_at").in("representante_id", repIds).gte("created_at", w2.toISOString()).lt("created_at", w1.toISOString()),
    ]);

    const agg = (visits: any[], pedidos: any[]) => {
      const durs: number[] = [];
      for (const v of visits) {
        if (v.check_in_at && v.check_out_at) {
          const d = (new Date(v.check_out_at).getTime() - new Date(v.check_in_at).getTime()) / 60000;
          if (d > 0 && d < 480) durs.push(d);
        }
      }
      const ventas = pedidos.reduce((a: number, p: any) => a + Number(p.total ?? 0), 0);
      const activos = new Set([
        ...visits.map((v: any) => v.representante_id),
        ...pedidos.map((p: any) => p.representante_id),
      ].filter(Boolean));
      return {
        visitas: visits.length,
        pedidos: pedidos.length,
        ratio: visits.length ? pedidos.length / visits.length : 0,
        ventas: Math.round(ventas),
        clientes_unicos: new Set(visits.map((v: any) => v.cliente_id).filter(Boolean)).size,
        duracion_prom_min: durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : 0,
        ticket_prom: pedidos.length ? Math.round(ventas / pedidos.length) : 0,
        reps_activos: activos.size,
      };
    };
    const current = agg(v1 ?? [], p1 ?? []);
    const previous = agg(v2 ?? [], p2 ?? []);

    const perRep = (reps ?? []).map((r: any) => {
      const vs = (v1 ?? []).filter((v: any) => v.representante_id === r.id);
      const vsPrev = (v2 ?? []).filter((v: any) => v.representante_id === r.id);
      const ps = (p1 ?? []).filter((p: any) => p.representante_id === r.id);
      const psPrev = (p2 ?? []).filter((p: any) => p.representante_id === r.id);
      const ventas = ps.reduce((a: number, p: any) => a + Number(p.total ?? 0), 0);
      const ventasPrev = psPrev.reduce((a: number, p: any) => a + Number(p.total ?? 0), 0);
      // Horarios agrupados por día: cada jornada tiene su primera entrada y su
      // último check-out (un rango de varios días ya no se mezcla en un solo par).
      const jornadaMap = new Map<string, { in: string[]; out: string[] }>();
      for (const v of vs) {
        const dia = typeof v.check_in_at === "string" ? v.check_in_at.slice(0, 10) : "";
        if (!dia) continue;
        const j = jornadaMap.get(dia) ?? { in: [], out: [] };
        if (v.check_in_at) j.in.push(v.check_in_at as string);
        if (v.check_out_at) j.out.push(v.check_out_at as string);
        jornadaMap.set(dia, j);
      }
      const jornadas = [...jornadaMap.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([dia, j]) => {
          const ins = [...j.in].sort();
          const outs = [...j.out].sort();
          return {
            dia,
            first_in_at: ins[0] ?? null,
            last_out_at: outs.length ? outs[outs.length - 1] : null,
          };
        });
      const lastJornada = jornadas[jornadas.length - 1];
      return {
        rep_id: r.id as string,
        nombre: r.nombre as string,
        visitas: vs.length,
        visitas_prev: vsPrev.length,
        pedidos: ps.length,
        ratio: vs.length ? ps.length / vs.length : 0,
        ventas: Math.round(ventas),
        ventas_prev: Math.round(ventasPrev),
        ticket_prom: ps.length ? Math.round(ventas / ps.length) : 0,
        /** Horarios de entrada/salida por cada día del rango. */
        jornadas,
        /** Primera visita del último día con actividad. */
        first_in_at: lastJornada?.first_in_at ?? null,
        /** Último check-out del último día con actividad. */
        last_out_at: lastJornada?.last_out_at ?? null,
        sin_actividad: vs.length === 0 && ps.length === 0,
      };
    });
    perRep.sort((a, b) => b.ventas - a.ventas);

    let coaching: any = null;
    try {
      const resp = await geminiGenerate({
        model: "gemini-flash-latest",
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  ADMIN_COACHING_SYSTEM +
                  "\n\nKPIs equipo semana actual: " + JSON.stringify(current) +
                  "\nKPIs equipo semana anterior: " + JSON.stringify(previous) +
                  "\nDesempeño por representante (semana actual vs anterior): " +
                  JSON.stringify(perRep.slice(0, 25)),
              },
            ],
          },
        ],
      });
      const text: string = (resp as any)?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      coaching = JSON.parse(text.replace(/```json\s*|```/g, "").trim());
    } catch {
      const inactivos = perRep.filter((r) => r.sin_actividad);
      const caidas = perRep.filter((r) => !r.sin_actividad && r.ventas < r.ventas_prev);
      coaching = {
        summary: `Equipo: ${current.visitas} visitas y ${current.pedidos} pedidos esta semana (ratio ${(current.ratio * 100).toFixed(0)}%), ventas $${current.ventas.toLocaleString("es-MX")}. ${current.reps_activos} de ${perRep.length} representantes con actividad.`,
        strengths: [
          current.ventas >= previous.ventas ? "Ventas del equipo se mantienen o crecen vs semana anterior" : "Cobertura de clientes sostenida",
          current.ratio >= 0.4 ? "Buen ratio visita→pedido del equipo" : `${current.clientes_unicos} clientes distintos visitados`,
        ],
        improvements: [
          inactivos.length ? `${inactivos.length} representantes sin actividad registrada esta semana` : "Sube el ticket promedio del equipo con cross-sell",
          caidas.length ? `${caidas.length} representantes con ventas por debajo de la semana anterior` : "Revisa visitas sin cierre para detectar objeciones comunes",
        ],
        goals: [
          { titulo: "Cobertura del equipo", meta: `${perRep.length} representantes con actividad`, kpi: "cobertura" },
          { titulo: "Ventas del equipo", meta: `+10% vs $${current.ventas.toLocaleString("es-MX")}`, kpi: "ventas" },
          { titulo: "Ratio visita→pedido", meta: "≥ 45%", kpi: "ratio" },
        ],
        focos: [
          ...inactivos.slice(0, 3).map((r) => ({
            representante: r.nombre,
            accion: "Confirmar ruta y check-ins de la semana",
            motivo: "Sin visitas ni pedidos registrados",
          })),
          ...caidas.slice(0, 2).map((r) => ({
            representante: r.nombre,
            accion: "Revisar cartera y clientes sin recompra",
            motivo: `Ventas $${r.ventas.toLocaleString("es-MX")} vs $${r.ventas_prev.toLocaleString("es-MX")} la semana previa`,
          })),
        ],
      };
    }

    return {
      team: { current, previous },
      reps: perRep,
      coaching,
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
    };
  });
