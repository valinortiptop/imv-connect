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

/* ------------------------------------------------------------------ */
/*  Eventos de la plataforma → notificación + plantilla                */
/* ------------------------------------------------------------------ */

import type { NotificationEvent } from "@/lib/notification-events";

type EventDef = {
  category: string;
  /** Plantilla de la librería (misma clave que el evento por defecto). */
  templateKey?: string;
  priority?: string;
  type?: string;
  /** Roles que reciben el aviso además de los usuarios explícitos. */
  roles?: string[];
  title: (v: Record<string, any>) => string;
  description: (v: Record<string, any>) => string;
  route?: (v: Record<string, any>) => string | null;
};

const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));

export const EVENT_MAP: Record<NotificationEvent, EventDef> = {
  pedido_creado: {
    category: "ventas",
    roles: ["admin", "ventas"],
    title: (v) => `Nuevo pedido ${s(v.folio)}`,
    description: (v) => `${s(v.cliente)} · ${s(v.total)}`,
    route: (v) => (v.pedido_id ? `/admin/pedidos/${v.pedido_id}` : "/admin/pedidos"),
  },
  pedido_confirmado: {
    category: "ventas",
    roles: ["admin", "ventas", "almacen"],
    title: (v) => `Pedido ${s(v.folio)} confirmado`,
    description: (v) => `${s(v.cliente)} · ${s(v.total)}`,
    route: (v) => (v.pedido_id ? `/admin/pedidos/${v.pedido_id}` : "/admin/pedidos"),
  },
  pedido_cancelado: {
    category: "ventas",
    priority: "alta",
    type: "warning",
    roles: ["admin", "ventas"],
    title: (v) => `Pedido ${s(v.folio)} cancelado`,
    description: (v) => `${s(v.cliente)} · ${s(v.motivo)}`,
    route: (v) => (v.pedido_id ? `/admin/pedidos/${v.pedido_id}` : "/admin/pedidos"),
  },
  cotizacion_enviada: {
    category: "ventas",
    roles: ["admin", "ventas"],
    title: (v) => `Cotización ${s(v.folio)}`,
    description: (v) => `${s(v.cliente)} · ${s(v.total)}`,
    route: () => "/admin/pedidos",
  },
  pedido_en_ruta: {
    category: "logistica",
    roles: ["admin", "logistica"],
    title: (v) => `Pedido ${s(v.folio)} en ruta`,
    description: (v) => `${s(v.cliente)} · ETA ${s(v.eta)}`,
    route: () => "/admin/logistica",
  },
  pedido_entregado: {
    category: "logistica",
    roles: ["admin", "logistica", "ventas"],
    title: (v) => `Pedido ${s(v.folio)} entregado`,
    description: (v) => `${s(v.cliente)} · recibió ${s(v.recibio)}`,
    route: () => "/admin/logistica",
  },
  factura_emitida: {
    category: "contabilidad",
    roles: ["admin", "facturacion", "contabilidad"],
    title: (v) => `Factura ${s(v.folio)} emitida`,
    description: (v) => `${s(v.cliente)} · ${s(v.total)}`,
    route: (v) => (v.factura_id ? `/admin/facturas/${v.factura_id}` : "/admin/facturas"),
  },
  factura_cancelada: {
    category: "contabilidad",
    priority: "alta",
    type: "warning",
    roles: ["admin", "facturacion", "contabilidad"],
    title: (v) => `Factura ${s(v.folio)} cancelada`,
    description: (v) => `${s(v.cliente)} · ${s(v.motivo)}`,
    route: (v) => (v.factura_id ? `/admin/facturas/${v.factura_id}` : "/admin/facturas"),
  },
  complemento_pago_emitido: {
    category: "contabilidad",
    roles: ["admin", "facturacion", "contabilidad", "cobranza"],
    title: (v) => `Complemento de pago ${s(v.folio)}`,
    description: (v) => `${s(v.cliente)} · ${s(v.monto)}`,
    route: () => "/admin/credito-cobranza/complementos",
  },
  pago_registrado: {
    category: "cobranza",
    roles: ["admin", "cobranza", "contabilidad"],
    title: (v) => `Pago registrado — ${s(v.cliente)}`,
    description: (v) => `${s(v.monto)} · ${s(v.documentos)}`,
    route: () => "/admin/credito-cobranza/cartera",
  },
  credito_autorizacion_solicitud: {
    category: "cobranza",
    priority: "alta",
    roles: ["admin", "cobranza"],
    title: (v) => `Solicitud de autorización — ${s(v.cliente)}`,
    description: (v) => `${s(v.tipo)} · ${s(v.monto)} · ${s(v.motivo)}`,
    route: () => "/admin/credito-cobranza/autorizaciones",
  },
  credito_autorizacion_resuelta: {
    category: "cobranza",
    title: (v) => `Autorización ${s(v.resultado)} — ${s(v.cliente)}`,
    description: (v) => `${s(v.tipo)} · ${s(v.respuesta)}`,
    route: () => "/admin/credito-cobranza/autorizaciones",
  },
  cliente_bloqueado_credito: {
    category: "cobranza",
    priority: "critica",
    type: "error",
    roles: ["admin", "cobranza"],
    title: (v) => `Cliente bloqueado — ${s(v.cliente)}`,
    description: (v) => `${s(v.motivo)} · vencido ${s(v.saldo_vencido)}`,
    route: (v) => (v.cliente_id ? `/admin/credito-cobranza/clientes/${v.cliente_id}` : "/admin/credito-cobranza/cartera"),
  },
  oc_creada: {
    category: "compras",
    roles: ["admin", "compras"],
    title: (v) => `Orden de compra ${s(v.folio)}`,
    description: (v) => `${s(v.proveedor)} · ${s(v.total)}`,
    route: (v) => (v.oc_id ? `/admin/compras/${v.oc_id}` : "/admin/compras/ordenes"),
  },
  oc_recibida: {
    category: "compras",
    roles: ["admin", "compras", "almacen"],
    title: (v) => `Recepción de OC ${s(v.folio)}`,
    description: (v) => `${s(v.proveedor)} · ${s(v.estado)}`,
    route: (v) => (v.oc_id ? `/admin/compras/${v.oc_id}` : "/admin/compras/ordenes"),
  },
  compras_alerta: {
    category: "compras",
    priority: "alta",
    type: "warning",
    roles: ["admin", "compras"],
    title: (v) => `Alerta de abasto — ${s(v.producto)}`,
    description: (v) => `${s(v.sku)} · existencia ${s(v.existencia)} / mínimo ${s(v.minimo)}`,
    route: () => "/admin/compras/alertas",
  },
  almacen_recepcion: {
    category: "almacen",
    roles: ["admin", "almacen", "compras"],
    title: (v) => `Recepción ${s(v.folio)} registrada`,
    description: (v) => `${s(v.almacen)} · ${s(v.piezas)} piezas`,
    route: () => "/admin/almacen/recepciones",
  },
  almacen_traspaso: {
    category: "almacen",
    roles: ["admin", "almacen"],
    title: (v) => `Traspaso ${s(v.folio)}`,
    description: (v) => `${s(v.origen)} → ${s(v.destino)} · ${s(v.piezas)} piezas`,
    route: () => "/admin/almacen/traspasos",
  },
  almacen_stock_bajo: {
    category: "almacen",
    priority: "alta",
    type: "warning",
    roles: ["admin", "almacen", "compras"],
    title: (v) => `Stock bajo — ${s(v.producto)}`,
    description: (v) => `${s(v.existencia)} piezas (mínimo ${s(v.minimo)})`,
    route: () => "/admin/inventario",
  },
  almacen_caducidad: {
    category: "almacen",
    priority: "alta",
    type: "warning",
    roles: ["admin", "almacen", "compras"],
    title: (v) => `Lotes por caducar — ${s(v.almacen)}`,
    description: (v) => `${s(v.piezas)} piezas próximas a caducar`,
    route: () => "/admin/almacen/reportes",
  },
  devolucion_registrada: {
    category: "almacen",
    roles: ["admin", "almacen", "ventas"],
    title: (v) => `Devolución ${s(v.folio)}`,
    description: (v) => `${s(v.cliente)} · ${s(v.total)}`,
    route: (v) => (v.devolucion_id ? `/admin/devoluciones/${v.devolucion_id}` : "/admin/devoluciones/lista"),
  },
  rep_ruta_asignada: {
    category: "rep",
    title: (v) => `Ruta del ${s(v.fecha)}`,
    description: (v) => `${s(v.num_clientes)} visitas programadas`,
    route: () => "/rep/ruta",
  },
  visita_registrada: {
    category: "rep",
    title: (v) => `Visita registrada — ${s(v.cliente)}`,
    description: (v) => `${s(v.representante)} · ${s(v.resultado)}`,
    route: () => "/rep/visitas",
  },
  tarea_asignada: {
    category: "sistema",
    priority: "alta",
    title: (v) => `Nueva tarea: ${s(v.titulo)}`,
    description: (v) => `${s(v.tablero)} · vence ${s(v.vence)}`,
    route: () => "/admin/tareas",
  },
  usuario_bienvenida: {
    category: "sistema",
    title: (v) => `Bienvenido a IMV, ${s(v.nombre)}`,
    description: (v) => `Tu rol asignado es ${s(v.rol)}`,
    route: () => "/admin",
  },
  usuario_rol_actualizado: {
    category: "sistema",
    title: () => "Tu acceso fue actualizado",
    description: (v) => `Rol: ${s(v.rol_anterior)} → ${s(v.rol_nuevo)}`,
    route: () => "/admin/cuenta",
  },
};

