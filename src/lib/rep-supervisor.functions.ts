import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { OFFICE_LOCATION, OFFICE_STOP_ID } from "./office";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Solo administradores");
}

function hydrateStops(rows: any[], byId: Map<string, any>) {
  return (rows ?? []).map((r: any) => ({
    ...r,
    ordered_stops: ((r.ordered_stops as any[]) ?? []).map((s: any) => {
      if (String(s?.cliente_id) === OFFICE_STOP_ID) {
        return {
          ...s,
          nombre: s?.motivo ? `Oficina IMV · ${s.motivo}` : OFFICE_LOCATION.nombre,
          direccion: OFFICE_LOCATION.direccion,
        };
      }
      const c = byId.get(String(s?.cliente_id));
      return {
        ...s,
        nombre: s?.nombre || c?.nombre_comercial || c?.razon_social || c?.nickname || null,
        direccion: s?.direccion || c?.direccion || null,
      };
    }),
  }));
}

async function clientsByIds(supabase: any, rows: any[]) {
  const ids = new Set<string>();
  for (const r of rows ?? []) {
    for (const s of ((r as any).ordered_stops as any[]) ?? []) {
      if (s?.cliente_id && UUID_RE.test(String(s.cliente_id))) ids.add(String(s.cliente_id));
    }
  }
  const byId = new Map<string, any>();
  if (ids.size > 0) {
    const { data: clis } = await supabase
      .from("clientes")
      .select("id, nombre_comercial, razon_social, nickname, direccion")
      .in("id", [...ids]);
    for (const c of clis ?? []) byId.set(String(c.id), c);
  }
  return byId;
}

/** Rutas guardadas de todos los representantes (solo admin/supervisor). */
export const listAllSavedRoutesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        repId: z.string().uuid().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        scope: z.enum(["all", "past", "future"]).default("all"),
        limit: z.number().int().min(1).max(400).default(200),
      })
      .default({})
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const today = new Date().toISOString().slice(0, 10);

    let q = context.supabase
      .from("rep_rutas_guardadas")
      .select(
        "id, fecha, nombre, total_km, total_minutes, ordered_stops, legs, polyline, start_lat, start_lng, created_at, origen, representante_id, user_id",
      );
    if (data.repId) q = q.eq("representante_id", data.repId);
    if (data.from) q = q.gte("fecha", data.from);
    if (data.to) q = q.lte("fecha", data.to);
    if (data.scope === "past") q = q.lt("fecha", today);
    if (data.scope === "future") q = q.gte("fecha", today);

    const { data: rows, error } = await q
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);

    const { data: reps } = await context.supabase
      .from("representantes")
      .select("id, nombre");
    const repById = new Map((reps ?? []).map((r: any) => [String(r.id), r.nombre]));

    const byId = await clientsByIds(context.supabase, rows ?? []);
    const routes = hydrateStops(rows ?? [], byId).map((r: any) => ({
      ...r,
      rep_nombre: r.representante_id ? repById.get(String(r.representante_id)) ?? null : null,
    }));
    return { routes, today };
  });

