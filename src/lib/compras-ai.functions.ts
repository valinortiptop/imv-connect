import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { openaiChat } from "./valinor-proxy.server";

/** Resumen en lenguaje natural de las sugerencias ya calculadas (los números vienen del cálculo). */
export const resumirSugerenciasOCFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      laboratorio: z.string().max(200),
      items: z.array(z.object({ nombre: z.string().max(200), cantidad: z.number(), motivo: z.string().max(400) })).max(60),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: staff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    if (!staff) throw new Error("Sin permiso");
    if (data.items.length === 0) return { texto: "" };
    const res = await openaiChat({
      model: "valinor:chat-fast",
      messages: [
        { role: "system", content: "Eres asistente de compras de una distribuidora farmacéutica en México. Resume en 3-4 viñetas cortas, en español, qué conviene pedir y por qué. Usa solo los números dados; no inventes cifras." },
        { role: "user", content: `Laboratorio: ${data.laboratorio}\n` + data.items.map((i) => `- ${i.nombre}: sugerido ${i.cantidad} pzas (${i.motivo})`).join("\n") },
      ],
    });
    return { texto: res.choices?.[0]?.message?.content ?? "" };
  });
