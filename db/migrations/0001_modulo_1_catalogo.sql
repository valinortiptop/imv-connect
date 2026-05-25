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
