
alter table public.productos
  add column if not exists linea text,
  add column if not exists grupo text,
  add column if not exists tipo_producto text,
  add column if not exists sat_clave text;

create index if not exists productos_linea_idx on public.productos(linea);
create index if not exists productos_grupo_idx on public.productos(grupo);
create index if not exists productos_tipo_idx  on public.productos(tipo_producto);

drop view if exists public.products cascade;
drop view if exists public.v_products_with_stock cascade;

create view public.v_products_with_stock as
select
  p.id,
  p.sku                                              as clave,
  p.nombre                                           as name,
  coalesce(p.proveedor, l.nombre, '')                as supplier,
  coalesce(p.marca, l.nombre, '')                    as brand,
  coalesce(p.peso_kg, 0)::numeric                    as weight_kg,
  coalesce(p.costo_civa, 0)::numeric                 as cost_with_iva,
  coalesce(p.costo_siva, 0)::numeric                 as cost_without_iva,
  coalesce(p.bonificacion_pct, 0)::numeric           as bonificacion_pct,
  coalesce(p.precio_lista, 0)::numeric               as sale_price_with_iva,
  p.imagen_url                                       as image_url,
  p.linea                                            as linea,
  p.grupo                                            as grupo,
  p.tipo_producto                                    as tipo_producto,
  p.sat_clave                                        as sat_clave,
  p.categoria                                        as categoria,
  p.descripcion                                      as descripcion,
  p.presentacion                                     as presentacion,
  p.especie                                          as especie,
  p.unidad                                           as unidad,
  p.iva_pct                                          as iva_pct,
  p.laboratorio_id                                   as laboratorio_id,
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

create view public.products as select * from public.v_products_with_stock;
grant select on public.products to authenticated;
