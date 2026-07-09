
-- Panel de Representantes: visitas, acuerdos e insights IA
CREATE TABLE IF NOT EXISTS public.rep_visits (
  id uuid primary key default gen_random_uuid(),
  representante_id uuid not null references public.representantes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  check_in_at timestamptz not null default now(),
  check_out_at timestamptz,
  check_in_lat numeric,
  check_in_lng numeric,
  check_out_lat numeric,
  check_out_lng numeric,
  notes text,
  outcome text,
  created_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS idx_rep_visits_rep ON public.rep_visits(representante_id, check_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_rep_visits_cliente ON public.rep_visits(cliente_id, check_in_at DESC);

CREATE TABLE IF NOT EXISTS public.rep_visit_agreements (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.rep_visits(id) on delete cascade,
  description text not null,
  due_date date,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS idx_rep_agreements_visit ON public.rep_visit_agreements(visit_id);

CREATE TABLE IF NOT EXISTS public.rep_client_insights (
  cliente_id uuid primary key references public.clientes(id) on delete cascade,
  generated_at timestamptz not null default now(),
  model text,
  churn_risk_score numeric,
  churn_reasons jsonb,
  reorder_predictions jsonb,
  cross_sell jsonb,
  lost_labs jsonb,
  summary text,
  raw jsonb
);

-- GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rep_visits TO authenticated;
GRANT ALL ON public.rep_visits TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rep_visit_agreements TO authenticated;
GRANT ALL ON public.rep_visit_agreements TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rep_client_insights TO authenticated;
GRANT ALL ON public.rep_client_insights TO service_role;

-- RLS
ALTER TABLE public.rep_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rep_visit_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rep_client_insights ENABLE ROW LEVEL SECURITY;

-- Policies: rep sees own visits; admin sees all
DROP POLICY IF EXISTS "rep_visits_owner" ON public.rep_visits;
CREATE POLICY "rep_visits_owner" ON public.rep_visits
  FOR ALL TO authenticated
  USING (
    representante_id IN (SELECT id FROM public.representantes WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    representante_id IN (SELECT id FROM public.representantes WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "rep_visit_agreements_owner" ON public.rep_visit_agreements;
CREATE POLICY "rep_visit_agreements_owner" ON public.rep_visit_agreements
  FOR ALL TO authenticated
  USING (
    visit_id IN (
      SELECT id FROM public.rep_visits
      WHERE representante_id IN (SELECT id FROM public.representantes WHERE user_id = auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    visit_id IN (
      SELECT id FROM public.rep_visits
      WHERE representante_id IN (SELECT id FROM public.representantes WHERE user_id = auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "rep_client_insights_owner" ON public.rep_client_insights;
CREATE POLICY "rep_client_insights_owner" ON public.rep_client_insights
  FOR ALL TO authenticated
  USING (
    cliente_id IN (
      SELECT id FROM public.clientes
      WHERE representante_id IN (SELECT id FROM public.representantes WHERE user_id = auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    cliente_id IN (
      SELECT id FROM public.clientes
      WHERE representante_id IN (SELECT id FROM public.representantes WHERE user_id = auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin')
  );
