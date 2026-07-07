## Goal
Add a page in Configuración to manage multiple companies (emisores) with full fiscal info (RFC, razón social, régimen, CP fiscal, dirección, contacto, logo, etc.), and let the app — starting with Facturación — pick which company is issuing the invoice.

## 1. Database (migration)
Create a new table `public.empresas` (multi-row emisores):

- razon_social, nombre_comercial
- rfc, regimen_fiscal, uso_cfdi_default
- cp_fiscal, direccion_fiscal (street/colonia/municipio/estado all in one text)
- telefono, email_contacto, sitio_web
- representante_legal
- logo_url
- serie_factura_default, folio_next
- moneda_default (default 'MXN'), iva_default (default 16)
- lugar_expedicion
- is_default (bool), active (bool)
- created_at, updated_at, updated_by

Rules: only one `is_default = true` at a time (partial unique index). GRANT to authenticated + service_role. RLS: authenticated can read/write (admin-facing table). Seed one row from existing `empresa_datos` (id=1) so the current data isn't lost.

Also add `empresa_id uuid` (nullable, FK to `empresas`) to `public.facturas` so we know which company issued each invoice.

## 2. New route: `/admin/empresas`
- List of empresas as cards/table with badges for "Predeterminada" and "Activa".
- Create / edit dialog with all fields grouped in sections (Fiscal, Contacto, Facturación, Branding).
- Actions: set as default, activate/deactivate, delete (only if not referenced).
- Uses `supabase.from('empresas')` directly (RLS-protected).

## 3. Sidebar
Add "Empresas" entry under CONFIGURACIÓN group, above "Uso de APIs".

## 4. Facturación integration (facturacion-page.tsx)
- Add a company picker at the top of the invoice form: "Facturando desde: [Select empresa]".
- Default the selection to the `is_default` empresa on mount; persist last choice in `localStorage`.
- When saving a factura, store `empresa_id`.
- When rendering / printing the invoice preview, pull emisor block (RFC, razón social, régimen, CP, dirección, teléfono, email, logo_url) from the selected empresa instead of the singleton `empresa_datos`.
- Keep `empresa_datos` untouched (legacy) — this page now sources from `empresas`.

## 5. Reusable hook
`src/hooks/use-empresas.ts` exposing `{ empresas, defaultEmpresa, selectedEmpresa, selectEmpresa }` so future pages (pedidos PDF, cotizaciones, remisiones, notas de crédito) can adopt the same selector with one import.

## Out of scope (this pass)
- Wiring the selector into pedidos/cotizaciones/notas — the hook is ready for a follow-up.
- Uploading logo files to Storage — logo is a URL field for now (we can add a Storage picker later if needed).

Confirm and I'll ship the migration first, then the page, sidebar entry, and Facturación wiring.