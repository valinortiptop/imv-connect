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
