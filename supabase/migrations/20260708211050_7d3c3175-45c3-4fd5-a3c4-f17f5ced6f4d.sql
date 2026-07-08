
CREATE OR REPLACE VIEW public.v_kardex_movements
WITH (security_invoker=on) AS
SELECT
  mi.id,
  mi.created_at,
  NULL::uuid AS slot_id,
  NULL::text AS slot_code,
  mi.producto_id AS product_id,
  CASE
    WHEN mi.tipo::text = 'salida' THEN -abs(mi.cantidad)
    WHEN mi.tipo::text = 'entrada' THEN abs(mi.cantidad)
    ELSE mi.cantidad
  END AS delta,
  CASE
    WHEN mi.pedido_id IS NOT NULL THEN 'pedido'
    WHEN mi.tipo::text = 'entrada' AND coalesce(mi.referencia,'') = 'ajuste' THEN 'ajuste'
    WHEN mi.tipo::text = 'entrada' THEN 'entrada'
    WHEN mi.tipo::text = 'salida' THEN 'pedido'
    ELSE 'ajuste'
  END AS reason,
  mi.notas AS note,
  NULL::text AS lote,
  mi.referencia AS description,
  p.sku AS product_clave,
  p.nombre AS product_name,
  p.imagen_url AS product_image_url,
  'inventario'::text AS source
FROM public.movimientos_inventario mi
LEFT JOIN public.productos p ON p.id = mi.producto_id
UNION ALL
SELECT
  sm.id,
  sm.created_at,
  sm.slot_id,
  ws.code AS slot_code,
  sm.product_id,
  CASE
    WHEN sm.reason IN ('pedido','salida') THEN -abs(sm.quantity)
    WHEN sm.reason = 'reubicacion' THEN sm.quantity
    ELSE abs(sm.quantity)
  END AS delta,
  sm.reason,
  NULL::text AS note,
  NULL::text AS lote,
  NULL::text AS description,
  p.sku AS product_clave,
  p.nombre AS product_name,
  p.imagen_url AS product_image_url,
  'slot'::text AS source
FROM public.slot_movements sm
LEFT JOIN public.warehouse_slots ws ON ws.id = sm.slot_id
LEFT JOIN public.productos p ON p.id = sm.product_id;

GRANT SELECT ON public.v_kardex_movements TO authenticated;
GRANT SELECT ON public.v_kardex_movements TO service_role;
