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
