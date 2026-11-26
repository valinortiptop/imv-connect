CREATE OR REPLACE VIEW public.v_cardex_material AS
 SELECT m.id, m.created_at AS fecha, m.producto_id, p.sku AS clave, p.nombre AS articulo, m.lote, m.caducidad, a.nombre AS almacen,
    (m.tipo)::text AS tipo,
    CASE WHEN ((m.tipo)::text = ANY (ARRAY['entrada','devolucion'])) THEN 'Entrada'
         WHEN ((m.tipo)::text = ANY (ARRAY['salida','venta'])) THEN 'Salida' ELSE 'Ajuste' END AS naturaleza,
    CASE WHEN ((m.tipo)::text = ANY (ARRAY['entrada','devolucion'])) THEN abs(m.cantidad)
         WHEN ((m.tipo)::text = ANY (ARRAY['salida','venta'])) THEN (- abs(m.cantidad)) ELSE m.cantidad END AS cantidad,
    COALESCE(m.origen_tipo, (m.tipo)::text) AS origen, m.referencia, m.notas,
    COALESCE(NULLIF(u.raw_user_meta_data->>'full_name',''), NULLIF(u.raw_user_meta_data->>'name',''), split_part(u.email,'@',1)) AS usuario
   FROM movimientos_inventario m
     LEFT JOIN productos p ON p.id = m.producto_id
     LEFT JOIN almacenes a ON a.id = m.almacen_id
     LEFT JOIN auth.users u ON u.id = m.created_by;