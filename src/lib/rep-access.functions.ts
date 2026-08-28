import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RepAccessEvent = {
  id: string;
  representante_id: string | null;
  representante_nombre: string | null;
  user_id: string;
  signed_in_at: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  has_location: boolean;
  user_agent: string | null;
  device_id: string | null;
  device_label: string | null;
  /** How many raw sign-in events (windows/tabs) were folded into this one. */
  group_count: number;
  last_seen_at: string;
  /** Visit that happened at this location/time, when the ping matches one. */
  visit: {
    id: string;
    cliente: string;
    check_in_at: string;
    check_out_at: string | null;
    minutos: number | null;
    unplanned: boolean;
    outcome: string | null;
    distancia_m: number | null;
  } | null;
};

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

function deviceLabel(platform: string | null, ua: string | null): string {
  const u = ua ?? "";
  const browser = /Edg\//.test(u)
    ? "Edge"
    : /OPR\//.test(u)
      ? "Opera"
      : /Chrome\//.test(u)
        ? "Chrome"
        : /Safari\//.test(u)
          ? "Safari"
          : /Firefox\//.test(u)
            ? "Firefox"
            : "Navegador";
  const plat =
    platform ??
    (/iPhone|iPad|iPod/.test(u)
      ? "iOS"
      : /Android/.test(u)
        ? "Android"
        : /Windows/.test(u)
          ? "Windows"
          : /Mac OS X/.test(u)
            ? "macOS"
            : "Otro");
  return `${plat} · ${browser}`;
}

