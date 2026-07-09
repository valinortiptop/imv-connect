
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.rep_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rep_id UUID NOT NULL REFERENCES public.representantes(id) ON DELETE CASCADE,
  period_month DATE NOT NULL,
  target_amount NUMERIC NOT NULL DEFAULT 0,
  min_daily NUMERIC NOT NULL DEFAULT 0,
  target_by_lab JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rep_id, period_month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rep_targets TO authenticated;
GRANT ALL ON public.rep_targets TO service_role;
ALTER TABLE public.rep_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all targets"
ON public.rep_targets FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Reps read their own targets"
ON public.rep_targets FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.representantes r
    WHERE r.id = rep_targets.rep_id AND r.user_id = auth.uid()
  )
);

CREATE TRIGGER trg_rep_targets_updated_at
BEFORE UPDATE ON public.rep_targets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.rep_day_closes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rep_id UUID NOT NULL REFERENCES public.representantes(id) ON DELETE CASCADE,
  close_date DATE NOT NULL,
  visits_count INT NOT NULL DEFAULT 0,
  orders_count INT NOT NULL DEFAULT 0,
  orders_amount NUMERIC NOT NULL DEFAULT 0,
  payments_amount NUMERIC NOT NULL DEFAULT 0,
  returns_count INT NOT NULL DEFAULT 0,
  km_traveled NUMERIC NOT NULL DEFAULT 0,
  avg_time_per_client_min NUMERIC NOT NULL DEFAULT 0,
  top_clients JSONB NOT NULL DEFAULT '[]'::jsonb,
  narrative TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rep_id, close_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rep_day_closes TO authenticated;
GRANT ALL ON public.rep_day_closes TO service_role;
ALTER TABLE public.rep_day_closes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all closes"
ON public.rep_day_closes FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Reps manage own closes"
ON public.rep_day_closes FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.representantes r WHERE r.id = rep_day_closes.rep_id AND r.user_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.representantes r WHERE r.id = rep_day_closes.rep_id AND r.user_id = auth.uid())
);
