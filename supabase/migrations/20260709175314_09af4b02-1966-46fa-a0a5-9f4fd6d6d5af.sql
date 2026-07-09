INSERT INTO public.permission_routes (route_key, route_path, group_label, active, sort_order) VALUES
  ('navRepPanel', '/rep', 'Representantes', true, 210),
  ('navRepCoach', '/rep/coach', 'Representantes', true, 220),
  ('navRepSupervisor', '/rep/supervisor', 'Representantes', true, 230)
ON CONFLICT (route_key) DO UPDATE
  SET route_path = EXCLUDED.route_path,
      group_label = EXCLUDED.group_label,
      active = true,
      sort_order = EXCLUDED.sort_order,
      updated_at = now();

INSERT INTO public.role_permissions (role, route_key, allowed) VALUES
  ('representante'::public.app_role, 'navRepPanel', true),
  ('representante'::public.app_role, 'navRepCoach', true),
  ('ventas'::public.app_role, 'navRepPanel', true),
  ('ventas'::public.app_role, 'navRepCoach', true),
  ('ventas'::public.app_role, 'navRepSupervisor', true)
ON CONFLICT (role, route_key) DO UPDATE
  SET allowed = EXCLUDED.allowed,
      updated_at = now();