INSERT INTO public.permission_routes (route_key, route_path, group_label, active, sort_order) VALUES
  ('navBancosCuentas', '/admin/bancos', 'Bancos', true, 10),
  ('navBancosEstados', '/admin/bancos/estados', 'Bancos', true, 20),
  ('navBancosMov', '/admin/bancos/movimientos', 'Bancos', true, 30),
  ('navBancosTraspasos', '/admin/bancos/traspasos', 'Bancos', true, 40),
  ('navBancosNomina', '/admin/bancos/nomina', 'Bancos', true, 50)
ON CONFLICT (route_key) DO UPDATE
  SET route_path = EXCLUDED.route_path,
      group_label = EXCLUDED.group_label,
      active = true,
      sort_order = EXCLUDED.sort_order;

INSERT INTO public.role_permissions (role, route_key, allowed) VALUES
  ('admin', 'navBancosCuentas', true),
  ('admin', 'navBancosEstados', true),
  ('admin', 'navBancosMov', true),
  ('admin', 'navBancosTraspasos', true),
  ('admin', 'navBancosNomina', true),
  ('contabilidad', 'navBancosCuentas', true),
  ('contabilidad', 'navBancosEstados', true),
  ('contabilidad', 'navBancosMov', true),
  ('contabilidad', 'navBancosTraspasos', true),
  ('contabilidad', 'navBancosNomina', true)
ON CONFLICT (role, route_key) DO UPDATE SET allowed = true;