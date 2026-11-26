# Inventario y Almacén: limpieza de páginas, acuerdos con Juan y fechas en formato México

## 1. Páginas repetidas (lo que encontré)

Hoy el menú tiene 13 entradas y varias hacen lo mismo con distinta fuente:

| Par | Qué hace cada una | Propuesta |
|---|---|---|
| **Entradas** vs **Recepciones** | Entradas usa el registro antiguo de entradas (tabla anterior de productos/posiciones). Recepciones muestra lo recibido contra órdenes de compra, con lote y caducidad. | Una sola página **Entradas de mercancía** (la que pidió Juan): lista de recepciones por OC, clic abre Entrada 360 con partidas, lotes, caducidad, almacén destino (Cuarentena), usuario y OC vinculada; botón **Editar** para corregir lote/caducidad. La página antigua se retira y su dirección redirige a la nueva. |
| **Kardex** vs **Cardex de material** | Kardex = movimientos por posición física. Cardex de material = movimientos por almacén y lote. | Una sola **Kardex** con selector de vista "Por almacén/lote" (predeterminada) y "Por posición". Cada fila muestra usuario y referencia (OC, remisión, traspaso) y abre Product 360 → Historial. |
| **Almacén** vs **Almacenes / ubicaciones** vs Operación | Plano del almacén, catálogo de almacenes y operación de posiciones. | Mantener, pero renombrar claro: "Plano del almacén" y "Almacenes y ubicaciones". |

Menú resultante (Inventario y Almacén): Productos, Inventario, Kardex, Entradas de mercancía, Traspasos, Remisiones, Plano del almacén, Almacenes y ubicaciones, Reportes almacén.

## 2. Revisión contra la llamada con Juan (Jesús) y Doris

Ya hecho (lo verifico de nuevo): OC clicable con 360 e historial, piezas enteras en recepción, edición de piezas/precios en OC, almacén fijo Disponible Venta en nueva remisión, lotes pre-abiertos con caducidad, tope por existencia en remisión, exportación de inventario con lotes, Kardex clicable.

Pendiente por hacer:
- **Traspasos**: agregar varias líneas de lote en un mismo traspaso; bloquear mover más piezas que la existencia real del lote/almacén de origen (en pantalla y en el servidor, para que no se dupliquen existencias).
- **Recepción de OC**: bloquear recibir más de lo pendiente por partida también en el servidor.
- **Editar remisión**: mostrar lo pedido como dato informativo y un campo aparte "a remisionar", con tope por pedido y por existencia (hoy al editar no se aplican topes).
- **Editar entradas**: corregir lote y caducidad de una entrada, dejando registro de quién cambió qué.
- **Kardex**: nombre del usuario y referencia del movimiento (OC-0006, R-xxx, traspaso) en cada línea.
- **Inventario**: orden alfabético por defecto en pantalla y exportes; opción "Incluir imágenes" sí/no al exportar.
- **Reportes predefinidos** en Reportes almacén: "Mercancía en tránsito / OCs abiertas" y "Disponibilidad de stock" con clave, producto, proveedor, stock y lotes/caducidad.
- **Pedidos**: almacén Disponible Venta fijo y no editable al apartar mercancía.

## 3. Fechas en formato México en toda la app

Todas las fechas se mostrarán como día/mes/año (ej. 26/11/2026, 26 nov 2026) y horas en hora de Ciudad de México, usando un solo formateador compartido. Hay ~30 pantallas con formatos sueltos (las más: Estado de resultados, Inventario, Importar ventas, Entradas, Necesidades de compra, Product 360, Ajustes de stock, Usuarios, Dañados, Devoluciones). Los exportes Excel/PDF usan el mismo formato.

## Detalles técnicos

- Entradas unificada sobre `entradas_recepcion` / `entradas_recepcion_items` (`v_entradas_report`); `stock-entries-page.tsx` (stock_entries/products legacy) se retira y `/admin/entradas` pasa a ser la página nueva; `/admin/almacen/recepciones` redirige ahí. Antes, confirmo con una consulta si `stock_entries` tiene registros recientes que deban seguir visibles (si sí, se muestran como "Históricas").
- Kardex unificado: `v_cardex_material` + `v_kardex_movements`; agregar `created_by` y referencia a la vista si faltan (migración). `/admin/almacen/cardex` redirige a `/admin/kardex`.
- Validación de traspasos y recepciones dentro de las funciones SQL `ejecutar_traspaso` y de recepción (bloqueo con mensaje claro), además del tope en pantalla. `ejecutar_traspaso` acepta un arreglo de lotes.
- Edición de entradas mediante función SQL con auditoría (usuario, antes/después) y ajuste del lote correspondiente.
- Formato de fechas: extender `src/lib/date-utils.ts` (`es-MX`, zona `America/Mexico_City`) y reemplazar `toLocaleDateString()`, `en-US` y `format(..., "PP")` sueltos. Test de los formateadores.
- Menú y permisos de ruta actualizados; reglas registradas en `AGENTS.md`.
