ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS lat numeric,
  ADD COLUMN IF NOT EXISTS lng numeric,
  ADD COLUMN IF NOT EXISTS google_place_id text;

DROP VIEW IF EXISTS public.clients CASCADE;
CREATE VIEW public.clients
  WITH (security_invoker = on) AS
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
  lat,
  lng,
  google_place_id,
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
      lat, lng, google_place_id,
      rfc, client_type, payment_method, active, cfdi_pdf_path, notas,
      delivery_window_from, delivery_window_until, delivery_notes,
      price_list_id, payment_terms, credit_limit
    ) values (
      coalesce(new.id, gen_random_uuid()),
      coalesce(new.razon_social, new.name, ''),
      new.nickname, new.company, new.central, new.curp, new.codigo_postal, new.nombre_cfdi,
      new.contact, new.phone, new.phone, new.email,
      new.address,
      new.lat, new.lng, new.google_place_id,
      new.rfc, coalesce(new.client_type,'menudeo'), new.payment_method,
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
      lat                   = new.lat,
      lng                   = new.lng,
      google_place_id       = new.google_place_id,
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