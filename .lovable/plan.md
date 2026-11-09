# Plan de salida de NetSuite — Auditoría y arranque oficial de la app IMV

Este documento es para enviarlo a IMV. Explica qué ya está listo, qué falta, qué decidir sobre NetSuite, qué documentos preparar, qué sesiones agendar y quién es responsable de cada parte.

## 1. Estado actual (auditoría)

| Módulo | Estado | Comentario |
|---|---|---|
| Panel de representantes (rutas, visitas, check-in, cobro, RC, entregas, supervisor) | En uso | Ya en operación diaria |
| Clientes, subcuentas, prospectos, precios por cliente | Listo | Falta validar cartera final contra NetSuite |
| Catálogo, productos, listas de precios, promociones | Listo | Falta confirmar costos y precios vigentes |
| Pedidos, cotizaciones, remisiones | Listo | Validar flujo completo con ventas |
| Facturación CFDI (Facturapi) | Construido | Falta llave productiva, CSD y series/folios reales |
| Almacén (recepciones, traspasos, cardex, inventario, caducidades) | Construido | Requiere inventario inicial físico |
| Compras y proveedores | Construido | Requiere catálogo de proveedores y OC abiertas |
| Crédito y cobranza, complementos de pago | Construido | Requiere saldos iniciales por factura |
| Bancos (cuentas, movimientos, conciliación) | Construido | Requiere saldos y estados de cuenta |
| Contabilidad (catálogo de cuentas, pólizas, balanza, SAT) | Construido | Requiere validación del contador y saldos de apertura |
| Comisiones, metas, P&L | Construido | Requiere reglas de comisión confirmadas |
| Integración NetSuite | Solo lectura | Sincroniza ventas, clientes, productos e inventario |

Pendientes de desarrollo detectados:
1. Asistente de "carga inicial" (saldos de apertura: inventario, cartera, proveedores, bancos, contabilidad) con validación y bitácora.
2. Cierre de mes contable (bloqueo de periodos) y reporte de cuadre contra NetSuite.
3. Pruebas completas de facturación en modo productivo (factura, nota de crédito, complemento de pago, cancelación).
4. Ajustes que salgan de las sesiones con Maresi y el contador.
5. Endurecer accesos: revisar permisos por rol y las alertas de seguridad heredadas.

## 2. ¿API de NetSuite o cargas manuales?

Recomendación: **cargas manuales para el arranque, sin API permanente.**
- La API ya existe pero solo sirve mientras NetSuite siga vivo. Si el objetivo es apagarlo, se usa una sola vez para extraer el histórico y luego se desconecta.
- Lo más seguro es un **corte en una fecha fija** (ej. 1 de mes): saldos a esa fecha entran por archivo, validados por el contador, y desde ese día todo se opera en la app.
- Periodo paralelo recomendado: 2 a 4 semanas usando ambos sistemas, comparando ventas, cartera e inventario cada semana.

Si IMV prefiere mantener la API durante el paralelo: se necesita que el administrador de NetSuite confirme que el acceso actual sigue vigente y no se renueva la licencia después del corte.

## 3. Documentos que IMV debe entregar (fecha de corte)

Comercial (responsable: Maresi / Ventas)
- Catálogo de clientes activos con RFC, régimen fiscal, uso CFDI, CP fiscal, dirección, representante, lista de precios, límite y días de crédito (Excel).
- Listas de precios vigentes y precios especiales por cliente.
- Catálogo de productos: SKU, clave SAT, unidad SAT, IVA, costo, precio, laboratorio.
- Pedidos abiertos sin facturar.
- Reglas de comisiones y metas por representante.

Cobranza y finanzas (responsable: Cobranza / Tesorería)
- Antigüedad de saldos por cliente, por factura (folio, UUID, fecha, vencimiento, saldo).
- Anticipos y notas de crédito pendientes de aplicar.
- Estados de cuenta bancarios del mes de corte y saldo por cuenta.

Almacén y compras (responsable: Almacén / Compras)
- Inventario físico a la fecha de corte por almacén, lote y caducidad.
- Catálogo de proveedores con RFC y condiciones de pago.
- Cuentas por pagar por factura y órdenes de compra abiertas.

Contabilidad (responsable: Contador)
- Catálogo de cuentas con código agrupador SAT.
- Balanza de comprobación al corte.
- Saldos de IVA, ISR y retenciones pendientes.

Fiscal / Facturación (responsable: Dirección + Contador)
- Certificado de Sello Digital (CSD .cer, .key y contraseña) para Facturapi.
- Series y folios a usar; folio inicial después del último de NetSuite.
- Constancia de situación fiscal de IMV.

## 4. Sesiones a agendar

| # | Sesión | Con quién | Duración | Objetivo |
|---|---|---|---|---|
| 1 | Arranque y fecha de corte | Dirección, Maresi, Contador | 1 h | Acordar fecha de corte, periodo paralelo y responsables |
| 2 | Comercial: clientes y precios | Maresi | 2 h | Validar cartera, listas de precios, crédito, representantes |
| 3 | Comercial: pedido a factura | Maresi, Facturación, Almacén | 2 h | Recorrer pedido → remisión → factura → entrega → cobro |
| 4 | Comisiones y metas | Maresi | 1 h | Confirmar reglas de cálculo |
| 5 | Cobranza y bancos | Cobranza, Tesorería | 1.5 h | Cartera inicial, complementos de pago, conciliación |
| 6 | Contabilidad | Contador | 2 h | Catálogo, pólizas automáticas, balanza, contabilidad electrónica |
| 7 | Almacén y compras | Almacén, Compras | 1.5 h | Inventario inicial, recepciones, proveedores |
| 8 | Capacitación por rol | Todos los usuarios | 1 h c/u | Uso diario por área |
| 9 | Revisión de paralelo | Dirección, Contador, Maresi | 1 h semanal | Comparar cifras y aprobar el apagado de NetSuite |

## 5. Responsables

- **Valinor Studio:** desarrollo pendiente, cargas iniciales, conexión de Facturapi productivo, soporte durante el paralelo.
- **Dirección IMV:** fecha de corte, aprobación final, CSD y accesos.
- **Maresi (comercial):** clientes, precios, comisiones, validación de flujo de ventas.
- **Contador:** catálogo de cuentas, balanza, impuestos, aprobación contable del corte.
- **Cobranza/Tesorería:** cartera y bancos.
- **Almacén/Compras:** inventario físico y proveedores.
- **Administrador NetSuite (si aplica):** exportes finales y baja de licencia.

## 6. Cronograma sugerido (6 semanas)

```text
Semana 1  Sesión 1 y 2, entrega de documentos comerciales
Semana 2  Sesiones 3-7, entrega de documentos financieros y contables
Semana 3  Valinor: cargas iniciales + asistente de carga + Facturapi productivo
Semana 4  Capacitación por rol, fecha de corte, inicio del paralelo
Semana 5-6 Paralelo con revisión semanal; aprobación y apagado de NetSuite
```

## Detalle técnico (para Valinor)

- Construir pantalla de carga inicial por tipo (inventario, CxC, CxP, bancos, balanza) con plantilla Excel, vista previa, validación y registro de quién cargó y cuándo.
- Agregar bloqueo de periodos contables y reporte de cuadre app vs. NetSuite.
- Cambiar FACTURAPI_KEY a llave productiva y registrar CSD; probar CFDI 4.0 de ingreso, egreso, pago y cancelación.
- Tras el corte, desactivar la sincronización NetSuite y retirar su ruta pública de backfill.
- Revisar alertas de seguridad heredadas de la base de datos.
