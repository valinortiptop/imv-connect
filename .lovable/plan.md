## Why they still show as INV…

The rename I ran only changed the `folio` column. The orders list doesn't read `folio` — it reads the `orders` view, which shows `COALESCE(order_code, folio)`. All 17,203 NetSuite orders still have `order_code` = `INV139933`, so that value wins and the old name is still displayed.

Verified:
- `pedidos.folio` → 17,203 rows already renamed to `NETSUITE-…`
- `pedidos.order_code` → 17,203 rows still `INV…`
- `orders` view definition prefers `order_code`

## Fix

One data update: set `order_code = 'NETSUITE-' || <number>` for every order whose `order_code` matches `INV<digits>`, so both columns agree and the table shows `NETSUITE-139933`.

No code changes needed; the list, detail view, PDFs and search all read the same field.

## Verification

Re-query the counts (expect 0 remaining `INV%` in `order_code`) and confirm the Pedidos page shows `NETSUITE-139933` after a refresh.
