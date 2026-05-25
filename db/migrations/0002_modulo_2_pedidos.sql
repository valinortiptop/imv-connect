-- =====================================================================
-- IMV Portal — Módulo 2: Pedidos / Cotizaciones desde el portal
-- Ejecutar en SQL Editor de tu Supabase (después del 0001).
-- Idempotente.
-- =====================================================================

-- ---------- Enum estado ----------
do $$ begin
  create type public.pedido_estado as enum
    ('pendiente','confirmado','enviado','entregado','cancelado');
exception when duplicate_object then null; end $$;

-- ---------- Tablas ----------
create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique
    default 'P-' || to_char(now(),'YYYYMMDD') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6),
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  estado public.pedido_estado not null default 'pendiente',
  subtotal numeric(12,2) not null default 0,
  iva numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notas_cliente text,
  notas_internas text,
  contacto_nombre text,
  contacto_telefono text,
  contacto_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pedidos_cliente_idx on public.pedidos(cliente_id);
create index if not exists pedidos_estado_idx on public.pedidos(estado);
create index if not exists pedidos_created_idx on public.pedidos(created_at desc);

create table if not exists public.pedido_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  producto_id uuid not null references public.productos(id) on delete restrict,
  nombre_snapshot text not null,
  sku_snapshot text,
  unidad_snapshot text not null default 'pieza',
  cantidad numeric(12,2) not null check (cantidad > 0),
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0),
  iva_pct numeric(5,2) not null default 16,
  importe numeric(12,2) generated always as (round(cantidad * precio_unitario, 2)) stored
);

create index if not exists pedido_items_pedido_idx on public.pedido_items(pedido_id);

-- ---------- RLS ----------
alter table public.pedidos      enable row level security;
alter table public.pedido_items enable row level security;

drop policy if exists "auth_rw_pedidos" on public.pedidos;
create policy "auth_rw_pedidos" on public.pedidos
  for all to authenticated using (true) with check (true);

drop policy if exists "auth_rw_pedido_items" on public.pedido_items;
create policy "auth_rw_pedido_items" on public.pedido_items
  for all to authenticated using (true) with check (true);

-- (No public/anon policies — el portal usa RPCs security definer.)

-- ---------- RPC: crear pedido desde portal (token-gated) ----------
-- Espera items: jsonb array [{producto_id: uuid, cantidad: number}]
create or replace function public.crear_pedido_para_token(
  _token uuid,
  _items jsonb,
  _notas_cliente text default null,
  _contacto_nombre text default null,
  _contacto_telefono text default null,
  _contacto_email text default null
) returns table (id uuid, folio text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente public.clientes;
  v_pedido_id uuid;
  v_folio text;
  v_subtotal numeric(12,2) := 0;
  v_iva numeric(12,2) := 0;
  v_item jsonb;
  v_prod record;
  v_precio numeric(12,2);
  v_qty numeric(12,2);
begin
  if _items is null or jsonb_array_length(_items) = 0 then
    raise exception 'pedido_vacio' using errcode = 'P0001';
  end if;

  select * into v_cliente
  from public.clientes
  where token_portal = _token and portal_activo = true;
  if not found then
    raise exception 'token_invalido' using errcode = 'P0001';
  end if;

  insert into public.pedidos (cliente_id, notas_cliente, contacto_nombre, contacto_telefono, contacto_email)
  values (v_cliente.id, _notas_cliente, _contacto_nombre, _contacto_telefono, _contacto_email)
  returning pedidos.id, pedidos.folio into v_pedido_id, v_folio;

  for v_item in select * from jsonb_array_elements(_items)
  loop
    v_qty := (v_item->>'cantidad')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'cantidad_invalida' using errcode = 'P0001';
    end if;

    select p.id, p.nombre, p.sku, p.unidad, p.iva_pct, p.precio_lista,
           coalesce(pc.precio, p.precio_lista) as precio
      into v_prod
    from public.productos p
    left join lateral (
      select precio from public.precios_cliente
      where cliente_id = v_cliente.id and producto_id = p.id
        and vigente_desde <= current_date
        and (vigente_hasta is null or vigente_hasta >= current_date)
      order by vigente_desde desc limit 1
    ) pc on true
    where p.id = (v_item->>'producto_id')::uuid and p.activo = true;

    if not found then
      raise exception 'producto_invalido' using errcode = 'P0001';
    end if;

    v_precio := v_prod.precio;

    insert into public.pedido_items
      (pedido_id, producto_id, nombre_snapshot, sku_snapshot, unidad_snapshot,
       cantidad, precio_unitario, iva_pct)
    values
      (v_pedido_id, v_prod.id, v_prod.nombre, v_prod.sku, v_prod.unidad,
       v_qty, v_precio, v_prod.iva_pct);

    v_subtotal := v_subtotal + round(v_qty * v_precio, 2);
    v_iva := v_iva + round(v_qty * v_precio * v_prod.iva_pct / 100.0, 2);
  end loop;

  update public.pedidos
    set subtotal = v_subtotal,
        iva = v_iva,
        total = v_subtotal + v_iva,
        updated_at = now()
  where pedidos.id = v_pedido_id;

  return query select v_pedido_id, v_folio;
end $$;

revoke all on function public.crear_pedido_para_token(uuid, jsonb, text, text, text, text) from public;
grant execute on function public.crear_pedido_para_token(uuid, jsonb, text, text, text, text)
  to anon, authenticated;

-- ---------- Trigger updated_at ----------
create or replace function public.pedidos_touch() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists pedidos_touch on public.pedidos;
create trigger pedidos_touch before update on public.pedidos
  for each row execute function public.pedidos_touch();
