
-- 1. Extend damaged_batches with the columns the UI expects
ALTER TABLE public.damaged_batches
  ADD COLUMN IF NOT EXISTS condition text,
  ADD COLUMN IF NOT EXISTS unit_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS cost_at_time numeric(12,2),
  ADD COLUMN IF NOT EXISTS margin_pct numeric(6,2),
  ADD COLUMN IF NOT EXISTS photos text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_order_id uuid;

-- 2. Extend pedido_items (base table behind the order_items view)
ALTER TABLE public.pedido_items
  ADD COLUMN IF NOT EXISTS is_damaged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS damaged_batch_id uuid REFERENCES public.damaged_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pedido_items_damaged_batch
  ON public.pedido_items(damaged_batch_id)
  WHERE damaged_batch_id IS NOT NULL;

-- 3. Recreate order_items view exposing the new columns
CREATE OR REPLACE VIEW public.order_items AS
SELECT
  id,
  pedido_id          AS order_id,
  producto_id        AS product_id,
  cantidad           AS quantity,
  precio_unitario    AS unit_price_override,
  nombre_snapshot    AS name_snapshot,
  sku_snapshot       AS clave_snapshot,
  iva_pct,
  importe            AS amount,
  is_damaged,
  damaged_batch_id
FROM public.pedido_items;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;

-- 4. Dashboard KPIs RPC — returns a single JSON blob the dashboard reads
CREATE OR REPLACE FUNCTION public.dashboard_kpis_for_range(p_start date, p_end date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH orders_in_range AS (
    SELECT id, client_id, status, total, order_date
      FROM public.orders
     WHERE order_date >= p_start
       AND order_date < p_end
  ),
  status_counts AS (
    SELECT
      count(*) FILTER (WHERE status = 'nuevo')          AS status_nuevo,
      count(*) FILTER (WHERE status = 'confirmado')     AS status_confirmado,
      count(*) FILTER (WHERE status = 'en_preparacion') AS status_en_prep,
      count(*) FILTER (WHERE status = 'en_ruta')        AS status_en_ruta,
      count(*) FILTER (WHERE status = 'entregado')      AS status_entregado,
      coalesce(sum(total), 0)                           AS ventas_mes_iva
    FROM orders_in_range
  ),
  item_costs AS (
    SELECT
      oi.order_id,
      oi.product_id,
      oi.quantity,
      oi.amount,
      p.cost_with_iva,
      p.bonificacion_pct
    FROM public.order_items oi
    JOIN orders_in_range o ON o.id = oi.order_id
    LEFT JOIN public.products p ON p.id = oi.product_id
  ),
  profit AS (
    SELECT
      coalesce(sum(amount - coalesce(cost_with_iva, 0) * quantity), 0) AS realized_profit,
      coalesce(sum(amount - coalesce(cost_with_iva, 0) * (1 - coalesce(bonificacion_pct, 0) / 100.0) * quantity), 0) AS realized_profit_bonif
    FROM item_costs
  ),
  top_clients AS (
    SELECT jsonb_agg(row_to_json(t)) AS rows FROM (
      SELECT
        c.id          AS client_id,
        c.name        AS client_name,
        sum(o.total)  AS total_sales,
        count(o.id)   AS order_count
      FROM orders_in_range o
      LEFT JOIN public.clients c ON c.id = o.client_id
      GROUP BY c.id, c.name
      ORDER BY total_sales DESC NULLS LAST
      LIMIT 5
    ) t
  ),
  top_products AS (
    SELECT jsonb_agg(row_to_json(t)) AS rows FROM (
      SELECT
        p.id            AS product_id,
        p.clave         AS clave,
        p.name          AS name,
        sum(oi.quantity) AS total_bultos,
        sum(oi.amount)   AS total_revenue
      FROM item_costs oi
      LEFT JOIN public.products p ON p.id = oi.product_id
      GROUP BY p.id, p.clave, p.name
      ORDER BY total_bultos DESC NULLS LAST
      LIMIT 5
    ) t
  )
  SELECT jsonb_build_object(
    'status_nuevo',           sc.status_nuevo,
    'status_confirmado',      sc.status_confirmado,
    'status_en_prep',         sc.status_en_prep,
    'status_en_ruta',         sc.status_en_ruta,
    'status_entregado',       sc.status_entregado,
    'ventas_mes_iva',         sc.ventas_mes_iva,
    'realized_profit',        pr.realized_profit,
    'realized_profit_bonif',  pr.realized_profit_bonif,
    'top_clients',            coalesce(tc.rows, '[]'::jsonb),
    'top_products',           coalesce(tp.rows, '[]'::jsonb)
  )
  INTO v_result
  FROM status_counts sc
  CROSS JOIN profit pr
  CROSS JOIN top_clients tc
  CROSS JOIN top_products tp;

  RETURN coalesce(v_result, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_kpis_for_range(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_kpis_for_range(date, date) TO service_role;
