-- 1. Normalización única de direcciones (fuente de verdad para la llave del caché)
create or replace function public.geocode_address_key(_q text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            lower(translate(coalesce(_q, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')),
            '[^a-z0-9]+', ' ', 'g'),
          '\m(c p|cp)\M', ' ', 'g'),
        '\s+', ' ', 'g'),
      '( (mexico|mx))+\s*$', '', 'g')
  ), '')
$$;

-- 2. Tabla caché
create table public.address_geocodes (
  address_key text primary key,
  address_query text not null,
  status text not null check (status in ('ok', 'sin_resultado')),
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  formatted_address text,
  place_id text,
  postal_code text,
  geocoded_at timestamptz not null default now(),
  hit_count integer not null default 0,
  last_hit_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.address_geocodes to authenticated;
grant all on public.address_geocodes to service_role;

alter table public.address_geocodes enable row level security;

create policy "Staff can read geocode cache"
  on public.address_geocodes for select to authenticated
  using (public.has_any_role(auth.uid(), array['admin','representante','ventas','almacen','logistica','contabilidad','viewer','compras','facturacion','cobranza']::public.app_role[]));

create policy "Staff can add to geocode cache"
  on public.address_geocodes for insert to authenticated
  with check (public.has_any_role(auth.uid(), array['admin','representante','ventas','almacen','logistica','contabilidad','compras','facturacion','cobranza']::public.app_role[]));

create policy "Staff can update geocode cache"
  on public.address_geocodes for update to authenticated
  using (public.has_any_role(auth.uid(), array['admin','representante','ventas','almacen','logistica','contabilidad','compras','facturacion','cobranza']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','representante','ventas','almacen','logistica','contabilidad','compras','facturacion','cobranza']::public.app_role[]));

create trigger address_geocodes_set_updated_at
  before update on public.address_geocodes
  for each row execute function public.set_updated_at();

-- 3. Lectura (cuenta el uso) y escritura del caché; corren con los permisos del usuario
create or replace function public.geocode_cache_get(_query text)
returns setof public.address_geocodes
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  k text := public.geocode_address_key(_query);
begin
  if k is null then
    return;
  end if;
  return query
    update public.address_geocodes
       set hit_count = hit_count + 1,
           last_hit_at = now()
     where address_key = k
       and (status = 'ok' or geocoded_at > now() - interval '30 days')
    returning *;
end;
$$;

create or replace function public.geocode_cache_put(
  _query text,
  _status text,
  _lat numeric,
  _lng numeric,
  _formatted text,
  _place_id text,
  _postal_code text
)
returns void
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  k text := public.geocode_address_key(_query);
begin
  if k is null then
    return;
  end if;
  insert into public.address_geocodes as g
    (address_key, address_query, status, latitude, longitude, formatted_address, place_id, postal_code, geocoded_at)
  values
    (k, left(_query, 500), _status, _lat, _lng, _formatted, _place_id, _postal_code, now())
  on conflict (address_key) do update
    set address_query = excluded.address_query,
        status = excluded.status,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        formatted_address = excluded.formatted_address,
        place_id = excluded.place_id,
        postal_code = excluded.postal_code,
        geocoded_at = now();
end;
$$;

create or replace function public.geocode_cache_stats()
returns table (entries bigint, ok_entries bigint, hits bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select count(*), count(*) filter (where status = 'ok'), coalesce(sum(hit_count), 0)
  from public.address_geocodes
$$;

grant execute on function public.geocode_address_key(text) to authenticated;
grant execute on function public.geocode_cache_get(text) to authenticated;
grant execute on function public.geocode_cache_put(text, text, numeric, numeric, text, text, text) to authenticated;
grant execute on function public.geocode_cache_stats() to authenticated;

-- 4. Columnas de estado en clientes y prospectos
alter table public.clientes
  add column if not exists formatted_address text,
  add column if not exists geocoded_at timestamptz,
  add column if not exists geocode_status text check (geocode_status in ('ok', 'pendiente', 'sin_resultado'));

alter table public.prospects
  add column if not exists formatted_address text,
  add column if not exists geocoded_at timestamptz,
  add column if not exists geocode_status text check (geocode_status in ('ok', 'pendiente', 'sin_resultado'));

update public.clientes set geocode_status = 'ok' where lat is not null and lng is not null and geocode_status is null;
update public.prospects set geocode_status = 'ok' where lat is not null and lng is not null and geocode_status is null;

create index if not exists clientes_geocode_pending_idx
  on public.clientes (id) where lat is null or geocode_status = 'pendiente';
create index if not exists prospects_geocode_pending_idx
  on public.prospects (id) where lat is null or geocode_status = 'pendiente';

-- 5. Al cambiar la dirección sin mover el punto → pendiente de volver a ubicar
create or replace function public.clientes_geocode_state()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.lat is not null and new.lng is not null and new.geocode_status is null then
      new.geocode_status := 'ok';
    end if;
    return new;
  end if;

  if new.lat is distinct from old.lat or new.lng is distinct from old.lng then
    if new.lat is not null and new.lng is not null
       and new.geocode_status is not distinct from old.geocode_status then
      new.geocode_status := 'ok';
    end if;
  elsif new.direccion is distinct from old.direccion
     or new.codigo_postal is distinct from old.codigo_postal then
    new.geocode_status := 'pendiente';
    new.geocoded_at := null;
    new.formatted_address := null;
  end if;
  return new;
end;
$$;

create trigger clientes_geocode_state_trg
  before insert or update on public.clientes
  for each row execute function public.clientes_geocode_state();

create or replace function public.prospects_geocode_state()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.lat is not null and new.lng is not null and new.geocode_status is null then
      new.geocode_status := 'ok';
    end if;
    return new;
  end if;

  if new.lat is distinct from old.lat or new.lng is distinct from old.lng then
    if new.lat is not null and new.lng is not null
       and new.geocode_status is not distinct from old.geocode_status then
      new.geocode_status := 'ok';
    end if;
  elsif new.direccion is distinct from old.direccion then
    new.geocode_status := 'pendiente';
    new.geocoded_at := null;
    new.formatted_address := null;
  end if;
  return new;
end;
$$;

create trigger prospects_geocode_state_trg
  before insert or update on public.prospects
  for each row execute function public.prospects_geocode_state();

-- 6. Precargar el caché con las coordenadas que ya existen
insert into public.address_geocodes (address_key, address_query, status, latitude, longitude, geocoded_at)
select distinct on (k) k, q, 'ok', lat, lng, now()
from (
  select public.geocode_address_key(q) as k, q, lat, lng
  from (
    select c.direccion
             || case when coalesce(btrim(c.codigo_postal), '') <> '' and position(btrim(c.codigo_postal) in c.direccion) = 0
                     then ', CP ' || btrim(c.codigo_postal) else '' end
             || ', México' as q,
           c.lat, c.lng
    from public.clientes c
    where c.lat is not null and c.lng is not null and coalesce(btrim(c.direccion), '') <> ''
    union all
    select p.direccion || ', México', p.lat, p.lng
    from public.prospects p
    where p.lat is not null and p.lng is not null and coalesce(btrim(p.direccion), '') <> ''
  ) s
) t
where k is not null
on conflict (address_key) do nothing;