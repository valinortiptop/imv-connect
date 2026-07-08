
-- Helper: get or create the embarque slot ------------------------------------
CREATE OR REPLACE FUNCTION public.get_or_create_embarque_slot()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM public.warehouse_slots
  WHERE lower(coalesce(zone,'')) = 'embarque' AND active
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.warehouse_slots (code, block, row_letter, position, zone, access_type, active)
    VALUES ('EMBARQUE-01', 'EMB', 'A', 1, 'embarque', 'ground', true)
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END $$;

-- 1) get_order_fulfillment_state ---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_order_fulfillment_state(p_order_id uuid)
RETURNS TABLE(
  order_item_id uuid,
  product_id uuid,
  product_clave text,
  product_name text,
  product_image_url text,
  qty_needed numeric,
  qty_in_embarque numeric,
  qty_remaining numeric,
  embarque_slots jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pi.id AS order_item_id,
    pi.producto_id AS product_id,
    COALESCE(pi.sku_snapshot, pr.sku) AS product_clave,
    COALESCE(pi.nombre_snapshot, pr.nombre) AS product_name,
    pr.imagen_url AS product_image_url,
    pi.cantidad AS qty_needed,
    COALESCE((
      SELECT SUM(sc.quantity) FROM public.slot_contents sc
      WHERE sc.order_item_id = pi.id
    ), 0) AS qty_in_embarque,
    GREATEST(
      pi.cantidad - COALESCE((
        SELECT SUM(sc.quantity) FROM public.slot_contents sc
        WHERE sc.order_item_id = pi.id
      ), 0), 0
    ) AS qty_remaining,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'slot_code', ws.code,
        'quantity', sc.quantity,
        'lote', sc.lote,
        'content_id', sc.id
      ))
      FROM public.slot_contents sc
      JOIN public.warehouse_slots ws ON ws.id = sc.slot_id
      WHERE sc.order_item_id = pi.id
    ), '[]'::jsonb) AS embarque_slots
  FROM public.pedido_items pi
  LEFT JOIN public.productos pr ON pr.id = pi.producto_id
  WHERE pi.pedido_id = p_order_id
  ORDER BY pi.id;
$$;

-- 2) suggest_source_slots_for_picking ----------------------------------------
CREATE OR REPLACE FUNCTION public.suggest_source_slots_for_picking(
  p_product_id uuid,
  p_quantity numeric DEFAULT NULL
)
RETURNS TABLE(
  slot_content_id uuid,
  slot_id uuid,
  slot_code text,
  quantity numeric,
  lote text,
  expiration_date date,
  rank integer,
  reason_text text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    sc.id,
    sc.slot_id,
    ws.code,
    sc.quantity,
    sc.lote,
    sc.expiration_date,
    ROW_NUMBER() OVER (
      ORDER BY sc.expiration_date NULLS LAST, sc.quantity ASC, sc.created_at ASC
    )::int AS rank,
    CASE
      WHEN sc.expiration_date IS NOT NULL
        THEN 'Caduca ' || to_char(sc.expiration_date, 'DD/MM/YYYY')
      ELSE 'Sin caducidad · ' || sc.quantity::text || ' bultos'
    END AS reason_text
  FROM public.slot_contents sc
  JOIN public.warehouse_slots ws ON ws.id = sc.slot_id
  WHERE sc.product_id = p_product_id
    AND sc.order_item_id IS NULL
    AND sc.order_id IS NULL
    AND lower(coalesce(ws.zone,'')) <> 'embarque'
    AND sc.quantity > 0
    AND coalesce(ws.blocked, false) = false
  ORDER BY sc.expiration_date NULLS LAST, sc.quantity ASC, sc.created_at ASC;
$$;

-- 3) pick_order_item_to_embarque ---------------------------------------------
CREATE OR REPLACE FUNCTION public.pick_order_item_to_embarque(
  p_order_item_id uuid,
  p_source_content_id uuid,
  p_quantity numeric,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source public.slot_contents;
  v_item public.pedido_items;
  v_emb_slot uuid;
  v_new_id uuid;
  v_already numeric;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Cantidad inválida';
  END IF;

  SELECT * INTO v_source FROM public.slot_contents WHERE id = p_source_content_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Slot origen no encontrado'; END IF;
  IF v_source.quantity < p_quantity THEN
    RAISE EXCEPTION 'Cantidad excede el disponible (%): %', v_source.quantity, p_quantity;
  END IF;

  SELECT * INTO v_item FROM public.pedido_items WHERE id = p_order_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Línea de pedido no encontrada'; END IF;

  IF v_source.product_id IS DISTINCT FROM v_item.producto_id THEN
    RAISE EXCEPTION 'El producto del slot origen no coincide con la línea';
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_already
  FROM public.slot_contents WHERE order_item_id = p_order_item_id;
  IF v_already + p_quantity > v_item.cantidad THEN
    RAISE EXCEPTION 'Cantidad excede lo pendiente (pendiente: %)', v_item.cantidad - v_already;
  END IF;

  v_emb_slot := public.get_or_create_embarque_slot();

  -- Deduct from source
  UPDATE public.slot_contents
     SET quantity = quantity - p_quantity, updated_at = now()
   WHERE id = p_source_content_id;

  -- Remove empty source rows
  DELETE FROM public.slot_contents WHERE id = p_source_content_id AND quantity <= 0;

  -- Add / merge into embarque
  INSERT INTO public.slot_contents (slot_id, product_id, order_id, order_item_id, lote, expiration_date, quantity, description)
  VALUES (v_emb_slot, v_source.product_id, v_item.pedido_id, p_order_item_id, v_source.lote, v_source.expiration_date, p_quantity, p_note)
  RETURNING id INTO v_new_id;

  -- Log movement
  INSERT INTO public.slot_movements (slot_id, from_slot_id, to_slot_id, product_id, quantity, reason)
  VALUES (v_emb_slot, v_source.slot_id, v_emb_slot, v_source.product_id, p_quantity,
          'Surtido a embarque · pedido ' || v_item.pedido_id::text);

  RETURN jsonb_build_object('content_id', v_new_id, 'moved', p_quantity);
END $$;

-- 4) dispatch_order ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dispatch_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shipped numeric := 0;
  v_almacen uuid;
  r record;
