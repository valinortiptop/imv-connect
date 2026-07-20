import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ============================================================
 * Módulo Crédito y Cobranza — Fase 2
 * Server functions: estado de cuenta, recordatorios, NC pronto pago,
 * sugerencia de aplicación, análisis de riesgo IA (Gemini vía Valinor).
 * ==========================================================*/

const mxn = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n) || 0);

/* ---------- Estado de cuenta por email ---------- */

export const enviarEstadoCuentaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({
      clienteId: z.string().uuid(),
      emailOverride: z.string().email().optional(),
    }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { sendEmail } = await import("./valinor-proxy.server");

    const { data: cliente, error: cErr } = await supabase
      .from("clientes")
      .select("id, razon_social, nombre_comercial, email, rfc")
      .eq("id", data.clienteId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!cliente) throw new Error("Cliente no encontrado");

    const { data: credito } = await supabase
      .from("cliente_credito")
      .select("email_cobranza")
      .eq("cliente_id", data.clienteId)
      .maybeSingle();

    const destinatario = data.emailOverride
      || (credito as any)?.email_cobranza
      || (cliente as any).email;
    if (!destinatario) throw new Error("El cliente no tiene email registrado");

    const { data: facturas } = await supabase
      .from("facturas")
      .select("folio, fecha_emision, fecha_vencimiento, total, pagado, saldo, estado")
      .eq("cliente_id", data.clienteId)
      .in("estado", ["emitida", "parcial", "vencida"])
      .order("fecha_vencimiento", { ascending: true });

    const rows = facturas ?? [];
    const totalSaldo = rows.reduce((s, r: any) => s + Number(r.saldo ?? (Number(r.total) - Number(r.pagado || 0))), 0);
    const today = new Date().toISOString().slice(0, 10);
    const vencido = rows
      .filter((r: any) => r.fecha_vencimiento && r.fecha_vencimiento < today)
      .reduce((s, r: any) => s + Number(r.saldo ?? 0), 0);

    const nombre = (cliente as any).nombre_comercial || (cliente as any).razon_social;
    const asunto = `Estado de cuenta — ${nombre}`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111">
        <h2 style="margin:0 0 4px">Estado de cuenta</h2>
        <p style="margin:0 0 16px;color:#555">${nombre} · RFC ${(cliente as any).rfc || "—"}</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#f4f4f5">
              <th style="text-align:left;padding:6px;border-bottom:1px solid #ddd">Folio</th>
              <th style="text-align:left;padding:6px;border-bottom:1px solid #ddd">Emisión</th>
              <th style="text-align:left;padding:6px;border-bottom:1px solid #ddd">Vencimiento</th>
              <th style="text-align:right;padding:6px;border-bottom:1px solid #ddd">Total</th>
              <th style="text-align:right;padding:6px;border-bottom:1px solid #ddd">Saldo</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r: any) => {
              const venc = r.fecha_vencimiento && r.fecha_vencimiento < today;
              return `<tr>
                <td style="padding:6px;border-bottom:1px solid #eee;font-family:monospace">${r.folio}</td>
                <td style="padding:6px;border-bottom:1px solid #eee">${r.fecha_emision}</td>
                <td style="padding:6px;border-bottom:1px solid #eee;color:${venc ? "#c0392b" : "#111"}">${r.fecha_vencimiento || "—"}</td>
                <td style="padding:6px;border-bottom:1px solid #eee;text-align:right;font-family:monospace">${mxn(Number(r.total))}</td>
                <td style="padding:6px;border-bottom:1px solid #eee;text-align:right;font-family:monospace">${mxn(Number(r.saldo || 0))}</td>
              </tr>`;
            }).join("") || `<tr><td colspan="5" style="padding:12px;text-align:center;color:#777">Sin saldos pendientes</td></tr>`}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4" style="padding:8px;text-align:right;font-weight:600">Saldo vencido:</td>
              <td style="padding:8px;text-align:right;font-family:monospace;color:#c0392b">${mxn(vencido)}</td>
            </tr>
            <tr>
              <td colspan="4" style="padding:8px;text-align:right;font-weight:600">Saldo total:</td>
              <td style="padding:8px;text-align:right;font-family:monospace">${mxn(totalSaldo)}</td>
            </tr>
          </tfoot>
        </table>
        <p style="margin-top:16px;color:#555;font-size:12px">
          Este correo es automático. Para cualquier aclaración responde este mensaje.
        </p>
      </div>
    `;

    const from = process.env.COBRANZA_EMAIL_FROM || "Cobranza <onboarding@resend.dev>";
    let providerId: string | null = null;
    let error: string | null = null;
    try {
      const res = await sendEmail({ from, to: destinatario, subject: asunto, html });
      providerId = res.id;
    } catch (e) {
      error = (e as Error).message;
    }

    await supabase.from("cobranza_comunicaciones").insert({
      cliente_id: data.clienteId,
      canal: "email",
      tipo: "estado_cuenta",
      destinatario,
      asunto,
      cuerpo_preview: `Saldo total: ${mxn(totalSaldo)} · Vencido: ${mxn(vencido)}`,
      estado: error ? "error" : "enviado",
      provider_id: providerId,
      error,
      metadata: { total_saldo: totalSaldo, saldo_vencido: vencido, facturas: rows.length },
      created_by: userId,
    });

    if (!error) {
      await supabase.from("cliente_credito").upsert({
        cliente_id: data.clienteId,
        ultimo_edo_cuenta_at: new Date().toISOString(),
      }, { onConflict: "cliente_id" });
    }

    if (error) throw new Error(error);
    return { ok: true, destinatario, saldo_total: totalSaldo, saldo_vencido: vencido };
  });

/* ---------- Recordatorio de pago por factura ---------- */

export const enviarRecordatorioPagoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ facturaId: z.string().uuid() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { sendEmail } = await import("./valinor-proxy.server");

    const { data: f } = await supabase
      .from("facturas")
      .select("id, folio, fecha_emision, fecha_vencimiento, total, saldo, pagado, cliente_id, clientes(razon_social, nombre_comercial, email)")
      .eq("id", data.facturaId)
      .maybeSingle();
    if (!f) throw new Error("Factura no encontrada");

    const cliente: any = (f as any).clientes;
    const { data: credito } = await supabase
      .from("cliente_credito")
      .select("email_cobranza")
      .eq("cliente_id", (f as any).cliente_id)
      .maybeSingle();
    const destinatario = (credito as any)?.email_cobranza || cliente?.email;
    if (!destinatario) throw new Error("El cliente no tiene email registrado");

    const hoy = new Date().toISOString().slice(0, 10);
    const vencida = (f as any).fecha_vencimiento && (f as any).fecha_vencimiento < hoy;
    const saldo = Number((f as any).saldo ?? (Number((f as any).total) - Number((f as any).pagado || 0)));
    const nombre = cliente?.nombre_comercial || cliente?.razon_social;
    const asunto = vencida
      ? `Factura ${(f as any).folio} vencida — recordatorio de pago`
      : `Recordatorio de pago — factura ${(f as any).folio}`;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
        <h2 style="margin:0 0 8px">${vencida ? "Factura vencida" : "Próximo vencimiento"}</h2>
        <p>Hola ${nombre},</p>
        <p>Le recordamos que la factura <strong>${(f as any).folio}</strong> emitida el ${(f as any).fecha_emision}
          ${vencida ? `<strong style="color:#c0392b">venció el ${(f as any).fecha_vencimiento}</strong>` : `vence el <strong>${(f as any).fecha_vencimiento}</strong>`}
          con un saldo pendiente de <strong>${mxn(saldo)}</strong>.</p>
        <p>Agradecemos su pronta atención. Para aclaraciones responda este correo.</p>
      </div>
    `;
    const from = process.env.COBRANZA_EMAIL_FROM || "Cobranza <onboarding@resend.dev>";
    let providerId: string | null = null;
    let error: string | null = null;
    try {
      const res = await sendEmail({ from, to: destinatario, subject: asunto, html });
      providerId = res.id;
    } catch (e) { error = (e as Error).message; }

    await supabase.from("cobranza_comunicaciones").insert({
      cliente_id: (f as any).cliente_id,
      factura_id: (f as any).id,
      canal: "email",
      tipo: vencida ? "recordatorio_vencida" : "recordatorio_proxima",
      destinatario, asunto,
      cuerpo_preview: `Folio ${(f as any).folio} · saldo ${mxn(saldo)}`,
      estado: error ? "error" : "enviado",
      provider_id: providerId, error,
      metadata: { saldo, vencida },
      created_by: userId,
    });

    if (error) throw new Error(error);
    return { ok: true };
  });