export const listRepAccessEventsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        from: z.string(),
        to: z.string(),
        repIds: z.array(z.string()).optional(),
        onlyWithLocation: z.boolean().optional(),
        /** Fold several windows/tabs of the same device into one pin (default true). */
        groupByDevice: z.boolean().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ events: RepAccessEvent[] }> => {
    const supabase = context.supabase as any;

    // Only admins can list all reps' access events; others get their own.
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });

    let q = supabase
      .from("rep_access_events")
      .select(
        "id, representante_id, user_id, signed_in_at, lat, lng, accuracy, has_location, user_agent, device_id, session_id, platform",
      )
      .gte("signed_in_at", data.from)
      .lte("signed_in_at", data.to)
      .order("signed_in_at", { ascending: false })
      .limit(1000);

    if (!isAdmin) q = q.eq("user_id", context.userId);
    if (data.repIds?.length) q = q.in("representante_id", data.repIds);
    if (data.onlyWithLocation) q = q.eq("has_location", true);

    const { data: rows, error } = await q;
    if (error) throw error;

    const repIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.representante_id).filter(Boolean)),
    );
    const userIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.user_id).filter(Boolean)),
    );
    const repById = new Map<string, string>();
    const repByUser = new Map<string, string>();
    const repByEmail = new Map<string, string>();
    const emailByUser = new Map<string, string>();

    if (repIds.length) {
      const { data: reps } = await supabase
        .from("representantes")
        .select("id, nombre")
        .in("id", repIds);
      (reps ?? []).forEach((r: any) => repById.set(r.id, r.nombre));
    }
    const repIdByUser = new Map<string, string>();
    if (userIds.length) {
      const { data: reps } = await supabase
        .from("representantes")
        .select("id, user_id, nombre")
        .in("user_id", userIds);
      (reps ?? []).forEach((r: any) => {
        if (r.user_id) {
          repByUser.set(r.user_id, r.nombre);
          repIdByUser.set(r.user_id, r.id);
        }
      });


      // Fallback: representantes.user_id is often null → resolve via email in auth.users
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const missing = userIds.filter((u) => !repByUser.has(u as string));
        if (missing.length) {
          const emails: string[] = [];
          for (const uid of missing) {
            const { data: au } = await (supabaseAdmin as any).auth.admin.getUserById(uid);
            const email = au?.user?.email;
            const fullName =
              au?.user?.user_metadata?.full_name ?? au?.user?.user_metadata?.name ?? null;
            if (email) {
              emailByUser.set(uid as string, email);
              emails.push(email);
            }
            if (fullName) repByUser.set(uid as string, fullName);
          }
          if (emails.length) {
            const { data: repsByMail } = await (supabaseAdmin as any)
              .from("representantes")
              .select("email, nombre")
              .in("email", emails);
            (repsByMail ?? []).forEach((r: any) => {
              if (r.email) repByEmail.set(String(r.email).toLowerCase(), r.nombre);
            });
          }
        }
      } catch {
        // ignore – fall back to whatever we already have
      }
    }

    const events: RepAccessEvent[] = (rows ?? []).map((r: any) => {
      const email = r.user_id ? emailByUser.get(r.user_id)?.toLowerCase() : null;
      const nombre =
        (r.representante_id ? repById.get(r.representante_id) : null) ??
        (r.user_id ? repByUser.get(r.user_id) : null) ??
        (email ? repByEmail.get(email) : null) ??
        (r.user_id ? emailByUser.get(r.user_id) ?? null : null);
      return {
        id: r.id,
        device_id: r.device_id ?? null,
        device_label: deviceLabel(r.platform ?? null, r.user_agent ?? null),
        group_count: 1,
        last_seen_at: r.signed_in_at,
        visit: null,
        representante_id: r.representante_id,
        representante_nombre: nombre ?? null,
        user_id: r.user_id,
        signed_in_at: r.signed_in_at,
        lat: r.lat != null ? Number(r.lat) : null,
        lng: r.lng != null ? Number(r.lng) : null,
        accuracy: r.accuracy != null ? Number(r.accuracy) : null,
        has_location: !!r.has_location,
        user_agent: r.user_agent ?? null,
      };
    });

    // ── Match each sign-in with the visit registered around the same moment ──
    try {
      const { data: visits } = await supabase
        .from("rep_visits")
        .select(
          "id, representante_id, cliente_id, check_in_at, check_out_at, outcome, unplanned, check_in_lat, check_in_lng",
        )
        .gte("check_in_at", new Date(new Date(data.from).getTime() - 2 * 3600_000).toISOString())
        .lte("check_in_at", new Date(new Date(data.to).getTime() + 2 * 3600_000).toISOString())
        .limit(2000);

      const cliIds = [
        ...new Set((visits ?? []).map((v: any) => v.cliente_id).filter(Boolean)),
      ];
      const cliName = new Map<string, string>();
      if (cliIds.length) {
        const { data: clis } = await supabase
          .from("clientes")
          .select("id, nombre_comercial, razon_social")
          .in("id", cliIds);
        (clis ?? []).forEach((c: any) =>
          cliName.set(String(c.id), c.nombre_comercial ?? c.razon_social ?? "Cliente"),
        );
      }

      for (const e of events) {
        // Only enrich when we can positively tie the visit to THIS user's
        // representante record. Without it we'd attach someone else's visit.
        const eRepId =
          e.representante_id ?? (e.user_id ? repIdByUser.get(e.user_id) ?? null : null);
        if (!eRepId) continue;
        const t = new Date(e.signed_in_at).getTime();
        let best: any = null;
        let bestScore = Infinity;
        for (const v of visits ?? []) {
          if (!v.representante_id || v.representante_id !== eRepId) continue;
          const dtMin = Math.abs(new Date(v.check_in_at).getTime() - t) / 60000;
          if (dtMin > 45) continue;

          let dist: number | null = null;
          if (e.lat != null && e.lng != null && v.check_in_lat != null && v.check_in_lng != null) {
            dist = haversineM(
              { lat: e.lat, lng: e.lng },
              { lat: Number(v.check_in_lat), lng: Number(v.check_in_lng) },
            );
            if (dist > 500) continue;
          }
          const score = dtMin + (dist ?? 0) / 100;
          if (score < bestScore) {
            bestScore = score;
            best = { v, dist };
          }
        }
        if (best) {
          const v = best.v;
          e.visit = {
            id: v.id,
            cliente: cliName.get(String(v.cliente_id)) ?? "Cliente",
            check_in_at: v.check_in_at,
            check_out_at: v.check_out_at ?? null,
            minutos: v.check_out_at
              ? Math.max(
                  0,
                  Math.round(
                    (new Date(v.check_out_at).getTime() - new Date(v.check_in_at).getTime()) / 60000,
                  ),
                )
              : null,
            unplanned: !!v.unplanned,
            outcome: v.outcome ?? null,
            distancia_m: best.dist ?? null,
          };
        }
      }
    } catch {
      // visit enrichment is best-effort
    }

    if (data.groupByDevice === false) return { events };

    // Group: same user + device (fallback user_agent) + same 30-min bucket +
    // location rounded to ~11m. Keeps the most recent event of each group.
    const groups = new Map<string, RepAccessEvent>();
    for (const e of events) {
      const bucket = Math.floor(new Date(e.signed_in_at).getTime() / (30 * 60_000));
      const loc =
        e.lat != null && e.lng != null
          ? `${e.lat.toFixed(4)},${e.lng.toFixed(4)}`
          : "noloc";
      const key = `${e.user_id}|${e.device_id ?? e.user_agent ?? "?"}|${bucket}|${loc}`;
      const prev = groups.get(key);
      if (!prev) {
        groups.set(key, { ...e });
      } else {
        prev.group_count += 1;
        if (new Date(e.signed_in_at) > new Date(prev.last_seen_at)) prev.last_seen_at = e.signed_in_at;
        if (new Date(e.signed_in_at) < new Date(prev.signed_in_at)) prev.signed_in_at = e.signed_in_at;
        if (!prev.visit && e.visit) prev.visit = e.visit;
      }
    }
    return {
      events: [...groups.values()].sort(
        (a, b) => new Date(b.signed_in_at).getTime() - new Date(a.signed_in_at).getTime(),
      ),
    };
  });
