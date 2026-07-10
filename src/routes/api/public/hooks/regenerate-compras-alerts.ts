// Cron endpoint — called by pg_cron to refresh purchase_alerts.
// Public prefix bypasses auth; we use the service role client internally.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/regenerate-compras-alerts")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Clear previous auto-generated (unresolved) alerts
        await supabaseAdmin
          .from("purchase_alerts")
          .delete()
          .eq("resuelto", false)
          .in("tipo", ["stock_critico", "reorden", "caducidad", "sobrestock"]);

        const inserts: any[] = [];

        const { data: plan } = await supabaseAdmin
          .from("v_compras_planeacion")
          .select("producto_id, sku, nombre, laboratorio_id, stock_disponible, punto_reorden, cantidad_sugerida, dias_cobertura")
          .limit(1000);
        for (const p of (plan ?? []) as any[]) {
          const disp = Number(p.stock_disponible || 0);
          const reorden = Number(p.punto_reorden || 0);
          const cob = p.dias_cobertura == null ? null : Number(p.dias_cobertura);
          if (disp <= 0 || (cob != null && cob < 3)) {
            inserts.push({
              tipo: "stock_critico",
              severidad: "critica",
              producto_id: p.producto_id,
              laboratorio_id: p.laboratorio_id,
              titulo: `Stock crítico: ${p.nombre}`,
              detalle: `Disp ${disp} · Cobertura ${cob ?? "?"}d`,
              payload: { sku: p.sku, sugerido: Number(p.cantidad_sugerida || 0) },
            });
          } else if (disp <= reorden && Number(p.cantidad_sugerida || 0) > 0) {
            inserts.push({
              tipo: "reorden",
              severidad: "alta",
              producto_id: p.producto_id,
              laboratorio_id: p.laboratorio_id,
              titulo: `Reorden: ${p.nombre}`,
              detalle: `Disp ${disp} ≤ punto ${reorden} · sugerido ${Number(p.cantidad_sugerida || 0)}`,
              payload: { sku: p.sku },
            });
          }
        }

        const { data: cad } = await supabaseAdmin
          .from("v_caducidades")
          .select("producto_id, nombre, sku, cantidad, valor_economico, dias_restantes, semaforo")
          .in("semaforo", ["rojo", "amarillo"])
          .limit(500);
        for (const c of (cad ?? []) as any[]) {
          inserts.push({
            tipo: "caducidad",
            severidad: c.semaforo === "rojo" ? "critica" : "media",
            producto_id: c.producto_id,
            titulo: `Caducidad ${c.semaforo === "rojo" ? "crítica" : "próxima"}: ${c.nombre}`,
            detalle: `${Number(c.cantidad || 0)} u · ${c.dias_restantes}d · ${Number(c.valor_economico || 0).toFixed(0)} MXN`,
            payload: { sku: c.sku },
          });
        }

        const { data: rot } = await supabaseAdmin
          .from("v_baja_rotacion")
          .select("producto_id, nombre, sku, valor_inmovilizado, dias_sin_venta, clasificacion")
          .in("clasificacion", ["180d", "sin_venta"])
          .order("valor_inmovilizado", { ascending: false })
          .limit(50);
        for (const r of (rot ?? []) as any[]) {
          inserts.push({
            tipo: "sobrestock",
            severidad: "media",
            producto_id: r.producto_id,
            titulo: `Baja rotación: ${r.nombre}`,
            detalle: `${r.dias_sin_venta}d sin venta · ${Number(r.valor_inmovilizado || 0).toFixed(0)} MXN inmovilizados`,
            payload: { sku: r.sku, clasificacion: r.clasificacion },
          });
        }

        if (inserts.length > 0) {
          const { error } = await supabaseAdmin.from("purchase_alerts").insert(inserts);
          if (error) {
            return new Response(JSON.stringify({ ok: false, error: error.message }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }
        }

        return new Response(JSON.stringify({ ok: true, generadas: inserts.length }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
