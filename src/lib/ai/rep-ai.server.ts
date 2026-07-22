/**
 * Rep AI helper — server-only. Uses Valinor proxy → Gemini.
 */
import { geminiGenerate } from "@/lib/valinor-proxy.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const REP_SYSTEM = `Eres el asistente IA del panel de representantes de ventas de IMV (distribuidor de instrumental y consumibles médicos en México).

Contexto del dominio:
- Un "rep" (representante) atiende una cartera de clientes (clínicas, hospitales, laboratorios, doctores).
- Módulos del panel: Inicio, Clientes, Ficha 360 del cliente, Ruta (mapa/optimización), Visitas, Inventario, Plan semanal, Laboratorios, Coach IA, Supervisor.
- "Visita" = check-in de campo (con evidencia/firma). "Pedido" = orden de venta. "Ruta" = clientes a visitar hoy.
- "Churn risk" = riesgo de perder al cliente. "Reorden" = predicción de próxima compra.

Reglas de respuesta:
- Español de México, conciso, profesional. Nunca uses emojis ni markdown pesado.
- Sólo análisis, observaciones y recomendaciones. Nunca propongas escribir, eliminar o modificar registros.
- Si no tienes datos suficientes, dilo explícitamente.
- Máximo 6 frases, cita números cuando existan.`;

export type RepModule =
  | "rep-home"
  | "rep-clientes"
  | "rep-cliente-detalle"
  | "rep-ruta"
  | "rep-visitas"
  | "rep-inventario"
  | "rep-plan"
  | "rep-laboratorios"
  | "rep-coach"
  | "rep-supervisor"
  | "rep-calendario"
  | "rep-cotizaciones"
  | "rep-cobranza"
  | "rep-devoluciones"
  | "rep-prospectos"
  | "rep-anaquel"
  | "rep-cierre"
  | "rep-metas"
  | "rep-competencia"
  | "rep-comportamiento-sku"
  | "rep-oportunidades-perdidas";


const MODULE_LABEL: Record<RepModule, string> = {
  "rep-home": "Inicio del rep",
  "rep-clientes": "Listado de clientes",
  "rep-cliente-detalle": "Ficha 360° del cliente",
  "rep-ruta": "Ruta del día",
  "rep-visitas": "Visitas realizadas",
  "rep-inventario": "Inventario / catálogo",
  "rep-plan": "Plan semanal",
  "rep-laboratorios": "Laboratorios asignados",
  "rep-coach": "Coach IA",
  "rep-supervisor": "Panel supervisor",
  "rep-calendario": "Calendario de agenda",
  "rep-cotizaciones": "Cotizaciones abiertas",
  "rep-cobranza": "Cobranza en ruta",
  "rep-devoluciones": "Devoluciones",
  "rep-prospectos": "Prospectos en campo",
  "rep-anaquel": "Anaquel y evidencia visual",
  "rep-cierre": "Cierre de día",
  "rep-metas": "Metas y avance",
  "rep-competencia": "Inteligencia competitiva",
  "rep-comportamiento-sku": "Comportamiento por SKU",
  "rep-oportunidades-perdidas": "Oportunidades perdidas",
};





type SB = SupabaseClient<Database>;

async function buildSnapshot(
  supabase: SB,
  module: RepModule,
  path: string,
): Promise<unknown> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400_000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 86400_000).toISOString();

  try {
    switch (module) {
      case "rep-home":
      case "rep-clientes":
      case "rep-plan":
      case "rep-coach":
      case "rep-calendario":
      case "rep-supervisor": {

        const [{ data: clientes }, { data: visitas }] = await Promise.all([
          (supabase as any).from("clientes").select("id, nombre, churn_risk, ultima_visita").limit(50),
          (supabase as any)
            .from("visitas")
            .select("id, cliente_id, fecha, resultado")
            .gte("fecha", weekAgo)
            .limit(100),
        ]);
        return {
          ventana: "7d",
          clientesMuestra: clientes ?? [],
          visitasSemana: visitas ?? [],
        };
      }
      case "rep-cliente-detalle": {
        const idMatch = path.match(/\/rep\/clientes\/([^/]+)/);
        const id = idMatch?.[1];
        if (!id) return { note: "sin id" };
        const [{ data: cliente }, { data: visitas }, { data: pedidos }] = await Promise.all([
          (supabase as any).from("clientes").select("*").eq("id", id).maybeSingle(),
          (supabase as any).from("visitas").select("*").eq("cliente_id", id).order("fecha", { ascending: false }).limit(20),
          (supabase as any).from("pedidos").select("*").eq("cliente_id", id).order("fecha", { ascending: false }).limit(20),
        ]);
        return { cliente, visitas: visitas ?? [], pedidos: pedidos ?? [] };
      }
      case "rep-ruta": {
        const { data: clientes } = await (supabase as any)
          .from("clientes")
          .select("id, nombre, lat, lng, churn_risk")
          .limit(80);
        return { clientesConCoord: (clientes ?? []).filter((c: any) => c.lat && c.lng) };
      }
      case "rep-visitas": {
        const { data: visitas } = await (supabase as any)
          .from("visitas")
          .select("id, cliente_id, fecha, resultado, notas")
          .gte("fecha", monthAgo)
          .order("fecha", { ascending: false })
          .limit(100);
        return { ventana: "30d", visitas: visitas ?? [] };
      }
      case "rep-inventario": {
        const { data: productos } = await (supabase as any)
          .from("productos")
          .select("id, nombre, sku, marca, stock")
          .limit(50);
        return { productosMuestra: productos ?? [] };
      }
      case "rep-laboratorios": {
        const { data: labs } = await (supabase as any)
          .from("laboratorios")
          .select("*")
          .limit(50);
        return { laboratorios: labs ?? [] };
      }
      default:
        return {};
    }
  } catch (e) {
    return { snapshotError: (e as Error).message };
  }
}

function extractText(res: unknown): string {
  const r = res as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const parts = r?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p?.text ?? "").join("").trim();
}

export async function generateRepNarrative(input: {
  supabase: SB;
  module: RepModule;
  question: string;
  path: string;
}): Promise<string> {
  const snapshot = await buildSnapshot(input.supabase, input.module, input.path);
  const userText = `Módulo: ${MODULE_LABEL[input.module]}
Pregunta del rep: ${input.question}

Datos disponibles (snapshot, sólo lectura):
${JSON.stringify(snapshot).slice(0, 14000)}

Responde en texto plano, máx 6 frases, con datos concretos cuando existan.`;

  const res = await geminiGenerate({
    model: "gemini-flash-latest",
    contents: [
      { role: "user", parts: [{ text: REP_SYSTEM }] },
      { role: "model", parts: [{ text: "Entendido. Responderé como asistente del panel de reps." }] },
      { role: "user", parts: [{ text: userText }] },
    ],
  });
  const text = extractText(res);
  return text || "Asistente IA no disponible.";
}
