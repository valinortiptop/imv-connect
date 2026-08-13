import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const entitySchema = z.enum(["ventas", "clientes", "productos", "inventario"]);

async function assertAdmin(context: {
  supabase: { rpc: (fn: string, args: unknown) => Promise<{ data: unknown; error: unknown }> };
  userId: string;
}) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !data) {
    throw new Error("Forbidden: se requiere rol admin para la integración NetSuite");
  }
}

/** Prueba de conexión contra NetSuite. */
export const netsuitePingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{
    ok: boolean;
    configured: boolean;
    account: string | null;
    companyName: string | null;
    error: string | null;
  }> => {
    await assertAdmin(context as never);
    const { pingNetsuite, isNetsuiteConfigured } = await import("./netsuite.server");
    if (!isNetsuiteConfigured()) {
      return {
        ok: false,
        configured: false,
        account: null,
        companyName: null,
        error: "Faltan los secretos de NetSuite (NETSUITE_*).",
      };
    }
    const res = await pingNetsuite();
    return {
      ok: res.ok,
      configured: true,
      account: res.account ?? null,
      companyName: res.companyName ?? null,
      error: res.error ?? null,
    };
  });


/** Ejecuta una sincronización manual de una entidad. */
export const netsuiteSyncFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        entity: entitySchema,
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { runNetsuiteSync } = await import("./netsuite-sync.server");
    return runNetsuiteSync({
      entity: data.entity,
      from: data.from,
      to: data.to,
      triggerSource: "manual",
      triggeredBy: context.userId,
    });
  });

/** Bitácora de ejecuciones. */
export const netsuiteRunsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ limit: z.number().min(1).max(200).default(30) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { data: rows, error } = await context.supabase
      .from("netsuite_sync_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
