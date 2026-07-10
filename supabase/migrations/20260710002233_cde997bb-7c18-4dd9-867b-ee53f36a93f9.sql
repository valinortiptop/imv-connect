-- Repoint main Compras key
UPDATE public.permission_routes
SET route_path = '/admin/compras', group_label = 'Compras', sort_order = 200, updated_at = now()
WHERE route_key = 'navPurchaseNeeds';

-- Sub-routes
INSERT INTO public.permission_routes (route_key, route_path, group_label, sort_order, active)
VALUES
  ('navComprasPlaneacion',  '/admin/compras/planeacion',  'Compras', 201, true),
  ('navComprasOrdenes',     '/admin/compras/ordenes',     'Compras', 202, true),
  ('navComprasProveedores', '/admin/compras/proveedores', 'Compras', 203, true),
  ('navComprasCaducidades', '/admin/compras/caducidades', 'Compras', 204, true),
  ('navComprasCostos',      '/admin/compras/costos',      'Compras', 205, true),
  ('navComprasRotacion',    '/admin/compras/rotacion',    'Compras', 206, true)
ON CONFLICT (route_key) DO UPDATE
  SET route_path = EXCLUDED.route_path,
      group_label = EXCLUDED.group_label,
      sort_order = EXCLUDED.sort_order,
      active = true,
      updated_at = now();