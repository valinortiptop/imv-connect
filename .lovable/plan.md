## Módulo Almacén — brecha vs. lo solicitado

Auditoría de lo que ya existe hoy (verificado en código y base de datos) y lo que falta.

### Ya existe
- Órdenes de compra (`ordenes_compra`, `oc_items`) con recepción parcial vía `recibir_oc`, y captura de **lote/caducidad/cantidad** al recibir (`admin/compras/$id` inserta en `product_batches`).
- Almacenes (`almacenes`) y ubicaciones físicas (`warehouse_slots`, `slot_contents`, `slot_movements`) con plano, escáner y reubicaciones.
- Kardex (`/admin/kardex`) sobre la vista `v_kardex_movements` (movimientos de inventario + movimientos de slot).
- Surtido de pedidos desde almacén (`FulfillOrderDialog`, `dispatch_order`, `pick_order_item_to_embarque`) con descuento automático de inventario.
- Reportes existentes: caducidades (`v_caducidades`), baja rotación (`v_baja_rotacion`), stock bajo, inventario general, dañados, alertas de compra.

### Falta (a implementar)

**1. Recepción**
- Alertas automáticas al generar/actualizar una orden de compra (hoy `purchase_alerts` no cubre este disparo).
- **PDF por cada ingreso**: OC, proveedor, clave, descripción, lote, cantidad, caducidad.
- **Editar/corregir un ingreso ya capturado** (hoy `recibir_oc` es de una sola vía, sin reversa ni edición).
- Reporte de entradas (clave, artículo, lote, cantidad, fecha).
- Reporte de notas de crédito aplicadas a facturas de **proveedor** (hoy `notas_credito` solo cubre ventas).
- Reporte de trazabilidad OC → entrada → factura.

**2. Traspasos entre almacenes** — no existe nada. Se crea completo: captura (almacén origen/destino, clave, lote, cantidad), PDF del traslado y reporte de traslados.

**3. Remisión de pedido**
- Pantalla de remisión formal con folio (pedido, cliente, selección de lote y cantidades) sobre el surtido actual.
- Editar remisión y dar de baja/cancelar remisiones (revirtiendo inventario).
- PDF de remisión: cliente, clave, artículo, cantidad, lote, caducidad, ubicación.
- Reporte de salidas por remisión, reporte de notas de crédito de ventas y trazabilidad pedido → remisión → factura.

**4. Inventario**
- Filtros por **clase/tipo, laboratorio y almacén** en el listado de productos (hoy solo proveedor/stock).
- Kardex ampliado con notas de crédito, devoluciones a proveedor y traspasos.
- Reporte de productos **sin movimiento de venta**.
- Reporte combinado **corta caducidad + lento movimiento**.
- **Bloqueo de compra** para artículos con sobre-stock o lento movimiento (bandera visible y validación al crear OC).

---

## Plan de implementación

### Fase 1 — Base de datos (una migración)
- `entradas_recepcion` + `entradas_recepcion_items`: cabecera de cada ingreso (folio, OC, proveedor, almacén, fecha, estado, usuario) con renglones (producto, lote, caducidad, cantidad, costo). `recibir_oc` pasa a registrar el ingreso aquí y se agrega `editar_recepcion` / `cancelar_recepcion` que revierten stock y `cantidad_recibida`.
- `traspasos_almacen` + `traspasos_almacen_items` con RPC `ejecutar_traspaso` (salida en origen, entrada en destino, movimiento de lote y asiento de kardex).
- `remisiones` + `remision_items` (folio, pedido, cliente, almacén, estado) enlazadas al surtido actual; RPC `cancelar_remision` para reversa de inventario.
- `notas_credito_proveedor` (OC/factura de proveedor, folio, monto, motivo, items).
- Campos de bloqueo en `product_stock_params`: `bloqueo_compra boolean`, `bloqueo_motivo text`; trigger/función que los calcula desde sobre-stock (`stock_max`) y baja rotación.
- Vistas nuevas: `v_entradas_report`, `v_traspasos_report`, `v_remisiones_report`, `v_trazabilidad_compra`, `v_trazabilidad_venta`, `v_sin_movimiento_venta`, `v_corta_caducidad_lento`, y ampliación de `v_kardex_movements` para incluir traspasos, notas de crédito y devoluciones.
- Todas las tablas nuevas con `GRANT` a `authenticated`/`service_role`, RLS activo y políticas por rol (admin, almacen, compras/contabilidad).

### Fase 2 — Recepción
- Nueva página `/admin/entradas/recepcion` (y refuerzo del diálogo de recepción en `admin/compras/$id`): captura por lote, edición y cancelación del ingreso.
- Generador de PDF `src/lib/pdf/recepcion-pdf.ts` (jspdf + autotable, con branding IMV).
- Alertas de OC: función que crea `purchase_alerts` al emitir una OC y las muestra en el panel de almacén.

### Fase 3 — Traspasos
- Nueva ruta `/admin/almacen/traspasos`: formulario origen→destino con selección de producto/lote/cantidad validada contra existencia por lote, listado histórico y PDF por traspaso.

### Fase 4 — Remisiones
- Nueva ruta `/admin/almacen/remisiones`: lista de pedidos por remisionar, pantalla de remisión con selección de lotes y cantidades, edición y baja.
- PDF de remisión con ubicación del material; reporte de salidas por remisión.

### Fase 5 — Inventario y reportes
- Filtros de clase, laboratorio y almacén en `inventory-page.tsx`.
- Nueva ruta `/admin/almacen/reportes` con pestañas: Entradas, Traspasos, Salidas por remisión, NC proveedor, NC cliente, Trazabilidad compra, Trazabilidad venta, Sin movimiento, Corta caducidad y lento movimiento. Cada pestaña con exportación a Excel y PDF (mismo patrón usado en Ventas).
- Kardex: incluir los nuevos tipos de movimiento y filtro por tipo.
- Bloqueo de compras: indicador en inventario/planeación y validación al agregar el artículo a una OC, con opción de override para admin.

### Fase 6 — Navegación y verificación
- Entradas del sidebar bajo "Almacén y Compras": Traspasos, Remisiones, Reportes de almacén.
- Nodos correspondientes en el diagrama de `/admin/almacen-dashboard`.
- Verificación end-to-end en preview: recibir OC con lote → editar → PDF; traspaso → PDF; remisión → PDF → cancelar y confirmar reversa de stock en kardex.

### Notas técnicas
- Toda la lógica de servidor va en `createServerFn` (`src/lib/almacen.functions.ts`), sin edge functions.
- Los PDFs se generan en el cliente con jspdf/jspdf-autotable, ya presente en el proyecto.
- Los folios usan el mismo patrón de secuencia que OC/facturas (`_next_poliza_folio`-style helper).
