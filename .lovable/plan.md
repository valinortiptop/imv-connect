
# Módulo de Compras — Plan de implementación

## Qué ya tenemos (base sólida)

**Datos / SQL**
- `ordenes_compra` + `oc_items` con folio, estados (`borrador/enviada/parcial/recibida/cancelada`), totales y RPC `recibir_oc` que genera entradas a inventario y actualiza costo (`0007_modulo_7_compras.sql`).
- Vistas: `v_ordenes_compra`, `v_margen_productos`, `v_stock_productos`, `v_products_with_stock` (stock físico, comprometido, en camino, disponible).
- `productos` con `costo`, `stock_minimo`, `stock_comprometido`, `stock_en_camino`, `bonificacion_pct`, `promo`.
- `movimientos_inventario` con historial completo de entradas/salidas/ventas.
- `laboratorios` (proveedores), `stock_entries`, `damaged_batches`.

**UI existente**
- `/admin/compras` — lista simple de OCs + modal nueva OC (226 líneas).
- `/admin/compras/$id` — detalle de OC con recepción (413 líneas).
- `/admin/necesidades` → `purchase-needs-page.tsx` (1132 líneas) — análisis fuerte de faltantes por pedido/cotización, agrupado por proveedor, con `PurchaseOrderDialog` y `SuppliersImportDialog`.

**Lo que falta** vs los 13 requerimientos: planeación predictiva multi-variable, KPIs de proveedor (fill rate, lead time, on-time), catálogo de motivos de faltante, historial de costos con alertas de variación, control de caducidades por lote, recomendación comercial de caducos, integración con flujo de efectivo, baja rotación, centro de alertas, dashboard gerencial, asistente IA.

## Arquitectura propuesta

Consolidar todo bajo `/admin/compras` con **layout de tabs** (una sola ruta padre, sub-rutas planas):

```text
/admin/compras                → Dashboard (KPIs, alertas)
/admin/compras/planeacion     → Planeación inteligente (reemplaza necesidades + agrega predictivo)
/admin/compras/ordenes        → Lista OCs (lo actual, mejorado)
/admin/compras/ordenes/$id    → Detalle OC (lo actual)
/admin/compras/proveedores    → Evaluación / KPIs por laboratorio
/admin/compras/caducidades    → Lotes por vencer + recomendación comercial
/admin/compras/costos         → Historial de costos y variaciones
/admin/compras/rotacion       → Baja rotación / sobreinventario
```

Sidebar admin: un solo item "Compras" con sub-items; deprecar link "Necesidades" (redirigir a `/admin/compras/planeacion`).

## Cambios de base de datos (una migración `0025_compras_full.sql`)

**Tablas nuevas**
- `product_stock_params(producto_id pk, stock_min, stock_max, punto_reorden, dias_cobertura_objetivo, dias_seguridad, lead_time_dias, updated_at)` — parámetros por producto (con defaults derivados del histórico).
- `product_batches(id, producto_id, almacen_id, lote, caducidad, cantidad, costo_unitario, oc_id, entrada_id, created_at)` — control de lotes con caducidad. Poblado por `recibir_oc` y ajustes.
- `supplier_metrics(laboratorio_id, periodo, ocs, on_time_pct, fill_rate_pct, lead_time_prom_dias, incidencias, updated_at)` — snapshot mensual materializado.
- `supplier_incidents(id, oc_id, laboratorio_id, tipo, motivo, cantidad, monto, notas, created_by, created_at)`.
- `shortage_reasons(id, codigo, label, activo)` + `shortage_events(id, producto_id, cliente_id, pedido_id, motivo_id, cantidad, fecha, notas)` — catálogo configurable y bitácora.
- `cost_history(id, producto_id, laboratorio_id, costo_unitario, oc_id, fecha)` — histórico automático desde trigger en `oc_items` al recibir.
- `purchase_alerts(id, tipo, severidad, producto_id, laboratorio_id, oc_id, payload jsonb, resuelto, created_at)` — centro unificado.
- `purchase_config(clave pk, valor jsonb)` — % variación costo, días alerta caducidad, umbrales cobertura, etc.

**Vistas**
- `v_compras_planeacion` — por producto: ventas 30/60/90/365, tendencia, consumo diario, stock físico/disp/comprometido/en_camino, cobertura días, punto reorden, cantidad sugerida (fórmula: `max(0, (cobertura_objetivo * consumo_diario) - (stock_disp + en_camino - pedidos_pendientes))`), laboratorio principal, último costo.
- `v_supplier_kpis` — laboratorio: fill rate = recibido/pedido, on-time = recibida ≤ esperada, lead time promedio, incidencias 12m.
- `v_caducidades` — lotes con `dias_restantes`, valor económico, clasificados (verde/amarillo/rojo).
- `v_caducidades_clientes` — por lote/producto: clientes que compraron, frecuencia, última compra, cantidad prom, vendedor asignado (join `pedidos`/`pedido_items`/`representantes`).
- `v_baja_rotacion` — productos con `dias_sin_venta`, existencia, valor inmovilizado, clasificación (60/90/180d).
- `v_flujo_compras` — compromisos OCs pendientes por semana + saldos bancarios (join `bank_accounts` + `pagos`).

