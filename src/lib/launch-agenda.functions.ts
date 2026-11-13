import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AgendaSesion = {
  id: string; orden: number; titulo: string; duracion: string | null;
  fecha_hora: string | null; estado: string; responsables: string[];
};

/**
 * Session list for the standalone /agenda page. Any user with a role (is_staff) may read it,
 * including representatives who can't open the onboarding hub. Returns only schedule fields,
 * never notes (acuerdos), objectives or attendees.
 */
export const listAgendaSesionesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: staff, error } = await (context.supabase as any).rpc("is_staff", { _user_id: context.userId });
    if (error) throw new Error(error.message);
    if (!staff) throw new Error("Tu cuenta no tiene un rol asignado.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error: e2 } = await (supabaseAdmin as any)
      .from("onboarding_sesiones")
      .select("id,orden,titulo,duracion,fecha_hora,estado,responsables")
      .order("orden");
    if (e2) throw new Error(e2.message);
    return (data ?? []).map((s: any) => ({ ...s, responsables: Array.isArray(s.responsables) ? s.responsables : [] })) as AgendaSesion[];
  });
