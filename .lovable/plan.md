# Backfill 2026 Sales History → Pedidos + Facturas

Convert the NetSuite export `IMVVENTASDESGLOSADAS558-2.xls` (25,475 invoices, 62,018 line items, Jan–Jul 2026) into transactional records so all the AI/intelligence features have real 2026 history to work with.

## What gets created

Per unique `Número de documento` (INV…) in the file:
- **1 pedido** — status `entregado`, folio = `INV#####`, one item per line
- **1 factura** — status `pagada`, folio matches, `pagado = total`, `saldo = 0`, linked to the pedido
- **N pedido_items + factura_items** — one per row, snapshotting product name/sku/unit

Per file (in addition):
- **sales_history** rows for every line, tagged with a shared `import_batch_id`

All records land in the single existing empresa (`IMV`, id `1e977bb2-…`).

## Money handling

- Line `precio_unitario = ingresos_totales / cantidad`
- `iva_pct = 0`, `ieps_pct = 0`
- Pedido/factura `subtotal = total = SUM(line revenue)`, `iva = 0`
- Lines with `ingresos_totales ≈ 0` (bonificaciones — hundreds in the file, e.g. `0.01`) are kept as-is so unit history is preserved.

## Reference resolution (auto-create stubs when missing)

- **Cliente**: file has `"1471 NANCY M YAÑEZ SILVA"`. Strip leading numeric ID, match by exact `razon_social`, then case-insensitive. Missing → insert stub client with `razon_social = <clean name>`, `nickname = <netsuite id>`, `client_type = 'menudeo'`, `active = true`.
- **Producto**: match by `sku` (exact). Missing → insert stub with `sku`, `nombre = descripción`, `unidad = 'PZA'`, `precio_base = precio_unitario`, `activo = true` (fill required fields with sensible defaults; empresa scoped).
- **Representante**: match by `nombre` (exact, then case-insensitive). Missing → insert stub with `nombre`, `activo = true`, `comision_default_pct = 0`.
- Assign `pedido.representante_id` = rep from the first line of that invoice; also set `factura.representante_id`.

Resolution runs once up front, building three in-memory maps, so lookups during import are O(1).

## Server function + migration

New migration `db/migrations/0025_backfill_2026_helpers.sql`:
- `ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS backfill_source text` (nullable; tag = `'netsuite_2026'` so we can find/undo the batch cleanly).
- Same on `facturas`.
- Indexes on `pedidos(folio)` and `facturas(folio)` (unique-if-null-safe partial) to make idempotent upserts fast.

New server function file `src/lib/backfill-sales.functions.ts`:
- `backfillNetsuiteSales2026Fn` (`.middleware([requireSupabaseAuth])`, admin-role checked via `has_role`) — accepts `{ rows: [...] }` chunks and does the resolve → insert work using `supabaseAdmin` (loaded inside the handler).
- Uses transactions per invoice; on failure of one invoice, logs and continues.
- Idempotent: `ON CONFLICT (folio)` update-nothing so re-runs skip already-imported invoices.

## Admin UI to run the backfill

New route/page: **`/admin/onboarding` → "Backfill ventas 2026" card** (or a new dedicated route `/admin/backfill-ventas` — matches existing sidebar pattern).
- File upload (accepts `.xls`/`.xlsx`) using the same parser style as `sales-history-import.ts` but with streaming/chunked processing (file is 42 MB, 62k rows).
- Parses in the browser (SheetJS), then POSTs chunks of ~500 rows at a time to the server function with a progress bar.
- Also runs the existing `importSalesHistory` in parallel so `sales_history` gets populated with the same batch id.
- Shows counters: parsed / created pedidos / created facturas / created client stubs / created product stubs / created rep stubs / duplicated (skipped) / errors.

## Safety / rollback

- Everything created is tagged `backfill_source = 'netsuite_2026'` → one SQL `DELETE` removes the entire batch if needed.
- Stubs created for missing clients/products/reps get `notas = 'Auto-creado backfill NetSuite 2026-…'` so they're easy to spot and enrich later.
- The importer is idempotent; running it twice does nothing on the second run.

## Technical notes

- File format is **SpreadsheetML 2003 XML** disguised as `.xls`. SheetJS reads it fine (`XLSX.read(..., { type: "array" })`), same as the existing `sales-history-import.ts` path.
- 62k rows / ~25k pedidos: chunking + server-side batched inserts keeps this ~2–4 minutes.
- No CFDI is generated (no Facturapi call) — these are historical records marked as issued/paid.
