import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ROLES = ["admin", "ventas", "almacen", "logistica", "viewer"] as const;

export const createUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        email: z.string().email(),
        password: z.string().min(6),
        full_name: z.string().optional(),
        role: z.enum(ROLES).default("viewer"),
        approved: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Verify caller is admin
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc(
      "has_role",
      { _user_id: context.userId, _role: "admin" },
    );
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden: admin role required");

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const { data: created, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: data.full_name ? { full_name: data.full_name } : {},
      });
    if (createErr) throw new Error(createErr.message);
    const newUserId = created.user?.id;
    if (!newUserId) throw new Error("Failed to create user");

    const { error: insErr } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: newUserId,
        role: data.role,
        approved: data.approved,
      });
    if (insErr) {
      // best-effort cleanup
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      throw new Error(insErr.message);
    }

    return { user_id: newUserId, email: data.email };
  });
