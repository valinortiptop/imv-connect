insert into public.permission_routes (route_key, route_path, group_label, sort_order, active) values
  ('navAlmacenesCat','/admin/almacenes','Almacén y Compras', 205, true),
  ('navRecepciones','/admin/almacen/recepciones','Almacén y Compras', 210, true),
  ('navTraspasos','/admin/almacen/traspasos','Almacén y Compras', 215, true),
  ('navRemisiones','/admin/almacen/remisiones','Almacén y Compras', 220, true),
  ('navCardexMat','/admin/almacen/cardex','Almacén y Compras', 225, true),
  ('navRepAlmacen','/admin/almacen/reportes','Almacén y Compras', 230, true)
on conflict (route_key) do update set active = true, route_path = excluded.route_path;

insert into public.role_permissions (role, route_key, allowed)
select r.role, k.route_key, true
from (values ('admin'::public.app_role),('almacen'),('logistica'),('compras')) as r(role),
     (values ('navAlmacenesCat'),('navRecepciones'),('navTraspasos'),('navRemisiones'),('navCardexMat'),('navRepAlmacen')) as k(route_key)
on conflict (role, route_key) do update set allowed = true;