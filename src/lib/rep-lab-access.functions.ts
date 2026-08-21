import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Solo administradores");
}

/** Catálogo de laboratorios + representantes + asignaciones actuales */
export const getRepLabAccessFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase, context.userId);

    const [labsRes, repsRes, accRes] = await Promise.all([
      supabase.from("laboratorios").select("id, nombre").order("nombre"),
      supabase.from("representantes").select("id, nombre, email, activo").order("nombre"),
      supabase.from("rep_lab_access").select("representante_id, laboratorio_id"),
    ]);

    if (labsRes.error) throw new Error(labsRes.error.message);
    if (repsRes.error) throw new Error(repsRes.error.message);
    if (accRes.error) throw new Error(accRes.error.message);

    const byRep: Record<string, string[]> = {};
    for (const row of accRes.data ?? []) {
      (byRep[row.representante_id] ??= []).push(row.laboratorio_id);
    }

    return {
      laboratorios: (labsRes.data ?? []) as { id: string; nombre: string }[],
      representantes: (repsRes.data ?? []) as {
        id: string;
        nombre: string;
        email: string | null;
        activo: boolean | null;
      }[],
      access: byRep,
    };
  });

/**
 * Define los laboratorios visibles para un representante.
 * laboratorio_ids vacío = acceso a todas las líneas.
 */
export const setRepLabAccessFn = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        representante_ids: z.array(z.string().uuid()).min(1),
        laboratorio_ids: z.array(z.string().uuid()),
      })
      .parse(d),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase, context.userId);

    const del = await supabase
      .from("rep_lab_access")
      .delete()
      .in("representante_id", data.representante_ids);
    if (del.error) throw new Error(del.error.message);

    if (data.laboratorio_ids.length) {
      const rows = data.representante_ids.flatMap((rid) =>
        data.laboratorio_ids.map((lid) => ({ representante_id: rid, laboratorio_id: lid })),
      );
      const ins = await supabase.from("rep_lab_access").insert(rows);
      if (ins.error) throw new Error(ins.error.message);
    }

    return { ok: true, reps: data.representante_ids.length, labs: data.laboratorio_ids.length };
  });