/** Vista 360 de un representante: clientes, prospectos, rutas, visitas, pedidos. */
export const getRep360Fn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        repId: z.string().uuid(),
        days: z.number().int().min(1).max(730).default(90),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = context.supabase;
    const since = new Date();
    since.setDate(since.getDate() - data.days);
    const sinceIso = since.toISOString();
    const today = new Date().toISOString().slice(0, 10);

    const { data: rep, error: repErr } = await sb
      .from("representantes")
      .select("id, nombre, email, telefono, activo, user_id, comision_default_pct, created_at")
      .eq("id", data.repId)
      .maybeSingle();
    if (repErr) throw new Error(repErr.message);
    if (!rep) throw new Error("Representante no encontrado");

    const [clientsRes, routesRes, visitsRes, pedidosRes] = await Promise.all([
      sb
        .from("clientes")
        .select("id, nombre_comercial, razon_social, nickname, direccion, municipio, telefono, lat, lng, activo")
        .eq("representante_id", rep.id)
        .limit(1000),
      sb
        .from("rep_rutas_guardadas")
        .select(
          "id, fecha, nombre, total_km, total_minutes, ordered_stops, legs, polyline, start_lat, start_lng, created_at, origen, representante_id",
        )
        .eq("representante_id", rep.id)
        .order("fecha", { ascending: false })
        .limit(120),
      sb
        .from("rep_visits")
        .select("id, cliente_id, prospect_id, outcome, notes, check_in_at, check_out_at, pedido_id")
        .eq("representante_id", rep.id)
        .gte("check_in_at", sinceIso)
        .order("check_in_at", { ascending: false })
        .limit(300),
      sb
        .from("pedidos")
        .select("id, folio, cliente_id, total, estado, created_at")
        .eq("representante_id", rep.id)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

    const prospectsRes = rep.user_id
      ? await sb
          .from("prospects")
          .select("id, name, phone, status, direccion, municipio, created_at")
          .eq("assigned_to", rep.user_id)
          .order("created_at", { ascending: false })
          .limit(300)
      : { data: [] as any[] };

    const clients = clientsRes.data ?? [];
    const clientName = new Map(
      clients.map((c: any) => [
        String(c.id),
        c.nombre_comercial || c.razon_social || c.nickname || "Cliente",
      ]),
    );

    // Names for clients referenced by visits/pedidos that aren't assigned to this rep
    const missing = new Set<string>();
    for (const v of visitsRes.data ?? [])
      if (v.cliente_id && !clientName.has(String(v.cliente_id))) missing.add(String(v.cliente_id));
    for (const p of pedidosRes.data ?? [])
      if (p.cliente_id && !clientName.has(String(p.cliente_id))) missing.add(String(p.cliente_id));
    if (missing.size > 0) {
      const { data: extra } = await sb
        .from("clientes")
        .select("id, nombre_comercial, razon_social, nickname")
        .in("id", [...missing]);
      for (const c of extra ?? [])
        clientName.set(
          String(c.id),
          c.nombre_comercial || c.razon_social || c.nickname || "Cliente",
        );
    }

    const visits = (visitsRes.data ?? []).map((v: any) => ({
      ...v,
      cliente_nombre: v.cliente_id ? clientName.get(String(v.cliente_id)) ?? null : null,
      duracion_min:
        v.check_in_at && v.check_out_at
          ? Math.max(
              0,
              Math.round(
                (new Date(v.check_out_at).getTime() - new Date(v.check_in_at).getTime()) / 60000,
              ),
            )
          : null,
    }));
    const pedidos = (pedidosRes.data ?? []).map((p: any) => ({
      ...p,
      cliente_nombre: p.cliente_id ? clientName.get(String(p.cliente_id)) ?? null : null,
    }));

    const byId = await clientsByIds(sb, routesRes.data ?? []);
    for (const [k, v] of clientName) if (!byId.has(k)) byId.set(k, { nombre_comercial: v });
    const routes = hydrateStops(routesRes.data ?? [], byId);

    const ventas = pedidos.reduce((a: number, p: any) => a + Number(p.total ?? 0), 0);
    const durs = visits.map((v: any) => v.duracion_min).filter((d: any) => d != null && d < 480);

    return {
      rep,
      today,
      kpis: {
        clientes: clients.length,
        clientes_activos: clients.filter((c: any) => c.activo !== false).length,
        prospectos: (prospectsRes.data ?? []).length,
        visitas: visits.length,
        pedidos: pedidos.length,
        ventas: Math.round(ventas),
        ticket_prom: pedidos.length ? Math.round(ventas / pedidos.length) : 0,
        ratio: visits.length ? pedidos.length / visits.length : 0,
        duracion_prom_min: durs.length
          ? Math.round(durs.reduce((a: number, b: number) => a + b, 0) / durs.length)
          : 0,
        rutas: routes.length,
        rutas_futuras: routes.filter((r: any) => String(r.fecha) >= today).length,
      },
      clients,
      prospects: prospectsRes.data ?? [],
      routes,
      visits,
      pedidos,
    };
  });

// ============================================================
// Asignaciones: prospectos y clientes → representantes
// ============================================================

