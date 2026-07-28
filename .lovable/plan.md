## What the document asks vs. what exists today

### Already implemented (verified)
- **Recepción sobre OC** con lote, caducidad y cantidad (`RecepcionesPage` + `registrar_recepcion`).
- **PDF por cada ingreso** con OC, proveedor, clave, descripción, lote, cantidad y caducidad (`almacen-pdf.ts`).
- **Edición/corrección de recepciones** (`EditarRecepcionDialog` + `editar_recepcion`), con reversa de inventario.
- **Traspasos entre almacenes** (origen/destino, clave, cantidad, lote) con PDF y listado (`TraspasosPage`, `ejecutar_traspaso`).
- **Remisión de pedido**: pantalla con pedido, cliente, selección de lote y cantidad, descuento automático de inventario, edición (`editar_remision`), baja/cancelación (`cancelar_remision`) y PDF con ubicación (`RemisionesPage`, `NuevaRemisionDialog`).
- **Trazabilidad OC → entrada → factura** y **pedido → remisión → factura** (pestañas en `ReportesAlmacenPage` sobre `v_trazabilidad_compra` / `v_trazabilidad_venta`).
- **Corta caducidad** y **rotación / lento movimiento** con bloqueo manual de compra.
- **Almacenes y ubicaciones de material** (`admin.almacenes`, `warehouse_slots`, floorplan).
- **Alertas de compras** existen (`purchase_alerts` + cron), pero hoy solo se ven en el módulo de Compras.

### Faltante (a implementar)
1. **Reporte de entradas** (clave, artículo, lote, cantidad, fecha de ingreso). La vista `v_entradas_report` ya existe en base de datos pero **ninguna pantalla la consume**.
2. **Reporte de traslados entre almacenes** como reporte formal: `v_traspasos_report` existe, sin pantalla.
3. **Reporte de salidas por remisión** a nivel partida (cliente, clave, artículo, cantidad, lote, caducidad, ubicación): `v_remisiones_report` existe, sin pantalla.
4. **Reporte de productos sin movimiento de venta**: `v_sin_movimiento_venta` existe, sin pantalla.
5. **Reporte de notas de crédito aplicadas a facturas de proveedor** — no existe vista ni pantalla.
6. **Reporte de notas de crédito aplicadas a facturas de venta** — no existe vista ni pantalla.
7. **Cardex de material completo** (entradas, salidas, notas de crédito, devoluciones a proveedor, traslados por artículo/lote). Hoy el "kardex" solo muestra movimientos de ubicación (`slot_movements`); la vista `v_kardex_movements` existe pero no se usa.
8. **Listado de inventario filtrable por clase, laboratorio y almacén** — hoy solo filtra por proveedor y estado de stock.
9. **Bloqueo automático de compra** por sobre-stock y por lento movimiento — hoy el bloqueo es solo manual con un botón.
10. **Alertas de órdenes de compra al almacén** — visibles solo en Compras; falta el aviso dentro del módulo de Almacén.

## Plan de implementación

**Base de datos (una migración)**
- Vistas nuevas: `v_notas_credito_proveedor_report` (NC proveedor ligada a factura/OC) y `v_notas_credito_venta_report` (NC de venta ligada a factura/cliente).
- Vista `v_cardex_material` unificando entradas, salidas por remisión, traspasos, notas de crédito y devoluciones a proveedor por producto y lote.
- Función `recalcular_bloqueos_compra()` ampliada para marcar automáticamente `bloqueo_compra` por sobre-stock (existencia > máximo/cobertura configurada) y por lento movimiento, con motivo; programarla en el cron diario existente.

**Reportes de Almacén (`ReportesAlmacenPage`)**
- Nuevas pestañas: Entradas, Traslados, Salidas por remisión, Sin movimiento de venta, NC proveedor, NC venta — con búsqueda, filtros de fecha/almacén y export PDF/Excel usando los helpers existentes.

**Cardex**
- Nueva pantalla `/admin/almacen/cardex`: selector de producto (y lote opcional) con línea de tiempo de todos los movimientos y saldo corrido, exportable a PDF.

**Inventario**
- Agregar filtros por clase/clasificación, laboratorio y almacén en `inventory-page.tsx`.

**Alertas y navegación**
- Tarjeta de alertas de OC pendientes de recibir en el inicio del módulo Almacén.
- Enlaces nuevos en el sidebar y nodos en el `almacen-dashboard`.

### Detalle técnico
Se reutilizan las vistas ya creadas (`v_entradas_report`, `v_traspasos_report`, `v_remisiones_report`, `v_sin_movimiento_venta`) para evitar consultas pesadas en cliente; los reportes usan `fetchAllRows` con límites y paginación de 100 filas, y los PDF se generan con `src/lib/almacen-pdf.ts`.