/* ---------- Nota de crédito por pronto pago ---------- */

export const crearNCProntoPagoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ pagoId: z.string().uuid() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: pago } = await supabase
      .from("pagos")
      .select("id, factura_id, fecha, monto, facturas(id, folio, cliente_id, fecha_emision, total)")
      .eq("id", data.pagoId)
      .maybeSingle();
    if (!pago) throw new Error("Pago no encontrado");
    const factura: any = (pago as any).facturas;
    if (!factura) throw new Error("Pago sin factura asociada");

    const { data: credito } = await supabase
      .from("cliente_credito")
      .select("pronto_pago_dias, pronto_pago_porcentaje")
      .eq("cliente_id", factura.cliente_id)
      .maybeSingle();

    const dias = Number((credito as any)?.pronto_pago_dias || 0);
    const porcentaje = Number((credito as any)?.pronto_pago_porcentaje || 0);
    if (!dias || !porcentaje) {
      throw new Error("El cliente no tiene política de pronto pago configurada");
    }

    const emision = new Date(factura.fecha_emision);
    const fechaPago = new Date((pago as any).fecha);
    const diff = Math.floor((fechaPago.getTime() - emision.getTime()) / 86400000);
    if (diff > dias) {
      throw new Error(`Pago fuera del plazo de pronto pago (${diff}d > ${dias}d)`);
    }

    const montoNC = Math.round(Number(factura.total) * (porcentaje / 100) * 100) / 100;
    if (montoNC <= 0) throw new Error("Monto de NC inválido");

    const folio = `NC-PP-${Date.now().toString(36).toUpperCase()}`;
    const { data: nc, error } = await supabase.from("notas_credito").insert({
      folio,
      factura_id: factura.id,
      fecha: new Date().toISOString().slice(0, 10),
      total: montoNC,
      notas: `Pronto pago ${porcentaje}% (pagó en ${diff} de ${dias} días)`,
    }).select("id, folio, total").single();
    if (error) throw new Error(error.message);

    return { ok: true, nota: nc };
  });

