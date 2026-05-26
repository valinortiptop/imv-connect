-- =====================================================================
-- Vista v_products_with_stock — compat con UI fork (database-explorer)
-- Mapea columnas ES (productos + stock) a alias EN usados por Inventory.
-- =====================================================================

create or replace view public.v_products_with_stock as
select
  p.id,
  p.sku                                              as clave,
  p.nombre                                           as name,
  coalesce(p.proveedor, l.nombre, '')                as supplier,
  coalesce(p.marca, '')                              as brand,
  coalesce(p.peso_kg, 0)::numeric                    as weight_kg,
  coalesce(p.costo_civa, 0)::numeric                 as cost_with_iva,
  coalesce(p.costo_siva, 0)::numeric                 as cost_without_iva,
  coalesce(p.bonificacion_pct, 0)::numeric           as bonificacion_pct,
  coalesce(p.precio_lista, 0)::numeric               as sale_price_with_iva,
  p.imagen_url                                       as image_url,
  coalesce((select sum(s.cantidad) from public.stock s where s.producto_id = p.id), 0)::numeric as stock_actual,
  coalesce(p.stock_comprometido, 0)::numeric         as stock_committed,
  coalesce(p.stock_en_camino, 0)::numeric            as stock_incoming,
  greatest(
    coalesce((select sum(s.cantidad) from public.stock s where s.producto_id = p.id), 0)::numeric
    - coalesce(p.stock_comprometido, 0)::numeric, 0
  )                                                  as stock_disponible,
  p.activo                                           as active
from public.productos p
left join public.laboratorios l on l.id = p.laboratorio_id;

grant select on public.v_products_with_stock to authenticated;
grant select on public.v_products_with_stock to anon;
