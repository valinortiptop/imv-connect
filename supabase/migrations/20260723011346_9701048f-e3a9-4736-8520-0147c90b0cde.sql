
-- Fix order_date semantics: use delivery_date (real business date) with
-- created_at fallback. Backfilled invoices all share created_at=today,
-- which broke month filters and forced 25k-row loads into the browser.

CREATE OR REPLACE VIEW public.orders AS
SELECT
  id,
  cliente_id AS client_id,
  COALESCE(order_code, folio) AS order_code,
  COALESCE(delivery_date, created_at::date) AS order_date,
  delivery_date,
  estado::text AS status,
  notas_cliente AS notes,
  discount_amount,
  discount_reason,
  fulfillment_method,
  urgency,
  needs_approval,
  signature_token,
  signed_at,
  signed_by_name,
  signature_path,
  subtotal,
  iva,
  total,
  price_list_id,
  created_at,
  updated_at
FROM pedidos p;

CREATE OR REPLACE VIEW public.order_summary AS
SELECT
  p.id,
  COALESCE(p.order_code, p.folio) AS order_code,
  COALESCE(p.delivery_date, p.created_at::date) AS order_date,
  p.delivery_date,
  p.estado::text AS status,
  p.urgency,
  p.notas_cliente AS notes,
  p.cliente_id AS client_id,
  c.razon_social AS client_name,
  COALESCE(c.phone, c.telefono) AS client_phone,
  c.central,
  c.client_type,
  (SELECT COUNT(*)::int FROM pedido_items pi WHERE pi.pedido_id = p.id) AS line_items,
  p.subtotal,
  p.discount_amount,
  p.discount_reason,
  GREATEST(p.total - COALESCE(p.discount_amount, 0::numeric), 0::numeric) AS total_with_iva,
  0 AS manual_price_count,
  COALESCE(p.fulfillment_method, 'delivery'::text) AS fulfillment_method,
  p.needs_approval,
  c.delivery_window_from,
  c.delivery_window_until,
  c.delivery_notes
FROM pedidos p
LEFT JOIN clientes c ON c.id = p.cliente_id;

-- Indexes so month/rep/client filters run fast against 25k+ rows.
CREATE INDEX IF NOT EXISTS idx_pedidos_delivery_date_desc
  ON public.pedidos (delivery_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_pedidos_created_at_desc
  ON public.pedidos (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente_delivery
  ON public.pedidos (cliente_id, delivery_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_pedidos_rep_delivery
  ON public.pedidos (representante_id, delivery_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado
  ON public.pedidos (estado);
CREATE INDEX IF NOT EXISTS idx_pedido_items_pedido
  ON public.pedido_items (pedido_id);
CREATE INDEX IF NOT EXISTS idx_facturas_pedido
  ON public.facturas (pedido_id);
CREATE INDEX IF NOT EXISTS idx_facturas_fecha_emision_desc
  ON public.facturas (fecha_emision DESC NULLS LAST);
