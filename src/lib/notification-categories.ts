/** Catálogo compartido de categorías y canales de notificaciones. */

export const NOTIFICATION_CATEGORIES = [
  { key: "sistema", label: "Sistema", description: "Avisos generales de la plataforma" },
  { key: "cobranza", label: "Crédito y cobranza", description: "Vencimientos, promesas y alertas de cartera" },
  { key: "ventas", label: "Ventas", description: "Pedidos, cotizaciones y metas" },
  { key: "compras", label: "Compras", description: "Órdenes, faltantes y alertas de abasto" },
  { key: "almacen", label: "Almacén", description: "Recepciones, traspasos y caducidades" },
  { key: "logistica", label: "Logística", description: "Rutas, entregas y maniobra" },
  { key: "rep", label: "Representantes", description: "Visitas, rutas y desempeño" },
  { key: "contabilidad", label: "Contabilidad", description: "Pólizas, facturas y cumplimiento fiscal" },
] as const;

export type NotificationCategoryKey = (typeof NOTIFICATION_CATEGORIES)[number]["key"];

export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  NOTIFICATION_CATEGORIES.map((c) => [c.key, c.label]),
);

export const NOTIFICATION_CHANNELS = [
  { key: "in_app", label: "Sistema", hint: "Campana y centro de notificaciones", enabled: true },
  { key: "email", label: "Email", hint: "Correo vía Resend (Valinor)", enabled: true },
  { key: "sms", label: "SMS", hint: "Próximamente", enabled: false },
] as const;

export type NotificationChannelKey = (typeof NOTIFICATION_CHANNELS)[number]["key"];

export const PRIORITIES = ["baja", "media", "alta", "critica"] as const;

export const PRIORITY_LABEL: Record<string, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
  critica: "Crítica",
};

export function normalizeCategory(value?: string | null): string {
  if (!value) return "sistema";
  const v = value.toLowerCase();
  return NOTIFICATION_CATEGORIES.some((c) => c.key === v) ? v : "sistema";
}
