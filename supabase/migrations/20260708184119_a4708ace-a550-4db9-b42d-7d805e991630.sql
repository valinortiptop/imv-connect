
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS ieps_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_regime text;

COMMENT ON COLUMN public.productos.ieps_pct IS 'Tasa IEPS aplicable al producto (0, 6, 8, 26.5, 30, 53).';
COMMENT ON COLUMN public.productos.tax_regime IS 'Etiqueta original de SuiteTax Latam Engine (ITEM NORMAL, ITEM IVA 0%, ITEM IEPS 6% + IVA 0%, ITEM IEPS 6% + IVA 16%).';
