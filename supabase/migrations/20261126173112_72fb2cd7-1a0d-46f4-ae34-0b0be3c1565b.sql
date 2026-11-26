ALTER TABLE public.laboratorios ADD COLUMN IF NOT EXISTS dias_entrega integer, ADD COLUMN IF NOT EXISTS es_borrador boolean NOT NULL DEFAULT false;
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS multiplo_compra integer NOT NULL DEFAULT 1;
ALTER TABLE public.oc_items ADD COLUMN IF NOT EXISTS descuento_pct numeric NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS costo_lista numeric;
ALTER TABLE public.ordenes_compra ADD COLUMN IF NOT EXISTS fecha_limite date;