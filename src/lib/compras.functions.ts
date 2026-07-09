// Server functions for the Compras module.
// - AI assistant powered by Valinor proxy (Gemini)
// - Create purchase orders grouped by supplier from a planeacion selection
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const RowSchema = z.object({
  producto_id: z.string(),
  sku: z.string(),
  nombre: z.string(),
  laboratorio: z.string().nullable().optional(),
  laboratorio_id: z.string().nullable().optional(),
  costo: z.number().nullable().optional(),
  stock_disponible: z.number(),
  stock_comprometido: z.number().optional().default(0),
  en_camino: z.number().optional().default(0),
  ventas_30d: z.number(),
  ventas_90d: z.number().optional().default(0),
  tendencia_pct: z.number().nullable().optional(),
  consumo_diario: z.number(),
  dias_cobertura: z.number().nullable().optional(),
  punto_reorden: z.number(),
  cantidad_sugerida: z.number(),
  cantidad_editada: z.number().optional(),
});

export const aiRefinePlaneacion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        rows: z.array(RowSchema).min(1).max(80),
        objetivo: z.enum(["balanceado", "ahorro", "servicio"]).default("balanceado"),
        presupuesto: z.number().optional(),
        notas: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { geminiGenerateInline } = await import("./valinor-proxy.server");

    const compact = data.rows.map((r) => ({
      id: r.producto_id,
      sku: r.sku,
      nombre: r.nombre.slice(0, 60),
      prov: r.laboratorio ?? null,
      costo: Number(r.costo ?? 0),
      disp: Number(r.stock_disponible),
      camino: Number(r.en_camino ?? 0),
      v30: Number(r.ventas_30d),
      v90: Number(r.ventas_90d ?? 0),
      tend: r.tendencia_pct,
      cob: r.dias_cobertura,
      reorden: Number(r.punto_reorden),
      sugerido: Number(r.cantidad_sugerida),
    }));

    const prompt = `Eres un planeador experto de compras farmacéuticas. Ajusta las cantidades sugeridas de compra buscando el objetivo "${data.objetivo}" (balanceado=servicio+capital; ahorro=minimiza inversión priorizando alto riesgo de faltante; servicio=maximiza cobertura sin sobreinventario >60d).
${data.presupuesto ? `Presupuesto tope: MXN ${data.presupuesto}.` : ""}
${data.notas ? `Notas del comprador: ${data.notas}.` : ""}

Reglas:
- Nunca sugieras cantidad < 0. Redondea a múltiplos de 5 si sugerido>=20.
- Si stock disponible + en_camino ya cubre >45 días de venta, reduce a 0.
- Si tendencia > 20% y cobertura < 20d, aumenta 10-25%.
- Explica en 1 línea el motivo por producto (breve y accionable en español).

Devuelve JSON estricto: {"items":[{"id":"<uuid>","cantidad":<int>,"motivo":"<texto corto>"}], "resumen":"<1-2 líneas>"}

Productos:
${JSON.stringify(compact)}`;

    const resp = await geminiGenerateInline({
      model: "gemini-flash-latest",
      parts: [{ text: prompt }],
      jsonMode: true,
    });

    const text = resp?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    let parsed: { items?: { id: string; cantidad: number; motivo: string }[]; resumen?: string } = {};
    try { parsed = JSON.parse(text); } catch { parsed = {}; }
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      resumen: parsed.resumen ?? "",
    };
  });

const OcLineSchema = z.object({
  producto_id: z.string().uuid(),
  laboratorio_id: z.string().uuid().nullable(),
  cantidad: z.number().int().positive(),
  costo_unitario: z.number().nonnegative(),
});

export const crearOCsDesdePlaneacion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        lineas: z.array(OcLineSchema).min(1),
        almacen_id: z.string().uuid(),
        fecha_esperada: z.string().nullable().optional(),
        notas: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Group by laboratorio_id
    const groups = new Map<string | null, typeof data.lineas>();
    for (const l of data.lineas) {
      const key = l.laboratorio_id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(l);
    }

    // Skip lines with no proveedor
    const created: { oc_id: string; laboratorio_id: string | null; items: number }[] = [];

    for (const [labId, items] of groups.entries()) {
      if (!labId) continue; // requires supplier
      const { data: oc, error: e1 } = await supabase
        .from("ordenes_compra")
        .insert({
          laboratorio_id: labId,
          almacen_id: data.almacen_id,
          fecha_esperada: data.fecha_esperada || null,
          notas: data.notas || "Generada desde planeación",
          created_by: userId,
        })
        .select("id")
        .single();
      if (e1) throw new Error(e1.message);

      const rows = items.map((it) => ({
        oc_id: oc.id,
        producto_id: it.producto_id,
        cantidad: it.cantidad,
        costo_unitario: it.costo_unitario,
      }));
      const { error: e2 } = await supabase.from("oc_items").insert(rows);
      if (e2) throw new Error(e2.message);

      created.push({ oc_id: oc.id, laboratorio_id: labId, items: rows.length });
    }

    return { created, sin_proveedor: groups.get(null)?.length ?? 0 };
  });

