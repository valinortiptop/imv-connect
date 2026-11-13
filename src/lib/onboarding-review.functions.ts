import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { geminiGenerateInline } from "./valinor-proxy.server";

type Review = {
  veredicto?: "bien" | "revisar" | "incorrecto";
  resumen?: string;
  observaciones?: string[];
  clave_sugerida?: string | null;
};

function toBase64(buf: ArrayBuffer) {
  return Buffer.from(buf).toString("base64");
}

/**
 * Reviews one uploaded onboarding file against the document it was requested for,
 * via Gemini through the Valinor proxy. Saves the verdict on the file row.
 * When the file has no requirement yet, also assigns the best-matching one.
 */
export const reviewOnboardingFileFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ archivoId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: file, error } = await sb.from("onboarding_archivos").select("*").eq("id", data.archivoId).maybeSingle();
    if (error || !file) throw new Error("Archivo no encontrado");
    await sb.from("onboarding_archivos").update({ ai_estado: "analizando" }).eq("id", file.id);

    try {
      const { data: items } = await sb.from("onboarding_items").select("id,clave,titulo,descripcion,area");
      const target = (items ?? []).find((i: any) => i.id === file.item_id);
      const dl = await sb.storage.from("onboarding").download(file.storage_path);
      if (dl.error || !dl.data) throw new Error("No se pudo leer el archivo");
      const buf = await (dl.data as Blob).arrayBuffer();
      const mime: string = file.mime_type || "application/octet-stream";
      const name: string = file.nombre_original;

      const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [];
      const catalog = (items ?? []).map((i: any) => `- ${i.clave}: ${i.titulo}${i.descripcion ? ` (${i.descripcion})` : ""}`).join("\n");
      parts.push({
        text:
          `Eres revisor de documentos para la migración de NetSuite a una app nueva en IMV (distribuidor farmacéutico, México).\n` +
          (target
            ? `Este archivo se subió como: "${target.titulo}"${target.descripcion ? ` — se pidió: ${target.descripcion}` : ""}.\n`
            : `El archivo no tiene documento asignado. Catálogo de documentos pedidos:\n${catalog}\n`) +
          `Revisa "${name}": ¿es el documento correcto?, ¿está completo y legible?, ¿faltan columnas, fechas, firmas o periodos?\n` +
          `Responde SOLO JSON: {"veredicto":"bien|revisar|incorrecto","resumen":"1 frase","observaciones":["máx 3 frases cortas"],"clave_sugerida":"clave del catálogo o null"}. Español, tono claro.`,
      });

      if (mime.startsWith("image/") || mime === "application/pdf") {
        if (buf.byteLength > 15_000_000) throw new Error("Archivo demasiado grande para revisar (máx 15 MB)");
        parts.push({ inline_data: { mime_type: mime, data: toBase64(buf) } });
      } else if (/sheet|excel|csv/.test(mime) || /\.(xlsx|xls|csv)$/i.test(name)) {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
        const txt = wb.SheetNames.slice(0, 5).map((s) => {
          const rows = XLSX.utils.sheet_to_csv(wb.Sheets[s]).split("\n");
          return `Hoja "${s}" (${rows.length} filas):\n${rows.slice(0, 60).join("\n")}`;
        }).join("\n\n");
        parts.push({ text: `Contenido (primeras filas):\n${txt.slice(0, 60_000)}` });
      } else {
        parts.push({ text: `Contenido de texto (parcial):\n${new TextDecoder().decode(buf).slice(0, 40_000)}` });
      }

      const res = await geminiGenerateInline({ model: "gemini-flash-latest", parts, jsonMode: true });
      const raw = res.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      let r: Review | null = null;
      try { r = JSON.parse(raw); } catch { const m = raw.match(/\{[\s\S]*\}/); if (m) try { r = JSON.parse(m[0]); } catch { /* noop */ } }
      if (!r || !r.veredicto) throw new Error("La IA no devolvió una revisión válida");

      const patch: Record<string, unknown> = {
        ai_estado: "listo",
        ai_veredicto: ["bien", "revisar", "incorrecto"].includes(r.veredicto) ? r.veredicto : "revisar",
        ai_resumen: (r.resumen ?? "").slice(0, 500),
        ai_observaciones: (r.observaciones ?? []).slice(0, 3).map((s) => String(s).slice(0, 300)),
        ai_at: new Date().toISOString(),
      };
      if (!file.item_id && r.clave_sugerida) {
        const match = (items ?? []).find((i: any) => i.clave === r!.clave_sugerida);
        if (match) patch.item_id = match.id;
      }
      await sb.from("onboarding_archivos").update(patch).eq("id", file.id);
      return { ok: true as const };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al revisar";
      await sb.from("onboarding_archivos").update({ ai_estado: "error", ai_resumen: msg.slice(0, 300) }).eq("id", file.id);
      return { ok: false as const, error: msg };
    }
  });
