/**
 * Catálogo client-safe de eventos de la plataforma que disparan notificación.
 * El mapeo evento → plantilla / destinatarios vive en `notifications.server.ts`.
 */
export const NOTIFICATION_EVENTS = [
  // Ventas
  "pedido_creado",
  "pedido_confirmado",
  "pedido_cancelado",
  "cotizacion_enviada",
  // Logística
  "pedido_en_ruta",
  "pedido_entregado",
  // Facturación / contabilidad
  "factura_emitida",
  "factura_cancelada",
  "complemento_pago_emitido",
  // Cobranza
  "pago_registrado",
  "credito_autorizacion_solicitud",
  "credito_autorizacion_resuelta",
  "cliente_bloqueado_credito",
  // Compras
  "oc_creada",
  "oc_recibida",
  "compras_alerta",
  // Almacén
  "almacen_recepcion",
  "almacen_traspaso",
  "almacen_stock_bajo",
  "almacen_caducidad",
  "devolucion_registrada",
  // Representantes
  "rep_ruta_asignada",
  "visita_registrada",
  // Sistema
  "tarea_asignada",
  "usuario_bienvenida",
  "usuario_rol_actualizado",
] as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];
