DROP VIEW public.orders;
ALTER TABLE public.pedidos ALTER COLUMN signature_token TYPE text USING signature_token::text;
CREATE VIEW public.orders AS
 SELECT id,
    cliente_id AS client_id,
    COALESCE(order_code, folio) AS order_code,
    COALESCE(delivery_date, created_at::date) AS order_date,
    delivery_date,
    estado::text AS status,
    notas_cliente AS notes,
    discount_amount,
    discount_reason,
    fulfillment_method,
    urgency,
    needs_approval,
    signature_token,
    signed_at,
    signed_by_name,
    signature_path,
    subtotal,
    iva,
    total,
    price_list_id,
    created_at,
    updated_at
   FROM pedidos p;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;