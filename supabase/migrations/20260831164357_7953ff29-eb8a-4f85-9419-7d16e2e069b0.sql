ALTER TABLE public.rep_visits
  ADD COLUMN IF NOT EXISTS visit_kind text NOT NULL DEFAULT 'cliente',
  ADD COLUMN IF NOT EXISTS office_purpose text,
  ADD COLUMN IF NOT EXISTS auto_registered boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS rep_visits_kind_idx ON public.rep_visits (representante_id, visit_kind, check_in_at DESC);