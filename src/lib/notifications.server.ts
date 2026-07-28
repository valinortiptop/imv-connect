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

function emailHtml(input: NotificationInput, appUrl: string) {
  const link = input.route ? `${appUrl}${input.route}` : appUrl;
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#111">
    <div style="background:#0b1f5c;color:#fff;padding:14px 18px;border-radius:8px 8px 0 0">
      <strong style="font-size:15px">IMV — ${escapeHtml(input.category ? input.category.toUpperCase() : "AVISO")}</strong>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;padding:18px;border-radius:0 0 8px 8px">
      <h2 style="margin:0 0 8px;font-size:18px">${escapeHtml(input.title)}</h2>
      ${input.description ? `<p style="margin:0 0 14px;color:#374151">${escapeHtml(input.description)}</p>` : ""}
      <a href="${link}" style="display:inline-block;background:#0b1f5c;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:13px">Abrir en la plataforma</a>
      <p style="margin:16px 0 0;font-size:11px;color:#6b7280">
        Puedes ajustar qué notificaciones recibes en Configuración → Notificaciones.
      </p>
    </div>
  </div>`;
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
        await sendEmail({
          from,
          to,
          subject: input.title,
          html: emailHtml({ ...input, category }, appUrl),
        });
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
