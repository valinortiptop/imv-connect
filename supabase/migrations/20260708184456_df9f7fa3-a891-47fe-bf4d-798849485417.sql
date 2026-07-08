
ALTER TABLE public.factura_items
  ADD COLUMN IF NOT EXISTS ieps_pct numeric NOT NULL DEFAULT 0;
