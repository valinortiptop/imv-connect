/**
 * Server functions for empresa documents:
 *  - parseCsfDocumentFn: extract empresa fiscal data from a Constancia de Situación Fiscal (PDF/img)
 *  - uploadEmpresaDocFn: upload a document, save row, AI-categorize
 *  - listEmpresaDocsFn: list documents (with signed URLs)
 *  - deleteEmpresaDocFn: delete a document + storage object
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { geminiGenerateInline } from "./valinor-proxy.server";

const BUCKET = "empresa-docs";

function extractJson<T = unknown>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]) as T;
      } catch {
        /* noop */
      }
    }
    return null;
  }
}

/* ─── Constancia de Situación Fiscal → autofill ──────────────────────────── */

export type CsfExtract = {
  razon_social?: string;
  nombre_comercial?: string;
  rfc?: string;
  regimen_fiscal?: string;
  cp_fiscal?: string;
  direccion_fiscal?: string;
  representante_legal?: string;
  telefono?: string;
  email_contacto?: string;
  confianza?: number;
  resumen?: string;
};

const CSF_PROMPT = `Eres un asistente que lee documentos fiscales mexicanos (Constancia de Situación Fiscal del SAT, CFDI, actas constitutivas, comprobantes de domicilio).
Devuelve EXCLUSIVAMENTE JSON con esta forma:
{
  "razon_social": "nombre o denominación legal",
  "nombre_comercial": "si aplica",
  "rfc": "RFC alfanumérico exacto",
  "regimen_fiscal": "código + descripción, ej: 601 General de Ley Personas Morales",
  "cp_fiscal": "código postal fiscal",
  "direccion_fiscal": "calle, número, colonia, alcaldía/municipio, estado",
  "representante_legal": "si aplica",
  "telefono": "si aparece",
  "email_contacto": "si aparece",
  "confianza": 0.0,
  "resumen": "1-2 frases describiendo el documento"
}
Si un campo no está presente, omítelo. No inventes datos. Los RFC de personas morales tienen 12 caracteres; los de persona física tienen 13.`;

export const parseCsfDocumentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        filename: z.string().min(1).max(255),
        mime: z.string().min(1).max(120),
        base64: z.string().min(10).max(15_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const supportedInline =
      data.mime.startsWith("image/") || data.mime === "application/pdf";

    const parts: Array<
      { text: string } | { inline_data: { mime_type: string; data: string } }
    > = [{ text: `${CSF_PROMPT}\n\nArchivo: ${data.filename} (${data.mime})` }];

    if (supportedInline) {
      parts.push({ inline_data: { mime_type: data.mime, data: data.base64 } });
    } else {
      throw new Error("Formato no soportado. Sube un PDF o imagen (JPG/PNG).");
    }

    const res = await geminiGenerateInline({
      model: "gemini-flash-latest",
      parts,
      jsonMode: true,
    });
    const raw =
      res.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ??
      "";
    const parsed = extractJson<CsfExtract>(raw);
    return { extracted: parsed, raw };
  });

/* ─── Document upload + AI categorization ────────────────────────────────── */

export type DocCategoria =
  | "logo"
  | "fuente"
  | "csf"
  | "fiscal"
  | "legal"
  | "contrato"
  | "branding"
  | "comprobante"
  | "general"
  | "otro";

const CAT_PROMPT = `Eres un asistente que clasifica documentos empresariales.
Categorías disponibles: logo, fuente, csf (constancia situación fiscal), fiscal, legal, contrato, branding, comprobante, general, otro.
Devuelve EXCLUSIVAMENTE JSON:
{
  "categoria": "una de las categorías",
  "etiquetas": ["3-6 etiquetas cortas en minúsculas"],
  "resumen": "1-2 frases describiendo el documento",
  "confianza": 0.0
}
Reglas:
- Si es una imagen tipo logotipo/isotipo (logo transparente, iconografía de marca) → "logo".
- Si es un archivo de fuente tipográfica (.ttf/.otf/.woff) → "fuente".
- Si es Constancia de Situación Fiscal del SAT → "csf".
- Si es CFDI, declaración, comprobante de pago SAT → "fiscal".
- Si es acta constitutiva, poder notarial, contrato → "legal" o "contrato".
- Si es manual de marca, guía de estilo, mockup → "branding".
- Si es recibo/comprobante genérico → "comprobante".
- Si no aplica ninguna → "general".`;

