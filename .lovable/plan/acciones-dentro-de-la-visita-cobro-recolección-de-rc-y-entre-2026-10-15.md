# Acciones dentro de la visita: Cobro, Recolección de RC y Entrega de pedido

## Qué verá el representante
En el modal de la visita abierta (check-out), junto a Cierre / Pedido / Anaquel / Forms / Evidencia, aparece una pestaña **Acciones** con tres botones. Solo se muestra en visitas a clientes; las visitas a prospectos y a la oficina no la tienen.

```text
[ Cobro ]  [ Recolección RC ]  [ Entrega de pedido ]
```

1. **Cobro**
   - Lista las facturas abiertas (emitidas o parciales) de ese cliente, con saldo y días vencidos.
   - El representante elige una factura, captura monto, método (efectivo, transferencia, cheque, tarjeta u otro), referencia y, opcionalmente, una foto del comprobante.
   - El pago se registra con el mismo flujo que ya existe en Cobranza del Panel Rep, así que el saldo y la cartera se actualizan igual.
2. **Recolección de RC (receta cuantificada)**
   - Foto o fotos de la receta (cámara o galería), número o folio opcional, cantidad de piezas o productos opcional y notas.
   - Opcionalmente puede vincularse a un pedido del cliente.
3. **Entrega de pedido**
   - Lista los pedidos del cliente que todavía no están entregados.
   - El representante elige uno, captura el nombre de quien recibe, su firma (con el mismo pad de firma de Evidencia) y una foto opcional.
   - Al confirmar, el pedido pasa a **Entregado**.

Cada acción queda en un historial dentro de la misma pestaña, por ejemplo: "Cobro $3,200 · Factura A-123". También aparece en el detalle de la visita que ve el supervisor.

Al hacer el check-out, si en la visita se registró un cobro o una entrega, el resultado de la visita se sugiere automáticamente.

## Supuestos (confirma o corrige)
- Cualquier representante puede registrar una entrega desde la visita, aunque no sea el chofer.
- Las RC se guardan como evidencia (fotos y datos) y por ahora no generan un pedido automático.

## Detalles técnicos
- Nueva tabla `rep_visit_actions`:
  - Campos: `visit_id`, `representante_id`, `cliente_id`, `tipo` (cobro | receta | entrega), `factura_id`, `pago_id`, `pedido_id`, `monto`, `folio`, `notas`, `photo_paths text[]`, `signature_path`, `received_by`, `created_by` y `created_at`.
  - RLS: el representante lee y escribe sus propias acciones (`current_rep_ids()`); el admin y el supervisor leen todas.
- Las fotos y firmas se suben al bucket existente `rep-evidence` en la ruta `{userId}/{visitId}/actions/...`.
- Nuevas funciones del servidor en `src/lib/rep-visit-actions.functions.ts` (`requireSupabaseAuth`):
  - `listVisitActionsFn` lista las acciones de la visita.
  - `listClientOpenInvoicesFn` reutiliza la lógica de `listOpenInvoicesFn`, filtrada por `cliente_id`.
  - `registerVisitPaymentFn` inserta en `pagos` y crea la acción.
  - `registerRecetaFn` registra la RC.
  - `listClientPendingDeliveriesFn` lista los pedidos pendientes de entrega.
  - `deliverOrderFn` actualiza el pedido a `Entregado` con `signed_by_name`, `signature_path` y `signed_at`, y crea la acción.
  - Todas verifican que la visita esté abierta y pertenezca al representante.
- UI:
  - Nuevo `src/components/rep/VisitActionsPanel.tsx`, montado como pestaña en `CheckInDialog.tsx`.
  - Las pestañas usan una cuadrícula ajustable para que quepan en móvil.
  - `RouteDetailsDialog` y el visor de evidencia muestran las acciones de la visita.
