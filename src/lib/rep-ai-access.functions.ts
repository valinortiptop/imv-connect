import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Solo administradores");
}

/** Representantes + quién tiene permitido activar la IA. */
export const getRepAiAccessFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase, context.userId);

    const [repsRes, accRes] = await Promise.all([
      supabase.from("representantes").select("id, nombre, email, activo").order("nombre"),
      supabase.from("rep_ai_access").select("representante_id, allowed, updated_at"),
    ]);
    if (repsRes.error) throw new Error(repsRes.error.message);
    if (accRes.error) throw new Error(accRes.error.message);

    const allowed: Record<string, boolean> = {};
    for (const row of accRes.data ?? []) allowed[row.representante_id] = !!row.allowed;

    return {
      representantes: (repsRes.data ?? []) as {
        id: string;
        nombre: string;
        email: string | null;
        activo: boolean | null;
      }[],
      allowed,
    };
  });

/** Permite o bloquea que los representantes indicados activen la IA. */
export const setRepAiAccessFn = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        representante_ids: z.array(z.string().uuid()).min(1).max(1000),
        allowed: z.boolean(),
      })
      .parse(d),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase, context.userId);

    const rows = data.representante_ids.map((id) => ({
      representante_id: id,
      allowed: data.allowed,
      updated_by: context.userId,
    }));
    const { error } = await supabase
      .from("rep_ai_access")
      .upsert(rows, { onConflict: "representante_id" });
    if (error) throw new Error(error.message);
    return { ok: true, count: rows.length };
  });
