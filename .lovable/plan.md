## Objetivo

Activar el **WarehouseFloorplan** (racks A–F verdes + G1 arriba + zonas especiales) como la vista principal en `/admin/almacen`, integrando dentro de él los botones de flujo de trabajo del WarehousePage antiguo, para que el equipo pueda seguir surtiendo/despachando/moviendo stock sin salir del mapa.

## Diagnóstico de por qué se ve el layout viejo

En el turno anterior, para resolver un hallazgo de Project Monitoring ("la página perdió todos sus botones"), restauré `WarehousePage` en `src/routes/admin.almacen.tsx` y moví el nuevo mapa a `/admin/almacen/mapa`. Por eso al entrar a `/admin/almacen` sigues viendo la interfaz antigua. Fue un rollback conservador — hay que revertirlo pero conservando la funcionalidad.

## Plan

### 1. Hacer del `WarehouseFloorplan` la vista principal

- `src/routes/admin.almacen.tsx` → volver a apuntar a `WarehouseFloorplan` (y eliminar la ruta duplicada `admin.almacen.mapa.tsx`, ya no hace falta).

### 2. Añadir una barra de acciones al `WarehouseFloorplan`

Encabezado del mapa con los botones que hoy viven en `WarehousePage`:

- **Importar inventario** (abre `InventoryImportDialog`)
- **Escanear / Surtir** (abre `ScannerPickDialog` / `PickingDialog` según flujo)
- **Kardex / Movimientos** (link a `/admin/kardex` o drawer con `slot_movements` recientes)
- **Ajustar stock** (abre `StockAdjustmentDialog`)
- **Ver histórico** (link a inventario histórico)

Los diálogos ya existen en `src/components/` — se reutilizan sin cambios.

### 3. Convertir el sheet de detalle de slot en panel operativo

Al hacer click en una posición del mapa, además de mostrar contenidos, exponer acciones contextuales:

- **Mover a otra posición** (drawer con selector de slot destino → inserta en `slot_movements`)
- **Marcar como dañado** (`MarkAsDamagedDialog`)
- **Editar contenido / cantidad** (edición inline de `slot_contents`)
- **Ver historial de esta posición** (query a `slot_movements` filtrado por `slot_id`)
- **Bloquear/desbloquear posición** (toggle `warehouse_slots.blocked`)

### 4. Preservar wiring de flujos existentes

No tocar:

- `PickingDialog`, `ScannerPickDialog`, `FulfillOrderDialog` (siguen resolviendo por `slot_contents.order_item_id`)
- RPC `get_embarque_snapshot` (sigue usando `zone='embarque'`)
- Códigos de slot actuales (`A-N1-P1`, `G1-N1-P1`, `EMBARQUE`, etc.)

Solo se agrega UI encima del schema existente.

### 5. Verificar

- Navegar a `/admin/almacen` y confirmar que se ve el mapa nuevo con la barra de acciones arriba.
- Click en una posición → panel con contenidos + acciones operativas.
- Abrir `InventoryImportDialog` desde el mapa y confirmar que funciona igual que antes.

## Notas técnicas

- Archivos a editar: `src/routes/admin.almacen.tsx`, `src/components/warehouse/WarehouseFloorplan.tsx`
- Archivo a eliminar: `src/routes/admin.almacen.mapa.tsx` (ya no hay ruta separada)
- Sin migraciones SQL — el schema del almacén queda intacto
- Los componentes de diálogo (`InventoryImportDialog`, `PickingDialog`, `StockAdjustmentDialog`, `MarkAsDamagedDialog`) se importan tal cual desde `src/components/`
