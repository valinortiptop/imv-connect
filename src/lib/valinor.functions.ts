import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  sendEmail,
  openaiChat,
  getValinorUsage,
  pingProviders,
  geminiGenerateInline,
} from "./valinor-proxy.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Enviar email transaccional vía Resend (cuenta de Valinor). */
export const sendEmailFn = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        from: z.string().min(3),
        to: z.union([z.string(), z.array(z.string())]),
        subject: z.string().min(1).max(255),
        html: z.string().optional(),
        text: z.string().optional(),
        reply_to: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    return sendEmail(data);
  });

/** Chat completion (OpenAI por Valinor). */
export const aiChatFn = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        model: z.string().default("gpt-4o-mini"),
        messages: z.array(
          z.object({
            role: z.enum(["system", "user", "assistant"]),
            content: z.string().min(1),
          }),
        ).min(1).max(50),
        temperature: z.number().min(0).max(2).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    return openaiChat(data);
  });

/** Reporte de uso de APIs (lo lee desde Valinor). */
export const getUsageReportFn = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.number().int().min(1).max(1000).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    return getValinorUsage(data);
  });

/** Health-check de cada proveedor del gateway de Valinor. */
export const pingProvidersFn = createServerFn({ method: "POST" }).handler(
  async () => {
    return { results: await pingProviders(), checked_at: new Date().toISOString() };
  },
);

/* ──────────────────── Análisis IA de docs de onboarding ──────────────────── */

const ANALYSIS_SCHEMA_HINT = `Devuelve EXCLUSIVAMENTE JSON con esta forma:
{
  "categoria": "empresa|documentos_legales|catalogos|precios|promociones|branding|integraciones|comunicaciones|otros",
  "item_clave_sugerida": "clave del item del catálogo más probable o null",
  "confianza": 0.0,
  "resumen": "1-3 frases",
  "campos": { "<nombre_campo>": "<valor>" },
  "texto_para_notas": "texto breve para guardar en notas del item",
  "extra_fills": [
    { "clave": "clave_de_otro_item_del_catalogo", "valor_texto": "valor extraído literal", "notas": "contexto opcional" }
  ]
}

IMPORTANTE sobre extra_fills:
- Aprovecha al máximo el documento. Si contiene datos que pueden llenar OTROS items del catálogo (por ejemplo una Constancia de Situación Fiscal incluye razón social, RFC, régimen fiscal, dirección fiscal, código postal, representante legal), incluye un objeto por cada item adicional que puedas pre-llenar.
- Usa SOLO claves que existan en el catálogo proporcionado.
- "valor_texto" debe ser el dato concreto extraído del documento, listo para guardarse tal cual.
- Si no hay datos extras útiles, devuelve "extra_fills": [].`;

export const analyzeOnboardingDocFn = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        filename: z.string().min(1).max(255),
        mime: z.string().min(1).max(120),
        // base64 sin prefijo data:
        base64: z.string().min(10).max(12_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    // Catálogo real de items para guiar al modelo.
    const { data: items } = await supabaseAdmin
      .from("onboarding_items")
      .select("clave,titulo,categoria,descripcion");

    const catalogText = (items ?? [])
      .map(
        (i) =>
          `- [${i.categoria}] ${i.clave} — ${i.titulo}${i.descripcion ? `: ${i.descripcion}` : ""}`,
      )
      .join("\n");

    const supportedInline =
      data.mime.startsWith("image/") ||
      data.mime === "application/pdf" ||
      data.mime === "text/plain";

    const parts: Array<
      { text: string } | { inline_data: { mime_type: string; data: string } }
    > = [
      {
        text:
          `Eres un asistente que clasifica documentos de onboarding de un distribuidor farmacéutico (IMV).\n` +
          `Catálogo de items disponibles:\n${catalogText}\n\n` +
          `Analiza el archivo "${data.filename}" (${data.mime}) y ${ANALYSIS_SCHEMA_HINT}\n` +
          `Si no puedes identificar el documento, usa categoria="otros" y confianza<0.3.`,
      },
    ];

    if (supportedInline) {
      parts.push({
        inline_data: { mime_type: data.mime, data: data.base64 },
      });
    } else {
      // Para tipos no soportados (docx/xlsx), intentamos como texto plano truncado.
      try {
        const buf = Buffer.from(data.base64, "base64");
        const text = buf.toString("utf-8").slice(0, 50_000);
        parts.push({
          text: `Contenido textual extraído (parcial):\n${text}`,
        });
      } catch {
        // ignore
      }
    }

    const res = await geminiGenerateInline({
      model: "gemini-2.0-flash",
      parts,
      jsonMode: true,
    });

    const raw =
      res.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

    type Suggestion = {
      categoria?: string;
      item_clave_sugerida?: string | null;
      confianza?: number;
      resumen?: string;
      campos?: Record<string, string>;
      texto_para_notas?: string;
      extra_fills?: Array<{ clave: string; valor_texto?: string; notas?: string }>;
    };

    let parsed: Suggestion | null = null;
    try {
      parsed = JSON.parse(raw) as Suggestion;
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          parsed = JSON.parse(m[0]) as Suggestion;
        } catch {
          /* noop */
        }
      }
    }

    return { suggestion: parsed, raw };
  });
