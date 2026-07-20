import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ============================================================
 * Fase 6-7 — Configuración, plantillas, timeline y Kanban auto.
 * ==========================================================*/

/* ---------- Templates ---------- */

export const listTemplatesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("cobranza_templates")
      .select("*")
      .order("codigo");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      codigo: z.string().min(1),
      nombre: z.string().min(1),
      canal: z.string().default("email"),
      asunto: z.string().nullable().optional(),
      cuerpo: z.string().min(1),
      activo: z.boolean().default(true),
      descripcion: z.string().nullable().optional(),
    }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const payload = { ...data, updated_at: new Date().toISOString() };
    const { data: row, error } = await context.supabase
      .from("cobranza_templates")
      .upsert(payload, { onConflict: "codigo" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

/* ---------- Config (business rules) ---------- */

export const listConfigFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("cobranza_config")
      .select("*")
      .order("clave");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateConfigFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({
      clave: z.string().min(1),
      valor: z.any(),
    }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("cobranza_config")
      .update({ valor: data.valor, updated_at: new Date().toISOString() })
      .eq("clave", data.clave);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------- Timeline (Cliente 360) ---------- */

export const listClienteTimelineFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ clienteId: z.string().uuid(), limit: z.number().optional().default(100) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("v_cliente_timeline")
      .select("*")
      .eq("cliente_id", data.clienteId)
      .order("fecha", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/* ---------- Auto-generar Kanban card desde alerta ---------- */

export const generarKanbanDesdeAlertaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ alertaId: z.string().uuid() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: alerta, error: aErr } = await supabase
      .from("cobranza_alertas")
      .select("*, clientes(razon_social, nombre_comercial)")
      .eq("id", data.alertaId)
      .single();
    if (aErr || !alerta) throw new Error(aErr?.message || "Alerta no encontrada");
    if (alerta.kanban_card_id) return { ok: true, cardId: alerta.kanban_card_id, existing: true };

    // Buscar o crear board "Cobranza"
    let { data: board } = await supabase
      .from("kanban_boards")
      .select("id")
      .eq("name", "Cobranza")
      .maybeSingle();
    if (!board) {
      const { data: newBoard, error: bErr } = await supabase
        .from("kanban_boards")
        .insert({ name: "Cobranza", role: "admin" })
        .select("id")
        .single();
      if (bErr) throw new Error(bErr.message);
      board = newBoard;
      // seed columns
      await supabase.from("kanban_columns").insert([
        { board_id: board.id, title: "Por hacer", sort_order: 0, color: "#f97316" },
        { board_id: board.id, title: "En gestión", sort_order: 1, color: "#3b82f6" },
        { board_id: board.id, title: "Resuelto", sort_order: 2, color: "#10b981" },
      ]);
    }

    const { data: firstCol } = await supabase
      .from("kanban_columns")
      .select("id")
      .eq("board_id", board!.id)
      .order("sort_order")
      .limit(1)
      .maybeSingle();
    if (!firstCol) throw new Error("No hay columnas en el board Cobranza");

    const priority = alerta.nivel === "critico" ? "urgent" : alerta.nivel === "alto" ? "high" : "medium";
    const clienteName = alerta.clientes?.nombre_comercial || alerta.clientes?.razon_social || "Cliente";

    const { data: card, error: cErr } = await supabase
      .from("kanban_cards")
      .insert({
        column_id: firstCol.id,
        title: `[${alerta.nivel.toUpperCase()}] ${alerta.titulo} — ${clienteName}`,
        description: alerta.descripcion,
        priority,
        created_by: userId,
      })
      .select("id")
      .single();
    if (cErr) throw new Error(cErr.message);

    await supabase
      .from("cobranza_alertas")
      .update({ kanban_card_id: card.id })
      .eq("id", data.alertaId);

    return { ok: true, cardId: card.id, existing: false };
  });
