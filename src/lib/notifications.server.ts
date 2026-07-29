/**
 * Despachador central de notificaciones.
 * Server-only: nunca importar desde el bundle del cliente.
 *
 * Canales:
 *  - in_app: fila en `public.notifications` (campana + centro de notificaciones)
 *  - email:  Resend a través del proxy de Valinor
 *  - sms:    pendiente (se registra como 'pending' sin enviar)
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmail } from "@/lib/valinor-proxy.server";
import { normalizeCategory } from "@/lib/notification-categories";

export type NotificationInput = {
  userId: string;
  title: string;
  description?: string | null;
  category?: string | null;
  type?: string | null;
  priority?: string | null;
  route?: string | null;
  entityId?: string | null;
  /** Fuerza el envío por email aunque el usuario no lo tenga activado. */
  forceEmail?: boolean;
  /** Plantilla de la librería a usar para el correo (default: notificacion_generica). */
  templateKey?: string;
  /** Variables extra para la plantilla. */
  templateVars?: Record<string, unknown>;
};

type Prefs = { in_app: boolean; email: boolean; sms: boolean };

const DEFAULT_PREFS: Prefs = { in_app: true, email: false, sms: false };

export async function getPrefs(userId: string, category: string): Promise<Prefs> {
  const { data } = await supabaseAdmin
    .from("notification_preferences")
    .select("in_app, email, sms")
    .eq("user_id", userId)
    .eq("category", category)
    .maybeSingle();
  if (!data) return DEFAULT_PREFS;
  return {
    in_app: (data as any).in_app ?? true,
    email: (data as any).email ?? false,
    sms: (data as any).sms ?? false,
  };
}

async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    return data?.user?.email ?? null;
  } catch {
    return null;
  }
}

const IMV_LOGO =
  "https://app.imv.lat/__l5e/assets-v1/a1c9ed21-14da-4707-9632-705242990ce4/imv-logo-full-white.png";

/** Layout base de correo (mismo diseño que las plantillas de la librería). */
export function emailLayout(opts: {
  categoryLabel: string;
  title: string;
  bodyHtml: string;
  ctaLabel?: string;
  link?: string;
}) {
  const cta = opts.link
    ? `<a href="${opts.link}" style="display:inline-block;background:#0b1f5c;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:6px;font-size:13px;font-weight:bold">${opts.ctaLabel ?? "Abrir en la plataforma"}</a>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6fb">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f4f6fb;padding:24px 12px"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" role="presentation" style="width:600px;max-width:100%;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif">
<tr><td style="background:#0b1f5c;padding:18px 24px"><table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
<td align="left"><img src="${IMV_LOGO}" alt="IMV" width="110" style="display:block;border:0;width:110px;height:auto"></td>
<td align="right" style="color:#7dd3d8;font-size:11px;letter-spacing:1.5px;text-transform:uppercase">${escapeHtml(opts.categoryLabel)}</td>
</tr></table></td></tr>
<tr><td style="padding:28px 24px 4px"><h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#0b1f5c">${escapeHtml(opts.title)}</h1>
<div style="font-size:14px;line-height:1.6;color:#374151">${opts.bodyHtml}</div></td></tr>
<tr><td style="padding:18px 24px 28px">${cta}</td></tr>
<tr><td style="background:#f4f6fb;border-top:1px solid #e5e7eb;padding:18px 24px;color:#6b7280;font-size:11px;line-height:1.7">
<strong style="color:#0b1f5c">IMV — Insumos Médicos</strong><br>
Este es un correo automático de la plataforma IMV. Puedes ajustar qué avisos recibes en Configuración → Notificaciones.<br>
<a href="https://app.imv.lat" style="color:#0b1f5c;text-decoration:none">app.imv.lat</a>
</td></tr></table></td></tr></table></body></html>`;
}

function emailHtml(input: NotificationInput, appUrl: string) {
  const link = input.route ? `${appUrl}${input.route}` : appUrl;
  return emailLayout({
    categoryLabel: input.category ? input.category.toUpperCase() : "AVISO",
    title: input.title,
    bodyHtml: input.description ? `<p style="margin:0">${escapeHtml(input.description)}</p>` : "",
    link,
  });
}


