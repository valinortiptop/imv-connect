import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getCurrentRep(supabase: any, userId: string) {
  const { data } = await supabase
    .from("representantes")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  return data as { id: string } | null;
}

export const listMyProspectsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        status: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(80),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("prospects")
      .select(
        "id, name, phone, contact_person, direccion, colonia, municipio, lat, lng, status, source, notes, photo_url, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status);

    // Scope to rep assignment when possible
    q = q.or(`assigned_to.eq.${context.userId},assigned_to.is.null`);
    const { data: rows, error } = await q;
    if (error) throw error;
    return { prospects: rows ?? [] };
  });

export const createProspectFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        name: z.string().min(1).max(200),
        phone: z.string().max(50).optional(),
        contact_person: z.string().max(200).optional(),
        direccion: z.string().max(500).optional(),
        colonia: z.string().max(200).optional(),
        municipio: z.string().max(200).optional(),
        lat: z.number().optional(),
        lng: z.number().optional(),
        notes: z.string().max(2000).optional(),
        source: z.string().max(50).default("campo"),
        photoPath: z.string().max(500).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const rep = await getCurrentRep(context.supabase, context.userId);
    void rep;
    const { data: row, error } = await context.supabase
      .from("prospects")
      .insert({
        name: data.name,
        phone: data.phone ?? null,
        contact_person: data.contact_person ?? null,
        direccion: data.direccion ?? null,
        colonia: data.colonia ?? null,
        municipio: data.municipio ?? null,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        notes: data.notes ?? null,
        source: data.source,
        status: "nuevo",
        assigned_to: context.userId,
        photo_url: data.photoPath ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return { prospect: row };
  });

export const addProspectCallFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        prospectId: z.string().uuid(),
        outcome: z.string().max(50).optional(),
        notes: z.string().max(2000).optional(),
        nextActionAt: z.string().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("prospect_calls")
      .insert({
        prospect_id: data.prospectId,
        outcome: data.outcome ?? null,
        notes: data.notes ?? null,
        next_action_at: data.nextActionAt ?? null,
        called_at: new Date().toISOString(),
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    return { call: row };
  });
