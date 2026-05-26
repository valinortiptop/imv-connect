-- =====================================================================
-- 0013 — Overlay EN sobre tablas ES (clientes, pedidos, pedido_items,
-- productos). Crea: columnas faltantes, tablas nuevas (price_lists,
-- client_price_overrides), y vistas EN (clients, orders, order_items,
-- products, order_summary) con triggers INSTEAD OF para CRUD.
-- Idempotente.
-- =====================================================================

-- ---------- 1) Columnas faltantes en clientes ----------
alter table public.clientes
  add column if not exists nickname text,
  add column if not exists contact text,
  add column if not exists phone text,
  add column if not exists email_extra text,
  add column if not exists client_type text not null default 'menudeo'
    check (client_type in ('mayoreo','menudeo')),
  add column if not exists payment_method text,
  add column if not exists active boolean not null default true,
  add column if not exists cfdi_pdf_path text,
  add column if not exists delivery_window_from time,
  add column if not exists delivery_window_until time,
  add column if not exists delivery_notes text,
  add column if not exists price_list_id uuid,
  add column if not exists payment_terms integer,
  add column if not exists credit_limit numeric(12,2);

-- ---------- 2) Columnas faltantes en pedidos ----------
alter table public.pedidos
  add column if not exists order_code text,
  add column if not exists delivery_date date,
  add column if not exists discount_amount numeric(12,2) not null default 0,
  add column if not exists discount_reason text,
  add column if not exists fulfillment_method text default 'delivery',
  add column if not exists urgency boolean default false,
  add column if not exists needs_approval boolean default false,
  add column if not exists signature_token uuid,
  add column if not exists signed_at timestamptz,
  add column if not exists signed_by_name text,
  add column if not exists signature_path text;

-- Backfill order_code desde folio si está vacío
update public.pedidos set order_code = folio where order_code is null;

-- ---------- 3) Tabla price_lists ----------
create table if not exists public.price_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  markup_pct numeric(6,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.price_lists enable row level security;
drop policy if exists "auth_rw_price_lists" on public.price_lists;
create policy "auth_rw_price_lists" on public.price_lists
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.price_lists to authenticated;
grant all on public.price_lists to service_role;

-- FK perezosa (no enforced contra clientes.price_list_id para evitar issues con datos)
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'clientes_price_list_id_fkey'
  ) then
    alter table public.clientes
      add constraint clientes_price_list_id_fkey
      foreign key (price_list_id) references public.price_lists(id) on delete set null;
  end if;
end $$;

-- ---------- 4) Tabla client_price_overrides ----------
create table if not exists public.client_price_overrides (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clientes(id) on delete cascade,
  product_id uuid not null references public.productos(id) on delete cascade,
  unit_price numeric(12,2) not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, product_id)
);

create index if not exists cpo_client_idx on public.client_price_overrides(client_id);
create index if not exists cpo_product_idx on public.client_price_overrides(product_id);

alter table public.client_price_overrides enable row level security;
drop policy if exists "auth_rw_cpo" on public.client_price_overrides;
create policy "auth_rw_cpo" on public.client_price_overrides
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.client_price_overrides to authenticated;
grant all on public.client_price_overrides to service_role;

-- ---------- 5) View `products` (re-aliasa v_products_with_stock) ----------
drop view if exists public.products;
create view public.products as
  select * from public.v_products_with_stock;
grant select on public.products to authenticated;

-- ---------- 6) View `clients` ES→EN + INSTEAD OF triggers ----------
drop view if exists public.clients cascade;
create view public.clients as
select
  c.id,
  c.razon_social        as name,
  c.nombre_comercial    as nickname,
  c.contact             as contact,
  coalesce(c.phone, c.telefono) as phone,
  c.email,
  c.direccion           as address,
  c.rfc,
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

