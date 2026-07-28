import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const channelEnum = z.enum(["email", "sms", "whatsapp", "in_app"]);

async function assertAdmin(context: any) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!data) throw new Error("Solo administradores pueden modificar plantillas");
}

export const listTemplatesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("message_templates")
      .select("*")
      .order("channel", { ascending: true })
      .order("category", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return { templates: (data ?? []) as any[], isAdmin: !!isAdmin };
  });

const upsertInput = z.object({
  id: z.string().uuid().optional(),
  key: z.string().min(2).max(80).regex(/^[a-z0-9_]+$/, "Usa minúsculas, números y guion bajo"),
  name: z.string().min(2).max(120),
  channel: channelEnum,
  category: z.string().min(2).max(40),
  subject: z.string().max(300).nullable().optional(),
  body_html: z.string().max(60000).nullable().optional(),
  body_text: z.string().max(20000).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  is_active: z.boolean().optional(),
});

export const saveTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { extractVariables } = await import("@/lib/message-templates.server");
    const variables = extractVariables(data.subject, data.body_html, data.body_text);
    const payload: any = {
      key: data.key,
      name: data.name,
      channel: data.channel,
      category: data.category,
      subject: data.subject ?? null,
      body_html: data.body_html ?? null,
      body_text: data.body_text ?? null,
      description: data.description ?? null,
      variables,
    };
    if (data.is_active !== undefined) payload.is_active = data.is_active;

    if (data.id) {
      const { error } = await context.supabase
        .from("message_templates")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    payload.created_by = context.userId;
    const { data: row, error } = await context.supabase
      .from("message_templates")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as any).id as string };
  });

export const toggleTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("message_templates")
      .update({ is_active: data.active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("message_templates")
      .delete()
      .eq("id", data.id)
      .eq("is_system", false);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const duplicateTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: src, error } = await context.supabase
      .from("message_templates")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    const s = src as any;
    const suffix = Math.random().toString(36).slice(2, 6);
    const { data: row, error: e2 } = await context.supabase
      .from("message_templates")
      .insert({
        key: `${s.key}_copia_${suffix}`.slice(0, 80),
        name: `${s.name} (copia)`,
        channel: s.channel,
        category: s.category,
        subject: s.subject,
        body_html: s.body_html,
        body_text: s.body_text,
        description: s.description,
        variables: s.variables,
        is_system: false,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (e2) throw new Error(e2.message);
    return { id: (row as any).id as string };
  });

/** Envía una prueba del template al correo indicado (o al del usuario). */
export const sendTestTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        to: z.string().email().optional(),
        vars: z.record(z.string(), z.string()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: tpl, error } = await context.supabase
      .from("message_templates")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    const t = tpl as any;
    if (t.channel !== "email") {
      return { ok: false, message: "Solo el canal Email permite envío de prueba por ahora." };
    }
    const to = data.to || context.claims?.email;
    if (!to) throw new Error("No hay correo destino");

    const { renderTemplateString } = await import("@/lib/message-templates.server");
    const { sendEmail } = await import("@/lib/valinor-proxy.server");
    const vars = data.vars ?? {};
    const from =
      process.env.NOTIFICATIONS_EMAIL_FROM ||
      process.env.COBRANZA_EMAIL_FROM ||
      "IMV <onboarding@resend.dev>";
    await sendEmail({
      from,
      to,
      subject: `[Prueba] ${renderTemplateString(t.subject ?? t.name, vars)}`,
      html: renderTemplateString(t.body_html ?? `<pre>${t.body_text ?? ""}</pre>`, vars),
    });
    return { ok: true, message: `Correo de prueba enviado a ${to}` };
  });
