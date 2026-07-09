
## Goal

Make the Excel catalog import truly AI-driven: the AI maps every incoming column to the existing catalog schema (including `iva_pct` / `ieps_pct`), flags rows it can't confidently map, and the save step never silently defaults critical tax fields. Errors are surfaced per row before insert.

## Changes

### 1. Expand the AI mapping prompt (`ImportExcelDialog.parseFile`)

In `src/routes/admin.productos.tsx` (~line 2145), extend the system prompt so the AI must return, per row:

- Existing canonical fields (sku, nombre, marca, proveedor, peso_kg, precio_lista, sat_clave, laboratorio) — unchanged.
- **`iva_pct`** (number: 0, 8, or 16) and **`ieps_pct`** (number: 0, 6, 7, 8, …) parsed from any tax column — not just the raw `tax_code` string. The AI must inspect columns like "IVA", "IEPS", "Impuesto", "Tax", "Grupo de impuestos", "% IVA", etc., not only `ITEM IVA X%` strings.
- **`confidence`**: `"high" | "medium" | "low"` per row.
- **`issues`**: array of strings describing anything the AI could not map (e.g. `"no se detectó IVA"`, `"columna 'Categoría' sin campo destino"`).
- **`extra_fields`**: object with any source columns that don't fit the canonical schema, so we can report them.

Send the actual column headers + a larger sample (already 800 rows) and keep temperature 0.

### 2. Row-level validation before save

Right after the AI response is normalized into `ImportRow[]`:

- If `iva_pct` is `null` after AI parsing AND the row has no tax-related source column value at all → mark row `status: "error"` with `errorMsg: "Fila N: IVA no detectado — corrige la columna de impuestos o edita manualmente"`.
- Same treatment for `ieps_pct` only when the source clearly has an IEPS column but the AI couldn't parse it (missing IEPS defaults to 0 silently is OK — that's the real-world default).
- Collect all rows with `issues` from the AI and expose them in the preview table via a new "Observaciones" column and a summary banner.

### 3. Remove silent defaults in `save()`

In the insert payload (~lines 2318–2332):

- Stop coercing `iva_pct` to `16` and `ieps_pct` to `0` unconditionally.
- Instead: block save if any `status === "new"` row still has `iva_pct == null`. Show a toast and highlight offending rows.
- Only rows that pass validation are sent to Supabase. Batch size stays at 500; because every row now guarantees a non-null `iva_pct`, PostgREST won't emit `NULL` columns across the batch.

Update the update path (~lines 2360–2362) the same way: if the diff flagged `iva`/`ieps` but the value is null, mark the row as error rather than skipping.

### 4. Surface AI/DB errors instead of swallowing them

- In `parseFile`, when the AI call fails (`aiChatFn` throws or returns non-JSON), show `toast.error("La IA no pudo mapear el archivo: <mensaje>")` and fall back to the heuristic only for recognised NetSuite headers. For unknown layouts, keep the rows but mark all as `status: "error"` so nothing is imported silently.
- In `save`, replace the single top-level `catch` with per-batch error handling that logs the offending rows and keeps a `failedRows[]` array; final toast reports `X insertados · Y fallidos` with a "Ver detalles" action opening a small dialog listing the failures.

### 5. Optional schema extension for unmapped fields

Only if the AI consistently reports the same `extra_fields` key across ≥ 20% of rows (e.g. `categoria`, `presentacion`, `unidad`):

- Prompt the user in the preview dialog: *"La IA detectó campos nuevos que no existen en el catálogo: `categoria`, `presentacion`. ¿Deseas crearlos como columnas?"*
- On confirm, run a `supabase--migration` adding nullable `text` columns to `public.productos` with proper GRANTs preserved (table already has RLS). The migration only runs after user approval, so nothing schema-changing happens implicitly.

If the user declines, the extra fields are stored in the row's `errorMsg`/observations for reference and not persisted.

## Files touched

- `src/routes/admin.productos.tsx` — prompt, parsing, validation, save, preview UI (new "Observaciones" column + failures dialog).
- Optional migration (only on user confirm in step 5) adding nullable text columns to `public.productos`.

## Non-goals

- No changes to the images import, NetSuite heuristic path, or other pages.
- No change to the existing 500-batch insert strategy — only what goes into each row.
