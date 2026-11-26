CREATE OR REPLACE FUNCTION public.user_display_name(_uid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.is_staff(auth.uid()) THEN
    (SELECT COALESCE(NULLIF(u.raw_user_meta_data->>'full_name',''), NULLIF(u.raw_user_meta_data->>'name',''), split_part(u.email,'@',1))
       FROM auth.users u WHERE u.id = _uid) END
$$;
REVOKE EXECUTE ON FUNCTION public.user_display_name(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_display_name(uuid) TO authenticated, service_role;

DROP VIEW public.v_cardex_material;
CREATE VIEW public.v_cardex_material WITH (security_invoker = true) AS
 SELECT m.id, m.created_at AS fecha, m.producto_id, p.sku AS clave, p.nombre AS articulo, m.lote, m.caducidad, a.nombre AS almacen,
    (m.tipo)::text AS tipo,
    CASE WHEN ((m.tipo)::text = ANY (ARRAY['entrada','devolucion'])) THEN 'Entrada'
         WHEN ((m.tipo)::text = ANY (ARRAY['salida','venta'])) THEN 'Salida' ELSE 'Ajuste' END AS naturaleza,
    CASE WHEN ((m.tipo)::text = ANY (ARRAY['entrada','devolucion'])) THEN abs(m.cantidad)
         WHEN ((m.tipo)::text = ANY (ARRAY['salida','venta'])) THEN (- abs(m.cantidad)) ELSE m.cantidad END AS cantidad,
    COALESCE(m.origen_tipo, (m.tipo)::text) AS origen, m.referencia, m.notas,
    public.user_display_name(m.created_by) AS usuario
   FROM movimientos_inventario m
     LEFT JOIN productos p ON p.id = m.producto_id
     LEFT JOIN almacenes a ON a.id = m.almacen_id;
GRANT SELECT ON public.v_cardex_material TO authenticated, service_role;