/** Representantes con su user_id (para asignar prospectos/clientes). */
export const listRepsForAssignmentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("representantes")
      .select("id, nombre, email, activo, user_id")
      .order("nombre");
    if (error) throw new Error(error.message);
    return { reps: data ?? [] };
  });

/** Prospectos para autorizar / reasignar. */
export const listProspectsForAssignmentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        search: z.string().optional(),
        scope: z.enum(["todos", "sin_asignar", "asignados"]).optional(),
        limit: z.number().min(10).max(500).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    let q = context.supabase
      .from("prospects")
      .select(
        "id, name, contact_person, phone, direccion, colonia, municipio, status, source, assigned_to, created_at, converted_client_id",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 200);
    if (data.scope === "sin_asignar") q = q.is("assigned_to", null);
    if (data.scope === "asignados") q = q.not("assigned_to", "is", null);
    if (data.search?.trim()) {
      const t = data.search.trim();
      q = q.or(`name.ilike.%${t}%,contact_person.ilike.%${t}%,phone.ilike.%${t}%,direccion.ilike.%${t}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const { data: reps } = await context.supabase
      .from("representantes")
      .select("id, nombre, user_id");
    const byUser = new Map<string, any>();
    for (const r of reps ?? []) if ((r as any).user_id) byUser.set(String((r as any).user_id), r);

    return {
      prospects: (rows ?? []).map((p: any) => {
        const rep = p.assigned_to ? byUser.get(String(p.assigned_to)) : null;
        return {
          ...p,
          rep_id: rep?.id ?? null,
          rep_nombre: rep?.nombre ?? (p.assigned_to ? "Usuario sin representante" : null),
        };
      }),
    };
  });

/** Asigna (o libera) un prospecto a un representante. */
export const assignProspectToRepFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        prospectId: z.string().uuid(),
        repId: z.string().uuid().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    let assignedTo: string | null = null;
    if (data.repId) {
      const { data: rep } = await context.supabase
        .from("representantes")
        .select("id, nombre, user_id")
        .eq("id", data.repId)
        .maybeSingle();
      if (!rep) throw new Error("Representante no encontrado");
      if (!(rep as any).user_id)
        throw new Error(
          `${(rep as any).nombre} aún no tiene cuenta vinculada; vincúlala antes de asignar prospectos.`,
        );
      assignedTo = String((rep as any).user_id);
    }
    const { error } = await context.supabase
      .from("prospects")
      .update({ assigned_to: assignedTo })
      .eq("id", data.prospectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Clientes para asignar representante. */
export const listClientsForAssignmentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        search: z.string().optional(),
        scope: z.enum(["todos", "sin_asignar", "asignados"]).optional(),
        repId: z.string().uuid().optional(),
        limit: z.number().min(10).max(500).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    let q = context.supabase
      .from("clientes")
      .select("id, razon_social, nombre_comercial, nickname, direccion, telefono, representante_id, active")
      .order("razon_social")
      .limit(data.limit ?? 200);
    if (data.scope === "sin_asignar") q = q.is("representante_id", null);
    if (data.scope === "asignados") q = q.not("representante_id", "is", null);
    if (data.repId) q = q.eq("representante_id", data.repId);
    if (data.search?.trim()) {
      const t = data.search.trim();
      q = q.or(
        `razon_social.ilike.%${t}%,nombre_comercial.ilike.%${t}%,nickname.ilike.%${t}%,direccion.ilike.%${t}%`,
      );
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const { data: reps } = await context.supabase.from("representantes").select("id, nombre");
    const byId = new Map<string, string>();
    for (const r of reps ?? []) byId.set(String((r as any).id), (r as any).nombre);

    return {
      clients: (rows ?? []).map((c: any) => ({
        ...c,
        rep_nombre: c.representante_id ? byId.get(String(c.representante_id)) ?? "—" : null,
      })),
    };
  });

/** Asigna (o libera) el representante de un cliente. */
export const assignClientToRepFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clienteId: z.string().uuid(),
        repId: z.string().uuid().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("clientes")
      .update({ representante_id: data.repId })
      .eq("id", data.clienteId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
