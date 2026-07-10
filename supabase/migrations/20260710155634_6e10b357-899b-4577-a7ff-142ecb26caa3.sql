DROP VIEW IF EXISTS public.v_compras_planeacion CASCADE;

CREATE VIEW public.v_compras_planeacion AS
WITH ventas AS (
  SELECT
    m.producto_id,
    SUM(CASE WHEN m.created_at >= now() - interval '30 days' THEN m.cantidad ELSE 0 END)  AS v_30d,
    SUM(CASE WHEN m.created_at >= now() - interval '60 days' THEN m.cantidad ELSE 0 END)  AS v_60d,
    SUM(CASE WHEN m.created_at >= now() - interval '90 days' THEN m.cantidad ELSE 0 END)  AS v_90d,
    SUM(CASE WHEN m.created_at >= now() - interval '365 days' THEN m.cantidad ELSE 0 END) AS v_365d
  FROM public.movimientos_inventario m
  WHERE m.tipo = 'venta'
  GROUP BY m.producto_id
),
stock_agg AS (
  SELECT producto_id, COALESCE(SUM(cantidad),0) AS stock_fisico
  FROM public.stock GROUP BY producto_id
),
pendiente_oc AS (
  SELECT oi.producto_id,
         COALESCE(SUM(oi.cantidad - oi.cantidad_recibida), 0) AS en_camino
  FROM public.oc_items oi
  JOIN public.ordenes_compra o ON o.id = oi.oc_id
  WHERE o.estado IN ('enviada','parcial')
  GROUP BY oi.producto_id
),
promos_activas AS (
  SELECT DISTINCT product_id
  FROM public.product_promotions
  WHERE active = true
    AND valid_from <= (current_date + interval '30 days')
    AND valid_to >= current_date
)
SELECT
  p.id AS producto_id,
  p.sku, p.nombre,
  p.laboratorio_id, l.nombre AS laboratorio,
  p.categoria,
  p.precio_lista, p.costo,
  p.promo,
  (pa.product_id IS NOT NULL) AS promo_activa,
  COALESCE(sa.stock_fisico, 0) AS stock_fisico,
  COALESCE(p.stock_comprometido, 0) AS stock_comprometido,
  COALESCE(po.en_camino, 0) AS en_camino,
  GREATEST(COALESCE(sa.stock_fisico,0) - COALESCE(p.stock_comprometido,0), 0) AS stock_disponible,
  COALESCE(v.v_30d, 0)  AS ventas_30d,
  COALESCE(v.v_60d, 0)  AS ventas_60d,
  COALESCE(v.v_90d, 0)  AS ventas_90d,
  COALESCE(v.v_365d, 0) AS ventas_365d,
  ROUND(COALESCE(v.v_30d, 0) / 30.0, 3) AS consumo_diario,
  CASE WHEN COALESCE(v.v_60d,0) > 0
       THEN ROUND(((COALESCE(v.v_30d,0) * 2.0) - COALESCE(v.v_60d,0)) / NULLIF(COALESCE(v.v_60d,0),0) * 100, 2)
       ELSE NULL END AS tendencia_pct,
  CASE WHEN COALESCE(v.v_30d,0) > 0
       THEN ROUND((GREATEST(COALESCE(sa.stock_fisico,0) - COALESCE(p.stock_comprometido,0), 0)) / (v.v_30d / 30.0), 1)
       ELSE NULL END AS dias_cobertura,
  COALESCE(psp.dias_cobertura_objetivo, 30) AS dias_cobertura_objetivo,
  COALESCE(psp.stock_min, p.stock_minimo, 0) AS stock_min,
  COALESCE(psp.stock_max, 0) AS stock_max,
  COALESCE(psp.punto_reorden, p.stock_minimo, 0) AS punto_reorden,
  COALESCE(psp.lead_time_dias, 14) AS lead_time_dias,
  LEAST(
    GREATEST(
      0,
      CEIL(
        (COALESCE(psp.dias_cobertura_objetivo, 30) + COALESCE(psp.dias_seguridad, 7))
        * (COALESCE(v.v_30d,0) / 30.0)
        * (CASE WHEN pa.product_id IS NOT NULL THEN 1.3 ELSE 1.0 END)
        - (GREATEST(COALESCE(sa.stock_fisico,0) - COALESCE(p.stock_comprometido,0), 0) + COALESCE(po.en_camino,0))
      )
    ),
    CASE
      WHEN COALESCE(psp.stock_max, 0) > 0
      THEN GREATEST(0, COALESCE(psp.stock_max, 0)
                       - (GREATEST(COALESCE(sa.stock_fisico,0) - COALESCE(p.stock_comprometido,0), 0)
                          + COALESCE(po.en_camino, 0)))
      ELSE 1e18
    END
  )::numeric AS cantidad_sugerida
FROM public.productos p
LEFT JOIN public.laboratorios l ON l.id = p.laboratorio_id
LEFT JOIN stock_agg sa ON sa.producto_id = p.id
LEFT JOIN pendiente_oc po ON po.producto_id = p.id
LEFT JOIN ventas v ON v.producto_id = p.id
LEFT JOIN public.product_stock_params psp ON psp.producto_id = p.id
LEFT JOIN promos_activas pa ON pa.product_id = p.id
WHERE p.activo = true;

GRANT SELECT ON public.v_compras_planeacion TO authenticated;