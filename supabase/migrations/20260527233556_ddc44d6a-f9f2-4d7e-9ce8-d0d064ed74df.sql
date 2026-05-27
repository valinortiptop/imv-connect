
CREATE OR REPLACE FUNCTION public.create_order_with_client(
  p_client_name text,
  p_phone text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_rfc text DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_delivery_date date DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
  v_order_id uuid;
  v_name text := nullif(btrim(coalesce(p_client_name,'')), '');
BEGIN
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'client_name_required';
  END IF;

  SELECT id INTO v_client_id
    FROM public.clientes
   WHERE lower(coalesce(nombre_comercial, razon_social)) = lower(v_name)
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_client_id IS NULL THEN
    INSERT INTO public.clientes (
      razon_social, nombre_comercial, telefono, phone, direccion, rfc, payment_method, active
    ) VALUES (
      v_name, v_name, p_phone, p_phone, p_address, p_rfc, p_payment_method, true
    )
    RETURNING id INTO v_client_id;
  END IF;

  INSERT INTO public.pedidos (
    cliente_id, contacto_nombre, contacto_telefono, notas_cliente,
    delivery_date, estado
  ) VALUES (
    v_client_id, v_name, p_phone, p_notes,
    p_delivery_date, 'Nuevo'
  )
  RETURNING id INTO v_order_id;

  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_with_client(text, text, text, text, text, text, date) FROM public;
GRANT EXECUTE ON FUNCTION public.create_order_with_client(text, text, text, text, text, text, date) TO authenticated, service_role;
