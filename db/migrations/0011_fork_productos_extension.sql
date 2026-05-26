-- =====================================================================
-- Migración híbrida: extiende `productos` con columnas del repo fork
-- (database-explorer-main) sin romper datos existentes. Aditivo.
-- =====================================================================

alter table public.productos
  add column if not exists marca text,
  add column if not exists proveedor text,
  add column if not exists peso_kg numeric(10,3),
  add column if not exists costo_siva numeric(12,2),
  add column if not exists costo_civa numeric(12,2),
  add column if not exists bonificacion_pct numeric(5,2) default 0,
  add column if not exists margen_normal_pct numeric(6,2),
  add column if not exists margen_bonif_pct numeric(6,2),
  add column if not exists stock_disponible integer not null default 0,
  add column if not exists stock_en_camino integer not null default 0,
  add column if not exists stock_comprometido integer not null default 0,
  add column if not exists promo boolean not null default false;

-- Índices útiles para filtros
create index if not exists productos_marca_idx on public.productos(marca);
create index if not exists productos_proveedor_idx on public.productos(proveedor);
create index if not exists productos_promo_idx on public.productos(promo) where promo;

-- Asegurar grants (idempotente con migración base)
grant select, insert, update, delete on public.productos to authenticated;
grant all on public.productos to service_role;
