
CREATE TABLE IF NOT EXISTS public.order_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  category text,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_type text,
  file_size bigint,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid
);
CREATE INDEX IF NOT EXISTS idx_order_documents_order ON public.order_documents(order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_documents TO authenticated;
GRANT ALL ON public.order_documents TO service_role;
ALTER TABLE public.order_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY od_all ON public.order_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.order_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  order_item_id uuid,
  product_id uuid REFERENCES public.productos(id) ON DELETE SET NULL,
  quantity numeric NOT NULL DEFAULT 0,
  reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX IF NOT EXISTS idx_order_adj_order ON public.order_adjustments(order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_adjustments TO authenticated;
GRANT ALL ON public.order_adjustments TO service_role;
ALTER TABLE public.order_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY oa_all ON public.order_adjustments FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.order_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid,
  table_name text,
  operation text,
  field_name text,
  old_value text,
  new_value text,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX IF NOT EXISTS idx_order_changes_order ON public.order_changes(order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_changes TO authenticated;
GRANT ALL ON public.order_changes TO service_role;
ALTER TABLE public.order_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY oc_all ON public.order_changes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.order_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  stop_index integer NOT NULL DEFAULT 1,
  address text,
  client_label text,
  contact_name text,
  contact_phone text,
  notes text,
  manual_maps_url text,
  signed_at timestamptz,
  signed_by_name text,
  signature_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id, stop_index)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_stops TO authenticated;
GRANT ALL ON public.order_stops TO service_role;
ALTER TABLE public.order_stops ENABLE ROW LEVEL SECURITY;
CREATE POLICY os_all ON public.order_stops FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.order_stop_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stop_id uuid NOT NULL REFERENCES public.order_stops(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL,
  quantity numeric NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_osi_stop ON public.order_stop_items(stop_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_stop_items TO authenticated;
GRANT ALL ON public.order_stop_items TO service_role;
ALTER TABLE public.order_stop_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY osi_all ON public.order_stop_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE VIEW public.v_open_orders AS
SELECT * FROM public.order_summary
WHERE status IS NULL OR status NOT IN ('Entregado','Cancelado','entregado','cancelado');
GRANT SELECT ON public.v_open_orders TO authenticated;
GRANT ALL ON public.v_open_orders TO service_role;

CREATE OR REPLACE VIEW public.v_order_item_breakdown AS
SELECT
  pi.id, pi.pedido_id AS order_id, pi.producto_id AS product_id,
  pi.nombre_snapshot AS name_snapshot, pi.sku_snapshot AS clave_snapshot,
  pi.cantidad AS quantity, pi.precio_unitario AS unit_price,
  pi.iva_pct, pi.importe AS amount,
  p.estado::text AS status, p.delivery_date, p.created_at::date AS order_date,
  p.cliente_id AS client_id
FROM public.pedido_items pi
JOIN public.pedidos p ON p.id = pi.pedido_id;
GRANT SELECT ON public.v_order_item_breakdown TO authenticated;
GRANT ALL ON public.v_order_item_breakdown TO service_role;

CREATE OR REPLACE VIEW public.v_purchase_by_order AS
SELECT
  p.id AS order_id, p.cliente_id AS client_id, p.estado::text AS status,
  p.delivery_date, p.created_at,
  sum(pi.cantidad) AS total_qty,
  sum(pi.importe)  AS total_amount
FROM public.pedidos p
LEFT JOIN public.pedido_items pi ON pi.pedido_id = p.id
GROUP BY p.id;
GRANT SELECT ON public.v_purchase_by_order TO authenticated;
GRANT ALL ON public.v_purchase_by_order TO service_role;

CREATE OR REPLACE VIEW public.v_purchase_needs AS
SELECT
  prod.id AS product_id, prod.sku AS clave, prod.nombre AS name,
  coalesce(sum(pi.cantidad) FILTER (WHERE p.estado::text NOT IN ('Entregado','Cancelado','entregado','cancelado')), 0) AS pending_qty,
  prod.stock_disponible, prod.stock_en_camino, prod.stock_minimo,
  greatest(coalesce(sum(pi.cantidad) FILTER (WHERE p.estado::text NOT IN ('Entregado','Cancelado','entregado','cancelado')), 0)
           - coalesce(prod.stock_disponible,0) - coalesce(prod.stock_en_camino,0), 0) AS shortage
FROM public.productos prod
LEFT JOIN public.pedido_items pi ON pi.producto_id = prod.id
LEFT JOIN public.pedidos p ON p.id = pi.pedido_id
GROUP BY prod.id;
GRANT SELECT ON public.v_purchase_needs TO authenticated;
GRANT ALL ON public.v_purchase_needs TO service_role;