**Triggers**
- On `recibir_oc` → insert `cost_history`, `product_batches`, actualizar `supplier_metrics` (recalc), snapshot on-time.
- On `oc_items` costo > último `cost_history` * (1 + umbral) → insert `purchase_alerts` tipo `incremento_costo`.

**Seeds**: motivos de faltante (proveedor sin stock, orden tardía, caducidad, dañado en tránsito, error captura), config default (% variación 10%, alerta caducidad 90/60/30d).

## UI — página por página

**1. Dashboard `/admin/compras`**
- Cards KPI: valor inventario, cobertura promedio, rotación, sobreinventario, inventario crítico, compras del mes, fill rate consolidado, valor por caducar.
- Gráficas: compras por proveedor (barras), compras vs presupuesto, flujo de efectivo próximas 8 semanas, top faltantes.
- Centro de alertas (lista compacta, filtro por tipo/severidad).

**2. Planeación `/admin/compras/planeacion`**
- Tabla productos con propuesta: consumo diario, cobertura actual, sugerido, editable. Filtros: proveedor, categoría, solo bajo mínimo, solo con promoción activa.
- Toggle "Considerar cotizaciones abiertas" (heredado de necesidades).
- Botón "Generar OCs" → agrupa por laboratorio, abre `PurchaseOrderDialog` (reutilizado).
- Botón "Asistente IA" → llama a proxy Valinor (Gemini) con snapshot del renglón: devuelve ajustes recomendados y justificación por producto (aceptar / rechazar).
- Reutiliza `purchase-needs-page.tsx` extendido con las nuevas columnas predictivas.

**3. Órdenes `/admin/compras/ordenes` y `$id`**
- Lista actual + columnas: on-time esperado, fill rate previsto, presupuesto restante.
- Detalle: agregar sección "Recepción por lote" (lote + caducidad requeridos al recibir), historial de incidencias.

**4. Proveedores `/admin/compras/proveedores`**
- Tabla laboratorios con KPIs (fill rate, on-time, lead time, incidencias, cumplimiento).
- Drawer: histórico OCs, gráfica cumplimiento 12m, botón "Registrar incidencia".

**5. Caducidades `/admin/compras/caducidades`**
- Tabs verde/amarillo/rojo por umbral. Muestra lote, cantidad, valor, días restantes.
- Botón "Campaña comercial" → abre panel con clientes recomendados (frecuencia, última compra, vendedor). Acciones: crear promo, asignar tarea al rep, exportar lista.

**6. Costos `/admin/compras/costos`**
- Tabla productos con último costo, costo anterior, variación %, alertas.
- Detalle: gráfica histórica de costos por proveedor.

**7. Baja rotación `/admin/compras/rotacion`**
- Filtros 60/90/180d sin venta. Muestra existencia, valor inmovilizado, sugerencia (liquidar, devolver, promocionar).

## Server functions (nuevas, en `src/lib/compras.functions.ts`)

- `getComprasDashboard()` — agrega KPIs, alertas top.
- `getPlaneacionCompras({ filters })` — devuelve `v_compras_planeacion` con paginación.
- `aiRefinePropuesta({ productos })` — llama a Valinor proxy (Gemini) para ajustes; server-only, valida usuario.
- `getSupplierKpis()`, `registerSupplierIncident()`.
- `getCaducidades({ severity })`, `getClientesRecomendadosLote({ lote_id })`.
- `getCostHistory({ producto_id })`, `getBajaRotacion({ dias })`.
- `getAlertasCompras()`, `resolveAlerta({ id })`, `getPurchaseConfig()`, `setPurchaseConfig()`.

Todas usan `requireSupabaseAuth` + rol admin/compras. La IA usa Valinor proxy (patrón existente en `src/lib/valinor-proxy.server.ts`).

## Detalles técnicos

- Reusar componentes: `PurchaseOrderDialog`, `SuppliersImportDialog`, `GlowCard`, tablas mobile-responsive (patrón cards en `md:hidden`).
- Sin nuevas dependencias; gráficas con `recharts` (ya presente).
- Alertas: función cron (pg_cron o server route `/api/public/compras.recalc`) diaria que recalcula `purchase_alerts`, `supplier_metrics`, snapshots de caducidades.
- Permisos: agregar `route_key`s en `permission_routes` para cada sub-ruta.
- Mantener retrocompatibilidad: `/admin/necesidades` → redirect a `/admin/compras/planeacion`.

## Orden de entrega

1. Migración SQL (tablas, vistas, triggers, seeds).
2. Layout con tabs + rutas vacías + redirect necesidades.
3. Dashboard + centro de alertas.
4. Planeación (extendiendo necesidades) + IA Valinor.
5. Proveedores + incidencias.
6. Caducidades + recomendación comercial.
7. Costos + baja rotación.
8. Recepción por lote en OC detalle.
9. Cron de recalculo + integración flujo de efectivo.

¿Confirmas y arranco por la migración + layout con tabs, o quieres priorizar una sección concreta primero (p.ej. Planeación + IA para tener valor inmediato)?
