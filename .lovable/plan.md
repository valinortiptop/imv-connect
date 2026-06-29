# Plan: Import product images from OneDrive into `productos` bucket

## Prerequisite (user action)
- Set the OneDrive share link to **"Anyone with the link can view"** so the server can list and download anonymously via the public Graph API (`https://api.onedrive.com/v1.0/shares/u!{base64url}/root/children`).

## Steps

1. **Server function `importProductImagesFromOneDrive`** (admin-only, in `src/lib/product-image-import.functions.ts`):
   - Input: `{ shareUrl: string }`.
   - Guard: `requireSupabaseAuth` + `has_role(admin)`.
   - List children of the shared folder via OneDrive public shares API, paginating `@odata.nextLink`. Only keep image files (jpg/jpeg/png/webp).
   - For each file:
     - Derive code = filename without extension.
     - Match product: first `products.sku == code` (or `productos.sku`), then `products.clave == code`. Normalize as fallback (uppercase, trim, strip leading zeros, remove spaces/dashes).
     - Stream-download via `@microsoft.graph.downloadUrl`.
     - Upload to `productos` bucket at `catalog/{productId}/{code}.{ext}` with `upsert: true` using `supabaseAdmin`.
     - Get public URL and `UPDATE products SET image_url = ...` (overwrite all).
   - Return `{ matched, updated, skipped: [{filename, reason}], unmatched: [...] }`.
   - Process in batches of ~10 concurrent downloads to avoid Worker timeout; if folder is large, support resuming via `?skipToken` continuation passed back from client.

2. **Admin UI dialog** in `src/routes/admin.productos.tsx` (next to existing Importar Excel CTA): "Importar imágenes desde OneDrive"
   - Input field for share URL (prefilled with the user's link).
   - Button "Iniciar importación" → calls server fn (loops continuations until done).
   - Live progress: matched / updated / unmatched counts.
   - Final report with downloadable CSV of unmatched filenames.

3. **Verification**: after run, re-query products and show count of products now with `image_url`. Spot-check a few via `Product360Drawer`.

## Technical notes
- Bucket `productos` is already public — no policy changes needed.
- No DB migration required (uses existing `products.image_url`).
- OneDrive public shares API encoding: `u!` + base64url(shareUrl) (RFC 4648 §5, strip `=` padding).
- Overwrite policy: existing `image_url` values are replaced.
- All work stays server-side; service-role client only loaded inside handler.
