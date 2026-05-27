
-- 1) Add missing columns to clientes
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS company text,
  ADD COLUMN IF NOT EXISTS central text,
  ADD COLUMN IF NOT EXISTS curp text,
  ADD COLUMN IF NOT EXISTS codigo_postal text,
  ADD COLUMN IF NOT EXISTS nombre_cfdi text;

-- 2) Recreate clients view exposing all columns the frontend needs
DROP VIEW IF EXISTS public.clients CASCADE;
CREATE VIEW public.clients AS
SELECT
  id,
  razon_social,
  razon_social AS name,
  nombre_comercial AS nickname,
  company,
  central,
  curp,
  codigo_postal,
  nombre_cfdi,
  contact,
  COALESCE(phone, telefono) AS phone,
  email,
  direccion AS address,
  rfc,
  client_type,
  payment_method,
  active,
  cfdi_pdf_path,
  notas AS notes,
  delivery_window_from,
  delivery_window_until,
  delivery_notes,
  price_list_id,
  payment_terms,
  credit_limit,
  token_portal,
  portal_activo,
  created_at,
  updated_at
FROM public.clientes;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;

-- 3) INSTEAD OF trigger function with all fields
CREATE OR REPLACE FUNCTION public.clients_iud_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    insert into public.clientes (
      id, razon_social, nombre_comercial, company, central, curp, codigo_postal, nombre_cfdi,
      contact, phone, telefono, email, direccion,
      rfc, client_type, payment_method, active, cfdi_pdf_path, notas,
      delivery_window_from, delivery_window_until, delivery_notes,
      price_list_id, payment_terms, credit_limit
    ) values (
      coalesce(new.id, gen_random_uuid()),
      coalesce(new.razon_social, new.name, ''),
      new.nickname, new.company, new.central, new.curp, new.codigo_postal, new.nombre_cfdi,
      new.contact, new.phone, new.phone, new.email,
      new.address, new.rfc, coalesce(new.client_type,'menudeo'), new.payment_method,
      coalesce(new.active, true), new.cfdi_pdf_path, new.notes,
      new.delivery_window_from, new.delivery_window_until, new.delivery_notes,
      new.price_list_id, new.payment_terms, new.credit_limit
    ) returning id into new.id;
    return new;
  elsif tg_op = 'UPDATE' then
    update public.clientes set
      razon_social          = coalesce(new.razon_social, new.name, razon_social),
      nombre_comercial      = new.nickname,
      company               = new.company,
      central               = new.central,
      curp                  = new.curp,
      codigo_postal         = new.codigo_postal,
      nombre_cfdi           = new.nombre_cfdi,
      contact               = new.contact,
      phone                 = new.phone,
      telefono              = coalesce(new.phone, telefono),
      email                 = new.email,
      direccion             = new.address,
      rfc                   = new.rfc,
      client_type           = coalesce(new.client_type, client_type),
      payment_method        = new.payment_method,
      active                = coalesce(new.active, active),
      cfdi_pdf_path         = new.cfdi_pdf_path,
      notas                 = new.notes,
      delivery_window_from  = new.delivery_window_from,
      delivery_window_until = new.delivery_window_until,
      delivery_notes        = new.delivery_notes,
      price_list_id         = new.price_list_id,
      payment_terms         = new.payment_terms,
      credit_limit          = new.credit_limit,
      updated_at            = now()
    where id = old.id;
    return new;
  elsif tg_op = 'DELETE' then
    delete from public.clientes where id = old.id;
    return old;
  end if;
  return null;
end $function$;

DROP TRIGGER IF EXISTS clients_iud ON public.clients;
CREATE TRIGGER clients_iud
INSTEAD OF INSERT OR UPDATE OR DELETE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.clients_iud_trigger();

-- 4) Make order_summary.central pull from the real column
CREATE OR REPLACE VIEW public.order_summary AS
SELECT p.id,
    COALESCE(p.order_code, p.folio) AS order_code,
    p.created_at::date AS order_date,
    p.delivery_date,
    p.estado::text AS status,
    p.urgency,
    p.notas_cliente AS notes,
    p.cliente_id AS client_id,
    c.razon_social AS client_name,
    COALESCE(c.phone, c.telefono) AS client_phone,
    c.central,
    c.client_type,
    (( SELECT count(*)::int
           FROM pedido_items pi
          WHERE pi.pedido_id = p.id)) AS line_items,
    p.subtotal,
    p.discount_amount,
    p.discount_reason,
    GREATEST(p.total - COALESCE(p.discount_amount, 0::numeric), 0::numeric) AS total_with_iva,
    0 AS manual_price_count,
    COALESCE(p.fulfillment_method, 'delivery'::text) AS fulfillment_method,
    p.needs_approval,
    c.delivery_window_from,
    c.delivery_window_until,
    c.delivery_notes
FROM pedidos p
LEFT JOIN clientes c ON c.id = p.cliente_id;

GRANT SELECT ON public.order_summary TO authenticated;
GRANT ALL ON public.order_summary TO service_role;
