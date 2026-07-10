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

// ── Faltantes (shortage capture + stats) ──────────────────────────
export const listShortageReasons = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("shortage_reasons")
      .select("id, codigo, label, activo, created_at")
      .order("label", { ascending: true });
    if (error) throw new Error(error.message);
    return { motivos: data ?? [] };
  });

export const upsertShortageReason = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        codigo: z.string().min(2).max(50),
        label: z.string().min(2).max(120),
        activo: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const payload = { codigo: data.codigo, label: data.label, activo: data.activo };
    if (data.id) {
      const { error } = await context.supabase.from("shortage_reasons").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("shortage_reasons")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: (row as any).id };
  });

export const deleteShortageReason = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("shortage_reasons").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const logShortageEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        producto_id: z.string().uuid(),
        motivo_id: z.string().uuid(),
        cantidad: z.number().positive(),
        cliente_id: z.string().uuid().nullable().optional(),
        pedido_id: z.string().uuid().nullable().optional(),
        fecha: z.string().optional(),
        notas: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const { error } = await supabase.from("shortage_events").insert({
      producto_id: data.producto_id,
      motivo_id: data.motivo_id,
      cantidad: data.cantidad,
      cliente_id: data.cliente_id ?? null,
      pedido_id: data.pedido_id ?? null,
      fecha: data.fecha ?? new Date().toISOString().slice(0, 10),
      notas: data.notas ?? null,
      created_by: userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listShortageEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ days: z.number().int().min(1).max(365).default(90) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const since = new Date();
    since.setDate(since.getDate() - data.days);
    const { data: rows, error } = await context.supabase
      .from("shortage_events")
      .select(
        "id, fecha, cantidad, notas, producto:productos(id, sku, nombre), motivo:shortage_reasons(id, label), cliente:clientes(id, nombre_comercial, razon_social)",
      )
      .gte("fecha", since.toISOString().slice(0, 10))
      .order("fecha", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return { eventos: rows ?? [] };
  });

export const shortageStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ days: z.number().int().min(1).max(365).default(90) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const since = new Date();
    since.setDate(since.getDate() - data.days);
    const sinceIso = since.toISOString().slice(0, 10);

    const { data: rows, error } = await context.supabase
      .from("shortage_events")
      .select("cantidad, fecha, motivo:shortage_reasons(id, label), producto:productos(id, sku, nombre)")
      .gte("fecha", sinceIso)
      .limit(5000);
    if (error) throw new Error(error.message);

    const byReason = new Map<string, { label: string; eventos: number; unidades: number }>();
    const byProduct = new Map<string, { sku: string; nombre: string; eventos: number; unidades: number }>();
    let totalEventos = 0;
    let totalUnidades = 0;
    for (const r of (rows ?? []) as any[]) {
      const qty = Number(r.cantidad ?? 0);
      totalEventos += 1;
      totalUnidades += qty;
      const mLabel = r.motivo?.label ?? "Sin motivo";
      const mId = r.motivo?.id ?? "none";
      const cur = byReason.get(mId) ?? { label: mLabel, eventos: 0, unidades: 0 };
      cur.eventos += 1;
      cur.unidades += qty;
      byReason.set(mId, cur);
      if (r.producto?.id) {
        const pId = r.producto.id;
        const cp = byProduct.get(pId) ?? {
          sku: r.producto.sku ?? "",
          nombre: r.producto.nombre ?? "",
          eventos: 0,
          unidades: 0,
        };
        cp.eventos += 1;
        cp.unidades += qty;
        byProduct.set(pId, cp);
      }
    }

    const motivos = Array.from(byReason.values()).sort((a, b) => b.eventos - a.eventos);
    const productos = Array.from(byProduct.values()).sort((a, b) => b.unidades - a.unidades).slice(0, 20);
    return { totalEventos, totalUnidades, motivos, productos };
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
      .in("tipo", [
        "stock_critico",
        "reorden",
        "caducidad",
        "sobrestock",
        "incremento_costo",
        "prov_incumple",
        "oc_vencida",
        "promo_sin_stock",
      ]);

    // Read config thresholds
    const { data: cfgRow } = await supabase
      .from("purchase_config")
      .select("costo_variacion_umbral_pct")
      .limit(1)
      .maybeSingle();
    const costoUmbral = Number((cfgRow as any)?.costo_variacion_umbral_pct ?? 10);


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

    // 3) Sobrestock (baja rotación 180d / sin venta)
    const { data: rot } = await supabase
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

    // 4) Incremento de costo por encima del umbral (últimos 60 días)
    const cost60 = new Date();
    cost60.setDate(cost60.getDate() - 60);
    const { data: costs } = await supabase
      .from("cost_history")
      .select("producto_id, costo_anterior, costo_nuevo, variacion_pct, fecha, producto:productos(nombre, sku)")
      .gte("fecha", cost60.toISOString().slice(0, 10))
      .order("fecha", { ascending: false })
      .limit(200);
    const seenCost = new Set<string>();
    for (const c of (costs ?? []) as any[]) {
      if (!c.producto_id || seenCost.has(c.producto_id)) continue;
      seenCost.add(c.producto_id);
      const pct = Number(c.variacion_pct ?? 0);
      if (pct >= costoUmbral) {
        inserts.push({
          tipo: "incremento_costo",
          severidad: pct >= costoUmbral * 2 ? "alta" : "media",
          producto_id: c.producto_id,
          titulo: `Incremento de costo: ${c.producto?.nombre ?? ""}`,
          detalle: `${pct.toFixed(1)}% (${Number(c.costo_anterior || 0).toFixed(2)} → ${Number(c.costo_nuevo || 0).toFixed(2)})`,
          payload: { sku: c.producto?.sku, variacion_pct: pct, umbral: costoUmbral },
        });
      }
    }

    // 5) Proveedor con bajo cumplimiento (fill rate < 85% o on-time < 80%)
    const { data: kpis } = await supabase
      .from("v_supplier_kpis")
      .select("laboratorio_id, laboratorio, fill_rate_pct, on_time_pct, lead_time_prom_dias, ordenes")
      .limit(200);
    for (const k of (kpis ?? []) as any[]) {
      if (!k.laboratorio_id || Number(k.ordenes ?? 0) < 3) continue;
      const fr = Number(k.fill_rate_pct ?? 100);
      const ot = Number(k.on_time_pct ?? 100);
      if (fr < 85 || ot < 80) {
        inserts.push({
          tipo: "prov_incumple",
          severidad: fr < 70 || ot < 60 ? "alta" : "media",
          laboratorio_id: k.laboratorio_id,
          titulo: `Bajo cumplimiento: ${k.laboratorio ?? ""}`,
          detalle: `Fill ${fr.toFixed(0)}% · Puntualidad ${ot.toFixed(0)}% · Lead ${Number(k.lead_time_prom_dias ?? 0).toFixed(0)}d`,
          payload: { fill_rate_pct: fr, on_time_pct: ot },
        });
      }
    }

    // 6) OCs vencidas (fecha esperada pasada y no recibidas)
    const today = new Date().toISOString().slice(0, 10);
    const { data: ocsV } = await supabase
      .from("ordenes_compra")
      .select("id, folio, fecha_esperada, estado, laboratorio_id, laboratorio:laboratorios(nombre)")
      .lt("fecha_esperada", today)
      .not("estado", "in", "(recibida,cancelada,recibida_parcial)")
      .limit(200);
    for (const o of (ocsV ?? []) as any[]) {
      const dias = Math.floor(
        (Date.now() - new Date(o.fecha_esperada).getTime()) / 86400000,
      );
      inserts.push({
        tipo: "oc_vencida",
        severidad: dias > 14 ? "alta" : "media",
        laboratorio_id: o.laboratorio_id,
        titulo: `OC vencida: ${o.folio ?? o.id.slice(0, 8)}`,
        detalle: `${o.laboratorio?.nombre ?? "Proveedor"} · ${dias}d de retraso`,
        payload: { oc_id: o.id, dias_retraso: dias },
      });
    }

    // 7) Promoción activa sin stock suficiente
    const in14 = new Date();
    in14.setDate(in14.getDate() + 14);
    const { data: promos } = await supabase
      .from("product_promotions")
      .select("id, promo_name, producto_id, valid_from, valid_to, producto:productos(nombre, sku, stock_disponible)")
      .eq("active", true)
      .lte("valid_from", today)
      .gte("valid_to", today)
      .limit(100);
    for (const p of (promos ?? []) as any[]) {
      const disp = Number(p.producto?.stock_disponible ?? 0);
      if (disp <= 5) {
        inserts.push({
          tipo: "promo_sin_stock",
          severidad: disp === 0 ? "critica" : "alta",
          producto_id: p.producto_id,
          titulo: `Promo sin stock: ${p.producto?.nombre ?? ""}`,
          detalle: `${p.promo_name ?? "Promoción"} activa · Disp ${disp}`,
          payload: { sku: p.producto?.sku, promo_id: p.id },
        });
      }
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

// AI insight for Compras dashboard — narrative summary + top 3 acciones
export const aiInsightCompras = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { geminiGenerateInline } = await import("./valinor-proxy.server");

    const [plan, cad, rot, kpi] = await Promise.all([
      supabase.from("v_compras_planeacion")
        .select("sku, nombre, laboratorio, stock_disponible, punto_reorden, cantidad_sugerida, dias_cobertura, ventas_30d, tendencia_pct")
        .order("cantidad_sugerida", { ascending: false })
        .limit(15),
      supabase.from("v_caducidades")
        .select("nombre, sku, cantidad, valor_economico, dias_restantes, semaforo")
        .in("semaforo", ["rojo", "amarillo"])
        .order("dias_restantes", { ascending: true })
        .limit(10),
      supabase.from("v_baja_rotacion")
        .select("nombre, sku, valor_inmovilizado, dias_sin_venta, clasificacion")
        .in("clasificacion", ["180d", "sin_venta"])
        .order("valor_inmovilizado", { ascending: false })
        .limit(10),
      supabase.from("v_supplier_kpis")
        .select("laboratorio, fill_rate_pct, on_time_pct, lead_time_prom_dias")
        .order("fill_rate_pct", { ascending: true })
        .limit(5),
    ]);

    const prompt = `Eres analista senior de compras farmacéuticas. Genera un análisis breve y accionable en español para el equipo de compras.
Devuelve JSON estricto: {"resumen":"<2-3 líneas>","riesgos":["...","...","..."],"acciones":[{"titulo":"...","detalle":"..."}]} (máx 3 acciones priorizadas).

Datos:
- Planeación top-15: ${JSON.stringify(plan.data ?? [])}
- Caducidades: ${JSON.stringify(cad.data ?? [])}
- Baja rotación: ${JSON.stringify(rot.data ?? [])}
- Proveedores con menor fill rate: ${JSON.stringify(kpi.data ?? [])}`;

    const resp = await geminiGenerateInline({
      model: "gemini-flash-latest",
      parts: [{ text: prompt }],
      jsonMode: true,
    });
    const text = resp?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    let parsed: { resumen?: string; riesgos?: string[]; acciones?: { titulo: string; detalle: string }[] } = {};
    try { parsed = JSON.parse(text); } catch { parsed = {}; }
    return {
      resumen: parsed.resumen ?? "",
      riesgos: Array.isArray(parsed.riesgos) ? parsed.riesgos.slice(0, 5) : [],
      acciones: Array.isArray(parsed.acciones) ? parsed.acciones.slice(0, 3) : [],
    };
  });

