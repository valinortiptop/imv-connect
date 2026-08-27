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
};

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
    if (userIds.length) {
      const { data: reps } = await supabase
        .from("representantes")
        .select("id, user_id, nombre")
        .in("user_id", userIds);
      (reps ?? []).forEach((r: any) => {
        if (r.user_id) repByUser.set(r.user_id, r.nombre);
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
      }
    }
    return {
      events: [...groups.values()].sort(
        (a, b) => new Date(b.signed_in_at).getTime() - new Date(a.signed_in_at).getTime(),
      ),
    };
  });
