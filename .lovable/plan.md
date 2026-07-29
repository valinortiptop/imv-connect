## Objetivo

1. Que cada actividad relevante de la plataforma dispare su notificación (sistema / email según preferencias del usuario) usando la librería de plantillas.
2. Rediseñar las plantillas de correo con identidad IMV: logo, encabezado, cuerpo y pie de página consistentes.

## Parte 1 — Diseño de las plantillas de correo

- Crear un layout base de correo (tabla HTML compatible con Outlook/Gmail, ancho 600px) con:
  - **Header**: banda azul marino IMV con el logo `imv-logo-full-white.png` (URL absoluta `https://app.imv.lat/__l5e/assets-v1/...`) y la etiqueta de categoría.
  - **Cuerpo**: título, texto, bloque de datos opcional (`{{detalle_html}}`), botón CTA "Abrir en la plataforma".
  - **Footer**: datos de IMV, enlace a Configuración → Notificaciones para darse de baja/ajustar, aviso de correo automático.
- Migración que actualiza el `body_html` de las 17 plantillas existentes al nuevo layout (conservando sus variables actuales) y su `body_text`.
- El fallback HTML de `src/lib/notifications.server.ts` usa el mismo diseño, para que un correo sin plantilla también se vea bien.

## Parte 2 — Plantillas faltantes (nuevas, `is_system`)

| Clave | Canal | Evento |
|---|---|---|
| `pedido_creado` | email | Pedido nuevo registrado |
| `pedido_cancelado` | email | Pedido cancelado |
| `cotizacion_enviada` | email | Cotización creada para cliente |
| `factura_cancelada` | email | CFDI cancelado |
| `complemento_pago_emitido` | email | REP timbrado |
| `pago_registrado` | email | Pago aplicado a facturas |
| `oc_creada` / `oc_recibida` | email | Orden de compra emitida / recibida |
| `almacen_recepcion` | email | Recepción registrada |
| `almacen_traspaso` | email | Traspaso entre almacenes |
| `almacen_stock_bajo` | email | Stock por debajo del mínimo |
| `devolucion_registrada` | email | Devolución creada/aplicada |
| `tarea_asignada` | email | Tarjeta de Kanban asignada |
| `visita_registrada` | email | Check-in/out de representante |
| `cliente_bloqueado_credito` | email | Cliente bloqueado por crédito |
| `usuario_rol_actualizado` | email | Cambio de rol/permisos |

Cada una también con su versión `sms` corta cuando aplique (recordatorio de pago, pedido en ruta, ruta del día ya existen; se añaden `sms_pedido_entregado` y `sms_tarea_asignada`).

## Parte 3 — Disparadores (wiring)

Se añade `dispatchNotification` / `dispatchToUsers(usersWithRoles([...]))` en:

- **Ventas / pedidos**: `createRepOrderFn`, `createRepQuoteFn` y el alta/cambio de estado de pedidos (confirmado, en ruta, entregado, cancelado) → notifica al representante dueño, a ventas y a logística según el estado.
- **Facturación**: `stampInvoiceFn` (factura emitida), `cancelInvoiceFn`, `emitirComplementoPagoFn` → roles `facturacion`, `contabilidad`.
- **Cobranza / crédito**: `solicitarAutorizacionFn` y `resolverAutorizacionFn` (ya parcialmente), `aplicarPagoMultiFn`, promesas de pago vencidas, cliente bloqueado por crédito → roles `cobranza`, `admin` y el rep del cliente.
- **Compras**: `crearOCsDesdePlaneacion`, `recibir_oc`, `regenerarAlertasCompras`, `assignAlerta` → rol `compras` y usuario asignado.
- **Almacén**: recepciones, traspasos, remisiones, alertas de caducidad y stock bajo → rol `almacen` + `compras` para caducidad.
- **Representantes**: ruta asignada/guardada, visita registrada, alertas de riesgo (ya existentes) → el rep y su supervisor.
- **Tareas (Kanban)**: al asignar una tarjeta → usuario asignado.
- **Usuarios**: `createUserFn` (bienvenida, `forceEmail`) y `updateUserFn` con cambio de rol.

Para no duplicar código se agrega un helper `notifyEvent(event, payload)` en `src/lib/notifications.server.ts` que mapea evento → categoría, plantilla, ruta y destinatarios (usuarios explícitos o por rol).

## Parte 4 — Verificación

- Página de librería: revisar que las plantillas nuevas aparecen con sus variables detectadas y que la vista previa renderiza el nuevo diseño.
- Enviar un correo de prueba desde la vista previa para validar header/footer/logo.

## Detalles técnicos

- Los correos siguen saliendo por Resend a través del proxy de Valinor (`sendEmail` en `valinor-proxy.server.ts`); no se añade ningún otro proveedor.
- El logo se referencia por URL absoluta del CDN de assets, ya que los clientes de correo no resuelven rutas relativas.
- SMS permanece en estado `pending` (sin proveedor), solo se registran las plantillas y la intención de envío.
- Todas las plantillas nuevas se insertan por migración con `is_system = true` y `GRANT`s existentes de `message_templates` (sin cambios de RLS).
