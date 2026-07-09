import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MODULE = z.enum([
  "rep-home",
  "rep-clientes",
  "rep-cliente-detalle",
  "rep-ruta",
  "rep-visitas",
  "rep-inventario",
  "rep-plan",
  "rep-laboratorios",
  "rep-coach",
  "rep-supervisor",
]);

export const aiRepAskFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        module: MODULE,
        question: z.string().min(1).max(500),
        path: z.string().max(500).default("/rep"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ text: string }> => {
    const { supabase } = context;
    const { generateRepNarrative } = await import("@/lib/ai/rep-ai.server");
    const text = await generateRepNarrative({
      supabase,
      module: data.module,
      question: data.question,
      path: data.path,
    });
    return { text };
  });
