import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { BackfillInvoice } from "./backfill-sales.server";

export const backfillNetsuiteSales2026Fn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { empresaId: string; invoices: BackfillInvoice[] }) => input,
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc(
      "has_role",
      { _user_id: context.userId, _role: "admin" },
    );
    if (roleErr || !isAdmin) {
      throw new Error("Forbidden: se requiere rol admin para ejecutar el backfill");
    }
    const { runNetsuiteBackfillChunk } = await import("./backfill-sales.server");
    return runNetsuiteBackfillChunk(data.invoices);
  });
