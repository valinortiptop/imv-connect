
CREATE OR REPLACE FUNCTION public.ventas_unified_stats(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_client_id uuid DEFAULT NULL,
  p_rep_id uuid DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_lab_id uuid DEFAULT NULL,
  p_fuente text DEFAULT NULL,
  p_top_n int DEFAULT 5
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_totals jsonb;
  v_by_month jsonb;
  v_top_rep jsonb;
  v_top_client jsonb;
  v_top_lab jsonb;
  v_top_product jsonb;
BEGIN
  WITH f AS (
    SELECT *
    FROM public.v_ventas_unified v
    WHERE (p_from IS NULL OR v.fecha >= p_from)
      AND (p_to IS NULL OR v.fecha <= p_to)
      AND (p_client_id IS NULL OR v.client_id = p_client_id)
      AND (p_rep_id IS NULL OR v.representante_id = p_rep_id)
      AND (p_product_id IS NULL OR v.product_id = p_product_id)
      AND (p_lab_id IS NULL OR v.laboratorio_id = p_lab_id)
      AND (p_fuente IS NULL OR v.fuente = p_fuente)
  )
  SELECT jsonb_build_object(
    'lines', COALESCE(COUNT(*), 0),
    'revenue', COALESCE(SUM(revenue), 0),
    'quantity', COALESCE(SUM(quantity), 0),
    'invoices', COALESCE(COUNT(DISTINCT invoice_no) FILTER (WHERE invoice_no IS NOT NULL), 0)
  ) INTO v_totals FROM f;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('k', mes, 'v', total) ORDER BY mes), '[]'::jsonb)
  INTO v_by_month
  FROM (
    SELECT to_char(fecha, 'YYYY-MM') AS mes, SUM(revenue) AS total
    FROM public.v_ventas_unified v
    WHERE (p_from IS NULL OR v.fecha >= p_from)
      AND (p_to IS NULL OR v.fecha <= p_to)
      AND (p_client_id IS NULL OR v.client_id = p_client_id)
      AND (p_rep_id IS NULL OR v.representante_id = p_rep_id)
      AND (p_product_id IS NULL OR v.product_id = p_product_id)
      AND (p_lab_id IS NULL OR v.laboratorio_id = p_lab_id)
      AND (p_fuente IS NULL OR v.fuente = p_fuente)
    GROUP BY 1
  ) m;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('k', name, 'v', total) ORDER BY total DESC), '[]'::jsonb)
  INTO v_top_rep
  FROM (
    SELECT rep_name AS name, SUM(revenue) AS total
    FROM public.v_ventas_unified v
    WHERE (p_from IS NULL OR v.fecha >= p_from)
      AND (p_to IS NULL OR v.fecha <= p_to)
      AND (p_client_id IS NULL OR v.client_id = p_client_id)
      AND (p_rep_id IS NULL OR v.representante_id = p_rep_id)
      AND (p_product_id IS NULL OR v.product_id = p_product_id)
      AND (p_lab_id IS NULL OR v.laboratorio_id = p_lab_id)
      AND (p_fuente IS NULL OR v.fuente = p_fuente)
      AND rep_name IS NOT NULL
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT p_top_n
  ) t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('k', name, 'v', total) ORDER BY total DESC), '[]'::jsonb)
  INTO v_top_client
  FROM (
    SELECT client_name AS name, SUM(revenue) AS total
    FROM public.v_ventas_unified v
    WHERE (p_from IS NULL OR v.fecha >= p_from)
      AND (p_to IS NULL OR v.fecha <= p_to)
      AND (p_client_id IS NULL OR v.client_id = p_client_id)
      AND (p_rep_id IS NULL OR v.representante_id = p_rep_id)
      AND (p_product_id IS NULL OR v.product_id = p_product_id)
      AND (p_lab_id IS NULL OR v.laboratorio_id = p_lab_id)
      AND (p_fuente IS NULL OR v.fuente = p_fuente)
      AND client_name IS NOT NULL
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT p_top_n
  ) t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('k', name, 'v', total) ORDER BY total DESC), '[]'::jsonb)
  INTO v_top_lab
  FROM (
    SELECT lab_name AS name, SUM(revenue) AS total
    FROM public.v_ventas_unified v
    WHERE (p_from IS NULL OR v.fecha >= p_from)
      AND (p_to IS NULL OR v.fecha <= p_to)
      AND (p_client_id IS NULL OR v.client_id = p_client_id)
      AND (p_rep_id IS NULL OR v.representante_id = p_rep_id)
      AND (p_product_id IS NULL OR v.product_id = p_product_id)
      AND (p_lab_id IS NULL OR v.laboratorio_id = p_lab_id)
      AND (p_fuente IS NULL OR v.fuente = p_fuente)
      AND lab_name IS NOT NULL
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT p_top_n
  ) t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('k', name, 'v', total) ORDER BY total DESC), '[]'::jsonb)
  INTO v_top_product
  FROM (
    SELECT COALESCE(description, sku) AS name, SUM(revenue) AS total
    FROM public.v_ventas_unified v
    WHERE (p_from IS NULL OR v.fecha >= p_from)
      AND (p_to IS NULL OR v.fecha <= p_to)
      AND (p_client_id IS NULL OR v.client_id = p_client_id)
      AND (p_rep_id IS NULL OR v.representante_id = p_rep_id)
      AND (p_product_id IS NULL OR v.product_id = p_product_id)
      AND (p_lab_id IS NULL OR v.laboratorio_id = p_lab_id)
      AND (p_fuente IS NULL OR v.fuente = p_fuente)
      AND COALESCE(description, sku) IS NOT NULL
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT p_top_n
  ) t;

  RETURN jsonb_build_object(
    'totals', v_totals,
    'by_month', v_by_month,
    'top_rep', v_top_rep,
    'top_client', v_top_client,
    'top_lab', v_top_lab,
    'top_product', v_top_product
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ventas_unified_stats(date,date,uuid,uuid,uuid,uuid,text,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ventas_unified_stats(date,date,uuid,uuid,uuid,uuid,text,int) TO service_role;
