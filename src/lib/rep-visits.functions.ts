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

/* ── Shelf photos (anaquel) ── */

export const listShelfPhotosFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        visitId: z.string().uuid().optional(),
        clienteId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(200).default(60),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("visit_shelf_photos")
      .select("id, visit_id, cliente_id, category, photo_path, notes, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.visitId) q = q.eq("visit_id", data.visitId);
    if (data.clienteId) q = q.eq("cliente_id", data.clienteId);
    const { data: rows, error } = await q;
    if (error) throw error;

    const paths = (rows ?? []).map((r: any) => r.photo_path);
    let urlMap = new Map<string, string>();
    if (paths.length > 0) {
      const { data: signed } = await context.supabase.storage
        .from("rep-evidence")
        .createSignedUrls(paths, 60 * 60);
      (signed ?? []).forEach((s: any) => {
        if (s.path && s.signedUrl) urlMap.set(s.path, s.signedUrl);
      });
    }
    return {
      photos: (rows ?? []).map((r: any) => ({
        ...r,
        url: urlMap.get(r.photo_path) ?? null,
      })),
    };
  });

export const addShelfPhotoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        visitId: z.string().uuid(),
        clienteId: z.string().uuid().optional(),
        photoPath: z.string().min(3).max(500),
        category: z
          .enum(["anaquel", "exhibicion", "competencia", "precio", "otro"])
          .default("anaquel"),
        notes: z.string().max(1000).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const rep = await getCurrentRep(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("visit_shelf_photos")
      .insert({
        visit_id: data.visitId,
        cliente_id: data.clienteId ?? null,
        representante_id: rep?.id ?? null,
        photo_path: data.photoPath,
        category: data.category,
        notes: data.notes ?? null,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    return { photo: row };
  });

export const deleteShelfPhotoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("visit_shelf_photos")
      .select("photo_path")
      .eq("id", data.id)
      .maybeSingle();
    if (row?.photo_path) {
      await context.supabase.storage.from("rep-evidence").remove([row.photo_path]);
    }
    const { error } = await context.supabase
      .from("visit_shelf_photos")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* ── Dynamic visit forms ── */

export const listFormTemplatesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("visit_form_templates")
      .select("id, name, description, fields, active")
      .eq("active", true)
      .order("name");
    if (error) throw error;
    return { templates: data ?? [] };
  });

export const listFormResponsesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ visitId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("visit_form_responses")
      .select("id, visit_id, template_id, answers, created_at")
      .eq("visit_id", data.visitId);
    if (error) throw error;
    return { responses: rows ?? [] };
  });

export const saveFormResponseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        visitId: z.string().uuid(),
        templateId: z.string().uuid(),
        answers: z.record(z.string(), z.unknown()),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const rep = await getCurrentRep(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("visit_form_responses")
      .insert({
        visit_id: data.visitId,
        template_id: data.templateId,
        representante_id: rep?.id ?? null,
        answers: data.answers as any,
        created_by: context.userId,
      })

      .select()
      .single();
    if (error) throw error;
    return { response: row };
  });
