## Problem

The "Resumen de importación" shows **62,010 insertadas** (correct) but the "Lotes importados" table shows **1,000 filas** for the same batch. All 62,010 rows were actually imported — only the display count is wrong.

## Root Cause

`listSalesHistoryBatches` in `src/lib/sales-history-import.ts` counts rows by fetching every `sales_history` row for the empresa and grouping them in JS:

```ts
supabase.from("sales_history").select("import_batch_id, source, created_at, empresa_id").limit(20000)
```

PostgREST enforces a server-side `max-rows` cap (1000 in this project), so the client-side `.limit(20000)` is silently clamped to 1000 rows. The batch then reports `rows: 1000` regardless of the real count.

## Fix

Replace the row-fetch-and-count approach with an aggregated count per batch. Two options — plan uses option A:

**A. Per-batch HEAD count (simple, no migration).** Rewrite `listSalesHistoryBatches` to:
1. Fetch distinct `import_batch_id` + `source` + min/max `created_at` using a small paginated scan of a lightweight projection (still capped, but we only need the batch IDs, not the row totals).
2. For each batch id, run `supabase.from("sales_history").select("*", { count: "exact", head: true }).eq("import_batch_id", id)` which returns just the count without pulling rows and is not subject to `max-rows`.
3. Return `{ batch_id, source, first, last, rows: count }`.

Since batches are few (a handful per empresa), the N small count queries are cheap.

**B. Alternative (only if A is too slow later):** create a `v_sales_history_batches` SQL view with `GROUP BY import_batch_id` and grant `SELECT` — one query, exact counts. Not needed for current volume.

## Files

- `src/lib/sales-history-import.ts` — rewrite `listSalesHistoryBatches` per option A. No other changes.

## Verification

After the fix, re-open the import dialog: the existing batch should show **62,010 filas** instead of 1,000, and future imports display the true count.
