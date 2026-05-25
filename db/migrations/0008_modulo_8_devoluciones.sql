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
