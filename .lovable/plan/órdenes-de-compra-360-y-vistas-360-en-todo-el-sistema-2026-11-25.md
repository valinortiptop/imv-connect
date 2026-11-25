# Órdenes de compra 360 y vistas 360 en todo el sistema

## Qué vas a ver
1. **Compras → Órdenes**: toda la fila es clicable (no solo "Abrir"). Al hacer clic se abre el **OC 360** a un lado de la pantalla.
2. **OC 360** con pestañas:
   - **Resumen**: folio, laboratorio, almacén, fechas, estado, totales (MXN), avance de recepción.
   - **Partidas**: productos, cantidades pedidas/recibidas/pendientes, costo.
   - **Recepciones**: entradas de stock y lotes generados por esta OC.
   - **Archivos**: documentos de la orden y de sus recepciones (facturas, remisiones del proveedor), con vista previa y subir archivo.
   - **Historial**: cambios de estado, quién y cuándo (hora CDMX), cambios de costo.
3. **Editar desde el 360**: botón Editar para cambiar laboratorio, almacén, fechas, notas y partidas mientras la OC esté en borrador, enviada o parcial; recibidas y canceladas quedan solo lectura. Acciones Enviar / Recibir / Cancelar ahí mismo.
4. **Botón expandir** (igual que Restrena): el panel lateral pasa a pantalla completa y vuelve; también "Abrir página completa" (la página actual de la OC se conserva).
5. **Revisión del resto de páginas**: se aplica el mismo patrón (fila clicable + 360 expandible) donde haga falta:
   - Ya tienen 360 → solo se añade el botón expandir: Clientes, Productos, Representantes.
   - Pedidos de venta: Pedido 360 (detalle, partidas, remisiones/facturas, pagos, documentos y firma, historial) con edición según estado.
   - Nuevos 360 propuestos: Proveedores/Laboratorios, Facturas, Remisiones, Devoluciones, Prospectos, Entradas de stock.
   - Se entrega primero Órdenes de compra; luego el resto por módulo.

## Detalles técnicos
- Componente compartido `Panel360` (Sheet con modo expandido/pantalla completa, pestañas, estados de carga/vacío/error, responsive desde 320px); los drawers existentes se migran a él.
- `OC360Drawer` lee `ordenes_compra`, `oc_items`, `stock_entries`/`entradas_recepcion`, `cost_history`; la edición reutiliza la lógica de `admin.compras.$id.tsx` (se extrae a componentes compartidos).
- Historial de OC: nueva tabla `oc_changes` (estado/campo anterior y nuevo, usuario, fecha) llenada por trigger, RLS `is_staff`; documentos OC en tabla `oc_documents` + bucket privado con URLs firmadas.
- Clic en fila ignora clics en botones/enlaces internos; teclado con Enter y foco visible.
