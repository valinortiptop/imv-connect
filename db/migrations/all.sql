-- =====================================================================
-- IMV Portal — Módulo 1: Catálogo Digital
-- Run against your IMV Supabase project: SQL Editor or `supabase db push`
-- (using your own Supabase CLI linked to YOUR project — NOT Lovable Cloud).
-- Idempotent where possible.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- Tables ----------

create table if not exists public.laboratorios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  logo_url text,
  orden int not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(),
  laboratorio_id uuid references public.laboratorios(id) on delete restrict,
  sku text unique,
  nombre text not null,
  descripcion text,
  presentacion text,
  especie text[],
  categoria text,
  imagen_url text,
  precio_lista numeric(12,2) not null default 0,
  unidad text not null default 'pieza',
  iva_pct numeric(5,2) not null default 16,
  activo boolean not null default true,
  search_tsv tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists productos_lab_idx on public.productos(laboratorio_id);
create index if not exists productos_activo_idx on public.productos(activo);
create index if not exists productos_search_idx on public.productos using gin(search_tsv);

create or replace function public.productos_search_tsv_trigger()
returns trigger language plpgsql as $$
begin
  new.search_tsv :=
    setweight(to_tsvector('spanish', coalesce(new.nombre,'')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(new.sku,'')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(new.categoria,'')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(new.presentacion,'')), 'C') ||
    setweight(to_tsvector('spanish', coalesce(new.descripcion,'')), 'D');
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists productos_tsv on public.productos;
create trigger productos_tsv before insert or update on public.productos
  for each row execute function public.productos_search_tsv_trigger();

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  razon_social text not null,
  nombre_comercial text,
  rfc text,
  email text,
  telefono text,
  direccion text,
  token_portal uuid not null unique default gen_random_uuid(),
  portal_activo boolean not null default true,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clientes_token_idx on public.clientes(token_portal) where portal_activo;

create table if not exists public.precios_cliente (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  producto_id uuid not null references public.productos(id) on delete cascade,
  precio numeric(12,2) not null,
  vigente_desde date not null default current_date,
  vigente_hasta date,
  created_at timestamptz not null default now(),
  unique (cliente_id, producto_id, vigente_desde)
);

create index if not exists precios_cliente_lookup on public.precios_cliente(cliente_id, producto_id);

-- ---------- Storage bucket ----------
insert into storage.buckets (id, name, public)
  values ('productos', 'productos', true)
  on conflict (id) do nothing;

-- ---------- RLS ----------
alter table public.laboratorios   enable row level security;
alter table public.productos      enable row level security;
alter table public.clientes       enable row level security;
alter table public.precios_cliente enable row level security;

drop policy if exists "auth_read_laboratorios"  on public.laboratorios;
drop policy if exists "auth_write_laboratorios" on public.laboratorios;
create policy "auth_read_laboratorios"  on public.laboratorios for select to authenticated using (true);
create policy "auth_write_laboratorios" on public.laboratorios for all    to authenticated using (true) with check (true);

drop policy if exists "auth_read_productos"  on public.productos;
drop policy if exists "auth_write_productos" on public.productos;
create policy "auth_read_productos"  on public.productos for select to authenticated using (true);
create policy "auth_write_productos" on public.productos for all    to authenticated using (true) with check (true);

drop policy if exists "auth_read_clientes"  on public.clientes;
drop policy if exists "auth_write_clientes" on public.clientes;
create policy "auth_read_clientes"  on public.clientes for select to authenticated using (true);
create policy "auth_write_clientes" on public.clientes for all    to authenticated using (true) with check (true);

drop policy if exists "auth_rw_precios_cliente" on public.precios_cliente;
create policy "auth_rw_precios_cliente" on public.precios_cliente for all to authenticated using (true) with check (true);

-- NO public/anon policies. Portal access goes through the RPC below (security definer).

-- ---------- Public catalog RPC (token-gated) ----------
create or replace function public.get_catalog_for_token(_token uuid)
returns table (cliente jsonb, productos jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente public.clientes;
begin
  select * into v_cliente
  from public.clientes
  where token_portal = _token and portal_activo = true;

  if not found then
    raise exception 'invalid_or_inactive_token' using errcode = 'P0001';
  end if;

  return query
  select
    jsonb_build_object(
      'id', v_cliente.id,
      'razon_social', v_cliente.razon_social,
      'nombre_comercial', v_cliente.nombre_comercial
    ) as cliente,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'sku', p.sku,
        'nombre', p.nombre,
        'descripcion', p.descripcion,
        'presentacion', p.presentacion,
        'especie', p.especie,
        'categoria', p.categoria,
        'imagen_url', p.imagen_url,
        'unidad', p.unidad,
        'iva_pct', p.iva_pct,
        'laboratorio', jsonb_build_object('id', l.id, 'nombre', l.nombre, 'logo_url', l.logo_url),
        'precio', coalesce(pc.precio, p.precio_lista)
      ) order by l.orden, l.nombre, p.nombre
    ) filter (where p.id is not null), '[]'::jsonb) as productos
  from public.productos p
  join public.laboratorios l on l.id = p.laboratorio_id
  left join lateral (
    select precio
    from public.precios_cliente
    where cliente_id = v_cliente.id
      and producto_id = p.id
      and vigente_desde <= current_date
      and (vigente_hasta is null or vigente_hasta >= current_date)
    order by vigente_desde desc
    limit 1
  ) pc on true
  where p.activo = true and l.activo = true;
end $$;

revoke all on function public.get_catalog_for_token(uuid) from public;
grant execute on function public.get_catalog_for_token(uuid) to anon, authenticated;
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
-- =====================================================================
-- IMV Portal — Módulo 3: Representantes y comisiones
-- Ejecutar en SQL Editor de tu Supabase (después del 0002).
-- Idempotente.
-- =====================================================================

-- ---------- Roles de usuario (patrón seguro) ----------
do $$ begin
  create type public.app_role as enum ('admin', 'representante');
exception when duplicate_object then null; end $$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

drop policy if exists "auth_read_user_roles" on public.user_roles;
create policy "auth_read_user_roles" on public.user_roles
  for select to authenticated using (true);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

-- ---------- Representantes ----------
create table if not exists public.representantes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  nombre text not null,
  email text,
  telefono text,
  comision_default_pct numeric(5,2) not null default 5 check (comision_default_pct between 0 and 100),
  activo boolean not null default true,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists representantes_user_idx on public.representantes(user_id) where user_id is not null;
create index if not exists representantes_email_idx on public.representantes(lower(email));

alter table public.representantes enable row level security;

drop policy if exists "auth_rw_representantes" on public.representantes;
create policy "auth_rw_representantes" on public.representantes
  for all to authenticated using (true) with check (true);

