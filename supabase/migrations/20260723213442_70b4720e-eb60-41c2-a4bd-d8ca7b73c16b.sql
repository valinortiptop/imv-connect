CREATE OR REPLACE FUNCTION public.clients_dashboard_stats(_date_from date DEFAULT NULL, _date_to date DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH filtered_orders AS (
    SELECT
      os.client_id,
      COALESCE(os.client_name, 'Cliente') AS client_name,
      COALESCE(os.total_with_iva, 0)::numeric AS total_with_iva
    FROM public.order_summary os
    WHERE COALESCE(os.status, '') <> 'Cancelado'
      AND (_date_from IS NULL OR os.order_date >= _date_from)
      AND (_date_to IS NULL OR os.order_date <= _date_to)
  ),
  totals AS (
    SELECT
      COUNT(*)::integer AS total_orders,
      COALESCE(SUM(total_with_iva), 0)::numeric AS total_sales,
      COUNT(DISTINCT client_id)::integer AS clients_with_orders
    FROM filtered_orders
  ),
  active_clients AS (
    SELECT COUNT(*)::integer AS total_active_clients
    FROM public.clients
    WHERE active = true
  ),
  by_frequency AS (
    SELECT
      client_id,
      MAX(client_name) AS name,
      COUNT(*)::integer AS order_count
    FROM filtered_orders
    WHERE client_id IS NOT NULL
    GROUP BY client_id
    ORDER BY COUNT(*) DESC, MAX(client_name) ASC
    LIMIT 1
  ),
  top_sales AS (
    SELECT COALESCE(jsonb_agg(row_payload ORDER BY total DESC), '[]'::jsonb) AS rows
    FROM (
      SELECT
        jsonb_build_object(
          'name', MAX(client_name),
          'total', COALESCE(SUM(total_with_iva), 0),
          'orders', COUNT(*)
        ) AS row_payload,
        COALESCE(SUM(total_with_iva), 0) AS total
      FROM filtered_orders
      WHERE client_id IS NOT NULL
      GROUP BY client_id
      ORDER BY COALESCE(SUM(total_with_iva), 0) DESC, MAX(client_name) ASC
      LIMIT 5
    ) ranked
  )
  SELECT jsonb_build_object(
    'ticketPromedio', CASE WHEN totals.total_orders > 0 THEN totals.total_sales / totals.total_orders ELSE 0 END,
    'pedidosPorCliente', CASE WHEN totals.clients_with_orders > 0 THEN totals.total_orders::numeric / totals.clients_with_orders ELSE 0 END,
    'topClient', (
      SELECT CASE
        WHEN by_frequency.client_id IS NULL THEN NULL::jsonb
        ELSE jsonb_build_object('name', by_frequency.name, 'count', by_frequency.order_count)
      END
      FROM by_frequency
    ),
    'totalClientes', active_clients.total_active_clients,
    'topClientsBySales', top_sales.rows
  )
  FROM totals, active_clients, top_sales;
$$;

GRANT EXECUTE ON FUNCTION public.clients_dashboard_stats(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clients_dashboard_stats(date, date) TO service_role;

CREATE INDEX IF NOT EXISTS pedidos_cliente_created_idx ON public.pedidos (cliente_id, created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS pedido_items_pedido_fast_idx ON public.pedido_items (pedido_id);
CREATE INDEX IF NOT EXISTS facturas_cliente_fecha_emision_idx ON public.facturas (cliente_id, fecha_emision DESC NULLS LAST);