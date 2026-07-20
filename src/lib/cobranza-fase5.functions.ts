import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Fase 5 — Cierre transaccional Crédito y Cobranza:
 *  - Solicitud y resolución de autorizaciones (con notificaciones).
 *  - Aplicación de pagos multi-factura (transaccional lógica).
 *  - Complementos de pago (REP) automáticos vía Facturapi.
 *  - Historial de cambios en condiciones crediticias.
 */

// ── Autorizaciones ────────────────────────────────────────────
const solicitarAutzInput = z.object({
  clienteId: z.string().uuid(),
  tipo: z.enum(["desbloqueo", "incremento_limite", "excepcion", "ampliacion_dias"]),
  monto: z.number().nullable().optional(),
  dias: z.number().int().nullable().optional(),
  motivo: z.string().min(3),
  pedidoId: z.string().uuid().nullable().optional(),
  facturaId: z.string().uuid().nullable().optional(),
});

export const solicitarAutorizacionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => solicitarAutzInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: inserted, error } = await supabase
      .from("credito_autorizaciones" as any)
      .insert({
        cliente_id: data.clienteId,
        tipo: data.tipo,
        estado: "solicitada",
        monto: data.monto ?? null,
        dias: data.dias ?? null,
        motivo: data.motivo,
        pedido_id: data.pedidoId ?? null,
        factura_id: data.facturaId ?? null,
        solicitado_por: userId,
        solicitado_at: new Date().toISOString(),
      } as any)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Notificar a admins/cobranza (via notifications table)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: admins } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "contabilidad"]);
    const notif = (admins ?? []).map((r: any) => ({
      user_id: r.user_id,
      type: "credito_autorizacion",
      title: "Nueva solicitud de autorización",
      body: `${data.tipo.replace(/_/g, " ")} — ${data.motivo.slice(0, 100)}`,
      link: `/admin/credito-cobranza/autorizaciones`,
      read: false,
    }));
    if (notif.length) await supabaseAdmin.from("notifications").insert(notif as any);

    return { id: (inserted as any).id };
  });

const resolverAutzInput = z.object({
  autorizacionId: z.string().uuid(),
  aprobar: z.boolean(),
  respuesta: z.string().optional(),
});

export const resolverAutorizacionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => resolverAutzInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: autz, error: e1 } = await supabase
      .from("credito_autorizaciones" as any)
      .update({
        estado: data.aprobar ? "aprobada" : "rechazada",
        resuelto_por: userId,
        resuelto_at: new Date().toISOString(),
        respuesta: data.respuesta ?? null,
      } as any)
      .eq("id", data.autorizacionId)
      .select("cliente_id, tipo, monto, dias, solicitado_por")
      .single();
    if (e1) throw new Error(e1.message);

    // Aplicar efectos si fue aprobada
    if (data.aprobar && autz) {
      const a: any = autz;
      const updates: Record<string, any> = {};
      if (a.tipo === "desbloqueo") {
        updates.bloqueado = false;
        updates.motivo_bloqueo = null;
      }
      if (a.tipo === "incremento_limite" && a.monto) {
        const { data: cc } = await supabase
          .from("cliente_credito" as any)
          .select("limite_credito")
          .eq("cliente_id", a.cliente_id)
          .maybeSingle();
        updates.limite_credito = Number((cc as any)?.limite_credito ?? 0) + Number(a.monto);
      }
      if (a.tipo === "ampliacion_dias" && a.dias) {
        updates.dias_credito = a.dias;
      }
      if (Object.keys(updates).length) {
        await supabase
          .from("cliente_credito" as any)
          .upsert({ cliente_id: a.cliente_id, ...updates } as any, { onConflict: "cliente_id" });
      }
    }

    // Notificar al solicitante
    if (autz && (autz as any).solicitado_por) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("notifications").insert({
        user_id: (autz as any).solicitado_por,
        type: "credito_autorizacion",
        title: data.aprobar ? "Autorización aprobada" : "Autorización rechazada",
        body: data.respuesta ?? "",
        link: `/admin/credito-cobranza/autorizaciones`,
        read: false,
      } as any);
    }

    return { ok: true };
  });

// ── Aplicación de pagos multi-factura ─────────────────────────
const aplicarPagoInput = z.object({
  clienteId: z.string().uuid(),
  fecha: z.string(), // YYYY-MM-DD
  metodo: z.enum(["efectivo", "transferencia", "cheque", "tarjeta", "otro"]),
  referencia: z.string().optional(),
  notas: z.string().optional(),
  aplicaciones: z
    .array(z.object({ facturaId: z.string().uuid(), monto: z.number().positive() }))
    .min(1),
  emitirComplemento: z.boolean().optional(),
});

