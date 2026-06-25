## Goal

1. Add an Excel import CTA in **Listas de Precios** that, in one upload, creates/updates all price lists (Base, 2, 3, 4, 5, 6) plus their per‑product prices, matching products by SKU.
2. Inside each product (Product360 + edit dialog), show the price each client/list pays.
3. In **Catálogo / Productos**, rename the visible label **Marca → Clase** (UI only — DB column `marca` stays).

## The Excel (cat completo producto 25 jun)
Single sheet, 1,179 rows. Relevant columns:
- `Nombre` → SKU (matches `productos.sku`)
- `Nombre para mostrar`, `Clase`, `Línea`, `Grupo`, `Tipo de producto`, `Tipo`
- `Precio base` → Lista **Base / Catálogo**
- `2`, `3`, `4`, `5`, `6` → Listas **L2 … L6**
- `SAT Clave Producto Servicio`, SuiteTax code

Treat any cell that is empty, `NaN`, or `0` as "no price for this product in this list" (skip the upsert; don't write a zero).

## Implementation

### A. New `PriceListsImportDialog.tsx` (mirrors clients/inventory importers)
Location: `src/components/pricelists/PriceListsImportDialog.tsx`.

Flow:
1. User uploads `.xlsx`. Parse with `xlsx`, auto-detect header row.
2. AI column-mapping step (Lovable AI Gateway, `google/gemini-3-flash-preview`) — same pattern as inventory importer — to handle slight header variations (`Precio base` vs `Base`, list numbers as text vs number, etc.) and identify which numeric columns are price lists.
3. Preview table: rows × lists with counts (e.g. "1,152 precios para Lista 2", "234 para Lista 6"), unmatched SKUs flagged.
4. On **Aplicar**:
   - For each list column found, `upsert` into `price_lists` by name (`Base`, `Lista 2`, `Lista 3`, `Lista 4`, `Lista 5`, `Lista 6`) with `markup_pct = null` (manual override list) — keep existing rows if they already exist.
   - Look up `productos.id` by `sku` in one batched query; build SKU→id map. Unmatched SKUs surface in the report; nothing else fails.
   - For `Precio base`: update `productos.sale_price_with_iva` (and `precio_base` if present) on the matched product.
   - For each `L2…L6` with a positive price: `upsert` `price_list_items {price_list_id, product_id, price_with_iva, manual_override: true}` (unique on `price_list_id+product_id`).
   - Also enrich the product row with `clase` / `línea` / `grupo` / `tipo` if the corresponding columns exist in `productos` (read schema; only update columns that exist — fall back to no-op otherwise).
5. Toast with summary: `X listas, Y precios actualizados, Z SKUs sin coincidencia`.

CTA: an **Importar Excel** button beside `Nueva lista` on `pricelists-page.tsx`.

### B. Show all client/list prices inside a product
- Extend `Product360Drawer.tsx` with a new section **"Precios por lista / cliente"**:
  - Query `price_lists` + `price_list_items` filtered by `product_id` → render rows `Lista · Precio con IVA · Δ vs Catálogo`.
  - Query `client_price_overrides` joined with `clientes` filtered by `product_id` → render rows `Cliente · Precio override · Δ vs Catálogo`, clickable to open the client.
- Mirror the same section in the **edit product dialog** in `admin.productos.tsx` (read-only list; editing prices stays in Listas de Precios / Cliente).

### C. Rename Marca → Clase in Catálogo / Productos UI only
In `src/routes/admin.productos.tsx`:
- All visible strings `"Marca"` → `"Clase"`, `"marca"` → `"clase"`, `"Todas las marcas"` → `"Todas las clases"`, `"Distribución por marca"` → `"Distribución por clase"`, etc.
- Search placeholder: `"Buscar por clave, nombre o clase…"`.
- Keep the JS state names (`marcaFilter`, `porMarca`) and the DB field `p.marca` — only labels change.
- Also update the same label in `src/components/catalogo-page.tsx` if it surfaces "Marca".

## Files

- `src/components/pricelists/PriceListsImportDialog.tsx` (new)
- `src/components/pricelists-page.tsx` (CTA button)
- `src/components/Product360Drawer.tsx` (new "Precios por lista / cliente" block)
- `src/routes/admin.productos.tsx` (label rename + same prices block in edit dialog)
- `src/components/catalogo-page.tsx` (label rename if needed)

No DB migration required: `price_lists`, `price_list_items`, `client_price_overrides`, and `productos.sku` already exist.

## Out of scope

- Client matching for the price list (this Excel is product‑indexed, not client‑indexed; client‑specific prices keep flowing through `client_price_overrides` / `precios_cliente`).
- Touching the `marca` DB column or other modules that read it.
