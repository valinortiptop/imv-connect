create or replace function public.get_my_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.user_roles
   where user_id = auth.uid()
   order by case role::text
     when 'admin' then 1
     when 'contabilidad' then 2
     when 'ventas' then 3
     when 'logistica' then 4
     when 'almacen' then 5
     when 'representante' then 6
     when 'viewer' then 7
     else 99
   end
   limit 1
$$;

grant execute on function public.get_my_role() to authenticated;