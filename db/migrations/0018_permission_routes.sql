-- Sidebar tab visibility: master route table + RPCs

CREATE TABLE IF NOT EXISTS public.permission_routes (
  route_key   text PRIMARY KEY,
  route_path  text NOT NULL,
  group_label text NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.permission_routes TO authenticated;
GRANT ALL    ON public.permission_routes TO service_role;

ALTER TABLE public.permission_routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read permission_routes" ON public.permission_routes;
CREATE POLICY "auth read permission_routes"
  ON public.permission_routes FOR SELECT
  TO authenticated USING (true);

-- Seed all sidebar entries (idempotent)
INSERT INTO public.permission_routes (route_key, route_path, group_label, sort_order) VALUES
  ('navDashboard',     '/admin',                'General',       10),
  ('navAIChat',        '/admin/gandalf',        'General',       20),
  ('navTareas',        '/admin/tareas',         'General',       30),
  ('navCalculator',    '/admin/calculadora',    'General',       40),

  ('navProspects',     '/admin/prospectos',     'Ventas',       110),
  ('navOrders',        '/admin/pedidos',        'Ventas',       120),
  ('navClients',       '/admin/clientes',       'Ventas',       130),
  ('navReps',          '/admin/representantes', 'Ventas',       140),
  ('navDirectory',     '/admin/facturas',       'Ventas',       150),
  ('navPromos',        '/admin/promos',         'Ventas',       160),
  ('navPartners',      '/admin/partners',       'Ventas',       170),
  ('navPriceLists',    '/admin/listas-precios', 'Ventas',       180),
  ('navSales',         '/admin/sales',          'Ventas',       190),
  ('navPnL',           '/admin/pnl',            'Ventas',       200),
  ('navVentasReport',  '/admin/ventas',         'Ventas',       210),

  ('navProducts',      '/admin/productos',      'Inventario',   310),
  ('navInventory',     '/admin/inventario',     'Inventario',   320),
  ('navInventario',    '/admin/almacen',        'Inventario',   330),
  ('navKardex',        '/admin/kardex',         'Inventario',   340),
  ('navStock',         '/admin/entradas',       'Inventario',   350),
  ('navPurchaseNeeds', '/admin/necesidades',    'Inventario',   360),
  ('navDevoluciones',  '/admin/devoluciones/lista','Inventario',370),
  ('navDamaged',       '/admin/danados',        'Inventario',   380),

  ('navLogistics',     '/admin/logistica',      'Operaciones',  510),
  ('navManiobra',      '/admin/maniobra',       'Operaciones',  520),
  ('navCatalogo',      '/admin/catalogo',       'Operaciones',  530),
  ('navDocuments',     '/admin/documentos',     'Operaciones',  540),

  ('navPortalAdmin',   '/admin/portal',         'Configuración',710),
  ('navAdmin',         '/admin/administracion', 'Configuración',720)
ON CONFLICT (route_key) DO UPDATE
  SET route_path  = EXCLUDED.route_path,
      group_label = EXCLUDED.group_label,
      sort_order  = EXCLUDED.sort_order,
      updated_at  = now();

-- RPC: list all routes (admin UI)
CREATE OR REPLACE FUNCTION public.admin_list_all_routes()
RETURNS TABLE (
  route_key   text,
  route_path  text,
  group_label text,
  active      boolean,
  sort_order  int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT route_key, route_path, group_label, active, sort_order
  FROM public.permission_routes
  ORDER BY sort_order, route_key;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_all_routes() TO authenticated;

-- RPC: toggle a route's active flag
CREATE OR REPLACE FUNCTION public.admin_set_route_active(p_route_key text, p_active boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.permission_routes
     SET active = p_active, updated_at = now()
   WHERE route_key = p_route_key;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_route_active(text, boolean) TO authenticated;

-- RPC: current user's allowed routes (only active ones for now)
CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS TABLE (
  route_key   text,
  route_path  text,
  group_label text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT route_key, route_path, group_label
  FROM public.permission_routes
  WHERE active = true
  ORDER BY sort_order, route_key;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated;
