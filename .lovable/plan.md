## What I found

- The published catalog bundle already includes the latest import changes: IVA/IEPS validation, observations, and the merged “Importar imágenes” CTA.
- The published order detail bundle includes “No timbrada” and “Timbrar con Facturapi”. The factura list route to check is `/admin/facturas`, not `/admin/facturacion`.
- The `get_my_role` migration exists in the codebase and generated Supabase types now include it, so the 404 should be resolved after a hard refresh / new deployment cache.
- The save error in your screenshot is real and clear: `productos.iva_pct` is `NOT NULL`, and at least one imported row is still reaching save with `iva_pct = null`.

## Plan

1. **Fix the catalog import save guard**
   - Treat both `null` and invalid numeric IVA values as blocking errors.
   - Mark rows with missing IVA as `error` in the preview so they cannot be included in the “Aplicar” save set.
   - Show the exact rows/SKUs/names that are missing IVA before save, instead of only a toast.

2. **Make NetSuite tax detection stricter**
   - Expand tax column detection for NetSuite imports so IVA/IEPS are extracted from all likely tax-code headers.
   - If a new product has no detectable IVA, keep it visible in preview but mark it as an error row.

3. **Make insert payload database-safe**
   - Before inserting, coerce `iva_pct` and `ieps_pct` to valid numbers only.
   - Never send `iva_pct: null` to Supabase.
   - If a row somehow reaches payload building without valid IVA, skip it and add a row-level failure message.

4. **Improve published-change visibility diagnosis**
   - Add a tiny visible build/version marker in the admin footer or sidebar so you can tell whether the browser is showing the latest deployment.
   - Keep this unobtrusive, but useful for debugging “published but I don’t see it” issues.

5. **Validate after implementation**
   - Check the edited save path in source.
   - Confirm the final logic cannot produce an insert payload with `iva_pct: null`.
   - Report back that the remaining published-site issue is likely browser cache/open-tab stale bundle if the live asset contains the strings but your tab does not.