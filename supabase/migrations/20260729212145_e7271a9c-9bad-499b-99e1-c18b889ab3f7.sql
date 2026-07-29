CREATE OR REPLACE FUNCTION public.get_order_for_signature(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', p.id,
    'order_code', COALESCE(p.order_code, p.folio),
    'order_date', p.created_at::date,
    'delivery_date', p.delivery_date,
    'status', p.estado::text,
    'notes', p.notas_cliente,
    'signed_at', p.signed_at,
    'signed_by_name', p.signed_by_name,
    'signature_path', p.signature_path,
    'discount_amount', p.discount_amount,
    'discount_reason', p.discount_reason,
    'client', jsonb_build_object(
      'name', c.razon_social,
      'company', COALESCE(c.company, c.nombre_comercial),
      'phone', COALESCE(c.telefono, c.phone),
      'address', c.direccion
    ),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id,
        'clave', COALESCE(i.sku_snapshot, pr.sku, ''),
        'name', COALESCE(i.nombre_snapshot, pr.nombre, ''),
        'image_url', pr.imagen_url,
        'quantity', i.cantidad,
        'unit_price', i.precio_unitario,
        'is_damaged', COALESCE(i.is_damaged, false),
        'damaged_condition', db.condition
      ) ORDER BY i.nombre_snapshot)
      FROM public.pedido_items i
      LEFT JOIN public.productos pr ON pr.id = i.producto_id
      LEFT JOIN public.damaged_batches db ON db.id = i.damaged_batch_id
      WHERE i.pedido_id = p.id
    ), '[]'::jsonb),
    'stops', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id,
        'stop_index', s.stop_index,
        'address', s.address,
        'client_label', s.client_label,
        'contact_name', s.contact_name,
        'contact_phone', s.contact_phone,
        'notes', s.notes,
        'manual_maps_url', s.manual_maps_url,
        'signed_at', s.signed_at,
        'signed_by_name', s.signed_by_name,
        'signature_path', s.signature_path,
        'allocations', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('order_item_id', si.order_item_id, 'quantity', si.quantity))
          FROM public.order_stop_items si WHERE si.stop_id = s.id
        ), '[]'::jsonb)
      ) ORDER BY s.stop_index)
      FROM public.order_stops s
      WHERE s.order_id = p.id
    ), '[]'::jsonb)
  )
  FROM public.pedidos p
  LEFT JOIN public.clientes c ON c.id = p.cliente_id
  WHERE p.signature_token = p_token
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_order_for_signature(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_for_signature(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_stop_signature(
  p_token text,
  p_stop_index integer,
  p_signed_by_name text,
  p_signature_path text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_stop_id uuid;
  v_pending integer;
BEGIN
  SELECT id INTO v_order_id FROM public.pedidos WHERE signature_token = p_token;
  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Link inválido';
  END IF;

  SELECT id INTO v_stop_id
  FROM public.order_stops
  WHERE order_id = v_order_id AND stop_index = p_stop_index;

  IF v_stop_id IS NULL THEN
    INSERT INTO public.order_stops (order_id, stop_index, address, signed_at, signed_by_name, signature_path)
    SELECT v_order_id, p_stop_index, COALESCE(c.direccion, ''), now(), p_signed_by_name, p_signature_path
    FROM public.pedidos p LEFT JOIN public.clientes c ON c.id = p.cliente_id
    WHERE p.id = v_order_id
    RETURNING id INTO v_stop_id;
  ELSE
    UPDATE public.order_stops
    SET signed_at = COALESCE(signed_at, now()),
        signed_by_name = COALESCE(signed_by_name, p_signed_by_name),
        signature_path = COALESCE(signature_path, p_signature_path)
    WHERE id = v_stop_id;
  END IF;

  SELECT count(*) INTO v_pending
  FROM public.order_stops
  WHERE order_id = v_order_id AND signed_at IS NULL;

  IF v_pending = 0 THEN
    UPDATE public.pedidos
    SET signed_at = COALESCE(signed_at, now()),
        signed_by_name = COALESCE(signed_by_name, p_signed_by_name),
        signature_path = COALESCE(signature_path, p_signature_path),
        estado = 'Entregado'
    WHERE id = v_order_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'pending_stops', v_pending);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_stop_signature(text, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_stop_signature(text, integer, text, text) TO anon, authenticated, service_role;