export const registerSupplierIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        laboratorio_id: z.string().uuid(),
        tipo: z.enum(["retraso", "faltante", "dano", "calidad", "otro"]),
        oc_id: z.string().uuid().nullable().optional(),
        motivo: z.string().max(200).optional(),
        cantidad: z.number().nonnegative().optional(),
        monto: z.number().nonnegative().optional(),
        notas: z.string().min(3).max(1000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("supplier_incidents").insert({
      laboratorio_id: data.laboratorio_id,
      tipo: data.tipo,
      oc_id: data.oc_id ?? null,
      motivo: data.motivo ?? null,
      cantidad: data.cantidad ?? null,
      monto: data.monto ?? null,
      notas: data.notas,
      created_by: userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Regenerate purchase alerts by scanning planeacion + caducidades.
// Clears previous auto-generated (unresolved) alerts and inserts fresh ones.
export const regenerarAlertasCompras = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;

    // Delete non-resolved auto alerts to avoid duplicates
    await supabase
      .from("purchase_alerts")
      .delete()
      .eq("resuelto", false)
      .in("tipo", ["stock_critico", "reorden", "caducidad", "sobrestock"]);

    const inserts: any[] = [];

    // 1) Planeacion: crítico y reorden
    const { data: plan } = await supabase
      .from("v_compras_planeacion")
      .select("producto_id, sku, nombre, laboratorio_id, laboratorio, stock_disponible, punto_reorden, cantidad_sugerida, dias_cobertura")
      .limit(1000);
    for (const p of plan ?? []) {
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

    // 2) Caducidades
    const { data: cad } = await supabase
      .from("v_caducidades")
      .select("producto_id, nombre, sku, laboratorio_id, cantidad, valor_economico, dias_para_caducar, semaforo")
      .in("semaforo", ["rojo", "amarillo"])
      .limit(500);
    for (const c of cad ?? []) {
      inserts.push({
        tipo: "caducidad",
        severidad: c.semaforo === "rojo" ? "critica" : "media",
        producto_id: c.producto_id,
        laboratorio_id: c.laboratorio_id,
        titulo: `Caducidad ${c.semaforo === "rojo" ? "crítica" : "próxima"}: ${c.nombre}`,
        detalle: `${Number(c.cantidad || 0)} u · ${c.dias_para_caducar}d · ${Number(c.valor_economico || 0).toFixed(0)} MXN`,
        payload: { sku: c.sku },
      });
    }

    // 3) Sobrestock (baja rotación 180d)
    const { data: rot } = await supabase
      .from("v_baja_rotacion")
      .select("producto_id, nombre, sku, laboratorio_id, valor_inmovilizado, dias_sin_venta, clasificacion")
      .in("clasificacion", ["180d", "sin_venta"])
      .order("valor_inmovilizado", { ascending: false })
      .limit(50);
    for (const r of rot ?? []) {
      inserts.push({
        tipo: "sobrestock",
        severidad: "media",
        producto_id: r.producto_id,
        laboratorio_id: r.laboratorio_id,
        titulo: `Baja rotación: ${r.nombre}`,
        detalle: `${r.dias_sin_venta}d sin venta · ${Number(r.valor_inmovilizado || 0).toFixed(0)} MXN inmovilizados`,
        payload: { sku: r.sku, clasificacion: r.clasificacion },
      });
    }

    if (inserts.length > 0) {
      const { error } = await supabase.from("purchase_alerts").insert(inserts);
      if (error) throw new Error(error.message);
    }

    return { generadas: inserts.length };
  });

export const resolverAlertaCompras = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("purchase_alerts")
      .update({ resuelto: true, resuelto_por: userId, resuelto_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
