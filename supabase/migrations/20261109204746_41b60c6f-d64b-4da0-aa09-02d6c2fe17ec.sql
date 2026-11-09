INSERT INTO public.permission_routes (route_key, route_path, group_label, active, sort_order) VALUES
  ('navRepIA', '/admin/configuracion/ia-representantes', 'Configuración', true, 903)
ON CONFLICT (route_key) DO UPDATE SET route_path = EXCLUDED.route_path, group_label = EXCLUDED.group_label, active = true, sort_order = EXCLUDED.sort_order;