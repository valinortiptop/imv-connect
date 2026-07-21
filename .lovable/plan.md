## Estado del módulo Crédito y Cobranza + Dashboards

### Ya implementado

**Crédito y Cobranza (Fases 1-8)**
- Esquema completo: `cliente_credito`, `cobranza_gestiones`, `cobranza_promesas_pago`, `credito_autorizaciones`, `cobranza_comunicaciones`, `cliente_riesgo_snapshots`, `cobranza_alertas`, `cliente_documentos`, `cliente_credito_historial`, `cobranza_templates`, `cobranza_config`.
- Vistas: `v_cliente_credito_360`, `v_cliente_timeline`.
- Rutas: dashboard ejecutivo, cartera (con export CSV y fila clickable), gestiones, promesas, autorizaciones, alertas, complementos, configuración, Cliente 360, expediente digital, timeline.
- Server functions: estados de cuenta, recordatorios, NC pronto pago, scoring IA (Gemini vía Valinor Proxy), aplicación multi-factura de pagos, complementos REP, Kanban desde alertas.
- Crons: recordatorios diarios, estados de cuenta, recálculo nocturno de riesgo + alertas.

**Dashboards Generales**
- `/admin/clientes-dashboard` y `/admin/almacen-dashboard` con `FlowDiagram` interactivo y conteos en vivo.
- Hooks automáticos: remisión → inventario, factura → póliza ingreso + costo de venta, pago → póliza ingreso banco.
- Auditoría de pólizas (`estado_origen`: automática/modificada/manual).

### Pendientes / gaps detectados

1. **Verificación end-to-end de hooks contables** — no se ha corrido una prueba real con una factura emitida + pago aplicado para confirmar que las pólizas se generan con montos correctos y que el trigger de costo lee bien `cost_history`.
2. **Timbrado real de NC de pronto pago** — la función existe pero falta confirmar integración con Facturapi para timbrado automático (hoy queda en borrador).
3. **Envío real de emails** — plantillas y crons existen; validar que Resend vía Valinor Proxy esté enviando (no solo registrando en `cobranza_comunicaciones`).
4. **Permisos/roles** — `permission_routes` tiene los dashboards nuevos, pero no se ha revisado si los roles no-admin (cobranza, contador) tienen acceso correcto a cada subruta.
5. **Dashboards de flujo — nodos huérfanos** — algunos nodos (ej. "Consulta inventario", "Notas de crédito") apuntan a rutas que quizá no existen aún; falta auditar clicks.
6. **Bloqueo automático por crédito excedido** — la lógica de alerta existe, pero el bloqueo efectivo al capturar pedido (validación en `pedidos`) no está conectado.
7. **Complemento de pago (REP)**: falta UI de reenvío/cancelación y validación SAT status.
8. **Reportes PDF** — solo hay export CSV; el accountant pidió estados de cuenta y reportes formales (posiblemente PDF).

### Plan propuesto

Antes de seguir construyendo, hacer una **pasada de verificación**:
- Correr un flujo real: pedido → remisión entregada → factura emitida → pago aplicado, y validar movimientos en `movimientos_inventario`, `stock`, `polizas`, `poliza_movimientos`.
- Auditar cada nodo de los dos FlowDiagrams y confirmar que la ruta destino existe y carga.
- Probar envío de un recordatorio manual y confirmar que llega el email.

Luego priorizar según lo que falle: bloqueo automático de pedidos por crédito, timbrado NC pronto pago, y reportes PDF.

¿Quieres que arranque con la auditoría de verificación (nodos + flujo transaccional real) o prefieres que ataque directo uno de los gaps (ej. bloqueo por crédito, o timbrado NC)?
