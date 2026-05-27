-- =====================================================================
-- 0024 — Add missing client columns the UI sends (company, central, curp,
-- codigo_postal, nombre_cfdi) and surface razon_social directly on the
-- `clients` view. Without these, INSERT/UPDATE through the view fails
-- with 400 ("column does not exist") in PostgREST.
-- Idempotente.
-- =====================================================================

alter table public.clientes
  add column if not exists company text,
  add column if not exists central text,
  add column if not exists curp text,
  add column if not exists codigo_postal text,
  add column if not exists nombre_cfdi text;

-- Recreate the EN-overlay view exposing the new columns + razon_social.
drop view if exists public.clients cascade;
create view public.clients as
select
  c.id,
  c.razon_social        as name,
  c.razon_social,
  c.nombre_comercial    as nickname,
  c.company,
  c.contact             as contact,
  coalesce(c.phone, c.telefono) as phone,
  c.email,
  c.direccion           as address,
  c.central,
  c.rfc,
  c.curp,
  c.codigo_postal,
  c.nombre_cfdi,
  c.client_type,
  c.payment_method,
  c.active,
  c.cfdi_pdf_path,
  c.notas               as notes,
  c.delivery_window_from,
  c.delivery_window_until,
  c.delivery_notes,
  c.price_list_id,
  c.payment_terms,
  c.credit_limit,
  c.token_portal,
  c.portal_activo,
  c.created_at,
  c.updated_at
from public.clientes c;

grant select, insert, update, delete on public.clients to authenticated;
grant all on public.clients to service_role;

create or replace function public.clients_iud_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.clientes (
      id, razon_social, nombre_comercial, company, contact, phone, telefono, email, direccion,
      central, rfc, curp, codigo_postal, nombre_cfdi,
      client_type, payment_method, active, cfdi_pdf_path, notas,
      delivery_window_from, delivery_window_until, delivery_notes,
      price_list_id, payment_terms, credit_limit
    ) values (
      coalesce(new.id, gen_random_uuid()),
      coalesce(nullif(new.razon_social, ''), new.name, ''),
      new.nickname, new.company, new.contact, new.phone, new.phone, new.email,
      new.address, new.central, new.rfc, new.curp, new.codigo_postal, new.nombre_cfdi,
      coalesce(new.client_type,'menudeo'), new.payment_method,
      coalesce(new.active, true), new.cfdi_pdf_path, new.notes,
      new.delivery_window_from, new.delivery_window_until, new.delivery_notes,
      new.price_list_id, new.payment_terms, new.credit_limit
    ) returning id into new.id;
    return new;
  elsif tg_op = 'UPDATE' then
    update public.clientes set
      razon_social          = coalesce(nullif(new.razon_social, ''), new.name, razon_social),
      nombre_comercial      = new.nickname,
      company               = new.company,
      contact               = new.contact,
      phone                 = new.phone,
      telefono              = coalesce(new.phone, telefono),
      email                 = new.email,
      direccion             = new.address,
      central               = new.central,
      rfc                   = new.rfc,
      curp                  = new.curp,
      codigo_postal         = new.codigo_postal,
      nombre_cfdi           = new.nombre_cfdi,
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
end $$;

drop trigger if exists clients_iud on public.clients;
create trigger clients_iud instead of insert or update or delete on public.clients
  for each row execute function public.clients_iud_trigger();
