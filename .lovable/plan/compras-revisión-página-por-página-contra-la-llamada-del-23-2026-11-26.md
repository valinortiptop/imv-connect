# Compras: revisión página por página contra la llamada del 23 nov

Fuente: notas y transcripción "Compras - Doris, Eduardo Islas y Miriam". Se trabaja por fases para entregar valor rápido y probar cada parte.

## Fase 1 — Nueva orden de compra (lo más pedido)
Hoy el formulario solo pide laboratorio, almacén, fecha y notas; las partidas se agregan después.
- Formulario en pasos dentro de un panel amplio: 1) Laboratorio y almacén, 2) Productos, 3) Revisar y crear.
- **Sugerencias asistidas** al elegir laboratorio: productos de ese laboratorio con cantidad sugerida según compras pasadas (promedio mensual de los últimos N meses, elegible 3/6/12), ventas recientes, existencia actual y punto de reorden. Cada sugerencia muestra "por qué" (ej. "Vendes 40/mes, tienes 12, última compra hace 45 días"). Botón "Agregar todas" o una por una.
- Resumen opcional redactado por IA (vía proxy Valinor) sobre la sugerencia; los números siempre salen del cálculo, no de la IA.
- **Solo productos del laboratorio** elegido en el buscador. Si un producto también lo surte otro laboratorio, se muestra una etiqueta "También en: Lab X, Lab Y" con su último costo, sin mezclar catálogos.
- Proveedor temporal: opción "Proveedor nuevo (borrador)" con solo nombre, marcado como pendiente de alta.
- Cantidades solo enteras, sin el cero que se queda al escribir, con separador de miles.
- Respeta **múltiplos de compra** por producto (aviso y redondeo sugerido).
- Fecha estimada de recepción calculada con los días de entrega del laboratorio + 1 semana de margen, editable; y fecha límite ante retraso.
- Campo de % de descuento por partida para promociones cortas.

## Fase 2 — Datos por laboratorio y producto
- En Proveedores/Laboratorio 360: días de entrega, días de crédito, descuento por pronto pago.
- En producto: múltiplo de compra.
- Promociones/bonificaciones por laboratorio (ej. "compra 10, llévate 1") que se aplican solas al capturar cantidades, con **historial de promociones** por producto.

## Fase 3 — Recepción y listas
- Recibir mercancía: almacén Cuarentena preseleccionado.
- Órdenes: fechas día/mes/año en todo el módulo, miles con comas, filtros por estado/laboratorio/fecha, indicador de OC atrasadas vs. fecha límite.
- Etiqueta visible "PRUEBA" en elementos/órdenes de prueba.

## Fase 4 — Cuentas por pagar (nuevo)
- Facturas de proveedor ligadas a la OC recibida con XML y PDF (validación del XML).
- Programación de pagos con días de crédito y descuento por pronto pago por defecto; aplicar notas de crédito y mostrar neto a pagar; saldo por proveedor.
- Exportar a Excel/PDF.

## Fase 5 — Reportes y navegación
- Reporte de compras por producto, laboratorio y costo, con promedios en rango de meses elegible.
- Historial de faltantes: cuánto tiempo estuvo un producto sin existencia.
- Navegación: página de inicio de Compras con accesos claros (Nueva orden, Órdenes, Por recibir, Por pagar, Proveedores, Planeación, Reportes), agrupando las 11 páginas actuales en menos secciones y con la barra de herramientas estándar.

## Fuera de alcance aquí (otros módulos)
Folio administrativo→fiscal al timbrar y corrección de códigos agrupadores (Contabilidad); se dejan en el roadmap.

## Detalles técnicos
- Sugerencias: server function con `is_staff`, calcula desde `oc_items`/`ordenes_compra`, `pedido_items`/`sales_history`, `stock`, `product_stock_params`; texto IA opcional por `api-proxy` Valinor (`valinor:chat-fast`), token solo en servidor.
- "También en": relación producto↔laboratorio a partir de `oc_items` históricos y el laboratorio del producto (o nueva tabla `producto_laboratorios` si hace falta).
- Migraciones nuevas: columnas en `laboratorios` (dias_entrega, dias_credito, desc_pronto_pago), `productos.multiplo_compra`, `oc_items.descuento_pct`, `ordenes_compra.fecha_limite`, proveedores borrador, tablas de promociones de compra + historial, cuentas por pagar (facturas proveedor, pagos programados) con RLS por rol y archivos en bucket privado.
- Pruebas para reglas: cantidad sugerida, múltiplo de compra, fecha estimada (+7 días), neto a pagar con pronto pago y notas de crédito.

Propongo empezar por la Fase 1 y 3 en esta entrega.
