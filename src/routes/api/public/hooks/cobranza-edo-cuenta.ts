import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron diario: envía estados de cuenta según freq_edo_cuenta configurada
 * por cliente (semanal=lunes, quincenal=1 y 16, mensual=día 1).
 */
export const Route = createFileRoute("/api/public/hooks/cobranza-edo-cuenta")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("apikey") || request.headers.get("authorization")?.replace("Bearer ", "");
        if (!authHeader) return new Response("Missing apikey", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendEmail } = await import("@/lib/valinor-proxy.server");

        const hoy = new Date();
        const dow = hoy.getDay(); // 0 dom .. 6 sab
        const dom = hoy.getDate();

        // Filtro: quiénes deben recibir hoy
        const buckets: string[] = [];
        if (dow === 1) buckets.push("semanal");
        if (dom === 1 || dom === 16) buckets.push("quincenal");
        if (dom === 1) buckets.push("mensual");
        if (buckets.length === 0) {
          return new Response(JSON.stringify({ ok: true, skipped: true }));
        }

        const { data: destinos } = await supabaseAdmin
          .from("cliente_credito")
          .select("cliente_id, email_cobranza, freq_edo_cuenta, clientes(razon_social, nombre_comercial, email, rfc)")
          .in("freq_edo_cuenta", buckets);

        const mxn = (n: number) =>
          new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n) || 0);
        const from = process.env.COBRANZA_EMAIL_FROM || "Cobranza <onboarding@resend.dev>";
        let enviados = 0, errores = 0;

        for (const row of (destinos ?? []) as any[]) {
          const destinatario = row.email_cobranza || row.clientes?.email;
          if (!destinatario) continue;

          const { data: facturas } = await supabaseAdmin
            .from("facturas")
            .select("folio, fecha_emision, fecha_vencimiento, total, pagado, saldo")
            .eq("cliente_id", row.cliente_id)
            .in("estado", ["emitida", "parcial", "vencida"])
            .order("fecha_vencimiento", { ascending: true });

          const rows = facturas ?? [];
          if (rows.length === 0) continue;
          const totalSaldo = rows.reduce((s, r: any) => s + Number(r.saldo || 0), 0);
          const today = hoy.toISOString().slice(0, 10);
          const vencido = rows.filter((r: any) => r.fecha_vencimiento < today).reduce((s, r: any) => s + Number(r.saldo || 0), 0);
          const nombre = row.clientes?.nombre_comercial || row.clientes?.razon_social;
          const asunto = `Estado de cuenta — ${nombre}`;
          const html = `<div style="font-family:Arial,sans-serif;max-width:640px;color:#111">
            <h2>Estado de cuenta</h2><p>${nombre}</p>
            <p>Saldo total: <strong>${mxn(totalSaldo)}</strong></p>
            <p>Saldo vencido: <strong style="color:#c0392b">${mxn(vencido)}</strong></p>
            <p>Documentos abiertos: ${rows.length}</p></div>`;

          let providerId: string | null = null; let error: string | null = null;
          try { providerId = (await sendEmail({ from, to: destinatario, subject: asunto, html })).id; enviados++; }
          catch (e) { error = (e as Error).message; errores++; }

          await supabaseAdmin.from("cobranza_comunicaciones").insert({
            cliente_id: row.cliente_id,
            canal: "email", tipo: "estado_cuenta_auto",
            destinatario, asunto,
            cuerpo_preview: `Saldo total ${mxn(totalSaldo)} · Vencido ${mxn(vencido)}`,
            estado: error ? "error" : "enviado",
            provider_id: providerId, error,
          });
          if (!error) {
            await supabaseAdmin.from("cliente_credito").update({
              ultimo_edo_cuenta_at: new Date().toISOString(),
            }).eq("cliente_id", row.cliente_id);
          }
        }

        return new Response(JSON.stringify({ ok: true, enviados, errores }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
