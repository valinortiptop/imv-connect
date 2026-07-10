CREATE TABLE IF NOT EXISTS public.purchase_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
  mes date NOT NULL,
  monto_mxn numeric(14,2) NOT NULL DEFAULT 0,
  notas text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, mes)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_budgets TO authenticated;
GRANT ALL ON public.purchase_budgets TO service_role;

ALTER TABLE public.purchase_budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_rw_purchase_budgets" ON public.purchase_budgets;
CREATE POLICY "auth_rw_purchase_budgets" ON public.purchase_budgets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS purchase_budgets_mes_idx ON public.purchase_budgets(mes DESC);