create or replace function public.clients_iud_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.clientes (
      id, razon_social, nombre_comercial, contact, phone, telefono, email, direccion,
      rfc, client_type, payment_method, active, cfdi_pdf_path, notas,
      delivery_window_from, delivery_window_until, delivery_notes,
      price_list_id, payment_terms, credit_limit
    ) values (
      coalesce(new.id, gen_random_uuid()),
      coalesce(new.name, ''), new.nickname, new.contact, new.phone, new.phone, new.email,
      new.address, new.rfc, coalesce(new.client_type,'menudeo'), new.payment_method,
      coalesce(new.active, true), new.cfdi_pdf_path, new.notes,
      new.delivery_window_from, new.delivery_window_until, new.delivery_notes,
      new.price_list_id, new.payment_terms, new.credit_limit
    ) returning id into new.id;
    return new;
  elsif tg_op = 'UPDATE' then
    update public.clientes set
      razon_social          = coalesce(new.name, razon_social),
      nombre_comercial      = new.nickname,
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
end $$;

drop trigger if exists clients_iud on public.clients;
create trigger clients_iud instead of insert or update or delete on public.clients
  for each row execute function public.clients_iud_trigger();

-- ---------- 7) View `orders` + INSTEAD OF (update + delete) ----------
drop view if exists public.orders cascade;
create view public.orders as
select
  p.id,
  p.cliente_id          as client_id,
  coalesce(p.order_code, p.folio) as order_code,
  p.created_at::date    as order_date,
  p.delivery_date,
  p.estado::text        as status,
  p.notas_cliente       as notes,
  p.discount_amount,
  p.discount_reason,
  p.fulfillment_method,
  p.urgency,
  p.needs_approval,
  p.signature_token,
  p.signed_at,
  p.signed_by_name,
  p.signature_path,
  p.subtotal,
  p.iva,
  p.total,
  p.created_at,
  p.updated_at
from public.pedidos p;

grant select, insert, update, delete on public.orders to authenticated;

create or replace function public.orders_iud_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
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
      updated_at        = now()
    where id = old.id;
    return new;
  elsif tg_op = 'DELETE' then
    delete from public.pedidos where id = old.id;
    return old;
  end if;
  return null;
end $$;

drop trigger if exists orders_iud on public.orders;
create trigger orders_iud instead of update or delete on public.orders
  for each row execute function public.orders_iud_trigger();

-- ---------- 8) View `order_items` (read-only por ahora) ----------
drop view if exists public.order_items cascade;
create view public.order_items as
select
  i.id,
  i.pedido_id        as order_id,
  i.producto_id      as product_id,
  i.cantidad         as quantity,
  i.precio_unitario  as unit_price_override,
  i.nombre_snapshot  as name_snapshot,
  i.sku_snapshot     as clave_snapshot,
  i.iva_pct,
  i.importe          as amount
from public.pedido_items i;

grant select on public.order_items to authenticated;

-- ---------- 9) View `order_summary` (agregado por pedido) ----------
drop view if exists public.order_summary cascade;
create view public.order_summary as
select
  p.id,
  coalesce(p.order_code, p.folio)                              as order_code,
  p.created_at::date                                           as order_date,
  p.delivery_date,
  p.estado::text                                               as status,
  p.urgency,
  p.notas_cliente                                              as notes,
  p.cliente_id                                                 as client_id,
  c.razon_social                                               as client_name,
  coalesce(c.phone, c.telefono)                                as client_phone,
  null::text                                                   as central,
  c.client_type::text                                          as client_type,
  (select count(*) from public.pedido_items pi where pi.pedido_id = p.id)::int as line_items,
  p.subtotal                                                   as subtotal,
  p.discount_amount,
  p.discount_reason,
  greatest(p.total - coalesce(p.discount_amount, 0), 0)        as total_with_iva,
  0::int                                                       as manual_price_count,
  coalesce(p.fulfillment_method,'delivery')                    as fulfillment_method,
  p.needs_approval,
  c.delivery_window_from,
  c.delivery_window_until,
  c.delivery_notes
from public.pedidos p
left join public.clientes c on c.id = p.cliente_id;

grant select on public.order_summary to authenticated;
