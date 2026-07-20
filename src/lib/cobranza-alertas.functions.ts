import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ============================================================
 * Fase 3 y 4 — Alertas tempranas y expediente digital.
 * ==========================================================*/

/* ---------- Listar alertas pendientes ---------- */

export const listAlertasCobranzaFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({
      soloPendientes: z.boolean().optional().default(true),
      clienteId: z.string().uuid().optional(),
    }).parse(v ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("cobranza_alertas")
      .select("*, clientes(razon_social, nombre_comercial)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.soloPendientes) q = q.eq("resuelta", false);
    if (data.clienteId) q = q.eq("cliente_id", data.clienteId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/* ---------- Resolver alerta ---------- */

export const resolverAlertaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ alertaId: z.string().uuid() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("cobranza_alertas")
      .update({
        resuelta: true,
        resuelta_at: new Date().toISOString(),
        resuelta_por: userId,
      })
      .eq("id", data.alertaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------- Expediente digital ---------- */

export const listDocumentosClienteFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ clienteId: z.string().uuid() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("cliente_documentos")
      .select("*")
      .eq("cliente_id", data.clienteId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertDocumentoClienteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      cliente_id: z.string().uuid(),
      tipo: z.string().min(1),
      nombre: z.string().min(1),
      storage_path: z.string().optional().nullable(),
      url: z.string().optional().nullable(),
      fecha_emision: z.string().optional().nullable(),
      fecha_vencimiento: z.string().optional().nullable(),
      notas: z.string().optional().nullable(),
    }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload: any = {
      ...data,
      updated_at: new Date().toISOString(),
    };
    if (!data.id) payload.created_by = userId;
    const { data: row, error } = await supabase
      .from("cliente_documentos")
      .upsert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteDocumentoClienteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ id: z.string().uuid() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: doc } = await supabase
      .from("cliente_documentos")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if ((doc as any)?.storage_path) {
      await supabase.storage.from("cliente-documentos").remove([(doc as any).storage_path]);
    }
    const { error } = await supabase.from("cliente_documentos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------- URL firmada para descargar documento ---------- */

export const signedUrlDocumentoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ storage_path: z.string().min(1) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: signed, error } = await supabase.storage
      .from("cliente-documentos")
      .createSignedUrl(data.storage_path, 60 * 10);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });
