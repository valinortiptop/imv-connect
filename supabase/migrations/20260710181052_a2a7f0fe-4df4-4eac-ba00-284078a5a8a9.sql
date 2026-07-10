ALTER TABLE public.order_adjustments
  ADD COLUMN IF NOT EXISTS tipo TEXT,
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC,
  ADD COLUMN IF NOT EXISTS credit_amount NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS faltante_destino TEXT,
  ADD COLUMN IF NOT EXISTS damaged_batch_id UUID REFERENCES public.damaged_batches(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_adjustments_order_id_fkey'
      AND conrelid = 'public.order_adjustments'::regclass
  ) THEN
    ALTER TABLE public.order_adjustments
      ADD CONSTRAINT order_adjustments_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES public.pedidos(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_adjustments_order_item_id_fkey'
      AND conrelid = 'public.order_adjustments'::regclass
  ) THEN
    ALTER TABLE public.order_adjustments
      ADD CONSTRAINT order_adjustments_order_item_id_fkey
      FOREIGN KEY (order_item_id) REFERENCES public.pedido_items(id) ON DELETE SET NULL;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';