/**
 * Dispara la notificación correspondiente a un evento de la plataforma.
 * Nunca lanza: los avisos no deben tumbar la operación que los originó.
 */
export async function notifyEvent(
  event: NotificationEvent,
  vars: Record<string, any> = {},
  opts: { userIds?: string[]; extraRoles?: string[]; forceEmail?: boolean } = {},
) {
  try {
    const def = EVENT_MAP[event];
    if (!def) return { ok: false, reason: "unknown_event" };

    const roles = Array.from(new Set([...(def.roles ?? []), ...(opts.extraRoles ?? [])]));
    const roleUsers = roles.length ? await usersWithRoles(roles) : [];
    const recipients = Array.from(new Set([...(opts.userIds ?? []), ...roleUsers].filter(Boolean)));
    if (!recipients.length) return { ok: true, total: 0 };

    const appUrl = process.env.APP_PUBLIC_URL || "https://app.imv.lat";
    const route = def.route?.(vars) ?? null;

    const res = await dispatchToUsers(recipients, {
      title: def.title(vars),
      description: def.description(vars),
      category: def.category,
      type: def.type ?? "info",
      priority: def.priority ?? "media",
      route,
      entityId: vars.entity_id ?? null,
      forceEmail: opts.forceEmail,
      templateKey: def.templateKey ?? event,
      templateVars: { ...vars, link: route ? `${appUrl}${route}` : appUrl },
    });
    return { ...res, ok: true as const };
  } catch (e) {
    console.error(`[notifyEvent:${event}]`, (e as Error).message);
    return { ok: false, reason: (e as Error).message };
  }
}
