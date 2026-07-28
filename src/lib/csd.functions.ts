import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uploadInput = z.object({
  empresaId: z.string().uuid(),
  cerBase64: z.string().min(100),
  keyBase64: z.string().min(100),
  passphrase: z.string().min(1).max(200),
});

const signInput = z.object({
  empresaId: z.string().uuid(),
  xml: z.string().min(50),
  passphrase: z.string().min(1).max(200),
});

const getInfoInput = z.object({ empresaId: z.string().uuid() });

/** Verifica que el usuario tenga rol admin o contabilidad */
async function assertAdminOrConta(supabase: any, userId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (isAdmin) return;
  const { data: isConta } = await supabase.rpc("has_role", { _user_id: userId, _role: "contabilidad" });
  if (!isConta) throw new Error("Solo admin o contabilidad puede acceder al CSD");
}

/** Sube y registra el CSD (cer + key) para una empresa. Valida abriendo la .key con la contraseña. */
export const uploadCsd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => uploadInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdminOrConta(supabase, userId);

    const { parseCer, loadPrivateKey } = await import("./csd-signer.server");
    const cerDer = new Uint8Array(Buffer.from(data.cerBase64, "base64"));
    const keyDer = new Uint8Array(Buffer.from(data.keyBase64, "base64"));

    const info = parseCer(cerDer);
    // Valida contraseña abriendo la key. No la guardamos.
    loadPrivateKey(keyDer, data.passphrase);

    const now = new Date();
    if (info.validFrom > now) throw new Error(`CSD aún no vigente (inicia ${info.validFrom.toISOString().slice(0, 10)})`);
    if (info.validTo < now) throw new Error(`CSD vencido el ${info.validTo.toISOString().slice(0, 10)}`);

    // Sube archivos al bucket privado csd/{empresaId}/csd.cer / csd.key
    const cerPath = `${data.empresaId}/csd.cer`;
    const keyPath = `${data.empresaId}/csd.key`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const up1 = await supabaseAdmin.storage.from("csd").upload(cerPath, cerDer, {
      contentType: "application/x-x509-ca-cert", upsert: true,
    });
    if (up1.error) throw new Error(`Subir .cer: ${up1.error.message}`);
    const up2 = await supabaseAdmin.storage.from("csd").upload(keyPath, keyDer, {
      contentType: "application/octet-stream", upsert: true,
    });
    if (up2.error) throw new Error(`Subir .key: ${up2.error.message}`);

    // Desactiva CSDs previos e inserta el nuevo como activo
    // (tabla restringida a admin por RLS; el rol ya fue validado arriba)
    await supabaseAdmin.from("empresa_csd" as any).update({ is_active: false }).eq("empresa_id", data.empresaId).eq("is_active", true);

    const { error: insErr } = await supabaseAdmin.from("empresa_csd" as any).insert({
      empresa_id: data.empresaId,
      rfc: info.rfc,
      no_certificado: info.noCertificado,
      cer_path: cerPath,
      key_path: keyPath,
      cer_pem: info.cerBase64,
      valid_from: info.validFrom.toISOString(),
      valid_to: info.validTo.toISOString(),
      tipo: "CSD",
      is_active: true,
      uploaded_by: userId,
    });
    if (insErr) throw new Error(insErr.message);

    return {
      ok: true,
      rfc: info.rfc,
      noCertificado: info.noCertificado,
      validFrom: info.validFrom.toISOString(),
      validTo: info.validTo.toISOString(),
    };
  });

export const getCsdInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => getInfoInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdminOrConta(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("empresa_csd" as any)
      .select("rfc, no_certificado, valid_from, valid_to, created_at")
      .eq("empresa_id", data.empresaId)
      .eq("is_active", true)
      .maybeSingle();
    return row as { rfc: string; no_certificado: string; valid_from: string; valid_to: string; created_at: string } | null;
  });

export const deleteCsd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => getInfoInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdminOrConta(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.storage.from("csd").remove([`${data.empresaId}/csd.cer`, `${data.empresaId}/csd.key`]);
    await supabaseAdmin.from("empresa_csd" as any).delete().eq("empresa_id", data.empresaId);
    return { ok: true };
  });

/**
 * Firma un XML de contabilidad electrónica con el CSD activo de la empresa.
 * Recibe la contraseña en cada llamada (no se persiste).
 */
export const signContabilidadXml = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => signInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdminOrConta(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: csd, error } = await supabaseAdmin
      .from("empresa_csd" as any)
      .select("cer_path, key_path, cer_pem, no_certificado, valid_from, valid_to")
      .eq("empresa_id", data.empresaId)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!csd) throw new Error("La empresa no tiene un CSD activo. Súbelo antes de sellar.");

    const rec = csd as any;
    const now = new Date();
    if (new Date(rec.valid_to) < now) throw new Error("El CSD activo está vencido");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [cerDl, keyDl] = await Promise.all([
      supabaseAdmin.storage.from("csd").download(rec.cer_path),
      supabaseAdmin.storage.from("csd").download(rec.key_path),
    ]);
    if (cerDl.error || !cerDl.data) throw new Error(`No se pudo leer el .cer: ${cerDl.error?.message}`);
    if (keyDl.error || !keyDl.data) throw new Error(`No se pudo leer el .key: ${keyDl.error?.message}`);

    const cerDer = new Uint8Array(await cerDl.data.arrayBuffer());
    const keyDer = new Uint8Array(await keyDl.data.arrayBuffer());

    const { parseCer, loadPrivateKey, signXml } = await import("./csd-signer.server");
    const cerInfo = parseCer(cerDer);
    const priv = loadPrivateKey(keyDer, data.passphrase);
    const signed = signXml(data.xml, cerInfo, priv);

    return { xml: signed, noCertificado: cerInfo.noCertificado };
  });
