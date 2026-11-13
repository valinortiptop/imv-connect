import { createFileRoute } from "@tanstack/react-router";
import {
  LaunchSyncBody,
  itemEstado,
  launchKeyMatches,
  mergeDisponibilidad,
  semanaEstado,
  sesionEstadoTrasConfirmar,
} from "@/lib/launch-sync";

/**
 * Valinor Studio launch sync. Valinor reads NetSuite-exit onboarding progress
 * and confirms session times. Auth: header `x-launch-key` must equal the
 * VALINOR_LAUNCH_SYNC_KEY secret. "import_availability" merges hours painted on Valinor's
 * scheduling link into onboarding_disponibilidad (adds slots, never removes them or rows). Runs with the service role; never returns
 * files, signed URLs, notes, amounts or valor_texto.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-launch-key",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/valinor-launch-sync")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        if (!launchKeyMatches(request.headers.get("x-launch-key"), process.env.VALINOR_LAUNCH_SYNC_KEY)) {
          return json({ error: "Unauthorized" }, 401);
        }

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        const parsed = LaunchSyncBody.safeParse(raw);
        if (!parsed.success) return json({ error: "Invalid body", issues: parsed.error.flatten() }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        try {
          if (parsed.data.action === "summary") {
            const [programa, items, archivos, sesiones, tareas, paralelo] = await Promise.all([
              supabaseAdmin
                .from("onboarding_programa")
                .select("fase, fecha_corte, decision_netsuite")
                .eq("id", 1)
                .maybeSingle(),
              supabaseAdmin
                .from("onboarding_items")
                .select("id, area, titulo, estado, validado_at, responsable_rol, fecha_compromiso, orden")
                .order("orden", { ascending: true })
                .range(0, 999),
              supabaseAdmin.from("onboarding_archivos").select("item_id").range(0, 4999),
              supabaseAdmin
                .from("onboarding_sesiones")
                .select("orden, titulo, estado, fecha_hora")
                .order("orden", { ascending: true }),
              supabaseAdmin
                .from("onboarding_tareas_dev")
                .select("orden, titulo, estado, fecha_compromiso")
                .order("orden", { ascending: true }),
              supabaseAdmin
                .from("onboarding_paralelo_semanas")
                .select("semana_inicio, ventas_app, ventas_netsuite, cartera_app, cartera_netsuite, inventario_app, inventario_netsuite")
                .order("semana_inicio", { ascending: true }),
            ]);

            const err =
              programa.error ?? items.error ?? archivos.error ?? sesiones.error ?? tareas.error ?? paralelo.error;
            if (err) {
              console.error("[valinor-launch-sync] summary query failed:", err.message);
              return json({ error: "Could not read onboarding data" }, 500);
            }

            const withFile = new Set((archivos.data ?? []).map((a) => a.item_id));
            return json({
              fase_actual: programa.data?.fase ?? null,
              fecha_corte: programa.data?.fecha_corte ?? null,
              decision_netsuite: programa.data?.decision_netsuite ?? null,
              items: (items.data ?? []).map((it) => ({
                area: it.area,
                titulo: it.titulo,
                estado: itemEstado(it, withFile.has(it.id)),
                responsable_rol: it.responsable_rol,
                fecha_compromiso: it.fecha_compromiso,
              })),
              sesiones: sesiones.data ?? [],
              tareas_dev: tareas.data ?? [],
              paralelo: (paralelo.data ?? []).map((w) => ({
                semana_inicio: w.semana_inicio,
                estado: semanaEstado(w),
              })),
            });
          }

          if (parsed.data.action === "import_availability") {
            const { data: existing, error: readErr } = await supabaseAdmin
              .from("onboarding_disponibilidad")
              .select("persona, rol, slots")
              .range(0, 999);
            if (readErr) {
              console.error("[valinor-launch-sync] availability read failed:", readErr.message);
              return json({ error: "Could not read availability" }, 500);
            }
            const { insert, update } = mergeDisponibilidad(
              (existing ?? []).map((r) => ({ persona: r.persona, rol: r.rol, slots: r.slots ?? [] })),
              parsed.data.personas.map((p) => ({ persona: p.persona, rol: p.rol, slots: p.slots })),
            );
            if (update.length) {
              const { error } = await supabaseAdmin
                .from("onboarding_disponibilidad")
                .upsert(update, { onConflict: "persona,rol" });
              if (error) {
                console.error("[valinor-launch-sync] availability update failed:", error.message);
                return json({ error: "Could not update availability" }, 500);
              }
            }
            if (insert.length) {
              const { error } = await supabaseAdmin
                .from("onboarding_disponibilidad")
                .upsert(insert, { onConflict: "persona,rol" });
              if (error) {
                console.error("[valinor-launch-sync] availability insert failed:", error.message);
                return json({ error: "Could not insert availability" }, 500);
              }
            }
            console.log(
              `[valinor-launch-sync] availability import: ${parsed.data.personas.length} personas -> ${insert.length} insertados, ${update.length} actualizados`,
            );
            return json({ ok: true, insertados: insert.length, actualizados: update.length });
          }

          const { orden, titulo, fecha_hora } = parsed.data;
          const { data: current, error: readErr } = await supabaseAdmin
            .from("onboarding_sesiones")
            .select("id, estado")
            .eq("orden", orden)
            .maybeSingle();
          if (readErr) {
            console.error("[valinor-launch-sync] session read failed:", readErr.message);
            return json({ error: "Could not read session" }, 500);
          }
          if (!current) return json({ error: `No session with orden ${orden}` }, 404);

          const { error: updErr } = await supabaseAdmin
            .from("onboarding_sesiones")
            .update({
              fecha_hora: fecha_hora ? new Date(fecha_hora).toISOString() : null,
              estado: sesionEstadoTrasConfirmar(current.estado, fecha_hora),
            })
            .eq("id", current.id);
          if (updErr) {
            console.error("[valinor-launch-sync] session update failed:", updErr.message);
            return json({ error: "Could not update session" }, 500);
          }
          console.log(`[valinor-launch-sync] session ${orden} ("${titulo}") -> ${fecha_hora ?? "sin fecha"}`);
          return json({ ok: true });
        } catch (e) {
          console.error("[valinor-launch-sync] unexpected error:", e instanceof Error ? e.message : e);
          return json({ error: "Internal error" }, 500);
        }
      },
    },
  },
});