-- ---------- Cliente → Representante ----------
alter table public.clientes
  add column if not exists representante_id uuid references public.representantes(id) on delete set null;

create index if not exists clientes_representante_idx on public.clientes(representante_id);

-- ---------- Pedidos: snapshot de comisión ----------
alter table public.pedidos
  add column if not exists representante_id uuid references public.representantes(id) on delete set null,
  add column if not exists comision_pct numeric(5,2),
  add column if not exists comision_monto numeric(12,2);

create index if not exists pedidos_representante_idx on public.pedidos(representante_id);

-- Recalcula subtotal-based commission cuando cambia subtotal o pct
create or replace function public.pedidos_calc_comision() returns trigger
language plpgsql as $$
begin
  if new.comision_pct is not null then
    new.comision_monto := round(coalesce(new.subtotal, 0) * new.comision_pct / 100.0, 2);
  else
    new.comision_monto := 0;
  end if;
  return new;
end $$;

drop trigger if exists pedidos_calc_comision on public.pedidos;
create trigger pedidos_calc_comision before insert or update of subtotal, comision_pct
  on public.pedidos for each row execute function public.pedidos_calc_comision();

-- ---------- RPC crear_pedido_para_token (reemplaza, ahora snapshot de rep) ----------
create or replace function public.crear_pedido_para_token(
  _token uuid,
  _items jsonb,
  _notas_cliente text default null,
  _contacto_nombre text default null,
  _contacto_telefono text default null,
  _contacto_email text default null
) returns table (id uuid, folio text)
language plpgsql security definer set search_path = public
as $$
declare
  v_cliente public.clientes;
  v_rep public.representantes;
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

  if v_cliente.representante_id is not null then
    select * into v_rep from public.representantes where id = v_cliente.representante_id;
  end if;

  insert into public.pedidos (
    cliente_id, notas_cliente, contacto_nombre, contacto_telefono, contacto_email,
    representante_id, comision_pct
  )
  values (
    v_cliente.id, _notas_cliente, _contacto_nombre, _contacto_telefono, _contacto_email,
    v_rep.id, coalesce(v_rep.comision_default_pct, 0)
  )
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
-- =====================================================================
-- IMV Portal — Módulo 4: Inventario y stock
-- Ejecutar en SQL Editor de tu Supabase (después del 0003). Idempotente.
-- =====================================================================

-- ---------- Enum tipo de movimiento ----------
do $$ begin
  create type public.movimiento_tipo as enum
    ('entrada','salida','ajuste','venta','devolucion');
exception when duplicate_object then null; end $$;

-- ---------- Almacenes ----------
create table if not exists public.almacenes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  codigo text unique,
  direccion text,
  principal boolean not null default false,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Solo un principal
create unique index if not exists almacenes_principal_uniq
  on public.almacenes ((true)) where principal;

insert into public.almacenes (nombre, codigo, principal, activo)
select 'Almacén principal','PRIN',true,true
where not exists (select 1 from public.almacenes);

-- ---------- Stock mínimo en productos ----------
alter table public.productos
  add column if not exists stock_minimo numeric(12,2) not null default 0;

-- ---------- Stock por almacén ----------
create table if not exists public.stock (
  producto_id uuid not null references public.productos(id) on delete cascade,
  almacen_id  uuid not null references public.almacenes(id) on delete restrict,
  cantidad    numeric(12,2) not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (producto_id, almacen_id)
);

create index if not exists stock_almacen_idx on public.stock(almacen_id);

