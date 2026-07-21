
-- Seed dashboard routes for the sidebar visibility system.
INSERT INTO public.permission_routes (route_key, route_path, group_label, active, sort_order) VALUES
  ('navClientesDashboard', '/admin/clientes-dashboard', 'General', true, 1),
  ('navAlmacenDashboard',  '/admin/almacen-dashboard',  'General', true, 2)
ON CONFLICT (route_key) DO UPDATE SET route_path=EXCLUDED.route_path, group_label=EXCLUDED.group_label, sort_order=EXCLUDED.sort_order;

-- Grant the two new routes to every existing non-admin role by default (permissive baseline).
INSERT INTO public.role_permissions (role, route_key, allowed)
SELECT r.role, pr.route_key, true
  FROM (SELECT unnest(ARRAY['ventas','almacen','contabilidad']::public.app_role[]) AS role) r
  CROSS JOIN public.permission_routes pr
  WHERE pr.route_key IN ('navClientesDashboard','navAlmacenDashboard')
ON CONFLICT (role, route_key) DO NOTHING;

-- Accounting integration: classification for pólizas per Eduardo Islas 00:27:13.
-- Add estado_origen column tracking whether the póliza was created automatically,
-- manually or later modified. Non-destructive: existing rows default to 'automatica'.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='polizas' AND column_name='estado_origen'
  ) THEN
    ALTER TABLE public.polizas
      ADD COLUMN estado_origen text NOT NULL DEFAULT 'automatica'
      CHECK (estado_origen IN ('automatica','manual','modificada'));
  END IF;
END $$;

-- Seed default cuenta contable codes so accounting hooks (factura/pago/devolucion)
-- can look up which account to debit/credit. Values are placeholders that admins
-- override from /admin/administracion once the catálogo de cuentas is loaded.
INSERT INTO public.system_config (key, value) VALUES
  ('cuenta_clientes',         '"1120-001"'::jsonb),
  ('cuenta_ventas',           '"4100-001"'::jsonb),
  ('cuenta_iva_trasladado',   '"2160-001"'::jsonb),
  ('cuenta_iva_por_trasladar','"2170-001"'::jsonb),
  ('cuenta_costo_venta',      '"5100-001"'::jsonb),
  ('cuenta_inventario',       '"1150-001"'::jsonb),
  ('cuenta_bancos_default',   '"1110-001"'::jsonb)
ON CONFLICT (key) DO NOTHING;
