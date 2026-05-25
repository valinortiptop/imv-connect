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
