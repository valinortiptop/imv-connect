import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron nocturno: analiza a cada cliente con crédito activo, actualiza score
 * de riesgo (snapshot) y genera alertas tempranas al detectar deterioros.
 */
export const Route = createFileRoute("/api/public/hooks/cobranza-riesgo-nocturno")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("apikey") || request.headers.get("authorization")?.replace("Bearer ", "");
        if (!authHeader) return new Response("Missing apikey", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Clientes con datos de crédito
        const { data: kpis } = await supabaseAdmin
          .from("v_cliente_credito_360" as any)
          .select("*");

        let analizados = 0;
        let alertasCreadas = 0;

        for (const kpi of (kpis ?? []) as any[]) {
          const stats = {
            saldo_total: Number(kpi.saldo_total || 0),
            saldo_vencido: Number(kpi.saldo_vencido || 0),
            utilizacion_pct: Number(kpi.utilizacion_pct || 0),
            dias_pago_prom: Number(kpi.dias_pago_prom || 0),
            dias_credito: Number(kpi.dias_credito || 30),
            limite_credito: Number(kpi.limite_credito || 0),
            bloqueado: !!kpi.bloqueado,
          };
          if (stats.saldo_total === 0 && stats.limite_credito === 0) continue;

          // Score determinístico
          let score = 0;
          if (stats.saldo_vencido > 0) score += 35;
          if (stats.utilizacion_pct > 100) score += 25;
          else if (stats.utilizacion_pct > 80) score += 15;
          else if (stats.utilizacion_pct > 60) score += 8;
          const exceso = stats.dias_pago_prom - stats.dias_credito;
          if (exceso > 30) score += 25;
          else if (exceso > 10) score += 12;
          else if (exceso > 0) score += 5;
          if (stats.bloqueado) score += 10;
          score = Math.min(100, score);
          const nivel = score >= 75 ? "critico" : score >= 50 ? "alto" : score >= 25 ? "medio" : "bajo";

          // Score previo
          const { data: prev } = await supabaseAdmin
            .from("cliente_credito")
            .select("ultimo_score")
            .eq("cliente_id", kpi.cliente_id)
            .maybeSingle();
          const scorePrev = Number((prev as any)?.ultimo_score || 0);

          // Snapshot
          await supabaseAdmin.from("cliente_riesgo_snapshots").insert({
            cliente_id: kpi.cliente_id,
            score, nivel,
            factores: stats,
            recomendaciones: null,
            modelo: "deterministic-nightly",
            saldo_total: stats.saldo_total,
            saldo_vencido: stats.saldo_vencido,
            utilizacion_pct: stats.utilizacion_pct,
            dias_pago_prom: stats.dias_pago_prom,
          });
          await supabaseAdmin.from("cliente_credito").upsert({
            cliente_id: kpi.cliente_id,
            ultimo_score: score,
            ultimo_score_at: new Date().toISOString(),
          }, { onConflict: "cliente_id" });
          analizados++;

          // Reglas de alerta
          const alertsToCreate: Array<{ tipo: string; nivel: string; titulo: string; descripcion: string }> = [];
          if (score >= 75) {
            alertsToCreate.push({
              tipo: "riesgo_alto", nivel: "critico",
              titulo: "Cliente en riesgo crítico",
              descripcion: `Score ${score}/100. Requiere gestión inmediata.`,
            });
          }
          if (score - scorePrev >= 15) {
            alertsToCreate.push({
              tipo: "deterioro", nivel: "alto",
              titulo: "Deterioro de comportamiento de pago",
              descripcion: `Score subió de ${scorePrev} a ${score} (+${score - scorePrev}).`,
            });
          }
          if (stats.utilizacion_pct > 100) {
            alertsToCreate.push({
              tipo: "exceso_credito", nivel: "alto",
              titulo: "Excede límite de crédito",
              descripcion: `Utilización ${stats.utilizacion_pct.toFixed(0)}%.`,
            });
          }

          for (const a of alertsToCreate) {
            // Evitar duplicar la misma alerta pendiente del mismo tipo
            const { count } = await supabaseAdmin
              .from("cobranza_alertas")
              .select("id", { count: "exact", head: true })
              .eq("cliente_id", kpi.cliente_id)
              .eq("tipo", a.tipo)
              .eq("resuelta", false);
            if ((count ?? 0) > 0) continue;
            await supabaseAdmin.from("cobranza_alertas").insert({
              cliente_id: kpi.cliente_id,
              tipo: a.tipo, nivel: a.nivel,
              titulo: a.titulo, descripcion: a.descripcion,
              score, metadata: stats,
            });
            alertasCreadas++;
          }
        }

        // Promesas incumplidas → alertas
        const hoy = new Date().toISOString().slice(0, 10);
        const { data: promesas } = await supabaseAdmin
          .from("cobranza_promesas_pago")
          .select("id, cliente_id, monto, fecha_promesa")
          .eq("estado", "incumplida")
          .gte("fecha_promesa", new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10))
          .lte("fecha_promesa", hoy);
        for (const p of (promesas ?? []) as any[]) {
          const { count } = await supabaseAdmin
            .from("cobranza_alertas")
            .select("id", { count: "exact", head: true })
            .eq("cliente_id", p.cliente_id)
            .eq("tipo", "promesa_incumplida")
            .eq("resuelta", false);
          if ((count ?? 0) > 0) continue;
          await supabaseAdmin.from("cobranza_alertas").insert({
            cliente_id: p.cliente_id,
            tipo: "promesa_incumplida", nivel: "medio",
            titulo: "Promesa de pago incumplida",
            descripcion: `Promesa por ${p.monto} para ${p.fecha_promesa}.`,
            metadata: { promesa_id: p.id },
          });
          alertasCreadas++;
        }

        // Documentos vencidos
        const { data: docs } = await supabaseAdmin
          .from("cliente_documentos")
          .select("id, cliente_id, tipo, nombre, fecha_vencimiento")
          .lte("fecha_vencimiento", hoy);
        for (const d of (docs ?? []) as any[]) {
          const { count } = await supabaseAdmin
            .from("cobranza_alertas")
            .select("id", { count: "exact", head: true })
            .eq("cliente_id", d.cliente_id)
            .eq("tipo", "documento_vencido")
            .eq("resuelta", false);
          if ((count ?? 0) > 0) continue;
          await supabaseAdmin.from("cobranza_alertas").insert({
            cliente_id: d.cliente_id,
            tipo: "documento_vencido", nivel: "medio",
            titulo: `Documento vencido: ${d.tipo}`,
            descripcion: `${d.nombre} venció el ${d.fecha_vencimiento}.`,
            metadata: { documento_id: d.id },
          });
          alertasCreadas++;
        }

        return new Response(JSON.stringify({ ok: true, analizados, alertasCreadas }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