BEGIN
  SELECT id INTO v_almacen FROM public.almacenes ORDER BY created_at LIMIT 1;

  FOR r IN
    SELECT sc.id, sc.product_id, sc.quantity
    FROM public.slot_contents sc
    JOIN public.warehouse_slots ws ON ws.id = sc.slot_id
    WHERE sc.order_id = p_order_id
      AND lower(coalesce(ws.zone,'')) = 'embarque'
  LOOP
    v_shipped := v_shipped + r.quantity;
    IF v_almacen IS NOT NULL AND r.product_id IS NOT NULL THEN
      INSERT INTO public.movimientos_inventario (tipo, producto_id, almacen_id, cantidad, pedido_id, referencia)
      VALUES ('salida', r.product_id, v_almacen, r.quantity, p_order_id, 'Despacho pedido');
    END IF;
    DELETE FROM public.slot_contents WHERE id = r.id;
  END LOOP;

  UPDATE public.pedidos SET estado = 'En ruta', updated_at = now() WHERE id = p_order_id;

  RETURN jsonb_build_object('shipped_bultos', v_shipped, 'new_status', 'En ruta');
END $$;

-- 5) mark_pickup_delivered ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_pickup_delivered(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shipped numeric := 0;
  v_almacen uuid;
  r record;
BEGIN
  SELECT id INTO v_almacen FROM public.almacenes ORDER BY created_at LIMIT 1;

  FOR r IN
    SELECT sc.id, sc.product_id, sc.quantity
    FROM public.slot_contents sc
    JOIN public.warehouse_slots ws ON ws.id = sc.slot_id
    WHERE sc.order_id = p_order_id
      AND lower(coalesce(ws.zone,'')) = 'embarque'
  LOOP
    v_shipped := v_shipped + r.quantity;
    IF v_almacen IS NOT NULL AND r.product_id IS NOT NULL THEN
      INSERT INTO public.movimientos_inventario (tipo, producto_id, almacen_id, cantidad, pedido_id, referencia)
      VALUES ('salida', r.product_id, v_almacen, r.quantity, p_order_id, 'Entrega pickup');
    END IF;
    DELETE FROM public.slot_contents WHERE id = r.id;
  END LOOP;

  UPDATE public.pedidos SET estado = 'Entregado', updated_at = now() WHERE id = p_order_id;

  RETURN jsonb_build_object('shipped_bultos', v_shipped, 'new_status', 'Entregado');
END $$;

-- Grants ---------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.get_or_create_embarque_slot() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_order_fulfillment_state(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.suggest_source_slots_for_picking(uuid, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pick_order_item_to_embarque(uuid, uuid, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dispatch_order(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_pickup_delivered(uuid) TO authenticated, service_role;
