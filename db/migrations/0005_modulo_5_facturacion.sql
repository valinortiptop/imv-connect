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