export const aplicarPagoMultiFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => aplicarPagoInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const pagosCreados: string[] = [];
    const errores: string[] = [];

    for (const app of data.aplicaciones) {
      const { data: f, error: fe } = await supabase
        .from("facturas")
        .select("id, saldo, payment_method, cliente_id")
        .eq("id", app.facturaId)
        .single();
      if (fe || !f) {
        errores.push(`Factura ${app.facturaId}: ${fe?.message || "no encontrada"}`);
        continue;
      }
      if ((f as any).cliente_id !== data.clienteId) {
        errores.push(`Factura ${app.facturaId} pertenece a otro cliente`);
        continue;
      }
      const saldo = Number((f as any).saldo || 0);
      if (app.monto > saldo + 0.01) {
        errores.push(`Factura ${app.facturaId}: monto excede saldo (${saldo})`);
        continue;
      }
      const { data: p, error: pe } = await supabase
        .from("pagos")
        .insert({
          factura_id: app.facturaId,
          fecha: data.fecha,
          monto: app.monto,
          metodo: data.metodo,
          referencia: data.referencia ?? null,
          notas: data.notas ?? null,
          created_by: userId,
          complemento_estado: (f as any).payment_method === "PPD" ? "pendiente" : "no_aplica",
        } as any)
        .select("id")
        .single();
      if (pe) {
        errores.push(`Factura ${app.facturaId}: ${pe.message}`);
        continue;
      }
      pagosCreados.push((p as any).id);
    }

    return { pagos: pagosCreados, errores };
  });

// ── Complementos de pago (REP) ────────────────────────────────
const emitirREPInput = z.object({ pagoId: z.string().uuid() });

export const emitirComplementoPagoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => emitirREPInput.parse(v))
  .handler(async ({ data }) => {
    const { fxInvoices } = await import("./facturapi.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: pago, error } = await supabaseAdmin
      .from("pagos")
      .select(
        "id, fecha, monto, metodo, referencia, complemento_estado, complemento_facturapi_id, factura:facturas(id, folio, uuid_fiscal, serie, total, saldo, payment_method, cliente:clientes(id, razon_social, nombre_comercial, rfc, regimen_fiscal, codigo_postal, email, facturapi_id))",
      )
      .eq("id", data.pagoId)
      .single();
    if (error || !pago) throw new Error(error?.message || "Pago no encontrado");
    if ((pago as any).complemento_facturapi_id) throw new Error("Este pago ya tiene REP timbrado");

    const f: any = (pago as any).factura;
    if (!f) throw new Error("Pago sin factura asociada");
    if (f.payment_method !== "PPD") throw new Error("El REP solo aplica a facturas PPD");
    if (!f.uuid_fiscal) throw new Error("La factura no está timbrada");
    const cliente = f.cliente;
    if (!cliente?.rfc) throw new Error("Cliente sin RFC");

    const pf = (() => {
      const v = String((pago as any).metodo || "").toLowerCase();
      const map: Record<string, string> = {
        efectivo: "01", cheque: "02", transferencia: "03", tarjeta: "04", otro: "99",
      };
      return map[v] ?? "99";
    })();

    const totalFactura = Number(f.total || 0);
    const saldoAntes = Number(f.saldo || 0) + Number((pago as any).monto || 0);

    const payload: any = {
      type: "P", // Complemento de pago
      customer: cliente.facturapi_id ?? {
        legal_name: cliente.razon_social || cliente.nombre_comercial,
        tax_id: String(cliente.rfc).toUpperCase(),
        tax_system: cliente.regimen_fiscal || "601",
        email: cliente.email || undefined,
        address: { zip: String(cliente.codigo_postal || "00000") },
      },
      complements: [
        {
          type: "pago",
          data: [
            {
              payment_form: pf,
              date: new Date((pago as any).fecha).toISOString(),
              currency: "MXN",
              amount: Number((pago as any).monto),
              related_documents: [
                {
                  uuid: f.uuid_fiscal,
                  folio: f.folio,
                  series: f.serie ?? undefined,
                  currency: "MXN",
                  payment_method: "PPD",
                  partiality_number: 1,
                  previous_balance: saldoAntes,
                  amount_paid: Number((pago as any).monto),
                  amount_outstanding: Math.max(saldoAntes - Number((pago as any).monto), 0),
                  taxability: undefined,
                  last_balance: undefined,
                  tax_amount: undefined,
                  base_amount: undefined,
                },
              ],
            },
          ],
        },
      ],
      external_id: `pago:${(pago as any).id}`,
    };
    void totalFactura; // referenciado por lógica futura

    let inv: any;
    try {
      inv = await fxInvoices.create(payload);
    } catch (e) {
      await supabaseAdmin.from("pagos").update({
        complemento_estado: "error",
        complemento_error: (e as Error).message.slice(0, 500),
      } as any).eq("id", data.pagoId);
      throw e;
    }

    await supabaseAdmin.from("pagos").update({
      complemento_facturapi_id: inv.id,
      complemento_uuid: inv.uuid,
      complemento_estado: "timbrado",
      complemento_timbrado_at: new Date().toISOString(),
      complemento_pdf_url: `https://www.facturapi.io/v2/invoices/${inv.id}/pdf`,
      complemento_xml_url: `https://www.facturapi.io/v2/invoices/${inv.id}/xml`,
      complemento_error: null,
    } as any).eq("id", data.pagoId);

    return { ok: true, uuid: inv.uuid, id: inv.id };
  });

export const listPagosSinREPFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("pagos")
      .select("id, fecha, monto, metodo, complemento_estado, complemento_error, factura:facturas(folio, cliente:clientes(razon_social, nombre_comercial))")
      .in("complemento_estado", ["pendiente", "error"])
      .order("fecha", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as any[];
  });

// ── Historial de crédito ──────────────────────────────────────
const historialInput = z.object({ clienteId: z.string().uuid() });

export const listHistorialCreditoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => historialInput.parse(v))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("cliente_credito_historial" as any)
      .select("id, campo, valor_anterior, valor_nuevo, motivo, changed_by, changed_at")
      .eq("cliente_id", data.clienteId)
      .order("changed_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });
