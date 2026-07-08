
ALTER TABLE public.price_lists
  ADD COLUMN IF NOT EXISTS default_for_client_type text
  CHECK (default_for_client_type IN ('mayoreo','menudeo'));

CREATE UNIQUE INDEX IF NOT EXISTS price_lists_default_client_type_uniq
  ON public.price_lists (default_for_client_type)
  WHERE default_for_client_type IS NOT NULL;