// ── Alert assignment / listing ─────────────────────────────────────
export const listPurchaseAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        onlyOpen: z.boolean().default(true),
        mine: z.boolean().default(false),
        tipos: z.array(z.string()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("purchase_alerts")
      .select(
        "id, tipo, severidad, prioridad, titulo, detalle, payload, resuelto, resuelto_at, created_at, responsable_user_id, producto_id, laboratorio_id",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.onlyOpen) q = q.eq("resuelto", false);
    if (data.mine) q = q.eq("responsable_user_id", context.userId);
    if (data.tipos && data.tipos.length > 0) q = q.in("tipo", data.tipos);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { alertas: rows ?? [] };
  });

export const assignAlerta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        responsable_user_id: z.string().uuid().nullable(),
        prioridad: z.enum(["baja", "media", "alta", "critica"]).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const payload: any = { responsable_user_id: data.responsable_user_id };
    if (data.prioridad !== undefined) payload.prioridad = data.prioridad;
    const { error } = await context.supabase
      .from("purchase_alerts")
      .update(payload)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Purchase budgets ────────────────────────────────────────────────
export const listPurchaseBudgets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("purchase_budgets")
      .select("id, empresa_id, mes, monto_mxn, notas, created_at")
      .order("mes", { ascending: false })
      .limit(24);
    if (error) throw new Error(error.message);
    return { budgets: data ?? [] };
  });

