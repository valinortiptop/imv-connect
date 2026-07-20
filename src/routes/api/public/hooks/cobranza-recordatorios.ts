import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron diario: recorre facturas con saldo abierto y envía recordatorios email
 * en los hitos configurados (-5, 0, +7, +15, +30 días respecto al vencimiento).
 * Se llama desde pg_cron con apikey.
 */
export const Route = createFileRoute("/api/public/hooks/cobranza-recordatorios")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("apikey") || request.headers.get("authorization")?.replace("Bearer ", "");
        if (!authHeader) return new Response("Missing apikey", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendEmail } = await import("@/lib/valinor-proxy.server");

        const hoy = new Date();
        const iso = (d: Date) => d.toISOString().slice(0, 10);
        const offset = (days: number) => { const d = new Date(hoy); d.setDate(d.getDate() + days); return iso(d); };

        // Hitos: -5 (avisar), 0 (vence hoy), +7, +15, +30 (vencida)
        const hitos = [
          { off: 5, tipo: "recordatorio_proxima", label: "Vence en 5 días" },
          { off: 0, tipo: "recordatorio_vence_hoy", label: "Vence hoy" },
          { off: -7, tipo: "recordatorio_vencida_7", label: "Vencida 7 días" },
          { off: -15, tipo: "recordatorio_vencida_15", label: "Vencida 15 días" },
          { off: -30, tipo: "recordatorio_vencida_30", label: "Vencida 30 días" },
        ];

        const mxn = (n: number) =>
          new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n) || 0);

        let enviados = 0;
        let errores = 0;
        const from = process.env.COBRANZA_EMAIL_FROM || "Cobranza <onboarding@resend.dev>";

        for (const h of hitos) {
          const fechaObjetivo = offset(h.off);
          const { data: facturas } = await supabaseAdmin
            .from("facturas")
            .select("id, folio, fecha_emision, fecha_vencimiento, total, saldo, pagado, cliente_id, clientes(razon_social, nombre_comercial, email)")
            .eq("fecha_vencimiento", fechaObjetivo)
            .in("estado", ["emitida", "parcial"]);

          for (const f of (facturas ?? []) as any[]) {
            // Skip si ya se envió este tipo para esta factura hoy
            const { count } = await supabaseAdmin
              .from("cobranza_comunicaciones")
              .select("id", { count: "exact", head: true })
              .eq("factura_id", f.id)
              .eq("tipo", h.tipo)
              .gte("created_at", iso(hoy));
            if ((count ?? 0) > 0) continue;

            const { data: credito } = await supabaseAdmin
              .from("cliente_credito")
              .select("email_cobranza, enviar_recordatorios")
              .eq("cliente_id", f.cliente_id)
              .maybeSingle();
            if ((credito as any) && (credito as any).enviar_recordatorios === false) continue;
            const destinatario = (credito as any)?.email_cobranza || f.clientes?.email;
            if (!destinatario) continue;

            const saldo = Number(f.saldo ?? (Number(f.total) - Number(f.pagado || 0)));
            if (saldo <= 0) continue;
            const nombre = f.clientes?.nombre_comercial || f.clientes?.razon_social;
            const vencida = h.off <= 0 && h.off < 0;
            const asunto = h.off > 0
              ? `Recordatorio: factura ${f.folio} vence en ${h.off} días`
              : h.off === 0
                ? `Factura ${f.folio} vence hoy`
                : `Factura ${f.folio} vencida hace ${Math.abs(h.off)} días`;
            const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#111">
              <h2>${h.label}</h2><p>Hola ${nombre},</p>
              <p>La factura <strong>${f.folio}</strong> ${vencida ? "está vencida" : "vencerá pronto"} con saldo de <strong>${mxn(saldo)}</strong>. Fecha de vencimiento: <strong>${f.fecha_vencimiento}</strong>.</p>
              <p>Agradecemos su pronta atención.</p></div>`;

            let providerId: string | null = null;
            let error: string | null = null;
            try {
              const r = await sendEmail({ from, to: destinatario, subject: asunto, html });
              providerId = r.id;
              enviados++;
            } catch (e) {
              error = (e as Error).message;
              errores++;
            }
            await supabaseAdmin.from("cobranza_comunicaciones").insert({
              cliente_id: f.cliente_id,
              factura_id: f.id,
              canal: "email",
              tipo: h.tipo,
              destinatario, asunto,
              cuerpo_preview: `${h.label} · saldo ${mxn(saldo)}`,
              estado: error ? "error" : "enviado",
              provider_id: providerId, error,
            });
          }
        }

        // Marcar promesas incumplidas
        await supabaseAdmin
          .from("cobranza_promesas_pago")
          .update({ estado: "incumplida" })
          .eq("estado", "pendiente")
          .lt("fecha_promesa", iso(hoy));

        return new Response(JSON.stringify({ ok: true, enviados, errores }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
