-- =====================================================================
-- Route visibility system — admin can hide / show sidebar tabs app-wide.
-- Idempotent. Pairs with src/hooks/use-permissions.tsx + Admin "Visibilidad
-- de pestañas" tab in src/components/admin-mgmt-page.tsx.
-- =====================================================================

create table if not exists public.permission_routes (
  route_key text primary key,
  route_path text not null,
  group_label text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Seed every nav item currently in the AdminSidebar.
insert into public.permission_routes (route_key, route_path, group_label, sort_order, active) values
  ('navDashboard',     '/admin',                    'General',       1,  true),
  ('navAIChat',        '/admin/gandalf',            'General',       2,  true),
  ('navTareas',        '/admin/tareas',             'General',       3,  true),
  ('navCalculator',    '/admin/calculadora',        'General',       4,  true),

  ('navProspects',     '/admin/prospectos',         'Ventas',       10,  true),
  ('navOrders',        '/admin/pedidos',            'Ventas',       11,  true),
  ('navClients',       '/admin/clientes',           'Ventas',       12,  true),
  ('navReps',          '/admin/representantes',     'Ventas',       13,  true),
  ('navDirectory',     '/admin/facturas',           'Ventas',       14,  true),
  ('navPromos',        '/admin/promos',             'Ventas',       15,  true),
  ('navPartners',      '/admin/partners',           'Ventas',       16,  true),
  ('navPriceLists',    '/admin/listas-precios',     'Ventas',       17,  true),
  ('navSales',         '/admin/sales',              'Ventas',       18,  true),
  ('navPnL',           '/admin/pnl',                'Ventas',       19,  true),
  ('navVentasReport',  '/admin/ventas',             'Ventas',       20,  true),

  ('navProducts',      '/admin/productos',          'Inventario',   30,  true),
  ('navInventory',     '/admin/inventario',         'Inventario',   31,  true),
  ('navInventario',    '/admin/almacen',            'Inventario',   32,  true),
  ('navKardex',        '/admin/kardex',             'Inventario',   33,  true),
  ('navStock',         '/admin/entradas',           'Inventario',   34,  true),
  ('navPurchaseNeeds', '/admin/necesidades',        'Inventario',   35,  true),
  ('navDevoluciones',  '/admin/devoluciones/lista', 'Inventario',   36,  true),
  ('navDamaged',       '/admin/danados',            'Inventario',   37,  true),

  ('navLogistics',     '/admin/logistica',          'Operaciones',  40,  true),
  ('navManiobra',      '/admin/maniobra',           'Operaciones',  41,  true),
  ('navCatalogo',      '/admin/catalogo',           'Operaciones',  42,  true),
  ('navDocuments',     '/admin/documentos',         'Operaciones',  43,  true),

  ('navPortalAdmin',   '/admin/portal',             'Configuración', 50, true),
  ('navAdmin',         '/admin/administracion',     'Configuración', 51, true)
on conflict (route_key) do update
  set route_path  = excluded.route_path,
      group_label = excluded.group_label,
      sort_order  = excluded.sort_order;

alter table public.permission_routes enable row level security;

drop policy if exists "perm_routes_read" on public.permission_routes;
create policy "perm_routes_read" on public.permission_routes
  for select to authenticated using (true);

-- All writes go through the SECURITY DEFINER admin_set_route_active RPC.
drop policy if exists "perm_routes_no_direct_write" on public.permission_routes;
create policy "perm_routes_no_direct_write" on public.permission_routes
  for all to authenticated using (false) with check (false);

grant select on public.permission_routes to authenticated;
grant all    on public.permission_routes to service_role;

-- ---------- RPCs used by the Admin "Visibilidad de pestañas" tab ----------
create or replace function public.admin_list_all_routes()
returns table (
  route_key text,
  route_path text,
  group_label text,
  sort_order int,
  active boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'requiere_admin';
  end if;
  return query
    select pr.route_key, pr.route_path, pr.group_label, pr.sort_order, pr.active
      from public.permission_routes pr
      order by pr.sort_order;
end $$;

create or replace function public.admin_set_route_active(
  p_route_key text,
  p_active boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'requiere_admin';
  end if;
  update public.permission_routes
     set active = p_active,
         updated_at = now()
   where route_key = p_route_key;
end $$;

grant execute on function public.admin_list_all_routes()                 to authenticated;
grant execute on function public.admin_set_route_active(text, boolean)   to authenticated;

-- ---------- RPC consumed by use-permissions hook ----------
create or replace function public.get_my_permissions()
returns table (
  route_key text,
  route_path text,
  group_label text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  return query
    select pr.route_key, pr.route_path, pr.group_label
      from public.permission_routes pr
     where pr.active = true
     order by pr.sort_order;
end $$;

grant execute on function public.get_my_permissions() to authenticated;
