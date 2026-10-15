// Acciones dentro de una visita abierta: cobro, recolección de RC y entrega de pedido.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DELIVERED = ["entregado", "Entregado", "cancelado", "Cancelado"];

async function getOpenVisit(supabase: any, visitId: string) {
  const { data, error } = await supabase
    .from("rep_visits")
    .select("id, representante_id, cliente_id, check_out_at")
    .eq("id", visitId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Visita no encontrada");
  if (data.check_out_at) throw new Error("La visita ya está cerrada");
  return data as { id: string; representante_id: string; cliente_id: string | null };
}

export const listVisitActionsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ visitId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("rep_visit_actions" as any)
      .select("*")
      .eq("visit_id", data.visitId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const actions = (rows ?? []) as any[];
    const fIds = actions.map((a) => a.factura_id).filter(Boolean);
    const pIds = actions.map((a) => a.pedido_id).filter(Boolean);
    const [f, p] = await Promise.all([
      fIds.length
        ? context.supabase.from("facturas").select("id, folio").in("id", fIds)
        : Promise.resolve({ data: [] as any[] }),
      pIds.length
        ? context.supabase.from("pedidos").select("id, folio, order_code").in("id", pIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const fm = new Map((f.data ?? []).map((x: any) => [x.id, x.folio]));
    const pm = new Map((p.data ?? []).map((x: any) => [x.id, x.folio ?? x.order_code]));
    const sign = async (p: string | null) => {
      if (!p) return null;
      const { data: s } = await context.supabase.storage
        .from("rep-evidence")
        .createSignedUrl(p, 3600);
      return s?.signedUrl ?? null;
    };
    const out = await Promise.all(
      actions.map(async (a) => ({
        ...a,
        factura_folio: a.factura_id ? fm.get(a.factura_id) ?? null : null,
        pedido_folio: a.pedido_id ? pm.get(a.pedido_id) ?? null : null,
        photo_urls: (
          await Promise.all(((a.photo_paths as string[]) ?? []).map(sign))
        ).filter(Boolean),
        signature_url: await sign(a.signature_path ?? null),
      })),
    );
    return { actions: out };
  });

export const listClientOpenInvoicesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clienteId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: facs, error } = await context.supabase
      .from("facturas")
      .select("id, folio, fecha_emision, fecha_vencimiento, total, pagado, saldo, estado")
      .eq("cliente_id", data.clienteId)
      .in("estado", ["emitida", "parcial"])
      .order("fecha_vencimiento", { ascending: true, nullsFirst: false })
      .limit(100);
    if (error) throw error;
    const now = Date.now();
    return {
      facturas: (facs ?? []).map((f: any) => {
        const due = f.fecha_vencimiento
          ? Math.floor((now - new Date(f.fecha_vencimiento).getTime()) / 86400000)
          : 0;
        return {
          ...f,
          saldo: Number(f.saldo ?? Number(f.total) - Number(f.pagado ?? 0)),
          overdue_days: due > 0 ? due : 0,
        };
      }),
    };
  });

export const listClientPendingDeliveriesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clienteId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("pedidos")
      .select("id, folio, order_code, estado, total, created_at, delivery_date")
      .eq("cliente_id", data.clienteId)
      .not("estado", "in", `(${DELIVERED.map((s) => `"${s}"`).join(",")})`)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return { pedidos: rows ?? [] };
  });

