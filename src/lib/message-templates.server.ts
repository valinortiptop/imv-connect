/**
 * Librería de plantillas de mensajes (email / SMS / WhatsApp / sistema).
 * Server-only.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type MessageTemplate = {
  id: string;
  key: string;
  name: string;
  channel: "email" | "sms" | "whatsapp" | "in_app";
  category: string;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  variables: string[];
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/** Sustituye {{variable}} por su valor. Los faltantes quedan vacíos. */
export function renderTemplateString(tpl: string, vars: Record<string, unknown>) {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k: string) => {
    const v = vars[k];
    return v === undefined || v === null ? "" : String(v);
  });
}

export function extractVariables(...sources: (string | null | undefined)[]) {
  const found = new Set<string>();
  for (const s of sources) {
    if (!s) continue;
    for (const m of s.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) found.add(m[1]);
  }
  return Array.from(found);
}

export async function getTemplate(
  key: string,
  channel: MessageTemplate["channel"] = "email",
): Promise<MessageTemplate | null> {
  const { data } = await supabaseAdmin
    .from("message_templates")
    .select("*")
    .eq("key", key)
    .eq("channel", channel)
    .eq("is_active", true)
    .maybeSingle();
  return (data as any) ?? null;
}

/** Devuelve asunto + cuerpos ya renderizados, o null si no existe la plantilla. */
export async function renderTemplate(
  key: string,
  vars: Record<string, unknown>,
  channel: MessageTemplate["channel"] = "email",
) {
  const tpl = await getTemplate(key, channel);
  if (!tpl) return null;
  return {
    template: tpl,
    subject: tpl.subject ? renderTemplateString(tpl.subject, vars) : null,
    html: tpl.body_html ? renderTemplateString(tpl.body_html, vars) : null,
    text: tpl.body_text ? renderTemplateString(tpl.body_text, vars) : null,
  };
}
