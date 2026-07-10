ALTER TABLE public.slot_movements
  ADD COLUMN IF NOT EXISTS delta numeric,
  ADD COLUMN IF NOT EXISTS lote text,
  ADD COLUMN IF NOT EXISTS note text;

CREATE OR REPLACE FUNCTION public.list_recent_reubicaciones(p_limit int DEFAULT 30)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  minutes_ago numeric,
  quantity numeric,
  source_slot_code text,
  dest_slot_code text,
  product_clave text,
  product_name text,
  product_image_url text,
  lote text,
  description text,
  note text,
  user_id uuid,
  can_undo boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.created_at,
    (EXTRACT(EPOCH FROM (now() - m.created_at)) / 60.0)::numeric AS minutes_ago,
    m.quantity,
    fs.code AS source_slot_code,
    ts.code AS dest_slot_code,
    p.sku AS product_clave,
    p.nombre AS product_name,
    p.imagen_url AS product_image_url,
    m.lote,
    p.descripcion AS description,
    m.note,
    m.user_id,
    (now() - m.created_at) < interval '30 minutes' AS can_undo
  FROM public.slot_movements m
  LEFT JOIN public.warehouse_slots fs ON fs.id = m.from_slot_id
  LEFT JOIN public.warehouse_slots ts ON ts.id = m.to_slot_id
  LEFT JOIN public.productos p ON p.id = m.product_id
  WHERE m.from_slot_id IS NOT NULL AND m.to_slot_id IS NOT NULL
  ORDER BY m.created_at DESC
  LIMIT COALESCE(p_limit, 30);
$$;

GRANT EXECUTE ON FUNCTION public.list_recent_reubicaciones(int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.undo_movement(p_movement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created timestamptz;
BEGIN
  SELECT created_at INTO v_created FROM public.slot_movements WHERE id = p_movement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimiento no encontrado'; END IF;
  IF (now() - v_created) > interval '30 minutes' THEN
    RAISE EXCEPTION 'El movimiento tiene más de 30 minutos; usa Revertir en su lugar';
  END IF;
  DELETE FROM public.slot_movements WHERE id = p_movement_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.undo_movement(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.revert_movement(p_movement_id uuid, p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m public.slot_movements;
  v_new_id uuid;
BEGIN
  SELECT * INTO m FROM public.slot_movements WHERE id = p_movement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimiento no encontrado'; END IF;

  INSERT INTO public.slot_movements (
    slot_id, from_slot_id, to_slot_id, product_id, quantity, reason, user_id, lote, note, delta
  ) VALUES (
    m.slot_id, m.to_slot_id, m.from_slot_id, m.product_id, m.quantity, 'revert', auth.uid(), m.lote,
    COALESCE(p_note, 'Reversión de ' || m.id::text), m.quantity
  ) RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.revert_movement(uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';