/* ---------- Sugerir aplicación de pagos ---------- */

export const sugerirAplicacionPagoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({
      clienteId: z.string().uuid(),
      monto: z.number().positive(),
    }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: facturas } = await supabase
      .from("facturas")
      .select("id, folio, fecha_emision, fecha_vencimiento, total, pagado, saldo")
      .eq("cliente_id", data.clienteId)
      .in("estado", ["emitida", "parcial", "vencida"])
      .order("fecha_vencimiento", { ascending: true, nullsFirst: false });

    let restante = data.monto;
    const sugerencias: Array<{ factura_id: string; folio: string; aplicar: number; saldo: number }> = [];
    for (const f of (facturas ?? []) as any[]) {
      if (restante <= 0) break;
      const saldo = Number(f.saldo ?? (Number(f.total) - Number(f.pagado || 0)));
      if (saldo <= 0) continue;
      const aplicar = Math.min(saldo, restante);
      sugerencias.push({ factura_id: f.id, folio: f.folio, aplicar, saldo });
      restante -= aplicar;
    }
    return { sugerencias, sobrante: restante };
  });

/* ---------- Análisis de riesgo IA (Gemini vía Valinor, tiempo real) ---------- */

export const analizarRiesgoClienteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ clienteId: z.string().uuid() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { callValinor } = await import("./valinor-proxy.server");

    const { data: kpi } = await supabase
      .from("v_cliente_credito_360")
      .select("*")
      .eq("cliente_id", data.clienteId)
      .maybeSingle();
    if (!kpi) throw new Error("Cliente sin datos de crédito");

    const { data: cliente } = await supabase
      .from("clientes")
      .select("razon_social, nombre_comercial")
      .eq("id", data.clienteId)
      .maybeSingle();

    const { data: promesas } = await supabase
      .from("cobranza_promesas_pago")
      .select("estado")
      .eq("cliente_id", data.clienteId);
    const promTotal = (promesas ?? []).length;
    const promCumplidas = (promesas ?? []).filter((p: any) => p.estado === "cumplida").length;

    const stats = {
      cliente: (cliente as any)?.nombre_comercial || (cliente as any)?.razon_social,
      saldo_total: Number((kpi as any).saldo_total || 0),
      saldo_vencido: Number((kpi as any).saldo_vencido || 0),
      utilizacion_pct: Number((kpi as any).utilizacion_pct || 0),
      dias_pago_prom: Number((kpi as any).dias_pago_prom || 0),
      dias_credito: Number((kpi as any).dias_credito || 30),
      limite_credito: Number((kpi as any).limite_credito || 0),
      bloqueado: (kpi as any).bloqueado,
      promesas_totales: promTotal,
      promesas_cumplidas: promCumplidas,
      cumplimiento_pct: promTotal ? Math.round((promCumplidas / promTotal) * 100) : null,
    };

    // Score determinístico base (0-100, mayor = más riesgo)
    let score = 0;
    if (stats.saldo_vencido > 0) score += 35;
    if (stats.utilizacion_pct > 100) score += 25;
    else if (stats.utilizacion_pct > 80) score += 15;
    else if (stats.utilizacion_pct > 60) score += 8;
    const excesoDias = stats.dias_pago_prom - stats.dias_credito;
    if (excesoDias > 30) score += 25;
    else if (excesoDias > 10) score += 12;
    else if (excesoDias > 0) score += 5;
    if (stats.cumplimiento_pct != null && stats.cumplimiento_pct < 50) score += 15;
    if (stats.bloqueado) score += 10;
    score = Math.min(100, score);
    const nivel: "bajo" | "medio" | "alto" | "critico" =
      score >= 75 ? "critico" : score >= 50 ? "alto" : score >= 25 ? "medio" : "bajo";

    // Recomendaciones IA vía Gemini
    let recomendaciones = "";
    let modelo = "gemini-flash-latest";
    try {
      const prompt = `Eres analista de crédito y cobranza. Analiza estas métricas de un cliente y da 3-5 recomendaciones concretas y accionables (máx 40 palabras cada una). Responde SOLO texto plano, sin markdown ni títulos.\n\nDatos:\n${JSON.stringify(stats, null, 2)}\n\nScore de riesgo calculado: ${score}/100 (${nivel}).`;
      const res = await callValinor<{
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      }>({
        provider: "gemini",
        endpoint: `/v1beta/models/${modelo}:generateContent`,
        payload: { contents: [{ role: "user", parts: [{ text: prompt }] }] },
      });
      recomendaciones = res.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n").trim() || "";
    } catch (e) {
      recomendaciones = `No se pudo generar recomendaciones IA: ${(e as Error).message}`;
    }

    const { data: snap } = await supabase.from("cliente_riesgo_snapshots").insert({
      cliente_id: data.clienteId,
      score, nivel,
      factores: stats,
      recomendaciones,
      modelo,
      saldo_total: stats.saldo_total,
      saldo_vencido: stats.saldo_vencido,
      utilizacion_pct: stats.utilizacion_pct,
      dias_pago_prom: stats.dias_pago_prom,
      created_by: userId,
    }).select("id, created_at").single();

    await supabase.from("cliente_credito").upsert({
      cliente_id: data.clienteId,
      ultimo_score: score,
      ultimo_score_at: new Date().toISOString(),
    }, { onConflict: "cliente_id" });

    return { score, nivel, stats, recomendaciones, snapshot_id: (snap as any)?.id };
  });
