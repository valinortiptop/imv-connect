# Fix Timbrar (Facturapi) failing silently

## Root cause

The console shows the actual error:

```
column clientes_1.address does not exist
```

In `src/lib/facturapi.functions.ts` (`stampInvoiceFn`), the nested select on the client is:

```
cliente:clientes(id, razon_social, nombre_comercial, rfc, email,
                 regimen_fiscal, uso_cfdi_default, codigo_postal,
                 address, direccion, facturapi_id)
```

The `clientes` table has `direccion` but no `address` column — `address` only exists on the `clients` view (overlay). PostgREST rejects the whole query with 400, so `stampFn` throws before anything happens on screen. On the "Timbrar" row button we now show a toast, but from the pedido detail dropdown ("Timbrar con Facturapi") the mutation error currently isn't surfaced clearly, which is why "nothing happens".

Facturapi itself only needs the fiscal ZIP, not the street address, so we don't need to add address handling — we just need to stop selecting a column that doesn't exist.

## Change

**File:** `src/lib/facturapi.functions.ts` — `stampInvoiceFn` handler

- Drop `address` from the `cliente:clientes(...)` select list. Keep `direccion` (already selected and unused for Facturapi; harmless).
- No other logic changes; the rest of the payload building already uses `codigo_postal` for the fiscal address, which is what Facturapi requires.

## Verification

1. Open a pedido with a factura and click "Timbrar" (both from the Facturación list row and from the pedido detail dropdown).
2. Expect either a success toast ("CFDI timbrado" with UUID) or a specific Facturapi error toast — never a silent no-op.
3. Confirm no `column clientes_1.address does not exist` in the console.

## Out of scope

- The unrelated `[auth] role fetch error: ... "admin" is not valid JSON` warning (separate issue, does not block timbrar).
- The 400 PATCH to `clientes` visible in image 157 (client edit save) — track separately if it still repros after this fix.
