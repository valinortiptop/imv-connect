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
