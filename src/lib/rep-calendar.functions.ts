import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CalendarEvent = {
  id: string;
  type: "visita" | "acuerdo" | "llamada" | "pedido" | "entrega";
  title: string;
  subtitle?: string;
  start: string; // ISO
  end?: string;
  representante_id?: string | null;
  representante_nombre?: string | null;
  cliente_id?: string | null;
  cliente_nombre?: string | null;
  status?: string | null;
  outcome?: string | null;
};

export const getRepCalendarEventsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        from: z.string(),
        to: z.string(),
        repIds: z.array(z.string()).optional(),
        repId: z.string().optional(),
        clienteId: z.string().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ events: CalendarEvent[] }> => {
    const supabase = context.supabase as any;
    const { from, to, clienteId } = data;
    const repIds = data.repId ? [data.repId] : data.repIds;

    const [repsRes, clientsRes, visitsRes, agreementsRes, callsRes, tripsRes, ordersRes] = await Promise.all([
      supabase.from("representantes").select("id, nombre"),
      supabase.from("clientes").select("id, razon_social, nombre_comercial, representante_id"),
      (async () => {
        let q = supabase
          .from("rep_visits")
          .select("id, representante_id, cliente_id, check_in_at, check_out_at, outcome, notes")
          .gte("check_in_at", from)
          .lte("check_in_at", to);
        if (repIds?.length) q = q.in("representante_id", repIds);
        if (clienteId) q = q.eq("cliente_id", clienteId);
        return q;
      })(),
      supabase
        .from("rep_visit_agreements")
        .select("id, visit_id, description, due_date, status")
        .gte("due_date", from.slice(0, 10))
        .lte("due_date", to.slice(0, 10)),
      supabase
        .from("prospect_calls")
        .select("id, prospect_id, called_at, outcome, notes, next_action_at, created_by")
        .or(`called_at.gte.${from},next_action_at.gte.${from}`),
      supabase
        .from("delivery_trips")
        .select("id, trip_date, truck_provider, status, notes")
        .gte("trip_date", from.slice(0, 10))
        .lte("trip_date", to.slice(0, 10)),
      (async () => {
        let q = supabase
          .from("pedidos")
          .select("id, folio, cliente_id, representante_id, estado, created_at, total")
          .gte("created_at", from)
          .lte("created_at", to);
        if (repIds?.length) q = q.in("representante_id", repIds);
        if (clienteId) q = q.eq("cliente_id", clienteId);
        return q;
      })(),
    ]);

    const reps = new Map<string, string>((repsRes.data ?? []).map((r: any) => [r.id, r.nombre]));
    const clientMap = new Map<string, { name: string; rep_id: string | null }>(
      (clientsRes.data ?? []).map((c: any) => [
        c.id,
        { name: c.nombre_comercial || c.razon_social || "Cliente", rep_id: c.representante_id ?? null },
      ]),
    );

    const events: CalendarEvent[] = [];

    // Visits (rep_visits)
    for (const v of visitsRes.data ?? []) {
      const cli = clientMap.get(v.cliente_id);
      events.push({
        id: `v-${v.id}`,
        type: "visita",
        title: `Visita: ${cli?.name ?? "Cliente"}`,
        subtitle: v.outcome ?? v.notes ?? undefined,
        start: v.check_in_at,
        end: v.check_out_at ?? undefined,
        representante_id: v.representante_id,
        representante_nombre: v.representante_id ? reps.get(v.representante_id) ?? null : null,
        cliente_id: v.cliente_id,
        cliente_nombre: cli?.name ?? null,
        outcome: v.outcome,
      });
    }

    // Agreements (due_date)
    const visitById = new Map<string, any>((visitsRes.data ?? []).map((v: any) => [v.id, v]));
    for (const a of agreementsRes.data ?? []) {
      const visit = visitById.get(a.visit_id);
      const cli = visit ? clientMap.get(visit.cliente_id) : null;
      const repId = visit?.representante_id ?? null;
      if (repIds?.length && repId && !repIds.includes(repId)) continue;
      if (clienteId && visit?.cliente_id !== clienteId) continue;
      events.push({
        id: `a-${a.id}`,
        type: "acuerdo",
        title: `Acuerdo: ${a.description?.slice(0, 60) ?? "compromiso"}`,
        subtitle: cli?.name,
        start: `${a.due_date}T09:00:00`,
        representante_id: repId,
        representante_nombre: repId ? reps.get(repId) ?? null : null,
        cliente_id: visit?.cliente_id ?? null,
        cliente_nombre: cli?.name ?? null,
        status: a.status,
      });
    }

    // Prospect calls (not tied to a cliente; hide when clienteId filter is active)
    if (!clienteId) {
      for (const c of callsRes.data ?? []) {
        if (c.called_at && c.called_at >= from && c.called_at <= to) {
          events.push({
            id: `c-${c.id}`,
            type: "llamada",
            title: `Llamada realizada`,
            subtitle: c.outcome ?? c.notes ?? undefined,
            start: c.called_at,
            outcome: c.outcome,
          });
        }
        if (c.next_action_at && c.next_action_at >= from && c.next_action_at <= to) {
          events.push({
            id: `cn-${c.id}`,
            type: "llamada",
            title: `Seguimiento programado`,
            subtitle: c.notes ?? undefined,
            start: c.next_action_at,
          });
        }
      }
    }

    // Delivery trips (no cliente linkage; hide when filtering by cliente)
    if (!clienteId) {
      for (const t of tripsRes.data ?? []) {
        events.push({
          id: `t-${t.id}`,
          type: "entrega",
          title: `Ruta de entrega${t.truck_provider ? ` · ${t.truck_provider}` : ""}`,
          subtitle: t.notes ?? undefined,
          start: `${t.trip_date}T08:00:00`,
          status: t.status,
        });
      }
    }


    // Orders
    for (const p of ordersRes.data ?? []) {
      const cli = clientMap.get(p.cliente_id);
      events.push({
        id: `p-${p.id}`,
        type: "pedido",
        title: `Pedido ${p.folio ?? ""} · ${cli?.name ?? "Cliente"}`,
        subtitle: p.total ? `$${Number(p.total).toLocaleString("es-MX")}` : undefined,
        start: p.created_at,
        representante_id: p.representante_id,
        representante_nombre: p.representante_id ? reps.get(p.representante_id) ?? null : null,
        cliente_id: p.cliente_id,
        cliente_nombre: cli?.name ?? null,
        status: p.estado,
      });
    }

    events.sort((a, b) => a.start.localeCompare(b.start));
    return { events };
  });

export const listRepresentantesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await (context.supabase as any)
      .from("representantes")
      .select("id, nombre, activo")
      .eq("activo", true)
      .order("nombre");
    return { representantes: (data ?? []) as { id: string; nombre: string; activo: boolean }[] };
  });
