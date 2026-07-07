
INSERT INTO public.permission_routes (route_key, route_path, group_label, active, sort_order) VALUES
  ('navEmpresas', '/admin/empresas', 'Configuración', true, 10),
  ('navContaDash', '/admin/contabilidad', 'Contabilidad', true, 10),
  ('navContaCuentas', '/admin/contabilidad/cuentas', 'Contabilidad', true, 20),
  ('navContaPolizas', '/admin/contabilidad/polizas', 'Contabilidad', true, 30),
  ('navContaDiario', '/admin/contabilidad/diario', 'Contabilidad', true, 40),
  ('navContaMayor', '/admin/contabilidad/mayor', 'Contabilidad', true, 50),
  ('navContaBalanza', '/admin/contabilidad/balanza', 'Contabilidad', true, 60),
  ('navContaEstados', '/admin/contabilidad/estados', 'Contabilidad', true, 70),
  ('navContaIVA', '/admin/contabilidad/impuestos', 'Contabilidad', true, 80),
  ('navContaFact', '/admin/contabilidad/facturas', 'Contabilidad', true, 90),
  ('navContaSAT', '/admin/contabilidad/sat', 'Contabilidad', true, 100)
ON CONFLICT (route_key) DO UPDATE
  SET route_path = EXCLUDED.route_path,
      group_label = EXCLUDED.group_label,
      active = true,
      sort_order = EXCLUDED.sort_order;

-- Grant contabilidad role access to Contabilidad + Empresas keys
INSERT INTO public.role_permissions (role, route_key, allowed) VALUES
  ('contabilidad', 'navEmpresas', true),
  ('contabilidad', 'navContaDash', true),
  ('contabilidad', 'navContaCuentas', true),
  ('contabilidad', 'navContaPolizas', true),
  ('contabilidad', 'navContaDiario', true),
  ('contabilidad', 'navContaMayor', true),
  ('contabilidad', 'navContaBalanza', true),
  ('contabilidad', 'navContaEstados', true),
  ('contabilidad', 'navContaIVA', true),
  ('contabilidad', 'navContaFact', true),
  ('contabilidad', 'navContaSAT', true)
ON CONFLICT (role, route_key) DO UPDATE SET allowed = true;
