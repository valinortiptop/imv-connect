# Plan: Fix facturas 400 + Facturapi integration

## 1. Fix `admin/contabilidad/facturas` 400 error

**Root cause:** The query embeds `clientes(razon_social, nombre_comercial)` via PostgREST, but `facturas.cliente_id` has **no foreign key** to `public.clientes`. Without an FK, PostgREST can't resolve the relationship and returns 400 (Bad Request) — this is why every request loops with 400.

**Fix (migration):** add the missing FK:
```sql
ALTER TABLE public.facturas
  ADD CONSTRAINT facturas_cliente_id_fkey
  FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE SET NULL;
```
(Also add FKs for `pedido_id`, `representante_id`, `empresa_id`, `poliza_id` if missing, so future embeds work.)

No code change needed in the page — the existing `.select("...clientes(...)")` will just start working.

## 2. Facturapi integration (timbrado CFDI 4.0)

Facturapi wraps SAT PACs so we call a single REST API for stamping, cancelling, sending, and downloading CFDIs. Docs: https://docs.facturapi.io/api/

### 2.1 Secrets & config
- Add secret `FACTURAPI_KEY` (live secret key, `sk_live_...` or `sk_test_...`) via `add_secret`. It's per-organization in Facturapi, so we store it per empresa if the user runs multiple RFCs — start with a single project-level key and extend later if needed.
- Optional: `FACTURAPI_TEST_KEY` for a sandbox toggle.

### 2.2 Server-side wrapper — `src/lib/facturapi.server.ts`
Thin fetch client for `https://www.facturapi.io/v2/*` with Bearer auth. Covers:
- `customers` — create/find/update (mirror our `clientes` on demand)
- `products` — create/find (mirror our `productos`)
- `invoices` — create (stamp), retrieve, cancel, send by email, download PDF/XML/ZIP
- `catalogs` — SAT product/unit/tax catalogs for pickers

### 2.3 Server functions — `src/lib/facturapi.functions.ts`
`createServerFn` endpoints called from the UI. All protected with `requireSupabaseAuth`:
- `stampInvoiceFn({ facturaId })` — reads our `facturas` + `factura_items` + cliente, builds Facturapi payload (CFDI 4.0: `use`, `payment_form`, `payment_method`, `items[].product` with `sat_key`, `unit_key`, `price`, taxes), calls Facturapi, stores response fields (`uuid`, `folio_fiscal`, `serie`, `folio`, `xml_url`, `pdf_url`, `facturapi_id`, `status`) back onto `facturas`.
- `cancelInvoiceFn({ facturaId, motivo })` — cancellation with SAT motivo (01/02/03/04).
- `downloadInvoiceFn({ facturaId, format: 'pdf'|'xml'|'zip' })` — proxies download.
- `sendInvoiceEmailFn({ facturaId, email? })`.
- `syncCustomerFn({ clienteId })` / `syncProductFn({ productoId })` — upsert into Facturapi and cache the `facturapi_id`.
- `listSatCatalogFn({ kind, search })` — helper for pickers (product/unit keys).

### 2.4 DB migration — CFDI fields on existing tables
Additive, safe:
```sql
ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS facturapi_id text,
  ADD COLUMN IF NOT EXISTS uuid_fiscal text,        -- UUID SAT (folio fiscal)
  ADD COLUMN IF NOT EXISTS serie text,
  ADD COLUMN IF NOT EXISTS xml_url text,
  ADD COLUMN IF NOT EXISTS pdf_url text,
  ADD COLUMN IF NOT EXISTS cfdi_status text,         -- valid | canceled | pending
  ADD COLUMN IF NOT EXISTS cfdi_use text,            -- G03, P01, etc.
  ADD COLUMN IF NOT EXISTS payment_form text,        -- 01, 03, 99...
  ADD COLUMN IF NOT EXISTS payment_method text,      -- PUE / PPD
  ADD COLUMN IF NOT EXISTS cancel_motivo text,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS facturapi_id text,
  ADD COLUMN IF NOT EXISTS regimen_fiscal text,
  ADD COLUMN IF NOT EXISTS uso_cfdi_default text;

ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS facturapi_id text,
  ADD COLUMN IF NOT EXISTS sat_product_key text,     -- ClaveProdServ
  ADD COLUMN IF NOT EXISTS sat_unit_key text;        -- ClaveUnidad
```
No new grants needed (existing table grants cover new columns).

### 2.5 UI wiring
- **Facturación page (`admin/facturas`)**: add "Timbrar" button on unstamped rows; show UUID, serie-folio, and download PDF/XML links once stamped; "Cancelar CFDI" with motivo select.
- **Facturas contables page**: display `uuid_fiscal` and PDF link next to folio.
- **Clientes**: show CFDI defaults (`regimen_fiscal`, `uso_cfdi_default`) and a "Sincronizar con Facturapi" action.
- **Productos**: SAT product/unit key inputs with autocomplete backed by `listSatCatalogFn`.

### 2.6 Webhook (optional, later)
Public route `src/routes/api/public/facturapi-webhook.ts` verifying signature to update `cfdi_status` on async events (cancellation accepted/rejected).

## Technical notes
- All Facturapi calls happen server-side; the key never touches the browser.
- `read process.env.FACTURAPI_KEY` inside handler bodies (Cloudflare Worker rule).
- Retries: on 5xx from Facturapi, surface error to UI; do NOT auto-retry stamping (idempotency risk).
- Amounts: send `price` including / excluding IVA per Facturapi convention (`tax_included: true` when our `total` already has IVA).

## Deliverables
1. Migration: FK on `facturas.cliente_id` + CFDI columns.
2. `add_secret` for `FACTURAPI_KEY`.
3. `src/lib/facturapi.server.ts` + `src/lib/facturapi.functions.ts`.
4. UI: Timbrar / Cancelar / descargar actions on facturas pages; SAT fields on cliente & producto forms.

Do you want the initial `FACTURAPI_KEY` to be a **test** key (`sk_test_...`) for sandbox, or the **live** key from the start? And should it be one key project-wide, or one key per `empresa`?