export const upsertPurchaseBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        empresa_id: z.string().uuid().nullable().optional(),
        mes: z.string(), // YYYY-MM-01
        monto_mxn: z.number().nonnegative(),
        notas: z.string().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const row = {
      empresa_id: data.empresa_id ?? null,
      mes: data.mes,
      monto_mxn: data.monto_mxn,
      notas: data.notas ?? null,
      updated_at: new Date().toISOString(),
      created_by: userId,
    };
    const { error } = await supabase
      .from("purchase_budgets")
      .upsert(row, { onConflict: "empresa_id,mes" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Best purchase date suggestion ──────────────────────────────────
// Given a purchase amount and empresa, project bank balance across the next
// 30 days by summing all future/scheduled bank_movements, and pick the date
// with the highest projected buffer that also stays above zero.
export const bestPurchaseDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        monto: z.number().positive(),
        empresa_id: z.string().uuid().nullable().optional(),
        dias: z.number().int().min(7).max(90).default(30),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const horizonte = new Date(today);
    horizonte.setDate(horizonte.getDate() + data.dias);

    // Current bank balance (sum of live saldos across active accounts)
    let bqAcc = supabase
      .from("bank_accounts")
      .select("id, saldo_inicial, empresa_id, activa")
      .eq("activa", true);
    if (data.empresa_id) bqAcc = bqAcc.eq("empresa_id", data.empresa_id);
    const { data: accts } = await bqAcc;
    const saldos = await Promise.all(
      (accts ?? []).map(async (a: any) => {
        const { data: s } = await supabase.rpc("bank_account_saldo" as any, { _cuenta: a.id });
        return Number(s ?? a.saldo_inicial ?? 0);
      }),
    );
    const saldoActual = saldos.reduce((s, v) => s + v, 0);


    // Projected movements
    let bqMov = supabase
      .from("bank_movements")
      .select("fecha, monto, tipo, empresa_id")
      .gte("fecha", todayIso)
      .lte("fecha", horizonte.toISOString().slice(0, 10));
    if (data.empresa_id) bqMov = bqMov.eq("empresa_id", data.empresa_id);
    const { data: movs } = await bqMov;

    // Build daily running balance
    const days: { date: string; balance: number; buffer: number }[] = [];
    let bal = saldoActual;
    const byDate = new Map<string, number>();
    for (const m of (movs ?? []) as any[]) {
      const delta = m.tipo === "cargo" || m.tipo === "salida" ? -Number(m.monto ?? 0) : Number(m.monto ?? 0);
      byDate.set(m.fecha, (byDate.get(m.fecha) ?? 0) + delta);
    }
    for (let i = 0; i < data.dias; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      bal += byDate.get(iso) ?? 0;
      const buffer = bal - data.monto;
      days.push({ date: iso, balance: bal, buffer });
    }

    // Pick date with max buffer among viable (buffer >= 0); if none, pick max
    const viables = days.filter((d) => d.buffer >= 0);
    const pool = viables.length > 0 ? viables : days;
    const best = pool.reduce((a, b) => (a.buffer >= b.buffer ? a : b), pool[0]);

    return {
      saldo_actual: saldoActual,
      dias: days.slice(0, 30),
      recomendacion: best
        ? {
            fecha: best.date,
            saldo_proyectado: best.balance,
            buffer: best.buffer,
            viable: best.buffer >= 0,
          }
        : null,
    };
  });
