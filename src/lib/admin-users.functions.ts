import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ROLES = ["admin", "ventas", "almacen", "logistica", "viewer"] as const;

async function assertAdmin(context: any) {
  const { data: isAdmin, error: roleErr } = await context.supabase.rpc(
    "has_role",
    { _user_id: context.userId, _role: "admin" },
  );
  if (roleErr) throw new Error(roleErr.message);
  if (!isAdmin) throw new Error("Forbidden: admin role required");
}

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
    await assertAdmin(context);

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

    const { notifyEvent } = await import("@/lib/notifications.server");
    await notifyEvent(
      "usuario_bienvenida",
      { nombre: data.full_name || data.email, email: data.email, rol: data.role },
      { userIds: [newUserId], forceEmail: true },
    );

    return { user_id: newUserId, email: data.email };
  });

export const updateUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        user_id: z.string().uuid(),
        email: z.string().email().optional(),
        password: z.string().min(6).optional(),
        full_name: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const attrs: Record<string, any> = {};
    if (data.email) attrs.email = data.email;
    if (data.password) attrs.password = data.password;
    if (typeof data.full_name === "string") {
      attrs.user_metadata = { full_name: data.full_name };
    }

    if (Object.keys(attrs).length === 0) {
      return { user_id: data.user_id, updated: false };
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(
      data.user_id,
      attrs,
    );
    if (error) throw new Error(error.message);

    return { user_id: data.user_id, updated: true };
  });