export const registerVisitPaymentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        visitId: z.string().uuid(),
        facturaId: z.string().uuid(),
        monto: z.number().positive(),
        metodo: z.enum(["efectivo", "transferencia", "cheque", "tarjeta", "otro"]),
        referencia: z.string().max(200).optional().nullable(),
        notas: z.string().max(1000).optional().nullable(),
        photoPaths: z.array(z.string()).max(10).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const v = await getOpenVisit(context.supabase, data.visitId);
    const { data: fac } = await context.supabase
      .from("facturas")
      .select("id, cliente_id, saldo, total, pagado")
      .eq("id", data.facturaId)
      .maybeSingle();
    if (!fac) throw new Error("Factura no encontrada");
    if (v.cliente_id && (fac as any).cliente_id !== v.cliente_id)
      throw new Error("La factura no pertenece a este cliente");
    const saldo = Number((fac as any).saldo ?? Number((fac as any).total) - Number((fac as any).pagado ?? 0));
    if (data.monto > saldo + 0.01) throw new Error("El monto excede el saldo de la factura");

    const { data: pago, error } = await context.supabase
      .from("pagos")
      .insert({
        factura_id: data.facturaId,
        monto: data.monto,
        metodo: data.metodo,
        referencia: data.referencia ?? null,
        notas: data.notas ?? "Cobro registrado en visita",
        fecha: new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" }),
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;

    const { error: aErr } = await context.supabase.from("rep_visit_actions" as any).insert({
      visit_id: v.id,
      representante_id: v.representante_id,
      cliente_id: v.cliente_id,
      tipo: "cobro",
      factura_id: data.facturaId,
      pago_id: (pago as any).id,
      monto: data.monto,
      folio: data.referencia ?? null,
      notas: data.notas ?? null,
      photo_paths: data.photoPaths,
      created_by: context.userId,
    });
    if (aErr) throw aErr;
    return { ok: true };
  });

export const registerRecetaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        visitId: z.string().uuid(),
        folio: z.string().max(100).optional().nullable(),
        piezas: z.number().int().min(0).optional().nullable(),
        notas: z.string().max(1000).optional().nullable(),
        pedidoId: z.string().uuid().optional().nullable(),
        photoPaths: z.array(z.string()).min(1, "Agrega al menos una foto de la receta").max(10),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const v = await getOpenVisit(context.supabase, data.visitId);
    const { error } = await context.supabase.from("rep_visit_actions" as any).insert({
      visit_id: v.id,
      representante_id: v.representante_id,
      cliente_id: v.cliente_id,
      tipo: "receta",
      pedido_id: data.pedidoId ?? null,
      folio: data.folio ?? null,
      piezas: data.piezas ?? null,
      notas: data.notas ?? null,
      photo_paths: data.photoPaths,
      created_by: context.userId,
    });
    if (error) throw error;
    return { ok: true };
  });

export const deliverOrderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        visitId: z.string().uuid(),
        pedidoId: z.string().uuid(),
        receivedBy: z.string().min(1).max(200),
        signaturePath: z.string().min(1),
        photoPaths: z.array(z.string()).max(10).default([]),
        notas: z.string().max(1000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const v = await getOpenVisit(context.supabase, data.visitId);
    const { data: ped } = await context.supabase
      .from("pedidos")
      .select("id, cliente_id, estado")
      .eq("id", data.pedidoId)
      .maybeSingle();
    if (!ped) throw new Error("Pedido no encontrado");
    if (v.cliente_id && (ped as any).cliente_id !== v.cliente_id)
      throw new Error("El pedido no pertenece a este cliente");
    if (DELIVERED.includes((ped as any).estado)) throw new Error("El pedido ya está entregado o cancelado");

    const { data: upd, error } = await context.supabase
      .from("pedidos")
      .update({
        estado: "Entregado" as any,
        signed_by_name: data.receivedBy,
        signature_path: data.signaturePath,
        signed_at: new Date().toISOString(),
      })
      .eq("id", data.pedidoId)
      .select("id");
    if (error) throw error;
    if (!upd?.length) throw new Error("No tienes permiso para actualizar este pedido");

    const { error: aErr } = await context.supabase.from("rep_visit_actions" as any).insert({
      visit_id: v.id,
      representante_id: v.representante_id,
      cliente_id: v.cliente_id,
      tipo: "entrega",
      pedido_id: data.pedidoId,
      received_by: data.receivedBy,
      signature_path: data.signaturePath,
      photo_paths: data.photoPaths,
      notas: data.notas ?? null,
      created_by: context.userId,
    });
    if (aErr) throw aErr;
    return { ok: true };
  });
