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
};

export const listRepAccessEventsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        from: z.string(),
        to: z.string(),
        repIds: z.array(z.string()).optional(),
        onlyWithLocation: z.boolean().optional(),
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
        "id, representante_id, user_id, signed_in_at, lat, lng, accuracy, has_location, user_agent",
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
    }

    const events: RepAccessEvent[] = (rows ?? []).map((r: any) => ({
      id: r.id,
      representante_id: r.representante_id,
      representante_nombre:
        (r.representante_id ? repById.get(r.representante_id) : null) ??
        (r.user_id ? repByUser.get(r.user_id) : null) ??
        null,
      user_id: r.user_id,
      signed_in_at: r.signed_in_at,
      lat: r.lat != null ? Number(r.lat) : null,
      lng: r.lng != null ? Number(r.lng) : null,
      accuracy: r.accuracy != null ? Number(r.accuracy) : null,
      has_location: !!r.has_location,
      user_agent: r.user_agent ?? null,
    }));

    return { events };
  });
