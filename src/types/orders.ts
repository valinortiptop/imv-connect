// @ts-nocheck
export interface OrderSummaryRow {
  id: string | null;
  order_code: string | null;
  order_date: string | null;
  delivery_date: string | null;
  status: string | null;
  urgency: boolean | null;
  notes: string | null;
  client_id: string | null;
  client_name: string | null;
  client_phone: string | null;
  central: string | null;
  /** Client segmentation: "mayoreo" or "menudeo". Driven from clients.client_type
   *  so the Pedidos filter mirrors the Clients tab exactly. */
  client_type: "mayoreo" | "menudeo" | null;
  line_items: number | null;
  /** Pre-discount sum of all line items. Same value `total_with_iva` had
   *  before the manual-discount feature shipped — kept around for views
   *  that want to show the gross alongside the net. */
  subtotal: number | null;
  /** Manual MXN discount applied at the order level. 0 when none. */
  discount_amount: number | null;
  /** Free-text reason the discount was applied (shown in tooltips, on
   *  the comprobante, etc.). Null when no discount. */
  discount_reason: string | null;
  /** NET total: subtotal - discount_amount, floored at 0. This is the
   *  amount the customer actually pays — every list/dashboard reads
   *  this. Replaces the old "gross == total" semantic. */
  total_with_iva: number | null;
  manual_price_count: number | null;
  /** "delivery" or "pickup" — chosen by the client in the portal cart.
   *  Pickup orders skip the truck/logistics flow. */
  fulfillment_method: string | null;
  /** True when admin must confirm this order: portal order placed
   *  within 3 business days, or pickup with sobre-pedido item too soon. */
  needs_approval: boolean | null;
  /** Client delivery window — when the business accepts deliveries.
   *  Forwarded from clients.delivery_window_from / _until / _notes via
   *  the order_summary view. Null when never captured for that client. */
  delivery_window_from: string | null;
  delivery_window_until: string | null;
  delivery_notes: string | null;
}

export interface OrderDetailRow {
  id: string;
  order_code: string;
  client_id: string;
  order_date: string;
  delivery_date: string | null;
  status: string;
  urgency: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientRow {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  address: string | null;
  central: string | null;
  rfc: string | null;
  razon_social: string | null;
  nombre_cfdi: string | null;
  codigo_postal: string | null;
  curp: string | null;
  active: boolean;
  created_at: string;
}

export interface CentralRow {
  id: string;
  name: string;
  state: string | null;
  city: string | null;
  notes: string | null;
  created_at: string;
}

export const ORDER_STATUSES = [
  "Pendiente portal",
  "Pendiente aprobación",
  "Reservado",
  "Nuevo",
  "Confirmado",
  "En preparacion",
  "En ruta",
  "Entregado",
  "Cancelado",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  "Pendiente portal": "Pendiente Portal",
  "Pendiente aprobación": "Pendiente Aprobación",
  "Reservado": "Reservado",
  "Nuevo": "Nuevo",
  "Confirmado": "Confirmado",
  "En preparacion": "En preparación",
  "En ruta": "En ruta",
  "Entregado": "Entregado",
  "Cancelado": "Cancelado",
};

const mxnFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function fmtMXN(value: number | null | undefined): string {
  if (value == null) return "$0.00";
  return mxnFormatter.format(value);
}
