import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ─────────────────── Listado / centro de notificaciones ─────────────────── */

export const listNotificationsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        category: z.string().optional(),
        type: z.string().optional(),
        priority: z.string().optional(),
        state: z.enum(["all", "unread", "read"]).default("all"),
        userId: z.string().uuid().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(10).max(200).default(100),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });

    let query = supabase
      .from("notifications")
      .select("id, title, description, type, category, priority, route, user_id, read_at, created_at, emailed_at", {
        count: "exact",
      })
      .order("created_at", { ascending: false });

    if (isAdmin) {
      if (data.userId) query = query.eq("user_id", data.userId);
    } else {
      query = query.eq("user_id", userId);
    }

    if (data.category && data.category !== "all") query = query.eq("category", data.category);
    if (data.type && data.type !== "all") query = query.eq("type", data.type);
    if (data.priority && data.priority !== "all") query = query.eq("priority", data.priority);
    if (data.state === "unread") query = query.is("read_at", null);
    if (data.state === "read") query = query.not("read_at", "is", null);
    if (data.from) query = query.gte("created_at", data.from);
    if (data.to) query = query.lte("created_at", `${data.to}T23:59:59`);

    const fromIdx = (data.page - 1) * data.pageSize;
    query = query.range(fromIdx, fromIdx + data.pageSize - 1);

    const { data: rows, count, error } = await query;
    if (error) throw error;

    return {
      rows: (rows ?? []) as any[],
      total: count ?? 0,
      isAdmin: !!isAdmin,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

/** KPIs + conteo por categoría del alcance visible del usuario. */
export const getNotificationStatsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ userId: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });

    let q = supabase
      .from("notifications")
      .select("id, category, priority, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(2000);

    if (isAdmin) {
      if (data.userId) q = q.eq("user_id", data.userId);
    } else {
      q = q.eq("user_id", userId);
    }

    const { data: rows, error } = await q;
    if (error) throw error;

    const list = (rows ?? []) as any[];
    const todayIso = new Date().toISOString().slice(0, 10);
    const byCategory: Record<string, number> = {};
    let unread = 0;
    let today = 0;
    let critical = 0;
    for (const r of list) {
      byCategory[r.category ?? "sistema"] = (byCategory[r.category ?? "sistema"] ?? 0) + 1;
      if (!r.read_at) unread++;
      if (String(r.created_at).slice(0, 10) === todayIso) today++;
      if (r.priority === "critica" || r.priority === "alta") critical++;
    }
    return { total: list.length, unread, today, critical, byCategory };
  });

/* ───────────────────────────── Acciones ───────────────────────────── */

export const markNotificationsReadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", data.ids);
    if (error) throw error;
    return { ok: true, updated: data.ids.length };
  });

export const markAllNotificationsReadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (error) throw error;
    return { ok: true };
  });

export const deleteNotificationsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("notifications").delete().in("id", data.ids);
    if (error) throw error;
    return { ok: true };
  });

/* ─────────────────────────── Preferencias ─────────────────────────── */

export const getMyNotificationPreferencesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("notification_preferences")
      .select("category, in_app, email, sms")
      .eq("user_id", context.userId);
    if (error) throw error;
    return { rows: (data ?? []) as any[] };
  });

export const saveNotificationPreferencesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        rows: z
          .array(
            z.object({
              category: z.string().min(1).max(50),
              in_app: z.boolean(),
              email: z.boolean(),
              sms: z.boolean(),
            }),
          )
          .min(1)
          .max(50),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const payload = data.rows.map((r) => ({ ...r, user_id: context.userId }));
    const { error } = await context.supabase
      .from("notification_preferences")
      .upsert(payload, { onConflict: "user_id,category" });
    if (error) throw error;
    return { ok: true, saved: payload.length };
  });

/* ─────────── Envío manual (admin) — usa el despachador central ─────────── */

export const sendNotificationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userIds: z.array(z.string().uuid()).min(1).max(200),
        title: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        category: z.string().max(50).optional(),
        priority: z.string().max(20).optional(),
        route: z.string().max(300).optional(),
        forceEmail: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Solo administradores pueden enviar notificaciones");

    const { dispatchToUsers } = await import("@/lib/notifications.server");
    return dispatchToUsers(data.userIds, {
      title: data.title,
      description: data.description ?? null,
      category: data.category ?? "sistema",
      priority: data.priority ?? "media",
      route: data.route ?? null,
      type: "manual",
      forceEmail: data.forceEmail,
    });
  });

/** Usuarios disponibles para el filtro "por usuario" del centro (solo admin). */
export const listNotificationUsersFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) return { users: [] as { user_id: string; email: string }[] };
    const { data, error } = await context.supabase.rpc("get_all_users_for_admin");
    if (error) return { users: [] as { user_id: string; email: string }[] };
    return {
      users: ((data ?? []) as any[]).map((u) => ({
        user_id: u.user_id ?? u.id,
        email: u.email ?? "",
      })),
    };
  });

/* ─────────── Eventos de la plataforma (llamado desde la UI) ─────────── */

import { NOTIFICATION_EVENTS } from "@/lib/notification-events";

/**
 * Dispara la notificación de un evento operativo (recepción, traspaso,
 * entrega, factura, etc.). Cualquier usuario autenticado puede reportar un
 * evento; los destinatarios se resuelven por rol en el servidor.
 */
export const notifyEventFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        event: z.enum(NOTIFICATION_EVENTS as unknown as [string, ...string[]]),
        vars: z.record(z.string(), z.any()).default({}),
        userIds: z.array(z.string().uuid()).max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { notifyEvent } = await import("@/lib/notifications.server");
    return notifyEvent(data.event as any, data.vars, { userIds: data.userIds });
  });
