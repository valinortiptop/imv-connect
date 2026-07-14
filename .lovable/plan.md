# Documentación técnica para IT

El equipo de IT pidió tres entregables. Los generaré como archivos descargables en `/mnt/documents/` para que se los puedas reenviar directamente.

## Entregables

### 1. Diagrama de Arquitectura de Software (`arquitectura.mmd`)
Diagrama Mermaid que muestre las capas del sistema IMV Connect:

- **Cliente (Browser)**: App React 19 + TanStack Start + Vite, servida como SPA/SSR desde Cloudflare Workers.
- **Edge Runtime (Cloudflare Workers)**: Server Functions de TanStack (`createServerFn`) y rutas API públicas (`/api/public/*`) para webhooks y cron.
- **Backend (Supabase)**: Postgres con RLS, Auth, Storage, Realtime, más un puñado de Edge Functions heredadas.
- **Servicios externos vía Valinor Proxy**: Google Maps (geocoding/tiles), Gemini, OpenAI, Perplexity, Resend, Facturapi.
- **Roles/Portales**: Admin, Representantes, Portal cliente (`/portal/$token`), Entrega (`/entrega/$token`), Maniobra (`/maniobra/$token`).

### 2. Diagrama Entidad-Relación (`entidad-relacion.mmd`)
Mermaid `erDiagram` con las tablas núcleo y sus relaciones. Dado que hay ~110 tablas, agruparé por dominio y mostraré las principales (no cada columna) para que sea legible:

- **Catálogo**: `productos`, `laboratorios`, `product_prices`, `price_lists`, `price_list_items`, `product_promotions`, `product_batches`, `product_stock_params`, `product_substitutes`, `sku_aliases`.
- **Clientes y ventas**: `clientes`, `client_price_overrides`, `precios_cliente`, `pedidos`, `pedido_items`, `order_stops`, `order_stop_items`, `order_adjustments`, `order_changes`, `order_documents`, `quotes`, `quote_items`, `sales_history`.
- **Inventario y logística**: `almacenes`, `centrales`, `stock`, `stock_entries`, `stock_adjustments`, `stock_deliveries`, `movimientos_inventario`, `warehouse_slots`, `slot_contents`, `slot_movements`, `damaged_batches`, `delivery_trips`, `delivery_trip_items`, `delivery_reveal_photos`, `maniobra_*`.
- **Compras**: `ordenes_compra`, `oc_items`, `purchase_alerts`, `purchase_budgets`, `purchase_config`, `supplier_incidents`, `supplier_metrics`, `cost_history`, `partners`, `partner_shipments`, `partner_shipment_items`, `partner_monthly_settlements`.
- **Facturación y cobranza**: `facturas`, `factura_items`, `notas_credito`, `pagos`, `empresa_csd`, `empresa_datos`, `empresa_documentos`, `empresas`.
- **Contabilidad**: `cuentas_contables`, `polizas`, `poliza_movimientos`, `poliza_impuestos`, `ejercicios_fiscales`, `periodos_contables`, `sat_codigo_agrupador`.
- **Bancos**: `bank_accounts`, `bank_movements`, `bank_statements`, `bank_transfers`, `payroll_payments`, `fixed_expenses`, `bonifications_received`, `monthly_bonificaciones`.
- **Representantes**: `representantes`, `employees`, `rep_visits`, `rep_visit_agreements`, `rep_targets`, `rep_day_closes`, `rep_achievements`, `rep_coaching`, `rep_client_insights`, `rep_access_events`, `visit_form_templates`, `visit_form_responses`, `visit_shelf_photos`, `prospects`, `prospect_calls`.
- **Devoluciones y faltantes**: `devoluciones`, `devolucion_items`, `shortage_events`, `shortage_reasons`, `competitor_migrations`.
- **Seguridad/config**: `user_roles`, `role_permissions`, `permission_routes`, `user_permission_overrides`, `system_config`, `notifications`, `kanban_*`, `chat_conversations`, `onboarding_*`.

Consultaré `information_schema` (via `supabase--read_query`) para extraer las FKs reales antes de dibujar, así el ER refleja la BD y no una suposición.

### 3. Matriz de Integraciones / APIs (`matriz-integraciones.md` + `.csv`)
Tabla con una fila por integración externa, columnas:

| Sistema | Propósito | Dirección | Protocolo | Autenticación | Punto de integración en el código | Ambiente |

Cobertura prevista (a confirmar durante la exploración):

- **Supabase** (Postgres/Auth/Storage/Realtime) — via `@supabase/supabase-js` y `requireSupabaseAuth`.
- **Valinor Proxy** — hub único para: Google Maps (geocoding + tiles), Gemini (chat/embeddings), OpenAI, Perplexity, Resend (email), Facturapi (CFDI 4.0). Referencias: `src/lib/valinor-proxy.server.ts`, `src/lib/valinor.functions.ts`, `src/lib/facturapi.*`, `src/routes/api/public/maps.*`.
- **Lovable AI Gateway** — solo si se usa; verificaré.
- **Webhooks entrantes** — rutas bajo `src/routes/api/public/hooks/*` (p. ej. `regenerate-compras-alerts`).
- **CSD/SAT** — firma local de CFDI (`src/lib/csd-signer.server.ts`).
- **Cloudflare Workers** — hosting/edge runtime.

## Detalles técnicos

- **Formato**: Los diagramas se entregan como `.mmd` (Mermaid) porque renderiza directo en GitHub/Notion y es editable. Si prefieres PNG/PDF, lo agrego en un segundo paso.
- **Fuentes de verdad**:
  - Arquitectura → `src/router.tsx`, `src/routes/__root.tsx`, `src/routes/api/public/**`, `src/integrations/supabase/*`, `src/lib/valinor-*`, `wrangler.jsonc`, `vite.config.ts`.
  - ER → `information_schema.table_constraints` + `key_column_usage` en Supabase (query real, no adivinado).
  - Matriz → grep de `fetch(`, `createServerFn`, `valinor`, `facturapi`, `supabase.functions.invoke`, secrets en `.env.example`.
- **Salida**:
  - `/mnt/documents/imv-arquitectura.mmd`
  - `/mnt/documents/imv-entidad-relacion.mmd`
  - `/mnt/documents/imv-matriz-integraciones.md`
  - `/mnt/documents/imv-matriz-integraciones.csv`
- **No toco código de la app**: es solo documentación en `/mnt/documents/`.

## Pregunta antes de implementar

¿Quieres los diagramas también renderizados como imágenes (PNG) o el ER completo con **todas** las tablas (~110) aunque quede muy denso? Por default entrego `.mmd` + un ER agrupado por dominio con las tablas principales.
