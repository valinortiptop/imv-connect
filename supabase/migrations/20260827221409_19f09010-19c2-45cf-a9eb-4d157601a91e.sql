-- 1) Auto-enlace seguro de representante <-> cuenta
create or replace function public.ensure_current_rep_link()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_id uuid;
begin
  if auth.uid() is null then
    return null;
  end if;

  select r.id into v_id from public.representantes r where r.user_id = auth.uid() limit 1;
  if v_id is not null then
    return v_id;
  end if;

  v_email := lower(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email', ''));
  if v_email = '' then
    return null;
  end if;

  select r.id into v_id
  from public.representantes r
  where r.email is not null and lower(r.email) = v_email and r.user_id is null
  limit 1;

  if v_id is null then
    return null;
  end if;

  update public.representantes set user_id = auth.uid() where id = v_id;
  return v_id;
end;
$$;

revoke all on function public.ensure_current_rep_link() from public;
grant execute on function public.ensure_current_rep_link() to authenticated;
grant execute on function public.ensure_current_rep_link() to service_role;

-- 2) Correo faltante
update public.representantes
set email = 'nperez@imv.lat'
where lower(nombre) = 'nancy perez' and email is null;

-- 3) Enlazar por correo lo que ya se pueda + asegurar rol representante
update public.representantes r
set user_id = u.id
from auth.users u
where r.user_id is null and r.email is not null and lower(u.email) = lower(r.email);

insert into public.user_roles (user_id, role)
select r.user_id, 'representante'::app_role
from public.representantes r
where r.user_id is not null and r.activo
on conflict (user_id, role) do nothing;

-- 4) Reporte de diagnóstico para admins
create or replace function public.rep_account_link_report()
returns table (
  representante_id uuid,
  nombre text,
  email text,
  user_id uuid,
  tiene_cuenta boolean,
  tiene_rol boolean,
  activo boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.nombre,
    r.email,
    r.user_id,
    r.user_id is not null as tiene_cuenta,
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = r.user_id and ur.role = 'representante'::app_role
    ) as tiene_rol,
    r.activo
  from public.representantes r
  where public.has_role(auth.uid(), 'admin'::app_role)
  order by r.activo desc, r.nombre
$$;

revoke all on function public.rep_account_link_report() from public;
grant execute on function public.rep_account_link_report() to authenticated;
grant execute on function public.rep_account_link_report() to service_role;