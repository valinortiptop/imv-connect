
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS backfill_source text;
ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS backfill_source text;

CREATE UNIQUE INDEX IF NOT EXISTS pedidos_folio_uidx ON public.pedidos (folio);
CREATE UNIQUE INDEX IF NOT EXISTS facturas_folio_uidx ON public.facturas (folio);

CREATE INDEX IF NOT EXISTS pedidos_backfill_source_idx ON public.pedidos (backfill_source) WHERE backfill_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS facturas_backfill_source_idx ON public.facturas (backfill_source) WHERE backfill_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS productos_sku_idx ON public.productos (sku);
CREATE INDEX IF NOT EXISTS clientes_razon_social_idx ON public.clientes (lower(razon_social));
CREATE INDEX IF NOT EXISTS representantes_nombre_idx ON public.representantes (lower(nombre));