-- ---------- Movimientos ----------
create table if not exists public.movimientos_inventario (
  id uuid primary key default gen_random_uuid(),
  tipo public.movimiento_tipo not null,
  producto_id uuid not null references public.productos(id) on delete restrict,
  almacen_id  uuid not null references public.almacenes(id) on delete restrict,
  cantidad    numeric(12,2) not null check (cantidad > 0),
  pedido_id   uuid references public.pedidos(id) on delete set null,
  referencia  text,
  notas       text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists movs_producto_idx on public.movimientos_inventario(producto_id, created_at desc);
create index if not exists movs_almacen_idx  on public.movimientos_inventario(almacen_id, created_at desc);
create index if not exists movs_pedido_idx   on public.movimientos_inventario(pedido_id);

-- ---------- RLS ----------
alter table public.almacenes              enable row level security;
alter table public.stock                  enable row level security;
alter table public.movimientos_inventario enable row level security;

drop policy if exists "auth_rw_almacenes" on public.almacenes;
create policy "auth_rw_almacenes" on public.almacenes
  for all to authenticated using (true) with check (true);

drop policy if exists "auth_rw_stock" on public.stock;
create policy "auth_rw_stock" on public.stock
  for all to authenticated using (true) with check (true);

drop policy if exists "auth_rw_movs" on public.movimientos_inventario;
create policy "auth_rw_movs" on public.movimientos_inventario
  for all to authenticated using (true) with check (true);

-- ---------- Aplicar movimiento al stock ----------
create or replace function public._aplicar_stock(
  _producto uuid, _almacen uuid, _delta numeric
) returns void
language plpgsql
as $$
begin
  insert into public.stock(producto_id, almacen_id, cantidad, updated_at)
  values (_producto, _almacen, _delta, now())
  on conflict (producto_id, almacen_id) do update
    set cantidad = public.stock.cantidad + excluded.cantidad,
        updated_at = now();
end $$;

create or replace function public.movimientos_apply_trigger()
returns trigger language plpgsql as $$
declare
  v_delta numeric(12,2);
begin
  if tg_op = 'INSERT' then
    v_delta := case new.tipo
      when 'entrada'    then  new.cantidad
      when 'devolucion' then  new.cantidad
      when 'salida'     then -new.cantidad
      when 'venta'      then -new.cantidad
      when 'ajuste'     then  new.cantidad  -- cantidad puede ser negativa lógicamente, pero check>0; use signo en columna referencia
      else 0 end;
    perform public._aplicar_stock(new.producto_id, new.almacen_id, v_delta);
    return new;
  elsif tg_op = 'DELETE' then
    v_delta := case old.tipo
      when 'entrada'    then -old.cantidad
      when 'devolucion' then -old.cantidad
      when 'salida'     then  old.cantidad
      when 'venta'      then  old.cantidad
      when 'ajuste'     then -old.cantidad
      else 0 end;
    perform public._aplicar_stock(old.producto_id, old.almacen_id, v_delta);
    return old;
  end if;
  return null;
end $$;

drop trigger if exists movs_apply on public.movimientos_inventario;
create trigger movs_apply
  after insert or delete on public.movimientos_inventario
  for each row execute function public.movimientos_apply_trigger();

-- ---------- RPC: ajuste de inventario manual (admin) ----------
create or replace function public.ajustar_stock(
  _producto uuid,
  _almacen uuid,
  _nueva_cantidad numeric,
  _notas text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actual numeric(12,2);
  v_delta  numeric(12,2);
  v_tipo   public.movimiento_tipo;
begin
  select coalesce(cantidad,0) into v_actual
    from public.stock
    where producto_id = _producto and almacen_id = _almacen;
  v_actual := coalesce(v_actual,0);
  v_delta := _nueva_cantidad - v_actual;
  if v_delta = 0 then return; end if;
  v_tipo := case when v_delta > 0 then 'entrada' else 'salida' end;
  insert into public.movimientos_inventario(tipo, producto_id, almacen_id, cantidad, notas, created_by, referencia)
  values (v_tipo, _producto, _almacen, abs(v_delta), _notas, auth.uid(), 'ajuste');
end $$;

-- ---------- Descuento automático al confirmar pedido ----------
create or replace function public.pedidos_stock_trigger()
returns trigger language plpgsql
security definer
set search_path = public
as $$
declare
  v_principal uuid;
  v_item record;
begin
  -- Entra a 'confirmado' -> descontar stock como venta
  if (tg_op = 'UPDATE' and new.estado = 'confirmado' and old.estado is distinct from 'confirmado'
      and old.estado <> 'cancelado') then
    select id into v_principal from public.almacenes where principal limit 1;
    if v_principal is null then return new; end if;

    -- Evitar doble descuento
    if exists (select 1 from public.movimientos_inventario
               where pedido_id = new.id and tipo = 'venta') then
      return new;
    end if;

    for v_item in
      select producto_id, cantidad from public.pedido_items where pedido_id = new.id
    loop
      insert into public.movimientos_inventario
        (tipo, producto_id, almacen_id, cantidad, pedido_id, referencia, created_by)
      values
        ('venta', v_item.producto_id, v_principal, v_item.cantidad, new.id,
         'pedido:' || new.folio, auth.uid());
    end loop;
  end if;

  -- Cancelación de pedido confirmado -> devolver stock
  if (tg_op = 'UPDATE' and new.estado = 'cancelado'
      and old.estado in ('confirmado','enviado','entregado')) then
    select id into v_principal from public.almacenes where principal limit 1;
    if v_principal is null then return new; end if;

    for v_item in
      select producto_id, cantidad from public.pedido_items where pedido_id = new.id
    loop
      insert into public.movimientos_inventario
        (tipo, producto_id, almacen_id, cantidad, pedido_id, referencia, created_by)
      values
        ('devolucion', v_item.producto_id, v_principal, v_item.cantidad, new.id,
         'cancelacion:' || new.folio, auth.uid());
    end loop;
  end if;

  return new;
end $$;

drop trigger if exists pedidos_stock on public.pedidos;
create trigger pedidos_stock
  after update on public.pedidos
  for each row execute function public.pedidos_stock_trigger();

-- ---------- Vista: stock total por producto ----------
create or replace view public.v_stock_productos as
select
  p.id              as producto_id,
  p.sku,
  p.nombre,
  p.unidad,
  p.activo,
  p.stock_minimo,
  l.id              as laboratorio_id,
  l.nombre          as laboratorio,
  coalesce(sum(s.cantidad),0) as stock_total,
  case when coalesce(sum(s.cantidad),0) <= p.stock_minimo then true else false end as bajo_minimo
from public.productos p
left join public.laboratorios l on l.id = p.laboratorio_id
left join public.stock s on s.producto_id = p.id
group by p.id, l.id;
-- =====================================================================
-- IMV Portal — Módulo 5: Facturación y cuentas por cobrar
-- Ejecutar en SQL Editor de tu Supabase (después del 0004). Idempotente.
-- =====================================================================

-- ---------- Enums ----------
do $$ begin
  create type public.factura_estado as enum
    ('borrador','emitida','parcial','pagada','cancelada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.pago_metodo as enum
    ('efectivo','transferencia','cheque','tarjeta','otro');
exception when duplicate_object then null; end $$;

-- ---------- Facturas ----------
create table if not exists public.facturas (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique
    default 'F-' || to_char(now(),'YYYYMMDD') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6),
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  pedido_id  uuid references public.pedidos(id) on delete set null,
  representante_id uuid references public.representantes(id) on delete set null,
  fecha_emision    date not null default current_date,
  fecha_vencimiento date not null default (current_date + 30),
  subtotal numeric(12,2) not null default 0,
  iva      numeric(12,2) not null default 0,
  total    numeric(12,2) not null default 0,
  pagado   numeric(12,2) not null default 0,
  saldo    numeric(12,2) generated always as (total - pagado) stored,
  estado   public.factura_estado not null default 'emitida',
  notas    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists facturas_cliente_idx on public.facturas(cliente_id);
create index if not exists facturas_pedido_idx  on public.facturas(pedido_id);
create index if not exists facturas_estado_idx  on public.facturas(estado);
create index if not exists facturas_vence_idx   on public.facturas(fecha_vencimiento);

-- Una factura por pedido (cuando hay pedido). Permite múltiples NULL.
create unique index if not exists facturas_pedido_uniq
  on public.facturas(pedido_id) where pedido_id is not null;

-- ---------- Items de factura (snapshot) ----------
create table if not exists public.factura_items (
  id uuid primary key default gen_random_uuid(),
  factura_id uuid not null references public.facturas(id) on delete cascade,
  producto_id uuid references public.productos(id) on delete set null,
  nombre_snapshot text not null,
  sku_snapshot text,
  unidad_snapshot text not null default 'pieza',
  cantidad numeric(12,2) not null check (cantidad > 0),
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0),
  iva_pct numeric(5,2) not null default 16,
  importe numeric(12,2) generated always as (round(cantidad * precio_unitario, 2)) stored
);

create index if not exists factura_items_factura_idx on public.factura_items(factura_id);

-- ---------- Pagos ----------
create table if not exists public.pagos (
  id uuid primary key default gen_random_uuid(),
  factura_id uuid not null references public.facturas(id) on delete cascade,
  fecha date not null default current_date,
  monto numeric(12,2) not null check (monto > 0),
  metodo public.pago_metodo not null default 'transferencia',
  referencia text,
  notas text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists pagos_factura_idx on public.pagos(factura_id, fecha desc);

-- ---------- RLS ----------
alter table public.facturas      enable row level security;
alter table public.factura_items enable row level security;
alter table public.pagos         enable row level security;

drop policy if exists "auth_rw_facturas" on public.facturas;
create policy "auth_rw_facturas" on public.facturas
  for all to authenticated using (true) with check (true);

drop policy if exists "auth_rw_factura_items" on public.factura_items;
create policy "auth_rw_factura_items" on public.factura_items
  for all to authenticated using (true) with check (true);

drop policy if exists "auth_rw_pagos" on public.pagos;
create policy "auth_rw_pagos" on public.pagos
  for all to authenticated using (true) with check (true);

-- ---------- Recalcular factura tras cambios en pagos / items ----------
create or replace function public.facturas_recalc(_factura uuid)
returns void language plpgsql as $$
declare
  v_sub numeric(12,2);
  v_iva numeric(12,2);
  v_tot numeric(12,2);
  v_pag numeric(12,2);
  v_estado public.factura_estado;
  v_actual public.factura_estado;
begin
  select
    coalesce(sum(round(cantidad * precio_unitario, 2)), 0),
    coalesce(sum(round(cantidad * precio_unitario * iva_pct / 100.0, 2)), 0)
  into v_sub, v_iva
  from public.factura_items where factura_id = _factura;

  v_tot := v_sub + v_iva;

  select coalesce(sum(monto), 0) into v_pag
  from public.pagos where factura_id = _factura;

  select estado into v_actual from public.facturas where id = _factura;

  v_estado := case
    when v_actual = 'cancelada' then 'cancelada'
    when v_actual = 'borrador' and v_pag = 0 then 'borrador'
    when v_pag = 0 then 'emitida'
    when v_pag < v_tot then 'parcial'
    else 'pagada'
  end;

  update public.facturas
    set subtotal = v_sub,
        iva = v_iva,
        total = v_tot,
        pagado = v_pag,
        estado = v_estado,
        updated_at = now()
  where id = _factura;
end $$;

create or replace function public.factura_items_after_change()
returns trigger language plpgsql as $$
begin
  perform public.facturas_recalc(coalesce(new.factura_id, old.factura_id));
  return coalesce(new, old);
end $$;

drop trigger if exists factura_items_recalc on public.factura_items;
create trigger factura_items_recalc
  after insert or update or delete on public.factura_items
  for each row execute function public.factura_items_after_change();

create or replace function public.pagos_after_change()
returns trigger language plpgsql as $$
declare
  v_total numeric(12,2);
  v_pagado numeric(12,2);
begin
  if tg_op in ('INSERT','UPDATE') then
    select total, coalesce(sum(p.monto),0)
    into v_total, v_pagado
    from public.facturas f
    left join public.pagos p on p.factura_id = f.id
    where f.id = new.factura_id
    group by f.total;
    if v_pagado > coalesce(v_total,0) then
      raise exception 'pago_excede_saldo' using errcode = 'P0001';
    end if;
  end if;
  perform public.facturas_recalc(coalesce(new.factura_id, old.factura_id));
  return coalesce(new, old);
end $$;

drop trigger if exists pagos_recalc on public.pagos;
create trigger pagos_recalc
  after insert or update or delete on public.pagos
  for each row execute function public.pagos_after_change();

-- ---------- RPC: crear factura desde pedido ----------
create or replace function public.crear_factura_desde_pedido(
  _pedido uuid,
  _dias_credito int default 30,
  _fecha_emision date default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido public.pedidos;
  v_factura_id uuid;
  v_emision date;
begin
  select * into v_pedido from public.pedidos where id = _pedido;
  if not found then
    raise exception 'pedido_no_encontrado' using errcode = 'P0001';
  end if;
  if v_pedido.estado = 'cancelado' then
    raise exception 'pedido_cancelado' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.facturas where pedido_id = _pedido) then
    raise exception 'factura_ya_existe' using errcode = 'P0001';
  end if;

  v_emision := coalesce(_fecha_emision, current_date);

  insert into public.facturas (
    cliente_id, pedido_id, representante_id,
    fecha_emision, fecha_vencimiento, notas
  ) values (
    v_pedido.cliente_id, v_pedido.id, v_pedido.representante_id,
    v_emision, v_emision + coalesce(_dias_credito, 30),
    'Factura del pedido ' || v_pedido.folio
  ) returning id into v_factura_id;

  insert into public.factura_items (
    factura_id, producto_id, nombre_snapshot, sku_snapshot,
    unidad_snapshot, cantidad, precio_unitario, iva_pct
  )
  select v_factura_id, pi.producto_id, pi.nombre_snapshot, pi.sku_snapshot,
         pi.unidad_snapshot, pi.cantidad, pi.precio_unitario, pi.iva_pct
  from public.pedido_items pi
  where pi.pedido_id = _pedido;

  -- el trigger de factura_items ya recalculó totales
  return v_factura_id;
end $$;

revoke all on function public.crear_factura_desde_pedido(uuid, int, date) from public;
grant execute on function public.crear_factura_desde_pedido(uuid, int, date) to authenticated;

-- ---------- Vista: saldos / antigüedad por cliente ----------
create or replace view public.v_saldos_clientes as
with abiertas as (
  select
    f.cliente_id,
    f.id,
    f.total,
    f.pagado,
    (f.total - f.pagado) as saldo,
    f.fecha_vencimiento,
    greatest(0, (current_date - f.fecha_vencimiento)) as dias_vencido
  from public.facturas f
  where f.estado in ('emitida','parcial')
)
select
  c.id as cliente_id,
  c.razon_social,
  c.nombre_comercial,
  count(a.id) as facturas_abiertas,
  coalesce(sum(a.saldo), 0) as saldo_total,
  coalesce(sum(case when a.dias_vencido = 0 then a.saldo else 0 end), 0) as saldo_corriente,
  coalesce(sum(case when a.dias_vencido between 1 and 30  then a.saldo else 0 end), 0) as saldo_1_30,
  coalesce(sum(case when a.dias_vencido between 31 and 60 then a.saldo else 0 end), 0) as saldo_31_60,
  coalesce(sum(case when a.dias_vencido between 61 and 90 then a.saldo else 0 end), 0) as saldo_61_90,
  coalesce(sum(case when a.dias_vencido > 90 then a.saldo else 0 end), 0) as saldo_mas_90
from public.clientes c
left join abiertas a on a.cliente_id = c.id
group by c.id, c.razon_social, c.nombre_comercial;
-- =====================================================================
-- IMV Portal — Módulo 6: Reportes y dashboard
-- Vistas agregadas para KPIs del panel admin. Idempotente.
-- =====================================================================

-- Ventas por mes (últimos 12 meses) basadas en facturas no canceladas
create or replace view public.v_ventas_por_mes as
select
  to_char(date_trunc('month', f.fecha_emision), 'YYYY-MM') as mes,
  date_trunc('month', f.fecha_emision)::date as mes_inicio,
  count(*)::int as facturas,
  coalesce(sum(f.subtotal), 0)::numeric(14,2) as subtotal,
  coalesce(sum(f.iva), 0)::numeric(14,2) as iva,
  coalesce(sum(f.total), 0)::numeric(14,2) as total,
  coalesce(sum(f.pagado), 0)::numeric(14,2) as pagado
from public.facturas f
where f.estado <> 'cancelada'
  and f.fecha_emision >= (date_trunc('month', now()) - interval '11 months')::date
group by 1, 2
order by 2;

-- Pedidos por mes (todos los estados excepto cancelado)
create or replace view public.v_pedidos_por_mes as
select
  to_char(date_trunc('month', p.created_at), 'YYYY-MM') as mes,
  date_trunc('month', p.created_at)::date as mes_inicio,
  count(*)::int as pedidos,
  coalesce(sum(p.subtotal), 0)::numeric(14,2) as subtotal
from public.pedidos p
where p.estado <> 'cancelado'
  and p.created_at >= (date_trunc('month', now()) - interval '11 months')
group by 1, 2
order by 2;

-- Top productos por unidades e ingreso (últimos 90 días)
create or replace view public.v_top_productos as
select
  pr.id as producto_id,
  pr.sku,
  pr.nombre,
  coalesce(sum(pi.cantidad), 0)::numeric(14,2) as unidades,
  coalesce(sum(pi.cantidad * pi.precio_unitario), 0)::numeric(14,2) as ingreso
from public.pedido_items pi
join public.pedidos p on p.id = pi.pedido_id
join public.productos pr on pr.id = pi.producto_id
where p.estado <> 'cancelado'
  and p.created_at >= now() - interval '90 days'
group by pr.id, pr.sku, pr.nombre
order by ingreso desc;

-- Top clientes por ventas (últimos 90 días)
create or replace view public.v_top_clientes as
select
  c.id as cliente_id,
  c.razon_social,
  c.nombre_comercial,
  count(distinct p.id)::int as pedidos,
  coalesce(sum(p.subtotal), 0)::numeric(14,2) as ventas
from public.pedidos p
join public.clientes c on c.id = p.cliente_id
where p.estado <> 'cancelado'
  and p.created_at >= now() - interval '90 days'
group by c.id, c.razon_social, c.nombre_comercial
order by ventas desc;

-- Comisiones por representante (acumulado y últimos 30 días)
create or replace view public.v_comisiones_representante as
select
  r.id as representante_id,
  r.nombre,
  coalesce(sum(p.comision_monto), 0)::numeric(14,2) as comisiones_total,
  coalesce(sum(p.comision_monto) filter (where p.created_at >= now() - interval '30 days'), 0)::numeric(14,2) as comisiones_30d,
  count(p.id)::int as pedidos_total
from public.representantes r
left join public.pedidos p
  on p.representante_id = r.id and p.estado <> 'cancelado'
group by r.id, r.nombre
order by comisiones_total desc;

-- Stock bajo: productos cuyo stock total <= punto de reorden (si está definido)
create or replace view public.v_stock_bajo as
select
  pr.id as producto_id,
  pr.sku,
  pr.nombre,
  coalesce(sum(s.cantidad), 0)::numeric(14,2) as stock_total,
  pr.stock_minimo
from public.productos pr
left join public.stock s on s.producto_id = pr.id
where pr.activo = true
group by pr.id, pr.sku, pr.nombre, pr.stock_minimo
having coalesce(sum(s.cantidad), 0) <= coalesce(pr.stock_minimo, 0)
order by stock_total asc;

-- KPI resumen general
create or replace view public.v_dashboard_resumen as
select
  (select count(*) from public.pedidos where estado not in ('cancelado','entregado')) as pedidos_abiertos,
  (select count(*) from public.facturas where estado in ('emitida','parcial')) as facturas_pendientes,
  (select coalesce(sum(saldo),0) from public.facturas where estado in ('emitida','parcial'))::numeric(14,2) as saldo_pendiente,
  (select coalesce(sum(total),0)
     from public.facturas
     where estado <> 'cancelada' and fecha_emision >= date_trunc('month', now())::date)::numeric(14,2) as ventas_mes,
  (select coalesce(sum(comision_monto),0)
     from public.pedidos
     where estado <> 'cancelado' and created_at >= date_trunc('month', now()))::numeric(14,2) as comisiones_mes,
  (select count(*) from public.v_stock_bajo) as productos_stock_bajo;

-- Permisos: lectura para usuarios autenticados
grant select on public.v_ventas_por_mes      to authenticated;
grant select on public.v_pedidos_por_mes     to authenticated;
grant select on public.v_top_productos       to authenticated;
grant select on public.v_top_clientes        to authenticated;
grant select on public.v_comisiones_representante to authenticated;
grant select on public.v_stock_bajo          to authenticated;
grant select on public.v_dashboard_resumen   to authenticated;


-- =====================================================================
-- IMV Portal — Módulo 7: Compras a proveedores (órdenes de compra)
-- Idempotente. Genera entradas a inventario al recibir.
-- =====================================================================

-- ---------- Costo en productos ----------
alter table public.productos
  add column if not exists costo numeric(12,2);

-- ---------- Enum estado de OC ----------
do $$ begin
  create type public.oc_estado as enum
    ('borrador','enviada','parcial','recibida','cancelada');
exception when duplicate_object then null; end $$;

-- ---------- Órdenes de compra ----------
create table if not exists public.ordenes_compra (
  id uuid primary key default gen_random_uuid(),
  folio text unique,
  laboratorio_id uuid not null references public.laboratorios(id) on delete restrict,
  almacen_id     uuid not null references public.almacenes(id)    on delete restrict,
  estado public.oc_estado not null default 'borrador',
  fecha_emision date not null default current_date,
  fecha_esperada date,
  fecha_recepcion date,
  subtotal numeric(14,2) not null default 0,
  iva      numeric(14,2) not null default 0,
  total    numeric(14,2) not null default 0,
  notas text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists oc_lab_idx     on public.ordenes_compra(laboratorio_id, created_at desc);
create index if not exists oc_estado_idx  on public.ordenes_compra(estado, created_at desc);

-- ---------- Items ----------
create table if not exists public.oc_items (
  id uuid primary key default gen_random_uuid(),
  oc_id uuid not null references public.ordenes_compra(id) on delete cascade,
  producto_id uuid not null references public.productos(id) on delete restrict,
  cantidad numeric(12,2) not null check (cantidad > 0),
  costo_unitario numeric(12,2) not null default 0,
  cantidad_recibida numeric(12,2) not null default 0,
  subtotal numeric(14,2) generated always as (cantidad * costo_unitario) stored
);

create index if not exists oc_items_oc_idx on public.oc_items(oc_id);

-- ---------- Folio automático ----------
create or replace function public.oc_set_folio()
returns trigger language plpgsql as $$
declare
  n int;
begin
  if new.folio is null or new.folio = '' then
    select coalesce(max((regexp_replace(folio, '^OC-', '', 'g'))::int), 0) + 1
      into n
      from public.ordenes_compra
      where folio ~ '^OC-[0-9]+$';
    new.folio := 'OC-' || lpad(n::text, 5, '0');
  end if;
  return new;
end $$;

drop trigger if exists oc_folio on public.ordenes_compra;
create trigger oc_folio before insert on public.ordenes_compra
  for each row execute function public.oc_set_folio();

-- ---------- Recalcular totales ----------
create or replace function public.oc_recalc_totales(_oc uuid)
returns void language plpgsql as $$
declare
  v_subtotal numeric(14,2);
begin
  select coalesce(sum(cantidad * costo_unitario), 0)
    into v_subtotal from public.oc_items where oc_id = _oc;
  update public.ordenes_compra
     set subtotal = v_subtotal,
         iva      = round(v_subtotal * 0.16, 2),
         total    = round(v_subtotal * 1.16, 2),
         updated_at = now()
   where id = _oc;
end $$;

create or replace function public.oc_items_recalc_trigger()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    perform public.oc_recalc_totales(old.oc_id);
    return old;
  else
    perform public.oc_recalc_totales(new.oc_id);
    return new;
  end if;
end $$;

drop trigger if exists oc_items_recalc on public.oc_items;
create trigger oc_items_recalc
  after insert or update or delete on public.oc_items
  for each row execute function public.oc_items_recalc_trigger();

-- ---------- RPC: recibir orden de compra (total o parcial) ----------
-- payload: jsonb array [{ item_id, cantidad_recibir }]
create or replace function public.recibir_oc(_oc uuid, _items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alm uuid;
  v_folio text;
  v_estado public.oc_estado;
  v_item record;
  v_pending numeric(12,2);
  v_total_pendiente numeric(12,2);
begin
  select almacen_id, folio, estado
    into v_alm, v_folio, v_estado
    from public.ordenes_compra where id = _oc for update;
  if v_alm is null then raise exception 'OC no existe'; end if;
  if v_estado in ('recibida','cancelada') then
    raise exception 'OC ya cerrada (estado %)', v_estado;
  end if;

  for v_item in
    select (e->>'item_id')::uuid as item_id,
           (e->>'cantidad_recibir')::numeric as qty
      from jsonb_array_elements(_items) e
  loop
    if v_item.qty is null or v_item.qty <= 0 then continue; end if;

    -- validar no exceder
    select (cantidad - cantidad_recibida) into v_pending
      from public.oc_items where id = v_item.item_id and oc_id = _oc for update;
    if v_pending is null then raise exception 'Item % no pertenece a la OC', v_item.item_id; end if;
    if v_item.qty > v_pending then
      raise exception 'Cantidad % excede pendiente % para item %', v_item.qty, v_pending, v_item.item_id;
    end if;

    -- actualizar recibido
    update public.oc_items
       set cantidad_recibida = cantidad_recibida + v_item.qty
     where id = v_item.item_id;

    -- entrada a inventario + actualizar costo del producto
    insert into public.movimientos_inventario
      (tipo, producto_id, almacen_id, cantidad, referencia, notas, created_by)
    select 'entrada', oi.producto_id, v_alm, v_item.qty,
           'compra:' || v_folio, 'OC ' || v_folio, auth.uid()
      from public.oc_items oi where oi.id = v_item.item_id;

    update public.productos p
       set costo = oi.costo_unitario
      from public.oc_items oi
     where oi.id = v_item.item_id
       and p.id = oi.producto_id
       and oi.costo_unitario > 0;
  end loop;

  -- recalcular estado
  select coalesce(sum(cantidad - cantidad_recibida), 0)
    into v_total_pendiente from public.oc_items where oc_id = _oc;

  if v_total_pendiente <= 0 then
    update public.ordenes_compra
       set estado = 'recibida', fecha_recepcion = current_date, updated_at = now()
     where id = _oc;
  else
    update public.ordenes_compra
       set estado = 'parcial', updated_at = now()
     where id = _oc and estado <> 'parcial';
  end if;
end $$;

-- ---------- RLS ----------
alter table public.ordenes_compra enable row level security;
alter table public.oc_items       enable row level security;

drop policy if exists "auth_rw_oc" on public.ordenes_compra;
create policy "auth_rw_oc" on public.ordenes_compra
  for all to authenticated using (true) with check (true);

drop policy if exists "auth_rw_oc_items" on public.oc_items;
create policy "auth_rw_oc_items" on public.oc_items
  for all to authenticated using (true) with check (true);

-- ---------- Vista resumen ----------
create or replace view public.v_ordenes_compra as
select
  o.id, o.folio, o.estado, o.fecha_emision, o.fecha_esperada, o.fecha_recepcion,
  o.subtotal, o.iva, o.total,
  l.id as laboratorio_id, l.nombre as laboratorio,
  a.id as almacen_id, a.nombre as almacen,
  (select count(*) from public.oc_items i where i.oc_id = o.id) as items,
  (select coalesce(sum(cantidad - cantidad_recibida),0)
     from public.oc_items i where i.oc_id = o.id) as pendiente_unidades
from public.ordenes_compra o
join public.laboratorios l on l.id = o.laboratorio_id
join public.almacenes    a on a.id = o.almacen_id;

grant select on public.v_ordenes_compra to authenticated;

-- ---------- Margen estimado (vista) ----------
create or replace view public.v_margen_productos as
select
  p.id as producto_id, p.sku, p.nombre,
  p.precio_lista, p.costo,
  case when p.costo is null or p.costo = 0 then null
       else round(((p.precio_lista - p.costo) / p.precio_lista) * 100, 2)
  end as margen_pct
from public.productos p
where p.activo = true;

grant select on public.v_margen_productos to authenticated;


-- =====================================================================
-- IMV Portal — Módulo 8: Devoluciones y notas de crédito
-- Idempotente. Requiere módulos 4 (inventario) y 5 (facturación).
-- =====================================================================

-- ---------- Enums ----------
do $$ begin
  create type public.devolucion_estado as enum
    ('borrador','aplicada','cancelada');
exception when duplicate_object then null; end $$;

-- ---------- Devoluciones ----------
create table if not exists public.devoluciones (
  id uuid primary key default gen_random_uuid(),
  folio text unique,
  factura_id uuid not null references public.facturas(id) on delete restrict,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  almacen_id uuid not null references public.almacenes(id) on delete restrict,
  fecha date not null default current_date,
  motivo text,
  estado public.devolucion_estado not null default 'borrador',
  subtotal numeric(14,2) not null default 0,
  iva      numeric(14,2) not null default 0,
  total    numeric(14,2) not null default 0,
  notas text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists devs_factura_idx on public.devoluciones(factura_id);
create index if not exists devs_cliente_idx on public.devoluciones(cliente_id, fecha desc);
create index if not exists devs_estado_idx  on public.devoluciones(estado);

-- ---------- Items ----------
create table if not exists public.devolucion_items (
  id uuid primary key default gen_random_uuid(),
  devolucion_id uuid not null references public.devoluciones(id) on delete cascade,
  factura_item_id uuid references public.factura_items(id) on delete set null,
  producto_id uuid references public.productos(id) on delete set null,
  nombre_snapshot text not null,
  cantidad numeric(12,2) not null check (cantidad > 0),
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0),
  iva_pct numeric(5,2) not null default 16,
  reingreso_stock boolean not null default true,
  importe numeric(14,2) generated always as (round(cantidad * precio_unitario, 2)) stored
);

create index if not exists dev_items_dev_idx on public.devolucion_items(devolucion_id);

-- ---------- Notas de crédito (afectan saldo de factura) ----------
create table if not exists public.notas_credito (
  id uuid primary key default gen_random_uuid(),
  folio text unique,
  factura_id uuid not null references public.facturas(id) on delete cascade,
  devolucion_id uuid references public.devoluciones(id) on delete set null,
  fecha date not null default current_date,
  total numeric(14,2) not null check (total > 0),
  notas text,
  created_at timestamptz not null default now()
);

create index if not exists nc_factura_idx on public.notas_credito(factura_id);

-- ---------- Folios automáticos ----------
create or replace function public.dev_set_folio()
returns trigger language plpgsql as $$
declare n int;
begin
  if new.folio is null or new.folio = '' then
    select coalesce(max((regexp_replace(folio, '^DV-', '', 'g'))::int), 0) + 1
      into n from public.devoluciones where folio ~ '^DV-[0-9]+$';
    new.folio := 'DV-' || lpad(n::text, 5, '0');
  end if;
  return new;
end $$;

drop trigger if exists dev_folio on public.devoluciones;
create trigger dev_folio before insert on public.devoluciones
  for each row execute function public.dev_set_folio();

create or replace function public.nc_set_folio()
returns trigger language plpgsql as $$
declare n int;
begin
  if new.folio is null or new.folio = '' then
    select coalesce(max((regexp_replace(folio, '^NC-', '', 'g'))::int), 0) + 1
      into n from public.notas_credito where folio ~ '^NC-[0-9]+$';
    new.folio := 'NC-' || lpad(n::text, 5, '0');
  end if;
  return new;
end $$;

drop trigger if exists nc_folio on public.notas_credito;
create trigger nc_folio before insert on public.notas_credito
  for each row execute function public.nc_set_folio();

-- ---------- Recalcular totales de devolución ----------
create or replace function public.dev_recalc(_dev uuid)
returns void language plpgsql as $$
declare
  v_sub numeric(14,2);
  v_iva numeric(14,2);
begin
  select coalesce(sum(round(cantidad * precio_unitario, 2)), 0),
         coalesce(sum(round(cantidad * precio_unitario * iva_pct / 100.0, 2)), 0)
    into v_sub, v_iva
    from public.devolucion_items where devolucion_id = _dev;
  update public.devoluciones
     set subtotal = v_sub, iva = v_iva, total = v_sub + v_iva, updated_at = now()
   where id = _dev;
end $$;

create or replace function public.dev_items_after_change()
returns trigger language plpgsql as $$
begin
  perform public.dev_recalc(coalesce(new.devolucion_id, old.devolucion_id));
  return coalesce(new, old);
end $$;

drop trigger if exists dev_items_recalc on public.devolucion_items;
create trigger dev_items_recalc
  after insert or update or delete on public.devolucion_items
  for each row execute function public.dev_items_after_change();

-- ---------- Reemplazar facturas_recalc para incluir notas de crédito ----------
create or replace function public.facturas_recalc(_factura uuid)
returns void language plpgsql as $$
declare
  v_sub numeric(12,2);
  v_iva numeric(12,2);
  v_tot numeric(12,2);
  v_pag numeric(12,2);
  v_nc  numeric(12,2);
  v_estado public.factura_estado;
  v_actual public.factura_estado;
begin
  select
    coalesce(sum(round(cantidad * precio_unitario, 2)), 0),
    coalesce(sum(round(cantidad * precio_unitario * iva_pct / 100.0, 2)), 0)
  into v_sub, v_iva
  from public.factura_items where factura_id = _factura;

  v_tot := v_sub + v_iva;

  select coalesce(sum(monto), 0) into v_pag from public.pagos where factura_id = _factura;
  select coalesce(sum(total), 0) into v_nc  from public.notas_credito where factura_id = _factura;

  select estado into v_actual from public.facturas where id = _factura;

  v_estado := case
    when v_actual = 'cancelada' then 'cancelada'
    when v_actual = 'borrador' and (v_pag + v_nc) = 0 then 'borrador'
    when (v_pag + v_nc) = 0 then 'emitida'
    when (v_pag + v_nc) < v_tot then 'parcial'
    else 'pagada'
  end;

  update public.facturas
    set subtotal = v_sub,
        iva = v_iva,
        total = v_tot,
        pagado = (v_pag + v_nc),
        estado = v_estado,
        updated_at = now()
  where id = _factura;
end $$;

-- Trigger en notas_credito para recalcular factura
create or replace function public.nc_after_change()
returns trigger language plpgsql as $$
begin
  perform public.facturas_recalc(coalesce(new.factura_id, old.factura_id));
  return coalesce(new, old);
end $$;

drop trigger if exists nc_recalc on public.notas_credito;
create trigger nc_recalc
  after insert or update or delete on public.notas_credito
  for each row execute function public.nc_after_change();

-- ---------- RPC: aplicar devolución ----------
create or replace function public.aplicar_devolucion(_dev uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dev public.devoluciones;
  v_item record;
  v_devuelto_prev numeric(12,2);
  v_facturado numeric(12,2);
  v_nc_id uuid;
begin
  select * into v_dev from public.devoluciones where id = _dev for update;
  if v_dev is null then raise exception 'devolucion_no_encontrada'; end if;
  if v_dev.estado <> 'borrador' then
    raise exception 'devolucion_estado_invalido_%', v_dev.estado;
  end if;

  -- Validar cantidades contra factura
  for v_item in
    select di.*, fi.cantidad as fi_cantidad
      from public.devolucion_items di
      left join public.factura_items fi on fi.id = di.factura_item_id
     where di.devolucion_id = _dev
  loop
    if v_item.factura_item_id is not null then
      v_facturado := coalesce(v_item.fi_cantidad, 0);
      select coalesce(sum(di2.cantidad), 0)
        into v_devuelto_prev
        from public.devolucion_items di2
        join public.devoluciones d2 on d2.id = di2.devolucion_id
       where di2.factura_item_id = v_item.factura_item_id
         and d2.estado = 'aplicada'
         and d2.id <> _dev;
      if v_item.cantidad + v_devuelto_prev > v_facturado then
        raise exception 'cantidad_excede_facturado_item_%', v_item.factura_item_id;
      end if;
    end if;
  end loop;

  -- Generar movimientos de inventario (devolución = entrada al stock)
  for v_item in
    select * from public.devolucion_items where devolucion_id = _dev
  loop
    if v_item.reingreso_stock and v_item.producto_id is not null then
      insert into public.movimientos_inventario
        (tipo, producto_id, almacen_id, cantidad, referencia, notas, created_by)
      values
        ('devolucion', v_item.producto_id, v_dev.almacen_id, v_item.cantidad,
         'devolucion:' || v_dev.folio, v_dev.motivo, auth.uid());
    end if;
  end loop;

  -- Generar nota de crédito que reduce el saldo
  if v_dev.total > 0 then
    insert into public.notas_credito (factura_id, devolucion_id, fecha, total, notas)
    values (v_dev.factura_id, _dev, v_dev.fecha, v_dev.total,
            'NC por devolución ' || v_dev.folio)
    returning id into v_nc_id;
  end if;

  update public.devoluciones set estado = 'aplicada', updated_at = now() where id = _dev;
  return _dev;
end $$;

revoke all on function public.aplicar_devolucion(uuid) from public;
grant execute on function public.aplicar_devolucion(uuid) to authenticated;

-- ---------- RLS ----------
alter table public.devoluciones      enable row level security;
alter table public.devolucion_items  enable row level security;
alter table public.notas_credito     enable row level security;

drop policy if exists "auth_rw_devs" on public.devoluciones;
create policy "auth_rw_devs" on public.devoluciones
  for all to authenticated using (true) with check (true);

drop policy if exists "auth_rw_dev_items" on public.devolucion_items;
create policy "auth_rw_dev_items" on public.devolucion_items
  for all to authenticated using (true) with check (true);

drop policy if exists "auth_rw_nc" on public.notas_credito;
create policy "auth_rw_nc" on public.notas_credito
  for all to authenticated using (true) with check (true);

-- ---------- Vista lista ----------
create or replace view public.v_devoluciones as
select
  d.id, d.folio, d.fecha, d.estado, d.subtotal, d.iva, d.total, d.motivo,
  d.factura_id, f.folio as factura_folio,
  d.cliente_id, c.razon_social as cliente,
  d.almacen_id, a.nombre as almacen,
  (select count(*) from public.devolucion_items i where i.devolucion_id = d.id) as items
from public.devoluciones d
join public.facturas  f on f.id = d.factura_id
join public.clientes  c on c.id = d.cliente_id
join public.almacenes a on a.id = d.almacen_id;

grant select on public.v_devoluciones to authenticated;


-- =====================================================================
-- MÓDULO 9: Usuarios y permisos por rol
-- =====================================================================

-- =====================================================================
-- IMV Portal — Módulo 9: Usuarios y permisos por rol
-- Idempotente. Roles: admin, ventas, almacen, contabilidad.
-- =====================================================================

-- ---------- Enum de roles ----------
do $$ begin
  create type public.app_role as enum ('admin','ventas','almacen','contabilidad');
exception when duplicate_object then null; end $$;

-- ---------- Tabla user_roles (separada de profiles para evitar escalada) ----------
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create index if not exists user_roles_user_idx on public.user_roles(user_id);

-- ---------- Funciones SECURITY DEFINER (evitan recursión RLS) ----------
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
     where user_id = _user_id and role = _role
  )
$$;

create or replace function public.has_any_role(_user_id uuid, _roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
     where user_id = _user_id and role = any(_roles)
  )
$$;

create or replace function public.current_user_roles()
returns public.app_role[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(role order by role), '{}'::public.app_role[])
    from public.user_roles where user_id = auth.uid()
$$;

grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.has_any_role(uuid, public.app_role[]) to authenticated;
grant execute on function public.current_user_roles() to authenticated;

-- ---------- Bootstrap: si no hay admins, el primer usuario autenticado puede auto-asignarse ----------
create or replace function public.bootstrap_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'no_auth'; end if;
  if exists (select 1 from public.user_roles where role = 'admin') then
    raise exception 'admin_ya_existe';
  end if;
  insert into public.user_roles(user_id, role) values (v_uid, 'admin')
    on conflict do nothing;
end $$;

grant execute on function public.bootstrap_admin() to authenticated;

-- ---------- RPC: asignar / remover rol (sólo admin) ----------
create or replace function public.asignar_rol(_user_id uuid, _role public.app_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'requiere_admin';
  end if;
  insert into public.user_roles(user_id, role) values (_user_id, _role)
    on conflict (user_id, role) do nothing;
end $$;

create or replace function public.remover_rol(_user_id uuid, _role public.app_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'requiere_admin';
  end if;
  -- No permitir quedarse sin admins
  if _role = 'admin' and (
    select count(*) from public.user_roles where role = 'admin'
  ) <= 1 then
    raise exception 'ultimo_admin_no_removible';
  end if;
  delete from public.user_roles where user_id = _user_id and role = _role;
end $$;

grant execute on function public.asignar_rol(uuid, public.app_role) to authenticated;
grant execute on function public.remover_rol(uuid, public.app_role) to authenticated;

-- ---------- RLS de user_roles ----------
alter table public.user_roles enable row level security;

drop policy if exists "ur_select_self_or_admin" on public.user_roles;
create policy "ur_select_self_or_admin" on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- Inserts/updates/deletes pasan SIEMPRE por las RPC; bloqueamos directo.
drop policy if exists "ur_no_direct_write" on public.user_roles;
create policy "ur_no_direct_write" on public.user_roles
  for all to authenticated
  using (false) with check (false);

-- ---------- Vista de usuarios con roles (sólo admin la consulta útilmente) ----------
create or replace view public.v_usuarios_roles
with (security_invoker = on) as
select
  u.id as user_id,
  u.email,
  u.created_at,
  u.last_sign_in_at,
  coalesce(
    (select array_agg(r.role order by r.role)
       from public.user_roles r where r.user_id = u.id),
    '{}'::public.app_role[]
  ) as roles
from auth.users u;

grant select on public.v_usuarios_roles to authenticated;

-- Nota: auth.users sólo es legible por service_role; la vista funcionará
-- llamándola desde una RPC SECURITY DEFINER que valide admin.

create or replace function public.listar_usuarios()
returns table (
  user_id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  roles public.app_role[]
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'requiere_admin';
  end if;
  return query
    select u.id, u.email::text, u.created_at, u.last_sign_in_at,
      coalesce((select array_agg(r.role order by r.role)
                  from public.user_roles r where r.user_id = u.id),
               '{}'::public.app_role[])
      from auth.users u
      order by u.created_at desc;
end $$;

grant execute on function public.listar_usuarios() to authenticated;
