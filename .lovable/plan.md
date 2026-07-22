## What I found

Database check (just now):

- `pedidos` total: **7**, tagged `netsuite_2026`: **0**
- `facturas` total: **2**, tagged `netsuite_2026`: **0**
- `pedido_items` from backfill: **0**
- 0 clientes, 0 representantes, 0 items impacted

The backfill code is in place (`src/lib/backfill-sales.functions.ts`, `src/routes/admin.backfill-ventas.tsx`, `src/components/backfill-ventas-page.tsx`), but **it was never actually executed** against the NetSuite file — nothing was inserted. The listing pages (Pedidos, Ventas, Cliente 360) are showing all the data they have; there is just no 2026 history to show.

The source file `IMVVENTASDESGLOSADAS558-2.xls` (~42 MB) is still available in uploads.

## Plan

1. **Run the backfill end-to-end** using the existing `backfillNetsuiteSales2026Fn`, but drive it from the server so we don't depend on the browser processing a 42 MB file in chunks:
   - Parse `/mnt/user-uploads/IMVVENTASDESGLOSADAS558-2.xls` on the server (SheetJS, same parser as the UI).
   - Call the existing chunked function in batches of 100 invoices and aggregate the counters.
   - Expose it as an admin-only server function + a small "Run backfill from uploaded file" button on `/admin/backfill-ventas` so re-runs are one click.
2. **Verify after the run**, in the same turn:
   - `count(*)` of pedidos / facturas / pedido_items / factura_items tagged `netsuite_2026`
   - Distinct clientes and representantes impacted
   - Date range of imported invoices
   - Spot-check one imported pedido: cliente resolved, items present, factura linked, `estado = entregado`, factura `pagada`
3. **Confirm the listing pages actually surface it** (they should — none of them filter on `backfill_source`, and admin scope is not restricted):
   - `/admin/pedidos` — check total and date filter defaults (current view is "Jul 26"; backfill dates cover Jan–Jul so results will appear once the range is widened, worth confirming).
   - `/admin/facturas` (Facturación) — confirm backfilled facturas show up under "Todas".
   - Cliente 360 for one backfilled client — confirm pedidos/facturas history appears.
   - `sales_history` view/page — confirm counts.
4. **If something is being filtered out**, fix only the offending list/filter (e.g. default date range too narrow, or a scope filter excluding rows without a `representante_id`). No schema changes expected.

## Technical notes

- `pedidos.backfill_source` and `facturas.backfill_source` already exist; nothing new to migrate.
- `backfillNetsuiteSales2026Fn` uses `supabaseAdmin` and is idempotent per `folio` / `invoice_no`, so re-running is safe — `skipped_existing` will just grow.
- Server-side XLSX parse must be inside the handler (Worker runtime): use `XLSX.read` from `xlsx`, which is pure JS and Worker-safe.
- Missing clientes/productos/reps are created as stubs (already implemented) — after the run, we should surface a short report of how many stubs were created so you can decide whether to reconcile them.

## Question before I build

Do you want me to:

- **(A)** run the backfill server-side against the already-uploaded `IMVVENTASDESGLOSADAS558-2.xls` right now, or
- **(B)** first debug the existing UI (`/admin/backfill-ventas`) to find out why your previous upload didn't insert anything (e.g. it errored partway, you didn't click Run, etc.)?

I recommend **A** — it's faster and gives us verified data to check the listings against. Confirm and I'll switch to build mode.