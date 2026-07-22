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
        // Google Places enrichment
        place_id: z.string().max(300).optional(),
        website: z.string().max(500).optional(),
        google_maps_url: z.string().max(500).optional(),
        rating: z.number().optional(),
        review_count: z.number().int().optional(),
        business_status: z.string().max(50).optional(),
        primary_type: z.string().max(80).optional(),
        price_level: z.number().int().optional(),
        opening_hours: z.array(z.string()).optional(),
        description: z.string().max(2000).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const rep = await getCurrentRep(context.supabase, context.userId);
    void rep;
    const enriched = !!data.place_id;
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
        place_id: data.place_id ?? null,
        website: data.website ?? null,
        google_maps_url: data.google_maps_url ?? null,
        rating: data.rating ?? null,
        review_count: data.review_count ?? null,
        business_status: data.business_status ?? null,
        primary_type: data.primary_type ?? null,
        price_level: data.price_level ?? null,
        opening_hours: data.opening_hours ?? null,
        description: data.description ?? null,
        enrichment_status: enriched ? "google_places" : null,
        enriched_at: enriched ? new Date().toISOString() : null,
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
