-- =============================================================
-- FILE: db/migrations/0001_modulo_1_catalogo.sql
-- =============================================================
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


-- =============================================================
-- FILE: db/migrations/0002_modulo_2_pedidos.sql
-- =============================================================
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


-- =============================================================
-- FILE: db/migrations/0003_modulo_3_representantes.sql
-- =============================================================
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


-- =============================================================
-- FILE: db/migrations/0004_modulo_4_inventario.sql
-- =============================================================
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