function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

/** Crea (y envía) una notificación respetando las preferencias del usuario. */
export async function dispatchNotification(input: NotificationInput) {
  const category = normalizeCategory(input.category);
  const prefs = await getPrefs(input.userId, category);
  const wantsEmail = input.forceEmail || prefs.email;

  let notificationId: string | null = null;

  if (prefs.in_app || wantsEmail) {
    const { data, error } = await supabaseAdmin
      .from("notifications")
      .insert({
        user_id: input.userId,
        title: input.title,
        description: input.description ?? null,
        category,
        type: input.type ?? "info",
        priority: input.priority ?? "media",
        route: input.route ?? null,
        entity_id: input.entityId ?? null,
        channel_status: { in_app: prefs.in_app ? "sent" : "skipped" },
      })
      .select("id")
      .single();
    if (error) throw error;
    notificationId = (data as any).id as string;
  }

  const deliveries: any[] = [];

  if (wantsEmail) {
    const to = await getUserEmail(input.userId);
    const from = process.env.NOTIFICATIONS_EMAIL_FROM || process.env.COBRANZA_EMAIL_FROM || "IMV <onboarding@resend.dev>";
    const appUrl = process.env.APP_PUBLIC_URL || "https://app.imv.lat";
    if (!to) {
      deliveries.push({
        notification_id: notificationId,
        user_id: input.userId,
        channel: "email",
        status: "error",
        error: "Usuario sin correo registrado",
      });
    } else {
      try {
        // Si existe una plantilla activa en la librería, se usa; si no, el HTML base.
        let subject = input.title;
        let html = emailHtml({ ...input, category }, appUrl);
        try {
          const { renderTemplate } = await import("@/lib/message-templates.server");
          const { CATEGORY_LABEL } = await import("@/lib/notification-categories");
          const rendered = await renderTemplate(
            input.templateKey || "notificacion_generica",
            {
              title: input.title,
              description: input.description ?? "",
              category_label: CATEGORY_LABEL[category] ?? category,
              link: input.route ? `${appUrl}${input.route}` : appUrl,
              ...(input.templateVars ?? {}),
            },
            "email",
          );
          if (rendered?.html) {
            html = rendered.html;
            if (rendered.subject) subject = rendered.subject;
          }
        } catch {
          /* fallback al HTML base */
        }
        await sendEmail({ from, to, subject, html });
        deliveries.push({
          notification_id: notificationId,
          user_id: input.userId,
          channel: "email",
          status: "sent",
          target: to,
          sent_at: new Date().toISOString(),
        });
        if (notificationId) {
          await supabaseAdmin
            .from("notifications")
            .update({ emailed_at: new Date().toISOString() })
            .eq("id", notificationId);
        }
      } catch (e) {
        deliveries.push({
          notification_id: notificationId,
          user_id: input.userId,
          channel: "email",
          status: "error",
          target: to,
          error: (e as Error).message.slice(0, 500),
        });
      }
    }
  }

  if (prefs.sms) {
    // SMS pendiente de proveedor: se registra la intención sin enviar.
    deliveries.push({
      notification_id: notificationId,
      user_id: input.userId,
      channel: "sms",
      status: "pending",
      error: "Canal SMS aún no habilitado",
    });
  }

  if (deliveries.length) {
    await supabaseAdmin.from("notification_deliveries").insert(deliveries);
  }

  return { id: notificationId, prefs, deliveries: deliveries.length };
}

/** Despacha la misma notificación a varios usuarios. */
export async function dispatchToUsers(userIds: string[], input: Omit<NotificationInput, "userId">) {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  const results = await Promise.allSettled(
    unique.map((userId) => dispatchNotification({ ...input, userId })),
  );
  return {
    total: unique.length,
    ok: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
  };
}

/** Usuarios que tienen alguno de los roles dados. */
export async function usersWithRoles(roles: string[]): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .in("role", roles as any);
  return Array.from(new Set(((data ?? []) as any[]).map((r) => r.user_id)));
}