export const uploadEmpresaDocFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        empresa_id: z.string().uuid(),
        filename: z.string().min(1).max(255),
        mime: z.string().min(1).max(120),
        base64: z.string().min(4).max(20_000_000),
        size_bytes: z.number().int().min(0).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    // 1. Upload to storage
    const cleanName = data.filename.replace(/[^\w.\-]+/g, "_");
    const path = `${data.empresa_id}/${Date.now()}_${cleanName}`;
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: data.mime, upsert: false });
    if (upErr) throw new Error(`upload: ${upErr.message}`);

    // 2. Insert initial row
    const { data: row, error: insErr } = await supabaseAdmin
      .from("empresa_documentos" as any)
      .insert({
        empresa_id: data.empresa_id,
        storage_path: path,
        filename: data.filename,
        mime: data.mime,
        size_bytes: data.size_bytes ?? bytes.length,
        categoria: guessCategoryFromMime(data.filename, data.mime),
        etiquetas: [],
        ai_analyzed: false,
        uploaded_by: context.userId,
      } as any)
      .select("*")
      .single();
    if (insErr) {
      // best-effort cleanup
      await supabaseAdmin.storage.from(BUCKET).remove([path]);
      throw new Error(`db: ${insErr.message}`);
    }

    // 3. AI categorization (best-effort; images and PDFs only, or small text)
    const canAnalyze =
      data.mime.startsWith("image/") || data.mime === "application/pdf";
    let updated = row;
    if (canAnalyze) {
      try {
        const res = await geminiGenerateInline({
          model: "gemini-flash-latest",
          parts: [
            { text: `${CAT_PROMPT}\n\nArchivo: ${data.filename} (${data.mime})` },
            { inline_data: { mime_type: data.mime, data: data.base64 } },
          ],
          jsonMode: true,
        });
        const raw =
          res.candidates?.[0]?.content?.parts
            ?.map((p) => p.text ?? "")
            .join("") ?? "";
        const parsed = extractJson<{
          categoria?: DocCategoria;
          etiquetas?: string[];
          resumen?: string;
          confianza?: number;
        }>(raw);
        if (parsed) {
          const { data: upd } = await supabaseAdmin
            .from("empresa_documentos" as any)
            .update({
              categoria: parsed.categoria ?? row.categoria,
              etiquetas: Array.isArray(parsed.etiquetas)
                ? parsed.etiquetas.slice(0, 8)
                : [],
              resumen: parsed.resumen ?? null,
              ai_analyzed: true,
            } as any)
            .eq("id", row.id)
            .select("*")
            .single();
          if (upd) updated = upd;
        }
      } catch (e) {
        console.warn("[empresa-docs] AI categorization failed:", (e as Error).message);
      }
    }

    // 4. Build signed URL for immediate view
    const { data: signed } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60);

    return { document: updated, signed_url: signed?.signedUrl ?? null };
  });

function guessCategoryFromMime(name: string, mime: string): DocCategoria {
  const n = name.toLowerCase();
  if (/\.(ttf|otf|woff2?|eot)$/.test(n)) return "fuente";
  if (mime.startsWith("image/") && /(logo|isotipo|brand)/.test(n)) return "logo";
  if (/csf|constancia/.test(n)) return "csf";
  return "general";
}

/* ─── List / delete ──────────────────────────────────────────────────────── */

export const listEmpresaDocsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ empresa_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: rows, error } = await supabaseAdmin
      .from("empresa_documentos" as any)
      .select("*")
      .eq("empresa_id", data.empresa_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const withUrls = await Promise.all(
      (rows ?? []).map(async (r: any) => {
        const { data: signed } = await supabaseAdmin.storage
          .from(BUCKET)
          .createSignedUrl(r.storage_path, 60 * 60);
        return { ...r, signed_url: signed?.signedUrl ?? null };
      }),
    );
    return { documents: withUrls };
  });

export const deleteEmpresaDocFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: row, error } = await supabaseAdmin
      .from("empresa_documentos" as any)
      .select("storage_path")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    if (row?.storage_path) {
      await supabaseAdmin.storage.from(BUCKET).remove([row.storage_path]);
    }
    const { error: delErr } = await supabaseAdmin
      .from("empresa_documentos" as any)
      .delete()
      .eq("id", data.id);
    if (delErr) throw new Error(delErr.message);
    return { ok: true };
  });
