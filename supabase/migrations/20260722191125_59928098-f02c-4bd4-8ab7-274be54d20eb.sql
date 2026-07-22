
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS price_list_id uuid REFERENCES public.price_lists(id) ON DELETE SET NULL;

DROP VIEW IF EXISTS public.orders CASCADE;

CREATE VIEW public.orders AS
SELECT id,
    cliente_id AS client_id,
    COALESCE(order_code, folio) AS order_code,
    created_at::date AS order_date,
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
FROM public.pedidos p;

ALTER VIEW public.orders SET (security_invoker = on);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

CREATE OR REPLACE FUNCTION public.orders_iud_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'UPDATE' then
    update public.pedidos set
      cliente_id        = coalesce(new.client_id, cliente_id),
      order_code        = coalesce(new.order_code, order_code),
      delivery_date     = new.delivery_date,
      estado            = coalesce(new.status::public.pedido_estado, estado),
      notas_cliente     = new.notes,
      discount_amount   = coalesce(new.discount_amount, discount_amount),
      discount_reason   = new.discount_reason,
      fulfillment_method= coalesce(new.fulfillment_method, fulfillment_method),
      urgency           = coalesce(new.urgency, urgency),
      needs_approval    = coalesce(new.needs_approval, needs_approval),
      signature_token   = new.signature_token,
      signed_at         = new.signed_at,
      signed_by_name    = new.signed_by_name,
      signature_path    = new.signature_path,
      price_list_id     = new.price_list_id,
      updated_at        = now()
    where id = old.id;
    return new;
  elsif tg_op = 'DELETE' then
    delete from public.pedidos where id = old.id;
    return old;
  end if;
  return null;
end $function$;

CREATE TRIGGER orders_iud_trigger
INSTEAD OF UPDATE OR DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_iud_trigger();
