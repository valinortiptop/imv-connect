ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS parent_cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_parent_cliente_id ON public.clientes(parent_cliente_id);