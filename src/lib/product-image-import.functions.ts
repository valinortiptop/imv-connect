/**
 * Bulk-import product images from a public OneDrive folder share.
 * Filenames (without extension) are matched against productos.sku
 * (exact, then a normalized fallback that strips spaces/dashes/leading
 * zeros and uppercases). Images are uploaded to the public `productos`
 * storage bucket and productos.imagen_url is overwritten.
 *
 * The handler processes one page (up to ~50 files) per invocation and
 * returns a nextLink so the client can loop until the folder is
 * exhausted — keeps each call well under the Worker timeout for large
 * folders with hundreds of images.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

function b64urlEncode(s: string): string {
  // btoa is available in the Worker runtime
  // eslint-disable-next-line no-undef
  const b64 = btoa(unescape(encodeURIComponent(s)));
  return b64.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function normalizeCode(s: string): string {
  return s
    .toUpperCase()
    .replace(/\.[A-Z0-9]+$/i, "")
    .replace(/[\s\-_]/g, "")
    .replace(/^0+/, "");
}

function extOf(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "jpg";
}

type DriveItem = {
  id: string;
  name: string;
  file?: { mimeType?: string };
  size?: number;
  "@microsoft.graph.downloadUrl"?: string;
};

type Input = { shareUrl: string; nextLink?: string };

export const importProductImagesFromOneDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Input) => {
    if (!input?.shareUrl || typeof input.shareUrl !== "string") {
      throw new Error("shareUrl es requerido");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    // admin only
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Requiere rol admin");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Resolve the OneDrive shared folder via the public shares API
    const listUrl =
      data.nextLink ??
      `https://api.onedrive.com/v1.0/shares/u!${b64urlEncode(
        data.shareUrl,
      )}/root/children?$top=50&$select=id,name,file,size,@microsoft.graph.downloadUrl`;

    const listRes = await fetch(listUrl, { headers: { accept: "application/json" } });
    if (!listRes.ok) {
      const body = await listRes.text();
      throw new Error(`OneDrive list falló (${listRes.status}): ${body.slice(0, 300)}`);
    }
    const listJson = (await listRes.json()) as {
      value: DriveItem[];
      "@odata.nextLink"?: string;
    };

    const files = (listJson.value ?? []).filter(
      (it) => it.file && IMAGE_EXT.has(extOf(it.name)),
    );

    // Preload all sku → id mappings once per page
    const skus = new Set<string>();
    for (const f of files) skus.add(f.name.replace(/\.[^.]+$/, ""));

    const { data: productsAll, error: prodErr } = await supabaseAdmin
      .from("productos")
      .select("id, sku")
      .not("sku", "is", null);
    if (prodErr) throw new Error(prodErr.message);

    const bySku = new Map<string, string>();
    const byNorm = new Map<string, string>();
    for (const p of productsAll ?? []) {
      if (!p.sku) continue;
      bySku.set(p.sku, p.id);
      byNorm.set(normalizeCode(p.sku), p.id);
    }

    const updated: string[] = [];
    const unmatched: string[] = [];
    const errors: { file: string; reason: string }[] = [];

    async function processOne(item: DriveItem) {
      const codeRaw = item.name.replace(/\.[^.]+$/, "");
      const productId = bySku.get(codeRaw) ?? byNorm.get(normalizeCode(codeRaw));
      if (!productId) {
        unmatched.push(item.name);
        return;
      }
      const downloadUrl = item["@microsoft.graph.downloadUrl"];
      if (!downloadUrl) {
        errors.push({ file: item.name, reason: "sin downloadUrl" });
        return;
      }
      try {
        const dl = await fetch(downloadUrl);
        if (!dl.ok) {
          errors.push({ file: item.name, reason: `download ${dl.status}` });
          return;
        }
        const bytes = new Uint8Array(await dl.arrayBuffer());
        const ext = extOf(item.name);
        const contentType =
          ext === "png"
            ? "image/png"
            : ext === "webp"
              ? "image/webp"
              : ext === "gif"
                ? "image/gif"
                : "image/jpeg";
        const path = `imports/${productId}.${ext}`;
        const { error: upErr } = await supabaseAdmin.storage
          .from("productos")
          .upload(path, bytes, { contentType, upsert: true });
        if (upErr) {
          errors.push({ file: item.name, reason: `upload: ${upErr.message}` });
          return;
        }
        const publicUrl = supabaseAdmin.storage.from("productos").getPublicUrl(path)
          .data.publicUrl;
        // cache-bust so the browser picks the new image immediately
        const url = `${publicUrl}?v=${Date.now()}`;
        const { error: updErr } = await supabaseAdmin
          .from("productos")
          .update({ imagen_url: url })
          .eq("id", productId);
        if (updErr) {
          errors.push({ file: item.name, reason: `db: ${updErr.message}` });
          return;
        }
        updated.push(item.name);
      } catch (e) {
        errors.push({ file: item.name, reason: (e as Error).message });
      }
    }

    // small concurrency pool
    const POOL = 5;
    let cursor = 0;
    async function worker() {
      while (cursor < files.length) {
        const i = cursor++;
        await processOne(files[i]);
      }
    }
    await Promise.all(Array.from({ length: POOL }, worker));

    return {
      processed: files.length,
      updated: updated.length,
      unmatched,
      errors,
      nextLink: listJson["@odata.nextLink"] ?? null,
    };
  });
