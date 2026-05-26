// @ts-nocheck
/**
 * Loads a remote image into a base64 data URL using a two-strategy
 * approach. Returns null on any failure so callers can keep rendering
 * with a placeholder.
 *
 * Why two strategies:
 *  1. <img crossOrigin> + canvas — succeeds whenever the host (e.g.
 *     Supabase storage public bucket) allows anonymous CORS-tainted
 *     reads. Image elements have looser cross-origin rules than fetch
 *     so this path survives most "fetch is blocked" cases.
 *  2. fetch() with CORS mode — fallback if (1) fails (typically when
 *     the host returns no `Access-Control-Allow-Origin` header on
 *     image requests but does on direct fetches).
 *
 * Used by anything that needs to embed product thumbnails into a
 * snapshot or PDF where lazy network loads aren't reliable
 * (html2canvas, jsPDF, etc.).
 */

export async function loadImageAsDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  // Strategy 1: <img crossorigin> + canvas re-encode.
  //
  // We re-encode as PNG (not JPEG) to preserve alpha. JPEG flattens
  // transparent pixels to BLACK by default, which is why product
  // thumbnails with transparent backgrounds were rendering as dark
  // squares in every snapshot/comprobante export — even though the
  // same images render fine in the live catalog. PNG keeps the
  // transparency intact so the wrapper background (theme-aware white
  // or dark) shows through correctly when the snapshot is rasterized.
  const fromImg = await new Promise<string | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
  if (fromImg) return fromImg;
  // Strategy 2: fetch + FileReader.
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

/**
 * Convenience: same as loadImageAsDataUrl but also returns the format
 * tag jsPDF needs (`"JPEG" | "PNG"`). The canvas path always re-encodes
 * to JPEG, so it returns "JPEG" in all cases except when fetch is used
 * to embed a non-PNG/JPEG blob (rare for product photos).
 */
export async function loadImageForJsPdf(
  url: string | null | undefined,
): Promise<{ dataUrl: string; format: "JPEG" | "PNG" } | null> {
  // Strategy 1: <img>+canvas → PNG so transparency survives. (JPEG would
  // flatten alpha to black, same bug as loadImageAsDataUrl above.)
  const fromImg = await new Promise<string | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    if (!url) return resolve(null);
    img.src = url;
  });
  if (fromImg) return { dataUrl: fromImg, format: "PNG" };

  // Strategy 2: fetch.
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const format: "JPEG" | "PNG" = blob.type.includes("png") ? "PNG" : "JPEG";
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return { dataUrl, format };
  } catch {
    return null;
  }
}
