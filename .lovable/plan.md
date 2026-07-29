## Objetivo

Cargar el detalle de inventario por lote del archivo de NetSuite (2,088 renglones, 1,196 SKUs) para que cada producto muestre sus lotes, caducidades y existencias por almacén.

## Qué trae el archivo

Columnas: ID interno, Ubicación, Clase (laboratorio), Artículo (SKU), Descripción, Serie/Lote, Fecha de caducidad, Físico, Disponible, Orden, Unidad.

Ubicaciones y renglones:
- Disponible Venta (1,112), Farmacia (519), Almacén Cuarentena Reclamación (220), Almacén Caduco (86), Mostrador (83), Productos Merma (61), Almacén Consignación (3), Producto Limitado (2), Almacén Cuarentena (1), Almacén Producto en Exposición (1)

Todos los renglones traen lote; 17 no traen caducidad (se cargan sin fecha). No hay duplicados de ubicación+SKU+lote.

## Plan

1. **Almacenes**: crear los almacenes faltantes con los nombres exactos de NetSuite (los existentes DISPONIBLE y CUARENTENA se reutilizan/renombran para no duplicar). Quedan las 10 ubicaciones.

2. **Productos**: para los SKUs del archivo que no existan en el catálogo, darlos de alta con SKU, descripción, unidad y laboratorio (Clase), marcados como activos.

3. **Carga de lotes (snapshot)**: vaciar `product_batches` y cargar los 2,088 renglones con producto, almacén, lote, caducidad y cantidad (columna Disponible).

4. **Stock por almacén**: recalcular la tabla `stock` desde los lotes, para que existencias por almacén y el total del producto (`stock_disponible`) coincidan con el archivo.

5. **Visibilidad en la app**: verificar que la página de Inventario y el detalle de producto muestren el desglose por lote/caducidad/almacén, y agregar el desglose donde falte (el selector de lotes de remisiones ya lee `product_batches`, así que empezará a mostrar lotes reales).

## Detalles técnicos

- Cantidad = columna "Disponible" (entera).
- Se guarda el lote tal cual viene (incluye formatos tipo `CAA1734/24`, `A-2`).
- La carga se hace en lotes de inserción por SQL; al final se entrega un resumen: renglones cargados, productos nuevos creados y suma total de piezas para cotejar contra el archivo.
